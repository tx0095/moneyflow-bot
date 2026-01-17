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

// ===== GOOGLE SHEET AUTH =====
const CRED_PATH = process.env.GOOGLE_CREDENTIALS_PATH || path.join(__dirname, 'credentials.json')

if (!fs.existsSync(CRED_PATH)) {
  console.error(`❌ File credentials.json tidak ditemukan di ${CRED_PATH}`)
  process.exit(1)
}

const auth = new google.auth.GoogleAuth({
  keyFile: CRED_PATH,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
})

const sheets = google.sheets({ version: 'v4', auth })

// ===== HELPER PARSER =====
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

// ===== BOT LISTENER =====
bot.on('message', async (msg) => {
  const chatId = msg.chat.id
  const text = msg.text || ''

  const data = parseMessage(text)
  if (!data) {
    return bot.sendMessage(chatId,
      '❌ Format salah\nContoh:\n- beli beras 1200\n- gaji 30000'
    )
  }

  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: `${process.env.SHEET_NAME}!A1:D1`, // hanya 4 kolom
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[
          new Date().toLocaleDateString('id-ID'), // A: Tanggal
          data.type,                               // B: Tipe
          data.amount,                             // C: Jumlah (NTD)
          data.description                         // D: Keterangan
        ]]
      }
    })

    bot.sendMessage(chatId,
      `✅ Tercatat:\nType: ${data.type}\nNominal: NT$${data.amount.toLocaleString()}\nKeterangan: ${data.description}`
    )

  } catch (err) {
    console.error(err)
    bot.sendMessage(chatId, '❌ Gagal mencatat ke Google Sheet')
  }
})
