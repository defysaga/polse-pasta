// node --no-warnings test/test-worker.mjs
import crypto from "node:crypto";
import http from "node:http";
import assert from "node:assert/strict";
import { encryptPayload, vapidHeader, b64u, fromB64u, deepMerge } from "../src/worker.js";
import { encrypt as radarEncrypt } from "/home/claude/defysaga/internship-radar/scripts/webpush.mjs";
import { makeEnv } from "./harness.mjs";

let passed = 0;
const ok = (name) => { passed++; console.log("  ✓ " + name); };

// ---- receiver side, written independently with node:crypto ----
function makeSubscriber() {
  const ecdh = crypto.createECDH("prime256v1");
  ecdh.generateKeys();
  const auth = crypto.randomBytes(16);
  return { ecdh, p256dh: ecdh.getPublicKey().toString("base64url"), auth: auth.toString("base64url"), authBuf: auth };
}
function decrypt(body, sub) {
  body = Buffer.from(body);
  const salt = body.subarray(0, 16);
  const rs = body.readUInt32BE(16);
  const idlen = body[20];
  const asPublic = body.subarray(21, 21 + idlen);
  const ct = body.subarray(21 + idlen);
  assert.equal(rs, 4096);
  const shared = sub.ecdh.computeSecret(asPublic);
  const uaPublic = sub.ecdh.getPublicKey();
  const ikm = Buffer.from(crypto.hkdfSync("sha256", shared, sub.authBuf, Buffer.concat([Buffer.from("WebPush: info\0"), uaPublic, asPublic]), 32));
  const cek = Buffer.from(crypto.hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16));
  const nonce = Buffer.from(crypto.hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12));
  const d = crypto.createDecipheriv("aes-128-gcm", cek, nonce);
  d.setAuthTag(ct.subarray(ct.length - 16));
  const plain = Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]);
  assert.equal(plain[plain.length - 1], 2, "padding delimiter");
  return plain.subarray(0, plain.length - 1).toString("utf8");
}
function verifyVapid(header, endpoint) {
  const m = /^vapid t=([^,]+), k=(.+)$/.exec(header);
  assert.ok(m, "vapid header format");
  const [h, c, s] = m[1].split(".");
  const claims = JSON.parse(Buffer.from(c, "base64url"));
  assert.equal(JSON.parse(Buffer.from(h, "base64url")).alg, "ES256");
  assert.equal(claims.aud, new URL(endpoint).origin);
  assert.ok(claims.exp > Date.now() / 1000 && claims.exp < Date.now() / 1000 + 86400);
  const pub = Buffer.from(m[2], "base64url");
  const key = crypto.createPublicKey({ key: { kty: "EC", crv: "P-256", x: pub.subarray(1, 33).toString("base64url"), y: pub.subarray(33).toString("base64url") }, format: "jwk" });
  assert.ok(crypto.verify("sha256", Buffer.from(h + "." + c), { key, dsaEncoding: "ieee-p1363" }, Buffer.from(s, "base64url")), "signature verifies");
  return claims;
}

console.log("Kryptering");
{
  const sub = makeSubscriber();
  const salt = crypto.randomBytes(16);
  const as = crypto.createECDH("prime256v1"); as.generateKeys();
  const asPub = as.getPublicKey();
  const asJwk = { kty: "EC", crv: "P-256", d: as.getPrivateKey().toString("base64url"), x: asPub.subarray(1, 33).toString("base64url"), y: asPub.subarray(33).toString("base64url") };
  const text = JSON.stringify({ title: "Mads: Jeg er sulten", body: "Hva blir det til middag? Æ Ø Å 🐶" });
  const mine = await encryptPayload(text, sub.p256dh, sub.auth, { salt: new Uint8Array(salt), asJwk });
  const radar = radarEncrypt(text, sub.p256dh, sub.auth, { salt, asPrivate: as.getPrivateKey() });
  assert.equal(Buffer.from(mine).toString("hex"), radar.toString("hex"));
  ok("samme bytes som Radar sin kryptering (som virker mot Apple)");
  assert.equal(decrypt(await encryptPayload(text, sub.p256dh, sub.auth), sub), text);
  ok("tilfeldig nøkkel og salt dekrypteres riktig av mottakeren");
}
{
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign"]);
  const j = await crypto.subtle.exportKey("jwk", pair.privateKey);
  const vapid = { privateJwk: j, publicKey: b64u(await crypto.subtle.exportKey("raw", pair.publicKey)) };
  const ep = "https://web.push.apple.com/QGuQyavXutnMH6UKvIQaOSqC";
  const claims = verifyVapid(await vapidHeader(ep, vapid, "https://polse-pasta.example.workers.dev"), ep);
  assert.equal(claims.sub, "https://polse-pasta.example.workers.dev");
  ok("VAPID-signaturen er gyldig og aud = push-tjenesten");
}
assert.deepEqual(deepMerge({ a: 1, r: { x: { s: 1, c: "hei" } }, p: [1, 2] }, { r: { x: { s: 4 }, y: { s: 2 } }, p: [3] }),
  { a: 1, r: { x: { s: 4, c: "hei" }, y: { s: 2 } }, p: [3] });
ok("flett-endringer beholder den andres rating");

// ---- fake push service ----
const received = [];
let respondStatus = 201;
const pushServer = http.createServer((req, res) => {
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => { received.push({ url: req.url, headers: req.headers, body: Buffer.concat(chunks) }); res.writeHead(respondStatus); res.end(); });
});
await new Promise((r) => pushServer.listen(0, "127.0.0.1", r));
const pushPort = pushServer.address().port;

console.log("API");
const { env, worker } = makeEnv();
const BASE = "https://polse-pasta.test";
const call = async (path, { method = "GET", body, key, type } = {}) => {
  const headers = {};
  if (key) headers["X-Nokkel"] = key;
  if (body !== undefined && !type) headers["Content-Type"] = "application/json";
  if (type) headers["Content-Type"] = type;
  const res = await worker.fetch(new Request(BASE + path, { method, headers, body: body === undefined ? undefined : (type ? body : JSON.stringify(body)) }), env);
  const ct = res.headers.get("Content-Type") || "";
  return { status: res.status, headers: res.headers, data: ct.includes("json") ? await res.json() : new Uint8Array(await res.arrayBuffer()) };
};

let r = await call("/api/status");
assert.equal(r.data.claimed, false); assert.equal(fromB64u(r.data.vapidPublicKey).length, 65);
const vapidPub = r.data.vapidPublicKey;
ok("status: ikke tatt i bruk ennå, har VAPID-nøkkel");
assert.equal((await call("/api/sync")).status, 401);
assert.equal((await call("/api/claim", { method: "POST", body: { key: "kort" } })).status, 400);
assert.equal((await call("/api/claim", { method: "POST", body: { key: "taco-sennep-47" } })).status, 200);
assert.equal((await call("/api/claim", { method: "POST", body: { key: "noe-annet-99" } })).status, 409);
assert.equal((await call("/api/sync", { key: "feil-nokkel" })).status, 401);
assert.equal((await call("/api/status")).data.vapidPublicKey, vapidPub);
ok("husnøkkel: settes én gang, feil nøkkel avvises");
const K = "taco-sennep-47";

r = await call("/api/write", { method: "POST", key: K, body: { ops: [
  { op: "set", coll: "members", id: "mads", data: { name: "Mads", joinedAt: 1 } },
  { op: "set", coll: "members", id: "kari", data: { name: "Kari", joinedAt: 2 } },
  { op: "set", coll: "links", id: "l1", data: { title: "Gochujang-pasta", url: "https://www.tiktok.com/@a/video/1", platform: "tiktok", tags: ["Pasta"], addedBy: "mads", createdAt: 3 } }
] } });
assert.equal(r.status, 200); assert.equal(r.data.docs.length, 3);
const t1 = r.data.now;
r = await call("/api/sync?since=0", { key: K });
assert.equal(r.data.docs.length, 3);
r = await call("/api/sync?since=" + t1, { key: K });
assert.equal(r.data.docs.length, 0);
ok("lagre og hente endringer siden sist");

await call("/api/write", { method: "POST", key: K, body: { ops: [{ op: "set", coll: "dinners", id: "d1", data: { title: "Tacos", ratings: {}, photos: [] } }] } });
await call("/api/write", { method: "POST", key: K, body: { ops: [{ op: "merge", coll: "dinners", id: "d1", data: { ratings: { mads: { stars: 5 } } } }] } });
await call("/api/write", { method: "POST", key: K, body: { ops: [{ op: "merge", coll: "dinners", id: "d1", data: { ratings: { kari: { stars: 4, comment: "Digg" } } } }] } });
r = await call("/api/sync?since=" + t1, { key: K });
const d1 = r.data.docs.find((d) => d.id === "d1");
assert.deepEqual(d1.data.ratings, { mads: { stars: 5 }, kari: { stars: 4, comment: "Digg" } });
ok("to personer rater samme middag uten å overskrive hverandre");

await call("/api/write", { method: "POST", key: K, body: { ops: [{ op: "delete", coll: "links", id: "l1" }] } });
r = await call("/api/sync?since=" + t1, { key: K });
assert.ok(r.data.docs.find((d) => d.id === "l1" && d.deleted));
assert.equal((await call("/api/write", { method: "POST", key: K, body: { ops: [{ op: "set", coll: "hacks", id: "x", data: {} }] } })).status, 400);
assert.equal((await call("/api/write", { method: "POST", key: K, body: { ops: [{ op: "set", coll: "links", id: "../x", data: {} }] } })).status, 400);
ok("sletting synkes, ugyldige samlinger og id-er avvises");

const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...crypto.randomBytes(5000), 0xff, 0xd9]);
r = await call("/api/photo", { method: "POST", key: K, type: "image/jpeg", body: jpeg });
assert.equal(r.status, 200);
const pid = r.data.id;
r = await call("/api/photo/" + pid);
assert.equal(r.status, 200); assert.equal(r.headers.get("Content-Type"), "image/jpeg");
assert.deepEqual(Buffer.from(r.data), Buffer.from(jpeg));
assert.equal((await call("/api/photo", { method: "POST", key: K, type: "text/html", body: jpeg })).status, 415);
assert.equal((await call("/api/photo", { method: "POST", type: "image/jpeg", body: jpeg })).status, 401);
assert.equal((await call("/api/photo/" + pid, { method: "DELETE", key: K })).status, 200);
assert.equal((await call("/api/photo/" + pid)).status, 404);
ok("bilder: last opp, hent, avvis feil type og manglende nøkkel, slett");

// ---- push ----
const kariPhone = makeSubscriber();
const madsPhone = makeSubscriber();
const sub = (s, path) => ({ endpoint: `http://127.0.0.1:${pushPort}/${path}`, keys: { p256dh: s.p256dh, auth: s.auth } });
assert.equal((await call("/api/subscribe", { method: "POST", key: K, body: { member: "kari", sub: { endpoint: "https://evil.example.com/x", keys: { p256dh: "a", auth: "b" } } } })).status, 400);
assert.equal((await call("/api/subscribe", { method: "POST", key: K, body: { member: "kari", sub: sub(kariPhone, "kari") } })).status, 200);
assert.equal((await call("/api/subscribe", { method: "POST", key: K, body: { member: "mads", sub: sub(madsPhone, "mads") } })).status, 200);
ok("abonnement: bare kjente varseltjenester godtas");

received.length = 0;
r = await call("/api/write", { method: "POST", key: K, body: { ops: [{ op: "set", coll: "plings", id: "p1", data: {
  kind: "sulten", text: "", from: "mads", createdAt: Date.now(), seenBy: {}, note: { title: "Mads: Jeg er sulten", body: "Magen rumler. Hva blir det til middag?" }
} }] } });
assert.equal(r.status, 200);
assert.equal(received.length, 1, "bare Kari får varselet");
assert.equal(received[0].url, "/kari");
const h = received[0].headers;
assert.equal(h["content-encoding"], "aes128gcm"); assert.equal(h.ttl, "43200"); assert.equal(h.urgency, "high");
const claims = verifyVapid(h.authorization, `http://127.0.0.1:${pushPort}/kari`);
assert.equal(claims.sub, BASE);
assert.ok(h.authorization.endsWith("k=" + vapidPub));
const payload = JSON.parse(decrypt(received[0].body, kariPhone));
assert.deepEqual(payload, { title: "Mads: Jeg er sulten", body: "Magen rumler. Hva blir det til middag?", tag: "pling-p1", url: "/#pling", badge: 1 });
ok("pling fra Mads → kryptert varsel til Karis telefon, med riktig tekst og tall på ikonet");

received.length = 0;
await call("/api/write", { method: "POST", key: K, body: { ops: [{ op: "merge", coll: "plings", id: "p1", data: { seenBy: { kari: Date.now() } } }] } });
assert.equal(received.length, 0);
await call("/api/write", { method: "POST", key: K, body: { ops: [{ op: "set", coll: "plings", id: "p2", data: { kind: "klem", from: "mads", createdAt: Date.now(), seenBy: {}, note: { title: "Mads sendte en klem" } } }] } });
assert.equal(JSON.parse(decrypt(received[0].body, kariPhone)).badge, 1);
ok("å merke som sett sender ikke varsel, og tallet på ikonet teller bare usette");

received.length = 0;
respondStatus = 410;
await call("/api/write", { method: "POST", key: K, body: { ops: [{ op: "set", coll: "plings", id: "p3", data: { kind: "klem", from: "kari", createdAt: Date.now(), seenBy: {} } }] } });
assert.equal(received.length, 1); assert.equal(received[0].url, "/mads");
respondStatus = 201;
assert.equal((await call("/api/test-push", { method: "POST", key: K, body: { member: "mads" } })).status, 404);
received.length = 0;
r = await call("/api/test-push", { method: "POST", key: K, body: { member: "kari" } });
assert.equal(r.data.ok, true); assert.equal(received.length, 1);
assert.equal(JSON.parse(decrypt(received[0].body, kariPhone)).title, "Voff! Varslene virker");
ok("utløpt abonnement fjernes; testvarsel virker");

for (let i = 0; i < 310; i += 50) {
  const ops = [];
  for (let j = i; j < Math.min(i + 50, 310); j++) ops.push({ op: "set", coll: "plings", id: "q" + j, data: { kind: "hei", from: "kari", createdAt: j, seenBy: { kari: 1 } } });
  await call("/api/write", { method: "POST", key: K, body: { ops } });
}
const n = env.HJEM && (await call("/api/sync?since=0", { key: K })).data.docs.filter((d) => d.coll === "plings").length;
assert.equal(n, 300);
ok("gamle plinger ryddes bort (maks 300)");

console.log("Hunden og påminnelser");
{
  const { osloParts, addDays } = await import("../src/worker.js");
  assert.deepEqual(osloParts(Date.UTC(2026, 9, 22, 16, 0)), { date: "2026-10-22", hh: 18, mm: 0 }); // sommertid
  assert.deepEqual(osloParts(Date.UTC(2026, 11, 1, 23, 30)), { date: "2026-12-02", hh: 0, mm: 30 }); // vintertid, over midnatt
  assert.equal(addDays("2026-03-01", -1), "2026-02-28");
  ok("norsk tid og datoer regnes riktig (sommer- og vintertid)");

  const cron = (ts) => env.HJEM.get().fetch(new Request("https://hjem.internal/_cron", { method: "POST", headers: { "X-Time": String(ts) } })).then((r) => r.json());
  assert.equal((await worker.fetch(new Request(BASE + "/_cron", { method: "POST" }), env)).status, 404);
  ok("påminnelses-jobben kan ikke startes utenfra");
  await call("/api/subscribe", { method: "POST", key: K, body: { member: "mads", sub: sub(madsPhone, "mads") } }); // fjernet i 410-testen over
  // three days fed in a row before 22 Oct, not fed on 22 Oct
  await call("/api/write", { method: "POST", key: K, body: { ops: ["2026-10-19", "2026-10-20", "2026-10-21"].map((d) => ({ op: "set", coll: "feeds", id: d, data: { by: "kari", at: 1 } })) } });
  received.length = 0;
  let c = await cron(Date.UTC(2026, 9, 22, 14, 0)); // 16:00 Oslo
  assert.equal(c.why, "slot"); assert.equal(received.length, 0);
  c = await cron(Date.UTC(2026, 9, 22, 16, 1)); // 18:01 Oslo
  assert.equal(c.which, "first"); assert.equal(received.length, 2);
  const first = JSON.parse(decrypt(received.find((x) => x.url === "/kari").body, kariPhone));
  assert.equal(first.title, "🐶 Pølsa er sulten!"); assert.equal(first.url, "/#polsa");
  c = await cron(Date.UTC(2026, 9, 22, 16, 5));
  assert.equal(c.why, "sent");
  ok("kl. 18 uten mat: begge får «Pølsa er sulten!», bare én gang");
  received.length = 0;
  c = await cron(Date.UTC(2026, 9, 22, 19, 30)); // 21:30 Oslo
  const last = JSON.parse(decrypt(received.find((x) => x.url === "/mads").body, madsPhone));
  assert.match(last.body, /Streaken på 3 dager ryker ved midnatt/);
  ok("kl. 21.30: «Siste sjanse», med streaken på 3 dager");
  await call("/api/write", { method: "POST", key: K, body: { ops: [{ op: "set", coll: "feeds", id: "2026-10-23", data: { by: "mads", at: 2 } }, { op: "set", coll: "settings", id: "pet", data: { name: "Frank", remind: { on: true, first: "12:00", last: "20:00" } } }] } });
  received.length = 0;
  assert.equal((await cron(Date.UTC(2026, 9, 23, 10, 0))).why, "fed");
  assert.equal(received.length, 0);
  assert.equal((await cron(Date.UTC(2026, 9, 24, 10, 0))).which, "first");
  assert.equal(JSON.parse(decrypt(received.find((x) => x.url === "/kari").body, kariPhone)).title, "🐶 Frank er sulten!");
  await call("/api/write", { method: "POST", key: K, body: { ops: [{ op: "merge", coll: "settings", id: "pet", data: { remind: { on: false } } }] } });
  assert.equal((await cron(Date.UTC(2026, 9, 24, 18, 0))).why, "off");
  ok("ingen påminnelse når hunden er matet; eget navn og egne tider; kan skrus av");
}

console.log("Forhåndsvisning");
{
  const { parseInstagram, tiktokId, instagramRef } = await import("../src/worker.js");
  assert.equal(tiktokId("https://www.tiktok.com/@matglad/video/7421123456789?is_from_webapp=1"), "7421123456789");
  assert.deepEqual(instagramRef("https://www.instagram.com/reel/C9xYz_ab12/?igsh=abc"), { kind: "reel", code: "C9xYz_ab12" });
  assert.deepEqual(instagramRef("https://www.instagram.com/matglad/reels/C9xYz_ab12/"), { kind: "reel", code: "C9xYz_ab12" });
  const ig = parseInstagram('<a class="UsernameText" href="#">matglad</a><img class="EmbeddedMediaImage" alt="x" src="https://scontent.cdninstagram.com/v/t51/abc.jpg?a=1&amp;b=2"><div class="Caption"><a class="CaptionUsername" href="#">matglad</a><br>Kremet pasta på 15 min 🍝 #pasta<div class="CaptionComments">');
  assert.equal(ig.thumb, "https://scontent.cdninstagram.com/v/t51/abc.jpg?a=1&b=2");
  assert.equal(ig.author, "matglad");
  assert.equal(ig.title, "Kremet pasta på 15 min 🍝 #pasta");
  assert.equal(parseInstagram('<meta property="og:image" content="https://scontent-osl1-1.cdninstagram.com/x.jpg">').thumb, "https://scontent-osl1-1.cdninstagram.com/x.jpg");
  ok("lenker og Instagram-sider tolkes riktig");

  const realFetch = globalThis.fetch;
  const seen = [];
  const jpg = new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3, 0xff, 0xd9]);
  globalThis.fetch = async (u, o) => {
    const s = String(u instanceof Request ? u.url : u);
    seen.push(s);
    if (s.startsWith("https://vm.tiktok.com/")) return Object.defineProperty(new Response("", { status: 200 }), "url", { value: "https://www.tiktok.com/@matglad/video/7421123456789?_r=1" });
    if (s.startsWith("https://www.tiktok.com/oembed")) return new Response(JSON.stringify({ title: "Kremet gochujang-pasta #pasta #fyp", author_name: "Matglad", thumbnail_url: "https://p16-sign.tiktokcdn-eu.com/obj/thumb.jpeg?x=1" }), { headers: { "Content-Type": "application/json" } });
    if (s.startsWith("https://p16-sign.tiktokcdn-eu.com/")) return new Response(jpg, { headers: { "Content-Type": "image/jpeg" } });
    if (s.startsWith("https://evil.example.com")) throw new Error("should not fetch");
    return realFetch(u, o);
  };
  try {
    r = await call("/api/preview?url=" + encodeURIComponent("https://vm.tiktok.com/ZMabc123/"), { key: K });
    assert.equal(r.status, 200);
    assert.equal(r.data.found, true);
    assert.equal(r.data.title, "Kremet gochujang-pasta #pasta #fyp");
    assert.equal(r.data.author, "Matglad");
    assert.equal(r.data.embed, "https://www.tiktok.com/embed/v2/7421123456789");
    assert.ok(seen.some((s) => s.includes(encodeURIComponent("https://www.tiktok.com/@matglad/video/7421123456789"))), "oEmbed med full lenke");
    const img = await call("/api/photo/" + r.data.photo);
    assert.deepEqual(Buffer.from(img.data), Buffer.from(jpg));
    ok("TikTok-kortlenke: tittel, navn og bilde hentes, bildet lagres hos oss");
    assert.equal((await call("/api/preview?url=" + encodeURIComponent("https://www.tiktok.com/@x/video/123456789"))).status, 401);
    r = await call("/api/preview?url=" + encodeURIComponent("https://evil.example.com/a"), { key: K });
    assert.equal(r.data.found, false);
    ok("forhåndsvisning krever husnøkkel og henter bare fra TikTok og Instagram");
  } finally { globalThis.fetch = realFetch; }
}

console.log("Oppskrifter");
{
  await call("/api/write", { method: "POST", key: K, body: { ops: [{ op: "set", coll: "links", id: "r1", data: {
    url: "https://www.tiktok.com/@matglad/video/7421123456789", platform: "tiktok", title: "Gochujang-pasta", note: "Bytt fløte med kokosmelk",
    caption: "Gochujang-pasta! 200 g spaghetti, 2 ss gochujang, 1 dl fløte, 2 fedd hvitløk #pasta", author: "Matglad", addedBy: "mads", createdAt: 1
  } }] } });
  assert.equal((await call("/api/recipe", { method: "POST", key: K, body: { linkId: "r1" } })).status, 501);
  ok("uten AI på serveren: tydelig feilmelding");
  const asked = [];
  const good = { title: "Gochujang-pasta", servings: 2, time: "20 min", fromCaption: true,
    ingredients: [{ name: "Spaghetti", amount: "200 g" }, { name: "Gochujang", amount: "2 ss" }, { name: "Kokosmelk", amount: "1 dl" }, { name: "Hvitløk", amount: "2 fedd" }, { name: "Salt", amount: "", pantry: true }],
    steps: ["1. Kok pastaen.", "Rør sammen saus.", "Bland alt."], tip: "Topp med vårløk." };
  env.AI = { run: async (model, input) => { asked.push({ model, input }); return { response: good }; } };
  r = await call("/api/recipe", { method: "POST", key: K, body: { linkId: "r1" } });
  assert.equal(r.status, 200);
  assert.equal(asked[0].model, "@cf/meta/llama-3.3-70b-instruct-fp8-fast");
  assert.equal(asked[0].input.response_format.type, "json_schema");
  const prompt = asked[0].input.messages[1].content;
  assert.match(prompt, /200 g spaghetti/); assert.match(prompt, /Bytt fløte med kokosmelk/);
  assert.equal(r.data.recipe.ingredients.length, 5);
  assert.equal(r.data.recipe.steps[0], "Kok pastaen.");
  assert.equal(r.data.recipe.fromCaption, true);
  const synced = (await call("/api/sync?since=0", { key: K })).data.docs.find((d) => d.coll === "links" && d.id === "r1");
  assert.equal(synced.data.recipe.title, "Gochujang-pasta"); assert.equal(synced.data.note, "Bytt fløte med kokosmelk");
  ok("oppskrift fra videoteksten og notatet lagres på videoen og synkes til begge");
  env.AI = { run: async (model) => { if (model.includes("70b")) throw new Error("3040: out of capacity"); return { response: "Her er oppskriften:\n" + JSON.stringify(good) + "\nVelbekomme!" }; } };
  r = await call("/api/recipe", { method: "POST", key: K, body: { linkId: "r1" } });
  assert.equal(r.status, 200); assert.equal(r.data.recipe.model, "@cf/meta/llama-3.1-8b-instruct");
  ok("hvis den store modellen er opptatt, brukes en mindre, og tekst rundt JSON tåles");
  env.AI = { run: async () => { throw new Error("AiError: 3036: You have used up your daily free allocation of 10,000 neurons."); } };
  r = await call("/api/recipe", { method: "POST", key: K, body: { linkId: "r1" } });
  assert.equal(r.status, 429); assert.equal(r.data.code, "ai_quota");
  env.AI = { run: async () => ({ response: { title: "x", servings: 2, ingredients: [], steps: [] } }) };
  assert.equal((await call("/api/recipe", { method: "POST", key: K, body: { linkId: "r1" } })).status, 502);
  assert.equal((await call("/api/recipe", { method: "POST", key: K, body: { linkId: "finnes-ikke" } })).status, 404);
  ok("brukt opp dagens kvote, tomt svar og ukjent video gir forståelige feil");
  assert.equal((await call("/api/write", { method: "POST", key: K, body: { ops: [{ op: "set", coll: "shop", id: "s1", data: { name: "Parmesan", amount: "100 g", done: false } }] } })).status, 200);
  ok("handlelisten kan lagres");
}

console.log("Bilder på kortene");
{
  const realFetch = globalThis.fetch;
  const jpg = new Uint8Array([0xff, 0xd8, 0xff, 9, 8, 7, 6, 0xff, 0xd9]);
  const aiJpg = new Uint8Array([0xff, 0xd8, 0xff, 1, 1, 1, 1, 1, 0xff, 0xd9]);
  const prompts = [];
  let oembedOk = true;
  globalThis.fetch = async (u, o) => {
    const s = String(u instanceof Request ? u.url : u);
    if (s.startsWith("https://www.tiktok.com/oembed")) return oembedOk
      ? new Response(JSON.stringify({ title: "Kremet pasta #pasta", author_name: "Matglad", thumbnail_url: "https://p16-sign.tiktokcdn-eu.com/obj/t.jpeg" }), { headers: { "Content-Type": "application/json" } })
      : new Response("blocked", { status: 403 });
    if (s.startsWith("https://p16-sign.tiktokcdn-eu.com/")) return new Response(jpg, { headers: { "Content-Type": "image/jpeg" } });
    if (s.startsWith("https://www.tiktok.com/") || s.startsWith("https://www.instagram.com/")) return new Response("nei", { status: 403 });
    return realFetch(u, o);
  };
  env.AI = { run: async (model, input) => {
    if (model.includes("flux")) { prompts.push(input.prompt); return { image: Buffer.from(aiJpg).toString("base64") }; }
    if (model.includes("8b")) return { response: "\"Creamy red gochujang spaghetti topped with spring onions\"" };
    throw new Error("ukjent modell " + model);
  } };
  try {
    await call("/api/write", { method: "POST", key: K, body: { ops: [
      { op: "set", coll: "links", id: "c1", data: { url: "https://www.tiktok.com/@matglad/video/7421123456789", platform: "tiktok", title: "Kremet pasta", createdAt: 1 } },
      { op: "set", coll: "links", id: "c2", data: { url: "https://www.tiktok.com/@matglad/video/7421123456790", platform: "tiktok", title: "Gochujang-pasta", createdAt: 2 } },
      { op: "set", coll: "links", id: "c3", data: { url: "https://matprat.no/oppskrifter/kos/lasagne/", platform: "web", title: "Lasagne", recipe: { photo: "Layered beef lasagna with bubbling golden cheese", ingredients: [], steps: [] }, createdAt: 3 } }
    ] } });
    r = await call("/api/cover", { method: "POST", key: K, body: { linkId: "c1" } });
    assert.equal(r.status, 200); assert.equal(r.data.kind, "video");
    assert.deepEqual(Buffer.from((await call("/api/photo/" + r.data.docs[0].data.thumb)).data), Buffer.from(jpg));
    assert.equal(r.data.docs[0].data.author, "Matglad");
    assert.equal(prompts.length, 0);
    ok("TikTok: bildet fra videoen brukes, uten AI");
    oembedOk = false;
    r = await call("/api/cover", { method: "POST", key: K, body: { linkId: "c2" } });
    assert.equal(r.data.kind, "ai");
    assert.match(prompts[0], /Creamy red gochujang spaghetti topped with spring onions/);
    assert.doesNotMatch(prompts[0], /"/);
    assert.deepEqual(Buffer.from((await call("/api/photo/" + r.data.docs[0].data.thumb)).data), Buffer.from(aiJpg));
    ok("TikTok sier nei: AI lager et matbilde av retten, med engelsk beskrivelse");
    r = await call("/api/cover", { method: "POST", key: K, body: { linkId: "c3" } });
    assert.equal(r.data.kind, "ai"); assert.match(prompts[1], /Layered beef lasagna/);
    ok("vanlig nettside: beskrivelsen fra oppskriften brukes direkte");
    const before = r.data.docs[0].data.thumb;
    r = await call("/api/cover", { method: "POST", key: K, body: { linkId: "c3" } });
    assert.equal(r.data.docs.length, 0);
    r = await call("/api/cover", { method: "POST", key: K, body: { linkId: "c3", mode: "ai" } });
    assert.notEqual(r.data.docs[0].data.thumb, before);
    assert.equal((await call("/api/photo/" + before)).status, 404);
    ok("har kortet bilde fra før, lages ikke nytt; «Lag nytt bilde» bytter og sletter det gamle");
    r = await call("/api/cover", { method: "POST", key: K, body: { linkId: "c2", mode: "video" } });
    assert.equal(r.status, 502); assert.equal(r.data.code, "no_image");
    assert.ok(r.data.docs[0].data.thumb, "beholder AI-bildet");
    env.AI = { run: async () => { throw new Error("AiError: 3036: You have used up your daily free allocation of 10,000 neurons."); } };
    await call("/api/write", { method: "POST", key: K, body: { ops: [{ op: "set", coll: "links", id: "c4", data: { url: "https://x.no/a", platform: "web", title: "Taco", createdAt: 4 } }] } });
    r = await call("/api/cover", { method: "POST", key: K, body: { linkId: "c4" } });
    assert.equal(r.status, 429); assert.equal(r.data.code, "ai_quota");
    const c4 = (await call("/api/sync?since=0", { key: K })).data.docs.find((d) => d.id === "c4");
    assert.ok(c4.data.coverTried > 0);
    ok("ingen bilde fra videoen eller brukt opp kvoten: forståelig feil, og forsøket noteres så det ikke prøves om og om igjen");
  } finally { globalThis.fetch = realFetch; }
}

pushServer.close();
console.log(`\nAlle ${passed} tester bestått.`);
