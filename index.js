// 必要なモジュールを読み込み
require('dotenv').config();
const express = require('express');
const line = require('@line/bot-sdk');
const { google } = require('googleapis');
const fs = require('fs');

const app = express();

// LINE設定
const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};
const client = new line.Client(config);

// Google Sheets 認証
const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(fs.readFileSync('credentials.json', 'utf-8')),
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({ version: 'v4', auth });

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const SHEET_NAME = 'Log';
const MAX_CAPACITY = 12;

// ガチャで発行済み＆未使用のコード（例）
let validCodes = ['A1B2C3D4', 'E5F6G7H8', 'I9J0K1L2'];
let usedCodes = [];

// LINE webhook
app.post('/webhook', line.middleware(config), async (req, res) => {
  try {
    const events = req.body.events;
    for (const event of events) {
      if (event.type === 'message' && event.message.type === 'text') {
        await handleMessage(event);
      }
    }
    res.status(200).end();
  } catch (err) {
    console.error('Webhook Error:', err);
    res.status(500).end();
  }
});

// メイン処理
async function handleMessage(event) {
  const userId = event.source.userId;
  const messageText = event.message.text.trim();
  const today = new Date().toLocaleDateString('ja-JP');

  if (messageText === '入室') {
    return reply(event.replyToken, 'ガチャで取得したコードを送信してください。');
  }

  // 入室コードとみなす
  const code = messageText;

  // コードが有効か確認
  if (!validCodes.includes(code)) {
    return reply(event.replyToken, 'そのコードは無効です。ガチャから新しいコードを取得してください。');
  }

  // すでにそのコードを使ったか確認
  if (usedCodes.includes(code)) {
    return reply(event.replyToken, 'このコードはすでに使用済みです。');
  }

  // スプレッドシートから今日の入室履歴を取得
  const entries = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!A:D`,
  });

  const rows = entries.data.values || [];
  const todayUserEntries = rows.filter(row => row[0] === today && row[1] === userId);
  const currentCount = rows.filter(row => row[0] === today).length;

  if (todayUserEntries.length > 0) {
    return reply(event.replyToken, '本日はすでに入室済みです。');
  }

  if (currentCount >= MAX_CAPACITY) {
    return reply(event.replyToken, '満室です。空きが出るまでお待ちください。');
  }

  // 入室を記録
  const now = new Date().toLocaleTimeString('ja-JP');
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!A:D`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[today, userId, code, now]],
    },
  });

  usedCodes.push(code);
  return reply(event.replyToken, '入室を確認しました。ようこそ！');
}

function reply(token, text) {
  return client.replyMessage(token, {
    type: 'text',
    text,
  });
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
