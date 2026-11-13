// Motore di calcolo dei percorsi: gira in un worker per non bloccare la mappa.
// Carica il grafo stradale con il rischio per tratto e calcola due percorsi:
// il più veloce e quello con meno incidenti registrati entro un limite di tempo in più.

let G, HOT, N, E;
let latD, lonD, deg, okNode;
let off, eFrom, eTo, eSeg, eFwd, eTime, eRisk, eInc;
const segHot = new Map();
const nodeGrid = new Map();
let streets = [];

// velocità medie urbane per classe di strada (km/h), nell'ordine di G.classes
const SPEED = [70, 55, 34, 30, 26, 22, 18, 10, 45, 38, 26, 24, 20];
const FAST_CLASS = new Set([0, 1, 8, 9]);
const GC = 0.003;
const HOT_PENALTY = 6;
const MX = 111320 * Math.cos(41.9 * Math.PI / 180), MY = 110540;

const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const distM = (la1, lo1, la2, lo2) => Math.hypot((lo2 - lo1) * MX, (la2 - la1) * MY);

async function init() {
  const [g, h] = await Promise.all([
    fetch('data/graph.json').then(r => r.json()),
    fetch('data/hotspots.json').then(r => r.json()),
  ]);
  G = g; HOT = h.items;
  N = G.lat.length; E = G.a.length;
  latD = new Float64Array(N); lonD = new Float64Array(N);
  for (let i = 0; i < N; i++) { latD[i] = G.lat[i] / 1e5; lonD[i] = G.lon[i] / 1e5; }
  deg = new Uint16Array(N); okNode = new Uint8Array(N);
  const cnt = new Int32Array(N + 1);
  for (let i = 0; i < E; i++) {
    const a = G.a[i], b = G.b[i];
    deg[a]++; deg[b]++;
    cnt[a]++; if (!G.ow[i]) cnt[b]++;
    if (!FAST_CLASS.has(G.cls[i])) { okNode[a] = 1; okNode[b] = 1; }
  }
  off = new Int32Array(N + 1);
  for (let i = 0; i < N; i++) off[i + 1] = off[i] + cnt[i];
  const M = off[N], pos = off.slice(0, N);
  eFrom = new Int32Array(M); eTo = new Int32Array(M); eSeg = new Int32Array(M); eFwd = new Uint8Array(M);
  eTime = new Float32Array(M); eRisk = new Float32Array(M); eInc = new Uint16Array(M);
  const add = (u, v, i, fwd) => {
    const e = pos[u]++;
    eFrom[e] = u; eTo[e] = v; eSeg[e] = i; eFwd[e] = fwd;
    eTime[e] = G.len[i] / (SPEED[G.cls[i]] / 3.6) + (deg[v] >= 3 ? 5 : 0);
    eRisk[e] = (G.risk[i] + G.nrisk[v]) / 10;
    eInc[e] = G.cnt[i] + G.ncnt[v];
  };
  for (let i = 0; i < E; i++) {
    add(G.a[i], G.b[i], i, 1);
    if (!G.ow[i]) add(G.b[i], G.a[i], i, 0);
  }
  for (let i = 0; i < N; i++) {
    const k = Math.floor(latD[i] / GC) * 100000 + Math.floor(lonD[i] / GC);
    let c = nodeGrid.get(k); if (!c) nodeGrid.set(k, c = []); c.push(i);
  }
  for (const h of HOT) for (const s of h.segs) {
    let c = segHot.get(s); if (!c) segHot.set(s, c = []); c.push(h.id);
  }
  // attraversare un punto critico costa di più, così il percorso prudente li evita davvero
  for (let e = 0; e < M; e++) { const hs = segHot.get(eSeg[e]); if (hs) eRisk[e] += HOT_PENALTY * hs.length; }
  const byName = new Map();
  for (let i = 0; i < E; i++) {
    const n = G.name[i]; if (!n) continue;
    let c = byName.get(n); if (!c) byName.set(n, c = []); c.push(i);
  }
  for (const [n, segs] of byName) {
    const name = G.names[n];
    if (/^[A-Z]{0,3}\s?\d+/.test(name)) continue; // sigle tipo "A90", "SS7"
    const s = segs[segs.length >> 1];
    streets.push({
      name, norm: norm(name),
      lat: (latD[G.a[s]] + latD[G.b[s]]) / 2, lon: (lonD[G.a[s]] + lonD[G.b[s]]) / 2,
    });
  }
  return { meta: G.meta, hotspots: HOT.map(({ segs, ...rest }) => rest), nodes: N, segs: E };
}

function nearest(lat, lon) {
  const cy = Math.floor(lat / GC), cx = Math.floor(lon / GC);
  let best = -1, bd = Infinity;
  for (let r = 0; r <= 8; r++) {
    for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
      if (Math.max(Math.abs(y - cy), Math.abs(x - cx)) !== r) continue;
      const c = nodeGrid.get(y * 100000 + x); if (!c) continue;
      for (const i of c) {
        if (!okNode[i]) continue;
        const d = distM(lat, lon, latD[i], lonD[i]);
        if (d < bd) { bd = d; best = i; }
      }
    }
    if (best >= 0 && bd < r * GC * MX) break;
  }
  return { node: best, dist: bd };
}

function dijkstra(src, dst, beta) {
  const dist = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1);
  const hk = [0], hv = [src]; dist[src] = 0;
  while (hk.length) {
    const d = hk[0], u = hv[0];
    const lk = hk.pop(), lv = hv.pop();
    if (hk.length) {
      let i = 0; const n = hk.length;
      for (;;) {
        let c = 2 * i + 1; if (c >= n) break;
        if (c + 1 < n && hk[c + 1] < hk[c]) c++;
        if (hk[c] >= lk) break;
        hk[i] = hk[c]; hv[i] = hv[c]; i = c;
      }
      hk[i] = lk; hv[i] = lv;
    }
    if (d > dist[u]) continue;
    if (u === dst) break;
    for (let e = off[u]; e < off[u + 1]; e++) {
      const v = eTo[e], nd = d + eTime[e] + beta * eRisk[e];
      if (nd < dist[v]) {
        dist[v] = nd; prev[v] = e;
        let i = hk.length; hk.push(nd); hv.push(v);
        while (i > 0) {
          const p = (i - 1) >> 1; if (hk[p] <= nd) break;
          hk[i] = hk[p]; hv[i] = hv[p]; i = p;
        }
        hk[i] = nd; hv[i] = v;
      }
    }
  }
  if (dist[dst] === Infinity) return null;
  const edges = [];
  for (let v = dst; v !== src;) { const e = prev[v]; edges.push(e); v = eFrom[e]; }
  return edges.reverse();
}

function describe(edges) {
  const coords = [], cum = [];
  let time = 0, len = 0, inc = 0, risk = 0, run = 0;
  const nameLen = new Map(), cand = new Set();
  const push = (lo, la) => {
    if (coords.length) {
      const p = coords[coords.length - 1];
      if (p[0] === lo && p[1] === la) return;
      run += distM(p[1], p[0], la, lo);
    }
    coords.push([lo, la]); cum.push(run);
  };
  for (const e of edges) {
    const s = eSeg[e], u = eFrom[e], v = eTo[e];
    push(lonD[u], latD[u]);
    const g0 = G.goff[s], g1 = G.goff[s + 1];
    if (eFwd[e]) for (let k = g0; k < g1; k += 2) push(G.geom[k + 1] / 1e5, G.geom[k] / 1e5);
    else for (let k = g1 - 2; k >= g0; k -= 2) push(G.geom[k + 1] / 1e5, G.geom[k] / 1e5);
    push(lonD[v], latD[v]);
    time += eTime[e]; len += G.len[s]; inc += eInc[e]; risk += eRisk[e];
    if (G.name[s]) nameLen.set(G.name[s], (nameLen.get(G.name[s]) || 0) + G.len[s]);
    const hs = segHot.get(s); if (hs) for (const h of hs) cand.add(h);
  }
  const hot = [];
  for (const id of cand) {
    const h = HOT[id];
    let bi = 0, bd = Infinity;
    for (let i = 0; i < coords.length; i++) {
      const d = distM(h.lat, h.lon, coords[i][1], coords[i][0]);
      if (d < bd) { bd = d; bi = i; }
    }
    if (bd <= 60) hot.push({ id, at: Math.round(cum[bi]) });
  }
  hot.sort((a, b) => a.at - b.at);
  const via = [...nameLen.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(x => G.names[x[0]]);
  return { coords, time: Math.round(time), dist: Math.round(len), inc, risk: Math.round(risk), hot, via, key: edges.length + ':' + Math.round(len) };
}

function route(from, to) {
  const a = nearest(from[1], from[0]), b = nearest(to[1], to[0]);
  if (a.node < 0 || b.node < 0 || a.dist > 1500 || b.dist > 1500) return { error: 'fuori' };
  if (a.node === b.node) return { error: 'vicino' };
  const fe = dijkstra(a.node, b.node, 0);
  if (!fe) return { error: 'nessuno' };
  const fast = describe(fe);
  // Il percorso prudente è quello con meno incidenti registrati e meno punti critici,
  // purché non costi più del 30% di tempo (+1 min) né più del 40% di strada.
  const score = r => r.inc + 6 * r.hot.length;
  let safe = null;
  for (const beta of [0.3, 0.6, 1, 2, 4, 8, 16]) {
    const e = dijkstra(a.node, b.node, beta); if (!e) continue;
    const r = describe(e);
    if (r.time > fast.time * 1.3 + 60 || r.dist > fast.dist * 1.4 + 300) continue;
    if (r.hot.length > fast.hot.length) continue;
    if (!safe || score(r) < score(safe)) safe = r;
  }
  const same = !safe || safe.key === fast.key || score(safe) > score(fast) * 0.88;
  return { fast, safe: same ? null : safe };
}

function searchStreets(q) {
  const toks = norm(q).split(' ').filter(Boolean);
  if (!toks.length) return [];
  const qn = toks.join(' ');
  const out = [];
  for (const s of streets) {
    let ok = true;
    for (const t of toks) if (!s.norm.includes(t)) { ok = false; break; }
    if (!ok) continue;
    const words = s.norm.split(' ');
    const score = (s.norm.startsWith(qn) ? 0 : 40) + (words.some(w => w.startsWith(toks[0])) ? 0 : 20) + s.norm.length * 0.3;
    out.push({ score, s });
  }
  out.sort((a, b) => a.score - b.score);
  return out.slice(0, 6).map(o => ({ name: o.s.name, sub: 'Roma', lat: o.s.lat, lon: o.s.lon }));
}

let ready = null;
self.onmessage = async ev => {
  const { id, type, p } = ev.data;
  try {
    if (type === 'init') { ready = init(); self.postMessage({ id, r: await ready }); return; }
    await ready;
    if (type === 'route') self.postMessage({ id, r: route(p.from, p.to) });
    else if (type === 'streets') self.postMessage({ id, r: searchStreets(p.q) });
  } catch (err) {
    self.postMessage({ id, err: String(err && err.message || err) });
  }
};
