// Pølse & Pasta – serveren.
//
// Én Cloudflare Worker som både viser appen (filene i public/) og har et lite API under /api/.
// Alle data ligger i én Durable Object («Hjem») med en SQLite-database:
//   docs   – oppskrifter (links), middager (dinners), plinger (plings) og personer (members)
//   photos – bildene av middagene
//   subs   – telefonene som har slått på varsler
//   meta   – husnøkkelen (bare et hash) og varsel-nøklene (VAPID)
//
// Når noen sender en pling, sender serveren et push-varsel til den andres telefon med en gang.
// Hver halvtime sjekker serveren om hunden har fått mat i dag, og minner dere på det hvis ikke.

const VERSION = 2;
const COLLS = new Set(["members", "links", "dinners", "plings", "feeds", "scores", "quiz", "settings"]);
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_DOC = 64 * 1024;
const MAX_PHOTO = 1900 * 1024;
const MAX_PLINGS = 300;
const PUSH_HOSTS = [/\.push\.apple\.com$/, /^fcm\.googleapis\.com$/, /\.push\.services\.mozilla\.com$/, /^updates\.push\.services\.mozilla\.com$/, /\.notify\.windows\.com$/];
const IMAGE_HOSTS = [/(^|\.)tiktokcdn(-[a-z]+)?\.com$/, /(^|\.)tiktokcdn-us\.com$/, /(^|\.)ttwstatic\.com$/, /(^|\.)ibyteimg\.com$/, /(^|\.)cdninstagram\.com$/, /(^|\.)fbcdn\.net$/];
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"];
const UA_MOBILE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const UA_DESKTOP = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";
const PET_DEFAULTS = { name: "Pølsa", remind: { on: true, first: "18:00", last: "21:30" } };

const hjem = (env) => env.HJEM.get(env.HJEM.idFromName("hjem"));

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) return hjem(env).fetch(request);
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response("Ikke funnet", { status: 404 });
  },
  // Cron (se wrangler.toml): hver halvtime. Påminnelsen om å mate hunden sendes herfra.
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(hjem(env).fetch("https://hjem.internal/_cron", { method: "POST", headers: { "X-Time": String(controller.scheduledTime || Date.now()) } }));
  }
};

/* ---------- time in Norway ---------- */
export function osloParts(ts) {
  const parts = {};
  for (const p of new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Oslo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(ts))) parts[p.type] = p.value;
  return { date: parts.year + "-" + parts.month + "-" + parts.day, hh: Number(parts.hour), mm: Number(parts.minute) };
}
export function addDays(date, n) {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

/* ---------- video previews (TikTok via oEmbed, Instagram via the public embed page) ---------- */
async function fetchT(url, opts = {}, ms = 7000) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try { return await fetch(url, Object.assign({}, opts, { signal: c.signal })); } finally { clearTimeout(t); }
}
const decodeHtml = (s) => String(s || "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#(\d+);/g, (m, n) => String.fromCharCode(Number(n)));
export function tiktokId(url) { const m = /\/video\/(\d{6,25})/.exec(url || ""); return m ? m[1] : null; }
export function instagramRef(url) {
  const m = /instagram\.com\/(?:[A-Za-z0-9_.]+\/)?(reels?|p|tv)\/([A-Za-z0-9_-]{5,40})/.exec(url || "");
  return m ? { kind: m[1] === "p" ? "p" : m[1] === "tv" ? "tv" : "reel", code: m[2] } : null;
}
export function parseInstagram(html) {
  html = String(html || "");
  let thumb = null, author = null, title = null;
  const img = /<img[^>]*class="[^"]*EmbeddedMediaImage[^"]*"[^>]*>/.exec(html);
  if (img) { const s = /\ssrc="([^"]+)"/.exec(img[0]); if (s) thumb = decodeHtml(s[1]); }
  if (!thumb) {
    const d = /"(?:display_url|thumbnail_src)"\s*:\s*"((?:[^"\\]|\\.)+)"/.exec(html);
    if (d) { try { thumb = JSON.parse('"' + d[1] + '"'); } catch (e) {} }
  }
  if (!thumb) {
    const og = /<meta[^>]+property="og:image"[^>]+content="([^"]+)"/.exec(html) || /<meta[^>]+content="([^"]+)"[^>]+property="og:image"/.exec(html);
    if (og) thumb = decodeHtml(og[1]);
  }
  const u = /class="UsernameText"[^>]*>([^<]{1,60})</.exec(html) || /"username"\s*:\s*"([A-Za-z0-9_.]{1,40})"/.exec(html);
  if (u) author = decodeHtml(u[1]).trim();
  const cap = /<div class="Caption">([\s\S]{0,4000}?)<div class="CaptionComments">/.exec(html);
  if (cap) title = decodeHtml(cap[1].replace(/<a[^>]*class="CaptionUsername"[^>]*>[\s\S]*?<\/a>/, "").replace(/<br\s*\/?>/g, " ").replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
  if (!title) {
    const ogt = /<meta[^>]+property="og:title"[^>]+content="([^"]+)"/.exec(html);
    if (ogt) { title = decodeHtml(ogt[1]); const q = /[:]\s*["“](.+)["”]\s*$/.exec(title); if (q) title = q[1]; }
  }
  return { thumb, author, title };
}
async function tiktokPreview(href) {
  let canonical = href;
  if (!tiktokId(href)) {
    try { const r = await fetchT(href, { redirect: "follow", headers: { "User-Agent": UA_MOBILE } }); if (r.url) canonical = r.url; } catch (e) {}
  }
  try { const c = new URL(canonical); c.search = ""; c.hash = ""; canonical = c.href; } catch (e) {}
  const id = tiktokId(canonical);
  const embed = id ? "https://www.tiktok.com/embed/v2/" + id : null;
  let r;
  try { r = await fetchT("https://www.tiktok.com/oembed?url=" + encodeURIComponent(canonical), { headers: { "User-Agent": UA_DESKTOP, Accept: "application/json" } }); }
  catch (e) { return embed ? { canonical, embed } : null; }
  if (!r.ok) return embed ? { canonical, embed } : null;
  const j = await r.json().catch(() => ({}));
  return { title: j.title || "", author: j.author_name || "", thumb: j.thumbnail_url || null, canonical, embed };
}
async function instagramPreview(href) {
  const ref = instagramRef(href);
  if (!ref) return null;
  const base = "https://www.instagram.com/" + ref.kind + "/" + ref.code + "/";
  const out = { canonical: base, embed: base + "embed" };
  const tries = [[base + "embed/captioned/", UA_DESKTOP], [base, "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)"]];
  for (const [u, ua] of tries) {
    try {
      const r = await fetchT(u, { headers: { "User-Agent": ua, Accept: "text/html" } });
      if (!r.ok) continue;
      const p = parseInstagram(await r.text());
      if (p.thumb) out.thumb = out.thumb || p.thumb;
      if (p.author) out.author = out.author || p.author;
      if (p.title) out.title = out.title || p.title;
      if (out.thumb) break;
    } catch (e) {}
  }
  return out;
}

/* ---------- small helpers ---------- */
const enc = new TextEncoder();
const json = (data, status = 200, extra) => new Response(JSON.stringify(data), {
  status,
  headers: Object.assign({ "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }, extra || {})
});
const fail = (status, code, message) => json({ ok: false, code, message }, status);

export function b64u(buf) {
  const u = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export function fromB64u(str) {
  let s = String(str).replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}
function concat(...parts) {
  const arrs = parts.map((p) => (p instanceof Uint8Array ? p : new Uint8Array(p)));
  const out = new Uint8Array(arrs.reduce((n, a) => n + a.length, 0));
  let o = 0;
  for (const a of arrs) { out.set(a, o); o += a.length; }
  return out;
}
async function sha256hex(s) {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(s)));
  return [...d].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function randomId(n = 22) {
  const abc = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const r = crypto.getRandomValues(new Uint8Array(n));
  let s = "";
  for (let i = 0; i < n; i++) s += abc[r[i] % abc.length];
  return s;
}
function isObj(v) { return v !== null && typeof v === "object" && !Array.isArray(v); }
export function deepMerge(base, patch) {
  const out = isObj(base) ? Object.assign({}, base) : {};
  for (const [k, v] of Object.entries(patch || {})) {
    out[k] = isObj(v) && isObj(out[k]) ? deepMerge(out[k], v) : v;
  }
  return out;
}
function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/* ---------- Web Push (RFC 8291 aes128gcm + RFC 8292 VAPID) with WebCrypto ---------- */
async function hmac(key, data) {
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, data));
}

/** Encrypts one push message for one subscription. opts.salt / opts.asJwk exist only for tests. */
export async function encryptPayload(plaintext, p256dh, auth, opts = {}) {
  const uaPublic = fromB64u(p256dh);
  const authSecret = fromB64u(auth);
  if (uaPublic.length !== 65 || uaPublic[0] !== 4) throw new Error("bad p256dh");
  const salt = opts.salt || crypto.getRandomValues(new Uint8Array(16));
  let asPrivate, asPublic;
  if (opts.asJwk) {
    asPrivate = await crypto.subtle.importKey("jwk", opts.asJwk, { name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]);
    asPublic = concat([4], fromB64u(opts.asJwk.x), fromB64u(opts.asJwk.y));
  } else {
    const pair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
    asPrivate = pair.privateKey;
    asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  }
  const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, asPrivate, 256));

  const prkKey = await hmac(authSecret, shared);
  const ikm = await hmac(prkKey, concat(enc.encode("WebPush: info\0"), uaPublic, asPublic, [1]));
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, concat(enc.encode("Content-Encoding: aes128gcm\0"), [1]))).slice(0, 16);
  const nonce = (await hmac(prk, concat(enc.encode("Content-Encoding: nonce\0"), [1]))).slice(0, 12);

  const aesKey = await crypto.subtle.importKey("raw", cek, { name: "AES-GCM" }, false, ["encrypt"]);
  const body = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aesKey, concat(enc.encode(plaintext), [2])));
  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096);
  return concat(salt, rs, [asPublic.length], asPublic, body);
}

export async function vapidHeader(endpoint, vapid, subject) {
  const header = b64u(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64u(enc.encode(JSON.stringify({
    aud: new URL(endpoint).origin,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: subject
  })));
  const unsigned = header + "." + claims;
  const key = await crypto.subtle.importKey("jwk", vapid.privateJwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(unsigned)));
  return "vapid t=" + unsigned + "." + b64u(sig) + ", k=" + vapid.publicKey;
}

export async function sendPush(sub, payload, vapid, subject) {
  const body = await encryptPayload(JSON.stringify(payload), sub.p256dh, sub.auth);
  try {
    const res = await fetch(sub.endpoint, {
      method: "POST",
      headers: {
        Authorization: await vapidHeader(sub.endpoint, vapid, subject),
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        TTL: "43200",
        Urgency: "high"
      },
      body
    });
    const text = res.ok ? "" : (await res.text().catch(() => "")).slice(0, 300);
    return { status: res.status, ok: res.ok, text };
  } catch (e) {
    return { status: 0, ok: false, text: String(e && e.message || e) };
  }
}

function okEndpoint(endpoint, allowLocal) {
  try {
    const u = new URL(endpoint);
    if (allowLocal && (u.hostname === "localhost" || u.hostname === "127.0.0.1")) return true;
    return u.protocol === "https:" && PUSH_HOSTS.some((re) => re.test(u.hostname));
  } catch (e) { return false; }
}

/* ---------- the Durable Object ---------- */
export class Hjem {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env || {};
    this.sql = ctx.storage.sql;
    this.sql.exec("CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT)");
    this.sql.exec("CREATE TABLE IF NOT EXISTS docs (coll TEXT NOT NULL, id TEXT NOT NULL, data TEXT, updated INTEGER NOT NULL, deleted INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (coll, id))");
    this.sql.exec("CREATE INDEX IF NOT EXISTS docs_updated ON docs (updated)");
    this.sql.exec("CREATE TABLE IF NOT EXISTS photos (id TEXT PRIMARY KEY, type TEXT, bytes BLOB, created INTEGER)");
    this.sql.exec("CREATE TABLE IF NOT EXISTS subs (endpoint TEXT PRIMARY KEY, member TEXT, p256dh TEXT, auth TEXT, created INTEGER, ua TEXT)");
    this.last = 0;
    this.fails = new Map();
  }

  meta(k) {
    const rows = this.sql.exec("SELECT v FROM meta WHERE k = ?", k).toArray();
    return rows.length ? rows[0].v : null;
  }
  setMeta(k, v) { this.sql.exec("INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v", k, v); }

  tick() {
    if (!this.last) {
      const r = this.sql.exec("SELECT MAX(updated) AS m FROM docs").toArray();
      this.last = Number((r[0] && r[0].m) || 0);
    }
    this.last = Math.max(Date.now(), this.last + 1);
    return this.last;
  }

  async vapid() {
    const stored = this.meta("vapid");
    if (stored) return JSON.parse(stored);
    const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
    const privateJwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
    const publicKey = b64u(await crypto.subtle.exportKey("raw", pair.publicKey));
    const v = { privateJwk: { kty: privateJwk.kty, crv: privateJwk.crv, d: privateJwk.d, x: privateJwk.x, y: privateJwk.y }, publicKey };
    this.setMeta("vapid", JSON.stringify(v));
    return v;
  }

  async authed(request) {
    const hash = this.meta("keyhash");
    const given = request.headers.get("X-Nokkel") || "";
    if (!hash || !given) return false;
    return safeEqual(await sha256hex(given.trim()), hash);
  }

  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "");
    const m = request.method;
    try {
      if (path === "/api/status" && m === "GET") {
        const v = await this.vapid();
        return json({ ok: true, claimed: !!this.meta("keyhash"), vapidPublicKey: v.publicKey, version: VERSION });
      }
      if (path === "/api/claim" && m === "POST") return await this.claim(request);
      // Bare cron-jobben når denne: Workeren sender kun /api/... videre utenfra.
      if (path === "/_cron" && m === "POST") return await this.petCron(Number(request.headers.get("X-Time")) || Date.now(), url.origin);

      const photo = /^\/api\/photo\/([A-Za-z0-9_-]{10,64})$/.exec(path);
      if (photo && m === "GET") return this.getPhoto(photo[1]);

      // Maks 30 feil forsøk på husnøkkelen per kvarter fra samme sted
      const ip = request.headers.get("CF-Connecting-IP") || "lokal";
      const f = this.fails.get(ip);
      if (f && f.n >= 30 && Date.now() - f.t < 15 * 60 * 1000) return fail(429, "slow", "For mange feil forsøk. Vent et kvarter og prøv igjen.");
      if (!(await this.authed(request))) {
        const fresh = !f || Date.now() - f.t >= 15 * 60 * 1000;
        this.fails.set(ip, { n: fresh ? 1 : f.n + 1, t: fresh ? Date.now() : f.t });
        return fail(401, "key", "Feil husnøkkel.");
      }
      if (this.meta("origin") !== url.origin) this.setMeta("origin", url.origin);

      if (path === "/api/sync" && m === "GET") return this.sync(Number(url.searchParams.get("since") || 0));
      if (path === "/api/write" && m === "POST") return await this.write(request, url);
      if (path === "/api/photo" && m === "POST") return await this.putPhoto(request);
      if (photo && m === "DELETE") { this.sql.exec("DELETE FROM photos WHERE id = ?", photo[1]); return json({ ok: true }); }
      if (path === "/api/subscribe" && m === "POST") return await this.subscribe(request);
      if (path === "/api/unsubscribe" && m === "POST") {
        const b = await request.json();
        this.sql.exec("DELETE FROM subs WHERE endpoint = ?", String(b.endpoint || ""));
        return json({ ok: true });
      }
      if (path === "/api/test-push" && m === "POST") return await this.testPush(request, url);
      if (path === "/api/preview" && m === "GET") return await this.preview(url);
      return fail(404, "not_found", "Ukjent adresse.");
    } catch (e) {
      return fail(500, "server", "Noe gikk galt på serveren: " + String(e && e.message || e));
    }
  }

  async claim(request) {
    const b = await request.json().catch(() => ({}));
    const key = String(b.key || "").trim();
    if (key.length < 6) return fail(400, "short", "Husnøkkelen må være minst 6 tegn.");
    if (this.meta("keyhash")) return fail(409, "claimed", "Appen har allerede en husnøkkel.");
    this.setMeta("keyhash", await sha256hex(key));
    return json({ ok: true });
  }

  sync(since) {
    const rows = this.sql.exec("SELECT coll, id, data, updated, deleted FROM docs WHERE updated > ? ORDER BY updated", since || 0).toArray();
    return json({
      ok: true,
      now: this.last || Number((this.sql.exec("SELECT MAX(updated) AS m FROM docs").toArray()[0] || {}).m || 0),
      docs: rows.map((r) => ({ coll: r.coll, id: r.id, updated: Number(r.updated), deleted: !!r.deleted, data: r.deleted ? null : JSON.parse(r.data) }))
    });
  }

  async write(request, url) {
    const b = await request.json().catch(() => null);
    const ops = b && Array.isArray(b.ops) ? b.ops : null;
    if (!ops || !ops.length || ops.length > 50) return fail(400, "ops", "Ugyldig endring.");
    const changed = [], newPlings = [];
    for (const op of ops) {
      const { coll, id } = op || {};
      if (!COLLS.has(coll) || !ID_RE.test(String(id || ""))) return fail(400, "bad_ref", "Ugyldig dokument.");
      const cur = this.sql.exec("SELECT data, deleted FROM docs WHERE coll = ? AND id = ?", coll, id).toArray()[0];
      const exists = cur && !cur.deleted;
      let data = null, deleted = 0;
      if (op.op === "delete") { deleted = 1; }
      else if (op.op === "set") { if (!isObj(op.data)) return fail(400, "bad_data", "Ugyldige data."); data = op.data; }
      else if (op.op === "merge") {
        if (!isObj(op.data)) return fail(400, "bad_data", "Ugyldige data.");
        data = deepMerge(exists ? JSON.parse(cur.data) : {}, op.data);
      } else return fail(400, "bad_op", "Ukjent endring.");
      const text = deleted ? null : JSON.stringify(data);
      if (text && text.length > MAX_DOC) return fail(413, "too_big", "Det ble for mye tekst.");
      const updated = this.tick();
      this.sql.exec(
        "INSERT INTO docs (coll, id, data, updated, deleted) VALUES (?, ?, ?, ?, ?) ON CONFLICT(coll, id) DO UPDATE SET data = excluded.data, updated = excluded.updated, deleted = excluded.deleted",
        coll, id, text, updated, deleted
      );
      changed.push({ coll, id, updated, deleted: !!deleted, data: deleted ? null : data });
      if (coll === "plings" && !deleted && !exists) newPlings.push({ id, data });
    }
    if (newPlings.length) {
      this.prunePlings();
      const origin = url.origin;
      await Promise.race([
        Promise.all(newPlings.map((p) => this.pushPling(p, origin))),
        new Promise((r) => setTimeout(r, 6000))
      ]);
    }
    return json({ ok: true, now: this.last, docs: changed });
  }

  prunePlings() {
    const n = Number(this.sql.exec("SELECT COUNT(*) AS n FROM docs WHERE coll = 'plings'").toArray()[0].n);
    if (n <= MAX_PLINGS) return;
    this.sql.exec("DELETE FROM docs WHERE coll = 'plings' AND id IN (SELECT id FROM docs WHERE coll = 'plings' ORDER BY updated ASC LIMIT ?)", n - MAX_PLINGS);
  }

  unseenFor(member) {
    const r = this.sql.exec(
      "SELECT COUNT(*) AS n FROM docs WHERE coll = 'plings' AND deleted = 0 AND json_extract(data, '$.from') != ? AND json_extract(data, ?) IS NULL",
      member, '$.seenBy."' + member + '"'
    ).toArray()[0];
    return Number(r.n || 0);
  }

  async pushPling(p, origin) {
    const from = String(p.data.from || "");
    const note = isObj(p.data.note) ? p.data.note : {};
    const subs = this.sql.exec("SELECT endpoint, member, p256dh, auth FROM subs WHERE member != ?", from).toArray();
    if (!subs.length) return [];
    const vapid = await this.vapid();
    const badges = {};
    return Promise.all(subs.map(async (s) => {
      if (!(s.member in badges)) badges[s.member] = this.unseenFor(s.member);
      const payload = {
        title: String(note.title || "Ny pling").slice(0, 80),
        body: String(note.body || "").slice(0, 200),
        tag: "pling-" + p.id,
        url: "/#pling",
        badge: badges[s.member]
      };
      const r = await sendPush(s, payload, vapid, origin);
      if (r.status === 404 || r.status === 410) this.sql.exec("DELETE FROM subs WHERE endpoint = ?", s.endpoint);
      return r;
    }));
  }

  async subscribe(request) {
    const b = await request.json().catch(() => ({}));
    const sub = b.sub || {};
    const member = String(b.member || "");
    const endpoint = String(sub.endpoint || "");
    const keys = sub.keys || {};
    if (!ID_RE.test(member)) return fail(400, "member", "Ukjent person.");
    if (!okEndpoint(endpoint, this.env.ALLOW_LOCAL_PUSH === "1")) return fail(400, "endpoint", "Ukjent varseltjeneste.");
    if (!keys.p256dh || !keys.auth) return fail(400, "keys", "Abonnementet mangler nøkler.");
    this.sql.exec(
      "INSERT INTO subs (endpoint, member, p256dh, auth, created, ua) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(endpoint) DO UPDATE SET member = excluded.member, p256dh = excluded.p256dh, auth = excluded.auth, ua = excluded.ua",
      endpoint, member, String(keys.p256dh), String(keys.auth), Date.now(), String(request.headers.get("User-Agent") || "").slice(0, 200)
    );
    return json({ ok: true });
  }

  async testPush(request, url) {
    const b = await request.json().catch(() => ({}));
    const member = String(b.member || "");
    const subs = this.sql.exec("SELECT endpoint, member, p256dh, auth FROM subs WHERE member = ?", member).toArray();
    if (!subs.length) return fail(404, "no_subs", "Denne telefonen har ikke slått på varsler ennå.");
    const vapid = await this.vapid();
    const results = await Promise.all(subs.map(async (s) => {
      const r = await sendPush(s, { title: "Voff! Varslene virker", body: "Slik ser det ut når det kommer en pling.", tag: "test", url: "/#pling", badge: this.unseenFor(member) }, vapid, url.origin);
      if (r.status === 404 || r.status === 410) this.sql.exec("DELETE FROM subs WHERE endpoint = ?", s.endpoint);
      return { host: new URL(s.endpoint).host, status: r.status, ok: r.ok, text: r.text };
    }));
    return json({ ok: results.some((r) => r.ok), results });
  }

  getDoc(coll, id) {
    const r = this.sql.exec("SELECT data FROM docs WHERE coll = ? AND id = ? AND deleted = 0", coll, id).toArray()[0];
    return r ? JSON.parse(r.data) : null;
  }

  /* Forhåndsvisning: tittel, navn og bilde for en TikTok- eller Instagram-lenke. Bildet lagres her. */
  async preview(url) {
    let u;
    try { u = new URL(String(url.searchParams.get("url") || "")); } catch (e) { return fail(400, "url", "Ugyldig lenke."); }
    if (!/^https?:$/.test(u.protocol)) return fail(400, "url", "Ugyldig lenke.");
    const host = u.hostname.toLowerCase();
    let p = null;
    if (/(^|\.)tiktok\.com$/.test(host)) p = await tiktokPreview(u.href);
    else if (/(^|\.)instagram\.com$/.test(host)) p = await instagramPreview(u.href);
    if (!p) return json({ ok: true, found: false });
    const photo = p.thumb ? await this.storeRemoteImage(p.thumb) : null;
    return json({ ok: true, found: !!(photo || p.title), title: String(p.title || "").slice(0, 300), author: String(p.author || "").slice(0, 80), photo, canonical: p.canonical || null, embed: p.embed || null });
  }

  async storeRemoteImage(src) {
    try {
      const u = new URL(src);
      if (u.protocol !== "https:" || !IMAGE_HOSTS.some((re) => re.test(u.hostname))) return null;
      const r = await fetchT(u.href, { headers: { "User-Agent": UA_DESKTOP, Accept: "image/avif,image/webp,image/jpeg,image/*" } });
      const type = (r.headers.get("Content-Type") || "").split(";")[0].trim().toLowerCase();
      if (!r.ok || !IMAGE_TYPES.includes(type)) return null;
      const buf = await r.arrayBuffer();
      if (!buf.byteLength || buf.byteLength > MAX_PHOTO) return null;
      const id = randomId(24);
      this.sql.exec("INSERT INTO photos (id, type, bytes, created) VALUES (?, ?, ?, ?)", id, type, buf, Date.now());
      return id;
    } catch (e) { return null; }
  }

  /* Hunden: hvor mange dager på rad har den fått mat, til og med dagen før `date`? */
  streakBefore(date) {
    const fed = new Set(this.sql.exec("SELECT id FROM docs WHERE coll = 'feeds' AND deleted = 0").toArray().map((r) => r.id));
    let n = 0, d = addDays(date, -1);
    while (fed.has(d)) { n++; d = addDays(d, -1); }
    return n;
  }

  async pushAll(payload, origin) {
    const subs = this.sql.exec("SELECT endpoint, member, p256dh, auth FROM subs").toArray();
    if (!subs.length) return [];
    const vapid = await this.vapid();
    return Promise.all(subs.map(async (s) => {
      const r = await sendPush(s, Object.assign({}, payload, { badge: this.unseenFor(s.member) }), vapid, origin);
      if (r.status === 404 || r.status === 410) this.sql.exec("DELETE FROM subs WHERE endpoint = ?", s.endpoint);
      return r;
    }));
  }

  /* Kjøres hver halvtime. Sender påminnelse på valgte tidspunkt hvis ingen har matet hunden i dag. */
  async petCron(ts, origin) {
    const { date, hh, mm } = osloParts(ts);
    const slot = String(hh).padStart(2, "0") + ":" + (mm < 30 ? "00" : "30");
    const pet = Object.assign({}, PET_DEFAULTS, this.getDoc("settings", "pet") || {});
    const rem = Object.assign({}, PET_DEFAULTS.remind, pet.remind || {});
    if (!rem.on) return json({ ok: true, sent: 0, why: "off" });
    const which = slot === rem.first ? "first" : slot === rem.last ? "last" : null;
    if (!which) return json({ ok: true, sent: 0, why: "slot", slot });
    if (this.getDoc("feeds", date)) return json({ ok: true, sent: 0, why: "fed" });
    const flag = "petrem:" + date + ":" + which;
    if (this.meta(flag)) return json({ ok: true, sent: 0, why: "sent" });
    this.setMeta(flag, String(Date.now()));
    this.sql.exec("DELETE FROM meta WHERE k LIKE 'petrem:%' AND k < ?", "petrem:" + addDays(date, -7));
    const name = String(pet.name || "Pølsa").slice(0, 30);
    const streak = this.streakBefore(date);
    const days = streak === 1 ? "dag" : "dager";
    const payload = which === "first"
      ? { title: "🐶 " + name + " er sulten!", body: "Ingen har gitt " + name + " mat i dag. Trykk for å mate." }
      : { title: "🐶 Siste sjanse i dag!", body: streak > 0 ? name + " har ikke fått mat i dag. Streaken på " + streak + " " + days + " ryker ved midnatt." : name + " har ikke fått mat i dag. Gi litt mat før du legger deg." };
    const results = await this.pushAll(Object.assign(payload, { tag: "pet-" + date, url: "/#polsa" }), origin && !/hjem\.internal/.test(origin) ? origin : (this.meta("origin") || "https://polse-pasta.workers.dev"));
    return json({ ok: true, sent: results.filter((r) => r.ok).length, which });
  }

  async putPhoto(request) {
    const type = (request.headers.get("Content-Type") || "").split(";")[0].trim();
    if (!["image/jpeg", "image/png", "image/webp"].includes(type)) return fail(415, "type", "Bare JPG, PNG eller WebP.");
    const buf = await request.arrayBuffer();
    if (!buf.byteLength) return fail(400, "empty", "Tomt bilde.");
    if (buf.byteLength > MAX_PHOTO) return fail(413, "too_big", "Bildet er for stort.");
    const id = randomId(24);
    this.sql.exec("INSERT INTO photos (id, type, bytes, created) VALUES (?, ?, ?, ?)", id, type, buf, Date.now());
    return json({ ok: true, id });
  }

  getPhoto(id) {
    const r = this.sql.exec("SELECT type, bytes FROM photos WHERE id = ?", id).toArray()[0];
    if (!r) return new Response("Ikke funnet", { status: 404 });
    return new Response(new Uint8Array(r.bytes), {
      headers: { "Content-Type": r.type, "Cache-Control": "public, max-age=31536000, immutable" }
    });
  }
}
