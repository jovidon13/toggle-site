import {
  requireAdmin,
  usersStore,
  invalidateUserSessions,
  listUsers,
  json,
  bcrypt,
} from "./_shared.mjs";

export default async (req) => {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  const url = new URL(req.url);
  const targetLogin = url.searchParams.get("login");

  if (req.method === "GET") {
    return json({
      users: await listUsers(),
      currentUser: auth.session.login,
    });
  }

  if (req.method === "POST") {
    let body;
    try {
      body = await req.json();
    } catch {
      return json({ error: "Неверный формат запроса" }, { status: 400 });
    }

    const login = String(body.login ?? "").trim();
    const password = String(body.password ?? "");
    const role = body.role === "admin" ? "admin" : "user";

    if (!login || !password) {
      return json({ error: "Логин и пароль обязательны" }, { status: 400 });
    }
    if (login.length < 3) {
      return json({ error: "Логин минимум 3 символа" }, { status: 400 });
    }
    if (password.length < 4) {
      return json({ error: "Пароль минимум 4 символа" }, { status: 400 });
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(login)) {
      return json(
        { error: "Логин: только латиница, цифры, _ и -" },
        { status: 400 },
      );
    }

    const store = usersStore();
    const existing = await store.get(login, { type: "json" });
    if (existing) {
      return json({ error: "Пользователь уже существует" }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await store.setJSON(login, {
      passwordHash,
      role,
      createdAt: new Date().toISOString(),
    });

    return json({ login, role });
  }

  if (req.method === "PATCH") {
    if (!targetLogin) {
      return json({ error: "Не указан логин" }, { status: 400 });
    }

    const store = usersStore();
    const user = await store.get(targetLogin, { type: "json" });
    if (!user) {
      return json({ error: "Пользователь не найден" }, { status: 404 });
    }

    let body;
    try {
      body = await req.json();
    } catch {
      return json({ error: "Неверный формат запроса" }, { status: 400 });
    }

    let passwordChanged = false;

    if (body.password !== undefined) {
      const password = String(body.password);
      if (password.length < 4) {
        return json({ error: "Пароль минимум 4 символа" }, { status: 400 });
      }
      user.passwordHash = await bcrypt.hash(password, 10);
      passwordChanged = true;
    }

    if (body.role !== undefined) {
      if (body.role !== "admin" && body.role !== "user") {
        return json({ error: "Роль: admin или user" }, { status: 400 });
      }
      if (body.role === "user" && user.role === "admin") {
        const all = await listUsers();
        const adminCount = all.filter((u) => u.role === "admin").length;
        if (adminCount <= 1) {
          return json(
            { error: "Нельзя понизить последнего админа" },
            { status: 400 },
          );
        }
      }
      user.role = body.role;
    }

    await store.setJSON(targetLogin, user);

    if (passwordChanged) {
      await invalidateUserSessions(targetLogin);
    }

    return json({ login: targetLogin, role: user.role });
  }

  if (req.method === "DELETE") {
    if (!targetLogin) {
      return json({ error: "Не указан логин" }, { status: 400 });
    }

    if (targetLogin === auth.session.login) {
      return json({ error: "Нельзя удалить себя" }, { status: 400 });
    }

    const store = usersStore();
    const user = await store.get(targetLogin, { type: "json" });
    if (!user) {
      return json({ error: "Пользователь не найден" }, { status: 404 });
    }

    if (user.role === "admin") {
      const all = await listUsers();
      const adminCount = all.filter((u) => u.role === "admin").length;
      if (adminCount <= 1) {
        return json(
          { error: "Нельзя удалить последнего админа" },
          { status: 400 },
        );
      }
    }

    await store.delete(targetLogin);
    await invalidateUserSessions(targetLogin);

    return json({ ok: true });
  }

  return json({ error: "Метод не поддерживается" }, { status: 405 });
};
