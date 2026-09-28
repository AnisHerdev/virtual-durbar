// Generates the flat, miniature-painting style SVG art in public/assets/.
// Run with `node scripts/generate-assets.mjs`. Outputs are committed, so this
// only needs re-running when you change the art direction. Replace any file
// with a painted .jpg/.png by editing public/assets/manifest.json.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'assets');
const write = (rel, svg) => {
  const file = join(root, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, svg.trim() + '\n');
  console.log('wrote', rel);
};

// ── Backgrounds ──────────────────────────────────────────────────────────────
const W = 1280;
const H = 720;

const palettes = {
  morning: { sky: ['#f9e2b8', '#f2b07e'], wall: '#ecd6a8', wallDark: '#d9bb83', accent: '#b83a26', gold: '#c9a227', hills: ['#8aa05a', '#6b8446'], body: { cx: 330, cy: 470, r: 34, fill: '#f6c35b' }, lamps: false, stars: false, carpet: '#9e2a1c' },
  midday: { sky: ['#a9d3e8', '#e0f0f2'], wall: '#f2e5c4', wallDark: '#dcc796', accent: '#1f5e8c', gold: '#c9a227', hills: ['#7ea35a', '#5f8a45'], body: { cx: 900, cy: 150, r: 30, fill: '#fff6d8' }, lamps: false, stars: false, carpet: '#1f4f7a' },
  afternoon: { sky: ['#efc57a', '#f5dfaa'], wall: '#e6c68f', wallDark: '#cfa86a', accent: '#1d6b44', gold: '#c9a227', hills: ['#8c9a50', '#6d7c3c'], body: { cx: 1000, cy: 300, r: 32, fill: '#fbe39a' }, lamps: false, stars: false, carpet: '#1d5a3a' },
  sunset: { sky: ['#e56b3a', '#f4b262'], wall: '#d8ae78', wallDark: '#b98a52', accent: '#7a1f3d', gold: '#d4a92a', hills: ['#6e5a3e', '#4f422f'], body: { cx: 640, cy: 470, r: 52, fill: '#f04b2a' }, lamps: true, stars: false, carpet: '#6e1a35' },
  night: { sky: ['#15223f', '#2f4474'], wall: '#5d4c6e', wallDark: '#44385a', accent: '#b8862a', gold: '#e0b64a', hills: ['#27324d', '#1c2539'], body: { cx: 980, cy: 140, r: 26, fill: '#f3ecd0' }, lamps: true, stars: true, carpet: '#3a2150' },
};

const ARCHES = 5;
const archTop = 150;
const springY = 300;
const floorY = 560;
const colW = 58;
const archW = (W - colW * (ARCHES + 1)) / ARCHES;

function archPath(x, w) {
  const cx = x + w / 2;
  const h = springY - archTop;
  // Cusped (multifoil) Mughal arch: three lobes on each side meeting at a point.
  const lobes = 3;
  let d = `M${x},${floorY} L${x},${springY}`;
  const pts = [];
  for (let i = 1; i <= lobes; i++) {
    const t = i / lobes;
    const ang = (Math.PI / 2) * t;
    pts.push([cx - (w / 2) * Math.cos(ang), springY - h * Math.sin(ang) * (0.85 + 0.15 * t)]);
  }
  pts[pts.length - 1] = [cx, archTop];
  let prev = [x, springY];
  for (const p of pts) {
    const mx = (prev[0] + p[0]) / 2 - 8;
    const my = (prev[1] + p[1]) / 2 - 8;
    d += ` Q${mx.toFixed(1)},${my.toFixed(1)} ${p[0].toFixed(1)},${p[1].toFixed(1)}`;
    prev = p;
  }
  const right = pts.slice(0, -1).map(([px, py]) => [2 * cx - px, py]).reverse();
  right.push([x + w, springY]);
  for (const p of right) {
    const mx = (prev[0] + p[0]) / 2 + 8;
    const my = (prev[1] + p[1]) / 2 - 8;
    d += ` Q${mx.toFixed(1)},${my.toFixed(1)} ${p[0].toFixed(1)},${p[1].toFixed(1)}`;
    prev = p;
  }
  d += ` L${x + w},${floorY} Z`;
  return d;
}

function background(name, p) {
  const arches = Array.from({ length: ARCHES }, (_, i) => colW + i * (archW + colW));
  const archPaths = arches.map((x) => archPath(x, archW));
  const stars = p.stars
    ? Array.from({ length: 60 }, (_, i) => {
        const x = (i * 197) % W;
        const y = 40 + ((i * 89) % 420);
        return `<circle cx="${x}" cy="${y}" r="${i % 5 === 0 ? 2 : 1.2}" fill="#fff8e0" opacity="0.8"/>`;
      }).join('')
    : '';
  const hills = `
    <path d="M0,470 Q160,380 320,440 T640,420 T960,440 T1280,410 L1280,${floorY} L0,${floorY} Z" fill="${p.hills[0]}"/>
    <path d="M0,510 Q200,450 420,500 T860,480 T1280,500 L1280,${floorY} L0,${floorY} Z" fill="${p.hills[1]}"/>
    ${Array.from({ length: 14 }, (_, i) => {
      const x = 40 + i * 92;
      const y = 505 - ((i * 37) % 30);
      return `<path d="M${x},${y + 45} C${x - 14},${y + 10} ${x - 6},${y - 30} ${x},${y - 44} C${x + 6},${y - 30} ${x + 14},${y + 10} ${x},${y + 45} Z" fill="${p.hills[1]}" stroke="${p.hills[0]}" stroke-width="1.5"/>`;
    }).join('')}`;
  const frieze = Array.from({ length: 40 }, (_, i) => {
    const x = i * 32 + 16;
    return `<path d="M${x},96 l10,12 l-10,12 l-10,-12 Z" fill="${p.gold}"/><circle cx="${x + 16}" cy="108" r="3" fill="#fdf6e3"/>`;
  }).join('');
  const pillars = Array.from({ length: ARCHES + 1 }, (_, i) => {
    const x = i * (archW + colW);
    return `
      <rect x="${x + 10}" y="${springY - 20}" width="${colW - 20}" height="${floorY - springY + 20}" fill="${p.wallDark}"/>
      <rect x="${x + 4}" y="${springY - 30}" width="${colW - 8}" height="14" fill="${p.gold}"/>
      <rect x="${x + 4}" y="${floorY - 18}" width="${colW - 8}" height="18" fill="${p.gold}"/>
      ${Array.from({ length: 6 }, (_, k) => `<path d="M${x + colW / 2},${springY + 10 + k * 40} l8,14 l-8,14 l-8,-14 Z" fill="${p.accent}" opacity="0.85"/>`).join('')}`;
  }).join('');
  const lamps = arches
    .map((x) => {
      const cx = x + archW / 2;
      const glow = p.lamps ? `<circle cx="${cx}" cy="${archTop + 92}" r="34" fill="#ffd27a" opacity="0.35"/>` : '';
      return `
        <line x1="${cx}" y1="${archTop}" x2="${cx}" y2="${archTop + 70}" stroke="${p.gold}" stroke-width="2"/>
        ${glow}
        <path d="M${cx - 16},${archTop + 80} Q${cx},${archTop + 110} ${cx + 16},${archTop + 80} Z" fill="${p.gold}"/>
        <path d="M${cx},${archTop + 64} q6,8 0,16 q-6,-8 0,-16 Z" fill="${p.lamps ? '#ffb347' : p.accent}"/>`;
    })
    .join('');
  const carpetBorder = Array.from({ length: 64 }, (_, i) => {
    const x = i * 20 + 10;
    return `<circle cx="${x}" cy="${floorY + 22}" r="4" fill="${p.gold}"/><path d="M${x},${H - 30} l7,8 l-7,8 l-7,-8 Z" fill="${p.gold}"/>`;
  }).join('');
  const toran = Array.from({ length: 26 }, (_, i) => {
    const x = i * 50 + 25;
    return `<path d="M${x - 18},${archTop - 22} Q${x},${archTop + 4} ${x + 18},${archTop - 22}" fill="none" stroke="#e8792b" stroke-width="7"/><path d="M${x},${archTop - 10} q-6,12 0,24 q6,-12 0,-24 Z" fill="#3f7a3a"/>`;
  }).join('');

  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${p.sky[0]}"/><stop offset="1" stop-color="${p.sky[1]}"/>
    </linearGradient>
    <mask id="arches">
      <rect width="${W}" height="${H}" fill="#fff"/>
      ${archPaths.map((d) => `<path d="${d}" fill="#000"/>`).join('')}
    </mask>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#sky)"/>
  ${stars}
  <circle cx="${p.body.cx}" cy="${p.body.cy}" r="${p.body.r}" fill="${p.body.fill}"/>
  ${hills}
  <g mask="url(#arches)">
    <rect width="${W}" height="${floorY}" fill="${p.wall}"/>
    <rect y="80" width="${W}" height="56" fill="${p.accent}"/>
    ${frieze}
    <rect y="0" width="${W}" height="80" fill="${p.wallDark}"/>
    <rect y="74" width="${W}" height="6" fill="${p.gold}"/>
    <rect y="136" width="${W}" height="6" fill="${p.gold}"/>
    ${pillars}
  </g>
  ${archPaths.map((d) => `<path d="${d}" fill="none" stroke="${p.gold}" stroke-width="6"/>`).join('')}
  ${archPaths.map((d) => `<path d="${d}" fill="none" stroke="${p.accent}" stroke-width="2" transform="translate(0,0)" opacity="0.8"/>`).join('')}
  ${toran}
  ${lamps}
  <rect y="${floorY}" width="${W}" height="${H - floorY}" fill="${p.carpet}"/>
  <rect y="${floorY + 40}" width="${W}" height="${H - floorY - 80}" fill="${p.accent}" opacity="0.55"/>
  ${Array.from({ length: 8 }, (_, i) => `<circle cx="${80 + i * 160}" cy="${floorY + 80}" r="22" fill="none" stroke="${p.gold}" stroke-width="4"/><circle cx="${80 + i * 160}" cy="${floorY + 80}" r="8" fill="${p.gold}"/>`).join('')}
  ${carpetBorder}
</svg>`;
}

for (const [name, p] of Object.entries(palettes)) {
  write(`backgrounds/durbar-${name}.svg`, background(name, p));
}

// ── Props (headwear) ─────────────────────────────────────────────────────────
// Every prop uses a 400×300 viewBox; its brim sits near the bottom so the
// AR pipeline can anchor it on the forehead (see PropDef.anchorY).

const crownChola = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" width="400" height="300">
  <!-- Chola-style kirita mukuta: tall tiered crown -->
  <path d="M110,270 L130,120 Q200,-10 270,120 L290,270 Z" fill="#d9a520" stroke="#7a4b0c" stroke-width="5"/>
  <path d="M130,120 Q200,40 270,120" fill="none" stroke="#7a4b0c" stroke-width="4"/>
  ${[0, 1, 2, 3].map((k) => `<path d="M${118 + k * 4},${230 - k * 36} L${282 - k * 4},${230 - k * 36}" stroke="#7a4b0c" stroke-width="4"/>`).join('')}
  ${[0, 1, 2, 3].map((k) => [0, 1, 2, 3, 4].map((j) => `<circle cx="${140 + j * 30 + k * 0}" cy="${212 - k * 36}" r="${6 - k}" fill="${(j + k) % 2 ? '#b3202a' : '#1d6b44'}" stroke="#fbe7a1" stroke-width="2"/>`).join('')).join('')}
  <path d="M200,18 l10,22 l-10,14 l-10,-14 Z" fill="#b3202a" stroke="#7a4b0c" stroke-width="3"/>
  <circle cx="200" cy="12" r="8" fill="#fbe7a1" stroke="#7a4b0c" stroke-width="3"/>
  <!-- side flares (makara) -->
  <path d="M112,250 Q60,230 70,180 Q100,210 124,205 Z" fill="#d9a520" stroke="#7a4b0c" stroke-width="4"/>
  <path d="M288,250 Q340,230 330,180 Q300,210 276,205 Z" fill="#d9a520" stroke="#7a4b0c" stroke-width="4"/>
  <!-- brim band -->
  <rect x="100" y="250" width="200" height="30" rx="8" fill="#e8b830" stroke="#7a4b0c" stroke-width="5"/>
  ${[0, 1, 2, 3, 4, 5, 6].map((j) => `<circle cx="${118 + j * 27.5}" cy="265" r="6" fill="#fdf6e3" stroke="#7a4b0c" stroke-width="2"/>`).join('')}
  <circle cx="200" cy="265" r="9" fill="#b3202a" stroke="#fbe7a1" stroke-width="3"/>
</svg>`;

function turban(base, shade, band) {
  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" width="400" height="300">
  <!-- Pagdi: wrapped turban with sarpech and kalgi plume -->
  <path d="M60,265 Q40,150 120,100 Q200,55 280,100 Q360,150 340,265 Q200,300 60,265 Z" fill="${base}" stroke="#3b2410" stroke-width="5"/>
  ${[0, 1, 2, 3, 4].map((k) => `<path d="M${70 + k * 8},${250 - k * 30} Q200,${200 - k * 40} ${330 - k * 8},${230 - k * 34}" fill="none" stroke="${shade}" stroke-width="10" stroke-linecap="round"/>`).join('')}
  <path d="M60,262 Q200,300 340,262 L336,280 Q200,312 64,280 Z" fill="${band}" stroke="#3b2410" stroke-width="4"/>
  <!-- sarpech -->
  <path d="M200,150 l18,40 l-18,30 l-18,-30 Z" fill="#e8b830" stroke="#3b2410" stroke-width="3"/>
  <circle cx="200" cy="188" r="9" fill="#b3202a" stroke="#fdf6e3" stroke-width="3"/>
  ${[0, 1, 2, 3, 4].map((j) => `<circle cx="${160 + j * 20}" cy="${225 + Math.abs(j - 2) * -3}" r="4" fill="#fdf6e3"/>`).join('')}
  <!-- kalgi plume -->
  <path d="M206,152 C230,110 250,70 236,24 C226,70 214,100 196,150 Z" fill="#fdf6e3" stroke="#3b2410" stroke-width="3"/>
  <path d="M214,120 C226,96 234,70 232,48" fill="none" stroke="#c9a227" stroke-width="3"/>
</svg>`;
}

const helmet = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" width="400" height="300">
  <!-- Senapati's domed steel helmet (top) with plume -->
  <path d="M70,262 Q70,110 200,90 Q330,110 330,262 Z" fill="#8e98a6" stroke="#2a2f38" stroke-width="5"/>
  <path d="M100,250 Q110,140 200,118" fill="none" stroke="#cdd4dd" stroke-width="10" stroke-linecap="round" opacity="0.8"/>
  ${[0, 1, 2, 3, 4, 5].map((k) => `<path d="M${200 + (k - 2.5) * 44},262 Q200,120 200,92" fill="none" stroke="#5c6572" stroke-width="3"/>`).join('')}
  <rect x="62" y="248" width="276" height="30" rx="8" fill="#c9a227" stroke="#2a2f38" stroke-width="5"/>
  ${[0, 1, 2, 3, 4, 5, 6, 7].map((j) => `<circle cx="${84 + j * 33}" cy="263" r="5" fill="#b3202a"/>`).join('')}
  <path d="M200,92 L200,50" stroke="#2a2f38" stroke-width="8"/>
  <circle cx="200" cy="48" r="10" fill="#c9a227" stroke="#2a2f38" stroke-width="4"/>
  <path d="M204,46 C240,20 290,26 310,56 C276,44 240,46 206,58 Z" fill="#b3202a" stroke="#2a2f38" stroke-width="3"/>
</svg>`;

write('props/crown-chola.svg', crownChola);
write('props/turban-saffron.svg', turban('#e8792b', '#c65a17', '#b3202a'));
write('props/turban-green.svg', turban('#2f7d4f', '#1d5a38', '#c9a227'));
write('props/turban-indigo.svg', turban('#2c3e7a', '#1c2a5a', '#c9a227'));
write('props/turban-white.svg', turban('#f4efe2', '#d8cfb8', '#6b21a8'));
write('props/turban-marigold.svg', turban('#f2b01e', '#cf8a0c', '#1d6b44'));
write('props/helmet-senapati.svg', helmet);

// ── Props (necklaces) ────────────────────────────────────────────────────────
// Same 400×300 viewBox; the strands start at the top edge so the AR pipeline
// can hang them from the base of the neck (anchorY near 1).

function pearlStrand(sag, count, r, fill, stroke) {
  // Evenly spaced beads along a U-shaped strand from (60,10) to (340,10).
  return Array.from({ length: count }, (_, i) => {
    const t = i / (count - 1);
    const x = 60 + t * 280;
    const y = 10 + sag * (1 - (2 * t - 1) ** 2);
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`;
  }).join('');
}

const necklaceRoyal = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" width="400" height="300">
  <!-- Raja's haar: three strands of pearls with an emerald-and-ruby pendant -->
  ${pearlStrand(120, 21, 7, '#fdf6e3', '#8a6a2a')}
  ${pearlStrand(160, 23, 8, '#e8b830', '#7a4b0c')}
  ${pearlStrand(200, 25, 8, '#fdf6e3', '#8a6a2a')}
  <path d="M200,188 l34,30 l-34,52 l-34,-52 Z" fill="#e8b830" stroke="#7a4b0c" stroke-width="5"/>
  <circle cx="200" cy="226" r="16" fill="#1d6b44" stroke="#fbe7a1" stroke-width="4"/>
  <circle cx="200" cy="262" r="8" fill="#b3202a" stroke="#fbe7a1" stroke-width="3"/>
  <circle cx="200" cy="284" r="7" fill="#fdf6e3" stroke="#8a6a2a" stroke-width="2"/>
</svg>`;

function necklace(gem) {
  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" width="400" height="300">
  <!-- Minister's mala: pearl strand with a gold-set pendant in the seat's colour -->
  ${pearlStrand(150, 23, 7, '#fdf6e3', '#8a6a2a')}
  <path d="M200,150 l24,26 l-24,40 l-24,-40 Z" fill="#e8b830" stroke="#7a4b0c" stroke-width="4"/>
  <circle cx="200" cy="180" r="11" fill="${gem}" stroke="#fbe7a1" stroke-width="3"/>
</svg>`;
}

write('props/necklace-royal.svg', necklaceRoyal);
write('props/necklace-saffron.svg', necklace('#c2410c'));
write('props/necklace-green.svg', necklace('#15803d'));
write('props/necklace-crimson.svg', necklace('#b91c1c'));
write('props/necklace-indigo.svg', necklace('#1e3a8a'));
write('props/necklace-violet.svg', necklace('#6b21a8'));
write('props/necklace-marigold.svg', necklace('#a16207'));

// ── Ornate UI border (used as CSS border-image, slice 30) ───────────────────
const border = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 90 90" width="90" height="90">
  <rect width="90" height="90" fill="#9e2a1c"/>
  <rect x="3" y="3" width="84" height="84" fill="none" stroke="#c9a227" stroke-width="3"/>
  <rect x="27" y="27" width="36" height="36" fill="none" stroke="#c9a227" stroke-width="3"/>
  ${[15, 45, 75].flatMap((x) => [15, 45, 75].map((y) => (x === 45 && y === 45 ? '' : `<path d="M${x},${y - 7} l7,7 l-7,7 l-7,-7 Z" fill="#e9c66a"/><circle cx="${x}" cy="${y}" r="2" fill="#fdf6e3"/>`))).join('')}
  ${[[15, 15], [75, 15], [15, 75], [75, 75]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="10" fill="#1d6b44" stroke="#c9a227" stroke-width="2"/><circle cx="${x}" cy="${y}" r="4" fill="#e9c66a"/>`).join('')}
</svg>`;
write('props/border-miniature.svg', border);

// ── Manifest ─────────────────────────────────────────────────────────────────
const manifest = {
  backgrounds: [
    { id: 'durbar-night', label: 'Court at night', file: '/assets/backgrounds/durbar-night.svg', phases: ['lobby'] },
    { id: 'durbar-morning', label: 'Court at dawn', file: '/assets/backgrounds/durbar-morning.svg', phases: ['morning'] },
    { id: 'durbar-midday', label: 'Court at noon', file: '/assets/backgrounds/durbar-midday.svg', phases: ['midday'] },
    { id: 'durbar-afternoon', label: 'Court in the afternoon', file: '/assets/backgrounds/durbar-afternoon.svg', phases: ['afternoon'] },
    { id: 'durbar-sunset', label: 'Court at sunset', file: '/assets/backgrounds/durbar-sunset.svg', phases: ['sunset', 'debrief'] },
  ],
  props: [
    { id: 'crown-chola', label: 'Chola kirita mukuta', file: '/assets/props/crown-chola.svg', scale: 2, anchorY: 0.1 },
    { id: 'turban-saffron', label: 'Saffron pagdi', file: '/assets/props/turban-saffron.svg', scale: 1.55, anchorY: 0.16 },
    { id: 'turban-green', label: 'Green pagdi', file: '/assets/props/turban-green.svg', scale: 1.55, anchorY: 0.16 },
    { id: 'turban-indigo', label: 'Indigo pagdi', file: '/assets/props/turban-indigo.svg', scale: 1.55, anchorY: 0.16 },
    { id: 'turban-white', label: 'White pagdi', file: '/assets/props/turban-white.svg', scale: 1.55, anchorY: 0.16 },
    { id: 'turban-marigold', label: 'Marigold pagdi', file: '/assets/props/turban-marigold.svg', scale: 1.55, anchorY: 0.16 },
    { id: 'helmet-senapati', label: "Senapati's helmet", file: '/assets/props/helmet-senapati.svg', scale: 1.45, anchorY: 0.14 },
    { id: 'necklace-royal', label: 'Royal pearl haar', file: '/assets/props/necklace-royal.svg', scale: 1.8, anchorY: 0.97 },
    { id: 'necklace-saffron', label: 'Saffron mala', file: '/assets/props/necklace-saffron.svg', scale: 1.5, anchorY: 0.97 },
    { id: 'necklace-green', label: 'Emerald mala', file: '/assets/props/necklace-green.svg', scale: 1.5, anchorY: 0.97 },
    { id: 'necklace-crimson', label: 'Crimson mala', file: '/assets/props/necklace-crimson.svg', scale: 1.5, anchorY: 0.97 },
    { id: 'necklace-indigo', label: 'Indigo mala', file: '/assets/props/necklace-indigo.svg', scale: 1.5, anchorY: 0.97 },
    { id: 'necklace-violet', label: 'Violet mala', file: '/assets/props/necklace-violet.svg', scale: 1.5, anchorY: 0.97 },
    { id: 'necklace-marigold', label: 'Marigold mala', file: '/assets/props/necklace-marigold.svg', scale: 1.5, anchorY: 0.97 },
  ],
  borders: [{ id: 'border-miniature', file: '/assets/props/border-miniature.svg' }],
};
write('manifest.json', JSON.stringify(manifest, null, 2));
