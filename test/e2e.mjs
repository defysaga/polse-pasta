// To personer bruker appen samtidig i hver sin nettleser.
// node --no-warnings test/e2e.mjs
import { chromium } from "/opt/npm-tools/node_modules/playwright/index.mjs";
import zlib from "node:zlib";
import { start, env } from "./dev-server.mjs";

// Falsk AI for testen: svarer som Cloudflare sin modell ville gjort
env.AI = { run: async (model, input) => {
  await new Promise((r) => setTimeout(r, 700));
  const p = input.messages[1].content;
  if (!/Smash-tacos/.test(p)) throw new Error("ukjent rett i testen");
  return { response: { title: "Smash-tacos med lime-mayo", servings: 2, time: "25 min", fromCaption: false,
    ingredients: [{ name: "Kjøttdeig", amount: "400 g" }, { name: "Små tortillalefser", amount: "8 stk" }, { name: "Lime", amount: "1 stk" },
      { name: "Majones", amount: "1 dl" }, { name: "Revet cheddar", amount: "100 g" }, { name: "Salt og pepper", amount: "", pantry: true }],
    steps: ["Del kjøttdeigen i 8 kuler.", "Legg en kule på hver lefse og trykk flat med kjøttsiden ned i en varm panne.", "Stek 2–3 minutter, snu og dryss over ost.", "Rør majones med limesaft og -skall, og server på tacoene."],
    tip: "Bruk en stekespade med litt tyngde for å presse kjøttet tynt." } };
} };

const realFetch = globalThis.fetch;
globalThis.fetch = async (u, o) => {
  const url = String(u instanceof Request ? u.url : u);
  if (url.startsWith("https://vm.tiktok.com/")) return Object.defineProperty(new Response(""), "url", { value: "https://www.tiktok.com/@matglad/video/7421123456789?_r=1" });
  if (url.startsWith("https://www.tiktok.com/oembed")) return new Response(JSON.stringify({ title: "Smash-tacos med lime-mayo 🌮 #taco #fyp #middag", author_name: "Matglad", thumbnail_url: "https://p16-sign.tiktokcdn-eu.com/thumb.jpeg" }), { headers: { "Content-Type": "application/json" } });
  if (url.startsWith("https://p16-sign.tiktokcdn-eu.com/")) return new Response(THUMB, { headers: { "Content-Type": "image/png" } });
  return realFetch(u, o);
};
let THUMB = null;
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

THUMB = png(270, 480);
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

  // --- the dog ---
  const closeOv = async (P) => { while (await P.$('#ov:not([hidden]) [data-act="ov-close"]')) { await P.click('#ov [data-act="ov-close"]'); await P.waitForTimeout(450); } };
  await closeOv(A); await closeOv(B);
  await A.click('.nav [data-k="polsa"]');
  await A.waitForSelector('[data-act="feed"]');
  await A.click('[data-act="feed"]');
  await A.waitForSelector('[data-act="treat"]');
  const streakTxt = await A.textContent(".streak b");
  if (streakTxt.trim() !== "1") throw new Error("streak " + streakTxt);
  await A.click('[data-act="treat"]');
  await A.waitForTimeout(300);
  await shot(A, "f1-polsa");
  log("Mads gir Pølsa mat (streak 1) og en godbit");
  await B.click('.nav [data-k="polsa"]');
  await B.waitForFunction(() => /Mads ga Pølsa mat/.test(document.querySelector(".pet-status")?.textContent || ""), null, { timeout: 20000 });
  log("Kari ser at Mads har gitt Pølsa mat");

  // --- Pølsehopp ---
  await A.click('[data-act="play-game"]');
  await A.waitForSelector('#game:not([hidden]) [data-g="start"]');
  await A.click('[data-g="start"]');
  await A.waitForTimeout(1400);
  await shot(A, "f2-spill");
  await A.waitForSelector('#game [data-g="again"]', { timeout: 30000 });
  const score = Number(await A.textContent(".g-big"));
  if (!(score > 0)) throw new Error("score " + score);
  await shot(A, "f3-spill-slutt");
  await A.click('#game [data-g="close"]');
  log("Mads spiller dagens bane (" + score + " poeng) uten å hoppe, og poengene lagres");
  await B.waitForSelector('#ov:not([hidden]) [data-act="ov-game"]', { timeout: 20000 });
  await B.click('[data-act="ov-game"]');
  await B.waitForSelector('#game:not([hidden]) [data-g="start"]');
  await B.click('[data-g="start"]');
  // Kari jumps every time an obstacle gets close: same course, so she should beat Mads
  for (let i = 0; i < 90; i++) {
    if (await B.$('#game [data-g="again"]')) break;
    await B.keyboard.down("Space"); await B.waitForTimeout(260); await B.keyboard.up("Space"); await B.waitForTimeout(140);
  }
  await B.waitForSelector('#game [data-g="again"]', { timeout: 60000 });
  const kariScore = Number(await B.textContent(".g-big"));
  await B.click('#game [data-g="close"]');
  log("Kari får pling om rekorden, åpner spillet og får " + kariScore + " poeng på samme bane");

  // --- quiz ---
  await A.click('[data-act="quiz-new"][data-k="hvem"]');
  await A.waitForSelector('[data-act="fq-pick"]');
  const qText = await A.textContent("#fq-qtext");
  await A.click('[data-act="fq-pick"]:last-of-type');
  await A.waitForTimeout(400);
  await closeOv(B);
  await B.waitForSelector('#ov:not([hidden]) [data-act="ov-quiz"]', { timeout: 20000 });
  await B.click('[data-act="ov-quiz"]');
  await B.waitForSelector('[data-act="qa-pick"]');
  await B.click('[data-act="qa-pick"]:last-of-type');
  await B.waitForSelector(".reveal.ok");
  await shot(B, "f4-quiz");
  log("«Hvem av oss?»: " + qText.trim() + " → begge svarer Kari, «Dere er enige!»");
  await B.click('#sheet .x');
  await B.waitForTimeout(300);
  // Mads får plinger om Karis rekord og quizfasiten
  await A.waitForSelector('#ov:not([hidden])', { timeout: 20000 });
  await shot(A, "f4b-pling-spill");
  await closeOv(A);
  await A.click('[data-act="quiz-new"][data-k="egen"]');
  await A.fill("#fq-q", "Hva bestilte jeg på første date?");
  await A.fill("#fq-a", "Pizza");
  await A.fill("#fq-w1", "Sushi");
  await A.fill("#fq-w2", "Taco");
  await A.click('#f-quiz [type=submit]');
  await A.waitForTimeout(400);
  await B.waitForSelector('#ov:not([hidden]) [data-act="ov-quiz"]', { timeout: 20000 });
  await B.click('[data-act="ov-quiz"]');
  await B.waitForSelector('.opt');
  await B.click('.opt:has-text("Pizza")');
  await B.waitForSelector(".reveal.ok .verdict");
  await B.click('#sheet .x');
  await A.waitForFunction(() => /Mads.*kjenner deg: 2 poeng|kjenner deg: 2 poeng/.test(document.querySelector("#quiz-slot")?.textContent || ""), null, { timeout: 20000 }).catch(() => {});
  const statLine = await A.textContent("#quiz-slot .small");
  if (!/2 poeng/.test(statLine)) throw new Error("quiz-poeng: " + statLine);
  await shot(A, "f5-quiz-kort");
  log("eget spørsmål med alternativer: Kari svarer riktig og får 2 poeng (" + statLine.trim() + ")");

  // --- video preview ---
  await closeOv(A);
  await A.click('.nav [data-k="inspo"]');
  await A.click('#v-inspo .sec-head [data-act="add-link"]');
  await A.fill("#fl-url", "https://vm.tiktok.com/ZMabc123/");
  await A.waitForSelector("#fl-prev .prevbox img", { timeout: 8000 });
  const autoTitle = await A.inputValue("#fl-title");
  if (autoTitle !== "Smash-tacos med lime-mayo 🌮") throw new Error("tittel: " + autoTitle);
  await shot(A, "f6-forhandsvisning");
  await A.click('#f-link [type=submit]');
  await A.waitForSelector('.rcard button.rthumb img');
  await A.click('.rcard button.rthumb');
  await A.waitForSelector('#sheet .vwrap iframe');
  const src = await A.getAttribute('#sheet .vwrap iframe', 'src');
  if (src !== "https://www.tiktok.com/embed/v2/7421123456789") throw new Error("iframe " + src);
  log("TikTok-kortlenke: bilde og tittel hentes av seg selv, og videoen spilles av i appen");

  // --- recipe and shopping list ---
  await A.click('[data-act="recipe-make"]');
  await A.waitForSelector("#recipe-box .cooking");
  await A.waitForSelector("#recipe-box .ings", { timeout: 15000 });
  const nIng = (await A.$$("#recipe-box [data-ing]")).length;
  const pantryUnchecked = await A.$eval('#recipe-box [data-ing="5"]', (x) => !x.checked);
  if (nIng !== 6 || !pantryUnchecked) throw new Error("ingredienser " + nIng);
  await A.click('#recipe-box label.ing:has-text("Revet cheddar")'); // har ost hjemme
  await A.$eval("#sheet .panel", (p) => { p.scrollTop = 700; });
  await A.waitForTimeout(200);
  await shot(A, "g1-oppskrift");
  await A.click('[data-act="recipe-add"]');
  await A.waitForSelector('#recipe-box [data-act="tab"][data-k="handle"]');
  log("«Lag oppskrift» gir 6 ingredienser og 4 steg; Mads tar bort osten og legger 4 varer i handlelisten");
  await A.click('#recipe-box [data-act="tab"][data-k="handle"]');
  await A.waitForSelector("#v-handle:not([hidden]) .shopi");
  await A.fill("#fs-item", "melk, 2 pk smør, lime");
  await A.click('#f-shopadd [type=submit]');
  await A.waitForTimeout(300);
  const shopTxt = await A.$$eval("#v-handle .shopi .sn > span", (els) => els.map((e) => e.textContent.trim()));
  if (shopTxt.length !== 6 || !shopTxt.some((t) => t === "1 stk + 1 lime".replace("1 lime", "") || /Lime/.test(t))) throw new Error("liste: " + shopTxt.join(" | "));
  if (!shopTxt.includes("2 pk smør")) throw new Error("smør: " + shopTxt.join(" | "));
  log("handlelisten: " + shopTxt.join(" · "));
  await closeOv(B);
  await B.click('.nav [data-k="handle"]');
  await B.waitForFunction(() => document.querySelectorAll("#v-handle .shopi").length === 6, null, { timeout: 20000 });
  await B.click('#v-handle .shopi label:has-text("Kjøttdeig")');
  await B.waitForTimeout(400);
  await shot(B, "g2-handleliste");
  await A.waitForFunction(() => [...document.querySelectorAll("#v-handle .shopi.done")].some((e) => /Kjøttdeig/.test(e.textContent)), null, { timeout: 20000 });
  await shot(A, "g3-handleliste-lys");
  log("Kari krysser av kjøttdeigen, og den blir krysset av hos Mads også");
  await A.click('.nav [data-k="pling"]');
  await A.click('[data-act="pick-pling"][data-k="handle"]');
  await A.waitForSelector("#fp-attach");
  await A.click('#f-pling [type=submit]');
  await B.waitForSelector('#ov:not([hidden]) [data-act="ov-shop"]', { timeout: 20000 });
  const ovText = await B.textContent("#ov .ov-text");
  if (!/Små tortillalefser/.test(ovText) || /Kjøttdeig/.test(ovText)) throw new Error("pling-tekst: " + ovText);
  await shot(B, "g4-pling-liste");
  await B.click('[data-act="ov-shop"]');
  log("«Kan du handle?» med handlelisten vedlagt: " + ovText.trim());

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
