require('dotenv').config()
const TelegramBot = require('node-telegram-bot-api')
const { google } = require('googleapis')
const path = require('path')
const express = require('express')

/* ================= EXPRESS ================= */
const app = express()
const PORT = process.env.PORT || 3000
app.get('/', (req, res) => res.send('MoneyFlow Bot running...'))
app.listen(PORT, () => console.log(`Server running on ${PORT}`))

/* ================= TELEGRAM ================= */
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true })

/* ================= GOOGLE SHEETS ================= */
const auth = new google.auth.GoogleAuth({
  keyFile: path.join(__dirname, 'credentials.json'),
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
})
const sheets = google.sheets({ version: 'v4', auth })

/* ================= PARSER ================= */
function parseMessage(text) {
  const lower = text.toLowerCase()

  let type = 'Pengeluaran'
  if (lower.includes('gaji') || lower.includes('terima') || lower.includes('jual')) {
    type = 'Pemasukan'
  }

  const numberMatch = text.match(/\d+/)
  if (!numberMatch) return null

  const amount = Number(numberMatch[0])
  const description = text.replace(numberMatch[0], '').trim()

  return { type, amount, description }
}

/* ================= BOT LISTENER ================= */
bot.on('message', async (msg) => {
  if (!msg.text) return

  const chatId = msg.chat.id
  const text = msg.text

  const data = parseMessage(text)
  if (!data) {
    return bot.sendMessage(
      chatId,
      `❌ Format salah\n\nContoh:\n- beli beras 1200\n- terima gaji 30000`
    )
  }

  const { type, amount, description } = data

  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: `${process.env.SHEET_NAME}!A:D`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: {
        values: [[
          new Date().toLocaleDateString('zh-TW'), // A Tanggal
          amount,                                 // B Jumlah
          type,                                   // C Tipe
          description                             // D Keterangan
        ]]
      }
    })

    bot.sendMessage(
      chatId,
      `✅ Tercatat\n${type}\nNT$${amount.toLocaleString('zh-TW')}\n${description}`
    )

  } catch (err) {
    console.error(err)
    bot.sendMessage(chatId, '❌ Gagal mencatat ke Google Sheet')
  }
})
