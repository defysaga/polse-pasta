// Lager app-ikonene (pølsehunden på sennepsgul bakgrunn) i public/icons/.
// Kjøres bare når ikonet skal endres: node scripts/make-icons.mjs
import fs from "node:fs";
import { chromium } from "/opt/npm-tools/node_modules/playwright/index.mjs";
const src = fs.readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
const pick = (a, b) => src.slice(src.indexOf(a), src.indexOf(b));
const dog = new Function(pick("const STAR_D", "const ICON") + pick("function dog(", "/* ---------- state") + "return dog;")();
const vars = "--dog:#B4683A;--dog-dark:#7B4023;--dog-light:#E4AC7C;--dog-nose:#2A1910;--dog-shine:#FFFFFF;--blush:#EE8B8B;--ketchup:#D63F2B;--mustard:#FFF1C9;--shadow:rgba(90,55,10,.22);--on-mustard:#2A2110;--hat:#fff;--hat-line:#ccc;--basil:#2D7A52;--surface:#fff;--ink:#1B2822;--ink-2:#55665D";
const page = (scale) => `<html><body style="margin:0"><div style="${vars};width:1024px;height:1024px;background:#F2B53A;display:grid;place-items:center;overflow:hidden">
  <div style="width:${Math.round(1024 * scale)}px;transform:translate(-3%,-2%)">${dog("hei").replace('class="dog"', 'style="display:block;width:100%;height:auto;overflow:visible"')}</div></div></body></html>`;
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const p = await b.newPage({ viewport: { width: 1024, height: 1024 } });
for (const [name, scale] of [["master", 0.93], ["maskable", 0.64]]) {
  await p.setContent(page(scale));
  await p.screenshot({ path: `/tmp/claude-0/-home-claude/f73fbbb6-339a-50d3-8838-b645ea576060/scratchpad/icon-${name}.png` });
}
await b.close();
