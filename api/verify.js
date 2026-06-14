const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed' });

    const { tg_id, token, device_id } = req.body;
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

    try {
        // ১. চেক করা: এই টেলিগ্রাম আইডি আগে থেকেই ভেরিফাইড কি না
        const { data: userExist } = await supabase.from('verifications').select('*').eq('telegram_id', tg_id).single();
        if (userExist) return res.json({ success: true, message: 'আপনি ইতিমধ্যে ভেরিফাইড!' });

        // ২. চেক করা: এই ডিভাইস আইডি দিয়ে অন্য কোনো আইডি খোলা হয়েছে কি না (Multi-Account)
        const { data: deviceExist } = await supabase.from('verifications').select('*').eq('device_id', device_id);
        
        if (deviceExist && deviceExist.length > 0) {
            // 🚨 মাল্টিপল অ্যাকাউন্ট সনাক্ত হয়েছে! সরাসরি টেলিগ্রাম এপিআই দিয়ে ইউজারকে ব্যান/মেসেজ পাঠানো
            await sendTelegramMessage(tg_id, "🚨 <b>অ্যাকাউন্ট সাসপেন্ডেড!</b>\n\nআমাদের সিস্টেম আপনার ডিভাইসে একাধিক টেলিগ্রাম অ্যাকাউন্ট সনাক্ত করেছে। পলিসি অনুযায়ী এক ডিভাইসে একাধিক আইডি চালানো নিষিদ্ধ। আপনার এই অ্যাকাউন্টটি ব্লক করা হলো।");
            return res.json({ success: false, message: '❌ এই ডিভাইস থেকে অলরেডি অন্য অ্যাকাউন্ট ভেরিফাই করা হয়েছে! আপনার এই অ্যাকাউন্টটি ব্লক করা হবে।' });
        }

        // ৩. সব ঠিক থাকলে ডাটাবেজে নতুন এন্ট্রি সেভ করা
        await supabase.from('verifications').insert([{ telegram_id: tg_id, device_id: device_id }]);

        // ✅ সফল ভেরিফিকেশনের সিগন্যাল সরাসরি টেলিগ্রাম এপিআই দিয়ে পাঠানো
        await sendTelegramMessage(tg_id, "✅ <b>অভিনন্দন!</b> আপনার ডিভাইস সফলভাবে ভেরিফাইড হয়েছে। এখন আপনি বটের সব ফিচার ব্যবহার করতে পারবেন।");
        return res.json({ success: true, message: '🎉 অভিনন্দন! আপনার ডিভাইস সফলভাবে ভেরিফাইড হয়েছে।' });

    } catch (err) {
        return res.status(500).json({ success: false, message: 'সার্ভার ত্রুটি (Server Error)' });
    }
};

// সরাসরি টেলিগ্রাম বটের মাধ্যমে মেসেজ পাঠানোর ফাংশন
async function sendTelegramMessage(chat_id, text) {
    const BOT_TOKEN = process.env.BOT_TOKEN; // আপনার বটের ওরিজিনাল টোকেন (যেমন: 123456:ABC-DEF...)
    if (!BOT_TOKEN) return;
    
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
    try {
        await axios.post(url, {
            chat_id: chat_id,
            text: text,
            parse_mode: "HTML"
        });
    } catch (e) {
        console.log("Telegram API delivery failed:", e.message);
    }
}
