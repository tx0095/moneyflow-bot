require('dotenv').config()
const TelegramBot = require('node-telegram-bot-api')
const { google } = require('googleapis')
const express = require('express')
const path = require('path')
const fs = require('fs')

// ================== EXPRESS (RENDER) ==================
const app = express()
const PORT = process.env.PORT || 10000
app.get('/', (_, res) => res.send('Bot is running'))
app.listen(PORT, () => console.log(`Server running on ${PORT}`))

// ================== TELEGRAM BOT ==================
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true })

// ================== GOOGLE AUTH ==================
const CRED_PATH =
  process.env.GOOGLE_CREDENTIALS_PATH ||
  path.join(__dirname, 'credentials.json')

if (!fs.existsSync(CRED_PATH)) {
  console.error('❌ credentials.json tidak ditemukan')
  process.exit(1)
}

const auth = new google.auth.GoogleAuth({
  keyFile: CRED_PATH,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
})

const sheets = google.sheets({ version: 'v4', auth })

// ================== MONTH MAP ==================
const MONTH_MAP = {
  januari: 0,
  februari: 1,
  maret: 2,
  april: 3,
  mei: 4,
  juni: 5,
  juli: 6,
  agustus: 7,
  september: 8,
  oktober: 9,
  november: 10,
  desember: 11,
}

// ================== PARSER ==================
function parseMessage(text) {
  const lower = text.toLowerCase()
  let type = 'Pengeluaran'

  if (lower.includes('gaji') || lower.includes('jual') || lower.includes('terima')) {
    type = 'Pendapatan'
  }

  const match = text.match(/(\d+)/)
  if (!match) return null

  return {
    type,
    amount: Number(match[1]),
    description: text.replace(match[1], '').trim(),
  }
}

// ================== APPEND + CENTER FORMAT ==================
async function appendAndCenter(values) {
  const appendRes = await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: `${process.env.SHEET_NAME}!A:D`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [values] },
  })

  const updatedRange = appendRes.data.updates.updatedRange
  const rowIndex = Number(updatedRange.match(/\d+/)[0]) - 1

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: process.env.SPREADSHEET_ID,
    requestBody: {
      requests: [{
        repeatCell: {
          range: {
            sheetId: 0,
            startRowIndex: rowIndex,
            endRowIndex: rowIndex + 1,
            startColumnIndex: 0,
            endColumnIndex: 3,
          },
          cell: {
            userEnteredFormat: {
              horizontalAlignment: 'CENTER',
              verticalAlignment: 'MIDDLE',
            },
          },
          fields: 'userEnteredFormat(horizontalAlignment,verticalAlignment)',
        },
      }],
    },
  })
}

// ================== INPUT HANDLER ==================
bot.on('message', async (msg) => {
  if (msg.text.startsWith('/')) return

  const chatId = msg.chat.id
  const data = parseMessage(msg.text)

  if (!data) {
    return bot.sendMessage(chatId, '❌ Contoh: beli beras 1200')
  }

  try {
    await appendAndCenter([
      new Date().toLocaleDateString('id-ID'),
      data.type,
      data.amount,
      data.description,
    ])

    bot.sendMessage(chatId, '✅ Data berhasil dicatat')
  } catch (err) {
    console.error(err)
    bot.sendMessage(chatId, '❌ Gagal mencatat ke Google Sheet')
  }
})

// ================== REKAP FUNCTION ==================
async function getMonthlyReport(month, year) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: `${process.env.SHEET_NAME}!A2:D`,
  })

  let income = 0
  let expense = 0

  ;(res.data.values || []).forEach(row => {
    if (!row[0] || !row[1] || !row[2]) return
    const d = new Date(row[0])
    if (d.getMonth() !== month || d.getFullYear() !== year) return

    const amount = Number(row[2]) || 0
    if (row[1].toLowerCase().includes('pendapatan')) income += amount
    if (row[1].toLowerCase().includes('pengeluaran')) expense += amount
  })

  return { income, expense }
}

// ================== /rekap ==================
bot.onText(/\/rekap\s*(.*)?/, async (msg, match) => {
  const chatId = msg.chat.id
  const args = (match[1] || '').toLowerCase().trim().split(' ')

  const monthIndex = MONTH_MAP[args[0]] ?? new Date().getMonth()
  const year = args[1] ? Number(args[1]) : new Date().getFullYear()

  if (args[0] && MONTH_MAP[args[0]] === undefined) {
    return bot.sendMessage(chatId, '❌ Contoh: /rekap januari 2026')
  }

  try {
    const { income, expense } = await getMonthlyReport(monthIndex, year)
    const balance = income - expense

    const label = new Date(year, monthIndex).toLocaleString('id-ID', {
      month: 'long',
      year: 'numeric',
    })

    bot.sendMessage(
      chatId,
      `📊 Rekap ${label}\n\n` +
      `💰 Pendapatan : NT$${income.toLocaleString()}\n` +
      `💸 Pengeluaran: NT$${expense.toLocaleString()}\n` +
      `━━━━━━━━━━━━━━\n` +
      `📈 Saldo      : NT$${balance.toLocaleString()}`
    )
  } catch (err) {
    console.error(err)
    bot.sendMessage(chatId, '❌ Gagal mengambil rekap')
  }
})
