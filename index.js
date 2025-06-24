require('dotenv').config(); // ← 必ず一番上に書く！

const express = require('express');
const line = require('@line/bot-sdk');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();

const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

const client = new line.Client(config);

// ✅ Stripe Webhook（必要なら後で実装）
app.post('/stripe-webhook', express.raw({ type: 'application/json' }), (req, res) => {
  // StripeのWebhook用（未使用なら空でOK）
  res.sendStatus(200);
});

// ✅ LINE Webhook
app.post('/webhook', line.middleware(config), async (req, res) => {
  try {
    const results = await Promise.all(req.body.events.map(handleEvent));
    res.json(results);
  } catch (err) {
    console.error('LINE Webhook Error:', err);
    res.status(500).end();
  }
});

// 🔹 LINEイベント処理
async function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') return null;

  const text = event.message.text.trim();

  if (text === '入室') {
    try {
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        mode: 'payment',
        line_items: [{
          price_data: {
            currency: 'jpy',
            product_data: {
              name: '自習室利用料（1日）',
            },
            unit_amount: 20000, // 200円 = 20000銭（Stripeは1円 = 100単位）
          },
          quantity: 1,
        }],
        success_url: 'https://your-render-app.onrender.com/success',
        cancel_url: 'https://your-render-app.onrender.com/cancel',
      });

      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: `こちらから決済をお願いします：${session.url}`,
      });

    } catch (err) {
      console.error('Stripe Session Error:', err);
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: '決済リンクの生成に失敗しました。もう一度お試しください。',
      });
    }

  } else {
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: '「入室」または「キャンセル」と送ってください。',
    });
  }
}

// ✅ サーバー起動
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

