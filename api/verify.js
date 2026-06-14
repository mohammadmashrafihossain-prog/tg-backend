const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

module.exports = async (req, res) => {
    // CORS অনুমোদন করা (যাতে গিটহাব পেজ থেকে রিকোয়েস্ট আসতে পারে)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed' });

    const { tg_id, token, device_id } = req.body;

    // সুপাবেস কানেক্ট করা (ভার্সেল ড্যাশবোর্ড থেকে এনভায়রনমেন্ট ভেরিয়েবল রিড করবে)
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

    try {
        // ১. চেক করা: এই টেলিগ্রাম আইডি আগে থেকেই ভেরিফাইড কি না
        const { data: userExist } = await supabase.from('verifications').select('*').eq('telegram_id', tg_id).single();
        if (userExist) return res.json({ success: true, message: 'আপনি ইতিমধ্যে ভেরিফাইড!' });

        // ২. চেক করা: এই ডিভাইস আইডি দিয়ে অন্য কোনো আইডি খোলা হয়েছে কি না (Multi-Account Detection)
        const { data: deviceExist } = await supabase.from('verifications').select('*').eq('device_id', device_id);
        
        if (deviceExist && deviceExist.length > 0) {
            // 🚨 মাল্টিপল অ্যাকাউন্ট সনাক্ত হয়েছে! Telebot Creator এর Webhook-এ সিগন্যাল পাঠানো
            await sendToBot(tg_id, 'suspend');
            return res.json({ success: false, message: '❌ এই ডিভাইস থেকে অলরেডি অন্য অ্যাকাউন্ট ভেরিফাই করা হয়েছে! আপনার এই অ্যাকাউন্টটি ব্লক করা হবে।' });
        }

        // ৩. সব ঠিক থাকলে ডাটাবেজে নতুন এন্ট্রি সেভ করা
        await supabase.from('verifications').insert([{ telegram_id: tg_id, device_id: device_id }]);

        // ✅ সফল ভেরিফিকেশনের সিগন্যাল বোটে পাঠানো
        await sendToBot(tg_id, 'approve');
        return res.json({ success: true, message: '🎉 অভিনন্দন! আপনার ডিভাইস সফলভাবে ভেরিফাইড হয়েছে।' });

    } catch (err) {
        return res.status(500).json({ success: false, message: '서버 오류 (Server Error)' });
    }
};

// বটের এপিআই এন্ডপয়েন্টে ডেটা পাঠানোর ফাংশন
async function sendToBot(tg_id, action) {
    const BOT_API_URL = process.env.BOT_API_URL; // আপনার Telebot Creator এর API URL
    if (!BOT_API_URL) return;
    try {
        await axios.post(BOT_API_URL, {
            secret: "MY_SECRET_KEY_123",
            telegram_id: tg_id,
            action: action // 'approve' বা 'suspend'
        });
    } catch (e) {
        console.log("Bot delivery failed");
    }
}
