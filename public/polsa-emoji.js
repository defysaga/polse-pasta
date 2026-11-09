// Pølsa-emojier: Pølsa tegnet som små emojier, brukt i stedet for vanlige emojier i appen.
//   PE.face(navn, størrelse)  → et Pølsa-ansikt (klem, kyss, sover, kokkelue …)
//   PE.cover(ting)            → Pølsa med mat, til kort uten bilde (valgt ut fra ordene i navnet)
// Fargene kommer fra appens fargetokens, så de følger lyst og mørkt tema.
window.PE = (() => {
  'use strict';
  const DOG = 'var(--dog)', DARK = 'var(--dog-dark)', LIGHT = 'var(--dog-light)', NOSE = 'var(--dog-nose)';
  const RED = 'var(--ketchup)', YEL = 'var(--mustard)', SKY = 'var(--sky)', GREEN = 'var(--basil)', BLUSH = 'var(--blush)';
  const TONGUE = 'var(--tongue)', TEDDY = 'var(--teddy)', INK2 = 'var(--ink-2)';
  // Mat og ting i illustrasjonene har faste farger, som på et ekte bilde
  const PLATE = '#FBF7F0', RIM = '#E6DDCF', CRUST = '#E3A24E', CHEESE = '#F6C445', MEAT = '#7A3E22', STEEL = '#B9BDB5', LEAF = '#5DAA4C';
  const HEART = 'M12 21s-7.6-4.6-9.6-9.3C1 8.3 3.2 4.5 6.9 4.5c2 0 3.6 1.1 5.1 3 1.5-1.9 3.1-3 5.1-3 3.7 0 5.9 3.8 4.5 7.2C19.6 16.4 12 21 12 21z';
  const STAR = 'M12 2.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.4l-5.8 3.1 1.1-6.5L2.6 9.4l6.5-.9z';
  const heart = (cx, cy, s, fill, extra) => '<path d="' + HEART + '" transform="translate(' + (cx - 12 * s) + ' ' + (cy - 12.5 * s) + ') scale(' + s + ')" fill="' + fill + '"' + (extra || '') + '/>';
  const line = (d, color, w) => '<path d="' + d + '" fill="none" stroke="' + (color || NOSE) + '" stroke-width="' + (w || 1.6) + '" stroke-linecap="round" stroke-linejoin="round"/>';
  const lips = (x, y, s) => '<g transform="translate(' + x + ' ' + y + ') scale(' + s + ')"><path d="M0 5C3 0 7 0 10 3C13 0 17 0 20 5C16 11.5 4 11.5 0 5Z" fill="' + RED + '"/>' + line('M2 5Q10 7 18 5', 'rgba(0,0,0,.28)', 1.4) + '</g>';
  const paw = (x, y, rot) => '<g transform="translate(' + x + ' ' + y + ') rotate(' + (rot || 0) + ')"><ellipse rx="4.8" ry="3.8" fill="' + DOG + '"/>' + line('M-1.6 -3.2V-1.2M1.6 -3.2V-1.2', DARK, 1.1) + '</g>';

  /* ---------- deler av ansiktet ---------- */
  const EYES = {
    open: () => [25.5, 38.5].map(x => '<circle cx="' + x + '" cy="27" r="2.7" fill="' + NOSE + '"/><circle cx="' + (x + 1) + '" cy="26" r="1" fill="#fff"/>').join(''),
    big: () => [25.5, 38.5].map(x => '<circle cx="' + x + '" cy="27" r="3.6" fill="' + NOSE + '"/><circle cx="' + (x + 1.2) + '" cy="25.6" r="1.35" fill="#fff"/><circle cx="' + (x - 1.1) + '" cy="28.5" r=".6" fill="#fff"/>').join(''),
    happy: () => line('M22.6 28.2Q25.5 24.2 28.4 28.2') + line('M35.6 28.2Q38.5 24.2 41.4 28.2'),
    closed: () => line('M22.6 26.8Q25.5 29.8 28.4 26.8') + line('M35.6 26.8Q38.5 29.8 41.4 26.8'),
    heart: () => heart(25.5, 27, .3, RED) + heart(38.5, 27, .3, RED),
    wink: () => '<circle cx="25.5" cy="27" r="2.7" fill="' + NOSE + '"/><circle cx="26.5" cy="26" r="1" fill="#fff"/>' + line('M35.6 28.2Q38.5 24.2 41.4 28.2'),
    star: () => ['25.5', '38.5'].map(x => '<path d="' + STAR + '" transform="translate(' + (x - 4) + ' 23) scale(.34)" fill="' + YEL + '"/>').join('')
  };
  const MOUTH = {
    smile: () => line('M32 38.4V40.2') + line('M28.4 40Q30.2 42.6 32 40.2Q33.8 42.6 35.6 40'),
    open: () => '<path d="M28.6 40.2Q32 47.6 35.4 40.2Z" fill="' + NOSE + '"/><ellipse cx="32" cy="43.7" rx="2.3" ry="1.5" fill="' + TONGUE + '"/>',
    tongue: () => line('M32 38.4V40.2') + '<path d="M30.3 41.1Q30.2 46.6 32.5 46.6Q34.7 46.6 34.5 41.1Z" fill="' + TONGUE + '"/>' + line('M32.4 42V44.6', 'rgba(0,0,0,.22)', 1) + line('M28.4 40Q30.2 42.6 32 40.2Q33.8 42.6 35.6 40'),
    kiss: () => line('M32 38.4V39.6') + '<ellipse cx="32.6" cy="41.4" rx="2" ry="1.6" fill="' + RED + '"/>',
    sad: () => line('M32 38.4V40') + line('M28.8 42.6Q32 39.6 35.2 42.6'),
    flat: () => line('M32 38.4V40.4') + line('M29.4 41H34.6')
  };
  /* Tilbehør: tegnes oppå ansiktet */
  const EXTRA = {
    hearts: () => heart(53, 13, .42, RED) + heart(46, 5.5, .27, RED, ' opacity=".85"'),
    heart1: () => heart(53, 12, .4, RED),
    lips: () => lips(43.5, 4, .7),
    hug: (c) => heart(32, 53.5, .62, c || RED) + paw(22.6, 54.6, 25) + paw(41.4, 54.6, -25),
    hugY: () => EXTRA.hug(YEL),
    bear: () => '<g><circle cx="26.2" cy="47.6" r="2.9" fill="' + TEDDY + '"/><circle cx="37.8" cy="47.6" r="2.9" fill="' + TEDDY + '"/><circle cx="32" cy="54" r="7.6" fill="' + TEDDY + '"/>'
      + '<ellipse cx="32" cy="56.6" rx="3.4" ry="2.5" fill="' + PLATE + '" opacity=".8"/><circle cx="29.3" cy="52.4" r=".95" fill="' + NOSE + '"/><circle cx="34.7" cy="52.4" r=".95" fill="' + NOSE + '"/><ellipse cx="32" cy="55.6" rx="1.2" ry=".85" fill="' + NOSE + '"/></g>'
      + paw(22, 55, 30) + paw(42, 55, -30),
    squeeze: () => line('M6.5 38Q3.2 44.5 6.5 51', INK2, 1.8) + line('M57.5 38Q60.8 44.5 57.5 51', INK2, 1.8),
    tear: () => '<path d="M22.8 30.6Q20.4 34.6 22.8 36Q25.2 34.6 22.8 30.6Z" fill="' + SKY + '"/>',
    cheekkiss: () => lips(40.5, 33, .34),
    nosehrt: () => heart(39.6, 31.4, .24, RED),
    wave: () => '<g transform="translate(52 40) rotate(-18)"><ellipse rx="4.6" ry="5.6" fill="' + DOG + '"/>' + line('M-1.8 -4.4V-2.2M1.8 -4.4V-2.2', DARK, 1.1) + '</g>' + line('M57.5 30.5Q60 32.5 58.8 35.4', YEL, 1.8) + line('M54.2 28.2Q56.4 27.2 58 28.6', YEL, 1.8),
    zzz: () => '<g fill="' + SKY + '" font-weight="800" font-family="system-ui,sans-serif"><text x="47" y="16" font-size="8">z</text><text x="52" y="10" font-size="10">z</text><text x="57.5" y="5" font-size="12">Z</text></g>',
    nightcap: () => '<path d="M17.6 21.6Q20.8 6.6 38.2 6.4Q50.6 6.6 55.2 18.4Q50.4 15 46.2 20.6Q32.4 14.6 17.6 21.6Z" fill="' + SKY + '"/><path d="M17.4 21.4Q32 14.2 46.6 21.4L46 24.4Q32 17.6 18 24.4Z" fill="' + PLATE + '"/><circle cx="55.6" cy="19.4" r="3.1" fill="' + PLATE + '"/>',
    chef: () => '<g fill="' + PLATE + '" stroke="' + RIM + '" stroke-width="1.1"><circle cx="24.4" cy="10" r="5.6"/><circle cx="39.6" cy="10" r="5.6"/><circle cx="32" cy="7" r="6.6"/><rect x="21.2" y="11" width="21.6" height="7.4" rx="2"/></g>',
    bag: () => line('M44.5 50.5Q50.5 41.5 56.5 50.5', DARK, 2) + '<circle cx="47.6" cy="49" r="3" fill="' + LEAF + '"/><rect x="51.4" y="42.5" width="3.4" height="10" rx="1.7" transform="rotate(18 53 47)" fill="' + CRUST + '"/>'
      + '<path d="M41.5 50H59.5L57 61.6H44Z" fill="' + YEL + '"/>' + line('M44.5 54.2H56.6M45.2 57.8H55.8', 'rgba(0,0,0,.18)', 1.1),
    bubble: (inner) => '<path d="M45 21l-2.8 6 7.4-5" fill="' + PLATE + '" stroke="' + NOSE + '" stroke-width="1.4" stroke-linejoin="round"/><rect x="40.5" y="3" width="21.5" height="17" rx="6" fill="' + PLATE + '" stroke="' + NOSE + '" stroke-width="1.4"/>'
      + (inner || '<circle cx="45.8" cy="11.5" r="1.7" fill="' + NOSE + '"/><circle cx="51.2" cy="11.5" r="1.7" fill="' + NOSE + '"/><circle cx="56.6" cy="11.5" r="1.7" fill="' + NOSE + '"/>'),
    q: () => EXTRA.bubble('<text x="51.2" y="17.2" text-anchor="middle" font-size="14" font-weight="900" font-family="system-ui,sans-serif" fill="' + RED + '">?</text>'),
    play: () => EXTRA.bubble('<path d="M48.6 6.8l7.6 4.7-7.6 4.7Z" fill="' + RED + '"/>'),
    house: () => '<path d="M44.4 14.2L53 6.4l8.6 7.8Z" fill="' + RED + '"/><rect x="46" y="13.6" width="14" height="10.6" rx="1.2" fill="' + YEL + '"/><rect x="51.2" y="17.4" width="3.8" height="6.8" rx="1" fill="' + RED + '"/>'
      + heart(57.4, 3.6, .2, RED),
    speed: () => line('M2.8 31.5H9M1.8 37.5H10M3.6 43.5H9.4', INK2, 1.8),
    star: () => '<path d="' + STAR + '" transform="translate(42.5 1.5) scale(.82)" fill="' + YEL + '"/>',
    trophy: () => '<path d="M44 46h14v4.6c0 4.4-3.1 7.4-7 7.4s-7-3-7-7.4Z" fill="' + YEL + '"/>' + line('M44 48.2h-2.6c0 3.3 1.6 4.8 3.5 5M58 48.2h2.6c0 3.3-1.6 4.8-3.5 5', YEL, 1.6)
      + '<rect x="49.6" y="57.6" width="2.8" height="3" fill="' + YEL + '"/><rect x="46.4" y="60.4" width="9.2" height="2.6" rx="1" fill="' + CRUST + '"/>',
    drool: () => '<path d="M34.6 47.4Q33.4 50.6 34.6 51.6Q35.8 50.6 34.6 47.4Z" fill="' + SKY + '" opacity=".85"/>',
    pin: () => '<path d="M53 3.2c-4.6 0-8 3.4-8 7.8 0 5.6 8 13.2 8 13.2s8-7.6 8-13.2c0-4.4-3.4-7.8-8-7.8Z" fill="' + RED + '"/><circle cx="53" cy="11" r="3" fill="' + PLATE + '"/>'
  };

  function faceSvg(o) {
    const blush = o.blush === 0 ? 0 : o.blush || .6;
    let s = '<path d="M14.6 64C14.6 51.6 22 44.6 32 44.6S49.4 51.6 49.4 64Z" fill="' + DOG + '"/>'  // bryst
      + '<path d="M21 17C12 17 7 26 8 38C9 47 13 52 17.6 50C21.6 48 21.6 38 22.6 27Z" fill="' + DARK + '"/>'  // ører
      + '<path d="M43 17C52 17 57 26 56 38C55 47 51 52 46.4 50C42.4 48 42.4 38 41.4 27Z" fill="' + DARK + '"/>'
      + line('M20.6 50.6Q32 56.4 43.4 50.6', RED, 3.4) + '<circle cx="32" cy="54.2" r="2.4" fill="' + YEL + '"/>'  // halsbånd
      + '<ellipse cx="32" cy="28" rx="14.6" ry="14" fill="' + DOG + '"/>'  // hode
      + '<ellipse cx="32" cy="40.6" rx="8.2" ry="6.6" fill="' + LIGHT + '"/>';  // snute
    if (blush) s += '<ellipse cx="20.8" cy="35" rx="3.2" ry="2.1" fill="' + BLUSH + '" opacity="' + blush + '"/><ellipse cx="43.2" cy="35" rx="3.2" ry="2.1" fill="' + BLUSH + '" opacity="' + blush + '"/>';
    s += (EYES[o.eyes] || EYES.open)();
    s += '<ellipse cx="32" cy="35.6" rx="4.4" ry="3.1" fill="' + NOSE + '"/><ellipse cx="30.6" cy="34.6" rx="1.3" ry=".7" fill="#fff" opacity=".75"/>';
    s += (MOUTH[o.mouth] || MOUTH.smile)();
    (o.extra || []).forEach(e => { if (EXTRA[e]) s += EXTRA[e](); });
    return s;
  }

  /* ---------- ansiktene som brukes for plinger og ellers i appen ---------- */
  const FACES = {
    klem: { eyes: 'happy', mouth: 'smile', extra: ['hug'] },
    kyss: { eyes: 'closed', mouth: 'kiss', extra: ['lips'] },
    bamseklem: { eyes: 'happy', mouth: 'smile', extra: ['bear'] },
    langklem: { eyes: 'closed', mouth: 'smile', blush: .85, extra: ['squeeze', 'hug'] },
    trosteklem: { eyes: 'closed', mouth: 'smile', extra: ['hugY'] },
    savner: { eyes: 'big', mouth: 'sad', extra: ['tear'] },
    slengkyss: { eyes: 'wink', mouth: 'kiss', extra: ['hearts'] },
    kinnkyss: { eyes: 'happy', mouth: 'smile', blush: .9, extra: ['cheekkiss'] },
    nesekyss: { eyes: 'closed', mouth: 'smile', extra: ['nosehrt'] },
    elsker: { eyes: 'heart', mouth: 'open', extra: ['heart1'] },
    hei: { eyes: 'open', mouth: 'open', extra: ['wave'] },
    sulten: { eyes: 'big', mouth: 'tongue', extra: ['drool'] },
    klar: { eyes: 'happy', mouth: 'open', extra: ['chef'] },
    handle: { eyes: 'open', mouth: 'smile', extra: ['bag'] },
    natt: { eyes: 'closed', mouth: 'flat', blush: .4, extra: ['nightcap', 'zzz'] },
    egen: { eyes: 'open', mouth: 'smile', extra: ['bubble'] },
    pavei: { eyes: 'happy', mouth: 'tongue', extra: ['speed', 'house'] },
    oppskrift: { eyes: 'open', mouth: 'open', extra: ['play'] },
    rating: { eyes: 'star', mouth: 'open', extra: [] },
    quiz: { eyes: 'open', mouth: 'flat', extra: ['q'] },
    spill: { eyes: 'happy', mouth: 'open', extra: ['trophy'] },
    restaurant: { eyes: 'open', mouth: 'tongue', extra: ['pin'] },
    glad: { eyes: 'happy', mouth: 'open', extra: [] }
  };
  function face(name, size, cls) {
    const o = FACES[name] || FACES.glad;
    return '<svg class="pe' + (cls ? ' ' + cls : '') + '" viewBox="0 0 64 64"' + (size ? ' width="' + size + '" height="' + size + '"' : '') + ' aria-hidden="true" focusable="false">' + faceSvg(o) + '</svg>';
  }

  /* ---------- mat, tegnet i en boks på 40 × 30 ---------- */
  const bowl = (fill, rim) => '<path d="M2 12H38Q36.4 28.6 20 28.6Q3.6 28.6 2 12Z" fill="' + (fill || PLATE) + '"/><ellipse cx="20" cy="12" rx="18" ry="3.4" fill="' + (rim || RIM) + '"/>';
  const chop = () => line('M27 -8L39 9', '#9B6B43', 1.8) + line('M31 -9L41 7', '#9B6B43', 1.8);
  const FOODART = {
    pasta: () => bowl() + line('M5 11.2q2.7-6 5.4 0q2.7-6 5.4 0q2.7-6 5.4 0q2.7-6 5.4 0q2.7-6 5.4 0q2.7-6 5.4 0', CHEESE, 2.4)
      + '<circle cx="21" cy="6.2" r="3.4" fill="' + RED + '"/><ellipse cx="26.6" cy="6.4" rx="2.4" ry="1.2" transform="rotate(-25 26.6 6.4)" fill="' + LEAF + '"/>' + line('M33 -6L29.6 9', STEEL, 1.8),
    pizza: () => '<path d="M4.4 5.4H35.6L20 29.6Z" fill="' + CHEESE + '"/><path d="M3 3Q20-1 37 3L35.8 6.6Q20 3 4.2 6.6Z" fill="' + CRUST + '"/>'
      + '<circle cx="14" cy="10.6" r="2.7" fill="' + RED + '"/><circle cx="24.6" cy="11.6" r="2.5" fill="' + RED + '"/><circle cx="19.4" cy="18.6" r="2.3" fill="' + RED + '"/>',
    taco: () => line('M5 15q2.5-4 5 0q2.5-4 5 0q2.5-4 5 0q2.5-4 5 0q2.5-4 5 0q2.5-4 5 0', LEAF, 3.2) + '<circle cx="13" cy="11.4" r="2" fill="' + RED + '"/><circle cx="26" cy="11" r="2" fill="' + RED + '"/>'
      + '<path d="M2 28Q2 9 20 9Q38 9 38 28Z" fill="' + CHEESE + '"/>' + line('M7 26Q9 15 20 13.6', 'rgba(0,0,0,.12)', 1.4),
    burger: () => '<path d="M4 12Q4 1.6 20 1.6Q36 1.6 36 12Z" fill="' + CRUST + '"/><g fill="' + PLATE + '"><ellipse cx="13" cy="6" rx="1" ry=".6"/><ellipse cx="20" cy="4.4" rx="1" ry=".6"/><ellipse cx="27" cy="6.2" rx="1" ry=".6"/></g>'
      + line('M3.6 13.4q2-2.4 4 0q2-2.4 4 0q2-2.4 4 0q2-2.4 4 0q2-2.4 4 0q2-2.4 4 0q2-2.4 4 0q2-2.4 4 0', LEAF, 2.6)
      + '<path d="M5 15.4H35L31 19.4H9Z" fill="' + CHEESE + '"/><rect x="4" y="16.4" width="32" height="6" rx="3" fill="' + MEAT + '"/><rect x="5" y="22.6" width="30" height="6" rx="3" fill="' + CRUST + '"/>',
    bowl: () => chop() + bowl('#C8402E', '#E8DCC8') + line('M6 11.4q3-4 6 0q3-4 6 0q3-4 6 0q3-4 6 0', CHEESE, 2) + '<circle cx="15" cy="8.6" r="3.4" fill="' + PLATE + '"/><circle cx="15" cy="8.6" r="1.6" fill="' + CHEESE + '"/>'
      + '<circle cx="25" cy="9" r="1.1" fill="' + LEAF + '"/><circle cx="28" cy="10.6" r="1.1" fill="' + LEAF + '"/>' + line('M6 19H34', 'rgba(255,255,255,.35)', 1.4),
    sushi: () => [9, 26].map(x => '<ellipse cx="' + x + '" cy="22" rx="8.4" ry="5.6" fill="#24332A"/><rect x="' + (x - 8.4) + '" y="12" width="16.8" height="10" fill="#24332A"/><ellipse cx="' + x + '" cy="12" rx="8.4" ry="5.6" fill="' + PLATE + '"/><ellipse cx="' + x + '" cy="12" rx="3.6" ry="2.4" fill="#F28C5B"/>').join('') + chop(),
    soup: () => line('M12 3q-2 -3 0 -6M20 3q-2 -3 0 -6M28 3q-2 -3 0 -6', INK2, 1.6) + '<rect x="4" y="8" width="32" height="20" rx="4" fill="' + RED + '"/><ellipse cx="20" cy="8.4" rx="16" ry="3" fill="#E9883C"/>'
      + '<rect x="0" y="11" width="5" height="3" rx="1.5" fill="' + RED + '"/><rect x="35" y="11" width="5" height="3" rx="1.5" fill="' + RED + '"/>' + line('M7 21H33', 'rgba(255,255,255,.3)', 1.4),
    fish: () => '<path d="M30 15L39 6.6V23.4Z" fill="' + SKY + '"/><ellipse cx="18" cy="15" rx="15" ry="9" fill="' + SKY + '"/><path d="M14 6.6Q20 2 24 7Z" fill="' + SKY + '"/>'
      + '<circle cx="9.4" cy="12.6" r="2.4" fill="#fff"/><circle cx="9" cy="12.6" r="1.2" fill="' + NOSE + '"/>' + line('M17 9.6Q20 15 17 20.4', 'rgba(255,255,255,.5)', 1.4) + line('M4.4 18Q6.4 19.4 8.4 18', NOSE, 1.2),
    chicken: () => '<path d="M27 21L34 27" stroke="' + PLATE + '" stroke-width="4.2" stroke-linecap="round"/><circle cx="36" cy="26" r="2.6" fill="' + PLATE + '"/><circle cx="33.6" cy="28.6" r="2.6" fill="' + PLATE + '"/>'
      + '<path d="M6 13C6 5 14 1.4 21 4.6C27 7.4 30 14 27 20.6C24.6 25.4 18 25 13 22C8.6 19.6 6 17 6 13Z" fill="#C6782F"/>' + line('M11 9Q15 6.6 19 8', 'rgba(255,255,255,.3)', 1.6),
    steak: () => '<path d="M5 9C9 2 26 1 34 7C40 12 36 24 26 26C16 28 8 26 4.6 19C3 15.6 3.4 12 5 9Z" fill="#F0D6BF"/><path d="M7.4 10C11 4.6 25 4 31.6 8.6C36.4 12 33 21.4 25 23C17 24.6 10.4 23 7.6 18C6.4 15.4 6.4 12.4 7.4 10Z" fill="#A9452D"/>'
      + line('M12 10L21 20M18 8L27 18M24 8L30 14', 'rgba(0,0,0,.28)', 1.6),
    hotdog: () => '<rect x="1" y="9" width="38" height="9.4" rx="4.7" fill="#C4502E"/>' + line('M5 12.2q2.6 3 5.2 0q2.6 -3 5.2 0q2.6 3 5.2 0q2.6 -3 5.2 0q2.6 3 5.2 0', CHEESE, 1.8)
      + '<path d="M4 16Q4 26 20 26Q36 26 36 16Q36 20 20 20Q4 20 4 16Z" fill="' + CRUST + '"/><path d="M4 16Q4 12.6 6 12.6L34 12.6Q36 12.6 36 16Q36 20 20 20Q4 20 4 16Z" fill="#EDB86A" opacity=".55"/>',
    salad: () => '<ellipse cx="12" cy="9" rx="6" ry="4" fill="' + LEAF + '"/><ellipse cx="22" cy="6.6" rx="6" ry="4.4" fill="#7BC25E"/><ellipse cx="29" cy="9.6" rx="5" ry="3.6" fill="' + LEAF + '"/>'
      + '<circle cx="17" cy="9.4" r="2.6" fill="' + RED + '"/><circle cx="26" cy="10.4" r="2.2" fill="' + RED + '"/>' + bowl('#8CC07A', '#B9DCA8'),
    cake: () => '<path d="M3 13L37 7V26H3Z" fill="#F7D9A8"/><path d="M3 13L37 7V10.6L3 16.6Z" fill="#F2A0A8"/>' + line('M3 20.6H37', PLATE, 2.6) + '<path d="M37 7V26L40 25V8Z" fill="#E9C089"/>'
      + '<circle cx="24" cy="4.4" r="3" fill="' + RED + '"/>' + line('M24 1.6Q25.6-2 28.4-2.4', LEAF, 1.2),
    icecream: () => '<path d="M11 13H29L20 30Z" fill="' + CRUST + '"/>' + line('M14 16L22 25M18 14.6L25 21M26 16L18 25', 'rgba(0,0,0,.18)', 1.1)
      + '<circle cx="15" cy="10" r="6" fill="#F2A0A8"/><circle cx="25" cy="10" r="6" fill="#9ED9C3"/><circle cx="20" cy="4.4" r="6" fill="#F6E3B8"/><circle cx="21" cy="-.6" r="2" fill="' + RED + '"/>',
    breakfast: () => '<rect x="29" y="13.6" width="12" height="3.4" rx="1.7" fill="#3A3A3A"/><circle cx="17" cy="15.4" r="13" fill="#3A3A3A"/><circle cx="17" cy="15.4" r="11" fill="#4A4A4A"/>'
      + '<path d="M10 13C10 8 16 6.6 20 8.4C25 6.6 27 12 25 16C26 21 18 23.4 14 21C9 21 7.6 16 10 13Z" fill="' + PLATE + '"/><circle cx="17.4" cy="14.6" r="3.8" fill="' + CHEESE + '"/>',
    pancakes: () => [22, 17.4, 12.8].map(y => '<ellipse cx="20" cy="' + y + '" rx="16" ry="4.6" fill="#E3A24E"/><ellipse cx="20" cy="' + (y - 1) + '" rx="16" ry="3.6" fill="#F0C27A"/>').join('')
      + '<rect x="16" y="7.4" width="8" height="4.4" rx="1" fill="#FFF1B8"/><path d="M8 13Q20 16 32 13L31 18Q30 21 29 17Q20 18 10 17Q9 20 8 17Z" fill="#B5651D" opacity=".85"/>',
    bread: () => '<path d="M3 26V15C3 6 11 2.4 20 2.4S37 6 37 15V26Z" fill="#D9913E"/>' + line('M12 9L16 14M19 7L23 12M26 9L30 14', '#F3C989', 1.8),
    drink: () => line('M22 -2L26 14', RED, 1.8) + '<path d="M8 4H32L28 28H12Z" fill="#BFE3F2" opacity=".9"/><path d="M9.4 12H30.6L28 28H12Z" fill="#F2B53A" opacity=".85"/>'
      + '<circle cx="9.6" cy="5" r="4.6" fill="#F6E05A"/><circle cx="9.6" cy="5" r="3.2" fill="#FFF3A0"/>',
    coffee: () => line('M14 2q-2 -3 0 -6M21 2q-2 -3 0 -6', INK2, 1.6) + '<ellipse cx="18" cy="27" rx="16" ry="3" fill="' + RIM + '"/><path d="M5 6H31V18C31 24 26 27 18 27S5 24 5 18Z" fill="' + PLATE + '"/>'
      + '<ellipse cx="18" cy="6.4" rx="13" ry="2.6" fill="#7A4A2A"/>' + line('M31 9.6C37 9.6 37 18 30.4 18.4', PLATE, 2.6),
    wrap: () => '<path d="M8 4Q20 -2 32 4L28 28Q20 31 12 28Z" fill="#F0D9A8"/><path d="M8 4Q20 -2 32 4Q20 9.6 8 4Z" fill="' + LEAF + '"/><circle cx="16" cy="3.6" r="2.2" fill="' + RED + '"/><circle cx="24" cy="3" r="2" fill="#B5651D"/>'
      + line('M11 14Q20 18 29.4 13', 'rgba(0,0,0,.12)', 1.4),
    cookie: () => '<circle cx="20" cy="15" r="13.4" fill="#D9A15A"/><g fill="#5A3420"><circle cx="15" cy="11" r="1.9"/><circle cx="24" cy="9.4" r="1.7"/><circle cx="25.6" cy="18" r="2"/><circle cx="14.6" cy="20" r="1.6"/><circle cx="20" cy="15.4" r="1.4"/></g>',
    plate: () => line('M2.6 2V12M5.6 2V12M8.6 2V12M5.6 12V28', STEEL, 1.6) + '<path d="M34 2Q38.6 8 37 16H35V28" fill="none" stroke="' + STEEL + '" stroke-width="2" stroke-linecap="round"/>'
      + '<ellipse cx="20.4" cy="16" rx="12.6" ry="11" fill="' + PLATE + '"/><ellipse cx="20.4" cy="16" rx="8.4" ry="7.2" fill="' + RIM + '"/>'
  };
  /* Hvilken mat og hvilket uttrykk passer navnet? Første treff i navnet vinner. */
  const W = '(^|[^a-zæøå])';
  const RULES = [
    ['pasta|spaghetti|penne|lasagn|carbonara|gnocchi|tagliatell|ravioli|makaroni|fusilli|linguine|bolognese|pesto|italiensk', 'pasta'],
    ['pizza|calzone', 'pizza'],
    ['taco|tortilla|quesadill|nacho|fajita|enchilad|meksikansk|mexican', 'taco'],
    ['burrito|kebab|falafel|pita|gyros|shawarma|' + W + 'wrap', 'wrap'],
    ['burger', 'burger'],
    ['sushi|maki|nigiri|japansk', 'sushi'],
    ['ramen|nudl|nudel|udon|pad thai|noodle|' + W + 'wok|' + W + 'pho|curry|tikka|masala|korma|' + W + 'dal($|[^a-zæøå])|risotto|' + W + 'ris($|[^a-zæøå])|rice|bibimbap|poke|dumpling|gyoza|asiatisk|thai|kinesisk|indisk|vietnam|korea|nepalsk', 'bowl'],
    ['suppe|soup|gryte|lapskaus|stew|chili con|paella', 'soup'],
    ['pølse|hotdog|' + W + 'wiener', 'hotdog'],
    ['kylling|chicken|kalkun|wings|vinger', 'chicken'],
    ['biff|steak|entrecote|indrefilet|kjøtt|svin|ribbe|kotelett|meatball|karbonade|' + W + 'lam|grill|bbq', 'steak'],
    ['laks|fisk|torsk|ørret|tunfisk|salmon|fish|kveite|makrell|reke|scampi|shrimp|kreps|hummer|krabbe|skjell|sjømat|' + W + 'sei($|[^a-zæøå])', 'fish'],
    ['salat|salad|' + W + 'bowl|vegetar|vegan|grønnsak|brokkoli|blomkål|tofu', 'salad'],
    ['vaffel|vafler|waffle|pannekake|pancake|crepe|' + W + 'lapper', 'pancakes'],
    ['omelett|frittata|eggerøre|shakshuka|frokost|brunch|' + W + 'egg', 'breakfast'],
    ['kake|cake|brownie|terte|tiramisu|dessert|mousse|sjokolade|chocolate|' + W + 'pai($|[^a-zæøå])|muffin|cupcake', 'cake'],
    ['iskrem|gelato|sorbet|' + W + 'is($|[^a-zæøå])', 'icecream'],
    ['cookie|kjeks|bolle', 'cookie'],
    ['brød|bread|focaccia|rundstykk|bagel|toast|sandwich|smørbrød|bakeri', 'bread'],
    ['kaffe|coffee|latte|kafé|cafe|café', 'coffee'],
    ['smoothie|juice|milkshake|cocktail|drink|mojito|spritz|' + W + 'bar($|[^a-zæøå])|vinbar|' + W + 'pub($|[^a-zæøå])', 'drink']
  ].map(([re, k]) => [new RegExp(re), k]);
  const LOOK = {
    pasta: ['klar', 2], pizza: ['klar', 1], taco: ['sulten', 2], wrap: ['sulten', 3], burger: ['sulten', 1], sushi: ['glad', 4], bowl: ['glad', 1],
    soup: ['nesekyss', 1], hotdog: ['slengkyss', 2], chicken: ['sulten', 2], steak: ['sulten', 1], fish: ['hei', 4], salad: ['kinnkyss', 3],
    pancakes: ['glad', 2], breakfast: ['hei', 2], cake: ['elsker', 5], icecream: ['elsker', 5], cookie: ['elsker', 5], bread: ['glad', 2],
    coffee: ['nesekyss', 5], drink: ['slengkyss', 4], plate: ['sulten', 3]
  };
  function foodFor(x) {
    const title = String(x.title || x.name || '').toLowerCase();
    let best = null;
    RULES.forEach(([re, k]) => { const m = re.exec(title); if (m && (!best || m.index < best[0])) best = [m.index, k]; });
    if (best) return best[1];
    const rest = [(x.tags || []).join(' '), x.note, x.extra].filter(Boolean).join(' ').toLowerCase();
    for (const [re, k] of RULES) if (re.test(rest)) return k;
    return 'plate';
  }
  /* Kortbilde: Pølsa som holder maten, foran en stor, dempet utgave av maten */
  function cover(x) {
    const k = foodFor(x), look = LOOK[k] || LOOK.plate, f = Object.assign({}, FACES[look[0]] || FACES.glad);
    f.extra = (f.extra || []).filter(e => ['chef', 'heart1', 'hearts', 'cheekkiss', 'nosehrt'].includes(e)); // ingen poter eller bobler oppå maten
    const art = FOODART[k]();
    return '<span class="cover c' + look[1] + '" aria-hidden="true"><svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" focusable="false">'
      + '<g class="pe-bg" transform="translate(-6 -4) rotate(-14 30 30) scale(2.1)">' + art + '</g>'
      + '<g transform="translate(19 6) scale(.97)">' + faceSvg(f) + '</g>'
      + '<g transform="translate(25.5 62) scale(1.22)">' + art + '</g>'
      + '<g transform="translate(29 69) rotate(28)"><ellipse rx="5.2" ry="4.1" fill="' + DOG + '"/>' + line('M-1.7 -3.4V-1.4M1.7 -3.4V-1.4', DARK, 1.1) + '</g>'
      + '<g transform="translate(71 69) rotate(-28)"><ellipse rx="5.2" ry="4.1" fill="' + DOG + '"/>' + line('M-1.7 -3.4V-1.4M1.7 -3.4V-1.4', DARK, 1.1) + '</g>'
      + '</svg></span>';
  }
  return { face, cover, foodFor, FACES: Object.keys(FACES), FOODS: Object.keys(FOODART) };
})();
