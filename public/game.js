// Pølsehopp – spillet.
// Pølsa løper av seg selv. Trykk for å hoppe, hold inne for å hoppe høyere.
// Hopp over kongler, brannhydranter, katter og vannpytter, og samle pølser.
// Fuglene flyr akkurat der du hopper, så der skal du bli på bakken.
// Banen lages fra dagens dato, så dere får nøyaktig samme bane på hver deres telefon.
window.PolseHopp = (() => {
  'use strict';
  const W = 470, DOG_X = 40, STEP = 1000 / 60;
  const GRAV = 0.78, JUMP = -12.6, HOLD_GRAV = 0.4, HOLD_MAX = 16, S = 0.48;
  const speedAt = (d) => Math.min(12, 6 + d * 0.0007);

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function seedOf(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = h << 13 | h >>> 19; }
    return h >>> 0;
  }
  function colors() {
    const cs = getComputedStyle(document.documentElement);
    const v = (n, d) => cs.getPropertyValue(n).trim() || d;
    return {
      bg: v('--bg', '#EDF4EF'), surface: v('--surface', '#fff'), surface2: v('--surface-2', '#E2ECE5'), ink: v('--ink', '#1B2822'), ink2: v('--ink-2', '#55665D'),
      line: v('--line', '#D0DED4'), ketchup: v('--ketchup', '#D63F2B'), mustard: v('--mustard', '#F2B53A'), basil: v('--basil', '#2D7A52'), hills: v('--tile-3', '#CBE5D5'),
      sky: v('--sky', '#4F78C9'), dog: v('--dog', '#B4683A'), dogDark: v('--dog-dark', '#7B4023'), dogLight: v('--dog-light', '#E4AC7C'), nose: v('--dog-nose', '#2A1910'), blush: v('--blush', '#EE8B8B')
    };
  }
  const P = {
    neck: new Path2D('M176 74Q196 62 200 40L226 52Q222 84 200 102Z'),
    ear: new Path2D('M204 30Q186 32 188 56Q190 74 203 70Q211 58 209 36Z'),
    mouth: new Path2D('M244 64q6 4 12-1'),
    collar: new Path2D('M190 67Q206 79 224 71'),
    tail: new Path2D('M64 80Q42 74 32 50')
  };

  /* ---------- sound ---------- */
  let actx = null;
  function beep(kind) {
    try {
      if (!actx) { const A = window.AudioContext || window.webkitAudioContext; if (!A) return; actx = new A(); }
      if (actx.state === 'suspended') actx.resume();
      const t = actx.currentTime, o = actx.createOscillator(), g = actx.createGain();
      const f = { jump: [420, 640], saus: [880, 1320], crash: [220, 90] }[kind] || [440, 440];
      o.type = kind === 'crash' ? 'sawtooth' : 'triangle';
      o.frequency.setValueAtTime(f[0], t); o.frequency.exponentialRampToValueAtTime(f[1], t + (kind === 'crash' ? 0.35 : 0.1));
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(kind === 'crash' ? 0.12 : 0.08, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + (kind === 'crash' ? 0.4 : 0.14));
      o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + 0.45);
    } catch (e) {}
  }

  /* ---------- drawing ---------- */
  function rr(c, x, y, w, h, r) { c.beginPath(); if (c.roundRect) c.roundRect(x, y, w, h, r); else c.rect(x, y, w, h); }
  function drawDog(c, C, x, y, t, air, dead) {
    c.save();
    c.translate(x - 52 * S, y - 138 * S);
    c.scale(S, S);
    const run = air ? 0 : t * 0.42;
    const leg = (lx, ly, w, h, ang, fill) => {
      c.save(); c.translate(lx + w / 2, ly + 4); c.rotate(ang);
      rr(c, -w / 2, -4, w, h, w / 2); c.fillStyle = fill; c.fill(); c.restore();
    };
    const swing = (o) => air ? (o > 0 ? -0.55 : 0.55) : Math.sin(run + o) * 0.6;
    // tail
    c.save(); c.translate(62, 80); c.rotate(dead ? 0.9 : Math.sin(t * 0.5) * 0.3); c.translate(-62, -80);
    c.strokeStyle = C.dog; c.lineWidth = 8; c.lineCap = 'round'; c.stroke(P.tail); c.restore();
    // far legs, body, near legs
    leg(76, 94, 17, 44, swing(Math.PI), C.dogDark);
    leg(187, 94, 17, 44, swing(0), C.dogDark);
    rr(c, 52, 66, 150, 48, 24); c.fillStyle = C.dog; c.fill();
    c.beginPath(); c.ellipse(128, 106, 62, 6, 0, 0, Math.PI * 2); c.fillStyle = C.dogLight; c.globalAlpha = 0.55; c.fill(); c.globalAlpha = 1;
    leg(60, 96, 18, 42, swing(0), C.dog);
    leg(171, 96, 18, 42, swing(Math.PI), C.dog);
    c.fillStyle = C.dog; c.fill(P.neck);
    // head
    c.save();
    c.translate(200, 74); c.rotate(air ? -0.08 : Math.sin(t * 0.21) * 0.03); c.translate(-200, -74);
    c.beginPath(); c.arc(214, 48, 22, 0, Math.PI * 2); c.fillStyle = C.dog; c.fill();
    c.beginPath(); c.ellipse(238, 58, 20, 11, 0, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.ellipse(241, 62, 15, 6, 0, 0, Math.PI * 2); c.fillStyle = C.dogLight; c.fill();
    c.beginPath(); c.arc(257, 54, 5.5, 0, Math.PI * 2); c.fillStyle = C.nose; c.fill();
    c.strokeStyle = C.nose; c.lineWidth = 1.8; c.lineCap = 'round'; c.stroke(P.mouth);
    if (dead) {
      c.lineWidth = 2.6; c.beginPath(); c.moveTo(216, 38); c.lineTo(224, 46); c.moveTo(224, 38); c.lineTo(216, 46); c.stroke();
    } else {
      c.beginPath(); c.arc(220, 42, 3.9, 0, Math.PI * 2); c.fillStyle = C.nose; c.fill();
      c.beginPath(); c.arc(221.4, 40.6, 1.3, 0, Math.PI * 2); c.fillStyle = '#fff'; c.fill();
    }
    c.beginPath(); c.arc(230, 55, 4.5, 0, Math.PI * 2); c.fillStyle = C.blush; c.globalAlpha = 0.55; c.fill(); c.globalAlpha = 1;
    c.save(); c.translate(206, 32); c.rotate(air ? -0.35 : Math.sin(run) * 0.12); c.translate(-206, -32);
    c.fillStyle = C.dogDark; c.fill(P.ear); c.restore();
    c.restore();
    c.strokeStyle = C.ketchup; c.lineWidth = 6; c.stroke(P.collar);
    c.beginPath(); c.arc(207, 79, 4.5, 0, Math.PI * 2); c.fillStyle = C.mustard; c.fill();
    c.restore();
  }
  function drawObstacle(c, C, o, sx, G, t) {
    const x = sx, w = o.w, h = o.h;
    if (o.type === 'kongle') {
      c.beginPath(); c.ellipse(x + w / 2, G - h / 2, w / 2, h / 2, 0, 0, Math.PI * 2); c.fillStyle = C.dogDark; c.fill();
      c.strokeStyle = C.dogLight; c.lineWidth = 1.6;
      for (let i = 1; i < 4; i++) { c.beginPath(); c.moveTo(x + 4, G - h * i / 4); c.lineTo(x + w / 2, G - h * i / 4 + 5); c.lineTo(x + w - 4, G - h * i / 4); c.stroke(); }
      c.fillStyle = C.basil; rr(c, x + w / 2 - 2, G - h - 6, 4, 8, 2); c.fill();
    } else if (o.type === 'hydrant') {
      c.fillStyle = C.ketchup;
      rr(c, x + 3, G - h + 10, w - 6, h - 10, 5); c.fill();
      rr(c, x, G - h + 4, w, 8, 4); c.fill();
      c.beginPath(); c.arc(x + w / 2, G - h + 4, w / 2 - 4, Math.PI, 0); c.fill();
      rr(c, x - 4, G - h * 0.55, w + 8, 7, 3); c.fill();
      c.fillStyle = C.mustard; c.beginPath(); c.arc(x + w / 2, G - h * 0.52 + 3, 3, 0, Math.PI * 2); c.fill();
    } else if (o.type === 'katt') {
      c.fillStyle = C.ink2;
      c.beginPath(); c.ellipse(x + w * 0.45, G - h * 0.33, w * 0.42, h * 0.33, 0, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.arc(x + w * 0.62, G - h * 0.72, h * 0.22, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.moveTo(x + w * 0.48, G - h * 0.8); c.lineTo(x + w * 0.5, G - h); c.lineTo(x + w * 0.6, G - h * 0.88); c.fill();
      c.beginPath(); c.moveTo(x + w * 0.66, G - h * 0.88); c.lineTo(x + w * 0.78, G - h); c.lineTo(x + w * 0.78, G - h * 0.8); c.fill();
      c.strokeStyle = C.ink2; c.lineWidth = 5; c.lineCap = 'round';
      c.beginPath(); c.moveTo(x + 4, G - 6); c.quadraticCurveTo(x - 8, G - h * 0.4 + Math.sin(t * 0.15) * 4, x + 2, G - h * 0.62); c.stroke();
      c.fillStyle = C.mustard; c.beginPath(); c.arc(x + w * 0.58, G - h * 0.74, 2, 0, Math.PI * 2); c.arc(x + w * 0.7, G - h * 0.74, 2, 0, Math.PI * 2); c.fill();
    } else if (o.type === 'pytt') {
      c.beginPath(); c.ellipse(x + w / 2, G - 1, w / 2, 7, 0, 0, Math.PI * 2); c.fillStyle = C.sky; c.globalAlpha = 0.55; c.fill(); c.globalAlpha = 1;
      c.strokeStyle = C.surface; c.lineWidth = 2; c.beginPath(); c.moveTo(x + w * 0.3, G - 3); c.lineTo(x + w * 0.45, G - 3); c.stroke();
    } else if (o.type === 'fugl') {
      const f = Math.sin(t * 0.35) * 7, cy = o.y + h / 2;
      c.strokeStyle = C.ink; c.lineWidth = 4; c.lineCap = 'round'; c.lineJoin = 'round';
      c.beginPath(); c.moveTo(x, cy - f); c.quadraticCurveTo(x + w * 0.25, cy - 6 - f, x + w / 2, cy); c.quadraticCurveTo(x + w * 0.75, cy - 6 - f, x + w, cy - f); c.stroke();
      c.fillStyle = C.ink; c.beginPath(); c.ellipse(x + w / 2, cy + 2, 6, 4, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = C.mustard; c.beginPath(); c.moveTo(x + w / 2 - 6, cy + 2); c.lineTo(x + w / 2 - 12, cy + 4); c.lineTo(x + w / 2 - 6, cy + 5); c.fill();
    }
  }
  function drawSausage(c, C, sx, y, t) {
    const bob = Math.sin(t * 0.12 + sx * 0.05) * 2;
    c.save(); c.translate(sx, y + bob);
    rr(c, 0, 0, 30, 12, 6); c.fillStyle = C.ketchup; c.fill();
    c.strokeStyle = C.mustard; c.lineWidth = 2; c.lineCap = 'round';
    c.beginPath(); c.moveTo(5, 6); c.quadraticCurveTo(9, 2, 13, 6); c.quadraticCurveTo(17, 10, 21, 6); c.quadraticCurveTo(24, 3, 26, 5); c.stroke();
    c.restore();
  }

  /* ---------- the game ---------- */
  function open(host, opts) {
    host.innerHTML = '<div class="g-top gut"><div class="g-top-in">'
      + '<button class="x g-x" data-g="close" aria-label="Lukk spillet"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg></button>'
      + '<div class="g-name"><b>Pølsehopp</b><span>' + (opts.sub || '') + '</span></div>'
      + '<div class="g-score" aria-live="off"><span id="g-score">0</span><small id="g-saus">0 pølser</small></div></div></div>'
      + '<div class="g-stage" id="g-stage"><canvas id="g-canvas" aria-label="Spillet"></canvas><div class="g-panel" id="g-panel"></div></div>';
    host.hidden = false;
    const stage = host.querySelector('#g-stage'), canvas = host.querySelector('#g-canvas'), panel = host.querySelector('#g-panel');
    const scoreEl = host.querySelector('#g-score'), sausEl = host.querySelector('#g-saus');
    const c = canvas.getContext('2d');
    let C = colors(), scale = 1, H = 360, G = 316, raf = 0, last = 0, acc = 0;
    let st = null;

    function size() {
      const r = stage.getBoundingClientRect();
      const cssW = r.width, cssH = Math.max(220, Math.min(r.height, cssW * 0.95));
      const dpr = Math.min(3, window.devicePixelRatio || 1);
      canvas.style.height = cssH + 'px';
      canvas.width = Math.round(cssW * dpr); canvas.height = Math.round(cssH * dpr);
      scale = cssW / W; H = cssH / scale; G = Math.round(H * 0.76);
      c.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
      if (st) { st.y = Math.min(st.y, G); if (!st.air) st.y = G; }
      draw();
    }
    function reset() {
      st = { rng: mulberry32(seedOf(opts.seed || 'polse')), t: 0, dist: 0, y: G, vy: 0, air: false, holding: false, holdT: 0,
        obs: [], items: [], nextAt: 700, saus: 0, score: 0, over: false, running: false, paused: false, hit: null };
    }
    function spawn() {
      const rng = st.rng, d = st.nextAt, sp = speedAt(d);
      const r = rng();
      let o;
      if (d > 1800 && r < 0.17) o = { type: 'fugl', w: 38, h: 18, air: true };
      else if (r < 0.40) o = { type: 'kongle', w: 22, h: 28 };
      else if (r < 0.62) o = { type: 'hydrant', w: 26, h: 46 };
      else if (r < 0.82) o = { type: 'katt', w: 40, h: 44 };
      else o = { type: 'pytt', w: 64 + Math.floor(rng() * 40), h: 6 };
      o.x = d;
      st.obs.push(o);
      const gap = 210 + sp * 15 + rng() * 260;
      if (rng() < 0.62) {
        const high = !o.air && rng() < 0.5, n = 1 + Math.floor(rng() * 3);
        for (let i = 0; i < n; i++) st.items.push({ x: d + o.w + gap * 0.42 + i * 36, high, got: false });
      }
      st.nextAt = d + o.w + gap;
    }
    function dogBox() { return { x1: DOG_X + 8, x2: DOG_X + 96, y1: st.y - 50, y2: st.y - 3 }; }
    function step() {
      st.t++;
      const sp = speedAt(st.dist);
      st.dist += sp;
      if (st.air) {
        if (st.holding && st.vy < 0 && st.holdT < HOLD_MAX) { st.vy += HOLD_GRAV; st.holdT++; } else st.vy += GRAV;
        st.y += st.vy;
        if (st.y >= G) { st.y = G; st.vy = 0; st.air = false; }
      }
      while (st.nextAt < st.dist + W + 120) spawn();
      const b = dogBox();
      for (const o of st.obs) {
        const sx = o.x - st.dist + DOG_X;
        if (sx > W || sx + o.w < 0) continue;
        let hit = false;
        if (o.type === 'pytt') hit = !st.air && st.y >= G - 2 && b.x2 - 14 > sx + 10 && b.x1 + 10 < sx + o.w - 10;
        else if (o.type === 'fugl') { o.y = G - 66 - o.h; hit = b.x2 > sx + 4 && b.x1 < sx + o.w - 4 && b.y1 < o.y + o.h - 2 && b.y2 > o.y + 2; }
        else hit = b.x2 > sx + 4 && b.x1 < sx + o.w - 4 && b.y2 > G - o.h + 4;
        if (hit) { st.hit = o; return gameOver(); }
      }
      for (const it of st.items) {
        if (it.got) continue;
        const sx = it.x - st.dist + DOG_X, iy = it.high ? G - 96 : G - 26;
        if (b.x2 > sx && b.x1 < sx + 30 && b.y1 < iy + 12 && b.y2 > iy) { it.got = true; st.saus++; beep('saus'); }
      }
      st.obs = st.obs.filter((o) => o.x - st.dist + DOG_X > -160);
      st.items = st.items.filter((it) => it.x - st.dist + DOG_X > -60);
      st.score = Math.floor(st.dist / 10) + st.saus * 25;
    }
    function draw() {
      if (!st) return;
      c.fillStyle = C.bg; c.fillRect(0, 0, W, H);
      // clouds
      c.fillStyle = C.surface;
      const co = (st.dist * 0.25) % 700;
      for (let i = -1; i < 3; i++) {
        const x = i * 350 - co + 120, y = H * 0.18 + (i % 2) * 26;
        c.beginPath(); c.ellipse(x, y, 34, 12, 0, 0, Math.PI * 2); c.ellipse(x + 26, y - 8, 24, 14, 0, 0, Math.PI * 2); c.ellipse(x + 52, y, 30, 11, 0, 0, Math.PI * 2); c.fill();
      }
      // hills
      c.fillStyle = C.hills; c.beginPath(); c.moveTo(0, G);
      const ho = st.dist * 0.12;
      for (let x = 0; x <= W; x += 10) c.lineTo(x, G - 34 - Math.sin((x + ho) * 0.012) * 20 - Math.sin((x + ho) * 0.031) * 8);
      c.lineTo(W, G); c.closePath(); c.fill();
      // ground
      c.fillStyle = C.surface2; c.fillRect(0, G, W, H - G);
      c.fillStyle = C.line; c.fillRect(0, G, W, 2);
      const go = st.dist % 48;
      for (let x = -go; x < W; x += 48) { c.fillRect(x, G + 14, 18, 2); c.fillRect(x + 24, G + 30, 10, 2); c.fillRect(x + 8, G + 50, 14, 2); c.fillRect(x + 30, G + 72, 8, 2); }
      for (const it of st.items) { if (!it.got) drawSausage(c, C, it.x - st.dist + DOG_X, it.high ? G - 96 : G - 26, st.t); }
      for (const o of st.obs) { if (o.type === 'fugl') o.y = G - 66 - o.h; drawObstacle(c, C, o, o.x - st.dist + DOG_X, G, st.t); }
      drawDog(c, C, DOG_X, st.y, st.t, st.air, st.over);
      if (scoreEl.textContent !== String(st.score)) scoreEl.textContent = String(st.score);
      const sTxt = st.saus === 1 ? '1 pølse' : st.saus + ' pølser';
      if (sausEl.textContent !== sTxt) sausEl.textContent = sTxt;
    }
    function frame(ts) {
      if (!st.running || st.paused) return;
      if (!last) last = ts;
      acc += Math.min(100, ts - last); last = ts;
      while (acc >= STEP && !st.over) { step(); acc -= STEP; }
      draw();
      if (!st.over) raf = requestAnimationFrame(frame);
    }
    function begin() {
      reset(); st.running = true; last = 0; acc = 0; panel.innerHTML = ''; panel.hidden = true;
      cancelAnimationFrame(raf); raf = requestAnimationFrame(frame);
    }
    function gameOver() {
      st.over = true; st.running = false; beep('crash');
      try { if (navigator.vibrate) navigator.vibrate(120); } catch (e) {}
      draw();
      const names = { kongle: 'en kongle', hydrant: 'en brannhydrant', katt: 'en katt', pytt: 'en vannpytt', fugl: 'en fugl' };
      const result = { score: st.score, sausages: st.saus, distance: Math.round(st.dist), hit: st.hit ? names[st.hit.type] : '' };
      try { if (opts.onOver) opts.onOver(result); } catch (e) {}
      setTimeout(() => { panel.innerHTML = opts.renderOver ? opts.renderOver(result) : ''; panel.hidden = false; }, 450);
    }
    function press(e) {
      if (!st || !st.running || st.over) return;
      if (st.paused) { if (e.cancelable) e.preventDefault(); st.paused = false; panel.hidden = true; last = 0; raf = requestAnimationFrame(frame); return; }
      if (e.target.closest && e.target.closest('.g-card')) return;
      if (e.cancelable) e.preventDefault();
      if (!st.air) { st.vy = JUMP; st.air = true; st.holdT = 0; beep('jump'); }
      st.holding = true;
    }
    function release() { if (st) st.holding = false; }
    function key(e) {
      if (e.repeat) return;
      if (e.key === 'Escape') return close();
      if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w') {
        e.preventDefault();
        if (st && !st.running && !panel.hidden) { const b = panel.querySelector('[data-g="start"],[data-g="again"]'); if (b) b.click(); return; }
        press(e);
      }
    }
    function keyUp(e) { if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w') release(); }
    function vis() {
      if (document.visibilityState === 'hidden' && st && st.running && !st.over) {
        st.paused = true; cancelAnimationFrame(raf);
        panel.hidden = false;
        panel.innerHTML = '<div class="g-card"><h3>Pause</h3><p>Trykk hvor som helst for å fortsette.</p></div>';
      }
    }
    function click(e) {
      const b = e.target.closest('[data-g]');
      if (!b) return;
      const g = b.dataset.g;
      if (g === 'close') close();
      else if (g === 'start' || g === 'again') begin();
    }
    function close() {
      cancelAnimationFrame(raf);
      stage.removeEventListener('pointerdown', press);
      window.removeEventListener('pointerup', release);
      window.removeEventListener('pointercancel', release);
      window.removeEventListener('keydown', key);
      window.removeEventListener('keyup', keyUp);
      window.removeEventListener('resize', size);
      document.removeEventListener('visibilitychange', vis);
      host.removeEventListener('click', click);
      host.hidden = true; host.innerHTML = '';
      if (opts.onClose) opts.onClose();
    }
    stage.addEventListener('pointerdown', press);
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
    window.addEventListener('keydown', key);
    window.addEventListener('keyup', keyUp);
    window.addEventListener('resize', size);
    document.addEventListener('visibilitychange', vis);
    host.addEventListener('click', click);
    reset();
    requestAnimationFrame(size);
    panel.hidden = false;
    panel.innerHTML = opts.startHtml || '<div class="g-card"><button class="btn primary big" data-g="start">Start</button></div>';
    return { close, begin, state: () => st };
  }

  return { open, seedOf, mulberry32 };
})();
