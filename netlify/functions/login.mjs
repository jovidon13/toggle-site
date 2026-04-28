import {
  usersStore,
  json,
  ensureBootstrapAdmin,
  createSession,
  sessionCookie,
  bcrypt,
} from "./_shared.mjs";

export default async (req) => {
  if (req.method !== "POST") {
    return json({ error: "Метод не поддерживается" }, { status: 405 });
  }

  await ensureBootstrapAdmin();

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Неверный формат запроса" }, { status: 400 });
  }

  const login = String(body.login ?? "").trim();
  const password = String(body.password ?? "");

  if (!login || !password) {
    return json({ error: "неверный логин или пароль" }, { status: 401 });
  }

  const user = await usersStore().get(login, { type: "json" });
  if (!user) {
    return json({ error: "неверный логин или пароль" }, { status: 401 });
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    return json({ error: "неверный логин или пароль" }, { status: 401 });
  }

  const { token, maxAgeSec } = await createSession(login, user.role);

  return json(
    { login, role: user.role },
    { headers: { "set-cookie": sessionCookie(token, maxAgeSec) } },
  );
};
