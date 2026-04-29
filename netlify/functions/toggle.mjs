import {
  requireSession,
  stateStore,
  subscribersStore,
  json,
} from "./_shared.mjs";

async function broadcast(status, login) {
  const token = process.env.BOT_TOKEN;
  if (!token) return { sent: 0, failed: 0, total: 0 };

  const store = subscribersStore();
  const { blobs } = await store.list();

  const chatIds = new Set(blobs.map((b) => b.key));
  const legacy = process.env.CHAT_ID;
  if (legacy) chatIds.add(String(legacy));

  if (chatIds.size === 0) return { sent: 0, failed: 0, total: 0 };

  const emoji = status === "ON" ? "🟢" : "🔴";
  const time = new Date().toLocaleString("ru-RU", {
    timeZone: "Asia/Dushanbe",
  });
  const text = `${emoji} Статус изменён\n\nСтатус: *${status}*\nПользователь: ${login}\nВремя: ${time}`;

  let sent = 0;
  let failed = 0;

  await Promise.all(
    [...chatIds].map(async (chatId) => {
      try {
        const res = await fetch(
          `https://api.telegram.org/bot${token}/sendMessage`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              chat_id: chatId,
              text,
              parse_mode: "Markdown",
            }),
          },
        );
        const data = await res.json();
        if (data.ok) {
          sent++;
        } else {
          failed++;
          if (
            data.error_code === 403 ||
            data.error_code === 400
          ) {
            await store.delete(chatId).catch(() => {});
          }
        }
      } catch {
        failed++;
      }
    }),
  );

  return { sent, failed, total: chatIds.size };
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

  await store.setJSON("current", next);

  let telegram = { sent: 0, failed: 0, total: 0 };
  try {
    telegram = await broadcast(status, auth.session.login);
  } catch {
    /* swallow — state already saved */
  }

  const telegramOk = telegram.total === 0 || telegram.sent > 0;

  return json({
    ...next,
    telegramOk,
    telegram,
  });
};
