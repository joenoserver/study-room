require('dotenv').config(); // ← 必ず一番上に書く！

const express = require('express');
const line = require('@line/bot-sdk');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
require('dotenv').config();

const app = express();

const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

const client = new line.Client(config);

// ✅ Stripe Webhook (生ボディが必要なので bodyParser不要)
app.post('/stripe-webhook', express.raw({ type: 'application/json' }), (req, res) => {
  // Stripeの処理
});

// ✅ LINE Webhook（middlewareに raw bodyが必要）
app.post('/webhook', line.middleware(config), async (req, res) => {
  Promise
    .all(req.body.events.map(handleEvent))
    .then(result => res.json(result))
    .catch(err => {
      console.error('LINE Webhook Error:', err);
      res.status(500).end();
    });
});

// 🔹LINEイベント処理
async function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') return null;

  const text = event.message.text.trim();

  if (text === '入室') {
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: 'こちらから決済をお願いします：https://your-stripe-checkout.com',
    });
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
