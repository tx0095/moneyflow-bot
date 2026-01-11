require('dotenv').config()
const TelegramBot = require('node-telegram-bot-api')
const { google } = require('googleapis')
const path = require('path')
const express = require('express')

// ===== EXPRESS SERVER =====
const app = express()
const PORT = process.env.PORT || 3000
app.get('/', (req, res) => res.send('Finance Bot running...'))
app.listen(PORT, () => console.log(`Server running on ${PORT}`))

// ===== TELEGRAM BOT =====
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true })

// ===== GOOGLE SHEETS =====
const auth = new google.auth.GoogleAuth({
  keyFile: path.join(__dirname, 'credentials.json'), // File di Render, jangan commit
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
})
const sheets = google.sheets({ version: 'v4', auth })

// ===== HELPER =====
function parseMessageSmart(msg) {
  const lower = msg.toLowerCase()
  let type = 'Pengeluaran'
  if (lower.includes('terima') || lower.includes('gaji') || lower.includes('jual')) {
    type = 'Pemasukan'
  }

  const numbers = msg.match(/\d+(\.\d+)?/g)
  if (!numbers) return null
  const amount = parseFloat(numbers[numbers.length - 1])

  const description = msg.replace(numbers[numbers.length - 1], '').trim()

  return { type, amount, description }
}

function formatNTD(amount) {
  return `NT$${amount.toLocaleString('zh-TW')}`
}

// ===== BOT LISTEN =====
bot.on('message', async (msg) => {
  const chatId = msg.chat.id
  const username = msg.from.username || msg.from.first_name || '-'
  const text = msg.text || ''

  try {
    const data = parseMessageSmart(text)
    if (!data) {
      bot.sendMessage(chatId, 
        "Format tidak terdeteksi ❌\nContoh pesan:\n- beli beras 12000\n- terima gaji 5000000\n- jual produk 250000"
      )
      return
    }

    const { type, amount, description } = data

    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: `${process.env.SHEET_NAME}!A:E`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[
          new Date().toLocaleString(),
          chatId,
          username,
          type,
          amount,
          description
        ]],
      },
    })

    bot.sendMessage(chatId, `✅ Laporan tercatat:\nType: ${type}\nNominal: ${formatNTD(amount)}\nDeskripsi: ${description}`)

  } catch (err) {
    console.error(err)
    bot.sendMessage(chatId, "❌ Terjadi error, coba lagi nanti.")
  }
})

