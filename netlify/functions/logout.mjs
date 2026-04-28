import {
  parseCookies,
  sessionsStore,
  sessionCookie,
  json,
} from "./_shared.mjs";

export default async (req) => {
  if (req.method !== "POST") {
    return json({ error: "Метод не поддерживается" }, { status: 405 });
  }

  const cookies = parseCookies(req.headers.get("cookie"));
  const token = cookies.session;
  if (token) {
    await sessionsStore().delete(token);
  }

  return json(
    { ok: true },
    { headers: { "set-cookie": sessionCookie("", 0) } },
  );
};
