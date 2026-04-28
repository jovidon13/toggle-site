import { requireSession, stateStore, json } from "./_shared.mjs";

export default async (req) => {
  const auth = await requireSession(req);
  if (auth.error) return auth.error;

  const state = (await stateStore().get("current", { type: "json" })) ?? {
    isOn: false,
    lastChangedBy: null,
    lastChangedAt: null,
  };

  return json(state);
};
