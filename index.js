// 必ず一番上に記述
require('dotenv').config();

const express = require('express');
const line = require('@line/bot-sdk');
const { google } = require('googleapis');
const fs = require('fs');
const dayjs = require('dayjs');

const app = express();
app.use(express.json());

// LINE Bot設定
const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};
const client = new line.Client(config);

// Google Sheets設定
const auth = new google.auth.GoogleAuth({
  keyFile: 'credentials.json',
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const spreadsheetId = process.env.SHEET_ID;

// 定数
const MAX_PEOPLE = 12;
const VALID_CODE = '1111';

// Google Sheets操作関数
async function logEvent(userId, action) {
  const authClient = await auth.getClient();
  const sheets = google.sheets({ version: 'v4', auth: authClient });
  const today = dayjs().format('YYYY-MM-DD');
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: 'ログ!A:D',
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[userId, action, today, new Date().toLocaleTimeString()]],
    },
  });
}

async function countEntries() {
  const authClient = await auth.getClient();
  const sheets = google.sheets({ version: 'v4', auth: authClient });
  const today = dayjs().format('YYYY-MM-DD');
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'ログ!A:C',
  });
  const values = res.data.values || [];
  return values.filter(row => row[1] === '入室' && row[2] === today).length;
}

async function hasAlreadyEntered(userId) {
  const authClient = await auth.getClient();
  const sheets = google.sheets({ version: 'v4', auth: authClient });
  const today = dayjs().format('YYYY-MM-DD');
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'ログ!A:C',
  });
  const values = res.data.values || [];
  return values.some(row => row[0] === userId && row[1] === '入室' && row[2] === today);
}

async function hasAlreadyExited(userId) {
  const authClient = await auth.getClient();
  const sheets = google.sheets({ version: 'v4', auth: authClient });
  const today = dayjs().format('YYYY-MM-DD');
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'ログ!A:C',
  });
  const values = res.data.values || [];
  return values.some(row => row[0] === userId && row[1] === '退出' && row[2] === today);
}

// LINE Webhook受信
app.post('/webhook', line.middleware(config), async (req, res) => {
  const events = req.body.events;
  await Promise.all(events.map(handleEvent));
  res.sendStatus(200);
});

// LINEイベント処理
async function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') return;
  const userId = event.source.userId;
  const message = event.message.text.trim();

  if (message === '退出') {
    if (await hasAlreadyExited(userId)) {
      return client.replyMessage(event.replyToken, { type: 'text', text: '今日はすでに退出しています。' });
    }
    if (!(await hasAlreadyEntered(userId))) {
      return client.replyMessage(event.replyToken, { type: 'text', text: 'まず入室してください。' });
    }
    await logEvent(userId, '退出');
    return client.replyMessage(event.replyToken, { type: 'text', text: '退出を記録しました。ありがとうございました。' });
  }

  if (message === VALID_CODE) {
    const already = await hasAlreadyEntered(userId);
    if (already) {
      return client.replyMessage(event.replyToken, { type: 'text', text: '今日はすでに入室しています。' });
    }
    const count = await countEntries();
    if (count >= MAX_PEOPLE) {
      return client.replyMessage(event.replyToken, { type: 'text', text: '現在満室です。ご利用いただけません。' });
    }
    await logEvent(userId, '入室');
    return client.replyMessage(event.replyToken, { type: 'text', text: '入室が完了しました。ご利用ありがとうございます。' });
  }

  return client.replyMessage(event.replyToken, {
    type: 'text',
    text: '入室するにはガチャガチャで配布された番号を送ってください。退出するには「退出」と送ってください。',
  });
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

