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
const CHANNEL_ID = -1002855286349; // Your Telegram channel ID

// ✅ Enable polling (no idle)
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// Test Command
bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, "Bot is running 24/7 with Long Polling!");
});

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
            pendingCourse: null
        });
    }
    return users.get(userId);
}

// Transaction ID Management
function isTransactionUsed(trxId) {
    return usedTransactions.has(trxId);
}

async function logTransaction(trxId, userId, amount, courseName) {
    usedTransactions.add(trxId);
    
    const message = `💰 **New Payment**\n\n` +
                   `👤 User: \`${userId}\`\n` +
                   `📚 Course: ${courseName}\n` +
                   `💵 Amount: ${amount} TK\n` +
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

// Keyboards
const mainMenuKeyboard = {
    reply_markup: {
        inline_keyboard: [
            [{ text: '🔥HSC 2027 All Courses🔥', callback_data: 'hsc2027' }],
            [{ text: 'HSC 2025 সকল Admission কোর্স 🟢', callback_data: 'admission2025' }],
            [{ text: '🔥HSC 2026 All Courses🔥', callback_data: 'hsc2026' }],
            [{ text: '❤️Admission All Courses 2024❤️', callback_data: 'admission2024' }],
            [
                { text: '🔥 Support 🔥', url: 'https://t.me/yoursupport' },
                { text: '🔥 Our Channel ❤️', url: 'https://t.me/yourchannel' }
            ]
        ]
    }
};

function getHSC2027Keyboard(userId) {
    const userData = getUserData(userId);
    const keyboard = [];
    
    courses.forEach((course, courseId) => {
        if (courseId.startsWith('hsc2027_')) {
            const status = userData.purchases.has(courseId) ? '✅ Purchased' : '❌ Not Purchased';
            keyboard.push([{
                text: `${course.name}\n${status}\nPrice: ${course.price} TK`,
                callback_data: courseId
            }]);
        }
    });
    
    keyboard.push([
        { text: '⬅️ Back', callback_data: 'main_menu' },
        { text: '🏠 Main Menu', callback_data: 'main_menu' }
    ]);
    
    return { reply_markup: { inline_keyboard: keyboard } };
}

function getCourseKeyboard(courseId, userId, isPending = false) {
    const userData = getUserData(userId);
    const keyboard = [];
    
    if (userData.purchases.has(courseId)) {
        const course = courses.get(courseId);
        keyboard.push([{ text: '🎯 Join Course Group', url: course.groupLink }]);
    } else if (isPending) {
        keyboard.push([
            { text: '💳 Pay Now', callback_data: `pay_${courseId}` },
            { text: '📝 Submit Transaction ID', callback_data: `submit_trx_${courseId}` }
        ]);
    } else {
        keyboard.push([{ text: '💳 Buy Now', callback_data: `buy_${courseId}` }]);
    }
    
    keyboard.push([
        { text: '⬅️ Back', callback_data: 'hsc2027' },
        { text: '🏠 Main Menu', callback_data: 'main_menu' }
    ]);
    
    return { reply_markup: { inline_keyboard: keyboard } };
}

// Bot Commands
bot.onText(/\/start/, (msg) => {
    const welcomeText = `🎓 Welcome to HSC Courses Bot! 🎓

আমাদের premium courses গুলো দেখুন এবং আপনার পছন্দের course কিনুন।

💎 High Quality Content
📚 Expert Teachers  
🎯 Guaranteed Results
💯 24/7 Support`;

    bot.sendMessage(msg.chat.id, welcomeText, mainMenuKeyboard);
});

// Admin Commands
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
\`/updatepaymentlink hsc2027_ict https://your-bkash-link.com/ict\`` : `

🔧 **Examples:**
\`/editprice hsc2027_ict 450\`
\`/editlink hsc2027_ict https://t.me/+newlink\``);

    bot.sendMessage(msg.chat.id, adminText, {parse_mode: 'Markdown'});
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
        courseList += `   🔗 Link: ${course.groupLink}\n\n`;
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

// Callback Query Handler
bot.on('callback_query', async (callbackQuery) => {
    const msg = callbackQuery.message;
    const data = callbackQuery.data;
    const userId = callbackQuery.from.id;
    const userData = getUserData(userId);
    
    bot.answerCallbackQuery(callbackQuery.id);
    
    if (data === 'main_menu') {
        const welcomeText = `🎓 HSC Courses Bot - Main Menu 🎓

আপনার পছন্দের course category সিলেক্ট করুন:`;
        
        bot.editMessageText(welcomeText, {
            chat_id: msg.chat.id,
            message_id: msg.message_id,
            ...mainMenuKeyboard
        });
    }
    else if (data === 'hsc2027') {
        const courseListText = `🔥 HSC 2027 All Courses 🔥

📚 Available Subjects:`;
        
        bot.editMessageText(courseListText, {
            chat_id: msg.chat.id,
            message_id: msg.message_id,
            ...getHSC2027Keyboard(userId)
        });
    }
    else if (courses.has(data)) {
        const course = courses.get(data);
        const isPurchased = userData.purchases.has(data);
        const isPending = userData.pendingCourse === data;
        
        let courseText = `${course.name}\n`;
        
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
            courseText += `2. Complete bKash payment\n`;
            courseText += `3. Transaction ID copy করুন\n`;
            courseText += `4. "Submit Transaction ID" button এ click করুন`;
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
        
        bot.editMessageText(courseText, {
            chat_id: msg.chat.id,
            message_id: msg.message_id,
            ...getCourseKeyboard(data, userId, isPending)
        });
    }
    else if (data.startsWith('buy_')) {
        const courseId = data.replace('buy_', '');
        const course = courses.get(courseId);
        
        userData.pendingCourse = courseId;
        
        const paymentText = `💳 Payment for ${course.name}

💰 Amount: ${course.price} TK
📱 bKash Number: ${BKASH_NUMBER}

💡 Payment Options:
1. Send Money to above bKash number
2. OR Click "Pay Now" button for instant payment`;

        bot.editMessageText(paymentText, {
            chat_id: msg.chat.id,
            message_id: msg.message_id,
            ...getCourseKeyboard(courseId, userId, true)
        });
    }
    else if (data.startsWith('pay_')) {
        const courseId = data.replace('pay_', '');
        const course = courses.get(courseId);
        
        if (!paymentLinks.has(courseId)) {
            return bot.sendMessage(msg.chat.id, '⚠️ Payment link not configured for this course. Please send money manually to the bKash number.');
        }
        
        const paymentLink = paymentLinks.get(courseId);
        
        const paymentText = `💳 Instant Payment for ${course.name}\n\n💰 Amount: ${course.price} TK`;
        
        bot.sendMessage(msg.chat.id, paymentText, {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '💳 Pay Now with bKash', url: paymentLink }],
                    [{ text: '📝 Submit Transaction ID', callback_data: `submit_trx_${courseId}` }],
                    [{ text: '⬅️ Back', callback_data: courseId }]
                ]
            }
        });
    }
    else if (data.startsWith('submit_trx_')) {
        const courseId = data.replace('submit_trx_', '');
        const course = courses.get(courseId);
        
        const trxText = `📝 Transaction ID Submit করুন\n\n💡 Instructions:\n✅ bKash থেকে যে Transaction ID পেয়েছেন সেটি type করুন\n✅ Example: 9BG4R2G5N8\n✅ শুধু ID লিখুন, অন্য কিছু না\n\n📱 ${course.name} এর জন্য payment verification\n💰 Amount: ${course.price} TK`;
        
        bot.sendMessage(msg.chat.id, trxText, {
            reply_markup: {
                inline_keyboard: [[
                    { text: '❌ Cancel', callback_data: courseId }
                ]]
            }
        });
        
        userData.waitingForTrx = courseId;
    }
});

// Handle Transaction ID Input
bot.on('message', async (msg) => {
    if (msg.text && msg.text.startsWith('/')) return;
    
    const userId = msg.from.id;
    const userData = getUserData(userId);
    
    if (userData.waitingForTrx) {
        const courseId = userData.waitingForTrx;
        const course = courses.get(courseId);
        const trxId = msg.text.trim();
        
        // Check if TRX ID already used
        if (isTransactionUsed(trxId)) {
            return bot.sendMessage(
                msg.chat.id, 
                "❌ **এই Transaction ID আগেই ব্যবহার করা হয়েছে!**\n\n" +
                "দয়া করে নতুন একটি Transaction ID দিন অথবা সাপোর্টে যোগাযোগ করুন।",
                { parse_mode: 'Markdown' }
            );
        }
        
        userData.waitingForTrx = null;
        
        bot.sendMessage(msg.chat.id, '⏳ Verifying payment... Please wait...');
        
        try {
            const paymentData = await verifyPayment(trxId);
            
            if (paymentData && paymentData.transactionStatus === 'Completed' && 
                parseInt(paymentData.amount) >= course.price) {
                
                // Save to channel and mark as used
                await logTransaction(trxId, userId, course.price, course.name);
                
                userData.purchases.add(courseId);
                userData.pendingCourse = null;
                
                const successText = `✅ **পেমেন্ট সফলভাবে ভেরিফাই হয়েছে!**\n\n` +
                                   `📱 ${course.name} Unlocked!\n` +
                                   `💰 Amount: ${course.price} TK\n` +
                                   `🎫 Transaction ID: ${trxId}\n\n` +
                                   `🎯 Join your course group:\n👉 Click the button below`;
                
                bot.sendMessage(msg.chat.id, successText, {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: `🎯 Join ${course.name} Group`, url: course.groupLink }],
                            [{ text: '🏠 Main Menu', callback_data: 'main_menu' }]
                        ]
                    }
                });
                
                pendingPayments.delete(`${userId}_${courseId}`);
                
            } else {
                bot.sendMessage(msg.chat.id, `❌ Payment Verification Failed!\n\n🔍 Possible reasons:\n• Transaction ID not found\n• Payment amount insufficient\n• Payment not completed\n\n💡 Please check your Transaction ID and try again.\n\nTransaction ID entered: ${trxId}`, {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '🔄 Try Again', callback_data: `submit_trx_${courseId}` }],
                            [{ text: '🏠 Main Menu', callback_data: 'main_menu' }]
                        ]
                    }
                });
            }
            
        } catch (error) {
            console.error('Payment verification error:', error);
            bot.sendMessage(msg.chat.id, `⚠️ Verification Error!\n\nSomething went wrong while verifying your payment. Please contact support.\n\nTransaction ID: ${trxId}`, {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '💬 Contact Support', url: 'https://t.me/yoursupport' }],
                        [{ text: '🏠 Main Menu', callback_data: 'main_menu' }]
                    ]
                }
            });
        }
    }
});

// Express server
app.get('/', (req, res) => {
    res.send('HSC Courses Bot is running!');
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

console.log('HSC Courses Bot started successfully!');
