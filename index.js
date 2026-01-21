require('dotenv').config()
const TelegramBot = require('node-telegram-bot-api')
const { google } = require('googleapis')
const express = require('express')
const path = require('path')
const fs = require('fs')

// ===== EXPRESS SERVER =====
const app = express()
const PORT = process.env.PORT || 10000
app.get('/', (_, res) => res.send('Finance Bot running...'))
app.listen(PORT, () => console.log(`Server running on port ${PORT}`))

// ===== TELEGRAM BOT =====
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true })

// ===== GOOGLE AUTH =====
const CRED_PATH = process.env.GOOGLE_CREDENTIALS_PATH || path.join(__dirname, 'credentials.json')

if (!fs.existsSync(CRED_PATH)) {
  console.error('❌ credentials.json tidak ditemukan')
  process.exit(1)
}

const auth = new google.auth.GoogleAuth({
  keyFile: CRED_PATH,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
})

const sheets = google.sheets({ version: 'v4', auth })

// ===== PARSER =====
function parseMessage(text) {
  const lower = text.toLowerCase()
  let type = 'Pengeluaran'
  if (lower.includes('gaji') || lower.includes('jual') || lower.includes('terima')) {
    type = 'Pendapatan'
  }

  const match = text.match(/(\d+)/)
  if (!match) return null

  const amount = Number(match[1])
  const description = text.replace(match[1], '').trim()
  return { type, amount, description }
}
async function getMonthlyReport() {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: `${process.env.SHEET_NAME}!A2:D`,
  })

  const rows = res.data.values || []
  const now = new Date()
  const currentMonth = now.getMonth()
  const currentYear = now.getFullYear()

  let income = 0
  let expense = 0

  rows.forEach(row => {
    if (!row[0] || !row[1] || !row[2]) return

    const date = new Date(row[0])
    if (date.getMonth() !== currentMonth || date.getFullYear() !== currentYear) return

    const type = row[1].toLowerCase()
    const amount = Number(row[2]) || 0

    if (type.includes('pendapatan')) income += amount
    if (type.includes('pengeluaran')) expense += amount
  })

  return { income, expense }
}


// ===== BOT LISTENER =====
bot.on('message', async (msg) => {
  const chatId = msg.chat.id
  bot.onText(/\/rekap/, async (msg) => {
  const chatId = msg.chat.id

  try {
    const { income, expense } = await getMonthlyReport()
    const balance = income - expense

    const monthName = new Date().toLocaleString('id-ID', { month: 'long', year: 'numeric' })

    bot.sendMessage(chatId,
      `📊 Rekap ${monthName}\n\n` +
      `💰 Pendapatan : NT$${income.toLocaleString()}\n` +
      `💸 Pengeluaran: NT$${expense.toLocaleString()}\n` +
      `━━━━━━━━━━━━━━\n` +
      `📈 Saldo      : NT$${balance.toLocaleString()}`
    )

  } catch (err) {
    console.error(err)
    bot.sendMessage(chatId, '❌ Gagal mengambil rekap bulanan')
  }
})

  const text = msg.text || ''
  const data = parseMessage(text)

  if (!data) {
    return bot.sendMessage(chatId, '❌ Format salah\nContoh: beli beras 1200')
  }

  try {
    // 1️⃣ APPEND DATA
    const appendRes = await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: `${process.env.SHEET_NAME}!A:D`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[
          new Date().toLocaleDateString('id-ID'),
          data.type,
          data.amount,
          data.description
        ]]
      }
    })

    // 2️⃣ AMBIL ROW YANG BARU DITAMBAHKAN
    const updatedRange = appendRes.data.updates.updatedRange
    const rowNumber = Number(updatedRange.match(/\d+/)[0]) - 1

    // 3️⃣ SET ALIGN CENTER
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: process.env.SPREADSHEET_ID,
      requestBody: {
        requests: [{
          repeatCell: {
            range: {
              sheetId: 0, // sheet pertama
              startRowIndex: rowNumber,
              endRowIndex: rowNumber + 1,
              startColumnIndex: 0,
              endColumnIndex: 3
            },
            cell: {
              userEnteredFormat: {
                horizontalAlignment: 'CENTER',
                verticalAlignment: 'MIDDLE'
              }
            },
            fields: 'userEnteredFormat(horizontalAlignment,verticalAlignment)'
          }
        }]
      }
    })

    bot.sendMessage(chatId, '✅ Data tercatat & dirapikan (center)')

  } catch (err) {
    console.error(err)
    bot.sendMessage(chatId, '❌ Gagal mencatat ke Google Sheet')
  }
})
