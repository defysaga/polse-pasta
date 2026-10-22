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

pushServer.close();
console.log(`\nAlle ${passed} tester bestått.`);
