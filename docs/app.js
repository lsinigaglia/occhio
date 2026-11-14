/* Occhio — interfaccia. La mappa è MapLibre; i percorsi li calcola worker.js. */
'use strict';

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const BBOX = [12.35, 41.78, 12.64, 42.01];
const inBox = (lat, lon) => lon > BBOX[0] && lon < BBOX[2] && lat > BBOX[1] && lat < BBOX[3];
const COLORS = { fast: '#1a73e8', safe: '#188038', off: '#b4c3dc' };
const CASE = { fast: '#0b4fb8', safe: '#0d5c28', off: '#6f83a6' };
const MX = 111320 * Math.cos(41.9 * Math.PI / 180), MY = 110540;
const distM = (a, b) => Math.hypot((b[0] - a[0]) * MX, (b[1] - a[1]) * MY);

// Dentro l'app Android la pagina trova questo oggetto: avvisi in background, voce di sistema, Google Maps.
const NATIVE = window.OcchioNative || null;

const ICON = {
  pin: '<svg viewBox="0 0 24 24" class="ic"><path d="M12 2a7 7 0 0 0-7 7c0 5.200 7 13 7 13s7-7.800 7-13a7 7 0 0 0-7-7zm0 9.500a2.500 2.500 0 1 1 0-5 2.500 2.500 0 0 1 0 5z"/></svg>',
  me: '<svg viewBox="0 0 24 24" class="ic"><path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm8.900 3A9 9 0 0 0 13 3.100V1h-2v2.100A9 9 0 0 0 3.100 11H1v2h2.100A9 9 0 0 0 11 20.900V23h2v-2.100A9 9 0 0 0 20.900 13H23v-2h-2.100zM12 19a7 7 0 1 1 0-14 7 7 0 0 1 0 14z"/></svg>',
  route: '<svg viewBox="0 0 24 24" class="ic"><path d="M21.700 11.300l-9-9a1 1 0 0 0-1.400 0l-9 9a1 1 0 0 0 0 1.400l9 9a1 1 0 0 0 1.400 0l9-9a1 1 0 0 0 0-1.400zM14 14.500V12h-4v3H8v-4a1 1 0 0 1 1-1h5V7.500l3.500 3.500-3.500 3.500z"/></svg>',
  nav: '<svg viewBox="0 0 24 24" class="ic"><path d="M12 2 4.500 20.300l.700.700L12 18l6.800 3 .700-.700z"/></svg>',
  play: '<svg viewBox="0 0 24 24" class="ic"><path d="M8 5v14l11-7z"/></svg>',
  back: '<svg viewBox="0 0 24 24" class="ic"><path d="M20 11H7.800l5.600-5.600L12 4l-8 8 8 8 1.400-1.400L7.800 13H20z"/></svg>',
  warn: '<svg viewBox="0 0 24 24" class="ic"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>',
  ok: '<svg viewBox="0 0 24 24" class="ic"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm-2 15-5-5 1.400-1.400 3.600 3.600 7.600-7.600L19 8l-9 9z"/></svg>',
  bulb: '<svg viewBox="0 0 24 24" class="ic"><path d="M9 21a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1v-1H9v1zm3-19a7 7 0 0 0-4 12.700V17a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2.300A7 7 0 0 0 12 2z"/></svg>',
  vol: '<svg viewBox="0 0 24 24" class="ic"><path d="M3 9v6h4l5 5V4L7 9H3zm13.500 3A4.500 4.500 0 0 0 14 8v8a4.500 4.500 0 0 0 2.500-4zM14 3.200v2.100a7 7 0 0 1 0 13.400v2.100a9 9 0 0 0 0-17.600z"/></svg>',
  mute: '<svg viewBox="0 0 24 24" class="ic"><path d="M16.500 12A4.500 4.500 0 0 0 14 8v2.200l2.500 2.500V12zM19 12a7 7 0 0 1-.500 2.600l1.500 1.500A9 9 0 0 0 14 3.200v2.100A7 7 0 0 1 19 12zM4.300 3 3 4.300 7.700 9H3v6h4l5 5v-6.700l4.300 4.300a7 7 0 0 1-2.300 1.100v2.100a9 9 0 0 0 3.700-1.800l2 2 1.300-1.300L4.300 3zM12 4 9.900 6.100 12 8.200V4z"/></svg>',
  gmaps: '<svg viewBox="0 0 24 24" class="ic"><path d="M19 19H5V5h7V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7h-2v7zM14 3v2h3.600l-9.800 9.800 1.400 1.400L19 6.400V10h2V3h-7z"/></svg>',
};

/* ------------------------------------------------------------------ stato */
const S = {
  mode: 'home', from: null, to: null, field: 'to', routes: null, sel: 'safe',
  hot: [], meta: null, pos: null, nav: null, mute: false, ready: false,
};

/* ------------------------------------------------------------------ worker */
const VQ = window.OCCHIO_V ? '?v=' + encodeURIComponent(window.OCCHIO_V) : '';   // versione pubblicata, per non usare file vecchi
const worker = new Worker('worker.js' + VQ);
let seq = 0; const pending = new Map();
worker.onmessage = e => {
  const { id, r, err } = e.data, p = pending.get(id); if (!p) return;
  pending.delete(id); err ? p.rej(new Error(err)) : p.res(r);
};
const call = (type, p) => new Promise((res, rej) => { const id = ++seq; pending.set(id, { res, rej }); worker.postMessage({ id, type, p }); });

/* ------------------------------------------------------------------ mappa */
// In sviluppo (?proxy) le richieste esterne passano dal server locale: serve per provare
// l'app su un telefono collegato via USB senza internet.
const PROXY = new URLSearchParams(location.search).has('proxy');
const ext = u => PROXY && u.startsWith('https://') ? location.origin + '/_p/' + u.slice(8) : u;
const map = new maplibregl.Map({
  container: 'map', style: ext('https://tiles.openfreemap.org/styles/liberty'),
  transformRequest: url => ({ url: ext(url) }),
  center: [12.4922, 41.8902], zoom: 12.2, attributionControl: false,
  maxBounds: [[12.05, 41.6], [12.95, 42.2]], dragRotate: true, pitchWithRotate: false,
});
map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');
map.once('load', () => { const a = document.querySelector('.maplibregl-ctrl-attrib'); if (a) { a.classList.remove('maplibregl-compact-show'); a.removeAttribute('open'); } });
const empty = { type: 'FeatureCollection', features: [] };
// Su iPhone l'altezza dello schermo cambia quando compare o sparisce la barra del browser:
// la mappa va ridisegnata a tutta altezza, altrimenti resta una fascia grigia in basso.
new ResizeObserver(() => map.resize()).observe(document.getElementById('map'));
if (window.visualViewport) visualViewport.addEventListener('resize', () => map.resize());
const line = coords => ({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } });
let meMarker, fromMarker, toMarker, puck;

// 'style.load' arriva prima di 'load' (che aspetta tutte le tessere): l'app è usabile prima
const mapReady = new Promise((res, rej) => {
  map.once('style.load', res);
  setTimeout(() => rej(new Error('La mappa di base non risponde.')), 20000);
});
const dataReady = call('init');

const appReady = Promise.all([mapReady, dataReady]).then(([, d]) => {
  S.hot = d.hotspots; S.meta = d.meta; S.ready = true;
  for (const id of ['fast', 'safe']) {
    map.addSource('r-' + id, { type: 'geojson', data: empty });
    map.addLayer({ id: `r-${id}-case`, type: 'line', source: 'r-' + id, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': CASE.off, 'line-width': 8 } });
    map.addLayer({ id: `r-${id}-line`, type: 'line', source: 'r-' + id, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': COLORS.off, 'line-width': 6 } });
    map.addLayer({ id: `r-${id}-hit`, type: 'line', source: 'r-' + id, paint: { 'line-color': '#000', 'line-opacity': 0, 'line-width': 28 } });
    map.on('click', `r-${id}-hit`, () => { if (S.mode === 'preview' && S.routes[id]) select(id); });
  }
  // i tratti critici del percorso scelto, disegnati in arancione sopra la linea del percorso
  map.addSource('r-zones', { type: 'geojson', data: empty });
  map.addLayer({ id: 'r-zones-case', type: 'line', source: 'r-zones', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#111', 'line-width': 13 } });
  map.addLayer({ id: 'r-zones-line', type: 'line', source: 'r-zones', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['case', ['get', 'top'], '#ff9800', '#ffd08a'], 'line-width': 9 } });
  const color = ['step', ['get', 'n'], '#f9ab00', 10, '#e8710a', 20, '#d93025'];
  map.addSource('hot', { type: 'geojson', data: { type: 'FeatureCollection', features: S.hot.map(h => ({ type: 'Feature', properties: { id: h.id, n: h.n }, geometry: { type: 'Point', coordinates: [h.lon, h.lat] } })) } });
  map.addLayer({
    id: 'hot', type: 'circle', source: 'hot', minzoom: 10.5,
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, ['min', 6, ['+', 1.5, ['*', 0.1, ['get', 'n']]]], 16, ['min', 26, ['+', 7, ['*', 0.55, ['get', 'n']]]]],
      'circle-color': color, 'circle-opacity': 0.6, 'circle-stroke-color': '#fff', 'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 11, 0.5, 15, 1.5],
    },
  });
  map.addSource('hot-route', { type: 'geojson', data: empty });
  map.addLayer({ id: 'hot-route', type: 'circle', source: 'hot-route', paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 7, 16, 15], 'circle-color': color, 'circle-stroke-color': '#fff', 'circle-stroke-width': 2.5 } });
  map.addLayer({ id: 'hot-route-n', type: 'symbol', source: 'hot-route', minzoom: 12.5, layout: { 'text-field': ['to-string', ['get', 'n']], 'text-font': ['Noto Sans Bold'], 'text-size': 11, 'text-allow-overlap': true }, paint: { 'text-color': '#fff' } });
  for (const l of ['hot', 'hot-route']) {
    map.on('click', l, e => { if (S.mode !== 'nav') openHot(e.features[0].properties.id); });
  }
  render();
  // aggiornamenti verificati sui singoli punti critici (cosa è cambiato dopo il periodo dei dati)
  fetch('data/notes.json' + VQ).then(r => r.json()).then(notes => {
    for (const n of notes) {
      let best = null, bd = 80;
      for (const h of S.hot) { const d = distM([n.lon, n.lat], [h.lon, h.lat]); if (d < bd) { bd = d; best = h; } }
      if (best) best.nota = n;
    }
  }).catch(() => {});
});
appReady.catch(err => { S.failed = err.message || 'errore'; render(); });

/* ------------------------------------------------------------------ utilità */
const fmtMin = s => Math.max(1, Math.round(s / 60)) + ' min';
const fmtKm = m => (m / 1000).toFixed(1).replace('.', ',') + ' km';
const fmtDist = m => m >= 1000 ? fmtKm(m) : Math.max(50, Math.round(m / 50) * 50) + ' m';
const hname = h => h.s2 ? `${h.s1} / ${h.s2}` : h.s1 || 'Punto critico';
const hclass = h => h.n >= 20 ? 'r' : h.n >= 10 ? 'o' : 'a';
const pct = (a, b) => Math.round(100 * a / Math.max(1, b));
const MONTHS = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
const fmtYm = ym => `${MONTHS[+ym.slice(5) - 1]} ${ym.slice(0, 4)}`;
const period = () => `${fmtYm(S.meta.dal)} – ${fmtYm(S.meta.al)}`;

function natLabel(n) {
  const s = n.toLowerCase();
  if (s.includes('frontale/laterale')) return 'Scontri in svolta o immissione';
  if (s.includes('laterale')) return 'Scontri laterali';
  if (s.includes('frontale')) return 'Scontri frontali';
  if (s.includes('tamponamento')) return 'Tamponamenti';
  if (s.includes('pedone')) return 'Investimenti di pedoni';
  if (s.includes('sosta') || s.includes('fermo') || s.includes('arresto')) return 'Urti contro veicoli fermi o in sosta';
  if (s.includes('ostacolo')) return 'Urti contro ostacoli';
  if (s.includes('buche')) return 'Urti contro buche';
  if (s.includes('frenata') || s.includes('caduta') || s.includes('ribaltamento')) return 'Cadute e frenate improvvise';
  if (s.includes('fuoriuscita')) return 'Uscite di strada';
  return n;
}
function advice(h) {
  const s = (h.nat[0] ? h.nat[0][0] : '').toLowerCase();
  let a = 'Rallenta e tieni alta l\'attenzione.';
  if (s.includes('laterale')) a = 'Non dare per scontata la precedenza: rallenta e guarda chi svolta o si immette.';
  else if (s.includes('tamponamento')) a = 'Tieni la distanza: qui si frena all\'improvviso.';
  else if (s.includes('pedone')) a = 'Molti attraversamenti: modera la velocità vicino alle strisce.';
  else if (s.includes('sosta') || s.includes('fermo')) a = 'Occhio a portiere, doppie file e ripartenze.';
  else if (s.includes('ostacolo') || s.includes('fuoriuscita') || s.includes('caduta') || s.includes('buche')) a = 'Tracciato o fondo insidioso: riduci la velocità.';
  if (pct(h.bagnato, h.n) >= 30) a += ' Più rischioso con il bagnato.';
  return a;
}
// mezza frase da dire mentre si guida
// Tipi di avviso. Il tipo dipende dalla dinamica più frequente degli incidenti in quel punto.
// PHRASES spiega in poche parole cosa succede lì; ALERT_LABEL è la scritta della card.
const PHRASES = {
  auto: 'scontri frequenti tra veicoli', ped: 'qui attraversano in tanti', buche: 'buche e ostacoli sul fondo',
};
function phraseKey(h) {
  const g = grouped(h)[0], l = g ? g[0] : '';
  if (l.startsWith('Investimenti')) return 'ped';
  if (l.startsWith('Urti contro ostacoli') || l.startsWith('Urti contro buche') || l.startsWith('Cadute') || l.startsWith('Uscite')) return 'buche';
  return 'auto';
}
const phrase = h => PHRASES[phraseKey(h)];
const alertLabel = h => ALERT_LABEL[phraseKey(h)].join(' ');

// Avvisi con voce registrata (ElevenLabs): una clip per tipo di avviso ("Occhio ai pedoni").
// audio/index.json dice quali clip esistono; dove ne manca una parla la voce del telefono.
let CLIPS = null;
// campioni di voce da ascoltare nella pagina di prova (audio/prove.json), per scegliere senza uscire dall'app
let PROVE = [];
fetch('audio/prove.json' + VQ).then(r => r.ok ? r.json() : []).then(j => { PROVE = j; if (S.mode === 'prova') render(); }).catch(() => {});
fetch('audio/index.json' + VQ).then(r => r.ok ? r.json() : null)
  .then(j => { if (j) CLIPS = new Set(j.phrases); }).catch(() => {});
const slug = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
// stile della card e voce si scelgono dalla pagina di prova e restano memorizzati sul telefono
const pref = (k, d) => { try { return localStorage.getItem(k) || d; } catch (e) { return d; } };
const QS = new URLSearchParams(location.search);   // ?stile=street&voce=liam per aprire direttamente una variante
// scelte fatte: stile Street e voce Jessica; le alternative restano raggiungibili solo da link (?stile=...&voce=...)
let STYLE = QS.get('stile') || 'street', VOICE = QS.get('voce') || 'jessica';
const VOICES = { alice: ['Alice', 'audio/p'], jessica: ['Jessica', 'audio/v/jessica'], liam: ['Liam', 'audio/v/liam'] };
const STYLES = { classico: 'Classico', sticker: 'Sticker', street: 'Street', chat: 'Chat' };
// testo dell'avviso: la frase intera ("Occhio ai pedoni") oppure la sola parola "Occhio"
// scelta fatta: durante il viaggio l'avviso dice solo "Occhio"; la frase intera resta raggiungibile con ?testo=frase
let SOLO = QS.get('testo') !== 'frase';
const TEXTS = { frase: 'Frase intera', solo: 'Solo "Occhio"' };
const clipFor = k => CLIPS && CLIPS.has(k) ? [`${(VOICES[VOICE] || VOICES.alice)[1]}/${k}.mp3${VQ}`] : null;
const alertClips = h => clipFor(phraseKey(h));
const player = new Audio();
// i browser lasciano partire l'audio solo dopo un tocco: lo si sblocca al tocco su Avvia o Simula
function unlockAudio() {
  if (!CLIPS) return;
  try {
    player.muted = true; player.src = 'audio/p/ped.mp3' + VQ;
    const p = player.play();
    if (p) p.then(() => { player.pause(); player.muted = false; }).catch(() => { player.muted = false; });
  } catch (e) { /* si userà la voce del telefono */ }
}
const sayAlert = h => sayKind(phraseKey(h));
function sayKind(k) {
  if (S.mute) return;
  const text = SOLO ? 'Occhio!' : ALERT_LABEL[k].join(' ') + '.', clips = clipFor(SOLO ? 'occhio' : k);
  if (!clips) return say(text);
  let i = 0;
  const fail = () => { player.onended = null; player.onerror = null; say(text); };
  const next = () => {
    if (i >= clips.length) { player.onended = null; return; }
    player.muted = false; player.src = clips[i++]; player.onended = next; player.onerror = fail;
    const p = player.play(); if (p) p.catch(fail);
  };
  next();
}
// Tratti critici: i punti critici vicini lungo il percorso (a meno di 350 m l'uno dall'altro)
// contano come un tratto solo. Chi guida non deve tenere a mente 13 incroci, ma 3 o 4 tratti.
function zones(r) {
  if (r.zones) return r.zones;
  const out = [];
  for (const x of r.hot) {
    const h = S.hot[x.id], z = out[out.length - 1];
    if (z && x.at - z.end <= 350) { z.hs.push(h); z.end = x.at; z.n += h.n; z.w += h.w; if (h.w > z.main.w) z.main = h; }
    else out.push({ hs: [h], at: x.at, end: x.at, n: h.n, w: h.w, main: h, first: h });
  }
  for (const z of out) {
    const c = new Map();
    for (const h of z.hs) if (h.s1) c.set(h.s1, (c.get(h.s1) || 0) + h.n);
    z.name = [...c.entries()].sort((a, b) => b[1] - a[1]).map(e => e[0])[0] || hname(z.main);
    z.kind = phraseKey(z.main);
  }
  return (r.zones = out);
}
// i tratti da ricordare: i più pesanti, al massimo 3 (4 sui tragitti lunghi), nell'ordine in cui si incontrano
const topZones = r => [...zones(r)].sort((a, b) => b.w - a.w).slice(0, r.dist < 4000 ? 3 : 4).sort((a, b) => a.at - b.at);
const zclass = z => z.n >= 40 ? 'r' : z.n >= 20 ? 'o' : 'a';
const zsub = z => (z.hs.length > 1 ? `${z.hs.length} punti vicini · ` : '') + `${z.n} incidenti`;
function routeCum(r) {
  if (!r.cum) { r.cum = [0]; for (let i = 1; i < r.coords.length; i++) r.cum.push(r.cum[i - 1] + distM(r.coords[i - 1], r.coords[i])); }
  return r.cum;
}
// il pezzo di percorso tra due distanze dalla partenza (in metri)
function sliceRoute(r, a, b) {
  const c = r.coords, cum = routeCum(r);
  const at = d => {
    let i = 0; while (i < cum.length - 2 && cum[i + 1] < d) i++;
    const t = Math.min(1, Math.max(0, (d - cum[i]) / Math.max(1e-6, cum[i + 1] - cum[i])));
    return [c[i][0] + (c[i + 1][0] - c[i][0]) * t, c[i][1] + (c[i + 1][1] - c[i][1]) * t];
  };
  a = Math.max(0, a); b = Math.min(cum[cum.length - 1], b);
  const out = [at(a)];
  for (let i = 0; i < c.length; i++) if (cum[i] > a && cum[i] < b) out.push(c[i]);
  out.push(at(b));
  return out;
}
// i tratti come linee colorate: arancione pieno quelli da ricordare, chiaro i minori
function zoneLines(r) {
  const tops = new Set(topZones(r));
  return { type: 'FeatureCollection', features: zones(r).map(z => ({ type: 'Feature', properties: { top: tops.has(z) }, geometry: { type: 'LineString', coordinates: sliceRoute(r, z.at - 60, z.end + 60) } })) };
}
const zoneMarkers = r => ({ type: 'FeatureCollection', features: topZones(r).map(z => ({ type: 'Feature', properties: { id: z.main.id, n: z.n }, geometry: { type: 'Point', coordinates: [z.main.lon, z.main.lat] } })) });
function grouped(h) {
  const m = new Map();
  for (const [n, k] of h.nat) { const l = natLabel(n); m.set(l, (m.get(l) || 0) + k); }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

let toastT;
function toast(t) { const el = $('#toast'); el.textContent = t; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => el.hidden = true, 3200); }

function syncSheetHeight() {
  requestAnimationFrame(() => document.documentElement.style.setProperty('--sheet-h', $('#sheet').offsetHeight + 'px'));
}
new ResizeObserver(syncSheetHeight).observe($('#sheet'));

/* ------------------------------------------------------------------ voce */
function say(t) {
  if (S.mute) return;
  if (NATIVE) { try { NATIVE.speak(t); } catch (e) { /* la voce è un extra */ } return; }
  if (!('speechSynthesis' in window)) return;
  try {
    const u = new SpeechSynthesisUtterance(t); u.lang = 'it-IT'; u.rate = 1.05;
    const v = speechSynthesis.getVoices().find(v => v.lang && v.lang.toLowerCase().startsWith('it'));
    if (v) u.voice = v;
    speechSynthesis.cancel(); speechSynthesis.speak(u);
  } catch (e) { /* la voce è un extra */ }
}

/* ------------------------------------------------------------------ posizione */
function setMe(lat, lon) {
  S.pos = { lat, lon };
  if (!meMarker) { const el = document.createElement('div'); el.className = 'me'; meMarker = new maplibregl.Marker({ element: el }).setLngLat([lon, lat]).addTo(map); }
  else meMarker.setLngLat([lon, lat]);
  $('#locate').classList.add('on');
}
function locate(fly) {
  return new Promise(res => {
    if (!navigator.geolocation) { if (fly) toast('Posizione non disponibile su questo dispositivo'); return res(null); }
    navigator.geolocation.getCurrentPosition(p => {
      setMe(p.coords.latitude, p.coords.longitude);
      if (fly) {
        if (inBox(S.pos.lat, S.pos.lon)) map.flyTo({ center: [S.pos.lon, S.pos.lat], zoom: 15.5, duration: 900 });
        else toast('Sei fuori dall\'area coperta (Roma, dentro il raccordo)');
      }
      res(S.pos);
    }, () => { if (fly) toast('Non riesco a leggere la posizione: controlla i permessi'); res(null); }, { enableHighAccuracy: true, timeout: 8000, maximumAge: 20000 });
  });
}
$('#locate').onclick = () => locate(true);
const myPlace = () => S.pos && inBox(S.pos.lat, S.pos.lon) ? { name: 'La tua posizione', lat: S.pos.lat, lon: S.pos.lon, me: true } : null;

/* ------------------------------------------------------------------ ricerca */
const EXAMPLES = [
  { a: { name: 'Caffè Tevere, Largo Marzi', lat: 41.87602, lon: 12.47153 }, b: { name: 'San Saba', lat: 41.87898, lon: 12.48838 } },
  { a: { name: 'Monteverde, Piazza San Giovanni di Dio', lat: 41.8748, lon: 12.4471 }, b: { name: 'San Giovanni in Laterano', lat: 41.8859, lon: 12.5057 } },
  { a: { name: 'EUR, Viale Europa', lat: 41.8312, lon: 12.4667 }, b: { name: 'Stazione Termini', lat: 41.9009, lon: 12.5020 } },
];
let searchSeq = 0, searchT, abortC;

function openSearch(field) {
  S.field = field || 'to';
  if (!S.from) S.from = myPlace();
  $('#ifrom').value = S.from ? S.from.name : '';
  $('#ito').value = S.to ? S.to.name : '';
  $('#search').hidden = false;
  const el = S.field === 'from' ? $('#ifrom') : $('#ito');
  el.focus(); el.select();
  showResults('');
  if (!S.pos) locate(false).then(p => { if (p && !S.from && !$('#search').hidden) { S.from = myPlace(); if (S.from) $('#ifrom').value = S.from.name; } });
}
function closeSearch() { $('#search').hidden = true; document.activeElement && document.activeElement.blur(); }
$('#pill').onclick = () => openSearch('to');
$('#tripedit').onclick = () => openSearch('to');
$('#sback').onclick = closeSearch;
$('#swap').onclick = () => { [S.from, S.to] = [S.to, S.from]; $('#ifrom').value = S.from ? S.from.name : ''; $('#ito').value = S.to ? S.to.name : ''; if (S.from && S.to) { closeSearch(); go(); } };
for (const [id, f] of [['#ifrom', 'from'], ['#ito', 'to']]) {
  const el = $(id);
  el.addEventListener('focus', () => { S.field = f; el.select(); showResults(''); });
  el.addEventListener('input', () => { S[f] = null; clearTimeout(searchT); const q = el.value; searchT = setTimeout(() => showResults(q), 220); });
}

function resRow(icon, cls, title, sub, idx) {
  return `<button class="res" type="button" data-i="${idx}"><span class="rico ${cls}">${icon}</span><div><b>${esc(title)}</b>${sub ? `<span>${esc(sub)}</span>` : ''}</div></button>`;
}
async function photon(q) {
  if (abortC) abortC.abort();
  abortC = new AbortController();
  const u = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&lat=41.89&lon=12.49&bbox=${BBOX.join(',')}&limit=7`;
  const r = await fetch(ext(u), { signal: abortC.signal });
  const j = await r.json();
  const out = [], seen = new Set();
  for (const f of j.features || []) {
    const p = f.properties, [lon, lat] = f.geometry.coordinates;
    if (!inBox(lat, lon)) continue;
    const addr = [p.street, p.housenumber].filter(Boolean).join(' ');
    const name = p.name || addr; if (!name) continue;
    const sub = [p.name && addr && addr !== p.name ? addr : null, p.district || p.locality, p.city && p.city !== 'Roma' ? p.city : 'Roma'].filter(Boolean).join(' · ');
    const k = name + '|' + sub; if (seen.has(k)) continue; seen.add(k);
    out.push({ name, sub, lat, lon });
  }
  return out;
}
async function showResults(q) {
  const my = ++searchSeq, box = $('#results');
  q = q.trim();
  let items = [], html = '';
  if (q.length < 2) {
    const me = myPlace();
    if (S.field === 'from' && me) { items.push(me); html += resRow(ICON.me, 'b', 'La tua posizione', '', 0); }
    if (S.field === 'from' && !me) { items.push({ askMe: true }); html += resRow(ICON.me, 'b', 'Usa la mia posizione', '', 0); }
    html += '<div class="rhead">Prova un tragitto</div>';
    for (const ex of EXAMPLES) { items.push({ ex }); html += resRow(ICON.route, '', `${ex.a.name.split(',')[0]} → ${ex.b.name.split(',')[0]}`, `${ex.a.name} · ${ex.b.name}`, items.length - 1); }
  } else {
    let local = [], remote = [];
    try { local = await call('streets', { q }); } catch (e) { /* ignora */ }
    if (my !== searchSeq) return;
    const paint = () => {
      items = [...remote]; const names = new Set(remote.map(r => r.name.toLowerCase()));
      for (const l of local) if (!names.has(l.name.toLowerCase()) && items.length < 8) items.push(l);
      box.innerHTML = items.length ? items.map((it, i) => resRow(ICON.pin, '', it.name, it.sub, i)).join('') : '<div class="rhead">Nessun risultato a Roma</div>';
      box._items = items;
    };
    box.innerHTML = '<div class="rhead">Cerco…</div>'; box._items = [];
    const late = setTimeout(() => { if (my === searchSeq) paint(); }, 1500);
    try { remote = await photon(q); } catch (e) { /* resta la ricerca locale */ }
    clearTimeout(late);
    if (my === searchSeq) paint();
    return;
  }
  box.innerHTML = html; box._items = items;
}
$('#results').onclick = async e => {
  const b = e.target.closest('.res'); if (!b) return;
  let it = $('#results')._items[+b.dataset.i]; if (!it) return;
  if (it.ex) { S.from = it.ex.a; S.to = it.ex.b; closeSearch(); return go(); }
  if (it.askMe) { const p = await locate(false); it = myPlace(); if (!it) return toast(p ? 'Sei fuori dall\'area coperta' : 'Posizione non disponibile: scrivi la partenza'); }
  S[S.field] = it;
  $(S.field === 'from' ? '#ifrom' : '#ito').value = it.name;
  if (S.from && S.to) { closeSearch(); go(); }
  else { const other = S.field === 'from' ? '#ito' : '#ifrom'; $(other).focus(); }
};

/* ------------------------------------------------------------------ percorsi */
async function go() {
  setMode('loading');
  $('#tfrom').textContent = S.from.name; $('#tto').textContent = S.to.name;
  let r;
  try {
    await appReady;   // se la mappa non ha ancora finito di caricarsi, aspetta
    r = await call('route', { from: [S.from.lon, S.from.lat], to: [S.to.lon, S.to.lat] });
  } catch (e) { r = { error: 'errore' }; }
  if (r.error) {
    toast({ fuori: 'Partenza o arrivo fuori dall\'area coperta (Roma, dentro il raccordo)', vicino: 'Partenza e arrivo sono troppo vicini', nessuno: 'Non trovo un percorso tra questi due punti' }[r.error] || 'Qualcosa è andato storto, riprova');
    wipeRoutes(); return setMode('home');
  }
  S.routes = r; S.sel = r.safe ? 'safe' : 'fast';
  map.getSource('r-fast').setData(line(r.fast.coords));
  map.getSource('r-safe').setData(r.safe ? line(r.safe.coords) : empty);
  const el1 = document.createElement('div'); el1.className = 'start';
  if (fromMarker) fromMarker.remove(); if (toMarker) toMarker.remove();
  fromMarker = new maplibregl.Marker({ element: el1 }).setLngLat(r.fast.coords[0]).addTo(map);
  const el2 = document.createElement('div');
  el2.innerHTML = '<svg class="pin" viewBox="0 0 24 24"><path fill="#d93025" stroke="#fff" stroke-width="1" d="M12 2a7 7 0 0 0-7 7c0 5.200 7 13 7 13s7-7.800 7-13a7 7 0 0 0-7-7z"/><circle cx="12" cy="9" r="2.600" fill="#fff"/></svg>';
  toMarker = new maplibregl.Marker({ element: el2.firstChild, anchor: 'bottom' }).setLngLat(r.fast.coords[r.fast.coords.length - 1]).addTo(map);
  setMode('preview');
  select(S.sel, true);
}
function fit() {
  map.setPadding({ top: 0, bottom: 0, left: 0, right: 0 });
  const b = new maplibregl.LngLatBounds();
  for (const k of ['fast', 'safe']) if (S.routes[k]) for (const c of S.routes[k].coords) b.extend(c);
  map.fitBounds(b, { padding: { top: $('#top').offsetHeight + 50, bottom: $('#sheet').offsetHeight + 36, left: 44, right: 44 }, duration: 700, pitch: 0, bearing: 0 });
}
function select(k, doFit) {
  S.sel = k;
  for (const id of ['fast', 'safe']) {
    const on = id === k;
    map.setPaintProperty(`r-${id}-line`, 'line-color', on ? COLORS[id] : COLORS.off);
    map.setPaintProperty(`r-${id}-line`, 'line-width', on ? 7 : 5.5);
    map.setPaintProperty(`r-${id}-case`, 'line-width', on ? 10 : 8);
    map.setPaintProperty(`r-${id}-case`, 'line-color', on ? CASE[id] : CASE.off);
  }
  for (const s of ['case', 'line']) map.moveLayer(`r-${k}-${s}`, 'r-fast-hit');
  const r = S.routes[k];
  map.getSource('hot-route').setData(zoneMarkers(r));
  map.getSource('r-zones').setData(zoneLines(r));
  render();
  if (doFit) setTimeout(fit, 120);
}
function wipeRoutes() {
  S.routes = null;
  for (const id of ['r-fast', 'r-safe', 'hot-route', 'r-zones']) { const src = map.getSource(id); if (src) src.setData(empty); }
  if (fromMarker) fromMarker.remove(); if (toMarker) toMarker.remove();
}
function clearRoutes() {
  if (NATIVE && S.mode === 'bg') NATIVE.stopTrip();
  wipeRoutes(); S.to = null; S.from = null;
  setMode('home');
  map.setPadding({ top: 0, bottom: 0, left: 0, right: 0 });
  map.easeTo({ pitch: 0, bearing: 0, duration: 400 });
}
$('#tripback').onclick = clearRoutes;

/* ------------------------------------------------------------------ schermate */
function setMode(m) {
  S.mode = m;
  document.body.classList.toggle('nav', m === 'nav');
  const trip = m === 'preview' || m === 'loading' || m === 'bg' || (m === 'hot' && S.routes);
  $('#pill').hidden = !!trip; $('#trip').hidden = !trip;
  $('#navcard').hidden = m !== 'nav';
  if (m !== 'prova') endDemoAlert();
  $('#sheet').classList.remove('full');
  if (S.ready && map.getLayer('hot')) map.setPaintProperty('hot', 'circle-opacity', m === 'home' || (m === 'hot' && !S.routes) ? 0.6 : 0.18);
  render();
}

function render() {
  const c = $('#sheetc');
  if (S.failed) {
    c.innerHTML = `<h2>Occhio non riesce a partire</h2><p class="sub">${esc(S.failed)} Controlla la connessione e riprova.</p>
      <div class="actions"><button class="btn primary" type="button" data-act="reload">Riprova</button></div>`;
    return syncSheetHeight();
  }
  if (!S.ready) { c.innerHTML = '<div class="loading"><div class="spin"></div>Carico le strade di Roma…</div>'; return; }
  if (S.mode === 'home') c.innerHTML = homeHtml();
  else if (S.mode === 'loading') c.innerHTML = '<div class="loading"><div class="spin"></div>Calcolo i percorsi…</div>';
  else if (S.mode === 'preview') c.innerHTML = previewHtml();
  else if (S.mode === 'hot') c.innerHTML = hotHtml(S.hotZone);
  else if (S.mode === 'about') c.innerHTML = aboutHtml();
  else if (S.mode === 'prova') c.innerHTML = provaHtml();
  else if (S.mode === 'nav') c.innerHTML = navBarHtml();
  else if (S.mode === 'bg') c.innerHTML = bgHtml();
  c.scrollTop = 0;
  syncSheetHeight();
}

function homeHtml() {
  return `<div class="peek"><div class="peekrow"><div><b>${S.hot.length} punti critici a Roma</b>
    <p>Incidenti rilevati dalla Polizia Locale, ${period()}</p></div>
    <button class="link" type="button" data-act="about">Come funziona</button></div>
    <button class="link" style="padding:8px 0 0" type="button" data-act="prova">Prova gli avvisi</button>
    <div class="legend"><span><i style="background:#f9ab00"></i>8–9 incidenti</span><span><i style="background:#e8710a"></i>10–19</span><span><i style="background:#d93025"></i>20 o più</span></div></div>`;
}
function aboutHtml() {
  return `<div class="dhead"><button class="iconbtn" type="button" data-act="home">${ICON.back}</button><div><h2>Come funziona</h2></div></div>
    <p class="sub" style="margin-top:8px">Occhio confronta il percorso più veloce con quello che attraversa meno punti dove sono avvenuti incidenti, e ti avvisa prima di ognuno.</p>
    <h3>Da dove vengono i dati</h3>
    <p class="sub">${S.meta.incidenti.toLocaleString('it-IT')} incidenti con posizione affidabile rilevati dalla Polizia Locale di Roma Capitale tra ${period()} (open data del Comune), agganciati alla rete stradale di OpenStreetMap.</p>
    <h3>Cos'è un punto critico</h3>
    <p class="sub">Un tratto di circa 90 metri con almeno 8 incidenti nel periodo. Gli incidenti con feriti e quelli che coinvolgono moto, bici e monopattini pesano di più nella scelta del percorso.</p>
    <h3>Cosa non fa</h3>
    <p class="sub">Non garantisce un viaggio sicuro. Non conosce il traffico: dove passano più veicoli avvengono più incidenti. I dati pubblici si fermano al 2022, quindi un incrocio può essere stato sistemato nel frattempo.</p>`;
}
function rcard(k, r, label) {
  return `<button class="rcard ${k} ${S.sel === k ? 'sel' : ''}" type="button" data-sel="${k}">
    <span class="rlabel"><i></i>${label}</span><span class="rtime">${fmtMin(r.time)}</span>
    <span class="rsub">${fmtKm(r.dist)}${r.via[0] ? ' · ' + esc(r.via[0]) : ''}</span>
    <span class="rstat"><b>${r.inc}</b> incidenti</span></button>`;
}
function previewHtml() {
  const { fast, safe } = S.routes, r = S.routes[S.sel];
  let h = '';
  if (safe) {
    const dm = Math.max(1, Math.round((safe.time - fast.time) / 60)), dh = zones(fast).length - zones(safe).length;
    const gains = [];
    if (safe.inc < fast.inc) gains.push(`−${pct(fast.inc - safe.inc, fast.inc)}% incidenti`);
    h += `<p class="gain">Più prudente: +${dm} min, <b>${gains.join(', ') || 'meno incidenti gravi'}</b>.</p>`;
    h += `<div class="rcards">${rcard('safe', safe, 'Più prudente')}${rcard('fast', fast, 'Più veloce')}</div>`;
  } else {
    h += `<p class="gain">Qui la strada più veloce è anche la più tranquilla.</p><div class="rcards one">${rcard('fast', fast, 'Percorso consigliato')}</div>`;
  }
  h += `<div class="actions"><button class="btn primary" type="button" data-act="start">${ICON.nav}Avvia</button>
    <button class="btn tonal" type="button" data-act="sim">${ICON.play}Simula</button>
    ${NATIVE ? '' : `<button class="btn ghost" type="button" data-act="gmaps" aria-label="Apri in Google Maps">${ICON.gmaps}</button>`}</div>`;
  if (NATIVE) h += `<div class="actions" style="margin-top:8px"><button class="btn ghost" style="flex:1" type="button" data-act="bgstart">${ICON.gmaps}Usa Google Maps con gli avvisi</button></div>`;
  const top = topZones(r), all = zones(r);
  if (!all.length) h += '<h3>Nessun tratto critico sul percorso</h3>';
  else {
    h += '<h3>Dove stare attento</h3>';
    for (const z of top) {
      h += `<button class="keep" type="button" data-hot="${z.main.id}"><span class="badge ${zclass(z)}">${z.n}</span>
        <span class="hmain"><b>${esc(z.name)}</b><span class="say">${esc(zoneStats(z).watch[0])}</span></span><span class="hdist">${fmtDist(z.at)}</span></button>`;
    }
    h += `<p class="note" style="margin:8px 0 0">Ti avviso io quando ci arrivi.</p>`;
  }
  h += `<p class="note">Dati Polizia Locale, ${period()}.</p>`;
  return h;
}
// A cosa stare attento: una frase sola, corta, come la si direbbe a voce.
const WATCH = {
  'Scontri in svolta o immissione': 'Occhio agli incroci',
  'Scontri laterali': 'Occhio alle macchine',
  'Scontri frontali': 'Occhio ai sorpassi',
  'Tamponamenti': 'Occhio alle frenate',
  'Investimenti di pedoni': 'Occhio ai pedoni',
  'Urti contro veicoli fermi o in sosta': 'Occhio alle portiere',
  'Urti contro ostacoli': 'Occhio alle buche',
  'Urti contro buche': 'Occhio alle buche',
  'Cadute e frenate improvvise': 'Occhio: si scivola',
  'Uscite di strada': 'Occhio alla curva',
};
// Mette insieme i punti di un tratto: numeri, tipi di incidente, condizioni.
function zoneStats(z) {
  if (z.stats) return z.stats;
  const t = { n: 0, tw: 0, feriti: 0, gravi: 0, morti: 0, notte: 0, punta: 0, bagnato: 0, nat: new Map(), nota: null };
  for (const h of z.hs) {
    for (const k of ['n', 'tw', 'feriti', 'gravi', 'morti', 'notte', 'punta', 'bagnato']) t[k] += h[k] || 0;
    for (const [l, c] of grouped(h)) t.nat.set(l, (t.nat.get(l) || 0) + c);
    if (h.nota) t.nota = h.nota;
  }
  t.nat = [...t.nat.entries()].sort((a, b) => b[1] - a[1]);
  const tot = t.nat.reduce((a, b) => a + b[1], 0) || 1;
  // una cosa sola a cui stare attento: quella che lì succede più spesso
  t.watch = [(t.nat.find(x => WATCH[x[0]]) || [])[0]].map(l => WATCH[l] || 'Occhio: vai piano');
  t.when = [];
  if (pct(t.punta, t.n) >= 50) t.when.push("all'ora di punta");
  if (pct(t.notte, t.n) >= 35) t.when.push('di sera');
  if (pct(t.bagnato, t.n) >= 25) t.when.push('quando piove');
  return (z.stats = t);
}
function hotHtml(z) {
  const t = zoneStats(z), len = z.end - z.at;
  const facts = [`<b>${t.n} incidenti</b> in ${S.meta.mesi} mesi`];
  if (t.tw) facts.push(`${t.tw} in moto o bici`);
  if (t.morti) facts.push(`${t.morti} ${t.morti === 1 ? 'morto' : 'morti'}`);
  return `<div class="dhead"><button class="iconbtn" type="button" data-act="hotback">${ICON.back}</button><div><h2>${esc(z.name)}</h2>${z.hs.length > 1 ? `<p class="sub">Un tratto di ${fmtDist(Math.max(100, len))}</p>` : ''}</div></div>
    <div class="watch"><span class="sym">${ALERT_ICON[z.kind]}</span><div><p>${esc(t.watch[0])}</p>
      ${t.when.length ? `<small>Peggio ${esc(t.when[0])}.</small>` : ''}</div></div>
    ${t.nota ? `<div class="update"><b>Aggiornamento</b>${esc(t.nota.testo)}<a href="${esc(t.nota.url)}" target="_blank" rel="noopener">${esc(t.nota.fonte)}</a></div>` : ''}
    <p class="facts">${facts.join(' · ')}</p>
    <p class="note">Dati Polizia Locale, ${period()}.</p>`;
}
// Apre la scheda: se il punto fa parte di un tratto del percorso scelto si apre il tratto intero.
function openHot(id) {
  if (S.mode !== 'hot') S.prev = S.mode === 'about' || S.mode === 'prova' ? 'home' : S.mode;
  const h = S.hot[id], r = S.routes && S.routes[S.sel];
  const z = (r && zones(r).find(x => x.hs.includes(h)))
    || { hs: [h], at: 0, end: 0, n: h.n, w: h.w, main: h, first: h, name: hname(h), kind: phraseKey(h) };
  S.hotZone = z; setMode('hot');
  map.setPadding({ top: 0, bottom: 0, left: 0, right: 0 });
  if (z.hs.length > 1) {
    const b = new maplibregl.LngLatBounds();
    for (const x of z.hs) b.extend([x.lon, x.lat]);
    map.fitBounds(b, { padding: { top: $('#top').offsetHeight + 60, bottom: Math.min(innerHeight * 0.55, 460), left: 60, right: 60 }, maxZoom: 16, duration: 600 });
  } else {
    map.easeTo({ center: [h.lon, h.lat], zoom: Math.max(map.getZoom(), 15.5), offset: [0, -Math.min(innerHeight * 0.2, 170)], duration: 600 });
  }
}

$('#sheetc').onclick = e => {
  const t = e.target.closest('[data-act],[data-sel],[data-hot]'); if (!t) return;
  if (t.dataset.sel) return select(t.dataset.sel);
  if (t.dataset.hot) return openHot(+t.dataset.hot);
  const a = t.dataset.act;
  if (a === 'reload') location.reload();
  else if (a === 'prova') { setMode('prova'); $('#sheet').classList.add('full'); }
  else if (a === 'demo') demoAlert(t.dataset.k);
  else if (a === 'clip') { player.onended = null; player.onerror = null; player.muted = false; player.src = t.dataset.src + VQ; const pr = player.play(); if (pr) pr.catch(() => toast('Non riesco a riprodurre questa clip')); }
  else if (a === 'stile' || a === 'voce' || a === 'testo') {
    if (a === 'stile') STYLE = t.dataset.k; else if (a === 'voce') VOICE = t.dataset.k; else SOLO = t.dataset.k === 'solo';
    try { localStorage.setItem({ stile: 'occhioStile', voce: 'occhioVoce', testo: 'occhioTesto' }[a], t.dataset.k); } catch (e) { /* vale solo per questa visita */ }
    const top = $('#sheetc').scrollTop; render(); $('#sheetc').scrollTop = top;
    demoAlert('ped');
  }
  else if (a === 'skip') skipAhead();
  else if (a === 'about') setMode('about');
  else if (a === 'home') setMode('home');
  else if (a === 'hotback') { setMode(S.prev || 'home'); if (S.routes) fit(); else map.easeTo({ padding: { top: 0, bottom: 0, left: 0, right: 0 }, duration: 300 }); }
  else if (a === 'sim') startNav(true);
  else if (a === 'start') startNav(false);
  else if (a === 'bgstart') startBackground();
  else if (a === 'gnav') openGmaps(true);
  else if (a === 'overlay') NATIVE.askOverlay();
  else if (a === 'bgstop') { NATIVE.stopTrip(); setMode('preview'); }
  else if (a === 'gmaps') openGmaps(false);
  else if (a === 'exit') stopNav();
  else if (a === 'mute') {
    S.mute = !S.mute;
    if (S.mute) { player.pause(); if (NATIVE) NATIVE.speak(''); else if (window.speechSynthesis) speechSynthesis.cancel(); }
    render();
    if (S.nav) { if (S.nav.done) { const e = $('#eta'); if (e) e.innerHTML = '<b>Arrivato</b><span>Tocca Esci per tornare al percorso</span>'; } else updateNav(true); }
  }
};

/* pannello: tocco o trascinamento sulla maniglia per allargarlo */
(() => {
  const h = $('#handle'), sh = $('#sheet'); let y0 = null;
  h.addEventListener('pointerdown', e => { y0 = e.clientY; h.setPointerCapture(e.pointerId); });
  h.addEventListener('pointerup', e => {
    if (y0 === null) return; const dy = e.clientY - y0; y0 = null;
    if (Math.abs(dy) < 8) sh.classList.toggle('full'); else sh.classList.toggle('full', dy < 0);
  });
})();

function gmapsUrl(navigate) {
  const r = S.routes[S.sel], c = r.coords, n = c.length;
  const wp = [0.25, 0.5, 0.75].map(f => c[Math.floor(n * f)]).map(p => `${p[1].toFixed(5)},${p[0].toFixed(5)}`).join('|');
  const u = `https://www.google.com/maps/dir/?api=1&origin=${c[0][1].toFixed(5)},${c[0][0].toFixed(5)}&destination=${c[n - 1][1].toFixed(5)},${c[n - 1][0].toFixed(5)}&waypoints=${encodeURIComponent(wp)}&travelmode=driving${navigate ? '&dir_action=navigate' : ''}`;
  return u;
}
function openGmaps(navigate) {
  const u = gmapsUrl(navigate);
  if (NATIVE) NATIVE.openMaps(u); else window.open(u, '_blank');
}
// App Android: Occhio resta attivo in background e avvisa mentre si usa Google Maps
function startBackground() {
  const r = S.routes[S.sel];
  const alerts = topZones(r).map(z => ({
    lat: z.first.lat, lon: z.first.lon, name: z.name, phrase: PHRASES[z.kind],
    label: SOLO ? 'Occhio' : ALERT_LABEL[z.kind].join(' '), kind: z.kind,
    clips: (clipFor(SOLO ? 'occhio' : z.kind) || []).map(u => new URL(u, location.href).href),
  }));
  if (!alerts.length) { toast('Nessun punto critico su questo percorso'); return openGmaps(true); }
  if (!NATIVE.startTrip(JSON.stringify({ alerts }))) return toast('Consenti la posizione precisa a Occhio, poi tocca di nuovo Avvia');
  setMode('bg');
  setTimeout(() => openGmaps(true), 500);
}
function bgHtml() {
  const r = S.routes[S.sel], top = topZones(r);
  let full = true;
  try { full = !NATIVE.canOverlay || NATIVE.canOverlay(); } catch (e) { /* versione dell'app senza avviso a tutto schermo */ }
  return `<h2>Occhio è attivo</h2><p class="sub">${top.length ? `Usa pure Google Maps: prima di questi tratti ti avviso a voce e ${full ? 'con un avviso a tutto schermo' : 'con una notifica'}.` : 'Nessun tratto critico su questo percorso.'}</p>
    <div class="actions" style="margin-bottom:4px"><button class="btn primary" type="button" data-act="gnav">${ICON.nav}Apri Google Maps</button>
    <button class="btn danger" type="button" data-act="bgstop">Termina</button></div>
    ${full ? '' : `<div class="advice">${ICON.bulb}<div>Per l'avviso grande a tutto schermo, consenti a Occhio di comparire sopra le altre app. <button class="link" style="padding:6px 0 0;display:block" type="button" data-act="overlay">Attiva</button></div></div>`}
    ${top.map(z => `<div class="keep"><span class="badge ${zclass(z)}">${z.n}</span><span class="hmain"><b>${esc(z.name)}</b><span class="say">${esc(zoneStats(z).watch[0])}</span></span></div>`).join('')}`;
}

/* ------------------------------------------------------------------ viaggio */
let wakeLock = null, watchId = null;
function startNav(sim) {
  const r = S.routes[S.sel], cum = [0];
  for (let i = 1; i < r.coords.length; i++) cum.push(cum[i - 1] + distM(r.coords[i - 1], r.coords[i]));
  S.nav = { sim, r, cum, total: cum[cum.length - 1], s: 0, idx: 0, si: 0, bearing: null, said: new Set(), tz: topZones(r), last: performance.now(), lastUi: 0, v: 0, done: false, key: '' };
  for (const st of r.steps || []) { st.v1 = false; st.v2 = false; }
  if (!sim && !navigator.geolocation) return toast('Posizione non disponibile: usa Simula');
  setMode('nav');
  keepAwake(true);
  if (!puck) {
    const el = document.createElement('div');
    el.innerHTML = '<svg class="puck" viewBox="0 0 44 44"><circle cx="22" cy="22" r="20" fill="#fff"/><circle cx="22" cy="22" r="17" fill="#1a73e8"/><path d="M22 10l8 20-8-4.500L14 30z" fill="#fff"/></svg>';
    puck = new maplibregl.Marker({ element: el.firstChild, rotationAlignment: 'viewport' });
  }
  puck.setLngLat(r.coords[0]).addTo(map);
  unlockAudio();
  for (const z of topZones(r)) for (const u of clipFor(SOLO ? 'occhio' : z.kind) || []) fetch(u).catch(() => {});   // le clip sono già scaricate quando servono
  say(r.hot.length ? 'Partiamo. Ti avviso prima dei tratti critici.' : 'Partiamo. Nessun tratto critico sul percorso.');
  if (navigator.wakeLock) navigator.wakeLock.request('screen').then(w => wakeLock = w).catch(() => {});
  updateNav(true);
  if (sim) requestAnimationFrame(tick);
  else {
    toast('Seguo la tua posizione');
    watchId = navigator.geolocation.watchPosition(onPos, err => {
      if (err && err.code === 1) { stopNav(); toast('Posizione non consentita: usa Simula, oppure consenti la posizione'); }
      else toast('Segnale GPS assente');
    }, { enableHighAccuracy: true, maximumAge: 1000 });
  }
}
// nell'app Android lo schermo resta acceso durante il viaggio
function keepAwake(on) { try { if (NATIVE && NATIVE.keepAwake) NATIVE.keepAwake(on); } catch (e) { /* versione dell'app senza questa funzione */ } }

const ORD = ['', 'prima', 'seconda', 'terza', 'quarta', 'quinta', 'sesta', 'settima', 'ottava'];
function stepText(st) {
  const side = st.dir === 'right' ? 'destra' : 'sinistra', into = st.name ? ` in ${st.name}` : '';
  if (st.type === 'arrive') return 'Arrivo a destinazione';
  if (st.type === 'rb') return `Alla rotonda prendi la ${ORD[st.exit] || st.exit + 'ª'} uscita${st.name ? ', ' + st.name : ''}`;
  if (st.type === 'uturn') return 'Fai inversione';
  if (st.type === 'keep') return `Tieni la ${side}${st.name ? ' per ' + st.name : ''}`;
  if (st.type === 'sharp') return `Svolta stretta a ${side}${into}`;
  return `Gira a ${side}${into}`;
}
function stepIcon(st) {
  if (st.type === 'arrive') return ICON.pin;
  if (st.type === 'rb') return `<span class="rbn">${st.exit}</span>`;
  const deg = st.type === 'uturn' ? 180 : (st.type === 'sharp' ? 135 : st.type === 'keep' ? 35 : 90) * (st.dir === 'right' ? 1 : -1);
  return `<svg viewBox="0 0 24 24" class="ic" style="transform:rotate(${deg}deg)"><path d="M12 3l-7 7.500h4.700V21h4.600V10.500H19z"/></svg>`;
}
const fmtNear = m => m < 25 ? 'Ora' : m < 100 ? Math.round(m / 10) * 10 + ' m' : fmtDist(m);

// fuori percorso: nuovo calcolo dalla posizione attuale, con lo stesso tipo di percorso
async function reroute(me) {
  const n = S.nav; n.rerouting = true; n.lastReroute = performance.now();
  say('Ricalcolo il percorso');
  try {
    const r = await call('route', { from: me, to: [S.to.lon, S.to.lat] });
    if (S.nav !== n || n.done || r.error) return;
    const nr = S.sel === 'safe' && r.safe ? r.safe : r.fast;
    S.routes = { fast: S.sel === 'fast' ? nr : S.routes.fast, safe: S.sel === 'safe' ? nr : S.routes.safe };
    map.getSource('r-' + S.sel).setData(line(nr.coords));
    map.getSource('r-' + (S.sel === 'safe' ? 'fast' : 'safe')).setData(empty);
    map.getSource('hot-route').setData(zoneMarkers(nr));
    map.getSource('r-zones').setData(zoneLines(nr));
    const cum = [0];
    for (let i = 1; i < nr.coords.length; i++) cum.push(cum[i - 1] + distM(nr.coords[i - 1], nr.coords[i]));
    Object.assign(n, { r: nr, cum, total: cum[cum.length - 1], s: 0, idx: 0, si: 0, said: new Set(), tz: topZones(nr), key: '' });
  } catch (e) { /* si riprova al prossimo rilevamento */ } finally { n.rerouting = false; n.off = 0; }
}

function stopNav() {
  keepAwake(false);
  setAlerting(false);
  if (watchId !== null) { navigator.geolocation.clearWatch(watchId); watchId = null; }
  if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
  player.pause();
  if (window.speechSynthesis) speechSynthesis.cancel();
  if (puck) puck.remove();
  S.nav = null;
  setMode('preview');
  map.setPadding({ top: 0, bottom: 0, left: 0, right: 0 });
  fit();
}
function placeAt(s) {
  const n = S.nav, c = n.r.coords, cum = n.cum;
  while (n.idx < cum.length - 2 && cum[n.idx + 1] < s) n.idx++;
  while (n.idx > 0 && cum[n.idx] > s) n.idx--;
  const a = c[n.idx], b = c[n.idx + 1] || a, seg = Math.max(1e-6, cum[n.idx + 1] - cum[n.idx] || 1e-6);
  const t = Math.min(1, Math.max(0, (s - cum[n.idx]) / seg));
  // direzione: guarda una ventina di metri avanti per non scattare sulle curve
  let j = n.idx + 1; while (j < c.length - 1 && cum[j] < s + 25) j++;
  const f = c[j], lng = a[0] + (b[0] - a[0]) * t, lat = a[1] + (b[1] - a[1]) * t;
  const brg = (Math.atan2((f[0] - lng) * MX, (f[1] - lat) * MY) * 180 / Math.PI + 360) % 360;
  return { lng, lat, brg };
}
function camera(p, dt) {
  const n = S.nav;
  if (n.bearing === null) n.bearing = p.brg;
  else { const d = ((p.brg - n.bearing + 540) % 360) - 180; n.bearing = (n.bearing + d * Math.min(1, dt * 3) + 360) % 360; }
  puck.setLngLat([p.lng, p.lat]);
  map.jumpTo({ center: [p.lng, p.lat], bearing: n.bearing, pitch: 55, zoom: 16.7, padding: { top: 260, bottom: 60, left: 0, right: 0 } });
}
function tick(now) {
  const n = S.nav; if (!n || !n.sim || n.done) return;
  const dt = Math.min(0.5, (now - n.last) / 1000); n.last = now;
  const next = n.tz.find(z => z.at > n.s - 80);
  const d = next ? next.at - n.s : Infinity;
  const target = d < 240 ? 16 : 110 * (+QS.get('vel') || 1);   // veloce tra un avviso e l'altro, lenta solo attorno all'avviso
  n.v += (target - n.v) * Math.min(1, dt * 2.5);
  n.s = Math.min(n.total, n.s + n.v * dt);
  camera(placeAt(n.s), dt);
  updateNav();
  if (n.s >= n.total) return finishNav();
  requestAnimationFrame(tick);
}
function onPos(p) {
  const n = S.nav; if (!n || n.done) return;
  const me = [p.coords.longitude, p.coords.latitude], c = n.r.coords;
  let bi = n.idx, bd = Infinity;
  for (let i = Math.max(0, n.idx - 10); i < Math.min(c.length, n.idx + 400); i++) { const d = distM(me, c[i]); if (d < bd) { bd = d; bi = i; } }
  if (bd > 70) {
    n.off = (n.off || 0) + 1;
    if (n.off >= 4 && !n.rerouting && performance.now() - (n.lastReroute || 0) > 8000) reroute(me);
  } else { n.off = 0; n.s = n.cum[bi]; n.idx = Math.max(0, bi - 1); }
  const now = performance.now(), dt = Math.min(1, (now - n.last) / 1000); n.last = now;
  const pl = placeAt(n.s);
  camera({ lng: me[0], lat: me[1], brg: pl.brg }, dt);
  updateNav();
  if (n.total - n.s < 35) finishNav();
}
function updateNav(force) {
  const n = S.nav, now = performance.now();
  if (!force && now - n.lastUi < 200) return; n.lastUi = now;
  const s = n.s, left = n.total - s;
  const eta = $('#eta'); if (eta) eta.innerHTML = `<b>${fmtMin(n.r.time * left / n.total)}</b><span>${fmtKm(Math.max(0, left))} all'arrivo</span>`;
  const card = $('#navcard');
  // prossima manovra
  const steps = n.r.steps || [];
  while (n.si < steps.length - 1 && steps[n.si].at < s - 12) n.si++;
  const st = steps[n.si], dm = st ? Math.max(0, st.at - s) : left;
  let html = st ? `<div class="man"><span class="arrow">${stepIcon(st)}</span><div><div class="big">${fmtNear(dm)}</div><div class="name">${esc(stepText(st))}</div></div></div>` : '';
  if (st && !n.sim && st.type !== 'arrive') {     // in simulazione si va troppo veloci per le istruzioni a voce
    if (dm <= 320 && dm > 110 && !st.v1) { st.v1 = true; say(`Tra ${fmtDist(dm).replace(' m', ' metri')}, ${stepText(st).replace(/^./, ch => ch.toLowerCase())}`); }
    else if (dm <= 45 && !st.v2) { st.v2 = true; say(stepText(st)); }
  }
  // Tratto critico in arrivo, solo per i tratti da ricordare: lo schermo lampeggia e si illumina e una card
  // grande prende per qualche secondo il posto della svolta (che resta sotto, in piccolo).
  // Poi rimane una striscia finché il tratto non è finito. Per i tratti minori non si mostra niente.
  const z = n.tz.find(z => z.end > s - 25);
  let alerting = false;
  if (z && z.at - s <= 260) {
    const d = Math.max(0, z.at - s), k = z.kind, name = esc(z.name);
    if (!n.said.has(z)) { n.said.add(z); n.bigUntil = now + 5000; flashScreen(); sayKind(k); }
    alerting = true;
    if (now < n.bigUntil) {
      html = bigCard(k, `${d > 0 ? 'tra ' + fmtDist(d) : 'adesso'} · ${name}`)
        + (st ? `<div class="manmini"><span class="arrow">${stepIcon(st)}</span><b>${fmtNear(dm)}</b><span>${esc(stepText(st))}</span></div>` : '');
    } else {
      html += stripCard(k, d > 0 ? fmtDist(d) : `ancora ${fmtDist(Math.max(0, z.end - s))}`, name);
    }
  }
  setAlerting(alerting);
  if (html !== n.key) { n.key = html; card.className = ''; card.innerHTML = html; }
}

// --- la card dell'avviso, nei suoi stili
const EMOJI = { auto: '🚗', ped: '🚶', buche: '🕳️' };
function bigCard(k, where) {
  if (SOLO) {
    if (STYLE === 'sticker') return `<div class="occbig sticker"><span class="emo">${EMOJI[k]}</span><div><div class="lab">occhio 👀</div><div class="where">${where}</div></div></div>`;
    if (STYLE === 'street') return `<div class="occbig street"><div class="tape"></div><div class="in"><span class="sym">${ALERT_ICON[k]}</span><div><div class="lab">Occhio!</div><div class="where">${where}</div></div></div></div>`;
    if (STYLE === 'chat') return `<div class="occbig chat"><span class="ava">👀</span><div class="bub"><div class="lab">Oh, occhio ${EMOJI[k]}</div><div class="where">${where}</div></div></div>`;
    return `<div class="occbig"><span class="sym">${ALERT_ICON[k]}</span><div><div class="lab solo">Occhio</div><div class="where">${where}</div></div></div>`;
  }
  const lab = ALERT_LABEL[k], art = lab[0].split(' ').slice(1).join(' ');
  if (STYLE === 'sticker') return `<div class="occbig sticker"><span class="emo">${EMOJI[k]}</span><div><div class="pre">occhio 👀 ${esc(art)}</div><div class="lab ${labSize(lab[1])}">${esc(lab[1])}</div><div class="where">${where}</div></div></div>`;
  if (STYLE === 'street') return `<div class="occbig street"><div class="tape"></div><div class="in"><span class="sym">${ALERT_ICON[k]}</span><div><span class="tag">Occhio!</span><div class="lab ${labSize(lab[1])}">${esc(lab[1])}</div><div class="where">${where}</div></div></div></div>`;
  if (STYLE === 'chat') return `<div class="occbig chat"><span class="ava">👀</span><div class="bub"><div class="lab">Oh, ${esc(lab.join(' ').toLowerCase())} ${EMOJI[k]}</div><div class="where">${where}</div></div></div>`;
  return `<div class="occbig"><span class="sym">${ALERT_ICON[k]}</span><div><div class="pre">${esc(lab[0])}</div><div class="lab ${labSize(lab[1])}">${esc(lab[1])}</div><div class="where">${where}</div></div></div>`;
}
function stripCard(k, dist, name) {
  const lab = SOLO ? ['Occhio', ''] : ALERT_LABEL[k];
  if (STYLE === 'sticker') return `<div class="occ sticker"><span class="emo">${EMOJI[k]}</span><div><b>occhio ${esc(lab[0].split(' ').slice(1).join(' '))} ${esc(lab[1])} · ${dist}</b>${name}</div></div>`;
  if (STYLE === 'street') return `<div class="occ street"><span class="sym">${ALERT_ICON[k]}</span><div><b>${esc(lab[1] || 'Occhio!')} · ${dist}</b>${name}</div></div>`;
  if (STYLE === 'chat') return `<div class="occ chat"><span class="emo">👀</span><div><b>${esc(lab.join(' ').toLowerCase())} · ${dist}</b>${name}</div></div>`;
  return `<div class="occ"><span class="sym">${ALERT_ICON[k]}</span><div><b>${esc(lab.join(' ').trim())} · ${dist}</b>${name}</div></div>`;
}

// --- avviso per chi guida: poche parole grandi, un simbolo, tutto lo schermo che si accende
// [riga piccola, parola grande]: si legge "Occhio ai pedoni", con la parola chiave in evidenza
const ALERT_LABEL = { auto: ['Occhio alle', 'macchine'], ped: ['Occhio ai', 'pedoni'], buche: ['Occhio alle', 'buche'] };
// la parola grande si rimpicciolisce quanto basta per stare su una riga
const labSize = t => { const w = Math.max(...t.split(' ').map(x => x.length)); return w <= 7 ? '' : w <= 10 ? 'm' : 's'; };
const ALERT_ICON = {
  auto: '<svg viewBox="0 0 24 24"><path d="M18.920 6.010C18.720 5.420 18.160 5 17.500 5h-11c-.660 0-1.210.420-1.420 1.010L3 12v8c0 .550.450 1 1 1h1c.550 0 1-.450 1-1v-1h12v1c0 .550.450 1 1 1h1c.550 0 1-.450 1-1v-8l-2.080-5.990zM6.500 16c-.830 0-1.500-.670-1.500-1.500S5.670 13 6.500 13s1.500.670 1.500 1.500S7.330 16 6.500 16zm11 0c-.830 0-1.500-.670-1.500-1.500s.670-1.500 1.500-1.500 1.500.670 1.500 1.500-.670 1.500-1.500 1.500zM5 11l1.500-4.500h11L19 11H5z"/></svg>',
  ped: '<svg viewBox="0 0 24 24"><path d="M13.500 5.500c1.100 0 2-.900 2-2s-.900-2-2-2-2 .900-2 2 .900 2 2 2zM9.800 8.900L7 23h2.100l1.800-8 2.100 2v6h2v-7.500l-2.100-2 .600-3C14.800 12 16.800 13 19 13v-2c-1.900 0-3.500-1-4.300-2.400l-1-1.600c-.400-.600-1-1-1.700-1-.300 0-.500.100-.800.100L6 8.300V13h2V9.600l1.800-.700"/></svg>',
  buche: '<svg viewBox="0 0 24 24"><path fill-rule="evenodd" d="M0.700 13.200a11.300 6.600 0 1 0 22.600 0a11.300 6.600 0 1 0-22.600 0zM2.800 12.200a9.200 4.500 0 1 0 18.400 0a9.200 4.500 0 1 0-18.400 0z"/></svg>',
};
const flashEl = document.body.appendChild(Object.assign(document.createElement('div'), { id: 'flash' }));
function flashScreen() {
  flashEl.classList.remove('go'); void flashEl.offsetWidth; flashEl.classList.add('go');
  try { if (navigator.vibrate) navigator.vibrate([250, 120, 250]); } catch (e) { /* non tutti i telefoni vibrano dal browser */ }
}
let alertingNow = false;
function setAlerting(on) {
  if (on === alertingNow) return;
  alertingNow = on;
  document.body.classList.toggle('alerting', on);
  try { if (NATIVE && NATIVE.bright) NATIVE.bright(on); } catch (e) { /* versione dell'app senza questa funzione */ }
}
function navBarHtml() {
  return `<div class="navbar"><div class="eta" id="eta"></div>
    ${S.nav && S.nav.sim ? '<button class="btn ghost" type="button" data-act="skip" aria-label="Salta al prossimo avviso">⏭</button>' : ''}
    <button class="btn ghost" type="button" data-act="mute" aria-label="Voce">${S.mute ? ICON.mute : ICON.vol}</button>
    <button class="btn danger" type="button" data-act="exit">Esci</button></div>`;
}
function finishNav() {
  const n = S.nav; n.done = true;
  if (watchId !== null) { navigator.geolocation.clearWatch(watchId); watchId = null; }
  const got = zones(n.r).length, fast = zones(S.routes.fast).length, card = $('#navcard');
  const cmp = S.sel === 'safe' && fast > got ? ` Con il percorso più veloce sarebbero stati ${fast}.` : '';
  card.className = '';
  card.innerHTML = `<div class="man done"><div><div class="k">Sei arrivato</div><div class="name">${got === 0 ? 'Nessun tratto critico attraversato.' : got === 1 ? 'Hai attraversato un tratto critico.' : `Hai attraversato ${got} tratti critici.`}${cmp}</div></div></div>`;
  n.key = 'done';
  keepAwake(false);
  setAlerting(false);
  say(`Sei arrivato.${cmp}`);
  const eta = $('#eta'); if (eta) eta.innerHTML = '<b>Arrivato</b><span>Tocca Esci per tornare al percorso</span>';
}

/* tasto indietro di Android: torna true se l'app ha gestito il gesto */
window.occhioBack = () => {
  if (!$('#search').hidden) { closeSearch(); return true; }
  if (S.mode === 'nav') { stopNav(); return true; }
  if (S.mode === 'hot') { setMode(S.prev || 'home'); if (S.routes) fit(); return true; }
  if (S.mode === 'about') { setMode('home'); return true; }
  if (S.mode === 'bg') return false;   // l'app va in secondo piano, gli avvisi restano attivi
  if (S.mode === 'preview') { clearRoutes(); return true; }
  return false;
};

/* tornando nell'app: se gli avvisi si sono fermati da soli, la schermata lo deve dire */
document.addEventListener('visibilitychange', () => {
  if (!NATIVE || document.hidden || S.mode !== 'bg') return;
  if (!NATIVE.isActive()) setMode('preview'); else render();   // il permesso per l'avviso grande può essere cambiato nel frattempo
});

/* ------------------------------------------------------------------ prova degli avvisi */
// Una pagina per vedere e sentire ogni avviso in pochi secondi, senza fare un viaggio.
function provaHtml() {
  const chips = (act, map, cur, name) => `<div class="chips">${Object.keys(map).map(k => `<button class="chip ${k === cur ? 'on' : ''}" type="button" data-act="${act}" data-k="${k}">${esc(name(map[k]))}</button>`).join('')}</div>`;
  const count = {};
  for (const h of S.hot) { const k = phraseKey(h); count[k] = (count[k] || 0) + 1; }
  return `<div class="dhead"><button class="iconbtn" type="button" data-act="home">${ICON.back}</button><div><h2>Prova gli avvisi</h2>
    <p class="sub">Tocca un avviso per vederlo e sentirlo com'è durante il viaggio.</p></div></div>
    <h3>Avvisi</h3>
    ${Object.keys(ALERT_LABEL).map(k => `<button class="demo" type="button" data-act="demo" data-k="${k}"><span class="sym">${ALERT_ICON[k]}</span>
      <span class="hmain"><b>${esc(ALERT_LABEL[k].join(' '))}</b><span>${esc(PHRASES[k])} · ${count[k] || 0} punti</span></span></button>`).join('')}
    ${PROVE.length ? '<h3>Prove di voce</h3>' + PROVE.map(x => `<button class="hrow" type="button" data-act="clip" data-src="${esc(x.f)}"><span class="badge o">▶</span><span class="hmain"><b>${esc(x.t)}</b></span></button>`).join('') : ''}
    <p class="note">Versione ${esc(window.OCCHIO_V || 'locale')}. Voce: ${CLIPS ? 'registrata' : 'del telefono'}.</p>`;
}
let demoT = null;
function demoAlert(k) {
  const card = $('#navcard'), lab = ALERT_LABEL[k];
  clearTimeout(demoT);
  card.hidden = false; card.className = '';
  card.innerHTML = bigCard(k, 'tra 200 m · Via Marmorata');
  flashScreen(); setAlerting(true);
  player.muted = false; sayKind(k);
  demoT = setTimeout(() => {
    card.innerHTML = stripCard(k, '150 m', 'Via Marmorata');
    demoT = setTimeout(endDemoAlert, 3000);
  }, 5000);
}
function endDemoAlert() {
  if (demoT === null) return;
  clearTimeout(demoT); demoT = null;
  if (S.mode !== 'nav') { $('#navcard').hidden = true; setAlerting(false); }
}
// in simulazione: salta a poco prima del prossimo avviso (o della prossima svolta)
function skipAhead() {
  const n = S.nav; if (!n || !n.sim || n.done) return;
  const hot = n.tz.find(z => z.at - 320 > n.s);
  const st = (n.r.steps || []).find(x => x.at - 120 > n.s);
  const target = Math.min(hot ? hot.at - 320 : Infinity, st ? st.at - 120 : Infinity, n.total - 60);
  if (target > n.s) n.s = target;
}

/* avvio */
// Link diretto a un tragitto: ?a=lat,lon,Nome per l'arrivo e, volendo, ?da=lat,lon,Nome per la partenza
// (senza "da" si parte dalla posizione attuale). Con &sim=1 parte subito la simulazione.
const placeFromQS = k => {
  const v = QS.get(k); if (!v) return null;
  const [la, lo, ...n] = v.split(',');
  return isFinite(+la) && isFinite(+lo) ? { name: n.join(',') || 'Punto scelto', lat: +la, lon: +lo } : null;
};
if (placeFromQS('a')) appReady.then(async () => {
  S.to = placeFromQS('a'); S.from = placeFromQS('da');
  if (!S.from) { await locate(false); S.from = myPlace(); }
  if (!S.from) return toast('Consenti la posizione per calcolare il percorso da dove sei');
  await go();
  if (QS.get('sim') && S.routes) startNav(true);
});
if (QS.has('prova')) appReady.then(() => { setMode('prova'); $('#sheet').classList.add('full'); if (ALERT_LABEL[QS.get('demo')]) demoAlert(QS.get('demo')); });
render();
if (navigator.permissions && navigator.permissions.query) {
  navigator.permissions.query({ name: 'geolocation' }).then(p => { if (p.state === 'granted') locate(false); }).catch(() => {});
}
