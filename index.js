// 必ず一番上に記述
require('dotenv').config();

const express = require('express');
const line = require('@line/bot-sdk');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { GoogleSpreadsheet } = require('google-spreadsheet');
const fs = require('fs');

const app = express();

// LINE設定
const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};
const client = new line.Client(config);

// LINE webhook
app.post('/webhook', line.middleware(config), async (req, res) => {
  try {
    const results = await Promise.all(req.body.events.map(handleEvent));
    res.json(results);
  } catch (err) {
    console.error('LINE Webhook Error:', err);
    res.status(500).end();
  }
});

// Stripe webhook
app.post('/stripe-webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_ENDPOINT_SECRET);
  } catch (err) {
    console.error('Stripe webhook signature error:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const userId = session.metadata.userId;
    const code = generateCode();

    const allowed = await updateSheetAndCheckCapacity(userId);
    const msg = allowed ? `決済が完了しました。入室用暗証番号: ${code}` : '現在満室です。キャンセル待ちとなります。';

    await client.pushMessage(userId, { type: 'text', text: msg });
  }

  res.json({ received: true });
});

// LINEイベント処理
async function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') return null;
  const text = event.message.text.trim();

  if (text === '入室') {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card', 'google_pay'],
      line_items: [
        {
          price_data: {
            currency: 'jpy',
            product_data: { name: '自習室1日利用券' },
            unit_amount: 200 * 100,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: 'https://example.com/success',
      cancel_url: 'https://example.com/cancel',
      metadata: { userId: event.source.userId },
    });

    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: `こちらから決済をお願いします：${session.url}`,
    });
  } else {
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: '「入室」または「キャンセル」と送ってください。',
    });
  }
}

// 暗証番号生成
function generateCode() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

// スプレッドシート更新・人数チェック
async function updateSheetAndCheckCapacity(userId) {
  const creds = JSON.parse(fs.readFileSync('credentials.json'));
  const doc = new GoogleSpreadsheet(process.env.SHEET_ID);
  await doc.useServiceAccountAuth(creds);
  await doc.loadInfo();
  const sheet = doc.sheetsByIndex[0];

  await sheet.loadCells('A1:A100');
  const rows = await sheet.getRows();
  if (rows.length >= 12) return false; // 満室

  await sheet.addRow({ userId: userId, timestamp: new Date().toISOString() });
  return true;
}

// サーバー起動
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

