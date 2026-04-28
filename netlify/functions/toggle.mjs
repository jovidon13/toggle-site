import { requireSession, stateStore, json } from "./_shared.mjs";

async function sendTelegram(status, login) {
  const token = process.env.BOT_TOKEN;
  const chatId = process.env.CHAT_ID;
  if (!token || !chatId) return { skipped: true };

  const emoji = status === "ON" ? "🟢" : "🔴";
  const time = new Date().toLocaleString("ru-RU", {
    timeZone: "Asia/Dushanbe",
  });
  const text = `${emoji} Статус изменён\n\nСтатус: *${status}*\nПользователь: ${login}\nВремя: ${time}`;

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "Markdown",
    }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.description || "telegram error");
  return { skipped: false };
}

export default async (req) => {
  if (req.method !== "POST") {
    return json({ error: "Метод не поддерживается" }, { status: 405 });
  }

  const auth = await requireSession(req);
  if (auth.error) return auth.error;

  const store = stateStore();
  const current = (await store.get("current", { type: "json" })) ?? {
    isOn: false,
  };
  const newIsOn = !current.isOn;
  const status = newIsOn ? "ON" : "OFF";

  const next = {
    isOn: newIsOn,
    lastChangedBy: auth.session.login,
    lastChangedAt: new Date().toISOString(),
  };

  let telegramOk = true;
  let telegramError = null;
  try {
    await sendTelegram(status, auth.session.login);
  } catch (err) {
    telegramOk = false;
    telegramError = err.message;
  }

  await store.setJSON("current", next);

  return json({ ...next, telegramOk, telegramError });
};
