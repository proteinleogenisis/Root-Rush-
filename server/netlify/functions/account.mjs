// Root Rush accounts: username + password, one saved progress blob per user.
// Passwords are stored only as scrypt hashes with a per-user salt. Sessions are random bearer tokens.
import { getStore } from "@netlify/blobs";
import { randomBytes, scrypt as _scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(_scrypt);
const MAX_SAVE_BYTES = 300_000;   // biggest progress save we accept
const MIN_PASSWORD = 6;           // shortest password allowed
const MAX_FAILS = 5;              // wrong passwords in a row before a short lockout
const LOCK_SECONDS = 60;          // how long that lockout lasts

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const cleanName = (u) => String(u || "").trim().toLowerCase();
const validName = (u) => /^[a-z0-9_]{3,20}$/.test(u);
const hash = async (pw, salt) => (await scrypt(String(pw), salt, 64)).toString("hex");

async function newToken(store, user) {
  const t = randomBytes(32).toString("hex");
  await store.setJSON("tokens/" + t, { user, created: Date.now() });
  return t;
}
async function userFromToken(store, t) {
  if (!/^[a-f0-9]{64}$/.test(String(t || ""))) return null;
  const rec = await store.get("tokens/" + t, { type: "json" });
  return rec ? rec.user : null;
}

export default async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json(405, { error: "POST only" });
  const raw = await req.text();
  if (raw.length > MAX_SAVE_BYTES + 2000) return json(413, { error: "Too big" });
  let b;
  try { b = JSON.parse(raw); } catch { return json(400, { error: "Bad request" }); }
  const store = getStore({ name: "rootrush", consistency: "strong" });

  if (b.action === "signup") {
    const u = cleanName(b.user);
    if (!validName(u)) return json(400, { error: "Username: 3 to 20 letters, numbers or _" });
    if (String(b.pass || "").length < MIN_PASSWORD) return json(400, { error: `Password needs at least ${MIN_PASSWORD} characters` });
    if (await store.get("users/" + u)) return json(409, { error: "That username is taken" });
    const salt = randomBytes(16).toString("hex");
    await store.setJSON("users/" + u, { salt, hash: await hash(b.pass, salt), created: Date.now(), fails: 0, lockUntil: 0 });
    if (b.save && typeof b.save === "object") await store.setJSON("saves/" + u, b.save);
    return json(200, { ok: true, user: u, token: await newToken(store, u), save: b.save || null });
  }

  if (b.action === "login") {
    const u = cleanName(b.user);
    const rec = validName(u) ? await store.get("users/" + u, { type: "json" }) : null;
    if (!rec) return json(401, { error: "Wrong username or password" });
    if (rec.lockUntil > Date.now()) return json(429, { error: `Too many tries. Wait ${Math.ceil((rec.lockUntil - Date.now()) / 1000)} seconds` });
    const ok = timingSafeEqual(Buffer.from(await hash(b.pass, rec.salt), "hex"), Buffer.from(rec.hash, "hex"));
    if (!ok) {
      rec.fails = (rec.fails || 0) + 1;
      if (rec.fails >= MAX_FAILS) { rec.fails = 0; rec.lockUntil = Date.now() + LOCK_SECONDS * 1000; }
      await store.setJSON("users/" + u, rec);
      return json(401, { error: "Wrong username or password" });
    }
    if (rec.fails) { rec.fails = 0; await store.setJSON("users/" + u, rec); }
    const save = await store.get("saves/" + u, { type: "json" });
    return json(200, { ok: true, user: u, token: await newToken(store, u), save: save || null });
  }

  const u = await userFromToken(store, b.token);
  if (!u) return json(401, { error: "Signed out. Sign in again" });

  if (b.action === "get") return json(200, { ok: true, user: u, save: (await store.get("saves/" + u, { type: "json" })) || null });
  if (b.action === "put") {
    if (!b.save || typeof b.save !== "object") return json(400, { error: "No save" });
    await store.setJSON("saves/" + u, b.save);
    return json(200, { ok: true });
  }
  if (b.action === "logout") { await store.delete("tokens/" + b.token); return json(200, { ok: true }); }
  return json(400, { error: "Unknown action" });
};

export const config = { path: "/api/account" };
