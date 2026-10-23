// Pølse & Pasta – appen.
//
// Alt som vises kommer fra serveren (/api/...) og lagres også på telefonen,
// så appen åpner med en gang og virker uten nett. Endringer sendes når det er nett.
(() => {
'use strict';

/* ---------- helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const hash = s => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const fmt1 = n => (Math.round(n * 10) / 10).toString().replace('.', ',');
const dShort = new Intl.DateTimeFormat('nb-NO', { day: 'numeric', month: 'short' });
const dDay = new Intl.DateTimeFormat('nb-NO', { weekday: 'short', day: 'numeric', month: 'short' });
const fmtShort = ts => { try { return dShort.format(new Date(ts)); } catch (e) { return ''; } };
const parseDay = s => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
const fmtDay = s => { const d = parseDay(s); return d ? dDay.format(d) : ''; };
function ago(ts) {
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return 'nå nettopp';
  if (s < 3600) return Math.floor(s / 60) + ' min siden';
  const d = new Date(ts), t = d.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' });
  if (new Date().toDateString() === d.toDateString()) return 'i dag ' + t;
  const y = new Date(); y.setDate(y.getDate() - 1);
  if (y.toDateString() === d.toDateString()) return 'i går ' + t;
  return fmtShort(ts) + ' ' + t;
}
function newId(n = 16) {
  const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const r = crypto.getRandomValues(new Uint8Array(n));
  let s = ''; for (let i = 0; i < n; i++) s += abc[r[i] % abc.length];
  return s;
}
const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
function deepMerge(base, patch) {
  const out = isObj(base) ? Object.assign({}, base) : {};
  for (const [k, v] of Object.entries(patch || {})) out[k] = isObj(v) && isObj(out[k]) ? deepMerge(out[k], v) : v;
  return out;
}
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} }
};

const STAR_D = 'M12 2.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.4l-5.8 3.1 1.1-6.5L2.6 9.4l6.5-.9z';
const HEART_D = 'M12 21s-7.6-4.6-9.6-9.3C1 8.3 3.2 4.5 6.9 4.5c2 0 3.6 1.1 5.1 3 1.5-1.9 3.1-3 5.1-3 3.7 0 5.9 3.8 4.5 7.2C19.6 16.4 12 21 12 21z';
const ICON = {
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l13-7.5z"/></svg>',
  more: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="2" fill="currentColor"/><circle cx="12" cy="12" r="2" fill="currentColor"/><circle cx="19" cy="12" r="2" fill="currentColor"/></svg>',
  ext: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  cam: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="12" cy="13" r="3.5" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
  x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>',
  star: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + STAR_D + '"/></svg>',
  share: '<svg class="share-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M7.5 7.5L12 3l4.5 4.5M6 11H5v10h14V11h-1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
};

const TAGS = ['Pasta', 'Kylling', 'Kjøtt', 'Fisk', 'Vegetar', 'Rask', 'Fredagsmat', 'Suppe', 'Frokost', 'Dessert'];
const PLINGS = {
  hei:       { title: 'Pølsehund-hilsen', msg: 'En liten pølsehund kom innom for å si hei.', dog: 'hei', emoji: '🐶' },
  sulten:    { title: 'Jeg er sulten', msg: 'Magen rumler. Hva blir det til middag?', dog: 'sulten', emoji: '🍝' },
  klar:      { title: 'Middagen er klar', msg: 'Kom og spis! Maten står på bordet.', dog: 'klar', emoji: '🍽️' },
  handle:    { title: 'Kan du handle?', msg: 'Kan du ta med noe på vei hjem?', dog: 'handle', emoji: '🛒', input: 'F.eks. parmesan, melk og basilikum', label: 'Hva trengs?' },
  klem:      { title: 'Klem', msg: 'Her kommer en stor klem.', dog: 'klem', emoji: '🤗' },
  kyss:      { title: 'Kyss', msg: 'Smask! Et kyss fra meg.', dog: 'kyss', emoji: '💋' },
  natt:      { title: 'God natt', msg: 'Pølsa legger seg nå. Sov godt!', dog: 'natt', emoji: '🌙' },
  egen:      { title: 'Melding', msg: '', dog: 'egen', emoji: '💬', input: 'Skriv noe søtt…', label: 'Melding', custom: true },
  oppskrift: { title: 'Ny oppskrift!', msg: 'Fant noe vi må lage:', dog: 'oppskrift', emoji: '📌', hidden: true },
  rating:    { title: 'Gi en rating', msg: 'Hva syntes du om middagen?', dog: 'stjerne', emoji: '⭐', hidden: true },
  quiz:      { title: 'Quiz', msg: '', dog: 'quiz', emoji: '❓', hidden: true },
  spill:     { title: 'Pølsehopp', msg: '', dog: 'stjerne', emoji: '🏆', hidden: true }
};
const PLING_ORDER = ['hei', 'sulten', 'klar', 'handle', 'klem', 'kyss', 'natt', 'egen'];
const KEY_WORDS = ['polse', 'pasta', 'taco', 'sennep', 'ketchup', 'gnocchi', 'pesto', 'lasagne', 'burrito', 'ramen', 'vaffel', 'kanel', 'tomat', 'basilikum', 'parmesan', 'chili', 'risotto', 'falafel', 'pizza', 'nachos', 'kebab', 'sushi', 'lompe', 'brunost'];

/* ---------- the dachshund ---------- */
function dog(v, live) {
  const closed = v === 'natt', happy = v === 'klem' || v === 'kyss';
  const eye = closed
    ? '<path d="M215 43q5 4 10 0" fill="none" stroke="var(--dog-nose)" stroke-width="2.6" stroke-linecap="round"/>'
    : happy
      ? '<path d="M215 45q5-6 10 0" fill="none" stroke="var(--dog-nose)" stroke-width="2.6" stroke-linecap="round"/>'
      : '<circle cx="220" cy="42" r="3.9" fill="var(--dog-nose)"/><circle cx="221.4" cy="40.6" r="1.3" fill="var(--dog-shine)"/>';
  const tail = closed
    ? '<path d="M64 84Q46 92 34 100" fill="none" stroke="var(--dog)" stroke-width="8" stroke-linecap="round"/>'
    : '<g class="wag"><path d="M64 80Q42 74 32 50" fill="none" stroke="var(--dog)" stroke-width="8" stroke-linecap="round"/></g>';
  let back = '', front = '', onHead = '';
  switch (v) {
    case 'hei':
      front = '<g class="pop" fill="none" stroke="var(--mustard)" stroke-width="3.2" stroke-linecap="round"><path d="M246 26l9-11"/><path d="M256 36l13-4"/><path d="M236 18l2-13"/></g>';
      break;
    case 'sulten':
      back = '<ellipse cx="247" cy="73" rx="4.2" ry="6.5" fill="var(--blush)"/>';
      front = '<path d="M232 124h46q-4 16-23 16t-23-16z" fill="var(--ketchup)"/><ellipse cx="255" cy="124" rx="23" ry="4.5" fill="var(--mustard)"/><path d="M247 121q4-6 8 0M257 120q4-6 8 0" fill="none" stroke="var(--on-mustard)" stroke-opacity=".35" stroke-width="2"/>';
      break;
    case 'klar':
      onHead = '<g transform="rotate(-8 214 20)"><circle cx="205" cy="14" r="8" fill="var(--hat)" stroke="var(--hat-line)" stroke-width="1.5"/><circle cx="223" cy="14" r="8" fill="var(--hat)" stroke="var(--hat-line)" stroke-width="1.5"/><circle cx="214" cy="9" r="9.5" fill="var(--hat)" stroke="var(--hat-line)" stroke-width="1.5"/><rect x="200" y="17" width="28" height="11" rx="3" fill="var(--hat)" stroke="var(--hat-line)" stroke-width="1.5"/></g>';
      front = '<g class="pop" fill="var(--mustard)"><circle cx="248" cy="18" r="2.5"/><circle cx="262" cy="28" r="2"/><circle cx="182" cy="16" r="2"/></g>';
      break;
    case 'handle':
      front = '<path d="M240 114q15-22 30 0" fill="none" stroke="var(--dog-dark)" stroke-width="3.5" stroke-linecap="round"/><rect x="252" y="92" width="9" height="30" rx="4.5" transform="rotate(18 256 107)" fill="var(--dog-light)"/><circle cx="244" cy="110" r="6.5" fill="var(--basil)"/><path d="M234 114h42l-6 24h-30z" fill="var(--mustard)"/><path d="M240 122h30M242 130h26" stroke="var(--on-mustard)" stroke-opacity=".28" stroke-width="2"/>';
      break;
    case 'klem':
      front = '<g class="float"><path d="' + HEART_D + '" transform="translate(130 -8) scale(1.7)" fill="var(--ketchup)"/></g>';
      break;
    case 'kyss':
      front = '<g class="rise"><path d="' + HEART_D + '" transform="translate(246 22) scale(.62)" fill="var(--ketchup)"/></g>'
        + '<g class="rise" style="animation-delay:.8s"><path d="' + HEART_D + '" transform="translate(262 34) scale(.5)" fill="var(--blush)"/></g>'
        + '<g class="rise" style="animation-delay:1.6s"><path d="' + HEART_D + '" transform="translate(232 6) scale(.48)" fill="var(--ketchup)"/></g>';
      break;
    case 'natt':
      front = '<text class="zz rise" x="238" y="26" font-size="18">z</text><text class="zz rise" style="animation-delay:.8s" x="252" y="14" font-size="22">z</text><text class="zz rise" style="animation-delay:1.6s" x="266" y="2" font-size="26">Z</text>';
      break;
    case 'stjerne':
      front = '<g class="float"><path d="' + STAR_D + '" transform="translate(128 -10) scale(1.75)" fill="var(--mustard)"/></g>';
      break;
    case 'oppskrift':
      front = '<g class="float"><path d="M242 20l-6 12 14-10" fill="var(--surface)" stroke="var(--ink)" stroke-width="2.5" stroke-linejoin="round"/><rect x="234" y="-10" width="42" height="32" rx="10" fill="var(--surface)" stroke="var(--ink)" stroke-width="2.5"/><path d="M249 -1l13 7-13 7z" fill="var(--ketchup)"/></g>';
      break;
    case 'quiz':
      front = '<g class="float"><path d="M242 20l-6 12 14-10" fill="var(--surface)" stroke="var(--ink)" stroke-width="2.5" stroke-linejoin="round"/><rect x="234" y="-10" width="42" height="32" rx="10" fill="var(--surface)" stroke="var(--ink)" stroke-width="2.5"/><text x="255" y="15" text-anchor="middle" class="qmark">?</text></g>';
      break;
    case 'egen':
      front = '<g class="float"><path d="M242 20l-6 12 14-10" fill="var(--surface)" stroke="var(--ink)" stroke-width="2.5" stroke-linejoin="round"/><rect x="234" y="-10" width="42" height="32" rx="10" fill="var(--surface)" stroke="var(--ink)" stroke-width="2.5"/><circle cx="245" cy="6" r="3" fill="var(--ink)"/><circle cx="255" cy="6" r="3" fill="var(--ink)"/><circle cx="265" cy="6" r="3" fill="var(--ink)"/></g>';
      break;
  }
  return '<svg class="dog' + (live ? ' live' : '') + '" viewBox="0 -16 284 164" aria-hidden="true" focusable="false">'
    + '<ellipse cx="142" cy="140" rx="104" ry="6" fill="var(--shadow)"/>'
    + back + tail
    + '<rect x="76" y="94" width="17" height="44" rx="8.5" fill="var(--dog-dark)"/>'
    + '<rect x="187" y="94" width="17" height="44" rx="8.5" fill="var(--dog-dark)"/>'
    + '<rect x="52" y="66" width="150" height="48" rx="24" fill="var(--dog)"/>'
    + '<ellipse cx="128" cy="106" rx="62" ry="6" fill="var(--dog-light)" opacity=".55"/>'
    + '<rect x="60" y="96" width="18" height="42" rx="9" fill="var(--dog)"/>'
    + '<rect x="171" y="96" width="18" height="42" rx="9" fill="var(--dog)"/>'
    + '<path d="M176 74Q196 62 200 40L226 52Q222 84 200 102Z" fill="var(--dog)"/>'
    + '<g class="head">'
    +   '<circle cx="214" cy="48" r="22" fill="var(--dog)"/>'
    +   '<ellipse cx="238" cy="58" rx="20" ry="11" fill="var(--dog)"/>'
    +   '<ellipse cx="241" cy="62" rx="15" ry="6" fill="var(--dog-light)"/>'
    +   '<circle cx="257" cy="54" r="5.5" fill="var(--dog-nose)"/>'
    +   '<path d="M244 64q6 4 12-1" fill="none" stroke="var(--dog-nose)" stroke-width="1.8" stroke-linecap="round"/>'
    +   eye
    +   '<circle cx="230" cy="55" r="4.5" fill="var(--blush)" opacity=".55"/>'
    +   '<path d="M204 30Q186 32 188 56Q190 74 203 70Q211 58 209 36Z" fill="var(--dog-dark)"/>'
    +   onHead
    + '</g>'
    + '<path d="M190 67Q206 79 224 71" fill="none" stroke="var(--ketchup)" stroke-width="6" stroke-linecap="round"/>'
    + '<circle cx="207" cy="79" r="4.5" fill="var(--mustard)"/>'
    + front
    + '</svg>';
}

/* ---------- state & local storage ---------- */
const EMPTY = () => ({ members: {}, links: {}, dinners: {}, plings: {}, feeds: {}, scores: {}, quiz: {}, settings: {}, shop: {} });
const S = {
  key: LS.get('pp-key', null), me: LS.get('pp-me', null), vapid: LS.get('pp-vapid', null),
  docs: Object.assign(EMPTY(), LS.get('pp-docs', {})), since: LS.get('pp-since', 0), queue: LS.get('pp-queue', []),
  members: {}, links: [], dinners: [], plings: [], quiz: [],
  stage: 'boot', online: true, synced: false, push: 'unknown',
  tab: /polsa/.test(location.hash) ? 'polsa' : /pling/.test(location.hash) ? 'pling' : /handle/.test(location.hash) ? 'handle' : 'inspo', lf: 'alle', tagf: null, q: '', ds: 'nyeste',
  sheet: null, ovId: null, dismissed: new Set(), booted: Date.now(), startErr: '', who: null
};
const canW = () => !!(S.key && S.me);
let saveT = null;
function save() {
  clearTimeout(saveT);
  saveT = setTimeout(() => { LS.set('pp-docs', S.docs); LS.set('pp-since', S.since); }, 200);
}
function derive() {
  const arr = c => Object.entries(S.docs[c]).map(([id, d]) => Object.assign({}, d, { id }));
  S.members = S.docs.members;
  S.links = arr('links').sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  S.dinners = arr('dinners');
  S.quiz = arr('quiz').sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  S.plings = arr('plings').sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  if (S.plings.length > 300) S.plings.slice(300).forEach(p => { delete S.docs.plings[p.id]; });
  S.plings = S.plings.slice(0, 300);
}

/* ---------- server ---------- */
async function api(path, opts) {
  opts = opts || {};
  const headers = {};
  if (S.key) headers['X-Nokkel'] = S.key;
  let body;
  if (opts.raw) { body = opts.raw; headers['Content-Type'] = opts.type; }
  else if (opts.body !== undefined) { body = JSON.stringify(opts.body); headers['Content-Type'] = 'application/json'; }
  let res;
  try { res = await fetch(path, { method: opts.method || 'GET', headers, body, cache: 'no-store' }); }
  catch (e) { throw { code: 'offline' }; }
  let data = null;
  try { data = await res.json(); } catch (e) {}
  if (!res.ok) throw { code: (data && data.code) || 'http_' + res.status, status: res.status, message: data && data.message };
  return data;
}
function applyDocs(docs) {
  for (const d of docs || []) {
    if (!S.docs[d.coll]) continue;
    if (d.deleted) delete S.docs[d.coll][d.id]; else S.docs[d.coll][d.id] = d.data;
  }
}
function applyLocal(ops) {
  for (const o of ops) {
    const c = S.docs[o.coll]; if (!c) continue;
    if (o.op === 'delete') delete c[o.id];
    else if (o.op === 'set') c[o.id] = o.data;
    else if (o.op === 'merge') c[o.id] = deepMerge(c[o.id] || {}, o.data);
  }
}
let syncing = null;
function sync(full) {
  if (!S.key) return Promise.resolve();
  if (syncing) return syncing;
  syncing = (async () => {
    const before = new Set(Object.keys(S.docs.plings));
    try {
      if (S.queue.length) await flush();
      const r = await api('/api/sync?since=' + (full ? 0 : S.since));
      if (full) S.docs = EMPTY();
      applyDocs(r.docs);
      if (S.queue.length) applyLocal(S.queue);
      if (typeof r.now === 'number') S.since = full ? r.now : Math.max(S.since, r.now);
      S.online = true; S.synced = true;
      save();
      const fresh = (r.docs || []).some(d => d.coll === 'plings' && !d.deleted && !before.has(d.id) && d.data && d.data.from !== S.me && (d.data.createdAt || 0) > S.booted - 5000);
      if (fresh) ping();
    } catch (e) {
      if (e.code === 'key') badKey();
      else if (e.code === 'offline' || (e.status || 0) >= 500) S.online = false;
    }
  })().finally(() => { syncing = null; changed(); });
  return syncing;
}
let flushing = null;
function flush() {
  if (flushing) return flushing;
  flushing = (async () => {
    let error = null;
    while (S.queue.length) {
      const batch = S.queue.slice(0, 25);
      try {
        const r = await api('/api/write', { method: 'POST', body: { ops: batch } });
        S.queue.splice(0, batch.length); LS.set('pp-queue', S.queue);
        applyDocs(r.docs); S.online = true; save();
      } catch (e) {
        if (e.code === 'offline' || (e.status || 0) >= 500) { S.online = false; return { queued: true }; }
        if (e.code === 'key') { badKey(); return { error: e }; }
        S.queue.splice(0, batch.length); LS.set('pp-queue', S.queue);
        error = e;
      }
    }
    if (error) setTimeout(() => sync(true), 100);
    return { error };
  })().finally(() => { flushing = null; changed(); });
  return flushing;
}
async function write(ops) {
  applyLocal(ops); save(); changed();
  S.queue.push(...ops); LS.set('pp-queue', S.queue);
  const r = await flush();
  if (r.error) throw r.error;
  return r;
}
function badKey() {
  S.key = null; LS.del('pp-key');
  S.startErr = 'Husnøkkelen virker ikke lenger. Skriv den inn på nytt.';
  S.stage = 'key'; render();
}

/* ---------- derived ---------- */
const linkById = id => S.links.find(l => l.id === id);
const dinnerById = id => S.dinners.find(d => d.id === id);
const memberIds = () => Object.keys(S.members).sort((a, b) => (S.members[a].joinedAt || 0) - (S.members[b].joinedAt || 0));
const partnerId = () => memberIds().find(id => id !== S.me) || null;
function nm(uid) {
  if (!uid) return 'Noen';
  const m = S.members[uid];
  return (m && m.name) || (uid === S.me ? 'Deg' : 'Kjæresten');
}
const partnerName = () => partnerId() ? nm(partnerId()) : 'kjæresten';
const AV_COLORS = ['var(--ketchup)', 'var(--basil)', 'var(--sky)', 'var(--mustard)'];
function av(uid, size) {
  size = size || 26;
  const idx = memberIds().indexOf(uid);
  const color = AV_COLORS[(idx >= 0 ? idx : hash(uid)) % AV_COLORS.length];
  const init = (nm(uid) || '?').trim().charAt(0).toUpperCase() || '?';
  return '<span class="av" title="' + esc(nm(uid)) + '" style="--avc:' + color + ';width:' + size + 'px;height:' + size + 'px;font-size:' + Math.round(size * .45) + 'px">' + esc(init) + '</span>';
}
function stars(n) {
  let s = '<span class="stars" aria-label="' + (n || 0) + ' av 5 stjerner">';
  for (let i = 1; i <= 5; i++) s += '<svg viewBox="0 0 24 24" class="' + (i <= n ? 'on' : '') + '"><path d="' + STAR_D + '"/></svg>';
  return s + '</span>';
}
function starInput(group, val, id) {
  let s = '<div class="stars-in" role="group" aria-label="Velg antall stjerner">';
  for (let n = 1; n <= 5; n++) s += '<button type="button" class="' + (n <= val ? 'on' : '') + '" data-star="' + n + '" data-group="' + group + '"' + (id ? ' data-id="' + id + '"' : '') + ' aria-label="' + n + ' av 5" aria-pressed="' + (n === val) + '">' + ICON.star + '</button>';
  return s + '</div>';
}
const photoUrl = id => '/api/photo/' + encodeURIComponent(id);

/* ---------- links ---------- */
function extractUrl(s) {
  s = String(s || '').trim();
  const m = s.match(/https?:\/\/[^\s"'<>]+/i);
  if (m) return m[0].replace(/[),.!]+$/, '');
  if (/^(www\.|vm\.|m\.)?[a-z0-9-]+(\.[a-z0-9-]+)+\/\S*$/i.test(s)) return 'https://' + s;
  return null;
}
function detect(url) {
  try {
    const h = new URL(url).hostname.toLowerCase();
    if (/(^|\.)tiktok\.com$/.test(h)) return 'tiktok';
    if (/(^|\.)instagram\.com$/.test(h) || h === 'instagr.am') return 'instagram';
    if (/(^|\.)youtube\.com$/.test(h) || h === 'youtu.be') return 'youtube';
    return 'web';
  } catch (e) { return null; }
}
function normUrl(u) {
  try {
    const x = new URL(u);
    const h = x.hostname.toLowerCase().replace(/^(www\.|m\.)/, '');
    let p = x.pathname.replace(/\/+$/, '');
    const v = x.searchParams.get('v');
    if (v && /youtube\.com$/.test(h)) p += '?v=' + v;
    return h + p.toLowerCase();
  } catch (e) { return String(u || '').trim().toLowerCase(); }
}
const platLabel = p => ({ tiktok: 'TikTok', instagram: 'Reels', youtube: 'YouTube', web: 'Nett' }[p] || 'Nett');
const safeHref = u => /^https?:\/\//i.test(u || '') ? u : '#';
const openLabel = p => ({ tiktok: 'Åpne i TikTok', instagram: 'Åpne i Instagram', youtube: 'Åpne i YouTube' }[p] || 'Åpne lenken');

/* ---------- dinners ---------- */
function rinfo(d) {
  const vals = Object.values(d.ratings || {}).map(x => x && x.stars).filter(n => n > 0);
  return { avg: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null, n: vals.length };
}
const cmpMade = (a, b) => (b.madeOn || '').localeCompare(a.madeOn || '') || (b.createdAt || 0) - (a.createdAt || 0);
function madeMap() {
  const m = {};
  S.dinners.slice().sort(cmpMade).forEach(d => {
    if (!d.linkId) return;
    const e = m[d.linkId] || (m[d.linkId] = { count: 0, sum: 0, n: 0, photo: null });
    e.count++;
    const r = rinfo(d); if (r.avg != null) { e.sum += r.avg; e.n++; }
    if (!e.photo && d.photos && d.photos.length) e.photo = d.photos[0];
  });
  Object.values(m).forEach(e => { e.avg = e.n ? e.sum / e.n : null; });
  return m;
}
function peopleFor(d) {
  const ids = new Set();
  if (S.me) ids.add(S.me);
  memberIds().forEach(i => ids.add(i));
  Object.keys(d.ratings || {}).forEach(i => ids.add(i));
  return [...ids];
}
const AGAIN = { ja: 'Lager igjen', kanskje: 'Kanskje igjen', nei: 'Aldri igjen' };

/* ---------- push notifications ---------- */
const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
function urlB64(s) {
  const p = '='.repeat((4 - s.length % 4) % 4);
  const b = atob((s + p).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(b, c => c.charCodeAt(0));
}
async function checkPush() {
  if (!pushSupported()) { S.push = isIOS() && !standalone() ? 'install' : 'unsupported'; return; }
  if (Notification.permission === 'denied') { S.push = 'denied'; return; }
  if (Notification.permission !== 'granted') { S.push = 'off'; return; }
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) { S.push = 'off'; return; }
    S.push = 'on';
    if (S.me && S.key) api('/api/subscribe', { method: 'POST', body: { member: S.me, sub: sub.toJSON() } }).catch(() => {});
  } catch (e) { S.push = 'off'; }
}
async function enablePush() {
  if (!pushSupported()) { S.push = isIOS() && !standalone() ? 'install' : 'unsupported'; return false; }
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') { S.push = perm === 'denied' ? 'denied' : 'off'; return false; }
  if (!S.vapid) { const st = await api('/api/status'); S.vapid = st.vapidPublicKey; LS.set('pp-vapid', S.vapid); }
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64(S.vapid) });
  await api('/api/subscribe', { method: 'POST', body: { member: S.me, sub: sub.toJSON() } });
  S.push = 'on';
  return true;
}
async function disablePush() {
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) { api('/api/unsubscribe', { method: 'POST', body: { endpoint: sub.endpoint } }).catch(() => {}); await sub.unsubscribe(); }
  } catch (e) {}
  S.push = 'off';
}
function pushCard() {
  if (S.push === 'on' || S.push === 'unknown' || S.push === 'unsupported') return '';
  const txt = S.push === 'install'
    ? 'Legg appen på hjemskjermen for å få plinger som varsler.'
    : S.push === 'denied'
      ? 'Varsler er slått av for appen. Slå dem på i Innstillinger → Varslinger → Pølse&amp;Pasta.'
      : 'Slå på varsler, så kommer plingene på låseskjermen.';
  const btn = S.push === 'install' ? '<button class="btn sm" data-act="install-help">Slik gjør du</button>'
    : S.push === 'off' ? '<button class="btn sm primary" data-act="push-on">Slå på</button>' : '';
  return '<div class="pushcard">' + dog('hei') + '<p>' + txt + '</p>' + btn + '</div>';
}

/* ---------- rendering ---------- */
function changed() {
  derive();
  if (S.stage === 'app') {
    render();
    if (S.sheet && S.sheet.type === 'dinner') renderDetail();
    if (S.sheet && S.sheet.type === 'quiz') renderQuizSheet();
    if (S.sheet && S.sheet.type === 'play') renderRecipeBox();
    checkOverlay();
  } else if (S.stage === 'who') renderStart();
}
function render() {
  const inApp = S.stage === 'app';
  $('#app').hidden = !inApp;
  $('#start').hidden = inApp;
  if (!inApp) { renderStart(); return; }
  ['inspo', 'middager', 'handle', 'pling', 'polsa'].forEach(t => { $('#v-' + t).hidden = S.tab !== t; });
  $('#nav-polsa-l').textContent = pet().name;
  document.querySelectorAll('.nav [data-act="tab"]').forEach(b => {
    if (b.dataset.k === S.tab) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  renderHeader();
  renderBadge();
  const inv = $('#invite-slot');
  inv.innerHTML = S.synced && memberIds().length < 2
    ? '<div class="invite">' + dog('hei') + '<p>Madammen er ikke med ennå. Send henne appen og husnøkkelen.</p><button class="btn sm" data-act="invite">Del appen</button></div>' : '';
  if (S.tab === 'inspo') renderInspo();
  else if (S.tab === 'middager') renderDinners();
  else if (S.tab === 'polsa') renderPolsa();
  else if (S.tab === 'handle') renderShop();
  else renderPling();
}

function renderHeader() {
  const p = partnerId();
  $('#top-right').innerHTML = (S.online ? '' : '<span class="offline">Uten nett</span>')
    + '<button class="duo" data-act="settings" aria-label="Innstillinger">' + av(S.me, 30) + (p ? av(p, 30) : '') + '</button>';
}

function unseen() {
  if (!S.me) return [];
  return S.plings.filter(p => p.from && p.from !== S.me && !(p.seenBy || {})[S.me] && !S.dismissed.has(p.id));
}
function renderBadge() {
  const n = unseen().length, b = $('#pl-badge');
  b.hidden = !n; b.textContent = n > 9 ? '9+' : String(n);
  const pn = polsaBadge(), pb = $('#polsa-badge');
  pb.hidden = !pn; pb.textContent = pn > 9 ? '9+' : String(pn);
  try { if ('setAppBadge' in navigator) (n ? navigator.setAppBadge(n) : navigator.clearAppBadge()).catch(() => {}); } catch (e) {}
}

function emptyBox(v, title, text, btn) {
  return '<div class="empty">' + dog(v, true) + '<h3>' + title + '</h3><p>' + text + '</p>' + (btn || '') + '</div>';
}
const loading = txt => '<p class="loading">' + txt + '</p>';

function renderInspo() {
  const chips = $('#inspo-chips'), tags = $('#inspo-tags'), grid = $('#inspo-grid');
  const made = madeMap(), all = S.links;
  $('#inspo-search-wrap').hidden = all.length < 6;
  if (!all.length) {
    chips.innerHTML = ''; tags.hidden = true;
    grid.innerHTML = !S.synced ? loading('Henter oppskriftene…') : emptyBox('oppskrift', 'Ingen videoer lagret ennå',
      'Fant dere noe digg på TikTok eller Instagram? Trykk <b>Del</b> → <b>Kopier lenke</b> i appen, og lim den inn her.',
      '<button class="btn primary" data-act="add-link">Lagre første video</button>');
    return;
  }
  const cnt = {
    alle: all.length, vil: all.filter(l => !made[l.id]).length, laget: all.filter(l => made[l.id]).length,
    tiktok: all.filter(l => l.platform === 'tiktok').length, instagram: all.filter(l => l.platform === 'instagram').length
  };
  const F = [['alle', 'Alle'], ['vil', 'Vil lage'], ['laget', 'Laget'], ['tiktok', 'TikTok'], ['instagram', 'Reels']];
  chips.innerHTML = F.filter(([k]) => k === 'alle' || cnt[k] > 0 || S.lf === k)
    .map(([k, l]) => '<button class="chip-b" data-act="lf" data-k="' + k + '" aria-pressed="' + (S.lf === k) + '">' + l + '<span class="n">' + cnt[k] + '</span></button>').join('');
  const tc = {};
  all.forEach(l => (l.tags || []).forEach(t => { tc[t] = (tc[t] || 0) + 1; }));
  const tl = Object.keys(tc).sort((a, b) => tc[b] - tc[a]);
  tags.hidden = !tl.length;
  tags.innerHTML = tl.map(t => '<button class="chip-b sm" data-act="tagf" data-k="' + esc(t) + '" aria-pressed="' + (S.tagf === t) + '">' + esc(t) + '</button>').join('');
  let list = all.filter(l => S.lf === 'alle' || (S.lf === 'vil' && !made[l.id]) || (S.lf === 'laget' && made[l.id]) || l.platform === S.lf);
  if (S.tagf) list = list.filter(l => (l.tags || []).includes(S.tagf));
  const q = S.q.trim().toLowerCase();
  if (q) list = list.filter(l => ((l.title || '') + ' ' + (l.note || '') + ' ' + (l.tags || []).join(' ')).toLowerCase().includes(q));
  if (!list.length) { grid.innerHTML = '<p class="none">Ingen treff. <button class="linkbtn" data-act="clear-f">Vis alle</button></p>'; return; }
  grid.innerHTML = '<div class="rgrid">' + list.map(l => linkCard(l, made[l.id])).join('') + '</div>';
  backfillPreviews();
}

function linkCard(l, m) {
  const tile = 't' + (hash(l.id) % 5 + 1);
  const title = l.title || 'Uten navn';
  const tagTxt = (l.tags || []).slice(0, 2).join(', ');
  const img = (m && m.photo) || l.thumb;
  const canPlay = !!(l.embed || embedFor(l.url));
  return '<article class="rcard">'
    + '<button class="rthumb ' + tile + '" data-act="play" data-id="' + l.id + '" aria-label="' + esc((canPlay ? 'Se videoen og oppskriften: ' : 'Se oppskriften: ') + title) + '">'
    + (img ? '<img src="' + photoUrl(img) + '" alt="" loading="lazy">' : '<span class="ini" aria-hidden="true">' + esc(title.trim().charAt(0).toUpperCase()) + '</span>')
    + '<span class="plat ' + esc(l.platform) + '">' + platLabel(l.platform) + '</span>'
    + (m ? '<span class="stamp">Laget' + (m.count > 1 ? ' ' + m.count + '×' : '') + (m.avg != null ? ' · ' + fmt1(m.avg) + '★' : '') + '</span>' : '')
    + '<span class="play">' + ICON.play + '</span>' + (l.recipe ? '<span class="rchip">Oppskrift</span>' : '') + '</button>'
    + '<div class="rbody"><h3>' + esc(title) + '</h3>'
    + (l.note ? '<p class="rnote">' + esc(l.note) + '</p>' : '')
    + (l.author ? '<p class="rauthor">' + esc(l.author) + '</p>' : '')
    + '<div class="rmeta">' + av(l.addedBy, 18) + '<span>' + fmtShort(l.createdAt) + (tagTxt ? ' · ' + esc(tagTxt) : '') + '</span></div>'
    + '<div class="ract"><button class="btn sm" data-act="made" data-id="' + l.id + '">' + (m ? 'Laget igjen' : 'Vi lagde den') + '</button><button class="iconbtn" data-act="edit-link" data-id="' + l.id + '" aria-label="Endre eller slett">' + ICON.more + '</button></div>'
    + '</div></article>';
}

function renderDinners() {
  const stats = $('#din-stats'), chips = $('#din-chips'), list = $('#din-list');
  const all = S.dinners.slice().sort(cmpMade);
  if (!all.length) {
    stats.hidden = true; chips.innerHTML = '';
    list.innerHTML = !S.synced ? loading('Henter middagene…') : emptyBox('sulten', 'Ingen middager logget ennå',
      'Når dere har laget noe, legg det inn her med et bilde. Så gir dere begge en rating etterpå.',
      '<button class="btn primary" data-act="add-dinner">Logg første middag</button>');
    return;
  }
  const rated = all.map(d => ({ d, r: rinfo(d) })).filter(x => x.r.avg != null);
  const avgAll = rated.length ? rated.reduce((a, x) => a + x.r.avg, 0) / rated.length : null;
  const best = rated.slice().sort((a, b) => b.r.avg - a.r.avg || cmpMade(a.d, b.d))[0];
  stats.hidden = false;
  stats.innerHTML = '<div><b>' + all.length + '</b><span>' + (all.length === 1 ? 'middag' : 'middager') + '</span></div>'
    + '<div><b>' + (avgAll != null ? fmt1(avgAll) : '–') + '</b><span>snitt ★</span></div>'
    + '<div class="fav"><b>' + (best ? esc(best.d.title) : 'Ingen ennå') + '</b><span>favoritt</span></div>';
  const missing = all.filter(d => !(((d.ratings || {})[S.me] || {}).stars));
  const F = [['nyeste', 'Nyeste'], ['best', 'Best rangert'], ['mangler', 'Mangler din rating']];
  chips.innerHTML = F.filter(([k]) => k !== 'mangler' || missing.length || S.ds === 'mangler')
    .map(([k, l]) => '<button class="chip-b" data-act="ds" data-k="' + k + '" aria-pressed="' + (S.ds === k) + '">' + l + (k === 'mangler' ? '<span class="n">' + missing.length + '</span>' : '') + '</button>').join('');
  let L = all;
  const av_ = d => { const a = rinfo(d).avg; return a == null ? -1 : a; };
  if (S.ds === 'best') L = all.slice().sort((a, b) => (av_(b) - av_(a)) || cmpMade(a, b));
  else if (S.ds === 'mangler') L = missing;
  list.innerHTML = L.length ? '<ul class="dlist">' + L.map(dinnerRow).join('') + '</ul>' : '<p class="none">Du har ratet alt. Godt jobba!</p>';
}

function dinnerRow(d) {
  const r = rinfo(d), ph = (d.photos || [])[0];
  const rates = peopleFor(d).slice(0, 3).map(uid => {
    const x = (d.ratings || {})[uid];
    return '<span>' + av(uid, 18) + (x && x.stars ? stars(x.stars) : '<em>ikke ratet</em>') + '</span>';
  }).join('');
  return '<li><button class="drow" data-act="open-dinner" data-id="' + d.id + '">'
    + '<span class="dthumb">' + (ph ? '<img src="' + photoUrl(ph) + '" alt="" loading="lazy">' : dog('sulten')) + '</span>'
    + '<span class="dmain"><span class="dt">' + esc(d.title) + '</span>'
    + '<span class="dmeta">' + esc(fmtDay(d.madeOn)) + (d.url ? ' · ' + platLabel(d.platform) : '') + '</span>'
    + '<span class="drates">' + rates + '</span></span>'
    + '<span class="davg">' + (r.avg != null ? '<b>' + fmt1(r.avg) + '</b><small>snitt</small>' : '<small>rate</small>') + '</span>'
    + '</button></li>';
}

function renderPling() {
  const grid = $('#pl-grid'), log = $('#pl-log');
  if (!grid.dataset.built) {
    grid.innerHTML = PLING_ORDER.map(k => {
      const p = PLINGS[k];
      return '<button class="pcard" data-act="pick-pling" data-k="' + k + '">' + dog(p.dog) + '<b>' + (k === 'egen' ? 'Egen melding' : p.title) + '</b><small>' + (p.msg || 'Skriv det du vil') + '</small></button>';
    }).join('');
    grid.dataset.built = '1';
  }
  $('#push-slot').innerHTML = pushCard();
  $('#pl-sub').textContent = partnerId()
    ? 'Trykk på en pølsehund for å sende en pling til ' + partnerName() + '.'
    : 'Plingene venter på kjæresten til hun er med i appen. Du kan sende allerede nå.';
  const L = S.plings.slice(0, 30);
  if (!L.length) { log.innerHTML = !S.synced ? loading('Henter plinger…') : '<p class="none">Ingen plinger ennå. Send den første!</p>'; return; }
  log.innerHTML = '<ul class="plog">' + L.map(p => {
    const def = PLINGS[p.kind] || PLINGS.hei;
    const mine = p.from === S.me;
    const seenOther = Object.keys(p.seenBy || {}).some(k => k !== p.from);
    return '<li class="pli ' + (mine ? 'out' : 'in') + '">' + dog(def.dog)
      + '<div><b>' + (mine ? 'Du → ' + esc(partnerName()) : esc(nm(p.from)) + ' → deg') + ': ' + esc(def.title) + '</b>'
      + (p.text ? '<q>' + esc(p.text) + '</q>' : '')
      + '<small>' + ago(p.createdAt) + (mine ? (seenOther ? ' · sett' : ' · ikke sett ennå') : '') + '</small></div></li>';
  }).join('') + '</ul>';
}

/* ---------- start screens ---------- */
function suggestKey() {
  const r = crypto.getRandomValues(new Uint32Array(5));
  const w = [0, 1, 2, 3].map(i => KEY_WORDS[r[i] % KEY_WORDS.length]);
  return w.join('-') + '-' + (10 + r[4] % 90);
}
function renderStart() {
  const el = $('#start-in');
  const err = S.startErr ? '<p class="err" role="alert">' + esc(S.startErr) + '</p>' : '<p class="err" hidden></p>';
  const top = v => '<div class="dogwrap">' + dog(v, true) + '</div>';
  let h = '';
  if (S.stage === 'boot') h = top('hei') + '<p class="lead">Et øyeblikk…</p>';
  else if (S.stage === 'install') {
    h = top('hei') + '<h1>Legg Pølse &amp; Pasta på hjemskjermen</h1>'
      + '<p class="lead">Da får du appen som en vanlig app, og plingene kommer som varsler.</p>'
      + '<ol class="steps"><li><span>Trykk på <b>Del</b>-knappen ' + ICON.share + ' i Safari.</span></li>'
      + '<li><span>Velg <b>Legg til på Hjem-skjerm</b>, og trykk <b>Legg til</b>.</span></li>'
      + '<li><span>Åpne <b>Pølse&amp;Pasta</b> fra hjemskjermen.</span></li></ol>'
      + '<button class="textbtn" data-act="skip-install">Fortsett i nettleseren i stedet</button>';
  } else if (S.stage === 'offline') {
    h = top('natt') + '<h1>Får ikke kontakt</h1><p class="lead">Sjekk at du er på nett, og prøv igjen.</p>'
      + '<button class="btn primary big" data-act="retry-start">Prøv igjen</button>';
  } else if (S.stage === 'claim') {
    h = '<form class="form" id="f-claim" novalidate>' + top('hei') + '<h1>Velkommen til Pølse &amp; Pasta</h1>'
      + '<p class="lead">Du er den første her. Lag en husnøkkel som dere begge skriver inn i appen. Den holder alt dere legger inn privat.</p>'
      + '<label class="fld"><span>Husnøkkel</span><input class="inp" id="fc-key" name="key" autocomplete="off" autocapitalize="off" spellcheck="false" value="' + esc(S.keyDraft || suggestKey()) + '"></label>'
      + '<p class="small">Bytt den gjerne ut med noe dere husker. Minst 6 tegn.</p>'
      + err + '<button class="btn primary big" type="submit">Lag husnøkkel</button></form>';
  } else if (S.stage === 'key') {
    h = '<form class="form" id="f-key" novalidate>' + top('hei') + '<h1>Skriv inn husnøkkelen</h1>'
      + '<p class="lead">Du får den fra den som satte opp appen.</p>'
      + '<label class="fld"><span>Husnøkkel</span><input class="inp" id="fk-key" name="key" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="f.eks. taco-pesto-sennep-lompe-42"></label>'
      + err + '<button class="btn primary big" type="submit">Fortsett</button></form>';
  } else if (S.stage === 'who') {
    const ids = memberIds();
    h = '<div class="form">' + top('klem') + '<h1>Hvem er du?</h1>';
    if (S.who === 'new' || !ids.length) {
      h += '<form class="form" id="f-new" novalidate><label class="fld"><span>Navnet ditt</span><input class="inp" id="fw-name" name="name" maxlength="24" autocomplete="given-name" placeholder="F.eks. Mads"></label>'
        + err + '<button class="btn primary big" type="submit">Kom i gang</button></form>'
        + (ids.length ? '<button class="textbtn" data-act="who-list">Tilbake</button>' : '');
    } else {
      h += '<p class="lead">Velg deg selv, så vet appen hvem plingene skal til.</p><div class="who">'
        + ids.map(id => '<button class="who-btn" data-act="pick-me" data-id="' + id + '">' + av(id, 40) + esc(nm(id)) + '</button>').join('')
        + '</div><button class="textbtn" data-act="who-new">Jeg er ny her</button>';
    }
    h += '</div>';
  }
  el.innerHTML = h;
}
async function startFlow() {
  S.startErr = '';
  if (isIOS() && !standalone() && !LS.get('pp-skip-install', false) && !S.key) { S.stage = 'install'; render(); return; }
  if (!S.key) {
    S.stage = 'boot'; render();
    try {
      const st = await api('/api/status');
      S.vapid = st.vapidPublicKey; LS.set('pp-vapid', S.vapid);
      S.stage = st.claimed ? 'key' : 'claim';
    } catch (e) { S.stage = 'offline'; }
    render(); return;
  }
  if (!S.me || !S.members[S.me]) {
    S.stage = 'who'; render();
    await sync();
    if (S.me && S.members[S.me]) enterApp(); else render();
    return;
  }
  enterApp();
}
function enterApp() {
  S.stage = 'app';
  render();
  sync().then(checkOverlay);
  checkPush().then(() => {
    render();
    if (S.push === 'off' && !LS.get('pp-push-asked', false)) { LS.set('pp-push-asked', true); openSheet(pushSheet(), { type: 'push' }, 'Varsler'); }
  });
}
function pushSheet() {
  return '<div class="form">'
    + '<div style="max-width:240px;margin:0 auto;width:100%">' + dog('klar', true) + '</div>'
    + '<h2 class="sh-title center">Vil du ha plinger på låseskjermen?</h2>'
    + '<p class="muted center">Når ' + esc(partnerName()) + ' sender en pling, kommer den som et varsel, også når appen er lukket.</p>'
    + '<p class="err" hidden></p>'
    + '<button class="btn primary big" type="button" data-act="push-on">Slå på varsler</button>'
    + '<button class="textbtn" type="button" data-act="close-sheet">Ikke nå</button></div>';
}

/* ---------- sheets ---------- */
function openSheet(html, state, label) {
  S.sheet = state;
  const sh = $('#sheet'), panel = $('.panel', sh);
  $('.sheet-body', sh).innerHTML = html;
  panel.setAttribute('aria-label', label || 'Skjema');
  panel.scrollTop = 0;
  sh.hidden = false;
  document.body.classList.add('locked');
  requestAnimationFrame(() => requestAnimationFrame(() => sh.classList.add('open')));
  setTimeout(() => { try { panel.focus({ preventScroll: true }); } catch (e) {} }, 60);
}
function closeSheet() {
  const st = S.sheet;
  if (st && st.files) st.files.forEach(f => { try { URL.revokeObjectURL(f.url); } catch (e) {} });
  S.sheet = null;
  const sh = $('#sheet');
  sh.classList.remove('open');
  document.body.classList.remove('locked');
  setTimeout(() => { if (!S.sheet) { sh.hidden = true; $('.sheet-body', sh).innerHTML = ''; } }, 240);
}
function ferr(f, msg) { const e = f && f.querySelector('.err'); if (e) { e.textContent = msg; e.hidden = false; } else toast(msg); }
function busy(btn, on, txt) {
  if (!btn) return;
  if (on) { btn.dataset.label = btn.dataset.label || btn.innerHTML; btn.disabled = true; if (txt) btn.textContent = txt; }
  else { btn.disabled = false; if (btn.dataset.label) btn.innerHTML = btn.dataset.label; }
}
let toastT = null;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2800);
}
const QUEUED = 'Lagret på telefonen. Sendes når du er på nett igjen.';
function errMsg(e) {
  const c = e && e.code;
  if (c === 'offline') return 'Du er ikke på nett. Prøv igjen når du har dekning.';
  if (c === 'too_big') return 'Bildet er for stort. Prøv et mindre bilde.';
  if (c === 'type') return 'Den bildetypen støttes ikke. Prøv et JPG- eller PNG-bilde.';
  if (c === 'decode') return 'Klarte ikke å lese bildet. Prøv et annet bilde.';
  if (c === 'slow') return 'For mange feil forsøk. Vent et kvarter og prøv igjen.';
  if (c === 'key') return 'Feil husnøkkel.';
  if (e && e.message) return e.message;
  return 'Noe gikk galt. Prøv igjen.';
}

/* Settings */
function settingsSheet() {
  const me = S.members[S.me] || {};
  const pushTxt = { on: 'På', off: 'Av', denied: 'Blokkert i iPhone-innstillingene', install: 'Legg appen på hjemskjermen først', unsupported: 'Støttes ikke i denne nettleseren', unknown: '…' }[S.push];
  return '<div class="form">'
    + '<h2 class="sh-title">Innstillinger</h2>'
    + '<form class="form" id="f-name" novalidate><label class="fld"><span>Navnet ditt</span><input class="inp" id="fn-name" name="name" maxlength="24" value="' + esc(me.name || '') + '"></label>'
    + '<p class="err" hidden></p><div><button class="btn sm primary" type="submit">Lagre navn</button></div></form>'
    + '<div class="set-sec"><h3>Varsler</h3><p class="status-l' + (S.push === 'on' ? ' on' : '') + '">' + pushTxt + '</p><div class="set-row">'
    + (S.push === 'on' ? '<button class="btn sm" data-act="push-test">Send testvarsel til meg</button><button class="btn sm ghost" data-act="push-off">Slå av</button>' : '')
    + (S.push === 'off' ? '<button class="btn sm primary" data-act="push-on">Slå på varsler</button>' : '')
    + (S.push === 'install' ? '<button class="btn sm" data-act="install-help">Slik legger du den på hjemskjermen</button>' : '')
    + '</div></div>'
    + '<div class="set-sec"><h3>Husnøkkel</h3><div class="keybox"><code id="keytext">' + esc(S.key) + '</code><button class="btn sm" data-act="copy-key">Kopier</button></div>'
    + '<p class="small">Den andre trenger denne for å komme inn. Del den bare med hverandre.</p>'
    + '<div class="set-row"><button class="btn sm" data-act="invite">Del appen</button></div></div>'
    + '<div class="set-sec"><h3>Denne telefonen</h3><div class="set-row"><button class="btn sm ghost" data-act="switch-me">Bytt person</button><button class="btn sm ghost danger" data-act="logout-ask">Logg ut</button></div>'
    + '<div class="confirm" id="logout-confirm" hidden><p>Logge ut på denne telefonen? Dataene blir liggende på serveren.</p><div><button class="btn primary" data-act="logout-yes">Ja, logg ut</button><button class="btn ghost" data-act="logout-no">Avbryt</button></div></div></div>'
    + '</div>';
}
function inviteText() {
  return 'Her er appen vår, Pølse & Pasta: ' + location.origin + '/\n\n'
    + '1. Åpne lenken i Safari.\n2. Trykk Del → Legg til på Hjem-skjerm.\n3. Åpne appen fra hjemskjermen og skriv inn husnøkkelen: ' + S.key;
}
function inviteSheet() {
  return '<div class="form">'
    + '<div style="max-width:230px;margin:0 auto;width:100%">' + dog('klem', true) + '</div>'
    + '<h2 class="sh-title center">Få madammen med</h2>'
    + '<p class="muted">Send henne adressen og husnøkkelen. Hun åpner lenken i Safari, legger appen på hjemskjermen, og skriver inn nøkkelen.</p>'
    + '<div class="keybox"><code>' + esc(location.origin + '/') + '</code></div>'
    + '<div class="keybox"><code>' + esc(S.key) + '</code></div>'
    + (navigator.share ? '<button class="btn primary big" data-act="share-invite">Del med madammen</button>' : '')
    + '<button class="btn' + (navigator.share ? '' : ' primary big') + '" data-act="copy-invite">Kopier meldingen</button></div>';
}
function installSheet() {
  return '<div class="form"><h2 class="sh-title">Legg appen på hjemskjermen</h2>'
    + '<ol class="steps"><li><span>Åpne <b>' + esc(location.host) + '</b> i <b>Safari</b>.</span></li>'
    + '<li><span>Trykk <b>Del</b> ' + ICON.share + ' → <b>Legg til på Hjem-skjerm</b> → <b>Legg til</b>.</span></li>'
    + '<li><span>Åpne <b>Pølse&amp;Pasta</b> fra hjemskjermen, skriv inn husnøkkelen og slå på varsler.</span></li></ol>'
    + '<p class="small">Appen på hjemskjermen husker ikke det du skrev i Safari, så du skriver inn husnøkkelen én gang til der.</p>'
    + '<button class="btn primary big" data-act="close-sheet">Skjønner</button></div>';
}
async function copyText(txt) {
  try { await navigator.clipboard.writeText(txt); toast('Kopiert'); }
  catch (e) { toast('Klarte ikke å kopiere. Merk teksten og kopier selv.'); }
}

/* Link sheet */
function linkSheet(l) {
  const edit = !!l;
  return '<form class="form" id="f-link" novalidate' + (edit ? ' data-id="' + l.id + '"' : '') + '>'
    + '<h2 class="sh-title">' + (edit ? 'Endre oppskrift' : 'Lagre en video') + '</h2>'
    + (edit ? '' : '<p class="hint">I TikTok eller Instagram: trykk <b>Del</b> → <b>Kopier lenke</b>, og lim inn her.</p>')
    + '<label class="fld"><span>Lenke</span><input class="inp" id="fl-url" name="url" type="url" inputmode="url" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="https://www.tiktok.com/@…" value="' + esc(edit ? l.url : '') + '"><em class="detect" id="fl-detect"></em></label>'
    + '<div id="fl-prev"></div>'
    + '<label class="fld"><span>Hva er det?</span><input class="inp" id="fl-title" name="title" maxlength="80" placeholder="F.eks. Kremet gochujang-pasta" value="' + esc(edit ? l.title : '') + '"></label>'
    + '<label class="fld"><span>Notat <i>(valgfritt)</i></span><textarea class="inp" id="fl-note" name="note" rows="2" maxlength="300" placeholder="F.eks. bytt fløte med kokosmelk">' + esc(edit ? (l.note || '') : '') + '</textarea></label>'
    + '<fieldset class="fld"><legend>Merkelapper</legend><div class="chipset">'
    + TAGS.map(t => '<label class="chip"><input type="checkbox" name="tags" value="' + t + '"' + (edit && (l.tags || []).includes(t) ? ' checked' : '') + '><span>' + t + '</span></label>').join('')
    + '</div></fieldset>'
    + (!edit && partnerId() ? '<label class="toggle"><input type="checkbox" id="fl-pling" name="pling" checked><span>Send pling til ' + esc(partnerName()) + ' om denne</span></label>' : '')
    + '<p class="err" hidden></p>'
    + '<div class="sh-actions">'
    + (edit ? '<button type="button" class="btn ghost danger" data-act="del-link-ask">Slett</button>' : '')
    + '<button class="btn primary grow" type="submit">' + (edit ? 'Lagre endringer' : 'Lagre') + '</button></div>'
    + (edit ? '<div class="confirm" id="del-confirm" hidden><p>Slette «' + esc(l.title) + '» fra Inspo?</p><div><button type="button" class="btn primary" data-act="del-link-yes" data-id="' + l.id + '">Ja, slett</button><button type="button" class="btn ghost" data-act="del-link-no">Avbryt</button></div></div>' : '')
    + '</form>';
}
function updateDetect() {
  const inp = $('#fl-url'), out = $('#fl-detect');
  if (!inp || !out) return;
  const u = extractUrl(inp.value);
  if (!inp.value.trim()) { out.textContent = ''; out.className = 'detect'; return; }
  if (!u) { out.textContent = 'Lenken må starte med https://'; out.className = 'detect'; return; }
  const p = detect(u);
  out.textContent = p === 'web' ? 'Lenke funnet' : platLabel(p) + '-lenke funnet';
  out.className = 'detect ok';
}
async function saveLink(f) {
  const btn = f.querySelector('[type=submit]');
  const id = f.dataset.id || null;
  let url = extractUrl(f.url.value);
  if (!url) return ferr(f, 'Lim inn lenken til videoen. Den skal starte med https://');
  const pv = S.sheet && S.sheet.preview && S.sheet.preview.for === url ? S.sheet.preview : null;
  if (pv && pv.canonical) url = pv.canonical;
  const norm = normUrl(url);
  const dup = S.links.find(l => l.id !== id && normUrl(l.url) === norm);
  if (dup) return ferr(f, 'Denne er allerede lagret som «' + (dup.title || 'uten navn') + '».');
  const platform = detect(url);
  const title = f.title.value.trim() || ('Oppskrift fra ' + platLabel(platform));
  const note = f.note.value.trim();
  const tags = [...f.querySelectorAll('input[name=tags]:checked')].map(i => i.value);
  const extra = { embed: (pv && pv.embed) || embedFor(url) || null };
  if (pv) { extra.previewTried = true; if (pv.photo) extra.thumb = pv.photo; if (pv.author) extra.author = pv.author; }
  busy(btn, true, 'Lagrer…');
  try {
    if (id) {
      const r = await write([{ op: 'merge', coll: 'links', id, data: Object.assign({ url, platform, title, note, tags }, extra) }]);
      closeSheet(); toast(r.queued ? QUEUED : 'Endringene er lagret');
    } else {
      const newIdv = newId();
      const pl = f.pling && f.pling.checked;
      const ops = [{ op: 'set', coll: 'links', id: newIdv, data: Object.assign({ url, platform, title, note, tags, addedBy: S.me, createdAt: Date.now() }, extra) }];
      if (pl) ops.push(plingOp('oppskrift', title, { type: 'link', id: newIdv }));
      S.lf = 'alle'; S.tagf = null; S.tab = 'inspo';
      const r = await write(ops);
      closeSheet();
      toast(r.queued ? QUEUED : pl ? 'Lagret, og ' + partnerName() + ' er plinget' : 'Lagret i Inspo');
    }
  } catch (e) { busy(btn, false); ferr(f, errMsg(e)); }
}

/* Photos */
async function compress(file) {
  const draw = (src, w, h, max, q) => {
    const s = Math.min(1, max / Math.max(w, h));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * s)); c.height = Math.max(1, Math.round(h * s));
    c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
    return new Promise(r => c.toBlob(r, 'image/jpeg', q));
  };
  let src = null, w = 0, h = 0;
  try { if (window.createImageBitmap) { src = await createImageBitmap(file); w = src.width; h = src.height; } } catch (e) { src = null; }
  if (!src) {
    try {
      const url = URL.createObjectURL(file);
      const img = new Image();
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
      src = img; w = img.naturalWidth; h = img.naturalHeight;
    } catch (e) { src = null; }
  }
  if (src && w && h) {
    for (const [max, q] of [[1600, 0.84], [1400, 0.75], [1100, 0.7]]) {
      const b = await draw(src, w, h, max, q);
      if (b && b.size < 1800 * 1024) return b;
    }
  }
  if (['image/jpeg', 'image/png', 'image/webp'].includes(file.type) && file.size < 1800 * 1024) return file;
  throw { code: 'decode' };
}
async function upload(blob) {
  const r = await api('/api/photo', { method: 'POST', raw: blob, type: blob.type || 'image/jpeg' });
  return r.id;
}

/* Dinner form */
function dinnerForm(linkId) {
  const l = linkId ? linkById(linkId) : null;
  const pick = !l && S.links.length;
  return '<form class="form" id="f-dinner" novalidate>'
    + '<h2 class="sh-title">Logg middag</h2>'
    + (l ? '<div class="src"><span class="plat ' + esc(l.platform) + '">' + platLabel(l.platform) + '</span><b>' + esc(l.title) + '</b></div>' : '')
    + (pick ? '<label class="fld"><span>Fra en lagret video <i>(valgfritt)</i></span><select class="inp" id="fd-link" name="linkId"><option value="">Ingen, eller en annen lenke</option>'
      + S.links.map(x => '<option value="' + x.id + '">' + esc(x.title) + '</option>').join('') + '</select></label>' : '')
    + '<label class="fld"><span>Hva lagde dere?</span><input class="inp" id="fd-title" name="title" maxlength="80" placeholder="F.eks. Smash-tacos" value="' + esc(l ? l.title : '') + '"></label>'
    + (l ? '' : '<label class="fld" id="fd-url-wrap"><span>Lenke til videoen <i>(valgfritt)</i></span><input class="inp" id="fd-url" name="url" type="url" inputmode="url" autocapitalize="off" spellcheck="false" placeholder="https://"></label>')
    + '<label class="fld"><span>Dato</span><input class="inp" id="fd-date" name="madeOn" type="date" value="' + today() + '" max="' + today() + '"></label>'
    + '<fieldset class="fld"><legend>Bilder</legend>'
    + '<div class="ph-pick"><div class="ph-prev" id="fd-prev"></div><label class="ph-add">' + ICON.cam + '<span>Legg til bilde</span><input class="vh" id="fd-photos" type="file" accept="image/*" multiple></label></div>'
    + '</fieldset>'
    + '<fieldset class="fld"><legend>Din rating</legend>' + starInput('fd', 0)
    + '<div class="seg" role="radiogroup" aria-label="Lage igjen?" style="margin-top:10px">'
    + ['ja', 'kanskje', 'nei'].map(k => '<label><input type="radio" name="again" value="' + k + '"><span>' + { ja: 'Lage igjen', kanskje: 'Kanskje', nei: 'Aldri igjen' }[k] + '</span></label>').join('')
    + '</div>'
    + '<textarea class="inp" id="fd-comment" name="comment" rows="2" maxlength="400" placeholder="Hva syntes du? Noe å gjøre annerledes neste gang?" style="margin-top:10px"></textarea></fieldset>'
    + (partnerId() ? '<label class="toggle"><input type="checkbox" id="fd-ask" name="askrate" checked><span>Be ' + esc(partnerName()) + ' om å rate den</span></label>' : '')
    + '<p class="err" hidden></p>'
    + '<button class="btn primary big" type="submit">Lagre middag</button></form>';
}
function renderPreviews() {
  const el = $('#fd-prev'); if (!el || !S.sheet) return;
  el.innerHTML = S.sheet.files.map((f, i) => '<figure><img src="' + f.url + '" alt="Valgt bilde ' + (i + 1) + '"><button type="button" data-act="unpick" data-i="' + i + '" aria-label="Fjern bildet">' + ICON.x + '</button></figure>').join('');
}
async function saveDinner(f) {
  const st = S.sheet, btn = f.querySelector('[type=submit]');
  const title = f.title.value.trim();
  if (!title) return ferr(f, 'Gi middagen et navn først.');
  let linkId = st.linkId || (f.linkId ? f.linkId.value : '') || null;
  let url = '', platform = null;
  const l = linkId ? linkById(linkId) : null;
  if (l) { url = l.url; platform = l.platform; } else linkId = null;
  if (!l && f.url && f.url.value.trim()) {
    url = extractUrl(f.url.value);
    if (!url) return ferr(f, 'Lenken ser ikke riktig ut. Den skal starte med https://');
    platform = detect(url);
  }
  const madeOn = parseDay(f.madeOn.value) ? f.madeOn.value : today();
  const comment = f.comment.value.trim();
  const ag = f.querySelector('input[name=again]:checked');
  busy(btn, true, 'Lagrer…');
  try {
    for (let i = 0; i < st.files.length; i++) {
      if (st.files[i].id) continue;
      btn.textContent = 'Laster opp bilde ' + (i + 1) + ' av ' + st.files.length + '…';
      st.files[i].id = await upload(st.files[i].blob);
    }
    const ratings = {};
    if (st.stars || comment || ag) ratings[S.me] = { stars: st.stars || 0, comment, again: ag ? ag.value : null, at: Date.now() };
    const id = newId();
    const ops = [{ op: 'set', coll: 'dinners', id, data: { title, url, platform, linkId, madeOn, photos: st.files.map(x => x.id), ratings, addedBy: S.me, createdAt: Date.now() } }];
    const ask = f.askrate && f.askrate.checked;
    if (ask) ops.push(plingOp('rating', title, { type: 'dinner', id }));
    S.tab = 'middager'; S.ds = 'nyeste';
    const r = await write(ops);
    closeSheet();
    window.scrollTo({ top: 0 });
    toast(r.queued ? QUEUED : ask ? 'Logget, og ' + partnerName() + ' er bedt om å rate' : 'Middagen er logget');
  } catch (e) { busy(btn, false); ferr(f, e.code === 'offline' ? 'Du må være på nett for å laste opp bilder.' : errMsg(e)); }
}

/* Dinner detail */
function dinnerDetail(d) {
  const st = S.sheet;
  const photos = d.photos || [];
  const r = rinfo(d);
  const mineR = (d.ratings || {})[S.me] || {};
  const draft = st.draft != null ? st.draft : (mineR.comment || '');
  let h = '<div class="form">';
  h += '<h2 class="sh-title">' + esc(d.title) + '</h2>';
  h += '<div class="dd-meta"><span>' + esc(fmtDay(d.madeOn)) + ' · logget av ' + esc(nm(d.addedBy)) + '</span>'
    + (d.url ? '<a href="' + esc(safeHref(d.url)) + '" target="_blank" rel="noopener noreferrer">' + openLabel(d.platform) + ICON.ext + '</a>' : '') + '</div>';
  if (photos.length) {
    h += '<div class="phs' + (photos.length === 1 ? ' one' : '') + '">' + photos.map(id =>
      '<figure class="ph"><img src="' + photoUrl(id) + '" alt="Bilde av ' + esc(d.title) + '" loading="lazy">'
      + '<button class="rm" data-act="ph-rm-ask" data-pid="' + esc(id) + '">Fjern</button></figure>').join('') + '</div>';
  }
  if (st.confirm && st.confirm.indexOf('ph:') === 0) {
    h += '<div class="confirm"><p>Fjerne dette bildet?</p><div><button class="btn primary" data-act="ph-rm-yes">Ja, fjern</button><button class="btn ghost" data-act="confirm-no">Avbryt</button></div></div>';
  }
  h += '<div><label class="ph-add" style="height:auto;padding:12px 14px">' + ICON.cam + '<span>' + (st.uploading ? 'Laster opp…' : (photos.length ? 'Legg til flere bilder' : 'Legg til bilde')) + '</span><input class="vh" id="dd-photos" type="file" accept="image/*" multiple' + (st.uploading ? ' disabled' : '') + '></label></div>';
  if (r.avg != null) h += '<div class="dd-avg"><b>' + fmt1(r.avg) + '</b>' + stars(Math.round(r.avg)) + '<span>' + (r.n === 1 ? 'én rating' : 'snitt av ' + r.n) + '</span></div>';
  peopleFor(d).forEach(uid => {
    const x = (d.ratings || {})[uid] || {};
    if (uid === S.me) {
      h += '<div class="rblock"><h4>' + av(uid, 24) + 'Din rating</h4>' + starInput('dd', x.stars || 0, d.id)
        + '<div class="seg" role="radiogroup" aria-label="Lage igjen?">'
        + ['ja', 'kanskje', 'nei'].map(k => '<label><input type="radio" name="dd-again" data-act-change="again" data-id="' + d.id + '" value="' + k + '"' + (x.again === k ? ' checked' : '') + '><span>' + { ja: 'Lage igjen', kanskje: 'Kanskje', nei: 'Aldri igjen' }[k] + '</span></label>').join('')
        + '</div>'
        + '<label class="vh" for="dd-comment">Kommentar</label><textarea class="inp" id="dd-comment" rows="2" maxlength="400" placeholder="Hva syntes du?">' + esc(draft) + '</textarea>'
        + (draft !== (x.comment || '') ? '<div><button class="btn sm primary" data-act="save-comment" data-id="' + d.id + '">Lagre kommentar</button></div>' : '')
        + '</div>';
    } else {
      h += '<div class="rblock"><h4>' + av(uid, 24) + esc(nm(uid)) + '</h4>';
      if (x.stars) h += stars(x.stars) + (x.again ? '<span class="again-l">' + AGAIN[x.again] + '</span>' : '') + (x.comment ? '<blockquote>«' + esc(x.comment) + '»</blockquote>' : '');
      else h += '<p class="muted">Har ikke ratet ennå.</p><div><button class="btn sm" data-act="nag" data-id="' + d.id + '">Mas om rating</button></div>';
      h += '</div>';
    }
  });
  h += '<details class="more"' + (st.openMore ? ' open' : '') + '><summary>Endre eller slett</summary>'
    + '<form class="form" id="f-ddedit" data-id="' + d.id + '" novalidate>'
    + '<label class="fld"><span>Navn</span><input class="inp" id="de-title" name="title" maxlength="80" value="' + esc(d.title) + '"></label>'
    + '<label class="fld"><span>Dato</span><input class="inp" id="de-date" name="madeOn" type="date" value="' + esc(d.madeOn || '') + '" max="' + today() + '"></label>'
    + '<p class="err" hidden></p>'
    + '<div class="sh-actions"><button type="button" class="btn ghost danger" data-act="del-dinner-ask">Slett middagen</button><button class="btn primary grow" type="submit">Lagre</button></div>'
    + (st.confirm === 'del' ? '<div class="confirm"><p>Slette «' + esc(d.title) + '» og bildene?</p><div><button type="button" class="btn primary" data-act="del-dinner-yes">Ja, slett</button><button type="button" class="btn ghost" data-act="confirm-no">Avbryt</button></div></div>' : '')
    + '</form></details>';
  return h + '</div>';
}
function openDinner(id) {
  const d = dinnerById(id); if (!d) return;
  openSheet('', { type: 'dinner', id }, d.title);
  renderDetail(true);
}
function renderDetail(force) {
  const st = S.sheet;
  if (!st || st.type !== 'dinner') return;
  const d = dinnerById(st.id);
  if (!d) { closeSheet(); toast('Middagen er slettet'); return; }
  const sh = $('#sheet'), ae = document.activeElement;
  if (!force && ae && sh.contains(ae) && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName) && ae.type !== 'radio' && ae.type !== 'file') { st.stale = true; return; }
  const panel = $('.panel', sh), top = panel.scrollTop;
  const det = sh.querySelector('details.more');
  if (det) st.openMore = det.open;
  $('.sheet-body', sh).innerHTML = dinnerDetail(d);
  panel.scrollTop = top;
  st.stale = false;
}
function setMyRating(id, patch) {
  return write([{ op: 'merge', coll: 'dinners', id, data: { ratings: { [S.me]: Object.assign({}, patch, { at: Date.now() }) } } }])
    .catch(e => toast(errMsg(e)));
}

/* Plings */
function plingOp(kind, text, ref) {
  const def = PLINGS[kind] || PLINGS.hei;
  const me = nm(S.me);
  let body = text || def.msg;
  if (kind === 'oppskrift') body = 'Fant noe vi må lage: ' + text;
  if (kind === 'rating') body = 'Hva syntes du om ' + text + '? Gi den en rating!';
  if (kind === 'handle' && text) body = 'Kan du ta med: ' + text;
  return { op: 'set', coll: 'plings', id: newId(), data: {
    kind, text: String(text || '').slice(0, 200), ref: ref || null, from: S.me, createdAt: Date.now(), seenBy: {},
    note: { title: def.emoji + ' ' + me + ': ' + (kind === 'egen' ? 'Ny melding' : def.title), body: body.slice(0, 200) }
  } };
}
async function sendPling(kind, text, ref) {
  const r = await write([plingOp(kind, text, ref)]);
  toast(r.queued ? QUEUED : partnerId() ? 'Plinget ' + partnerName() + '!' : 'Sendt! Den venter til kjæresten er med.');
}
function plingSheet(kind) {
  const p = PLINGS[kind];
  return '<form class="form" id="f-pling" data-kind="' + kind + '" novalidate>'
    + '<div style="max-width:260px;margin:0 auto;width:100%">' + dog(p.dog, true) + '</div>'
    + '<h2 class="sh-title center">' + (kind === 'egen' ? 'Egen melding' : p.title) + '</h2>'
    + (p.msg ? '<p class="muted center">' + esc(p.msg) + '</p>' : '')
    + (p.input ? '<label class="fld"><span>' + p.label + (p.custom ? '' : ' <i>(valgfritt)</i>') + '</span><input class="inp" id="fp-text" name="text" maxlength="200" autocomplete="off" placeholder="' + esc(p.input) + '"></label>' : '')
    + (kind === 'handle' && shopTodo().length ? '<label class="toggle"><input type="checkbox" id="fp-attach" name="attach" checked><span>Legg ved handlelisten (' + shopTodo().length + (shopTodo().length === 1 ? ' vare' : ' varer') + ')</span></label>' : '')
    + '<p class="err" hidden></p>'
    + '<button class="btn primary big" type="submit">Send til ' + esc(partnerName()) + '</button></form>';
}
async function submitPling(f) {
  const kind = f.dataset.kind, def = PLINGS[kind], btn = f.querySelector('[type=submit]');
  let text = f.text ? f.text.value.trim() : '', ref = null;
  if (def.custom && !text) return ferr(f, 'Skriv en melding først.');
  if (f.attach && f.attach.checked) {
    const names = shopTodo().map(i => i.name);
    text = (text ? text + '. Pluss: ' : '') + names.slice(0, 12).join(', ') + (names.length > 12 ? ' og ' + (names.length - 12) + ' til' : '');
    ref = { type: 'shop' };
  }
  busy(btn, true, 'Sender…');
  try { await sendPling(kind, text, ref); closeSheet(); }
  catch (e) { busy(btn, false); ferr(f, errMsg(e)); }
}
function markSeen(ids) {
  if (!canW() || !ids.length) return;
  write(ids.map(id => ({ op: 'merge', coll: 'plings', id, data: { seenBy: { [S.me]: Date.now() } } }))).catch(() => {});
}

/* Incoming overlay */
function checkOverlay() {
  if (S.ovId || S.stage !== 'app') return;
  const u = unseen();
  if (u.length) showOverlay(u[0], u.length - 1);
}
function showOverlay(p, more) {
  S.ovId = p.id;
  const def = PLINGS[p.kind] || PLINGS.hei;
  let ref = '', text = p.text;
  if (p.ref && p.ref.type === 'link') {
    const l = linkById(p.ref.id);
    text = '';
    ref = l
      ? '<div class="ov-ref"><span class="plat ' + esc(l.platform) + '">' + platLabel(l.platform) + '</span><b>' + esc(l.title) + '</b><a class="btn sm" href="' + esc(safeHref(l.url)) + '" target="_blank" rel="noopener noreferrer">' + openLabel(l.platform) + ICON.ext + '</a></div>'
      : (p.text ? '<div class="ov-ref"><b>' + esc(p.text) + '</b></div>' : '');
  } else if (p.ref && p.ref.type === 'dinner') {
    const d = dinnerById(p.ref.id);
    text = '';
    ref = d ? '<div class="ov-ref"><b>' + esc(d.title) + '</b><button class="btn sm primary" data-act="ov-rate" data-id="' + d.id + '">Gi rating nå</button></div>' : '';
  } else if (p.ref && p.ref.type === 'quiz') {
    const q = S.quiz.find(x => x.id === p.ref.id);
    ref = q ? '<div class="ov-ref"><button class="btn sm primary" data-act="ov-quiz" data-id="' + q.id + '">' + (quizState(q).mine ? 'Svar nå' : 'Se runden') + '</button></div>' : '';
  } else if (p.ref && p.ref.type === 'shop') {
    ref = '<div class="ov-ref"><button class="btn sm primary" data-act="ov-shop">Se handlelisten</button></div>';
  } else if (p.ref && p.ref.type === 'game') {
    ref = '<div class="ov-ref"><button class="btn sm primary" data-act="ov-game">Spill dagens bane</button></div>';
  }
  const ov = $('#ov');
  ov.innerHTML = '<div class="ov-card"><div class="ov-band gingham" aria-hidden="true"></div>'
    + '<p class="ov-from">Pling fra ' + esc(nm(p.from)) + ' · ' + ago(p.createdAt) + '</p>'
    + '<div class="ov-dog">' + dog(def.dog, true) + '</div>'
    + '<h2>' + (p.kind === 'egen' ? 'Melding' : def.title) + '</h2>'
    + (def.msg ? '<p>' + esc(def.msg) + '</p>' : '')
    + (text ? '<p class="ov-text">' + esc(text) + '</p>' : '')
    + ref
    + '<div class="ov-actions">'
    + '<button class="btn primary" data-act="ov-reply">' + (p.kind === 'klem' ? 'Send klem tilbake' : 'Send en klem') + '</button>'
    + '<button class="btn ghost" data-act="ov-close">' + (more ? 'Neste pling (' + more + ' til)' : 'Lukk') + '</button>'
    + (more ? '<button class="ov-all" data-act="ov-all">Marker alle som sett</button>' : '')
    + '</div></div>';
  ov.hidden = false;
}
function closeOverlay(all) {
  const id = S.ovId; if (!id) return;
  const ids = all ? unseen().map(p => p.id) : [id];
  if (!ids.includes(id)) ids.push(id);
  ids.forEach(i => S.dismissed.add(i));
  S.ovId = null;
  const ov = $('#ov'); ov.hidden = true; ov.innerHTML = '';
  markSeen(ids);
  renderBadge();
  if (S.tab === 'pling') renderPling();
  setTimeout(checkOverlay, 300);
}

/* Little sound + buzz when a pling lands while the app is open */
let actx = null;
document.addEventListener('pointerdown', () => {
  try {
    if (!actx) { const A = window.AudioContext || window.webkitAudioContext; if (A) actx = new A(); }
    else if (actx.state === 'suspended') actx.resume();
  } catch (e) {}
}, { passive: true });
function ping() {
  try { if (navigator.vibrate) navigator.vibrate([70, 40, 70]); } catch (e) {}
  if (!actx || actx.state !== 'running') return;
  try {
    const t = actx.currentTime;
    [740, 988].forEach((f, i) => {
      const o = actx.createOscillator(), g = actx.createGain(), s = t + i * 0.13;
      o.type = 'triangle'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, s);
      g.gain.exponentialRampToValueAtTime(0.18, s + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, s + 0.2);
      o.connect(g); g.connect(actx.destination); o.start(s); o.stop(s + 0.22);
    });
  } catch (e) {}
}

/* ---------- Pølsa: the shared dachshund ---------- */
const PET_DEF = { name: 'Pølsa', remind: { on: true, first: '18:00', last: '21:30' } };
function pet() {
  const p = S.docs.settings.pet || {};
  return Object.assign({}, PET_DEF, p, { remind: Object.assign({}, PET_DEF.remind, p.remind || {}) });
}
function addDay(s, n) {
  const d = parseDay(s); d.setDate(d.getDate() + n);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function streak() {
  const fed = S.docs.feeds, t = today();
  let n = 0, d = fed[t] ? t : addDay(t, -1);
  while (fed[d]) { n++; d = addDay(d, -1); }
  let best = 0, run = 0, prev = null;
  Object.keys(fed).sort().forEach(k => { run = prev && addDay(prev, 1) === k ? run + 1 : 1; best = Math.max(best, run); prev = k; });
  return { n, best, today: fed[t] || null };
}
const hm = ts => new Date(ts).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' });
const fmtTime = t => String(t).replace(':', '.');
const dagerTxt = n => n === 1 ? 'dag' : 'dager';
function polsaBadge() {
  const turns = S.quiz.filter(q => quizState(q).mine).length;
  return turns + (streak().today ? 0 : 1);
}
function renderPolsa() {
  const p = pet(), s = streak(), name = esc(p.name);
  $('#h-polsa').textContent = p.name;
  const hr = new Date().getHours();
  const fresh = S.justFed && Date.now() - S.justFed < 8000;
  const v = !s.today ? 'sulten' : fresh ? 'klem' : (hr >= 22 || hr < 6) ? 'natt' : 'hei';
  let status;
  if (!s.today) status = '<b>' + name + ' er sulten.</b> Ingen har gitt mat i dag.' + (s.n ? ' Streaken på ' + s.n + ' ' + dagerTxt(s.n) + ' står på spill.' : '');
  else {
    const treats = Object.values(s.today.treats || {}).reduce((a, b) => a + b, 0);
    status = '<b>Mett og fornøyd!</b> ' + esc(s.today.by === S.me ? 'Du' : nm(s.today.by)) + ' ga ' + name + ' mat kl. ' + hm(s.today.at) + '.'
      + (treats ? ' Pluss ' + treats + (treats === 1 ? ' godbit' : ' godbiter') + ' i dag.' : '');
  }
  const myTreats = s.today ? ((s.today.treats || {})[S.me] || 0) : 0;
  const btn = !s.today
    ? '<button class="btn primary big" data-act="feed">Gi ' + name + ' mat</button>'
    : '<button class="btn big" data-act="treat"' + (myTreats >= 5 ? ' disabled' : '') + '>' + (myTreats >= 5 ? name + ' er stappmett' : 'Gi en godbit') + '</button>';
  let days = '';
  for (let i = 13; i >= 0; i--) {
    const d = addDay(today(), -i), f = S.docs.feeds[d];
    const wd = parseDay(d).toLocaleDateString('nb-NO', { weekday: 'short' }).charAt(0).toUpperCase();
    days += '<li class="' + (f ? 'fed' : '') + (i === 0 ? ' today' : '') + '" title="' + esc(fmtDay(d) + (f ? ': ' + nm(f.by) : ': ingen mat')) + '"><i>' + (f ? esc((nm(f.by) || '?').charAt(0).toUpperCase()) : '') + '</i><span>' + wd + '</span></li>';
  }
  const r = p.remind;
  $('#pet-slot').innerHTML = '<div class="petcard">'
    + '<div class="pet-dog">' + dog(v, true) + '</div>'
    + '<p class="pet-status">' + status + '</p>' + btn
    + '<div class="streak"><div><b>' + s.n + '</b><span>' + dagerTxt(s.n) + ' på rad</span></div><div><b>' + s.best + '</b><span>beste streak</span></div></div>'
    + '<ol class="days" aria-label="Hvem som ga mat de siste 14 dagene">' + days + '</ol>'
    + '<p class="small">' + (r.on ? 'Varsel kl. ' + fmtTime(r.first) + (r.last !== r.first ? ' og ' + fmtTime(r.last) : '') + ' hvis ingen har gitt mat.' : 'Påminnelser er av.') + ' <button class="linkbtn" data-act="pet-settings">Endre</button></p>'
    + '</div>';
  renderGameCard();
  renderQuizCard();
}
function petSheet() {
  const p = pet(), r = p.remind;
  const slots = (from, to) => { const o = []; for (let m = from * 60; m <= to * 60 + 30; m += 30) o.push(String(Math.floor(m / 60)).padStart(2, '0') + ':' + (m % 60 ? '30' : '00')); return o; };
  const sel = (id, val, list) => '<select class="inp" id="fp-' + id + '" name="' + id + '">' + list.map(t => '<option value="' + t + '"' + (t === val ? ' selected' : '') + '>' + fmtTime(t) + '</option>').join('') + '</select>';
  return '<form class="form" id="f-pet" novalidate><h2 class="sh-title">' + esc(p.name) + '</h2>'
    + '<label class="fld"><span>Navnet på hunden</span><input class="inp" id="fp-name" name="pname" maxlength="20" value="' + esc(p.name) + '"></label>'
    + '<label class="toggle"><input type="checkbox" id="fp-on" name="on"' + (r.on ? ' checked' : '') + '><span>Minn oss på det hvis ingen har gitt mat</span></label>'
    + '<div class="two"><label class="fld"><span>Første påminnelse</span>' + sel('first', r.first, slots(8, 21)) + '</label><label class="fld"><span>Siste sjanse</span>' + sel('last', r.last, slots(12, 23)) + '</label></div>'
    + '<p class="small">Påminnelsen går til alle telefoner som har slått på varsler.</p><p class="err" hidden></p>'
    + '<button class="btn primary big" type="submit">Lagre</button></form>';
}
function afterFeed() { setTimeout(() => { if (S.tab === 'polsa' && S.stage === 'app') renderPolsa(); }, 8200); }

/* ---------- Pølsehopp ---------- */
const scoreOf = (date, uid) => (S.docs.scores[date + '_' + uid] || {}).best || 0;
function records() {
  const best = {};
  Object.values(S.docs.scores).forEach(x => { if (x && x.uid && (!best[x.uid] || x.best > best[x.uid].best)) best[x.uid] = x; });
  return best;
}
function boardRows(ids, withRecord) {
  const t = today(), rec = records();
  return ids.map(id => '<li>' + av(id, 24) + '<span>' + esc(id === S.me ? 'Du' : nm(id)) + '</span><b>' + (scoreOf(t, id) || '–') + '</b>'
    + (withRecord && rec[id] ? '<small>Rekord ' + rec[id].best + ' (' + esc(fmtShort(parseDay(rec[id].date) || Date.now())) + ')</small>' : '') + '</li>').join('');
}
function renderGameCard() {
  const t = today(), ids = memberIds();
  const sc = ids.map(id => [id, scoreOf(t, id)]).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]);
  const lead = !sc.length ? 'Ingen har spilt dagens bane ennå.' : sc[0][0] === S.me ? 'Du leder i dag!' : esc(nm(sc[0][0])) + ' leder i dag.';
  $('#game-slot').innerHTML = '<div class="funcard"><div class="fc-head"><div><h3>Pølsehopp</h3><p class="small">Samme bane for dere begge i dag. ' + lead + '</p></div><div class="fc-art">' + dog('hei') + '</div></div>'
    + '<ul class="board">' + boardRows(ids, true) + '</ul><button class="btn primary big" data-act="play-game">Spill dagens bane</button></div>';
}
function openGame() {
  if (!window.PolseHopp) return toast('Spillet lastet ikke. Prøv å åpne appen på nytt.');
  document.body.classList.add('locked');
  S.game = window.PolseHopp.open($('#game'), {
    seed: 'polsehopp-' + today(),
    sub: 'Dagens bane · ' + esc(fmtDay(today())),
    startHtml: '<div class="g-card"><h3>Dagens bane</h3><p>Trykk for å hoppe, og hold inne for å hoppe høyere. Samle pølser for ekstra poeng.</p><p><b>Pass på fuglene:</b> de flyr akkurat der du hopper, så bli på bakken når de kommer.</p><button class="btn primary big" data-g="start">Start</button></div>',
    onOver: saveScore,
    renderOver: overHtml,
    onClose: () => { document.body.classList.remove('locked'); S.game = null; if (S.tab === 'polsa') renderPolsa(); }
  });
}
function saveScore(r) {
  const t = today(), id = t + '_' + S.me, prev = S.docs.scores[id] || {};
  const best = Math.max(prev.best || 0, r.score);
  const pid = partnerId(), pBest = pid ? scoreOf(t, pid) : 0;
  r.newBest = r.score > (prev.best || 0); r.prevBest = prev.best || 0;
  const ops = [{ op: 'set', coll: 'scores', id, data: { date: t, uid: S.me, best, plays: (prev.plays || 0) + 1, last: r.score, at: Date.now() } }];
  if (pid && r.score > 0 && r.score === best && best > pBest && (prev.best || 0) <= pBest) {
    const txt = pBest ? nm(S.me) + ' slo deg i Pølsehopp med ' + r.score + ' poeng. Klarer du å slå det?' : nm(S.me) + ' satte dagens rekord i Pølsehopp: ' + r.score + ' poeng. Din tur!';
    ops.push(plingOp('spill', txt, { type: 'game' }));
    r.plinged = true; r.partnerHad = pBest;
  }
  write(ops).catch(() => {});
}
function overHtml(r) {
  const pid = partnerId();
  let msg = r.newBest && r.prevBest ? 'Ny personlig rekord i dag!' : '';
  if (r.plinged) msg = (r.partnerHad ? 'Du tok ledelsen! ' : 'Dagens rekord! ') + esc(partnerName()) + ' har fått beskjed.';
  return '<div class="g-card"><p class="g-hit">Au! ' + esc(pet().name) + ' traff ' + esc(r.hit || 'noe') + '.</p><b class="g-big">' + r.score + '</b>'
    + '<p class="small">' + r.sausages + (r.sausages === 1 ? ' pølse' : ' pølser') + ' · ' + Math.round(r.distance / 10) + ' meter</p>'
    + (msg ? '<p class="g-msg">' + msg + '</p>' : '')
    + '<ul class="board">' + boardRows([S.me, pid].filter(Boolean), false) + '</ul>'
    + '<div class="sh-actions"><button class="btn ghost grow" data-g="close">Ferdig</button><button class="btn primary grow" data-g="again">Prøv igjen</button></div></div>';
}

/* ---------- Couple quiz ---------- */
const QMODES = { hvem: 'Hvem av oss?', meg: 'Kjenner du meg?', egen: 'Eget spørsmål' };
const QPOINTS = { riktig: 2, nesten: 1, feil: 0 };
const VERDICT_TXT = { riktig: 'Riktig! 2 poeng', nesten: 'Nesten! 1 poeng', feil: 'Feil denne gangen' };
const guesser = q => memberIds().find(id => id !== q.subject) || null;
const hvemAgree = q => { const v = Object.values(q.answers || {}); return v.length >= 2 && v.every(x => x === v[0]); };
function quizState(q) {
  const ids = memberIds();
  if (q.mode === 'hvem') {
    const a = q.answers || {};
    const done = ids.length >= 2 && ids.every(id => a[id]);
    return { done, mine: !a[S.me], wait: done ? null : ids.find(id => !a[id] && id !== S.me) || ids.find(id => !a[id]) };
  }
  if (!q.guess) return { done: false, mine: S.me !== q.subject, wait: guesser(q) };
  if (!q.verdict) return { done: false, mine: S.me === q.subject, wait: q.subject };
  return { done: true, mine: false };
}
function quizStats() {
  const pts = {}; memberIds().forEach(i => { pts[i] = { got: 0, of: 0 }; });
  let agree = 0, hv = 0;
  S.quiz.forEach(q => {
    if (!quizState(q).done) return;
    if (q.mode === 'hvem') { hv++; if (hvemAgree(q)) agree++; }
    else { const g = q.guess && q.guess.by; if (pts[g]) { pts[g].got += QPOINTS[q.verdict] || 0; pts[g].of += 2; } }
  });
  return { pts, agree, hv };
}
function qTag(q) {
  const st = quizState(q);
  if (st.done) return q.mode === 'hvem' ? (hvemAgree(q) ? 'Enige' : 'Uenige') : ({ riktig: 'Riktig', nesten: 'Nesten', feil: 'Feil' }[q.verdict] || 'Ferdig');
  return st.mine ? 'Din tur' : 'Venter på ' + nm(st.wait);
}
function qRow(q) {
  const st = quizState(q);
  return '<li><button class="qrow" data-act="quiz-open" data-id="' + q.id + '"><span class="qmode">' + QMODES[q.mode] + (q.mode !== 'hvem' ? ' · fra ' + esc(q.subject === S.me ? 'deg' : nm(q.subject)) : '') + '</span>'
    + '<span class="qq">' + esc(q.q) + '</span><span class="chipx' + (st.mine ? ' hot' : '') + '">' + esc(qTag(q)) + '</span></button></li>';
}
function renderQuizCard() {
  const pid = partnerId();
  let h = '<div class="funcard"><div class="fc-head"><div><h3>Couple quiz</h3>';
  if (!pid) {
    h += '<p class="small">Quizen åpner når kjæresten er med i appen.</p></div><div class="fc-art">' + dog('quiz') + '</div></div></div>';
    $('#quiz-slot').innerHTML = h; return;
  }
  const st = quizStats(), line = [];
  if (st.pts[S.me] && st.pts[S.me].of) line.push('Du kjenner ' + esc(nm(pid)) + ': ' + st.pts[S.me].got + ' poeng');
  if (st.pts[pid] && st.pts[pid].of) line.push(esc(nm(pid)) + ' kjenner deg: ' + st.pts[pid].got + ' poeng');
  if (st.hv) line.push('Enige i ' + st.agree + ' av ' + st.hv);
  const mine = S.quiz.filter(q => quizState(q).mine);
  h += '<p class="small">' + (line.length ? line.join(' · ') : 'Hvor godt kjenner dere hverandre? Start en runde.') + '</p></div><div class="fc-art">' + dog('quiz') + '</div></div>'
    + (mine.length ? '<ul class="qlist">' + mine.slice(0, 4).map(qRow).join('') + '</ul>' : '')
    + '<div class="qbtns"><button class="btn" data-act="quiz-new" data-k="hvem">Hvem av oss?</button><button class="btn" data-act="quiz-new" data-k="meg">Kjenner du meg?</button><button class="btn" data-act="quiz-new" data-k="egen">Eget spørsmål</button></div>'
    + (S.quiz.length ? '<button class="linkbtn qall" data-act="quiz-all">Se alle runder (' + S.quiz.length + ')</button>' : '')
    + '</div>';
  $('#quiz-slot').innerHTML = h;
}
function pickQ(mode, avoid) {
  const bank = (window.QUIZ && window.QUIZ[mode]) || ['Hvem av oss er best til å lage mat?'];
  const used = new Set(S.quiz.filter(q => q.mode === mode).map(q => q.q));
  let pool = bank.filter(x => !used.has(x) && x !== avoid);
  if (!pool.length) pool = bank.filter(x => x !== avoid);
  return pool[Math.floor(Math.random() * pool.length)] || bank[0];
}
function whoButtons(act) {
  return memberIds().slice(0, 2).map(id => '<button type="button" class="who-btn" data-act="' + act + '" data-id="' + id + '">' + av(id, 34) + esc(nm(id)) + (id === S.me ? ' <small>(deg)</small>' : '') + '</button>').join('');
}
function quizNewSheet(mode, q) {
  const other = esc(partnerName());
  let h = '<form class="form" id="f-quiz" data-mode="' + mode + '" novalidate><p class="qmode">' + QMODES[mode] + '</p>';
  if (mode === 'egen') {
    h += '<h2 class="sh-title">Lag et spørsmål om deg selv</h2>'
      + '<label class="fld"><span>Spørsmålet</span><input class="inp" id="fq-q" name="q" maxlength="140" placeholder="F.eks. Hva bestilte jeg på første date?"></label>'
      + '<label class="fld"><span>Riktig svar</span><input class="inp" id="fq-a" name="a" maxlength="80" autocomplete="off"></label>'
      + '<fieldset class="fld"><legend>Feil svaralternativer <i>(valgfritt, ellers skriver ' + other + ' svaret selv)</i></legend>'
      + '<div class="stack"><input class="inp" id="fq-w1" name="w1" maxlength="80" placeholder="Feil svar" autocomplete="off"><input class="inp" id="fq-w2" name="w2" maxlength="80" placeholder="Feil svar" autocomplete="off"><input class="inp" id="fq-w3" name="w3" maxlength="80" placeholder="Feil svar" autocomplete="off"></div></fieldset>';
  } else {
    h += '<h2 class="sh-title" id="fq-qtext">' + esc(q) + '</h2><input type="hidden" id="fq-q" name="q" value="' + esc(q) + '">'
      + '<div><button type="button" class="linkbtn" data-act="quiz-shuffle" data-k="' + mode + '">Bytt spørsmål</button></div>';
    if (mode === 'hvem') h += '<p class="muted">Svar selv først. Så får ' + other + ' samme spørsmål, og dere ser om dere er enige.</p><div class="who2">' + whoButtons('fq-pick') + '</div>';
    else h += '<label class="fld"><span>Ditt svar <i>(' + other + ' ser det først etter å ha gjettet)</i></span><input class="inp" id="fq-a" name="a" maxlength="120" autocomplete="off"></label>';
  }
  h += '<p class="err" hidden></p>' + (mode === 'hvem' ? '' : '<button class="btn primary big" type="submit">Send til ' + other + '</button>') + '</form>';
  return h;
}
function quizSheet(q) {
  const st = quizState(q), a = q.answers || {};
  let h = '<div class="form"><p class="qmode">' + QMODES[q.mode] + (q.mode !== 'hvem' ? ' · fra ' + esc(q.subject === S.me ? 'deg' : nm(q.subject)) : '') + '</p><h2 class="sh-title">' + esc(q.q) + '</h2>';
  if (q.mode === 'hvem') {
    if (!a[S.me]) h += '<div class="who2">' + whoButtons('qa-pick') + '</div>';
    else if (!st.done) h += '<p class="muted">Du svarte <b>' + esc(nm(a[S.me])) + '</b>. Venter på ' + esc(nm(st.wait)) + '.</p>';
    else {
      const ok = hvemAgree(q);
      h += '<div class="reveal' + (ok ? ' ok' : '') + '"><b class="verdict">' + (ok ? 'Dere er enige!' : 'Dere er uenige') + '</b>'
        + memberIds().map(id => '<p>' + esc(id === S.me ? 'Du' : nm(id)) + ' svarte <b>' + esc(nm(a[id])) + '</b></p>').join('') + '</div>';
    }
  } else {
    const me = q.subject === S.me;
    const right = q.options ? q.options[q.correct] : q.answer;
    if (!q.guess) {
      if (me) h += '<p class="muted">Riktig svar: <b>' + esc(right) + '</b>. Venter på at ' + esc(nm(guesser(q))) + ' gjetter.</p>';
      else if (q.options && q.options.length) h += '<div class="opts">' + q.options.map((o, i) => '<button class="opt" data-act="qa-opt" data-i="' + i + '">' + esc(o) + '</button>').join('') + '</div>';
      else h += '<form class="form" id="f-guess" novalidate><label class="fld"><span>Ditt gjett</span><input class="inp" id="fg-text" name="g" maxlength="120" autocomplete="off"></label><p class="err" hidden></p><button class="btn primary big" type="submit">Svar</button></form>';
    } else {
      const gText = q.options ? q.options[q.guess.pick] : q.guess.text;
      h += '<div class="reveal' + (q.verdict === 'riktig' ? ' ok' : q.verdict === 'feil' ? ' bad' : '') + '">'
        + '<p>' + esc(q.guess.by === S.me ? 'Du' : nm(q.guess.by)) + ' gjettet: <b>' + esc(gText) + '</b></p><p>Riktig svar: <b>' + esc(right) + '</b></p>'
        + (q.verdict ? '<b class="verdict">' + VERDICT_TXT[q.verdict] + '</b>' : '') + '</div>';
      if (!q.verdict) {
        if (me) h += '<p class="muted">Var det riktig?</p><div class="verdicts"><button class="btn primary" data-act="qa-verdict" data-v="riktig">Riktig</button><button class="btn" data-act="qa-verdict" data-v="nesten">Nesten</button><button class="btn ghost" data-act="qa-verdict" data-v="feil">Feil</button></div>';
        else h += '<p class="muted">Venter på at ' + esc(nm(q.subject)) + ' sier om det var riktig.</p>';
      }
    }
  }
  h += '<div class="sh-actions"><button class="btn ghost danger sm" data-act="quiz-del-ask">Slett runden</button></div>'
    + (S.sheet && S.sheet.confirm === 'del' ? '<div class="confirm"><p>Slette denne runden?</p><div><button class="btn primary" data-act="quiz-del-yes">Ja, slett</button><button class="btn ghost" data-act="quiz-del-no">Avbryt</button></div></div>' : '');
  return h + '</div>';
}
function openQuiz(id) {
  const q = S.quiz.find(x => x.id === id); if (!q) return toast('Fant ikke runden');
  openSheet(quizSheet(q), { type: 'quiz', id }, 'Quiz');
}
function renderQuizSheet(force) {
  const st = S.sheet; if (!st || st.type !== 'quiz') return;
  const q = S.quiz.find(x => x.id === st.id);
  if (!q) { closeSheet(); return; }
  const sh = $('#sheet'), ae = document.activeElement;
  if (!force && ae && sh.contains(ae) && /^(INPUT|TEXTAREA)$/.test(ae.tagName)) { st.stale = true; return; }
  $('.sheet-body', sh).innerHTML = quizSheet(q); st.stale = false;
}
function quizAllSheet() {
  return '<div class="form"><h2 class="sh-title">Alle quizrunder</h2><ul class="qlist">' + S.quiz.map(qRow).join('') + '</ul></div>';
}
async function quizWrite(ops, okMsg) {
  try { const r = await write(ops); toast(r.queued ? QUEUED : okMsg); return true; }
  catch (e) { toast(errMsg(e)); return false; }
}

/* ---------- video previews ---------- */
function embedFor(url) {
  const t = /tiktok\.com\/.*\/video\/(\d{6,25})/.exec(url || '');
  if (t) return 'https://www.tiktok.com/embed/v2/' + t[1];
  const i = /instagram\.com\/(?:[A-Za-z0-9_.]+\/)?(reels?|p|tv)\/([A-Za-z0-9_-]{5,40})/.exec(url || '');
  if (i) return 'https://www.instagram.com/' + (i[1] === 'p' ? 'p' : i[1] === 'tv' ? 'tv' : 'reel') + '/' + i[2] + '/embed';
  return null;
}
function cleanTitle(t) {
  t = String(t || '').replace(/#[\p{L}\p{N}_]+/gu, '').replace(/\s+/g, ' ').trim().replace(/[\s,.:;!-]+$/, '');
  if (t.length > 70) { t = t.slice(0, 70); const k = t.lastIndexOf(' '); if (k > 40) t = t.slice(0, k); t += '…'; }
  return t;
}
let prevT = null, prevSeq = 0;
function schedulePreview() {
  clearTimeout(prevT);
  const box = $('#fl-prev'); if (!box || !S.sheet) return;
  const u = extractUrl(($('#fl-url') || {}).value);
  const p = u && detect(u);
  if (!p || (p !== 'tiktok' && p !== 'instagram')) { box.innerHTML = ''; S.sheet.preview = null; return; }
  if (S.sheet.preview && S.sheet.preview.for === u) return;
  box.innerHTML = '<p class="small">Henter forhåndsvisning…</p>';
  const seq = ++prevSeq, st = S.sheet;
  prevT = setTimeout(async () => {
    try {
      const r = await api('/api/preview?url=' + encodeURIComponent(u));
      if (seq !== prevSeq || S.sheet !== st) return;
      r.for = u; st.preview = r;
      if (!r.found) { box.innerHTML = '<p class="small">Fant ingen forhåndsvisning. Lenken lagres likevel.</p>'; return; }
      box.innerHTML = '<div class="prevbox">' + (r.photo ? '<img src="' + photoUrl(r.photo) + '" alt="">' : '') + '<div>' + (r.author ? '<b>' + esc(r.author) + '</b>' : '') + '<span>' + esc(cleanTitle(r.title) || platLabel(p)) + '</span></div></div>';
      const ti = $('#fl-title');
      if (ti && !ti.value.trim() && cleanTitle(r.title)) ti.value = cleanTitle(r.title);
    } catch (e) {
      if (seq === prevSeq && S.sheet === st) box.innerHTML = e.code === 'offline' ? '' : '<p class="small">Fant ingen forhåndsvisning. Lenken lagres likevel.</p>';
    }
  }, 500);
}
let backfilling = false;
const triedPreview = new Set();
async function backfillPreviews() {
  if (backfilling || !S.online || !S.key) return;
  const l = S.links.find(x => (x.platform === 'tiktok' || x.platform === 'instagram') && !x.thumb && !x.previewTried && !triedPreview.has(x.id));
  if (!l) return;
  backfilling = true; triedPreview.add(l.id);
  try {
    const r = await api('/api/preview?url=' + encodeURIComponent(l.url));
    const data = { previewTried: true };
    if (r.photo) data.thumb = r.photo;
    if (r.author) data.author = r.author;
    if (r.embed) data.embed = r.embed;
    if (/^Oppskrift fra /.test(l.title || '') && cleanTitle(r.title)) data.title = cleanTitle(r.title);
    await write([{ op: 'merge', coll: 'links', id: l.id, data }]);
  } catch (e) {}
  backfilling = false;
  setTimeout(backfillPreviews, 1200);
}
function playSheet(l) {
  const e = l.embed || embedFor(l.url);
  return '<div class="form"><h2 class="sh-title">' + esc(l.title) + '</h2>' + (l.author ? '<p class="small">' + esc(l.author) + ' på ' + platLabel(l.platform) + '</p>' : '')
    + (e ? '<div class="vwrap ' + esc(l.platform) + '"><iframe src="' + esc(e) + '" title="' + esc(l.title) + '" allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>' : '')
    + '<div class="sh-actions"><a class="btn grow" href="' + esc(safeHref(l.url)) + '" target="_blank" rel="noopener noreferrer">' + openLabel(l.platform) + ICON.ext + '</a>'
    + '<button class="btn primary grow" data-act="made" data-id="' + l.id + '">' + (madeMap()[l.id] ? 'Laget igjen' : 'Vi lagde den') + '</button></div>'
    + '<div id="recipe-box">' + recipeBox(l) + '</div>'
    + '<div class="sh-actions"><button class="btn ghost sm" data-act="edit-link" data-id="' + l.id + '">Endre eller slett videoen</button></div></div>';
}

/* ---------- recipes ---------- */
function ingText(i) { return (i.amount ? i.amount + ' ' : '') + i.name; }
function parseIng(line) {
  line = String(line || '').replace(/^[-•*·\s]+/, '').replace(/\s+/g, ' ').trim();
  const m = /^((?:ca\.?\s*)?[\d½¼¾⅓⅔.,\/\s–-]+\s*(?:g|kg|dl|cl|l|ml|ss|ts|stk|pk|pakke|pakker|boks|bokser|fedd|klype|klyper|neve|never|bunt|bunter|beger|skive|skiver|glass|kopp|kopper|blad|stilk|stilker|porsjon|porsjoner)?\.?)\s+(.+)$/i.exec(line);
  return m ? { name: m[2].trim(), amount: m[1].trim(), pantry: false } : { name: line, amount: '', pantry: false };
}
function recipeBox(l) {
  const st = S.sheet || {}, r = l.recipe;
  const err = st.recipeErr ? '<p class="err" role="alert">' + esc(st.recipeErr) + '</p>' : '';
  if (st.recipeBusy) return '<div class="recipe"><h3>Oppskrift</h3><div class="cooking">' + dog('klar', true) + '<p class="small">Leser teksten til videoen og skriver oppskriften. Det tar noen sekunder…</p></div></div>';
  if (!r) {
    const social = l.platform === 'tiktok' || l.platform === 'instagram';
    return '<div class="recipe"><h3>Oppskrift</h3><p class="small">' + (social ? 'Appen leser teksten som står til videoen, og lager en oppskrift med ingredienser og steg for to.' : 'Appen lager en oppskrift ut fra navnet og notatet deres.') + '</p>'
      + err + '<div class="sh-actions"><button class="btn primary" data-act="recipe-make" data-id="' + l.id + '">Lag oppskrift</button><button class="btn ghost" data-act="recipe-edit" data-id="' + l.id + '">Skriv den selv</button></div></div>';
  }
  const src = r.source === 'manual' ? 'Skrevet av dere' : r.fromCaption ? 'Fra teksten til videoen' : 'Forslag: teksten til videoen sa ikke alt, så sjekk mot videoen';
  const added = st.added ? '<button class="btn" data-act="tab" data-k="handle">Lagt til. Se handlelisten</button>' : '<button class="btn primary" data-act="recipe-add" data-id="' + l.id + '">Legg i handlelisten</button>';
  return '<div class="recipe"><div class="r-head"><h3>Oppskrift</h3><span class="r-meta">' + esc([r.servings ? r.servings + ' porsjoner' : '', r.time].filter(Boolean).join(' · ')) + '</span></div>'
    + '<p class="r-src' + (r.fromCaption || r.source === 'manual' ? '' : ' guess') + '">' + esc(src) + '</p>'
    + '<h4>Ingredienser</h4><div class="ings">' + (r.ingredients || []).map((i, k) => '<label class="ing"><input type="checkbox" data-ing="' + k + '"' + (i.pantry ? '' : ' checked') + '><span><b>' + esc(i.amount) + '</b> ' + esc(i.name) + (i.pantry ? ' <em>har dere sikkert</em>' : '') + '</span></label>').join('') + '</div>'
    + '<div>' + added + '</div>'
    + '<h4>Slik gjør du</h4><ol class="r-steps">' + (r.steps || []).map(x => '<li>' + esc(x) + '</li>').join('') + '</ol>'
    + (r.tip ? '<p class="r-tip"><b>Tips:</b> ' + esc(r.tip) + '</p>' : '')
    + err + '<div class="sh-actions"><button class="btn ghost sm" data-act="recipe-edit" data-id="' + l.id + '">Endre oppskriften</button>' + (r.source === 'manual' ? '' : '<button class="btn ghost sm" data-act="recipe-make" data-id="' + l.id + '">Lag på nytt</button>') + '</div></div>';
}
function renderRecipeBox() {
  const st = S.sheet; if (!st || st.type !== 'play') return;
  const l = linkById(st.id), box = $('#recipe-box');
  if (!l || !box) return;
  const ae = document.activeElement;
  if (ae && box.contains(ae) && ae.tagName === 'INPUT' && ae.type !== 'checkbox') return;
  box.innerHTML = recipeBox(l);
}
function recipeEditSheet(l) {
  const r = l.recipe || {};
  return '<form class="form" id="f-recipe" data-id="' + l.id + '" novalidate><h2 class="sh-title">Oppskrift: ' + esc(l.title) + '</h2>'
    + '<div class="two"><label class="fld"><span>Porsjoner</span><input class="inp" id="fr-serv" name="serv" type="number" inputmode="numeric" min="1" max="12" value="' + esc(r.servings || 2) + '"></label>'
    + '<label class="fld"><span>Tid</span><input class="inp" id="fr-time" name="time" maxlength="30" placeholder="f.eks. 30 min" value="' + esc(r.time || '') + '"></label></div>'
    + '<label class="fld"><span>Ingredienser <i>(én per linje, f.eks. «200 g spaghetti»)</i></span><textarea class="inp" id="fr-ings" name="ings" rows="8">' + esc((r.ingredients || []).map(ingText).join('\n')) + '</textarea></label>'
    + '<label class="fld"><span>Slik gjør du <i>(ett steg per linje)</i></span><textarea class="inp" id="fr-steps" name="steps" rows="7">' + esc((r.steps || []).join('\n')) + '</textarea></label>'
    + '<p class="err" hidden></p><button class="btn primary big" type="submit">Lagre oppskriften</button></form>';
}

/* ---------- shopping list ---------- */
const normName = s => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
function shopItems() {
  return Object.entries(S.docs.shop).map(([id, d]) => Object.assign({}, d, { id }))
    .sort((a, b) => (a.done - b.done) || (a.done ? (b.doneAt || 0) - (a.doneAt || 0) : (a.createdAt || 0) - (b.createdAt || 0)));
}
const shopTodo = () => shopItems().filter(i => !i.done);
function shopOps(list, from) {
  const open = shopTodo(), ops = [];
  for (const i of list) {
    const hit = open.find(x => normName(x.name) === normName(i.name));
    if (hit) {
      const amount = hit.amount && i.amount && hit.amount !== i.amount ? hit.amount + ' + ' + i.amount : (hit.amount || i.amount || '');
      const fromList = Array.from(new Set([].concat(hit.from || [], from ? [from] : [])));
      ops.push({ op: 'merge', coll: 'shop', id: hit.id, data: { amount, from: fromList } });
      hit.amount = amount; hit.from = fromList;
    } else {
      const id = newId();
      ops.push({ op: 'set', coll: 'shop', id, data: { name: i.name.slice(0, 80), amount: String(i.amount || '').slice(0, 60), from: from ? [from] : [], done: false, by: S.me, createdAt: Date.now() + ops.length } });
      open.push({ id, name: i.name, amount: i.amount, from: from ? [from] : [] });
    }
  }
  return ops;
}
function shopText() {
  const t = shopTodo();
  return 'Handleliste fra Pølse & Pasta:\n' + t.map(i => '• ' + ingText(i)).join('\n');
}
function renderShop() {
  const items = shopItems(), todo = items.filter(i => !i.done), done = items.filter(i => i.done);
  const row = i => '<li class="shopi' + (i.done ? ' done' : '') + '"><label><input type="checkbox" data-shop="' + i.id + '"' + (i.done ? ' checked' : '') + '><span class="sn"><span>' + (i.amount ? '<b>' + esc(i.amount) + '</b> ' : '') + esc(i.name) + '</span>'
    + ((i.from || []).length ? '<small>til ' + esc(i.from.join(', ')) + '</small>' : '') + '</span></label>'
    + '<button class="iconbtn" data-act="shop-del" data-id="' + i.id + '" aria-label="Fjern ' + esc(i.name) + '">' + ICON.x + '</button></li>';
  const list = $('#shop-list'), tools = $('#shop-tools');
  if (!items.length) {
    list.innerHTML = !S.synced ? loading('Henter handlelisten…') : emptyBox('handle', 'Handlelisten er tom', 'Skriv inn varer over, eller åpne en video i Inspo og trykk «Legg i handlelisten» på oppskriften.');
    tools.innerHTML = '';
    return;
  }
  list.innerHTML = (todo.length ? '<ul class="shop">' + todo.map(row).join('') + '</ul>' : '<p class="none">Alt er handlet. Godt jobba!</p>')
    + (done.length ? '<h3 class="sub-h">Handlet</h3><ul class="shop">' + done.map(row).join('') + '</ul>' : '');
  tools.innerHTML = '<div class="funcard"><h3 class="fc-t">Handle på nett eller i butikken</h3>'
    + '<p class="small">Del listen til Notater, Meldinger eller appen til butikken, eller ta den med i butikken og kryss av her mens dere handler.</p>'
    + '<div class="set-row">' + (navigator.share ? '<button class="btn primary" data-act="shop-share">Del listen</button>' : '') + '<button class="btn" data-act="shop-copy">Kopier listen</button>'
    + '<a class="btn ghost" href="https://meny.no/" target="_blank" rel="noopener noreferrer">Meny' + ICON.ext + '</a><a class="btn ghost" href="https://oda.com/no/" target="_blank" rel="noopener noreferrer">Oda' + ICON.ext + '</a></div>'
    + (done.length ? '<button class="linkbtn qall" data-act="shop-clear">Fjern det som er handlet (' + done.length + ')</button>' : '')
    + '</div>';
}

/* ---------- events ---------- */
const ACT = {
  'tab': b => { if (S.sheet) closeSheet(); S.tab = b.dataset.k; render(); window.scrollTo({ top: 0 }); },
  'lf': b => { S.lf = b.dataset.k; renderInspo(); },
  'tagf': b => { S.tagf = S.tagf === b.dataset.k ? null : b.dataset.k; renderInspo(); },
  'clear-f': () => { S.lf = 'alle'; S.tagf = null; S.q = ''; const q = $('#q-inspo'); if (q) q.value = ''; renderInspo(); },
  'ds': b => { S.ds = b.dataset.k; renderDinners(); },
  'add-link': () => openSheet(linkSheet(null), { type: 'link' }, 'Lagre video'),
  'edit-link': b => { const l = linkById(b.dataset.id); if (l) { openSheet(linkSheet(l), { type: 'link', id: l.id }, 'Endre oppskrift'); updateDetect(); } },
  'del-link-ask': () => { const c = $('#del-confirm'); if (c) { c.hidden = false; c.scrollIntoView({ block: 'nearest' }); } },
  'del-link-no': () => { const c = $('#del-confirm'); if (c) c.hidden = true; },
  'del-link-yes': async b => {
    busy(b, true, 'Sletter…');
    try { const r = await write([{ op: 'delete', coll: 'links', id: b.dataset.id }]); closeSheet(); toast(r.queued ? QUEUED : 'Slettet'); }
    catch (e) { busy(b, false); toast(errMsg(e)); }
  },
  'made': b => openSheet(dinnerForm(b.dataset.id), { type: 'dinner-new', linkId: b.dataset.id, files: [], stars: 0 }, 'Logg middag'),
  'add-dinner': () => openSheet(dinnerForm(null), { type: 'dinner-new', linkId: null, files: [], stars: 0 }, 'Logg middag'),
  'unpick': b => { const st = S.sheet; if (!st || !st.files) return; const f = st.files.splice(+b.dataset.i, 1)[0]; if (f) try { URL.revokeObjectURL(f.url); } catch (e) {} renderPreviews(); },
  'open-dinner': b => openDinner(b.dataset.id),
  'save-comment': async b => {
    const ta = $('#dd-comment'); if (!ta || !S.sheet) return;
    busy(b, true, 'Lagrer…');
    await setMyRating(b.dataset.id, { comment: ta.value.trim() });
    if (S.sheet) S.sheet.draft = null;
    toast('Kommentaren er lagret');
    renderDetail(true);
  },
  'nag': async b => {
    const d = dinnerById(b.dataset.id); if (!d) return;
    busy(b, true, 'Sender…');
    try { const r = await write([plingOp('rating', d.title, { type: 'dinner', id: d.id })]); toast(r.queued ? QUEUED : partnerName() + ' er bedt om å rate'); b.textContent = 'Sendt'; }
    catch (e) { busy(b, false); toast(errMsg(e)); }
  },
  'ph-rm-ask': b => { if (S.sheet) { S.sheet.confirm = 'ph:' + b.dataset.pid; renderDetail(true); } },
  'ph-rm-yes': async () => {
    const st = S.sheet; if (!st || !st.confirm) return;
    const pid = st.confirm.slice(3), id = st.id;
    st.confirm = null;
    const d = dinnerById(id);
    try {
      await write([{ op: 'merge', coll: 'dinners', id, data: { photos: (d ? d.photos || [] : []).filter(x => x !== pid) } }]);
      api(photoUrl(pid), { method: 'DELETE' }).catch(() => {});
      toast('Bildet er fjernet');
    } catch (e) { toast(errMsg(e)); }
    renderDetail(true);
  },
  'del-dinner-ask': () => { if (S.sheet) { S.sheet.confirm = 'del'; S.sheet.openMore = true; renderDetail(true); } },
  'confirm-no': () => { if (S.sheet) { S.sheet.confirm = null; renderDetail(true); } },
  'del-dinner-yes': async b => {
    const st = S.sheet; if (!st) return;
    const d = dinnerById(st.id);
    busy(b, true, 'Sletter…');
    try {
      await write([{ op: 'delete', coll: 'dinners', id: st.id }]);
      if (d) (d.photos || []).forEach(p => api(photoUrl(p), { method: 'DELETE' }).catch(() => {}));
      closeSheet(); toast('Middagen er slettet');
    } catch (e) { busy(b, false); toast(errMsg(e)); }
  },
  'pick-pling': b => openSheet(plingSheet(b.dataset.k), { type: 'pling', kind: b.dataset.k }, PLINGS[b.dataset.k].title),
  'settings': () => openSheet(settingsSheet(), { type: 'settings' }, 'Innstillinger'),
  'invite': () => openSheet(inviteSheet(), { type: 'invite' }, 'Del appen'),
  'install-help': () => openSheet(installSheet(), { type: 'install' }, 'Hjemskjerm'),
  'share-invite': async () => { try { await navigator.share({ title: 'Pølse & Pasta', text: inviteText() }); } catch (e) {} },
  'copy-invite': () => copyText(inviteText()),
  'copy-key': () => copyText(S.key),
  'push-on': async b => {
    busy(b, true, 'Slår på…');
    try {
      const okk = await enablePush();
      if (okk) { toast('Varsler er på'); if (S.sheet && (S.sheet.type === 'push')) closeSheet(); }
      else if (S.push === 'install') openSheet(installSheet(), { type: 'install' }, 'Hjemskjerm');
      else toast(S.push === 'denied' ? 'Varsler er blokkert. Slå dem på i iPhone-innstillingene.' : 'Varsler ble ikke slått på.');
    } catch (e) { toast(errMsg(e)); }
    busy(b, false);
    render();
    if (S.sheet && S.sheet.type === 'settings') openSheet(settingsSheet(), { type: 'settings' }, 'Innstillinger');
  },
  'push-off': async () => { await disablePush(); toast('Varsler er av på denne telefonen'); render(); openSheet(settingsSheet(), { type: 'settings' }, 'Innstillinger'); },
  'push-test': async b => {
    busy(b, true, 'Sender…');
    try { await api('/api/test-push', { method: 'POST', body: { member: S.me } }); toast('Sendt. Det kommer et varsel om et øyeblikk.'); }
    catch (e) { toast(e.code === 'no_subs' ? 'Varsler er ikke på for denne telefonen. Slå dem av og på igjen.' : errMsg(e)); }
    busy(b, false);
  },
  'switch-me': () => { closeSheet(); S.me = null; LS.del('pp-me'); S.who = null; S.stage = 'who'; render(); },
  'logout-ask': () => { const c = $('#logout-confirm'); if (c) c.hidden = false; },
  'logout-no': () => { const c = $('#logout-confirm'); if (c) c.hidden = true; },
  'logout-yes': async () => {
    await disablePush();
    ['pp-key', 'pp-me', 'pp-docs', 'pp-since', 'pp-queue', 'pp-push-asked'].forEach(k => LS.del(k));
    location.reload();
  },
  'close-sheet': () => closeSheet(),
  'ov-close': () => closeOverlay(false),
  'ov-all': () => closeOverlay(true),
  'ov-reply': async b => {
    busy(b, true, 'Sender…');
    try { const r = await write([plingOp('klem', '', null)]); toast(r.queued ? QUEUED : 'Klem sendt!'); } catch (e) { toast(errMsg(e)); }
    closeOverlay(false);
  },
  'ov-rate': b => { const id = b.dataset.id; closeOverlay(false); S.tab = 'middager'; render(); openDinner(id); },
  'ov-quiz': b => { const id = b.dataset.id; closeOverlay(false); S.tab = 'polsa'; render(); openQuiz(id); },
  'ov-game': () => { closeOverlay(false); S.tab = 'polsa'; render(); openGame(); },
  'ov-shop': () => { closeOverlay(false); S.tab = 'handle'; render(); window.scrollTo({ top: 0 }); },
  'recipe-make': async b => {
    const st = S.sheet, id = b.dataset.id; if (!st) return;
    st.recipeBusy = true; st.recipeErr = ''; st.added = false; renderRecipeBox();
    try {
      const r = await api('/api/recipe', { method: 'POST', body: { linkId: id } });
      applyDocs(r.docs); save();
    } catch (e) {
      if (S.sheet === st) st.recipeErr = e.code === 'offline' ? 'Du må være på nett for å lage oppskriften.' : errMsg(e);
    }
    st.recipeBusy = false;
    changed();
    if (S.sheet === st) renderRecipeBox();
  },
  'recipe-edit': b => { const l = linkById(b.dataset.id); if (l) openSheet(recipeEditSheet(l), { type: 'recipe-edit', id: l.id }, 'Oppskrift'); },
  'recipe-add': async b => {
    const l = linkById(b.dataset.id); if (!l || !l.recipe) return;
    const picked = [...document.querySelectorAll('#recipe-box [data-ing]')].filter(x => x.checked).map(x => l.recipe.ingredients[+x.dataset.ing]).filter(Boolean);
    if (!picked.length) return toast('Huk av det dere trenger å kjøpe først.');
    try {
      const r = await write(shopOps(picked, l.title));
      if (S.sheet) S.sheet.added = true;
      renderRecipeBox();
      toast(r.queued ? QUEUED : 'La til ' + picked.length + (picked.length === 1 ? ' vare' : ' varer') + ' i handlelisten');
    } catch (e) { toast(errMsg(e)); }
  },
  'shop-del': b => { write([{ op: 'delete', coll: 'shop', id: b.dataset.id }]).catch(e => toast(errMsg(e))); },
  'shop-clear': () => {
    const ops = shopItems().filter(i => i.done).map(i => ({ op: 'delete', coll: 'shop', id: i.id }));
    if (ops.length) write(ops).then(() => toast('Ryddet')).catch(e => toast(errMsg(e)));
  },
  'shop-share': async () => { try { await navigator.share({ title: 'Handleliste', text: shopText() }); } catch (e) {} },
  'shop-copy': () => copyText(shopText()),
  'feed': async () => {
    const t = today();
    if (S.docs.feeds[t]) return renderPolsa();
    S.justFed = Date.now();
    try { const r = await write([{ op: 'set', coll: 'feeds', id: t, data: { by: S.me, at: Date.now(), treats: {} } }]); toast(r.queued ? QUEUED : 'Nam! ' + pet().name + ' er mett.'); }
    catch (e) { toast(errMsg(e)); }
    afterFeed();
  },
  'treat': async () => {
    const t = today(), f = S.docs.feeds[t]; if (!f) return;
    const n = ((f.treats || {})[S.me] || 0) + 1; if (n > 5) return;
    S.justFed = Date.now();
    write([{ op: 'merge', coll: 'feeds', id: t, data: { treats: { [S.me]: n } } }]).catch(e => toast(errMsg(e)));
    toast(['Voff!', 'Logrelogre!', 'Nam nam!', pet().name + ' elsker deg!', pet().name + ' er stappmett nå.'][n - 1]);
    afterFeed();
  },
  'pet-settings': () => openSheet(petSheet(), { type: 'pet' }, 'Hunden'),
  'play-game': () => openGame(),
  'play': b => { const l = linkById(b.dataset.id); if (l) openSheet(playSheet(l), { type: 'play', id: l.id }, l.title); },
  'quiz-new': b => {
    const mode = b.dataset.k;
    openSheet(quizNewSheet(mode, mode === 'egen' ? '' : pickQ(mode)), { type: 'quiz-new', mode }, QMODES[mode]);
  },
  'quiz-shuffle': b => {
    const cur = ($('#fq-q') || {}).value, q = pickQ(b.dataset.k, cur);
    $('#fq-q').value = q; $('#fq-qtext').textContent = q;
  },
  'fq-pick': async b => {
    const q = ($('#fq-q') || {}).value; if (!q) return;
    const id = newId();
    const ok = await quizWrite([
      { op: 'set', coll: 'quiz', id, data: { mode: 'hvem', q, by: S.me, createdAt: Date.now(), answers: { [S.me]: b.dataset.id } } },
      plingOp('quiz', q, { type: 'quiz', id })
    ], 'Sendt! Nå er det ' + partnerName() + ' sin tur.');
    if (ok) closeSheet();
  },
  'qa-pick': async b => {
    const q = S.quiz.find(x => x.id === S.sheet.id); if (!q) return;
    const others = memberIds().filter(id => id !== S.me && (q.answers || {})[id]);
    const ops = [{ op: 'merge', coll: 'quiz', id: q.id, data: { answers: { [S.me]: b.dataset.id } } }];
    if (others.length) {
      const agree = (q.answers || {})[others[0]] === b.dataset.id;
      ops.push(plingOp('quiz', 'Fasit: ' + (agree ? 'dere er enige!' : 'dere er uenige.') + ' «' + q.q + '»', { type: 'quiz', id: q.id }));
    }
    await quizWrite(ops, others.length ? 'Svaret er sendt' : 'Svaret er lagret');
    renderQuizSheet(true);
  },
  'qa-opt': async b => {
    const q = S.quiz.find(x => x.id === S.sheet.id); if (!q || q.guess) return;
    const pick = +b.dataset.i, verdict = pick === q.correct ? 'riktig' : 'feil';
    await quizWrite([
      { op: 'merge', coll: 'quiz', id: q.id, data: { guess: { by: S.me, pick, at: Date.now() }, verdict } },
      plingOp('quiz', nm(S.me) + ' svarte ' + (verdict === 'riktig' ? 'riktig' : 'feil') + ' på «' + q.q + '»', { type: 'quiz', id: q.id })
    ], verdict === 'riktig' ? 'Riktig! 2 poeng' : 'Feil denne gangen');
    renderQuizSheet(true);
  },
  'qa-verdict': async b => {
    const q = S.quiz.find(x => x.id === S.sheet.id); if (!q || !q.guess) return;
    const v = b.dataset.v;
    await quizWrite([
      { op: 'merge', coll: 'quiz', id: q.id, data: { verdict: v } },
      plingOp('quiz', 'Fasit på «' + q.q + '»: ' + VERDICT_TXT[v].toLowerCase(), { type: 'quiz', id: q.id })
    ], 'Lagret');
    renderQuizSheet(true);
  },
  'quiz-open': b => openQuiz(b.dataset.id),
  'quiz-all': () => openSheet(quizAllSheet(), { type: 'quiz-all' }, 'Quizrunder'),
  'quiz-del-ask': () => { if (S.sheet) { S.sheet.confirm = 'del'; renderQuizSheet(true); } },
  'quiz-del-no': () => { if (S.sheet) { S.sheet.confirm = null; renderQuizSheet(true); } },
  'quiz-del-yes': async () => { const id = S.sheet && S.sheet.id; if (!id) return; if (await quizWrite([{ op: 'delete', coll: 'quiz', id }], 'Runden er slettet')) closeSheet(); },
  'skip-install': () => { LS.set('pp-skip-install', true); startFlow(); },
  'retry-start': () => startFlow(),
  'who-new': () => { S.who = 'new'; S.startErr = ''; renderStart(); },
  'who-list': () => { S.who = null; S.startErr = ''; renderStart(); },
  'pick-me': b => { S.me = b.dataset.id; LS.set('pp-me', S.me); enterApp(); }
};

document.addEventListener('click', e => {
  const star = e.target.closest('[data-star]');
  if (star) {
    const n = +star.dataset.star, wrap = star.parentElement;
    wrap.querySelectorAll('[data-star]').forEach(x => { x.classList.toggle('on', +x.dataset.star <= n); x.setAttribute('aria-pressed', String(+x.dataset.star === n)); });
    if (star.dataset.group === 'fd' && S.sheet) S.sheet.stars = n;
    if (star.dataset.group === 'dd') setMyRating(star.dataset.id, { stars: n });
    return;
  }
  const a = e.target.closest('[data-act]');
  if (!a || !ACT[a.dataset.act] || a.tagName === 'A') return;
  e.preventDefault();
  ACT[a.dataset.act](a, e);
});
document.addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target;
  if (f.id === 'f-link') saveLink(f);
  else if (f.id === 'f-dinner') saveDinner(f);
  else if (f.id === 'f-pling') submitPling(f);
  else if (f.id === 'f-name') {
    const name = f.name.value.trim().slice(0, 24);
    if (!name) return ferr(f, 'Skriv inn et navn.');
    try { const r = await write([{ op: 'merge', coll: 'members', id: S.me, data: { name } }]); toast(r.queued ? QUEUED : 'Navnet er lagret'); closeSheet(); }
    catch (err) { ferr(f, errMsg(err)); }
  } else if (f.id === 'f-ddedit') {
    const id = f.dataset.id, title = f.title.value.trim(), madeOn = f.madeOn.value;
    if (!title) return ferr(f, 'Middagen trenger et navn.');
    if (!parseDay(madeOn)) return ferr(f, 'Velg en dato.');
    write([{ op: 'merge', coll: 'dinners', id, data: { title, madeOn } }])
      .then(() => { toast('Lagret'); if (S.sheet) S.sheet.openMore = false; renderDetail(true); })
      .catch(err => ferr(f, errMsg(err)));
  } else if (f.id === 'f-shopadd') {
    const parts = f.item.value.split(/[,\n;]+/).map(x => x.trim()).filter(Boolean);
    if (!parts.length) return;
    try { const r = await write(shopOps(parts.map(parseIng), null)); f.item.value = ''; if (r.queued) toast(QUEUED); }
    catch (err) { toast(errMsg(err)); }
    f.item.focus();
  } else if (f.id === 'f-recipe') {
    const id = f.dataset.id, l = linkById(id); if (!l) return;
    const ingredients = f.ings.value.split('\n').map(x => x.trim()).filter(Boolean).slice(0, 40).map(parseIng);
    const steps = f.steps.value.split('\n').map(x => x.replace(/^\s*\d+[.)]\s*/, '').trim()).filter(Boolean).slice(0, 20);
    if (!ingredients.length) return ferr(f, 'Skriv minst én ingrediens.');
    const old = l.recipe || {};
    const recipe = { title: l.title, servings: Math.min(12, Math.max(1, parseInt(f.serv.value, 10) || 2)), time: f.time.value.trim().slice(0, 30), ingredients, steps, tip: old.tip || '', source: 'manual', fromCaption: false, at: Date.now() };
    try { const r = await write([{ op: 'merge', coll: 'links', id, data: { recipe: null } }, { op: 'merge', coll: 'links', id, data: { recipe } }]); toast(r.queued ? QUEUED : 'Oppskriften er lagret'); openSheet(playSheet(linkById(id)), { type: 'play', id }, l.title); }
    catch (err) { ferr(f, errMsg(err)); }
  } else if (f.id === 'f-pet') {
    const name = f.pname.value.trim().slice(0, 20) || 'Pølsa';
    let first = f.first.value, last = f.last.value;
    if (last < first) { const x = first; first = last; last = x; }
    try { const r = await write([{ op: 'merge', coll: 'settings', id: 'pet', data: { name, remind: { on: f.on.checked, first, last } } }]); toast(r.queued ? QUEUED : 'Lagret'); closeSheet(); }
    catch (err) { ferr(f, errMsg(err)); }
  } else if (f.id === 'f-quiz') {
    const mode = f.dataset.mode, q = f.q.value.trim(), a = f.a ? f.a.value.trim() : '';
    if (!q) return ferr(f, 'Skriv et spørsmål først.');
    if (!a) return ferr(f, 'Skriv det riktige svaret, så kan appen vise fasiten etterpå.');
    const id = newId(), data = { mode, q: q.slice(0, 140), by: S.me, subject: S.me, createdAt: Date.now() };
    const wrong = mode === 'egen' ? ['w1', 'w2', 'w3'].map(k => f[k].value.trim()).filter(Boolean) : [];
    if (wrong.length) {
      const opts = [a, ...wrong].map(x => x.slice(0, 80));
      for (let i = opts.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [opts[i], opts[j]] = [opts[j], opts[i]]; }
      data.options = opts; data.correct = opts.indexOf(a.slice(0, 80));
    } else data.answer = a.slice(0, 120);
    const btn = f.querySelector('[type=submit]'); busy(btn, true, 'Sender…');
    const ok = await quizWrite([{ op: 'set', coll: 'quiz', id, data }, plingOp('quiz', q, { type: 'quiz', id })], 'Sendt til ' + partnerName() + '!');
    if (ok) closeSheet(); else busy(btn, false);
  } else if (f.id === 'f-guess') {
    const q = S.quiz.find(x => x.id === (S.sheet && S.sheet.id)), g = f.g.value.trim();
    if (!q) return;
    if (!g) return ferr(f, 'Skriv et gjett først.');
    await quizWrite([
      { op: 'merge', coll: 'quiz', id: q.id, data: { guess: { by: S.me, text: g.slice(0, 120), at: Date.now() } } },
      plingOp('quiz', nm(S.me) + ' har gjettet på «' + q.q + '». Var det riktig?', { type: 'quiz', id: q.id })
    ], 'Svaret er sendt');
    renderQuizSheet(true);
  } else if (f.id === 'f-claim') {
    const btn = f.querySelector('[type=submit]'), key = f.key.value.trim();
    S.keyDraft = key;
    if (key.length < 6) { S.startErr = 'Husnøkkelen må være minst 6 tegn.'; return renderStart(); }
    busy(btn, true, 'Lager…');
    try {
      await api('/api/claim', { method: 'POST', body: { key } });
      S.key = key; LS.set('pp-key', key); S.startErr = ''; S.who = 'new';
      S.stage = 'who'; render(); sync();
    } catch (err) {
      busy(btn, false);
      if (err.code === 'claimed') { S.startErr = 'Noen har allerede laget en husnøkkel. Skriv den inn i stedet.'; S.stage = 'key'; }
      else S.startErr = errMsg(err);
      render();
    }
  } else if (f.id === 'f-key') {
    const btn = f.querySelector('[type=submit]'), key = f.key.value.trim();
    if (!key) { S.startErr = 'Skriv inn husnøkkelen.'; return renderStart(); }
    busy(btn, true, 'Sjekker…');
    S.key = key;
    try {
      const r = await api('/api/sync?since=0');
      S.docs = EMPTY(); applyDocs(r.docs); S.since = r.now || 0; S.synced = true; save(); derive();
      LS.set('pp-key', key); S.startErr = ''; S.who = null;
      S.stage = 'who'; render();
    } catch (err) {
      S.key = null; busy(btn, false);
      S.startErr = err.code === 'key' ? 'Det er ikke riktig husnøkkel. Sjekk skrivemåten.' : errMsg(err);
      renderStart();
    }
  } else if (f.id === 'f-new') {
    const btn = f.querySelector('[type=submit]'), name = f.name.value.trim().slice(0, 24);
    if (!name) { S.startErr = 'Skriv inn navnet ditt.'; return renderStart(); }
    busy(btn, true, 'Lagrer…');
    const id = newId(12);
    try {
      await write([{ op: 'set', coll: 'members', id, data: { name, joinedAt: Date.now() } }]);
      S.me = id; LS.set('pp-me', id); S.startErr = '';
      enterApp();
      toast('Hei, ' + name + '!');
    } catch (err) { busy(btn, false); S.startErr = errMsg(err); renderStart(); }
  }
});
document.addEventListener('input', e => {
  const t = e.target;
  if (t.id === 'q-inspo') { S.q = t.value; renderInspo(); }
  else if (t.id === 'fl-url') {
    const u = extractUrl(t.value);
    if (u && /\s/.test(t.value.trim())) t.value = u;
    updateDetect();
    schedulePreview();
  } else if (t.id === 'dd-comment' && S.sheet) {
    S.sheet.draft = t.value;
    const d = dinnerById(S.sheet.id);
    const saved = d ? (((d.ratings || {})[S.me] || {}).comment || '') : '';
    const blk = t.closest('.rblock');
    const btn = blk && blk.querySelector('[data-act="save-comment"]');
    if (t.value !== saved && !btn && blk) {
      const div = document.createElement('div');
      div.innerHTML = '<button class="btn sm primary" data-act="save-comment" data-id="' + S.sheet.id + '">Lagre kommentar</button>';
      blk.appendChild(div);
    } else if (t.value === saved && btn) btn.parentElement.remove();
  }
});
document.addEventListener('change', async e => {
  const t = e.target;
  if (t.id === 'fd-link') {
    const l = linkById(t.value), ti = $('#fd-title'), uw = $('#fd-url-wrap');
    if (l && ti && !ti.value.trim()) ti.value = l.title;
    if (uw) uw.hidden = !!l;
  } else if (t.id === 'fd-photos' && S.sheet && S.sheet.files) {
    const st = S.sheet, files = [...t.files];
    t.value = '';
    for (const file of files) {
      try { const blob = await compress(file); if (S.sheet !== st) return; st.files.push({ blob, url: URL.createObjectURL(blob) }); }
      catch (err) { ferr($('#f-dinner'), errMsg(err)); }
    }
    renderPreviews();
  } else if (t.id === 'dd-photos' && S.sheet && S.sheet.type === 'dinner') {
    const st = S.sheet, id = st.id, files = [...t.files];
    t.value = '';
    st.uploading = true; renderDetail(true);
    let added = 0;
    for (const file of files) {
      try {
        const blob = await compress(file);
        const pid = await upload(blob);
        const d = dinnerById(id);
        await write([{ op: 'merge', coll: 'dinners', id, data: { photos: (d ? d.photos || [] : []).concat(pid) } }]);
        added++;
      } catch (err) { toast(err.code === 'offline' ? 'Du må være på nett for å laste opp bilder.' : errMsg(err)); }
    }
    st.uploading = false;
    if (added) toast(added === 1 ? 'Bildet er lagt til' : added + ' bilder er lagt til');
    renderDetail(true);
  } else if (t.dataset && t.dataset.shop) {
    const done = t.checked;
    write([{ op: 'merge', coll: 'shop', id: t.dataset.shop, data: { done, doneAt: done ? Date.now() : 0, doneBy: done ? S.me : null } }]).catch(e => toast(errMsg(e)));
  } else if (t.dataset && t.dataset.actChange === 'again') {
    setMyRating(t.dataset.id, { again: t.value });
  }
});
document.addEventListener('focusout', () => { setTimeout(() => { if (S.sheet && S.sheet.stale) { if (S.sheet.type === 'quiz') renderQuizSheet(); else renderDetail(); } }, 50); });
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (S.ovId) closeOverlay(false);
  else if (S.sheet) closeSheet();
});
document.addEventListener('error', e => {
  const t = e.target;
  if (t && t.tagName === 'IMG') { const fig = t.closest('figure'); if (fig) fig.classList.add('broken'); else t.style.visibility = 'hidden'; }
}, true);

/* Keep in sync: when the app is visible, when the network returns, and when a push arrives */
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && S.stage === 'app') { sync(); checkPush().then(render); } });
window.addEventListener('online', () => { S.online = true; if (S.stage === 'app') sync(); });
window.addEventListener('offline', () => { S.online = false; if (S.stage === 'app') render(); });
setInterval(() => { if (document.visibilityState === 'visible' && S.stage === 'app') sync(); }, 15000);
window.addEventListener('hashchange', () => { if (S.stage !== 'app') return; if (/polsa/.test(location.hash)) S.tab = 'polsa'; else if (/pling/.test(location.hash)) S.tab = 'pling'; else if (/handle/.test(location.hash)) S.tab = 'handle'; else return; render(); });
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
  navigator.serviceWorker.addEventListener('message', e => {
    const m = e.data || {};
    if (m.type === 'push') sync();
    if (m.type === 'open') { if (S.stage === 'app') { S.tab = /polsa/.test(m.url || '') ? 'polsa' : 'pling'; render(); } sync(); }
  });
}

/* ---------- start ---------- */
$('#logo').innerHTML = dog('hei');
derive();
startFlow();
})();
