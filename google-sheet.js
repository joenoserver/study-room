const { google } = require('googleapis');
const fs = require('fs');

const auth = new google.auth.GoogleAuth({
  keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_JSON,
  scopes: ['https://www.googleapis.com/auth/spreadsheets']
});

async function getSheet() {
  const client = await auth.getClient();
  return google.sheets({ version: 'v4', auth: client });
}

async function readReservations() {
  const sheets = await getSheet();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: 'reservations!A2:D'
  });
  return res.data.values || [];
}

async function appendReservation(userId, status, timestamp) {
  const sheets = await getSheet();
  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: 'reservations!A:D',
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[userId, status, timestamp, new Date().toISOString()]]
    }
  });
}

module.exports = {
  readReservations,
  appendReservation
};
