import { subscribersStore, json } from "./_shared.mjs";

async function reply(chatId, text) {
  const token = process.env.BOT_TOKEN;
  if (!token) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
  } catch {
    /* ignore */
  }
}

export default async (req) => {
  if (req.method !== "POST") {
    return json({ ok: true });
  }

  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (expectedSecret) {
    const incoming = req.headers.get("x-telegram-bot-api-secret-token");
    if (incoming !== expectedSecret) {
      return json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  let update;
  try {
    update = await req.json();
  } catch {
    return json({ ok: true });
  }

  const message = update.message || update.edited_message;
  const chat = message?.chat;
  if (!chat) return json({ ok: true });

  const chatId = String(chat.id);
  const text = (message.text || "").trim();
  const store = subscribersStore();

  if (text === "/start") {
    await store.setJSON(chatId, {
      chatId,
      type: chat.type,
      firstName: chat.first_name || null,
      lastName: chat.last_name || null,
      username: chat.username || null,
      title: chat.title || null,
      joinedAt: new Date().toISOString(),
    });
    await reply(
      chatId,
      "🟢 Подписка активна.\n\nВы будете получать уведомления об изменении статуса устройства.\n\n/stop — отписаться\n/status — проверить подписку",
    );
  } else if (text === "/stop") {
    await store.delete(chatId);
    await reply(
      chatId,
      "🔴 Вы отписаны.\n\nЧтобы снова получать уведомления — отправьте /start",
    );
  } else if (text === "/status") {
    const sub = await store.get(chatId, { type: "json" });
    if (sub) {
      await reply(chatId, "✓ Вы подписаны на уведомления.");
    } else {
      await reply(
        chatId,
        "Вы не подписаны.\n\nОтправьте /start, чтобы подписаться.",
      );
    }
  } else if (text.startsWith("/")) {
    await reply(
      chatId,
      "Команды:\n/start — подписаться на уведомления\n/stop — отписаться\n/status — проверить подписку",
    );
  }

  return json({ ok: true });
};
