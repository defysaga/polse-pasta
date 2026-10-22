// To personer bruker appen samtidig i hver sin nettleser.
// node --no-warnings test/e2e.mjs
import { chromium } from "/opt/npm-tools/node_modules/playwright/index.mjs";
import zlib from "node:zlib";
import { start } from "./dev-server.mjs";

const OUT = process.env.OUT || "/tmp/claude-0/-home-claude/f73fbbb6-339a-50d3-8838-b645ea576060/scratchpad/";
const server = await start(8799);
const BASE = "http://localhost:8799";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const errors = [];
async function phone(name, scheme) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: scheme, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(name + ": " + e.message));
  p.on("console", (m) => { if (m.type() === "error") errors.push(name + " console: " + m.text()); });
  return p;
}
const shot = (p, n) => p.screenshot({ path: OUT + n + ".png" });
const log = (s) => console.log("  ✓ " + s);

// A small real PNG to upload as a dinner photo
function png(w, h) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; for (let x = 0; x < w; x++) { const o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = 200 + (x % 50); raw[o + 1] = 90 + (y % 80); raw[o + 2] = 40; } }
  const crc = (buf) => { let c, t = []; for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } let r = 0xffffffff; for (const b of buf) r = t[(r ^ b) & 0xff] ^ (r >>> 8); return (r ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

try {
  const A = await phone("Mads", "light");
  await A.goto(BASE + "/");
  await A.waitForSelector("#f-claim");
  await shot(A, "e1-claim");
  const key = await A.inputValue("#fc-key");
  await A.click('#f-claim [type=submit]');
  await A.waitForSelector("#f-new");
  await A.fill("#fw-name", "Mads");
  await A.click('#f-new [type=submit]');
  await A.waitForSelector("#app:not([hidden])");
  log("Mads lager husnøkkel (" + key + ") og kommer inn");
  // push prompt sheet shows the first time
  await A.waitForSelector('#sheet:not([hidden]) [data-act="push-on"]', { timeout: 5000 });
  await shot(A, "e2-push");
  await A.click('#sheet .textbtn[data-act="close-sheet"]');
  await A.waitForTimeout(400);
  log("spørsmålet om varsler vises første gang");

  await A.click('[data-act="add-link"]');
  await A.fill("#fl-url", "Sjekk denne! https://www.tiktok.com/@matglad/video/7421 ");
  await A.waitForTimeout(100);
  if ((await A.inputValue("#fl-url")) !== "https://www.tiktok.com/@matglad/video/7421") throw new Error("URL ble ikke renset");
  await A.fill("#fl-title", "Kremet gochujang-pasta");
  await A.click('label.chip:has-text("Pasta")');
  await A.click('#f-link [type=submit]');
  await A.waitForSelector(".rcard");
  log("lagrer en TikTok-lenke (lenken renses fra delingsteksten)");

  await A.click('[data-act="made"]');
  await A.setInputFiles("#fd-photos", { name: "middag.png", mimeType: "image/png", buffer: png(900, 700) });
  await A.waitForSelector("#fd-prev figure");
  await A.click('#f-dinner [data-star="5"]');
  await A.click('#f-dinner .seg label:has-text("Lage igjen")');
  await A.fill("#fd-comment", "Beste pastaen hittil");
  await A.click('#f-dinner [type=submit]');
  await A.waitForSelector(".drow");
  await A.waitForTimeout(500);
  await shot(A, "e3-middager");
  log("logger middagen med bilde, 5 stjerner og kommentar");

  const B = await phone("Kari", "dark");
  await B.goto(BASE + "/");
  await B.waitForSelector("#f-key");
  await B.fill("#fk-key", "feil-nokkel");
  await B.click('#f-key [type=submit]');
  await B.waitForSelector("#f-key .err:not([hidden])");
  await B.fill("#fk-key", key);
  await B.click('#f-key [type=submit]');
  await B.waitForSelector('[data-act="who-new"]');
  await shot(B, "e4-who");
  await B.click('[data-act="who-new"]');
  await B.fill("#fw-name", "Kari");
  await B.click('#f-new [type=submit]');
  await B.waitForSelector("#app:not([hidden])");
  const sheetOpen = await B.$('#sheet:not([hidden]) [data-act="push-on"]');
  if (sheetOpen) { await B.click('#sheet .textbtn[data-act="close-sheet"]'); await B.waitForTimeout(400); }
  log("Kari avvises med feil nøkkel, kommer inn med riktig, og ser Mads i listen");

  await B.click('.nav [data-k="middager"]');
  await B.waitForSelector(".drow");
  await B.click(".drow");
  await B.waitForSelector(".ph img");
  const loaded = await B.$eval(".ph img", (i) => i.complete && i.naturalWidth > 0);
  if (!loaded) throw new Error("bildet lastet ikke hos Kari");
  await B.click('.rblock [data-star="4"]');
  await B.waitForTimeout(400);
  await shot(B, "e5-detalj");
  await B.click('#sheet [data-act="close-sheet"].x');
  log("Kari ser bildet og gir 4 stjerner");

  // Mads plings Kari
  await A.click('.nav [data-k="pling"]');
  await A.click('[data-act="pick-pling"][data-k="handle"]');
  await A.fill("#fp-text", "parmesan og basilikum");
  await A.click('#f-pling [type=submit]');
  await A.waitForSelector(".pli.out");
  // Kari's app syncs on its own (every 15 s) and shows the pling
  const t0 = Date.now();
  await B.waitForSelector('#ov:not([hidden]) .ov-card', { timeout: 20000 });
  log("Mads sender «Kan du handle?» → dukker opp hos Kari etter " + Math.round((Date.now() - t0) / 1000) + " s uten at hun gjør noe");
  await B.waitForTimeout(1200);
  await shot(B, "e6-pling");
  await B.click('[data-act="ov-reply"]');
  await A.waitForSelector('#ov:not([hidden]) .ov-card', { timeout: 20000 });
  await A.waitForTimeout(1200);
  await shot(A, "e7-klem");
  await A.click('[data-act="ov-close"]');
  log("Kari svarer med en klem, som dukker opp hos Mads");

  // Mads sees Kari's rating
  await A.click('.nav [data-k="middager"]');
  await A.waitForTimeout(300);
  const avg = await A.textContent(".davg b");
  if (avg.trim() !== "4,5") throw new Error("snittet er " + avg);
  log("snittet hos Mads er 4,5 etter at begge har ratet");

  // offline: write is queued and sent later
  await A.context().setOffline(true);
  await A.click('.nav [data-k="pling"]');
  await A.click('[data-act="pick-pling"][data-k="natt"]');
  await A.click('#f-pling [type=submit]');
  await A.waitForTimeout(500);
  const toastTxt = await A.textContent("#toast");
  if (!/nett igjen/.test(toastTxt)) throw new Error("ingen kø-melding: " + toastTxt);
  await A.context().setOffline(false);
  await A.evaluate(() => window.dispatchEvent(new Event("online")));
  await B.waitForSelector('#ov:not([hidden]) .ov-card', { timeout: 20000 });
  log("uten nett: plingen legges i kø og sendes når nettet er tilbake");

  await A.click(".duo");
  await A.waitForSelector("#keytext");
  await shot(A, "e8-innstillinger");
  log("innstillinger med husnøkkel og varsler");
} catch (e) {
  console.error("FEIL:", e.message);
  process.exitCode = 1;
} finally {
  console.log(errors.length ? "Feil i nettleseren:\n" + errors.join("\n") : "Ingen feil i nettleserkonsollen.");
  await browser.close();
  server.close();
}
