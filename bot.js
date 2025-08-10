const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const axios = require('axios');

// Bot Configuration 
const BOT_TOKEN = process.env.BOT_TOKEN;
const BKASH_USERNAME = process.env.BKASH_USERNAME;
const BKASH_PASSWORD = process.env.BKASH_PASSWORD;
const BKASH_APP_KEY = process.env.BKASH_APP_KEY;
const BKASH_APP_SECRET = process.env.BKASH_APP_SECRET;
const ADMIN_ID = process.env.ADMIN_ID;
const BKASH_NUMBER = process.env.BKASH_NUMBER || '01902912653';
const NAGAD_NUMBER = '01902912653';
const CHANNEL_ID = -1002855286349; // Your Telegram channel ID
const ADMIN_TELEGRAM_LINK = 'https://t.me/Mehedi_X71';

// Admin management
const adminUsers = new Set([ADMIN_ID]);
const PORT = process.env.PORT || 3000;

// bKash API URLs
const BKASH_BASE_URL = 'https://tokenized.pay.bka.sh/v1.2.0-beta';

const bot = new TelegramBot(BOT_TOKEN, { polling: true });
const app = express();

// Storage
const users = new Map();
const pendingPayments = new Map();
const usedTransactions = new Set(); // Track used transaction IDs
const courseImages = new Map(); // Store course images
const courses = new Map([
    ['hsc2027_ict', { name: '📱 ICT Course', price: 500, groupLink: 'https://t.me/+HSC2027ICT' }],
    ['hsc2027_bangla', { name: '📚 Bangla Course', price: 500, groupLink: 'https://t.me/+HSC2027Bangla' }],
    ['hsc2027_math', { name: '🔢 Math Course', price: 500, groupLink: 'https://t.me/+HSC2027Math' }],
    ['hsc2027_chemistry', { name: '⚗️ Chemistry Course', price: 500, groupLink: 'https://t.me/+HSC2027Chemistry' }],
    ['hsc2027_biology', { name: '🧬 Biology Course', price: 500, groupLink: 'https://t.me/+HSC2027Biology' }],
    ['hsc2027_acs_math_cycle1', { name: '🧮 HSC 2027 ACS MATH CYCLE 1', price: 100, groupLink: 'https://t.me/+HSC2027ACSMATH1' }]
]);

// Payment links
const paymentLinks = new Map([
    ['hsc2027_ict', 'https://example-bkash-link.com/ict'],
    ['hsc2027_bangla', 'https://example-bkash-link.com/bangla'],
    ['hsc2027_acs_math_cycle1', 'https://shop.bkash.com/mamun-gazipur-printer019029126/pay/bdt100/ceGy7t']
]);

// Helper functions
function isAdmin(userId) {
    return adminUsers.has(userId.toString());
}

function isPrimaryAdmin(userId) {
    return userId.toString() === ADMIN_ID;
}

function getUserData(userId) {
    if (!users.has(userId)) {
        users.set(userId, {
            purchases: new Set(),
            pendingCourse: null,
            currentScreen: 'main_menu',
            waitingForTrx: null
        });
    }
    return users.get(userId);
}

// Transaction ID Management
function isTransactionUsed(trxId) {
    return usedTransactions.has(trxId);
}

async function logTransaction(trxId, userId, amount, courseName, paymentMethod) {
    usedTransactions.add(trxId);
    
    const message = `💰 **New Payment**\n\n` +
                   `👤 User: \`${userId}\`\n` +
                   `📚 Course: ${courseName}\n` +
                   `💵 Amount: ${amount} TK\n` +
                   `💳 Method: ${paymentMethod || 'bKash'}\n` +
                   `🆔 TRX ID: \`${trxId}\`\n` +
                   `⏰ Time: ${new Date().toLocaleString()}`;

    await bot.sendMessage(CHANNEL_ID, message, { parse_mode: 'Markdown' });
}

// bKash Token Management
let bkashToken = null;
let tokenExpiry = null;

async function getBkashToken() {
    if (bkashToken && tokenExpiry && Date.now() < tokenExpiry) {
        return bkashToken;
    }
    
    try {
        const response = await axios.post(`${BKASH_BASE_URL}/tokenized/checkout/token/grant`, {
            app_key: BKASH_APP_KEY,
            app_secret: BKASH_APP_SECRET
        }, {
            headers: {
                'Content-Type': 'application/json',
                'username': BKASH_USERNAME,
                'password': BKASH_PASSWORD
            }
        });
        
        bkashToken = response.data.id_token;
        tokenExpiry = Date.now() + (response.data.expires_in * 1000) - 60000;
        return bkashToken;
    } catch (error) {
        console.error('bKash token error:', error.message);
        throw error;
    }
}

async function verifyPayment(trxId) {
    try {
        const token = await getBkashToken();
        const response = await axios.post(`${BKASH_BASE_URL}/tokenized/checkout/general/searchTransaction`, {
            trxID: trxId
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': token,
                'X-APP-Key': BKASH_APP_KEY
            }
        });
        return response.data;
    } catch (error) {
        console.error('Payment verification error:', error.message);
        return null;
    }
}

// Reply Keyboards
const mainMenuKeyboard = {
    reply_markup: {
        keyboard: [
            ['🔥HSC 2027 All Courses🔥'],
            ['HSC 2025 সকল Admission কোর্স 🟢'],
            ['🔥HSC 2026 All Courses🔥'],
            ['❤️Admission All Courses 2024❤️'],
            ['🔥 Support 🔥', '🔥 Our Channel ❤️']
        ],
        resize_keyboard: true,
        one_time_keyboard: false
    }
};

function getHSC2027Keyboard(userId) {
    const userData = getUserData(userId);
    const keyboard = [];
    
    courses.forEach((course, courseId) => {
        if (courseId.startsWith('hsc2027_')) {
            const status = userData.purchases.has(courseId) ? '✅' : '❌';
            keyboard.push([`${status} ${course.name} (${course.price} TK)`]);
        }
    });
    
    keyboard.push(['⬅️ Back to Main Menu']);
    
    return { 
        reply_markup: { 
            keyboard: keyboard,
            resize_keyboard: true,
            one_time_keyboard: false
        } 
    };
}

function getCourseKeyboard(courseId, userId, isPending = false) {
    const userData = getUserData(userId);
    const course = courses.get(courseId);
    const keyboard = [];
    
    if (userData.purchases.has(courseId)) {
        keyboard.push(['🎯 Join Course Group']);
    } else if (isPending) {
        keyboard.push(['💳 Pay Now', '📝 Submit Payment']);
    } else {
        keyboard.push(['💳 Buy Now']);
    }
    
    keyboard.push(['⬅️ Back to HSC 2027', '🏠 Main Menu']);
    
    return { 
        reply_markup: { 
            keyboard: keyboard,
            resize_keyboard: true,
            one_time_keyboard: false
        } 
    };
}

function getPaymentMethodKeyboard(courseId) {
    return {
        reply_markup: {
            keyboard: [
                ['💰 bKash Payment', '💰 Nagad Payment'],
                ['⬅️ Back to Course', '🏠 Main Menu']
            ],
            resize_keyboard: true,
            one_time_keyboard: false
        }
    };
}

function getBkashPaymentKeyboard(courseId) {
    return {
        reply_markup: {
            keyboard: [
                ['💳 Pay with bKash Link'],
                ['📝 Submit bKash Transaction ID'],
                ['⬅️ Back to Payment', '🏠 Main Menu']
            ],
            resize_keyboard: true,
            one_time_keyboard: false
        }
    };
}

function getNagadPaymentKeyboard(courseId) {
    return {
        reply_markup: {
            keyboard: [
                ['📱 Get Nagad Number'],
                ['📝 Submit Nagad Payment Proof'],
                ['⬅️ Back to Payment', '🏠 Main Menu']
            ],
            resize_keyboard: true,
            one_time_keyboard: false
        }
    };
}

function getTransactionInputKeyboard() {
    return {
        reply_markup: {
            keyboard: [
                ['❌ Cancel Transaction'],
                ['🏠 Main Menu']
            ],
            resize_keyboard: true,
            one_time_keyboard: false
        }
    };
}

// Bot Commands
bot.onText(/\/start/, (msg) => {
    const userData = getUserData(msg.from.id);
    userData.currentScreen = 'main_menu';
    
    const welcomeText = `🎓 Welcome to HSC Courses Bot! 🎓

আমাদের premium courses গুলো দেখুন এবং আপনার পছন্দের course কিনুন।

💎 High Quality Content
📚 Expert Teachers  
🎯 Guaranteed Results
💯 24/7 Support`;

    bot.sendMessage(msg.chat.id, welcomeText, mainMenuKeyboard);
});

// Admin Commands (unchanged)
bot.onText(/\/admin/, (msg) => {
    if (!isAdmin(msg.from.id)) {
        return bot.sendMessage(msg.chat.id, '❌ You are not authorized!');
    }
    
    const isPrimary = isPrimaryAdmin(msg.from.id);
    
    const adminText = `🔧 Admin Panel ${isPrimary ? '(Primary Admin)' : '(Sub Admin)'}

📚 **Course Management:**
/addcourse - Add new course
/editprice - Edit course price  
/editlink - Edit group link
/editname - Edit course name
/deletecourse - Delete course
/listcourses - Show all courses
/setcourseimage - Set course image

💰 **Payment Management:**
/updatepayment - Update payment number
/updatepaymentlink - Update payment link

📊 **Analytics:**
/stats - View statistics
/users - View user count
/revenue - View revenue details` + 
(isPrimary ? `

👨‍💼 **Admin Management:**
/addadmin - Add new admin
/removeadmin - Remove admin
/listadmins - List all admins

🔧 **Examples:**
\`/editprice hsc2027_ict 450\`
\`/editlink hsc2027_ict https://t.me/+newlink\`
\`/editname hsc2027_ict 📱 ICT Advanced Course\`
\`/updatepayment 01902912653\`
\`/updatepaymentlink hsc2027_ict https://your-bkash-link.com/ict\`
\`/setcourseimage hsc2027_ict\` (reply to image)` : `

🔧 **Examples:**
\`/editprice hsc2027_ict 450\`
\`/editlink hsc2027_ict https://t.me/+newlink\``);

    bot.sendMessage(msg.chat.id, adminText, {parse_mode: 'Markdown'});
});

// Set Course Image
bot.onText(/\/setcourseimage (.+)/, (msg, match) => {
    if (!isAdmin(msg.from.id)) return;
    
    const courseId = match[1].trim();
    
    if (!courses.has(courseId)) {
        return bot.sendMessage(msg.chat.id, '❌ Course not found!');
    }
    
    if (!msg.reply_to_message || !msg.reply_to_message.photo) {
        return bot.sendMessage(msg.chat.id, '❌ Please reply to an image with this command!');
    }
    
    const photo = msg.reply_to_message.photo;
    const fileId = photo[photo.length - 1].file_id;
    
    courseImages.set(courseId, fileId);
    bot.sendMessage(msg.chat.id, `✅ Course image set for "${courses.get(courseId).name}"`);
});

// Add Admin
bot.onText(/\/addadmin (.+)/, (msg, match) => {
    if (!isPrimaryAdmin(msg.from.id)) {
        return bot.sendMessage(msg.chat.id, '❌ Only Primary Admin can add new admins!');
    }
    
    const newAdminId = match[1].trim();
    
    if (!/^\d+$/.test(newAdminId)) {
        return bot.sendMessage(msg.chat.id, '❌ Invalid User ID! Must be numbers only.');
    }
    
    if (adminUsers.has(newAdminId)) {
        return bot.sendMessage(msg.chat.id, '❌ User is already an admin!');
    }
    
    adminUsers.add(newAdminId);
    bot.sendMessage(msg.chat.id, `✅ New admin added successfully!\n👨‍💼 Admin ID: ${newAdminId}\n📊 Total Admins: ${adminUsers.size}`);
});

// Remove Admin
bot.onText(/\/removeadmin (.+)/, (msg, match) => {
    if (!isPrimaryAdmin(msg.from.id)) {
        return bot.sendMessage(msg.chat.id, '❌ Only Primary Admin can remove admins!');
    }
    
    const adminIdToRemove = match[1].trim();
    
    if (adminIdToRemove === ADMIN_ID) {
        return bot.sendMessage(msg.chat.id, '❌ Cannot remove Primary Admin!');
    }
    
    if (!adminUsers.has(adminIdToRemove)) {
        return bot.sendMessage(msg.chat.id, '❌ User is not an admin!');
    }
    
    adminUsers.delete(adminIdToRemove);
    bot.sendMessage(msg.chat.id, `✅ Admin removed successfully!\n👨‍💼 Removed Admin ID: ${adminIdToRemove}\n📊 Total Admins: ${adminUsers.size}`);
});

// List Admins
bot.onText(/\/listadmins/, (msg) => {
    if (!isPrimaryAdmin(msg.from.id)) {
        return bot.sendMessage(msg.chat.id, '❌ Only Primary Admin can view admin list!');
    }
    
    let adminList = `👨‍💼 **Admin List**\n\n`;
    adminList += `🔹 **Primary Admin:** ${ADMIN_ID}\n\n`;
    
    if (adminUsers.size > 1) {
        adminList += `👥 **Sub Admins:**\n`;
        adminUsers.forEach(adminId => {
            if (adminId !== ADMIN_ID) {
                adminList += `🔸 ${adminId}\n`;
            }
        });
    } else {
        adminList += `👥 **Sub Admins:** None`;
    }
    
    adminList += `\n📊 **Total Admins:** ${adminUsers.size}`;
    
    bot.sendMessage(msg.chat.id, adminList, {parse_mode: 'Markdown'});
});

// Add Course
bot.onText(/\/addcourse (.+)/, (msg, match) => {
    if (!isAdmin(msg.from.id)) return;
    
    const courseData = match[1].split('|');
    if (courseData.length !== 4) {
        return bot.sendMessage(msg.chat.id, '❌ Format: /addcourse courseId|courseName|price|groupLink');
    }
    
    const [courseId, courseName, price, groupLink] = courseData;
    courses.set(courseId.trim(), {
        name: courseName.trim(),
        price: parseInt(price.trim()),
        groupLink: groupLink.trim()
    });
    
    bot.sendMessage(msg.chat.id, `✅ Course "${courseName}" added successfully!`);
});

// Edit Course Price
bot.onText(/\/editprice (.+) (.+)/, (msg, match) => {
    if (!isAdmin(msg.from.id)) return;
    
    const courseId = match[1].trim();
    const newPrice = parseInt(match[2].trim());
    
    if (!courses.has(courseId)) {
        return bot.sendMessage(msg.chat.id, '❌ Course not found!');
    }
    
    if (isNaN(newPrice) || newPrice <= 0) {
        return bot.sendMessage(msg.chat.id, '❌ Invalid price! Must be a positive number.');
    }
    
    const course = courses.get(courseId);
    const oldPrice = course.price;
    course.price = newPrice;
    courses.set(courseId, course);
    
    bot.sendMessage(msg.chat.id, `✅ Price updated for "${course.name}"\n💰 Old Price: ${oldPrice} TK\n💰 New Price: ${newPrice} TK`);
});

// Edit Course Group Link
bot.onText(/\/editlink (.+) (.+)/, (msg, match) => {
    if (!isAdmin(msg.from.id)) return;
    
    const courseId = match[1].trim();
    const newLink = match[2].trim();
    
    if (!courses.has(courseId)) {
        return bot.sendMessage(msg.chat.id, '❌ Course not found!');
    }
    
    if (!newLink.startsWith('https://t.me/')) {
        return bot.sendMessage(msg.chat.id, '❌ Invalid Telegram link! Must start with https://t.me/');
    }
    
    const course = courses.get(courseId);
    const oldLink = course.groupLink;
    course.groupLink = newLink;
    courses.set(courseId, course);
    
    bot.sendMessage(msg.chat.id, `✅ Group link updated for "${course.name}"\n🔗 Old Link: ${oldLink}\n🔗 New Link: ${newLink}`);
});

// Edit Course Name
bot.onText(/\/editname (.+) (.+)/, (msg, match) => {
    if (!isAdmin(msg.from.id)) return;
    
    const courseId = match[1].trim();
    const newName = match[2];
    
    if (!courses.has(courseId)) {
        return bot.sendMessage(msg.chat.id, '❌ Course not found!');
    }
    
    const course = courses.get(courseId);
    const oldName = course.name;
    course.name = newName;
    courses.set(courseId, course);
    
    bot.sendMessage(msg.chat.id, `✅ Course name updated!\n📚 Old Name: ${oldName}\n📚 New Name: ${newName}`);
});

// Delete Course
bot.onText(/\/deletecourse (.+)/, (msg, match) => {
    if (!isAdmin(msg.from.id)) return;
    
    const courseId = match[1].trim();
    
    if (!courses.has(courseId)) {
        return bot.sendMessage(msg.chat.id, '❌ Course not found!');
    }
    
    const course = courses.get(courseId);
    courses.delete(courseId);
    courseImages.delete(courseId);
    
    bot.sendMessage(msg.chat.id, `✅ Course "${course.name}" deleted successfully!`);
});

// List Courses
bot.onText(/\/listcourses/, (msg) => {
    if (!isAdmin(msg.from.id)) return;
    
    if (courses.size === 0) {
        return bot.sendMessage(msg.chat.id, '📚 No courses available.');
    }
    
    let courseList = '📚 **All Courses:**\n\n';
    courses.forEach((course, courseId) => {
        courseList += `🔹 **${course.name}**\n`;
        courseList += `   ID: \`${courseId}\`\n`;
        courseList += `   💰 Price: ${course.price} TK\n`;
        courseList += `   🔗 Link: ${course.groupLink}\n`;
        courseList += `   🖼️ Image: ${courseImages.has(courseId) ? '✅ Set' : '❌ Not Set'}\n\n`;
    });
    
    bot.sendMessage(msg.chat.id, courseList, {parse_mode: 'Markdown'});
});

// Update Payment Number
bot.onText(/\/updatepayment (.+)/, (msg, match) => {
    if (!isAdmin(msg.from.id)) return;
    
    const newPaymentNumber = match[1].trim();
    
    if (!/^01[3-9]\d{8}$/.test(newPaymentNumber)) {
        return bot.sendMessage(msg.chat.id, '❌ Invalid Bangladeshi phone number format! Example: 01712345678');
    }
    
    BKASH_NUMBER = newPaymentNumber;
    bot.sendMessage(msg.chat.id, `✅ bKash payment number updated to: ${BKASH_NUMBER}`);
});

// Update Payment Link
bot.onText(/\/updatepaymentlink (.+) (.+)/, (msg, match) => {
    if (!isAdmin(msg.from.id)) return;
    
    const courseId = match[1].trim();
    const newLink = match[2].trim();
    
    if (!courses.has(courseId)) {
        return bot.sendMessage(msg.chat.id, '❌ Course not found!');
    }
    
    if (!newLink.startsWith('https://')) {
        return bot.sendMessage(msg.chat.id, '❌ Invalid payment link! Must start with https://');
    }
    
    paymentLinks.set(courseId, newLink);
    const course = courses.get(courseId);
    
    bot.sendMessage(msg.chat.id, `✅ Payment link updated for "${course.name}"\n🔗 New Link: ${newLink}`);
});

// Revenue Stats
bot.onText(/\/revenue/, (msg) => {
    if (!isAdmin(msg.from.id)) return;
    
    let totalRevenue = 0;
    let courseRevenue = new Map();
    
    users.forEach(userData => {
        userData.purchases.forEach(courseId => {
            const course = courses.get(courseId);
            if (course) {
                totalRevenue += course.price;
                courseRevenue.set(courseId, (courseRevenue.get(courseId) || 0) + course.price);
            }
        });
    });
    
    let revenueText = `💰 **Revenue Details**\n\n`;
    revenueText += `💵 **Total Revenue:** ${totalRevenue} TK\n\n`;
    revenueText += `📊 **Course-wise Revenue:**\n`;
    
    if (courseRevenue.size === 0) {
        revenueText += `No sales yet.`;
    } else {
        courseRevenue.forEach((revenue, courseId) => {
            const course = courses.get(courseId);
            if (course) {
                const salesCount = Math.floor(revenue / course.price);
                revenueText += `🔹 ${course.name}\n`;
                revenueText += `   Sales: ${salesCount} | Revenue: ${revenue} TK\n\n`;
            }
        });
    }
    
    bot.sendMessage(msg.chat.id, revenueText, {parse_mode: 'Markdown'});
});

// User Stats
bot.onText(/\/users/, (msg) => {
    if (!isAdmin(msg.from.id)) return;
    
    const totalUsers = users.size;
    let paidUsers = 0;
    let freeUsers = 0;
    
    users.forEach(userData => {
        if (userData.purchases.size > 0) {
            paidUsers++;
        } else {
            freeUsers++;
        }
    });
    
    const usersText = `👥 **User Statistics**
    
📊 **Total Users:** ${totalUsers}
💰 **Paid Users:** ${paidUsers}
🆓 **Free Users:** ${freeUsers}
📈 **Conversion Rate:** ${totalUsers > 0 ? ((paidUsers/totalUsers)*100).toFixed(1) : 0}%`;
    
    bot.sendMessage(msg.chat.id, usersText, {parse_mode: 'Markdown'});
});

// General Stats
bot.onText(/\/stats/, (msg) => {
    if (!isAdmin(msg.from.id)) return;
    
    const totalUsers = users.size;
    let totalPurchases = 0;
    let totalRevenue = 0;
    
    users.forEach(userData => {
        totalPurchases += userData.purchases.size;
        userData.purchases.forEach(courseId => {
            const course = courses.get(courseId);
            if (course) totalRevenue += course.price;
        });
    });
    
    const statsText = `📊 Bot Statistics

👥 Total Users: ${totalUsers}
💰 Total Purchases: ${totalPurchases}  
💵 Total Revenue: ${totalRevenue} TK
📚 Available Courses: ${courses.size}
👨‍💼 Total Admins: ${adminUsers.size}`;

    bot.sendMessage(msg.chat.id, statsText);
});

// Transaction ID Management Commands
bot.onText(/\/checktrx (.+)/, async (msg, match) => {
    if (!isAdmin(msg.from.id)) return;
    
    const trxId = match[1];
    const isUsed = isTransactionUsed(trxId);

    bot.sendMessage(
        msg.chat.id,
        `ℹ️ **TRX ID Status:** ${isUsed ? "🟢 Already Used" : "🔴 Not Used"}\n\n` +
        `ID: \`${trxId}\``,
        { parse_mode: 'Markdown' }
    );
});

bot.onText(/\/addtrx (.+)/, async (msg, match) => {
    if (!isAdmin(msg.from.id)) return;
    
    const trxId = match[1];
    usedTransactions.add(trxId);

    bot.sendMessage(
        msg.chat.id,
        `✅ **TRX ID Added to Used List**\n\n` +
        `\`${trxId}\` এখন থেকে ব্যবহার করা যাবে না।`,
        { parse_mode: 'Markdown' }
    );
});

bot.onText(/\/removetrx (.+)/, async (msg, match) => {
    if (!isAdmin(msg.from.id)) return;
    
    const trxId = match[1];
    usedTransactions.delete(trxId);

    bot.sendMessage(
        msg.chat.id,
        `♻️ **TRX ID Removed from Used List**\n\n` +
        `\`${trxId}\` আবার ব্যবহার করা যাবে।`,
        { parse_mode: 'Markdown' }
    );
});

// Approve Payment Command
bot.onText(/\/approvepayment (.+) (.+)/, async (msg, match) => {
    if (!isAdmin(msg.from.id)) return;
    
    const userId = match[1];
    const courseId = match[2];
    
    if (!courses.has(courseId)) {
        return bot.sendMessage(msg.chat.id, '❌ Invalid course ID!');
    }
    
    const userData = getUserData(userId);
    const course = courses.get(courseId);
    
    userData.purchases.add(courseId);
    userData.pendingCourse = null;
    userData.currentScreen = 'main_menu';
    
    // Notify user
    const successText = `✅ **Admin has approved your payment!**\n\n` +
                       `📱 ${course.name} Unlocked!\n` +
                       `💰 Amount: ${course.price} TK\n\n` +
                       `🎯 Join your course group by clicking the button below:`;
    
    bot.sendMessage(userId, successText, {
        parse_mode: 'Markdown',
        reply_markup: {
            keyboard: [
                ['🎯 Join Course Group'],
                ['🏠 Main Menu']
            ],
            resize_keyboard: true,
            one_time_keyboard: false
        }
    });
    
    bot.sendMessage(msg.chat.id, `✅ Payment approved for user ${userId} for course ${course.name}`);
});

// Handle Reply Keyboard Messages
bot.on('message', async (msg) => {
    if (msg.text && msg.text.startsWith('/')) return;
    if (!msg.text) return;
    
    const userId = msg.from.id;
    const userData = getUserData(userId);
    const text = msg.text;
    
    // Handle transaction ID input
    if (userData.waitingForTrx && userData.waitingForTrx.type === 'bkash' && !text.includes('❌') && !text.includes('🏠')) {
        const courseId = userData.waitingForTrx.courseId;
        const course = courses.get(courseId);
        const trxId = text.trim();
        
        // Check if TRX ID already used
        if (isTransactionUsed(trxId)) {
            return bot.sendMessage(
                msg.chat.id, 
                "❌ **এই Transaction ID আগেই ব্যবহার করা হয়েছে!**\n\n" +
                "দয়া করে নতুন একটি Transaction ID দিন অথবা সাপোর্টে যোগাযোগ করুন।",
                { parse_mode: 'Markdown' }
            );
        }
        
        userData.waitingForTrx = null;
        userData.currentScreen = 'main_menu';
        
        bot.sendMessage(msg.chat.id, '⏳ Verifying payment... Please wait...');
        
        try {
            const paymentData = await verifyPayment(trxId);
            
            if (paymentData && paymentData.transactionStatus === 'Completed' && 
                parseInt(paymentData.amount) >= course.price) {
                
                // Save to channel and mark as used
                await logTransaction(trxId, userId, course.price, course.name, 'bKash');
                
                userData.purchases.add(courseId);
                userData.pendingCourse = null;
                
                const successText = `✅ **পেমেন্ট সফলভাবে ভেরিফাই হয়েছে!**\n\n` +
                                   `📱 ${course.name} Unlocked!\n` +
                                   `💰 Amount: ${course.price} TK\n` +
                                   `🎫 Transaction ID: ${trxId}\n\n` +
                                   `🎯 Join your course group:`;
                
                bot.sendMessage(msg.chat.id, successText, {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        keyboard: [
                            [`🎯 Join ${course.name} Group`],
                            ['🏠 Main Menu']
                        ],
                        resize_keyboard: true,
                        one_time_keyboard: false
                    }
                });
                
                pendingPayments.delete(`${userId}_${courseId}`);
                
            } else {
                bot.sendMessage(msg.chat.id, `❌ Payment Verification Failed!\n\n🔍 Possible reasons:\n• Transaction ID not found\n• Payment amount insufficient\n• Payment not completed\n\n💡 Please check your Transaction ID and try again.\n\nTransaction ID entered: ${trxId}`, {
                    reply_markup: {
                        keyboard: [
                            ['🔄 Try Again'],
                            ['🏠 Main Menu']
                        ],
                        resize_keyboard: true,
                        one_time_keyboard: false
                    }
                });
            }
            
        } catch (error) {
            console.error('Payment verification error:', error);
            bot.sendMessage(msg.chat.id, `⚠️ Verification Error!\n\nSomething went wrong while verifying your payment. Please contact support.\n\nTransaction ID: ${trxId}`, {
                reply_markup: {
                    keyboard: [
                        ['🔥 Support 🔥'],
                        ['🏠 Main Menu']
                    ],
                    resize_keyboard: true,
                    one_time_keyboard: false
                }
            });
        }
        return;
    }
    
    // Handle Nagad photo upload
    if (userData.waitingForTrx && userData.waitingForTrx.type === 'nagad' && msg.photo) {
        const courseId = userData.waitingForTrx.courseId;
        const course = courses.get(courseId);
        
        // Forward the photo to admin
        const photo = msg.photo[msg.photo.length - 1];
        const caption = `📌 Nagad Payment Proof\n\n` +
                       `👤 User: \`${userId}\`\n` +
                       `📚 Course: ${course.name}\n` +
                       `💰 Amount: ${course.price} TK`;
        
        await bot.sendPhoto(ADMIN_ID, photo.file_id, {
            caption: caption,
            parse_mode: 'Markdown'
        });
        
        const successText = `✅ **Nagad Payment Proof Received**\n\n` +
                           `📱 ${course.name}\n` +
                           `💰 Amount: ${course.price} TK\n\n` +
                           `ℹ️ Admin manually verify করবেন। কিছুক্ষণ পরে চেক করুন।`;
        
        bot.sendMessage(msg.chat.id, successText, {
            reply_markup: {
                keyboard: [
                    ['📱 Contact Admin'],
                    ['🏠 Main Menu']
                ],
                resize_keyboard: true,
                one_time_keyboard: false
            }
        });
        
        userData.waitingForTrx = null;
        userData.currentScreen = 'main_menu';
        return;
    }

    // Main Menu Handlers
    if (text === '🔥HSC 2027 All Courses🔥') {
        userData.currentScreen = 'hsc2027';
        const courseListText = `🔥 HSC 2027 All Courses 🔥

📚 Available Subjects:`;
        
        bot.sendMessage(msg.chat.id, courseListText, getHSC2027Keyboard(userId));
    }
    else if (text === 'HSC 2025 সকল Admission কোর্স 🟢') {
        bot.sendMessage(msg.chat.id, '🚧 Coming Soon! HSC 2025 Admission courses will be available shortly.', mainMenuKeyboard);
    }
    else if (text === '🔥HSC 2026 All Courses🔥') {
        bot.sendMessage(msg.chat.id, '🚧 Coming Soon! HSC 2026 courses will be available shortly.', mainMenuKeyboard);
    }
    else if (text === '❤️Admission All Courses 2024❤️') {
        bot.sendMessage(msg.chat.id, '🚧 Coming Soon! Admission 2024 courses will be available shortly.', mainMenuKeyboard);
    }
    else if (text === '🔥 Support 🔥') {
        bot.sendMessage(msg.chat.id, `📞 **Support Contact**\n\n🔗 Click here to contact our support team:`, {
            parse_mode: 'Markdown',
            reply_markup: {
                keyboard: [
                    ['📱 Contact Support'],
                    ['🏠 Main Menu']
                ],
                resize_keyboard: true,
                one_time_keyboard: false
            }
        });
    }
    else if (text === '📱 Contact Support' || text === '📱 Contact Admin') {
        bot.sendMessage(msg.chat.id, `📱 **Admin Contact**\n\nClick the link below to contact admin directly:\n\n${ADMIN_TELEGRAM_LINK}`, {
            parse_mode: 'Markdown',
            reply_markup: {
                keyboard: [
                    ['🏠 Main Menu']
                ],
                resize_keyboard: true,
                one_time_keyboard: false
            }
        });
    }
    else if (text === '🔥 Our Channel ❤️') {
        bot.sendMessage(msg.chat.id, `📢 **Our Channel**\n\nJoin our channel for updates and announcements!`, {
            parse_mode: 'Markdown',
            reply_markup: {
                keyboard: [
                    ['🏠 Main Menu']
                ],
                resize_keyboard: true,
                one_time_keyboard: false
            }
        });
    }mainMenuKeyboard
        });
    }
    else if (text === '🔥 Our Channel ❤️') {
        bot.sendMessage(msg.chat.id, `📢 **Our Channel**\n\nJoin our channel for updates and announcements!`, {
            parse_mode: 'Markdown',
            ...mainMenuKeyboard
        });
    }
    
    // Navigation handlers
    else if (text === '🏠 Main Menu' || text === '⬅️ Back to Main Menu') {
        userData.currentScreen = 'main_menu';
        userData.waitingForTrx = null;
        const welcomeText = `🎓 HSC Courses Bot - Main Menu 🎓

আপনার পছন্দের course category সিলেক্ট করুন:`;
        
        bot.sendMessage(msg.chat.id, welcomeText, mainMenuKeyboard);
    }
    else if (text === '⬅️ Back to HSC 2027') {
        userData.currentScreen = 'hsc2027';
        const courseListText = `🔥 HSC 2027 All Courses 🔥

📚 Available Subjects:`;
        
        bot.sendMessage(msg.chat.id, courseListText, getHSC2027Keyboard(userId));
    }
    
    // Course selection handlers
    else if (text.includes('📱 ICT Course')) {
        handleCourseSelection(msg, userId, 'hsc2027_ict');
    }
    else if (text.includes('📚 Bangla Course')) {
        handleCourseSelection(msg, userId, 'hsc2027_bangla');
    }
    else if (text.includes('🔢 Math Course')) {
        handleCourseSelection(msg, userId, 'hsc2027_math');
    }
    else if (text.includes('⚗️ Chemistry Course')) {
        handleCourseSelection(msg, userId, 'hsc2027_chemistry');
    }
    else if (text.includes('🧬 Biology Course')) {
        handleCourseSelection(msg, userId, 'hsc2027_biology');
    }
    else if (text.includes('🧮 HSC 2027 ACS MATH CYCLE 1')) {
        handleCourseSelection(msg, userId, 'hsc2027_acs_math_cycle1');
    }
    
    // Course action handlers
    else if (text === '💳 Buy Now') {
        if (userData.pendingCourse) {
            const courseId = userData.pendingCourse;
            const course = courses.get(courseId);
            
            const paymentText = `💳 Payment for ${course.name}

💰 Amount: ${course.price} TK

💡 Please select your payment method:`;

            bot.sendMessage(msg.chat.id, paymentText, getPaymentMethodKeyboard(courseId));
        }
    }
    else if (text === '💳 Pay Now' || text === '📝 Submit Payment') {
        if (userData.pendingCourse) {
            const courseId = userData.pendingCourse;
            const course = courses.get(courseId);
            
            const paymentText = `💳 Payment for ${course.name}

💰 Amount: ${course.price} TK

💡 Please select your payment method:`;

            bot.sendMessage(msg.chat.id, paymentText, getPaymentMethodKeyboard(courseId));
        }
    }
    
    // Payment method handlers
    else if (text === '💰 bKash Payment') {
        if (userData.pendingCourse) {
            const courseId = userData.pendingCourse;
            const course = courses.get(courseId);
            
            const paymentText = `💳 bKash Payment for ${course.name}

💰 Amount: ${course.price} TK
📱 bKash Number: ${BKASH_NUMBER}

💡 Payment Options:
1. Send Money to above bKash number
2. OR Click "Pay Now" button for instant payment`;

            bot.sendMessage(msg.chat.id, paymentText, getBkashPaymentKeyboard(courseId));
        }
    }
    else if (text === '💰 Nagad Payment') {
        if (userData.pendingCourse) {
            const courseId = userData.pendingCourse;
            const course = courses.get(courseId);
            
            const paymentText = `💳 Nagad Payment for ${course.name}

💰 Amount: ${course.price} TK
📱 Nagad Number: ${NAGAD_NUMBER}

📌 Payment Instructions:
1. Send ${course.price} TK to above Nagad number
2. Take a screenshot of payment
3. Click "Submit Payment Proof" button
4. Send the screenshot and course name to admin

ℹ️ Nagad এ payment করলে payment এর screenshot & course name সহ এডমিন কে মেসেজ দাও. Admin accept করবে. Bkash এ payment করলে auto approve পাবে !!`;

            bot.sendMessage(msg.chat.id, paymentText, getNagadPaymentKeyboard(courseId));
        }
    }
    
    // bKash payment handlers
    else if (text === '💳 Pay with bKash Link') {
        if (userData.pendingCourse && paymentLinks.has(userData.pendingCourse)) {
            const link = paymentLinks.get(userData.pendingCourse);
            bot.sendMessage(msg.chat.id, `💳 **bKash Payment Link**\n\n${link}\n\nAfter payment, come back and submit your transaction ID.`, {
                parse_mode: 'Markdown',
                ...getBkashPaymentKeyboard(userData.pendingCourse)
            });
        } else {
            bot.sendMessage(msg.chat.id, `💳 **Manual bKash Payment**\n\n📱 Send money to: ${BKASH_NUMBER}\n💰 Amount: ${courses.get(userData.pendingCourse)?.price || 0} TK\n\nAfter payment, submit your transaction ID.`, {
                ...getBkashPaymentKeyboard(userData.pendingCourse)
            });
        }
    }
    else if (text === '📝 Submit bKash Transaction ID') {
        if (userData.pendingCourse) {
            const courseId = userData.pendingCourse;
            const course = courses.get(courseId);
            
            const trxText = `📝 bKash Transaction ID Submit করুন\n\n💡 Instructions:\n✅ bKash থেকে যে Transaction ID পেয়েছেন সেটি type করুন\n✅ Example: 9BG4R2G5N8\n✅ শুধু ID লিখুন, অন্য কিছু না\n\n📱 ${course.name} এর জন্য payment verification\n💰 Amount: ${course.price} TK`;
            
            bot.sendMessage(msg.chat.id, trxText, getTransactionInputKeyboard());
            
            userData.waitingForTrx = { type: 'bkash', courseId };
        }
    }
    
    // Nagad payment handlers
    else if (text === '📱 Get Nagad Number') {
        bot.sendMessage(msg.chat.id, `📱 **Nagad Payment Number**\n\n${NAGAD_NUMBER}\n\nSend ${courses.get(userData.pendingCourse)?.price || 0} TK to this number and then submit payment proof.`, {
            ...getNagadPaymentKeyboard(userData.pendingCourse)
        });
    }
    else if (text === '📝 Submit Nagad Payment Proof') {
        if (userData.pendingCourse) {
            const courseId = userData.pendingCourse;
            const course = courses.get(courseId);
            
            const trxText = `📝 Nagad Payment Proof Submit করুন\n\n💡 Instructions:\n✅ Nagad payment এর screenshot পাঠান\n✅ Course name লিখুন\n✅ Amount: ${course.price} TK\n\nℹ️ Admin manually approve করবেন, কিছুক্ষণ পরে চেক করুন`;
            
            bot.sendMessage(msg.chat.id, trxText, {
                reply_markup: {
                    keyboard: [
                        ['📱 Contact Admin'],
                        ['❌ Cancel Transaction'],
                        ['🏠 Main Menu']
                    ],
                    resize_keyboard: true,
                    one_time_keyboard: false
                }
            });
            
            userData.waitingForTrx = { type: 'nagad', courseId };
        }
    }
    
    // Course group join handlers
    else if (text === '🎯 Join Course Group') {
        // Find which course group to join based on purchased courses
        let foundCourse = null;
        for (const [courseId, course] of courses.entries()) {
            if (userData.purchases.has(courseId) && text.includes('🎯 Join')) {
                foundCourse = { id: courseId, ...course };
                break;
            }
        }
        
        if (!foundCourse) {
            // Check if it's a specific course group button
            for (const [courseId, course] of courses.entries()) {
                if (text.includes(course.name) && userData.purchases.has(courseId)) {
                    foundCourse = { id: courseId, ...course };
                    break;
                }
            }
        }
        
        if (foundCourse) {
            bot.sendMessage(msg.chat.id, `🎯 **Join ${foundCourse.name} Group**\n\n${foundCourse.groupLink}\n\nClick the link above to join your course group!`, {
                ...mainMenuKeyboard
            });
        } else {
            bot.sendMessage(msg.chat.id, '❌ No purchased course found or invalid action.', mainMenuKeyboard);
        }
    }
    else if (text.includes('🎯 Join') && text.includes('Group')) {
        // Handle specific course group joins
        for (const [courseId, course] of courses.entries()) {
            if (text.includes(course.name) && userData.purchases.has(courseId)) {
                bot.sendMessage(msg.chat.id, `🎯 **Join ${course.name} Group**\n\n${course.groupLink}\n\nClick the link above to join your course group!`, {
                    ...mainMenuKeyboard
                });
                return;
            }
        }
    }
    
    // Navigation back handlers
    else if (text === '⬅️ Back to Course') {
        if (userData.pendingCourse) {
            handleCourseSelection(msg, userId, userData.pendingCourse);
        }
    }
    else if (text === '⬅️ Back to Payment') {
        if (userData.pendingCourse) {
            const courseId = userData.pendingCourse;
            const course = courses.get(courseId);
            
            const paymentText = `💳 Payment for ${course.name}

💰 Amount: ${course.price} TK

💡 Please select your payment method:`;

            bot.sendMessage(msg.chat.id, paymentText, getPaymentMethodKeyboard(courseId));
        }
    }
    
    // Cancel handlers
    else if (text === '❌ Cancel Transaction') {
        userData.waitingForTrx = null;
        if (userData.pendingCourse) {
            handleCourseSelection(msg, userId, userData.pendingCourse);
        } else {
            bot.sendMessage(msg.chat.id, 'Transaction cancelled.', mainMenuKeyboard);
        }
    }
    else if (text === '🔄 Try Again') {
        if (userData.pendingCourse) {
            const courseId = userData.pendingCourse;
            const course = courses.get(courseId);
            
            const trxText = `📝 bKash Transaction ID Submit করুন\n\n💡 Instructions:\n✅ bKash থেকে যে Transaction ID পেয়েছেন সেটি type করুন\n✅ Example: 9BG4R2G5N8\n✅ শুধু ID লিখুন, অন্য কিছু না\n\n📱 ${course.name} এর জন্য payment verification\n💰 Amount: ${course.price} TK`;
            
            bot.sendMessage(msg.chat.id, trxText, getTransactionInputKeyboard());
            
            userData.waitingForTrx = { type: 'bkash', courseId };
        }
    }
});

// Helper function to handle course selection
async function handleCourseSelection(msg, userId, courseId) {
    const userData = getUserData(userId);
    const course = courses.get(courseId);
    
    if (!course) return;
    
    const isPurchased = userData.purchases.has(courseId);
    const isPending = userData.pendingCourse === courseId;
    
    userData.pendingCourse = courseId;
    userData.currentScreen = 'course_detail';
    
    let courseText = `${course.name}\n`;
    
    // Try to send course image if available
    if (courseImages.has(courseId)) {
        try {
            await bot.sendPhoto(msg.chat.id, courseImages.get(courseId), {
                caption: courseText,
                ...getCourseKeyboard(courseId, userId, isPending)
            });
            return;
        } catch (error) {
            console.error('Error sending course image:', error);
        }
    }
    
    if (isPurchased) {
        courseText += `Status: ✅ Purchased\n`;
        courseText += `💰 Price: ${course.price} TK\n\n`;
        courseText += `🎉 You have access to this course!\n`;
        courseText += `Click "Join Course Group" to access materials.`;
    } else if (isPending) {
        courseText += `Status: ⏳ Payment Pending\n`;
        courseText += `💰 Price: ${course.price} TK\n\n`;
        courseText += `💰 Payment Instructions:\n`;
        courseText += `1. Click on "Pay Now" button\n`;
        courseText += `2. Complete payment\n`;
        courseText += `3. Submit your payment proof`;
    } else {
        courseText += `Status: ❌ Not Purchased\n`;
        courseText += `💰 Price: ${course.price} TK\n\n`;
        courseText += `📖 Course Details:\n`;
        courseText += `✅ HD Video Lectures\n`;
        courseText += `✅ PDF Notes & Books\n`;
        courseText += `✅ Practice Questions\n`;
        courseText += `✅ Live Support\n`;
        courseText += `✅ Lifetime Access`;
    }
    
    bot.sendMessage(msg.chat.id, courseText, getCourseKeyboard(courseId, userId, isPending));
}

// Express server
app.get('/', (req, res) => {
    res.send('HSC Courses Bot is running!');
});

// Health Check
app.get('/health', (req, res) => res.sendStatus(200))
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

console.log('HSC Courses Bot started successfully!');