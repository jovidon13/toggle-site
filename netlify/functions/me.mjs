import { getSession, json, ensureBootstrapAdmin } from "./_shared.mjs";

export default async (req) => {
  await ensureBootstrapAdmin();

  const session = await getSession(req);
  if (!session) return json({ authenticated: false });

  return json({
    authenticated: true,
    login: session.login,
    role: session.role,
  });
};
