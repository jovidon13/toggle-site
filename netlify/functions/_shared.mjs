import { getStore } from "@netlify/blobs";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SESSION_TTL_SEC = 7 * 24 * 60 * 60;

export function usersStore() {
  return getStore("users");
}
export function stateStore() {
  return getStore("state");
}
export function sessionsStore() {
  return getStore("sessions");
}
export function subscribersStore() {
  return getStore("subscribers");
}

export function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    status: init.status ?? 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...(init.headers ?? {}),
    },
  });
}

export function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const pair of header.split(";")) {
    const idx = pair.indexOf("=");
    if (idx > 0) {
      out[pair.slice(0, idx).trim()] = decodeURIComponent(
        pair.slice(idx + 1).trim(),
      );
    }
  }
  return out;
}

export function sessionCookie(token, maxAgeSec) {
  const isProd = process.env.CONTEXT && process.env.CONTEXT !== "dev";
  const attrs = [
    `session=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
  ];
  if (isProd) attrs.push("Secure");
  if (maxAgeSec !== undefined) attrs.push(`Max-Age=${maxAgeSec}`);
  return attrs.join("; ");
}

export async function ensureBootstrapAdmin() {
  const users = usersStore();
  const list = await users.list();
  if (list.blobs.length > 0) return;

  const login = process.env.ADMIN_LOGIN;
  const pass = process.env.ADMIN_INITIAL_PASS;
  if (!login || !pass) return;

  const passwordHash = await bcrypt.hash(pass, 10);
  await users.setJSON(login, {
    passwordHash,
    role: "admin",
    createdAt: new Date().toISOString(),
  });
}

export async function getSession(req) {
  const cookies = parseCookies(req.headers.get("cookie"));
  const token = cookies.session;
  if (!token) return null;

  const session = await sessionsStore().get(token, { type: "json" });
  if (!session) return null;

  if (Date.now() > session.expiresAt) {
    await sessionsStore().delete(token);
    return null;
  }

  const user = await usersStore().get(session.login, { type: "json" });
  if (!user) {
    await sessionsStore().delete(token);
    return null;
  }
  if (user.role !== session.role) {
    session.role = user.role;
  }

  return { ...session, token };
}

export async function requireSession(req) {
  const session = await getSession(req);
  if (!session) {
    return { error: json({ error: "Не авторизован" }, { status: 401 }) };
  }
  return { session };
}

export async function requireAdmin(req) {
  const result = await requireSession(req);
  if (result.error) return result;
  if (result.session.role !== "admin") {
    return {
      error: json({ error: "Доступ только для админа" }, { status: 403 }),
    };
  }
  return result;
}

export async function createSession(login, role) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = Date.now() + SESSION_TTL_MS;
  await sessionsStore().setJSON(token, { login, role, expiresAt });
  return { token, maxAgeSec: SESSION_TTL_SEC };
}

export async function invalidateUserSessions(login) {
  const store = sessionsStore();
  const { blobs } = await store.list();
  for (const { key } of blobs) {
    const sess = await store.get(key, { type: "json" });
    if (sess?.login === login) {
      await store.delete(key);
    }
  }
}

export async function listUsers() {
  const store = usersStore();
  const { blobs } = await store.list();
  const users = await Promise.all(
    blobs.map(async ({ key }) => {
      const u = await store.get(key, { type: "json" });
      return {
        login: key,
        role: u?.role ?? "user",
        createdAt: u?.createdAt ?? null,
      };
    }),
  );
  users.sort((a, b) => a.login.localeCompare(b.login));
  return users;
}

export { bcrypt };
