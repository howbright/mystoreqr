type TelegramMessageResult =
  | { ok: true }
  | { ok: false; reason: string }

export async function sendTelegramMessage(text: string): Promise<TelegramMessageResult> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim()
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim()

  if (!botToken || !chatId) {
    return { ok: false, reason: "telegram env is not configured" }
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      return { ok: false, reason: `telegram api failed: ${response.status} ${errorText}` }
    }

    return { ok: true }
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : "unknown telegram send failure",
    }
  }
}
