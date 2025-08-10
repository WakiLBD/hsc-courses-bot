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
            pendingCourse: null
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

// Keyboards - UPDATED TO USE REPLY KEYBOARD
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
        one_time_keyboard: true
    }
};

function getHSC2027Keyboard(userId) {
    const userData = getUserData(userId);
    const keyboard = [];
    
    courses.forEach((course, courseId) => {
        if (courseId.startsWith('hsc2027_')) {
            const status = userData.purchases.has(courseId) ? '✅ Purchased' : '❌ Not Purchased';
            keyboard.push([`${course.name}\n${status}\nPrice: ${course.price} TK`]);
        }
    });
    
    keyboard.push(['⬅️ Back', '🏠 Main Menu']);
    
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
    const keyboard = [];
    
    if (userData.purchases.has(courseId)) {
        const course = courses.get(courseId);
        keyboard.push(['🎯 Join Course Group']);
    } else if (isPending) {
        keyboard.push(['💳 Pay Now', '📝 Submit Payment']);
    } else {
        keyboard.push(['💳 Buy Now']);
    }
    
    keyboard.push(['⬅️ Back', '🏠 Main Menu']);
    
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
                ['bKash Payment', 'Nagad Payment'],
                ['⬅️ Back', '🏠 Main Menu']
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
                ['📝 Submit Transaction ID'],
                ['⬅️ Back', '🏠 Main Menu']
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
                ['📱 Nagad Number'],
                ['📝 Submit Payment Proof'],
                ['⬅️ Back', '🏠 Main Menu']
            ],
            resize_keyboard: true,
            one_time_keyboard: false
        }
    };
}

// Bot Commands - UPDATED TO WORK WITH REPLY KEYBOARD
bot.onText(/\/start/, (msg) => {
    const welcomeText = `🎓 Welcome to HSC Courses Bot! 🎓

আমাদের premium courses গুলো দেখুন এবং আপনার পছন্দের course কিনুন।

💎 High Quality Content
📚 Expert Teachers  
🎯 Guaranteed Results
💯 24/7 Support`;

    bot.sendMessage(msg.chat.id, welcomeText, mainMenuKeyboard);
});

// Handle text messages from reply keyboards
bot.on('message', async (msg) => {
    const text = msg.text;
    const userId = msg.from.id;
    const userData = getUserData(userId);
    
    // Skip command messages
    if (text && text.startsWith('/')) return;
    
    // Main menu navigation
    if (text === '🏠 Main Menu') {
        const welcomeText = `🎓 HSC Courses Bot - Main Menu 🎓

আপনার পছন্দের course category সিলেক্ট করুন:`;
        
        return bot.sendMessage(msg.chat.id, welcomeText, mainMenuKeyboard);
    }
    
    // Course category selection
    if (text === '🔥HSC 2027 All Courses🔥') {
        const courseListText = `🔥 HSC 2027 All Courses 🔥

📚 Available Subjects:`;
        
        return bot.sendMessage(msg.chat.id, courseListText, getHSC2027Keyboard(userId));
    }
    
    // Back button
    if (text === '⬅️ Back') {
        if (userData.pendingCourse) {
            const courseId = userData.pendingCourse;
            const course = courses.get(courseId);
            const paymentText = `💳 Payment for ${course.name}

💰 Amount: ${course.price} TK

💡 Please select your payment method:`;

            return bot.sendMessage(msg.chat.id, paymentText, getPaymentMethodKeyboard(courseId));
        } else {
            return bot.sendMessage(msg.chat.id, '🔥HSC 2027 All Courses🔥', getHSC2027Keyboard(userId));
        }
    }
    
    // Course selection
    for (const [courseId, course] of courses) {
        if (text && text.startsWith(course.name)) {
            const isPurchased = userData.purchases.has(courseId);
            const isPending = userData.pendingCourse === courseId;
            
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
            
            return bot.sendMessage(msg.chat.id, courseText, getCourseKeyboard(courseId, userId, isPending));
        }
    }
    
    // Buy Now button
    if (text === '💳 Buy Now') {
        for (const [courseId, course] of courses) {
            if (userData.pendingCourse === courseId) {
                userData.pendingCourse = courseId;
                const paymentText = `💳 Payment for ${course.name}

💰 Amount: ${course.price} TK

💡 Please select your payment method:`;

                return bot.sendMessage(msg.chat.id, paymentText, getPaymentMethodKeyboard(courseId));
            }
        }
    }
    
    // Payment method selection
    if (text === 'bKash Payment') {
        for (const [courseId, course] of courses) {
            if (userData.pendingCourse === courseId) {
                const paymentText = `💳 bKash Payment for ${course.name}

💰 Amount: ${course.price} TK
📱 bKash Number: ${BKASH_NUMBER}

💡 Payment Options:
1. Send Money to above bKash number
2. OR Click "Pay Now" button for instant payment`;

                return bot.sendMessage(msg.chat.id, paymentText, getBkashPaymentKeyboard(courseId));
            }
        }
    }
    
    if (text === 'Nagad Payment') {
        for (const [courseId, course] of courses) {
            if (userData.pendingCourse === courseId) {
                const paymentText = `💳 Nagad Payment for ${course.name}

💰 Amount: ${course.price} TK
📱 Nagad Number: ${NAGAD_NUMBER}

📌 Payment Instructions:
1. Send ${course.price} TK to above Nagad number
2. Take a screenshot of payment
3. Click "Submit Payment Proof" button
4. Send the screenshot and course name to admin`;

                return bot.sendMessage(msg.chat.id, paymentText, getNagadPaymentKeyboard(courseId));
            }
        }
    }
    
    // Submit Transaction ID
    if (text === '📝 Submit Transaction ID') {
        for (const [courseId, course] of courses) {
            if (userData.pendingCourse === courseId) {
                const trxText = `📝 bKash Transaction ID Submit করুন\n\n💡 Instructions:\n✅ bKash থেকে যে Transaction ID পেয়েছেন সেটি type করুন\n✅ Example: 9BG4R2G5N8\n✅ শুধু ID লিখুন, অন্য কিছু না\n\n📱 ${course.name} এর জন্য payment verification\n💰 Amount: ${course.price} TK`;
                
                userData.waitingForTrx = { type: 'bkash', courseId };
                
                return bot.sendMessage(msg.chat.id, trxText, {
                    reply_markup: {
                        keyboard: [['❌ Cancel']],
                        resize_keyboard: true
                    }
                });
            }
        }
    }
    
    // Submit Payment Proof
    if (text === '📝 Submit Payment Proof') {
        for (const [courseId, course] of courses) {
            if (userData.pendingCourse === courseId) {
                const trxText = `📝 Nagad Payment Proof Submit করুন\n\n💡 Instructions:\n✅ Nagad payment এর screenshot পাঠান\n✅ Course name লিখুন\n✅ Amount: ${course.price} TK\n\nℹ️ Admin manually approve করবেন, কিছুক্ষণ পরে চেক করুন`;
                
                userData.waitingForTrx = { type: 'nagad', courseId };
                
                return bot.sendMessage(msg.chat.id, trxText, {
                    reply_markup: {
                        keyboard: [
                            ['✅ Payment Done'],
                            ['❌ Cancel']
                        ],
                        resize_keyboard: true
                    }
                });
            }
        }
    }
    
    // Nagad Number
    if (text === '📱 Nagad Number') {
        return bot.sendMessage(msg.chat.id, `Nagad Number: ${NAGAD_NUMBER}`);
    }
    
    // Payment Done
    if (text === '✅ Payment Done') {
        for (const [courseId, course] of courses) {
            if (userData.pendingCourse === courseId) {
                const successText = `✅ **Nagad Payment Submitted**\n\n` +
                                   `📱 ${course.name}\n` +
                                   `💰 Amount: ${course.price} TK\n\n` +
                                   `ℹ️ Admin manually verify করবেন। কিছুক্ষণ পরে চেক করুন।\n\n` +
                                   `যোগাযোগের জন্য এখানে ক্লিক করুন:`;
                
                bot.sendMessage(msg.chat.id, successText, {
                    reply_markup: {
                        keyboard: [['🏠 Main Menu']],
                        resize_keyboard: true
                    }
                });
                
                // Notify admin
                const adminMessage = `📌 **New Nagad Payment Request**\n\n` +
                                    `👤 User: \`${userId}\`\n` +
                                    `📚 Course: ${course.name}\n` +
                                    `💰 Amount: ${course.price} TK\n\n` +
                                    `✅ Verify payment and use /approvepayment ${userId} ${courseId}`;
                
                bot.sendMessage(ADMIN_ID, adminMessage, { parse_mode: 'Markdown' });
                
                userData.waitingForTrx = null;
                return;
            }
        }
    }
    
    // Cancel
    if (text === '❌ Cancel') {
        if (userData.waitingForTrx) {
            const courseId = userData.waitingForTrx.courseId;
            userData.waitingForTrx = null;
            
            if (userData.waitingForTrx.type === 'bkash') {
                return bot.sendMessage(msg.chat.id, 'Payment submission cancelled.', getBkashPaymentKeyboard(courseId));
            } else {
                return bot.sendMessage(msg.chat.id, 'Payment submission cancelled.', getNagadPaymentKeyboard(courseId));
            }
        }
        return bot.sendMessage(msg.chat.id, 'Action cancelled.', mainMenuKeyboard);
    }
    
    // Join Course Group
    if (text === '🎯 Join Course Group') {
        for (const [courseId, course] of courses) {
            if (userData.purchases.has(courseId)) {
                return bot.sendMessage(msg.chat.id, `Join the course group here: ${course.groupLink}`);
            }
        }
    }
    
    // Handle transaction ID input (same as before)
    if (userData.waitingForTrx && userData.waitingForTrx.type === 'bkash') {
        const courseId = userData.waitingForTrx.courseId;
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
                await logTransaction(trxId, userId, course.price, course.name, 'bKash');
                
                userData.purchases.add(courseId);
                userData.pendingCourse = null;
                
                const successText = `✅ **পেমেন্ট সফলভাবে ভেরিফাই হয়েছে!**\n\n` +
                                   `📱 ${course.name} Unlocked!\n` +
                                   `💰 Amount: ${course.price} TK\n` +
                                   `🎫 Transaction ID: ${trxId}\n\n` +
                                   `🎯 Join your course group:\n👉 ${course.groupLink}`;
                
                bot.sendMessage(msg.chat.id, successText, {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        keyboard: [['🏠 Main Menu']],
                        resize_keyboard: true
                    }
                });
                
                pendingPayments.delete(`${userId}_${courseId}`);
                
            } else {
                bot.sendMessage(msg.chat.id, `❌ Payment Verification Failed!\n\n🔍 Possible reasons:\n• Transaction ID not found\n• Payment amount insufficient\n• Payment not completed\n\n💡 Please check your Transaction ID and try again.\n\nTransaction ID entered: ${trxId}`, {
                    reply_markup: {
                        keyboard: [['🔄 Try Again'], ['🏠 Main Menu']],
                        resize_keyboard: true
                    }
                });
            }
            
        } catch (error) {
            console.error('Payment verification error:', error);
            bot.sendMessage(msg.chat.id, `⚠️ Verification Error!\n\nSomething went wrong while verifying your payment. Please contact support.\n\nTransaction ID: ${trxId}`, {
                reply_markup: {
                    keyboard: [['🏠 Main Menu']],
                    resize_keyboard: true
                }
            });
        }
    }
    
    // Handle photo submission for Nagad
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
                           `ℹ️ Admin manually verify করবেন। কিছুক্ষণ পরে চেক করুন।\n\n` +
                           `যোগাযোগের জন্য এখানে ক্লিক করুন: ${ADMIN_TELEGRAM_LINK}`;
        
        bot.sendMessage(msg.chat.id, successText, {
            reply_markup: {
                keyboard: [['🏠 Main Menu']],
                resize_keyboard: true
            }
        });
        
        userData.waitingForTrx = null;
    }
});

// [REST OF YOUR CODE REMAINS THE SAME - ADMIN COMMANDS, EXPRESS SERVER, ETC.]
// Include all your existing admin commands and other functionality here
// They don't need changes as they don't use inline keyboards

// Express server
app.get('/', (req, res) => {
    res.send('HSC Courses Bot is running!');
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

console.log('HSC Courses Bot started successfully!');
