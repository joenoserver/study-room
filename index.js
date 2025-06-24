// LINE Bot + ガチャコード + スプレッドシート連携
require('dotenv').config();
const express = require('express');
const { google } = require('googleapis');
const line = require('@line/bot-sdk');
const dayjs = require('dayjs');

const app = express();
app.use(express.json());

// LINE設定
const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};
const client = new line.Client(config);

// Google Sheets認証
const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON),
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({ version: 'v4', auth });
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

// LINE webhookエンドポイント
app.post('/webhook', line.middleware(config), async (req, res) => {
  try {
    const events = req.body.events;
    const results = await Promise.all(events.map(handleEvent));
    res.json(results);
  } catch (err) {
    console.error('LINE Webhook Error:', err);
    res.status(500).end();
  }
});

// 入室・退出処理
async function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') return null;
  const userId = event.source.userId;
  const message = event.message.text.trim();
  const today = dayjs().format('YYYY-MM-DD');

  if (/^\d{4}$/.test(message)) {
    // ガチャコード入力→入室処理
    const code = message;
    const isUsed = await checkIfAlreadyEntered(userId, today);
    if (isUsed) {
      return reply(event.replyToken, '今日はすでに入室済みです。');
    }
    await appendEntry(userId, code, today, '入室');
    return reply(event.replyToken, '入室が確認されました。ドア暗証番号は「5489」です。');

  } else if (message === '退出') {
    const canExit = await checkIfEntered(userId, today);
    if (!canExit) {
      return reply(event.replyToken, '本日はまだ入室していません。');
    }
    const exited = await checkIfExited(userId, today);
    if (exited) {
      return reply(event.replyToken, '今日はすでに退出済みです。');
    }
    await appendEntry(userId, '', today, '退出');
    return reply(event.replyToken, '退出が確認されました。ご利用ありがとうございました。');
  }

  return reply(event.replyToken, '4桁の入室コードまたは「退出」と送ってください。');
}

// 入室・退出記録追加
async function appendEntry(userId, code, date, status) {
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: 'ログ!A:D',
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[userId, code, date, status]]
    },
  });
}

// 入室確認
async function checkIfAlreadyEntered(userId, date) {
  const rows = await getSheetRows();
  return rows.some(row => row[0] === userId && row[2] === date && row[3] === '入室');
}
async function checkIfEntered(userId, date) {
  const rows = await getSheetRows();
  return rows.some(row => row[0] === userId && row[2] === date && row[3] === '入室');
}
async function checkIfExited(userId, date) {
  const rows = await getSheetRows();
  return rows.some(row => row[0] === userId && row[2] === date && row[3] === '退出');
}

async function getSheetRows() {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: 'ログ!A:D',
  });
  return res.data.values || [];
}

function reply(token, text) {
  return client.replyMessage(token, { type: 'text', text });
}

// サーバー起動
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

