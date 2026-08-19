'use strict';
/* NEOCIV — a Civilization tribute built by a harsh-critic agent loop.
   Copyright (C) 2026 Melvin Carvalho — AGPL-3.0-or-later.
   Original worlds, names and rules-in-miniature; Sid Meier's Civilization
   (MicroProse, 1991) is copyrighted, and revered here. */

// ------------------------------ seeded RNG ------------------------------
let _s = 1;
function srand(s) { _s = (s >>> 0) || 1; }
function rand() { _s ^= _s << 13; _s >>>= 0; _s ^= _s >>> 17; _s ^= _s << 5; _s >>>= 0; return _s / 4294967296; }
function ri(n) { return Math.floor(rand() * n); }
// pure hash — render-side jitter only, never the sim stream
function hash32(a, b, c) {
  let h = 2166136261 >>> 0; const str = a + '|' + b + '|' + (c || 0);
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h / 4294967296;
}

// ------------------------------ world ------------------------------
const MW = 44, MH = 30;
const OCEAN = 0, GRASS = 1, PLAINS = 2, FOREST = 3, HILLS = 4, MOUNT = 5, DESERT = 6;
const TNAME = ['OCEAN', 'GRASSLAND', 'PLAINS', 'FOREST', 'HILLS', 'MOUNTAINS', 'DESERT'];
const TY = [[1, 0, 2], [2, 1, 1], [1, 1, 1], [1, 2, 0], [1, 2, 0], [0, 1, 0], [0, 1, 1]]; // food, shields, trade
const DIRS8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
function inb(x, y) { return x >= 0 && y >= 0 && x < MW && y < MH; }

function genMap(seed) {
  for (let tries = 0; tries < 240; tries++) {
    srand((seed + tries * 7919) >>> 0);
    const t = new Uint8Array(MW * MH); // all ocean
    const target = Math.floor(MW * MH * 0.42);
    let land = 0;
    for (let w = 0; w < 6; w++) {
      let x = 6 + ri(MW - 12), y = 4 + ri(MH - 8);
      let steps = 0;
      while (land < target * (w + 1) / 6 && steps++ < 4000) {
        if (x >= 1 && x <= MW - 2 && y >= 1 && y <= MH - 2 && t[y * MW + x] === OCEAN) { t[y * MW + x] = GRASS; land++; }
        x += ri(3) - 1; y += ri(3) - 1;
        if (x < 1 || x > MW - 2 || y < 1 || y > MH - 2) { x = 6 + ri(MW - 12); y = 4 + ri(MH - 8); }
      }
    }
    for (let i = 0; i < MW * MH; i++) {
      if (t[i] !== GRASS) continue;
      const r = rand();
      t[i] = r < 0.34 ? GRASS : r < 0.55 ? PLAINS : r < 0.71 ? FOREST : r < 0.83 ? HILLS : r < 0.92 ? DESERT : MOUNT;
    }
    // largest land component, then the two farthest-apart tiles in it
    const comp = new Int16Array(MW * MH).fill(-1); let best = -1, bestN = 0, nc = 0;
    for (let i = 0; i < MW * MH; i++) {
      if (t[i] === OCEAN || comp[i] >= 0) continue;
      const q = [i]; comp[i] = nc; let n = 0;
      while (q.length) {
        const j = q.pop(); n++;
        const jx = j % MW, jy = (j / MW) | 0;
        for (const [dx, dy] of DIRS8) {
          const x = jx + dx, y = jy + dy;
          if (inb(x, y) && t[y * MW + x] !== OCEAN && comp[y * MW + x] < 0) { comp[y * MW + x] = nc; q.push(y * MW + x); }
        }
      }
      if (n > bestN) { bestN = n; best = nc; } nc++;
    }
    const distFrom = (si) => {
      const dist = new Int16Array(MW * MH).fill(-1); dist[si] = 0;
      const q = [si];
      for (let h = 0; h < q.length; h++) {
        const j = q[h], jx = j % MW, jy = (j / MW) | 0;
        for (const [dx, dy] of DIRS8) {
          const x = jx + dx, y = jy + dy;
          if (inb(x, y) && t[y * MW + x] !== OCEAN && dist[y * MW + x] < 0) { dist[y * MW + x] = dist[j] + 1; q.push(y * MW + x); }
        }
      }
      return dist;
    };
    // capitals: the most distant pair among INTERIOR tiles — peninsula tips are pocket starts
    const room = (s) => {
      const sx = s % MW, sy = (s / MW) | 0; let n = 0;
      for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) {
        const x = sx + dx, y = sy + dy;
        if (inb(x, y) && t[y * MW + x] !== OCEAN) n++;
      }
      return n;
    };
    if (bestN < 300) continue;
    let seed0 = -1;
    for (let i = 0; i < MW * MH; i++) if (comp[i] === best) { seed0 = i; break; }
    if (seed0 < 0) continue;
    const d0 = distFrom(seed0);
    let A = -1, bd = -1;
    for (let i = 0; i < MW * MH; i++)
      if (comp[i] === best && d0[i] >= 0 && room(i) >= 90 && d0[i] > bd) { bd = d0[i]; A = i; }
    if (A < 0) continue;
    const dA = distFrom(A);
    let B = -1; bd = -1;
    for (let i = 0; i < MW * MH; i++)
      if (comp[i] === best && dA[i] >= 0 && room(i) >= 90 && dA[i] > bd) { bd = dA[i]; B = i; }
    if (B < 0 || dA[B] < 14) continue;
    // guarantee fertile capitals
    for (const s of [A, B]) {
      t[s] = GRASS;
      const sx = s % MW, sy = (s / MW) | 0; let g = 0;
      for (const [dx, dy] of DIRS8) {
        const x = sx + dx, y = sy + dy;
        if (!inb(x, y)) continue;
        if (t[y * MW + x] === GRASS) g++;
        else if (g < 3 && t[y * MW + x] !== OCEAN) { t[y * MW + x] = GRASS; g++; }
      }
    }
    return { t, ax: A % MW, ay: (A / MW) | 0, bx: B % MW, by: (B / MW) | 0 };
  }
  throw new Error('mapgen failed');
}

// ------------------------------ rules ------------------------------
const UT = {
  settler:  { cost: 30, a: 0, d: 1, name: 'SETTLER',  glyph: 'S' },
  warrior:  { cost: 10, a: 1, d: 1, name: 'WARRIOR',  glyph: 'W' },
  phalanx:  { cost: 20, a: 1, d: 2, name: 'PHALANX',  glyph: 'P', tech: 'bronze' },
  legion:   { cost: 25, a: 4, d: 2, name: 'LEGION',   glyph: 'L', tech: 'iron' },
  catapult: { cost: 40, a: 6, d: 1, name: 'CATAPULT', glyph: 'C', tech: 'math' },
};
const BT = {
  granary:  { cost: 30,  tech: 'pottery',    name: 'GRANARY' },
  barracks: { cost: 30,  tech: 'bronze',     name: 'BARRACKS' },
  walls:    { cost: 40,  tech: 'masonry',    name: 'CITY WALLS' },
  library:  { cost: 50,  tech: 'writing',    name: 'LIBRARY' },
  market:   { cost: 50,  tech: 'currency',   name: 'MARKETPLACE' },
  beacon:   { cost: 200, tech: 'navigation', name: 'GREAT BEACON', wonder: true },
};
const TECHS = {
  alphabet:   { cost: 30,  req: [] },
  pottery:    { cost: 35,  req: [] },
  bronze:     { cost: 45,  req: [] },
  masonry:    { cost: 45,  req: [] },
  writing:    { cost: 70,  req: ['alphabet'] },
  currency:   { cost: 70,  req: ['bronze'] },
  iron:       { cost: 90,  req: ['bronze'] },
  math:       { cost: 110, req: ['alphabet', 'masonry'] },
  astronomy:  { cost: 150, req: ['writing', 'math'] },
  navigation: { cost: 200, req: ['astronomy', 'currency'] },
};
const TECH_ORDER = Object.keys(TECHS);
const CITY_NAMES = [
  ['LUX PRIMA', 'AUREN', 'SOLIS', 'VELA', 'HELION', 'CYRA', 'LYRA', 'NOVA', 'ARGENT', 'CANDESA'],
  ['UMBRA', 'NOCTIS', 'KAAL', 'VANTH', 'MORROW', 'ASHEN', 'GRIMHOLD', 'DUSK', 'RAVEN', 'PYRRHA'],
];

let G = null;

function newGame(seed, opts) {
  opts = opts || {};
  const m = genMap(seed);
  srand((seed ^ 0xC1F) >>> 0); // sim stream, distinct from mapgen
  G = {
    seed, map: m.t, turn: 1, time: 0, screen: 'map',
    civs: [
      { id: 0, name: 'LUMEN', col: '#3ef0ff', dim: '#12525e', techs: {}, beakers: 0, res: null, gold: 0, nameIdx: 0, prodBonus: 1, atWar: false, target: -1 },
      { id: 1, name: 'UMBRA', col: '#ff8a3e', dim: '#5e3512', techs: {}, beakers: 0, res: null, gold: 0, nameIdx: 0, prodBonus: 1, atWar: false, target: -1 },
    ],
    units: [], cities: [], nextId: 1, trails: [], banner: null, inspect: null,
    sel: null, log: [], fx: [], outcome: null, via: null,
    kills: [0, 0], captured: [0, 0], shotMode: false, focusCity: null, muted: false,
  };
  if (!opts.sandbox) {
    spawnUnit(0, 'settler', m.ax, m.ay);
    spawnUnit(1, 'settler', m.bx, m.by);
    G.sel = G.units[0].id;
  }
  return G;
}

function terr(x, y) { return G.map[y * MW + x]; }
function spawnUnit(civ, kind, x, y, vet) {
  const u = { id: G.nextId++, civ, kind, x, y, moves: 1, vet: !!vet, gar: false };
  G.units.push(u); return u;
}
function unitsAt(x, y) { return G.units.filter(u => u.x === x && u.y === y); }
function cityAt(x, y) { return G.cities.find(c => c.x === x && c.y === y) || null; }
function myUnits(cid) { return G.units.filter(u => u.civ === cid); }
function myCities(cid) { return G.cities.filter(c => c.civ === cid); }
function killUnit(u) { const i = G.units.indexOf(u); if (i >= 0) G.units.splice(i, 1); if (G.sel === u.id) G.sel = null; }
function msg(t, kind) { G.log.push({ t, kind: kind || '', T: G.time + 6 }); if (G.log.length > 30) G.log.shift(); }

// ------------------------------ cities ------------------------------
function tileScore(x, y) { const yy = TY[terr(x, y)]; return yy[0] * 3 + yy[1] * 2 + yy[2]; }
function cityTiles(c) {
  const tiles = [[c.x, c.y]]; const nb = [];
  for (const [dx, dy] of DIRS8) { const x = c.x + dx, y = c.y + dy; if (inb(x, y)) nb.push([x, y]); }
  nb.sort((p, q) => tileScore(q[0], q[1]) - tileScore(p[0], p[1]) || (p[1] * MW + p[0]) - (q[1] * MW + q[0]));
  for (let i = 0; i < Math.min(c.pop, nb.length); i++) tiles.push(nb[i]);
  return tiles;
}
function cityYields(c) {
  let f = 0, s = 0, tr = 0;
  for (const [x, y] of cityTiles(c)) { const yy = TY[terr(x, y)]; f += yy[0]; s += yy[1]; tr += yy[2]; }
  s = Math.max(s, 1);
  if (c.capital) tr += 2; // the palace
  return { f, s, tr };
}
function canFound(x, y) {
  if (!inb(x, y) || terr(x, y) === OCEAN) return false;
  for (const c of G.cities) if (Math.max(Math.abs(c.x - x), Math.abs(c.y - y)) < 2) return false;
  return true;
}
function foundCity(u) {
  if (u.kind !== 'settler' || !canFound(u.x, u.y)) return null;
  const civ = G.civs[u.civ];
  const c = {
    id: G.nextId++, x: u.x, y: u.y, civ: u.civ,
    name: CITY_NAMES[u.civ][civ.nameIdx++ % CITY_NAMES[u.civ].length],
    pop: 1, food: 0, shields: 0, build: null, bldgs: {},
    capital: myCities(u.civ).length === 0,
  };
  G.cities.push(c); killUnit(u);
  msg(civ.name + ' founds ' + c.name);
  return c;
}
function hasTech(cid, k) { return !k || !!G.civs[cid].techs[k]; }
function canBuild(cid, key) {
  if (UT[key]) return hasTech(cid, UT[key].tech);
  const b = BT[key];
  if (!b || !hasTech(cid, b.tech)) return false;
  if (b.wonder && G.cities.some(c => c.bldgs[key])) return false;
  return true;
}
function setBuild(c, key) {
  if (!key || !canBuild(c.civ, key) || (BT[key] && c.bldgs[key])) return false;
  c.build = { u: !!UT[key], k: key }; return true;
}
function buildCost(b) { return b.u ? UT[b.k].cost : BT[b.k].cost; }
function processCity(c) {
  const civ = G.civs[c.civ];
  const { f, s, tr } = cityYields(c);
  // food box
  const box = c.pop * 10;
  c.food += f - c.pop * 2;
  if (c.food >= box) {
    c.pop++; c.food = c.bldgs.granary ? Math.floor(box / 2) : c.food - box;
    if (c.civ === 0) msg(c.name + ' grows to ' + c.pop, 'pop');
  }
  if (c.food < 0) { if (c.pop > 1) { c.pop--; if (c.civ === 0) msg(c.name + ' is starving', 'pop'); } c.food = 0; }
  // shields
  c.shields += Math.ceil(s * civ.prodBonus);
  if (c.build) {
    const cost = buildCost(c.build);
    const holdSettler = c.build.u && c.build.k === 'settler' && c.pop < 2;
    if (c.shields >= cost && !holdSettler) {
      c.shields -= cost;
      if (c.build.u) {
        const vet = !!c.bldgs.barracks && c.build.k !== 'settler';
        spawnUnit(c.civ, c.build.k, c.x, c.y, vet);
        if (c.build.k === 'settler') c.pop--;
      } else {
        c.bldgs[c.build.k] = true;
        if (c.civ === 0) msg(c.name + ' builds ' + BT[c.build.k].name);
        if (c.build.k === 'beacon') { G.outcome = c.civ === 0 ? 'WON' : 'LOST'; G.via = 'beacon'; }
      }
      c.build = null;
    }
  }
  // trade → science + gold
  let sci = tr; if (c.bldgs.library) sci = Math.ceil(sci * 1.5);
  civ.beakers += sci;
  let g = Math.ceil(tr / 2); if (c.bldgs.market) g = Math.ceil(g * 1.5);
  civ.gold += g;
}
function setResearch(cid, key) {
  const civ = G.civs[cid], t = TECHS[key];
  if (!t || civ.techs[key] || t.req.some(r => !civ.techs[r])) return false;
  civ.res = key; return true;
}
function checkResearch(cid) {
  const civ = G.civs[cid];
  if (!civ.res) return;
  if (civ.beakers >= TECHS[civ.res].cost) {
    civ.beakers -= TECHS[civ.res].cost;
    civ.techs[civ.res] = true;
    if (cid === 0) {
      msg('Discovered ' + civ.res.toUpperCase(), 'tech');
      G.banner = { txt: civ.res.toUpperCase(), t: G.time, col: '#7fd0ff' };
    }
    civ.res = null;
  }
}

// ------------------------------ combat ------------------------------
function defStrength(u, x, y) {
  let d = UT[u.kind].d * (u.vet ? 1.5 : 1);
  const t = terr(x, y);
  if (t === HILLS) d *= 1.5; else if (t === FOREST) d *= 1.25; else if (t === MOUNT) d *= 2;
  const c = cityAt(x, y);
  if (c) d *= c.bldgs.walls ? 3 : 1.25;
  return d;
}
function battle(a, d) { return rand() * (a + d) < a; }
function attackTile(u, x, y) {
  const foes = unitsAt(x, y).filter(v => v.civ !== u.civ);
  if (!foes.length || UT[u.kind].a === 0) return false;
  let best = foes[0];
  for (const v of foes) if (defStrength(v, x, y) > defStrength(best, x, y)) best = v;
  const a = UT[u.kind].a * (u.vet ? 1.5 : 1);
  const d = defStrength(best, x, y);
  u.moves = 0;
  const win = battle(a, d);
  addFx(x, y, win, u.civ, win ? UT[best.kind].name + ' FALLS' : UT[u.kind].name + ' REPELLED');
  if (win) {
    if (cityAt(x, y)) killUnit(best);           // city: only the top defender falls
    else for (const v of foes) killUnit(v);      // open field: the whole stack is lost (1991 rule)
    G.kills[u.civ] += cityAt(x, y) ? 1 : foes.length;
  } else {
    killUnit(u);
    G.kills[best.civ]++;
  }
  checkVictory();
  return true;
}
function captureCity(c, cid) {
  c.civ = cid; c.pop = Math.max(1, c.pop - 1); c.build = null; c.capital = false;
  G.captured[cid]++;
  msg(G.civs[cid].name + ' captures ' + c.name + '!', 'war');
  G.banner = { txt: cid === 0 ? c.name + ' FALLS' : c.name + ' IS LOST', t: G.time, col: cid === 0 ? '#ffe14a' : '#ff6a7e' };
  checkVictory();
}
function tryMove(u, dx, dy) {
  if (!u.moves || G.outcome) return false;
  const nx = u.x + dx, ny = u.y + dy;
  if (!inb(nx, ny) || terr(nx, ny) === OCEAN) return false;
  const foes = unitsAt(nx, ny).filter(v => v.civ !== u.civ);
  if (foes.length) return attackTile(u, nx, ny);
  const c = cityAt(nx, ny);
  if (c && c.civ !== u.civ) {
    if (UT[u.kind].a === 0) return false; // settlers cannot take cities
    u.x = nx; u.y = ny; u.moves = 0;
    captureCity(c, u.civ);
    return true;
  }
  const queued = G.trails.filter(q => q.t >= G.time).length;
  G.trails.push({ fx: u.x, fy: u.y, tx: nx, ty: ny, civ: u.civ, t: G.time + queued * 0.05 });
  if (G.trails.length > 80) G.trails.shift();
  u.x = nx; u.y = ny; u.moves--;
  return true;
}
function checkVictory() {
  if (G.outcome) return;
  for (const cid of [0, 1]) {
    const alive = myCities(cid).length + myUnits(cid).filter(u => u.kind === 'settler').length;
    if (alive === 0 && G.turn > 1) {
      G.outcome = cid === 0 ? 'LOST' : 'WON'; G.via = 'conquest';
      G.screen = 'end';
    }
  }
}

// ------------------------------ pathing ------------------------------
function bfsNext(sx, sy, tx, ty, cid) {
  if (sx === tx && sy === ty) return null;
  const prev = new Int32Array(MW * MH).fill(-2);
  prev[ty * MW + tx] = -1; // search backwards from target so the first step pops out directly
  const q = [ty * MW + tx];
  for (let h = 0; h < q.length; h++) {
    const j = q[h], jx = j % MW, jy = (j / MW) | 0;
    for (const [dx, dy] of DIRS8) {
      const x = jx + dx, y = jy + dy;
      if (!inb(x, y) || terr(x, y) === OCEAN || prev[y * MW + x] !== -2) continue;
      const hostile = unitsAt(x, y).some(v => v.civ !== cid) || (cityAt(x, y) && cityAt(x, y).civ !== cid);
      if (hostile && !(x === sx && y === sy)) continue;
      prev[y * MW + x] = j;
      if (x === sx && y === sy) {
        return { dx: jx - sx, dy: jy - sy, dist: 0 };
      }
      q.push(y * MW + x);
    }
  }
  return null;
}

// ------------------------------ shared civ policy (AI + bots) ------------------------------
function garrisonNeed(c) { return 2; }
function assignRoles(cid) {
  for (const u of myUnits(cid)) u.gar = false;
  for (const c of myCities(cid)) {
    const here = unitsAt(c.x, c.y).filter(u => u.civ === cid && (u.kind === 'phalanx' || u.kind === 'warrior'));
    here.sort((a, b) => UT[b.kind].d - UT[a.kind].d);
    let n = Math.min(garrisonNeed(c), here.length);
    for (let i = 0; i < n; i++) here[i].gar = true;
    if (n === 0) { // a fresh conquest: one attacker holds the walls until a phalanx is raised
      const any = unitsAt(c.x, c.y).find(u => u.civ === cid && u.kind !== 'settler');
      if (any) { any.gar = true; }
    }
  }
}
function garrisonCount(c) {
  return unitsAt(c.x, c.y).filter(u => u.civ === c.civ && u.gar).length;
}
function bestSite(cid) {
  let best = null, bs = -1;
  for (let y = 1; y < MH - 1; y++) for (let x = 1; x < MW - 1; x++) {
    if (!canFound(x, y)) continue;
    let sc = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++)
      if (inb(x + dx, y + dy)) sc += tileScore(x + dx, y + dy);
    const cap = myCities(cid)[0];
    if (cap) sc -= Math.max(Math.abs(cap.x - x), Math.abs(cap.y - y)) * 1.5;
    if (sc > bs) { bs = sc; best = { x, y }; }
  }
  return best;
}
function chooseBuild(c, cid, o) {
  const bestD = canBuild(cid, 'phalanx') ? 'phalanx' : 'warrior';
  if (garrisonCount(c) < garrisonNeed(c)) return bestD;
  const nC = myCities(cid).length;
  const settlers = myUnits(cid).filter(u => u.kind === 'settler').length;
  if (o.expand && nC < o.maxCities && settlers < 2 && c.pop >= 2 && G.turn < (o.expandUntil || 48)) return 'settler';
  if (!c.bldgs.walls && canBuild(cid, 'walls')) return 'walls';
  if (o.attack && o.barracks !== false && !c.bldgs.barracks && canBuild(cid, 'barracks')) return 'barracks';
  if (o.rearEcon) { // rear cities feed the war with science and gold, not bodies
    const ec = myCities(1 - cid);
    let d = 1e9;
    for (const e of ec) d = Math.min(d, Math.max(Math.abs(e.x - c.x), Math.abs(e.y - c.y)));
    if (ec.length && d > 8) {
      if (!c.bldgs.library && canBuild(cid, 'library')) return 'library';
      if (!c.bldgs.market && canBuild(cid, 'market')) return 'market';
    }
  }
  if (o.attack && canBuild(cid, 'legion')) {
    const field = fieldArmy(cid, o);
    const cats = field.filter(u => u.kind === 'catapult').length;
    if (canBuild(cid, 'catapult') && cats * 2 < field.length) return 'catapult';
    return 'legion';
  }
  if (!c.bldgs.granary && canBuild(cid, 'granary')) return 'granary';
  if (!c.bldgs.library && canBuild(cid, 'library')) return 'library';
  if (!c.bldgs.market && canBuild(cid, 'market')) return 'market';
  if (o.beacon && canBuild(cid, 'beacon')) return 'beacon';
  return bestD;
}
function fieldArmy(cid, o) {
  const kinds = o.atkKinds || ['legion', 'catapult'];
  return myUnits(cid).filter(u => !u.gar && kinds.includes(u.kind));
}
function civPolicy(cid, o) {
  const civ = G.civs[cid];
  if (o.science && !civ.res) {
    let pick = null;
    if (o.resOrder) pick = o.resOrder.find(k => !civ.techs[k] && !TECHS[k].req.some(r => !civ.techs[r]));
    if (!pick) pick = TECH_ORDER.filter(k => !civ.techs[k] && !TECHS[k].req.some(r => !civ.techs[r]))
      .sort((a, b) => TECHS[a].cost - TECHS[b].cost)[0];
    if (pick) civ.res = pick;
  }
  assignRoles(cid);
  // cities: keep a defender queued the moment a garrison dies
  for (const c of myCities(cid)) {
    if (garrisonCount(c) === 0) {
      const bestD = canBuild(cid, 'phalanx') ? 'phalanx' : 'warrior';
      if (!c.build || !c.build.u || (c.build.k !== 'warrior' && c.build.k !== 'phalanx')) setBuild(c, bestD);
    } else if (!c.build) setBuild(c, chooseBuild(c, cid, o));
  }
  // settlers
  for (const u of myUnits(cid)) {
    if (u.kind !== 'settler' || !u.moves) continue;
    if (myCities(cid).length === 0) {
      if (!foundCity(u)) {
        const site = bestSite(cid);
        if (site) { const st = bfsNext(u.x, u.y, site.x, site.y, cid); if (st) tryMove(u, st.dx, st.dy); }
      }
      continue;
    }
    if (!o.expand) { u.moves = 0; continue; }
    if (canFound(u.x, u.y) && bestSiteIsHere(u, cid)) { foundCity(u); continue; }
    const site = bestSite(cid);
    if (!site) { u.moves = 0; continue; }
    if (u.x === site.x && u.y === site.y) { foundCity(u); continue; }
    const step = bfsNext(u.x, u.y, site.x, site.y, cid);
    if (step) tryMove(u, step.dx, step.dy); else u.moves = 0;
  }
  // standing doctrine: the field army always punishes adjacent invaders, war or no war
  const field = fieldArmy(cid, o);
  const homeland = (x, y) => myCities(cid).some(c => Math.max(Math.abs(c.x - x), Math.abs(c.y - y)) <= 3);
  for (const u of field) {
    if (!u.moves || G.outcome) continue;
    let bt = null, bp = -1;
    for (const [dx, dy] of DIRS8) {
      const x = u.x + dx, y = u.y + dy;
      if (!inb(x, y) || !homeland(x, y)) continue;
      const foes = unitsAt(x, y).filter(v => v.civ !== cid);
      if (!foes.length) continue;
      const dS = Math.max(...foes.map(v => defStrength(v, x, y)));
      const p = (UT[u.kind].a * (u.vet ? 1.5 : 1)) / (UT[u.kind].a * (u.vet ? 1.5 : 1) + dS);
      if (p > bp) { bp = p; bt = { dx, dy }; }
    }
    if (bt && bp >= (o.pMin || 0.3)) tryMove(u, bt.dx, bt.dy);
  }
  if (o.attack) {
    const foesCities = myCities(1 - cid);
    const undefended = foesCities.some(c => unitsAt(c.x, c.y).every(v => v.civ === cid));
    const cats = field.filter(u => u.kind === 'catapult').length;
    if (!civ.atWar && ((field.length >= o.warAt && cats >= (o.catReq || 0)) || (undefended && field.length >= 2))) civ.atWar = true;
    if (civ.atWar && !foesCities.length) {
      // no cities left: hunt the last settlers so the conquest can end
      for (const u of field) {
        if (!u.moves || G.outcome) continue;
        const prey = myUnits(1 - cid)[0];
        if (!prey) break;
        if (Math.max(Math.abs(prey.x - u.x), Math.abs(prey.y - u.y)) <= 1) { tryMove(u, prey.x - u.x, prey.y - u.y); continue; }
        const st = bfsNext(u.x, u.y, prey.x, prey.y, cid);
        if (st) tryMove(u, st.dx, st.dy); else u.moves = 0;
      }
    }
    if (civ.atWar && foesCities.length) {
      const cap = myCities(cid)[0];
      let tgt = foesCities[0];
      if (cap) for (const c of foesCities)
        if (Math.max(Math.abs(c.x - cap.x), Math.abs(c.y - cap.y)) < Math.max(Math.abs(tgt.x - cap.x), Math.abs(tgt.y - cap.y))) tgt = c;
      if (civ.tgtId !== tgt.id) { civ.tgtId = tgt.id; for (const v of field) v.sortie = false; }
      for (const u of field) {
        if (!u.moves || G.outcome) continue;
        // adjacent enemy? attack best odds
        let bestT = null, bestP = -1;
        for (const [dx, dy] of DIRS8) {
          const x = u.x + dx, y = u.y + dy;
          if (!inb(x, y)) continue;
          const foes = unitsAt(x, y).filter(v => v.civ !== cid);
          if (!foes.length) {
            const c = cityAt(x, y);
            if (c && c.civ !== cid) { bestT = { dx, dy }; bestP = 2; } // empty enemy city: walk in
            continue;
          }
          const dS = Math.max(...foes.map(v => defStrength(v, x, y)));
          const p = (UT[u.kind].a * (u.vet ? 1.5 : 1)) / (UT[u.kind].a * (u.vet ? 1.5 : 1) + dS);
          if (p > bestP) { bestP = p; bestT = { dx, dy }; }
        }
        if (bestT && bestP >= (o.pMin || 0.3)) { tryMove(u, bestT.dx, bestT.dy); continue; }
        let goal = tgt;
        if (o.sortie && Math.max(Math.abs(tgt.x - u.x), Math.abs(tgt.y - u.y)) > 2 && !u.sortie) {
          // mass inside the forward city — stacks are safe behind walls — then strike as one
          let rally = null, rd = 1e9;
          for (const rc of myCities(cid)) {
            const d = Math.max(Math.abs(tgt.x - rc.x), Math.abs(tgt.y - rc.y));
            if (d < rd) { rd = d; rally = rc; }
          }
          if (rally && rd > 2) {
            const stack = field.filter(v => v.x === rally.x && v.y === rally.y);
            if (stack.length >= Math.min(4, Math.max(2, field.length - 2))) for (const v of stack) v.sortie = true;
            if (!u.sortie) {
              if (u.x === rally.x && u.y === rally.y) { u.moves = 0; continue; }
              goal = rally;
            }
          }
        }
        if (o.muster && Math.max(Math.abs(tgt.x - u.x), Math.abs(tgt.y - u.y)) > 3) {
          let rally = null, rd = 1e9;
          for (const rc of myCities(cid)) {
            const d = Math.max(Math.abs(tgt.x - rc.x), Math.abs(tgt.y - rc.y));
            if (d < rd) { rd = d; rally = rc; }
          }
          if (rally) {
            const atRally = Math.max(Math.abs(rally.x - u.x), Math.abs(rally.y - u.y)) <= 1;
            const massed = field.filter(v => Math.max(Math.abs(rally.x - v.x), Math.abs(rally.y - v.y)) <= 1).length;
            if (!atRally) goal = rally;
            else if (massed < Math.min(4, field.length)) { u.moves = 0; continue; }
          }
        }
        const step = bfsNext(u.x, u.y, goal.x, goal.y, cid);
        if (step) {
          const nx = u.x + step.dx, ny = u.y + step.dy;
          const crowd = unitsAt(nx, ny).filter(v => v.civ === cid).length;
          if (crowd >= 2 && !cityAt(nx, ny)) {
            let alt = null;
            const d0 = Math.max(Math.abs(tgt.x - u.x), Math.abs(tgt.y - u.y));
            for (const [dx, dy] of DIRS8) {
              const x = u.x + dx, y = u.y + dy;
              if (!inb(x, y) || terr(x, y) === OCEAN) continue;
              if (unitsAt(x, y).some(v => v.civ !== cid) || (cityAt(x, y) && cityAt(x, y).civ !== cid)) continue;
              if (unitsAt(x, y).filter(v => v.civ === cid).length >= 2) continue;
              if (Math.max(Math.abs(tgt.x - x), Math.abs(tgt.y - y)) < d0) { alt = { dx, dy }; break; }
            }
            if (alt) { tryMove(u, alt.dx, alt.dy); continue; }
          }
          tryMove(u, step.dx, step.dy);
        } else u.moves = 0;
      }
    }
  }
  // idle military rests in place
  for (const u of myUnits(cid)) if (u.moves && u.kind !== 'settler') u.moves = 0;
}
function bestSiteIsHere(u, cid) {
  const site = bestSite(cid);
  return site && Math.max(Math.abs(site.x - u.x), Math.abs(site.y - u.y)) <= 1;
}

const AI_OPTS = { // UMBRA drills conscripts, not veterans — the drilled army is the player's edge
  science: true, expand: true, maxCities: 5, attack: true, warAt: 6, pMin: 0.3, barracks: false,
  resOrder: ['bronze', 'masonry', 'iron', 'pottery', 'alphabet', 'math', 'writing', 'currency', 'astronomy', 'navigation'],
};
const BOT_OPTS = {
  science: true, expand: true, maxCities: 8, expandUntil: 70, attack: true, warAt: 6, catReq: 1, pMin: 0.4,
  resOrder: ['bronze', 'masonry', 'iron', 'alphabet', 'math', 'pottery', 'writing', 'currency', 'astronomy', 'navigation'],
};

function payUpkeep(cid) {
  const civ = G.civs[cid];
  const exempt = new Set();
  for (const c of myCities(cid)) {
    const here = myUnits(cid).filter(u => u.kind !== 'settler' && u.x === c.x && u.y === c.y);
    for (let i = 0; i < Math.min(2, here.length); i++) exempt.add(here[i].id);
  }
  const mil = () => myUnits(cid).filter(u => u.kind !== 'settler' && !exempt.has(u.id));
  let over = mil().length - (4 + myCities(cid).length);
  if (over <= 0) return;
  civ.gold -= over * 2;
  while (civ.gold < 0 && over > 0) {
    civ.gold += 2; over--;
    const m = mil(); const u = m[m.length - 1];
    if (!u) break;
    if (cid === 0) msg(UT[u.kind].name + ' disbanded — no gold');
    killUnit(u);
  }
  if (civ.gold < 0) civ.gold = 0;
}
function resetMoves(cid) { for (const u of myUnits(cid)) u.moves = 1; }
function endTurn() {
  if (G.outcome) return;
  for (const c of myCities(0)) processCity(c);
  checkResearch(0); payUpkeep(0);
  checkVictory();
  if (!G.outcome) {
    resetMoves(1);
    civPolicy(1, AI_OPTS);
    for (const c of myCities(1)) processCity(c);
    checkResearch(1); payUpkeep(1);
  }
  G.turn++;
  resetMoves(0);
  checkVictory();
}
function yearStr(t) {
  const yr = 4000 - t * 30;
  return yr > 0 ? yr + ' BC' : (-yr + 30) + ' AD';
}

// ------------------------------ verify: empires as theorems ------------------------------
const CAREER_SEED = 19910;
function runCareer(policy, cap, seed) {
  newGame(seed || CAREER_SEED);
  for (let t = 0; t < cap && !G.outcome; t++) {
    if (policy) policy();
    else { const u = myUnits(0).find(v => v.kind === 'settler'); if (u && G.cities.filter(c => c.civ === 0).length === 0) foundCity(u); }
    endTurn();
  }
  return {
    end: G.outcome || 'TIMEOUT', via: G.via, turns: G.turn,
    cities: myCities(0).length, enemyCities: myCities(1).length,
    techs: Object.keys(G.civs[0].techs).length, kills: G.kills[0], losses: G.kills[1],
  };
}
function sandbox(fill) {
  newGame(1, { sandbox: true });
  G.map.fill(fill === undefined ? GRASS : fill);
  return G;
}
function report(mode, ok, extra) {
  const rep = Object.assign({ mode, outcome: ok }, extra || {});
  const s = 'VERIFY:' + JSON.stringify(rep);
  document.title = s;
  const pre = document.createElement('pre'); pre.textContent = s; document.body.appendChild(pre);
}
function runVerify(mode) {
  if (mode === 'debug-solution') {
    newGame(URLSEED);
    const tl = [];
    for (let t = 0; t < 250 && !G.outcome; t++) {
      civPolicy(0, BOT_OPTS);
      endTurn();
      if (G.turn % 10 === 0) tl.push([G.turn, myCities(0).length, myCities(1).length,
        fieldArmy(0, BOT_OPTS).length, myUnits(1).filter(u => ['legion','catapult'].includes(u.kind)).length,
        Object.keys(G.civs[0].techs).length, Object.keys(G.civs[1].techs).length,
        (G.civs[0].atWar?1:0) + (G.civs[1].atWar?2:0), G.kills[0], G.kills[1]]);
    }
    report(mode, G.outcome || 'TIMEOUT', { tl: tl.map(r => r.join(':')).join(' ') });
  } else if (mode === 'solution') {
    const r = runCareer(() => civPolicy(0, BOT_OPTS), 300);
    report(mode, r.end === 'WON' ? 'WON' : 'LOST', r);
  } else if (mode === 'null') {
    const r = runCareer(null, 150);
    report(mode, r.end === 'WON' ? 'WON' : 'LOST', r);
  } else if (mode === 'ablate-science') {
    const o = Object.assign({}, BOT_OPTS, { science: false, atkKinds: ['warrior', 'phalanx'], catReq: 0 });
    const r = runCareer(() => civPolicy(0, o), 250);
    report(mode, r.end === 'WON' ? 'WON' : 'LOST', r);
  } else if (mode === 'ablate-expansion') {
    const o = Object.assign({}, BOT_OPTS, { expand: false, maxCities: 1 });
    const r = runCareer(() => civPolicy(0, o), 250);
    report(mode, r.end === 'WON' ? 'WON' : 'LOST', r);
  } else if (mode === 'solution-seeds') {
    const outs = []; let wins = 0, nullWins = 0;
    for (let i = 0; i < 10; i++) {
      const sd = CAREER_SEED + i * 101;
      const r = runCareer(() => civPolicy(0, BOT_OPTS), 300, sd);
      if (r.end === 'WON') wins++;
      const n = runCareer(null, 150, sd);
      if (n.end === 'WON') nullWins++;
      outs.push(sd + ':' + r.end[0] + n.end[0] + ':' + r.turns);
    }
    const ok = wins >= 7 && nullWins === 0;
    report(mode, ok ? 'SOLVED' : 'FAILED', { wins, nullWins, of: 10, seeds: outs.join(' ') });
  } else if (mode === 'mech-yield') {
    sandbox(GRASS);
    const s = spawnUnit(0, 'settler', 10, 10); const c = foundCity(s);
    const y = cityYields(c);
    const ok = y.f === 4 && y.s === 2 && y.tr === 4; // center + best grass at 2F/1S/1T each; palace +2 trade
    report(mode, ok ? 'SOLVED' : 'FAILED', { f: y.f, s: y.s, tr: y.tr });
  } else if (mode === 'mech-growth') {
    const grow = (granary) => {
      sandbox(GRASS);
      const c = foundCity(spawnUnit(0, 'settler', 10, 10));
      if (granary) c.bldgs.granary = true;
      let t = 0, firstAt = 0;
      while (c.pop < 3 && t < 60) { t++; processCity(c); if (c.pop === 2 && !firstAt) firstAt = t; }
      return { second: t, first: firstAt };
    };
    const plain = grow(false), gran = grow(true);
    const ok = plain.first === 5 && gran.second < plain.second;
    report(mode, ok ? 'SOLVED' : 'FAILED', { firstGrowth: plain.first, second: plain.second, secondWithGranary: gran.second });
  } else if (mode === 'mech-starve') {
    sandbox(DESERT);
    const c = foundCity(spawnUnit(0, 'settler', 10, 10));
    c.pop = 3; c.food = 5;
    let t = 0; while (c.pop > 1 && t < 40) { t++; processCity(c); }
    const ok = c.pop === 1 && t < 40;
    report(mode, ok ? 'SOLVED' : 'FAILED', { pop: c.pop, turns: t });
  } else if (mode === 'mech-found') {
    sandbox(GRASS);
    const s1 = spawnUnit(0, 'settler', 10, 10);
    const c = foundCity(s1);
    const consumed = !G.units.includes(s1);
    const s2 = spawnUnit(0, 'settler', 11, 10); // adjacent: too close, must refuse
    const refused = foundCity(s2) === null && G.units.includes(s2);
    const ok = !!c && consumed && refused && G.cities.length === 1;
    report(mode, ok ? 'SOLVED' : 'FAILED', { founded: !!c, consumed, refusedTooClose: refused });
  } else if (mode === 'mech-build') {
    sandbox(GRASS);
    const c = foundCity(spawnUnit(0, 'settler', 10, 10));
    const legionRefused = !setBuild(c, 'legion'); // no iron working yet
    setBuild(c, 'warrior');
    let t = 0; while (!myUnits(0).some(u => u.kind === 'warrior') && t < 20) { t++; processCity(c); }
    const ok = legionRefused && t === 5 && myUnits(0).some(u => u.kind === 'warrior'); // 10 cost / 2 shields
    report(mode, ok ? 'SOLVED' : 'FAILED', { legionRefusedPreIron: legionRefused, warriorTurns: t });
  } else if (mode === 'mech-tech') {
    sandbox(GRASS);
    const c = foundCity(spawnUnit(0, 'settler', 10, 10));
    const ironEarly = setResearch(0, 'iron'); // requires bronze: must refuse
    setResearch(0, 'bronze');
    let t = 0; while (!G.civs[0].techs.bronze && t < 60) { t++; processCity(c); checkResearch(0); }
    const phalanxNow = canBuild(0, 'phalanx');
    // 4 beakers/turn at pop 1, 5 after the turn-5 growth: 45 beakers land exactly on turn 10
    const ok = !ironEarly && G.civs[0].techs.bronze && phalanxNow && t === 10;
    report(mode, ok ? 'SOLVED' : 'FAILED', { ironRefusedEarly: !ironEarly, bronzeTurns: t, phalanxUnlocked: phalanxNow });
  } else if (mode === 'mech-combat') {
    sandbox(GRASS); srand(777);
    let w = 0; const N = 400;
    for (let i = 0; i < N; i++) { // full attackTile path: legion a4 vs warrior d1 on open grass
      const W = spawnUnit(1, 'warrior', 11, 10);
      const L = spawnUnit(0, 'legion', 10, 10); L.moves = 1;
      attackTile(L, 11, 10);
      if (!G.units.includes(W)) w++;
      for (const u of [...G.units]) killUnit(u);
    }
    const p = w / N;
    report(mode, p > 0.72 && p < 0.88 ? 'SOLVED' : 'FAILED', { winRate: +p.toFixed(3), expected: 0.8 });
  } else if (mode === 'mech-walls') {
    sandbox(GRASS);
    const trials = (walls) => {
      const c = cityAt(10, 10) || foundCity(spawnUnit(0, 'settler', 10, 10));
      c.bldgs.walls = walls;
      const d0 = { kind: 'phalanx', vet: false };
      srand(walls ? 991 : 992);
      let w = 0; for (let i = 0; i < 400; i++) if (battle(4, defStrength(d0, 10, 10))) w++;
      return w / 400;
    };
    const pW = trials(true), pN = trials(false);
    const ok = pW > 0.31 && pW < 0.49 && pN > pW + 0.05;
    report(mode, ok ? 'SOLVED' : 'FAILED', { vsWalls: +pW.toFixed(3), noWalls: +pN.toFixed(3) });
  } else if (mode === 'mech-vet') {
    sandbox(GRASS);
    const c = foundCity(spawnUnit(0, 'settler', 10, 10));
    c.bldgs.barracks = true; G.civs[0].techs.bronze = true; G.civs[0].techs.iron = true;
    setBuild(c, 'legion');
    let t = 0; while (!myUnits(0).some(u => u.kind === 'legion') && t < 30) { t++; processCity(c); }
    const u = myUnits(0).find(v => v.kind === 'legion');
    srand(31); let wv = 0; for (let i = 0; i < 400; i++) if (battle(4 * 1.5, 2)) wv++;
    srand(32); let wp = 0; for (let i = 0; i < 400; i++) if (battle(4, 2)) wp++;
    const ok = u && u.vet === true && wv / 400 > wp / 400 + 0.03;
    report(mode, ok ? 'SOLVED' : 'FAILED', { barracksVet: !!(u && u.vet), vetRate: +(wv / 400).toFixed(3), plainRate: +(wp / 400).toFixed(3) });
  } else if (mode === 'mech-stack') {
    // open field: the whole stack dies with its defender; in a city only the top unit falls
    const winAttack = (setup) => { // spawn attackers until one wins its roll; judge that attack
      for (let tries = 0; tries < 240; tries++) {
        const L = spawnUnit(0, 'legion', 10, 10); L.moves = 1;
        const before = unitsAt(11, 10).filter(v => v.civ === 1).length;
        if (!before) return null;
        attackTile(L, 11, 10);
        if (G.units.includes(L)) return { before, after: unitsAt(11, 10).filter(v => v.civ === 1).length };
      }
      return null;
    };
    const openWipe = (() => {
      sandbox(GRASS); srand(5);
      spawnUnit(1, 'warrior', 11, 10); spawnUnit(1, 'warrior', 11, 10); spawnUnit(1, 'warrior', 11, 10);
      const r = winAttack();
      return r ? r.before === 3 && r.after === 0 : null;
    })();
    const cityOne = (() => {
      sandbox(GRASS); srand(5);
      foundCity(spawnUnit(1, 'settler', 11, 10));
      spawnUnit(1, 'warrior', 11, 10); spawnUnit(1, 'warrior', 11, 10); spawnUnit(1, 'warrior', 11, 10);
      const r = winAttack();
      return r ? r.after === r.before - 1 : null;
    })();
    const ok = openWipe === true && cityOne === true;
    report(mode, ok ? 'SOLVED' : 'FAILED', { openFieldWipe: openWipe, cityTopOnly: cityOne });
  } else if (mode === 'mech-upkeep') {
    sandbox(GRASS);
    foundCity(spawnUnit(0, 'settler', 10, 10));
    for (let i = 0; i < 10; i++) spawnUnit(0, 'legion', 20, 20);
    G.civs[0].gold = 0;
    payUpkeep(0);
    const left = myUnits(0).filter(u => u.kind === 'legion').length;
    const fair = G.civs[0].prodBonus === 1 && G.civs[1].prodBonus === 1;
    const ok = left === 5 && fair; // 4 + 1 city free, the rest disband unpaid; and no civ has a production cheat
    report(mode, ok ? 'SOLVED' : 'FAILED', { fieldLeft: left, freeAllowance: 5, prodBonusPinned: fair });
  } else if (mode === 'mech-capture') {
    sandbox(GRASS);
    const c = foundCity(spawnUnit(1, 'settler', 11, 10)); c.pop = 3;
    const w = spawnUnit(0, 'warrior', 10, 10); w.moves = 1;
    tryMove(w, 1, 0);
    const ok = c.civ === 0 && c.pop === 2 && w.x === 11;
    report(mode, ok ? 'SOLVED' : 'FAILED', { flipped: c.civ === 0, popAfter: c.pop });
  } else if (mode === 'mech-victory') {
    sandbox(GRASS);
    foundCity(spawnUnit(0, 'settler', 5, 5));
    const ec = foundCity(spawnUnit(1, 'settler', 15, 15));
    G.turn = 10;
    const w = spawnUnit(0, 'warrior', 14, 15); w.moves = 1;
    tryMove(w, 1, 0);
    const ok = ec.civ === 0 && G.outcome === 'WON' && G.via === 'conquest';
    report(mode, ok ? 'SOLVED' : 'FAILED', { game: G.outcome, via: G.via });
  } else if (mode === 'mech-beacon') {
    sandbox(GRASS);
    const c = foundCity(spawnUnit(0, 'settler', 10, 10));
    for (const k of Object.keys(TECHS)) G.civs[0].techs[k] = true;
    setBuild(c, 'beacon'); c.shields = 199;
    processCity(c);
    const ok = c.bldgs.beacon === true && G.outcome === 'WON' && G.via === 'beacon';
    report(mode, ok ? 'SOLVED' : 'FAILED', { game: G.outcome, via: G.via });
  } else {
    report(mode, 'UNKNOWN');
  }
}

// ------------------------------ rendering ------------------------------
const TS = 24, MAPW = MW * TS, SBX = MAPW; // 1056 map + 224 sidebar
let cv, cx;
const TCOL = ['#04111f', '#0d2818', '#12241a', '#0b2013', '#1a1826', '#141122', '#282013'];
const TACC = ['#14406e', '#2fae62', '#8f883c', '#2fae62', '#7f6cff', '#b48cff', '#d8a545'];

function addFx(x, y, win, civ, txt) {
  const queued = G.fx.filter(q => q.t >= G.time).length;
  G.fx.push({ x, y, t: G.time + queued * 0.14, win, civ, txt: txt || '' });
}

function drawTile(x, y) {
  const t = terr(x, y), px = x * TS, py = y * TS;
  cx.fillStyle = TCOL[t]; cx.fillRect(px, py, TS, TS);
  const j = hash32(x, y, t);
  cx.strokeStyle = TACC[t]; cx.lineWidth = 1;
  if (t === OCEAN) {
    cx.globalAlpha = 0.5;
    cx.beginPath();
    const wy = py + 8 + Math.floor(j * 8);
    cx.moveTo(px + 4, wy); cx.lineTo(px + 10, wy);
    cx.moveTo(px + 13, wy + 6); cx.lineTo(px + 19, wy + 6);
    cx.stroke(); cx.globalAlpha = 1;
  } else if (t === FOREST) {
    cx.globalAlpha = 0.9;
    for (let i = 0; i < 3; i++) {
      const tx = px + 4 + ((i * 7 + j * 5) % 15), ty = py + 6 + ((i * 5 + j * 9) % 12);
      cx.beginPath(); cx.moveTo(tx, ty + 6); cx.lineTo(tx + 3, ty); cx.lineTo(tx + 6, ty + 6); cx.closePath(); cx.stroke();
    }
    cx.globalAlpha = 1;
  } else if (t === HILLS) {
    cx.globalAlpha = 0.85;
    cx.beginPath(); cx.arc(px + 8, py + 16, 5, Math.PI, 0); cx.arc(px + 17, py + 18, 5, Math.PI, 0); cx.stroke();
    cx.globalAlpha = 1;
  } else if (t === MOUNT) {
    cx.beginPath(); cx.moveTo(px + 3, py + 20); cx.lineTo(px + 9, py + 6); cx.lineTo(px + 13, py + 14);
    cx.lineTo(px + 16, py + 8); cx.lineTo(px + 21, py + 20); cx.stroke();
  } else if (t === DESERT) {
    cx.globalAlpha = 0.7;
    cx.fillStyle = TACC[t];
    cx.fillRect(px + 6 + j * 6, py + 9, 2, 2); cx.fillRect(px + 14, py + 16, 2, 2);
    cx.globalAlpha = 1;
  } else if (t === GRASS || t === PLAINS) {
    cx.globalAlpha = 0.45;
    const gx = px + 5 + Math.floor(j * 12), gy = py + 6 + Math.floor(hash32(y, x, 7) * 12);
    cx.beginPath(); cx.moveTo(gx, gy + 4); cx.lineTo(gx, gy); cx.moveTo(gx + 4, gy + 5); cx.lineTo(gx + 4, gy + 2); cx.stroke();
    cx.globalAlpha = 1;
  }
  // coastline glow
  if (t !== OCEAN) {
    cx.strokeStyle = 'rgba(62,180,255,0.55)'; cx.lineWidth = 2;
    cx.beginPath();
    if (y > 0 && terr(x, y - 1) === OCEAN) { cx.moveTo(px, py + 1); cx.lineTo(px + TS, py + 1); }
    if (y < MH - 1 && terr(x, y + 1) === OCEAN) { cx.moveTo(px, py + TS - 1); cx.lineTo(px + TS, py + TS - 1); }
    if (x > 0 && terr(x - 1, y) === OCEAN) { cx.moveTo(px + 1, py); cx.lineTo(px + 1, py + TS); }
    if (x < MW - 1 && terr(x + 1, y) === OCEAN) { cx.moveTo(px + TS - 1, py); cx.lineTo(px + TS - 1, py + TS); }
    cx.stroke();
  }
}
function drawCity(c) {
  const civ = G.civs[c.civ], px = c.x * TS, py = c.y * TS;
  cx.save();
  cx.shadowColor = civ.col; cx.shadowBlur = 10;
  cx.fillStyle = '#0a0f18';
  cx.strokeStyle = civ.col; cx.lineWidth = 2;
  cx.fillRect(px + 3, py + 3, TS - 6, TS - 6);
  cx.strokeRect(px + 3, py + 3, TS - 6, TS - 6);
  if (c.bldgs.walls) { cx.lineWidth = 1; cx.strokeRect(px + 0.5, py + 0.5, TS - 1, TS - 1); }
  cx.shadowBlur = 0;
  cx.fillStyle = civ.col; cx.font = 'bold 11px monospace'; cx.textAlign = 'center';
  cx.fillText(c.pop, px + TS / 2, py + TS / 2 + 4);
  if (c.capital) { cx.fillText('★', px + TS - 5, py + 9); }
  cx.font = '8px monospace'; cx.fillStyle = civ.col; cx.globalAlpha = 0.85;
  cx.fillText(c.name, px + TS / 2, py + TS + 8);
  cx.globalAlpha = 1;
  cx.restore();
}
function unitIcon(kind, px, py) {
  cx.beginPath();
  if (kind === 'warrior') { // sword
    cx.moveTo(px - 3.5, py + 3.5); cx.lineTo(px + 3, py - 3);
    cx.moveTo(px - 0.5, py - 2.5); cx.lineTo(px + 2.5, py + 0.5);
    cx.moveTo(px - 3.5, py - 0.5); cx.lineTo(px - 1, py + 1.5);
  } else if (kind === 'phalanx') { // tower shield
    cx.moveTo(px - 3, py - 4); cx.lineTo(px + 3, py - 4); cx.lineTo(px + 3, py + 1);
    cx.quadraticCurveTo(px + 3, py + 4, px, py + 5);
    cx.quadraticCurveTo(px - 3, py + 4, px - 3, py + 1); cx.closePath();
  } else if (kind === 'legion') { // twin spears
    cx.moveTo(px - 4, py + 4); cx.lineTo(px - 1, py - 4); cx.moveTo(px - 2.6, py - 2); cx.lineTo(px + 0.4, py - 2);
    cx.moveTo(px + 1, py + 4); cx.lineTo(px + 4, py - 4); cx.moveTo(px + 2.4, py - 2); cx.lineTo(px + 5.4, py - 2);
  } else if (kind === 'catapult') { // arm and wheel
    cx.arc(px - 1, py + 1, 3.2, Math.PI, Math.PI * 1.9);
    cx.moveTo(px - 4.5, py + 3.5); cx.lineTo(px + 4.5, py + 3.5);
    cx.moveTo(px + 2, py + 3.5); cx.lineTo(px + 4.5, py - 3.5);
  } else { // settler wagon
    cx.rect(px - 4, py - 3, 8, 4.5);
    cx.moveTo(px - 2, py + 3.6); cx.arc(px - 2, py + 3.6, 1.4, 0, 7);
    cx.moveTo(px + 2, py + 3.6); cx.arc(px + 2, py + 3.6, 1.4, 0, 7);
  }
  cx.stroke();
}
function drawUnit(u, topOfStack) {
  if (!topOfStack) return;
  const civ = G.civs[u.civ], px = u.x * TS + TS / 2, py = u.y * TS + TS / 2;
  const stack = unitsAt(u.x, u.y).filter(v => v.civ === u.civ).length;
  const selected = G.sel === u.id;
  const enemy = u.civ !== 0;
  const spent = !enemy && u.moves <= 0;
  cx.save();
  if (stack > 1) { // stack shadow chip
    cx.fillStyle = '#060a10'; cx.strokeStyle = enemy ? civ.col : civ.dim; cx.lineWidth = 1.5;
    cx.beginPath(); cx.arc(px + 3, py + 3, 8.5, 0, 7); cx.fill(); cx.stroke();
  }
  cx.shadowColor = civ.col; cx.shadowBlur = selected ? 12 : enemy ? 9 : 6;
  cx.fillStyle = enemy ? '#1c0d05' : '#060a10';
  cx.strokeStyle = spent ? civ.dim : civ.col;
  cx.lineWidth = selected ? 2.5 : enemy ? 2 : 1.5;
  cx.globalAlpha = spent ? 0.6 : 1;
  cx.beginPath(); cx.arc(px, py, 9, 0, 7); cx.fill(); cx.stroke();
  cx.shadowBlur = 0;
  cx.lineWidth = 1.6;
  unitIcon(u.kind, px, py - 0.5);
  if (u.vet) { cx.fillStyle = spent ? civ.dim : civ.col; cx.fillRect(px - 3, py + 10, 6, 1.5); }
  cx.globalAlpha = 1;
  if (!enemy && u.moves > 0 && !selected && !G.shotMode) {
    const p = 0.5 + 0.5 * Math.sin(G.time * 3 + u.id);
    cx.strokeStyle = 'rgba(174,246,255,' + (0.1 + 0.2 * p) + ')';
    cx.beginPath(); cx.arc(px, py, 11, 0, 7); cx.stroke();
  }
  if (selected) {
    const p = G.shotMode ? 0.7 : 0.5 + 0.5 * Math.sin(G.time * 5);
    cx.strokeStyle = 'rgba(255,255,255,' + (0.25 + 0.35 * p) + ')';
    cx.strokeRect(u.x * TS + 1, u.y * TS + 1, TS - 2, TS - 2);
  }
  cx.restore();
}
function drawFx() {
  for (const f of G.fx) {
    const age = G.time - f.t;
    if (age < 0 || age > 0.9) continue;
    const px = f.x * TS + TS / 2, py = f.y * TS + TS / 2;
    const r = 4 + age * 22, al = Math.max(0, 1 - age / 0.9);
    cx.save();
    cx.globalAlpha = al;
    cx.strokeStyle = f.win ? '#ffe14a' : '#ff4a5e';
    cx.lineWidth = 2;
    cx.beginPath(); cx.arc(px, py, r, 0, 7); cx.stroke();
    cx.lineWidth = 1.2;
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3 + hash32(f.x, f.y, i);
      cx.beginPath();
      cx.moveTo(px + Math.cos(a) * r * 0.5, py + Math.sin(a) * r * 0.5);
      cx.lineTo(px + Math.cos(a) * (r + 5), py + Math.sin(a) * (r + 5));
      cx.stroke();
    }
    if (f.txt) {
      cx.globalAlpha = al;
      cx.fillStyle = f.win ? '#ffe14a' : '#ff8a95';
      cx.font = 'bold 11px monospace'; cx.textAlign = 'center';
      cx.fillText(f.txt, px, py - 14 - age * 18);
      cx.globalAlpha = 1; cx.textAlign = 'left';
    }
    cx.restore();
  }
  G.fx = G.fx.filter(f => G.time - f.t <= 0.9);
}
function drawTrails() {
  for (const tr of G.trails) {
    const age = G.time - tr.t;
    if (age < 0 || age > 1.2) continue;
    const col = G.civs[tr.civ].col;
    const x1 = tr.fx * TS + TS / 2, y1 = tr.fy * TS + TS / 2;
    const x2 = tr.tx * TS + TS / 2, y2 = tr.ty * TS + TS / 2;
    cx.save();
    cx.globalAlpha = (1 - age / 1.2) * 0.35;
    cx.strokeStyle = col; cx.lineWidth = 2;
    cx.beginPath(); cx.moveTo(x1, y1); cx.lineTo(x2, y2); cx.stroke();
    const k = Math.min(1, age * 3);
    cx.globalAlpha = (1 - age / 1.2) * 0.8;
    cx.fillStyle = col;
    cx.beginPath(); cx.arc(x1 + (x2 - x1) * k, y1 + (y2 - y1) * k, 2, 0, 7); cx.fill();
    cx.restore();
  }
  G.trails = G.trails.filter(tr => G.time - tr.t <= 1.2);
}
function drawBanner() {
  const b = G.banner;
  if (!b) return;
  const age = G.time - b.t;
  if (age < 0 || age > 2.6) { if (age > 2.6) G.banner = null; return; }
  const grow = Math.min(1, age * 5);
  const al = age > 2 ? (2.6 - age) / 0.6 : 1;
  cx.save();
  cx.globalAlpha = al;
  cx.shadowColor = b.col; cx.shadowBlur = 22;
  cx.fillStyle = b.col;
  cx.font = 'bold ' + Math.round(16 + 18 * grow) + 'px monospace';
  cx.textAlign = 'center';
  cx.fillText(b.txt, SBX / 2, 96);
  cx.restore();
  cx.textAlign = 'left';
}
function civRates(cid) {
  let sci = 0, gold = 0;
  for (const c of myCities(cid)) {
    const y = cityYields(c);
    let s2 = y.tr; if (c.bldgs.library) s2 = Math.ceil(s2 * 1.5);
    sci += s2;
    let g = Math.ceil(y.tr / 2); if (c.bldgs.market) g = Math.ceil(g * 1.5);
    gold += g;
  }
  const exempt = new Set();
  for (const c of myCities(cid)) {
    const here = myUnits(cid).filter(u => u.kind !== 'settler' && u.x === c.x && u.y === c.y);
    for (let i = 0; i < Math.min(2, here.length); i++) exempt.add(here[i].id);
  }
  const over = myUnits(cid).filter(u => u.kind !== 'settler' && !exempt.has(u.id)).length - (4 + myCities(cid).length);
  return { sci, gold: gold - Math.max(0, over) * 2 };
}
function bar(x, y, w, h, frac, col, label, sub) {
  cx.fillStyle = '#0a1220'; cx.fillRect(x, y, w, h);
  cx.fillStyle = col; cx.globalAlpha = 0.9;
  cx.fillRect(x, y, Math.max(0, Math.min(1, frac)) * w, h);
  cx.globalAlpha = 1;
  cx.strokeStyle = '#1d2c44'; cx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  if (label) { cx.fillStyle = '#cfe6ff'; cx.font = '10px monospace'; cx.textAlign = 'left'; cx.fillText(label, x + 4, y + h - 3); }
  if (sub) { cx.textAlign = 'right'; cx.fillText(sub, x + w - 4, y + h - 3); }
  cx.textAlign = 'left';
}
function drawSidebar() {
  cx.fillStyle = '#060a12'; cx.fillRect(SBX, 0, 1280 - SBX, 720);
  cx.strokeStyle = '#16283f'; cx.beginPath(); cx.moveTo(SBX + 0.5, 0); cx.lineTo(SBX + 0.5, 720); cx.stroke();
  const civ = G.civs[0];
  const L = SBX + 12, W = 1280 - SBX - 24;
  cx.textAlign = 'left';
  cx.fillStyle = '#3ef0ff'; cx.font = 'bold 18px monospace';
  cx.fillText('NEOCIV', L, 30);
  cx.fillStyle = '#6f87a8'; cx.font = '10px monospace';
  cx.fillText('an empire of light', L, 44);
  const rates = civRates(0);
  cx.fillStyle = '#cfe6ff'; cx.font = '12px monospace';
  cx.fillText('TURN ' + G.turn + ' · ' + yearStr(G.turn), L, 68);
  cx.fillText('GOLD ' + civ.gold + (rates.gold >= 0 ? ' (+' : ' (') + rates.gold + '/t)', L, 86);
  const resKey = civ.res;
  const resETA = resKey && rates.sci > 0 ? Math.max(1, Math.ceil((TECHS[resKey].cost - civ.beakers) / rates.sci)) : 0;
  bar(L, 96, W, 16, resKey ? civ.beakers / TECHS[resKey].cost : 0, '#2f6bae',
    resKey ? resKey.toUpperCase() : 'NO RESEARCH [T]', resKey ? civ.beakers + '/' + TECHS[resKey].cost + '·' + resETA + 't' : '');
  // selected unit card
  const su = G.units.find(u => u.id === G.sel);
  let yy = 136;
  cx.fillStyle = '#6f87a8'; cx.font = '10px monospace'; cx.fillText('UNIT', L, yy - 8);
  cx.strokeStyle = '#16283f'; cx.strokeRect(L + 0.5, yy + 0.5 - 4, W - 1, 52);
  if (su) {
    cx.fillStyle = G.civs[su.civ].col; cx.font = 'bold 12px monospace';
    cx.fillText((su.vet ? 'VETERAN ' : '') + UT[su.kind].name, L + 8, yy + 14);
    cx.fillStyle = '#cfe6ff'; cx.font = '11px monospace';
    const ty = TY[terr(su.x, su.y)];
    cx.fillText('ATT ' + UT[su.kind].a + ' · DEF ' + UT[su.kind].d + ' · moves ' + su.moves, L + 8, yy + 30);
    cx.fillStyle = '#6f87a8'; cx.font = '10px monospace';
    cx.fillText(TNAME[terr(su.x, su.y)] + ' · F' + ty[0] + ' S' + ty[1] + ' T' + ty[2] + (su.kind === 'settler' ? ' · [F] found' : ''), L + 8, yy + 43);
    // combat preview: best adjacent target odds
    let pv = null;
    for (const [dx2, dy2] of DIRS8) {
      const x2 = su.x + dx2, y2 = su.y + dy2;
      if (!inb(x2, y2)) continue;
      const foes = unitsAt(x2, y2).filter(v => v.civ !== su.civ);
      if (!foes.length || UT[su.kind].a === 0) continue;
      let best2 = foes[0];
      for (const v of foes) if (defStrength(v, x2, y2) > defStrength(best2, x2, y2)) best2 = v;
      const a2 = UT[su.kind].a * (su.vet ? 1.5 : 1);
      const p2 = a2 / (a2 + defStrength(best2, x2, y2));
      if (!pv || p2 > pv.p) pv = { p: p2, k: best2.kind };
    }
    if (pv) {
      cx.fillStyle = pv.p >= 0.5 ? '#7fe0a8' : '#ff8a95'; cx.font = 'bold 10px monospace';
      cx.fillText('vs ' + UT[pv.k].name + ' — ' + Math.round(pv.p * 100) + '%', L + 8, yy + 55);
    }
  } else if (G.inspect) {
    const t2 = terr(G.inspect.x, G.inspect.y), ty2 = TY[t2];
    cx.fillStyle = '#cfe6ff'; cx.font = 'bold 12px monospace';
    cx.fillText(TNAME[t2], L + 8, yy + 14);
    cx.fillStyle = '#8fa8c8'; cx.font = '11px monospace';
    cx.fillText('FOOD ' + ty2[0] + ' · SHIELDS ' + ty2[1] + ' · TRADE ' + ty2[2], L + 8, yy + 30);
  } else {
    cx.fillStyle = '#44586f'; cx.font = '11px monospace';
    cx.fillText('none — [N] next · click a tile', L + 8, yy + 24);
  }
  // city roster
  yy = 216;
  cx.fillStyle = '#6f87a8'; cx.font = '10px monospace'; cx.fillText('CITIES — click to govern', L, yy - 6);
  const cs = myCities(0);
  if (cs.length > 8) {
    cx.fillStyle = '#44586f'; cx.font = '9px monospace';
    cx.fillText('+' + (cs.length - 8) + ' more', L + W - 52, yy - 6);
  }
  for (let i = 0; i < Math.min(8, cs.length); i++) {
    const c = cs[i], ry = yy + i * 34;
    cx.strokeStyle = '#16283f'; cx.strokeRect(L + 0.5, ry + 0.5, W - 1, 30);
    cx.fillStyle = '#3ef0ff'; cx.font = 'bold 11px monospace';
    cx.fillText((c.capital ? '★ ' : '') + c.name + ' · ' + c.pop, L + 6, ry + 13);
    const b = c.build;
    cx.fillStyle = b ? '#8fa8c8' : '#ffd34a'; cx.font = '10px monospace';
    if (b) {
      const cost = buildCost(b);
      const { s } = cityYields(c);
      const eta = Math.max(1, Math.ceil((cost - c.shields) / Math.max(1, s)));
      cx.fillText((b.u ? UT[b.k].name : BT[b.k].name) + ' ' + c.shields + '/' + cost + ' · ' + eta + 't', L + 6, ry + 26);
    } else cx.fillText('IDLE — needs orders', L + 6, ry + 26);
  }
  // terrain legend
  const LG = [[GRASS, 'GRASS'], [PLAINS, 'PLAINS'], [FOREST, 'FOREST'], [HILLS, 'HILLS'], [MOUNT, 'MTNS'], [DESERT, 'DESERT']];
  for (let i = 0; i < LG.length; i++) {
    const lx = L + (i % 2) * (W / 2), ly2 = 512 + Math.floor(i / 2) * 15;
    cx.fillStyle = TCOL[LG[i][0]]; cx.fillRect(lx, ly2, 10, 10);
    cx.strokeStyle = TACC[LG[i][0]]; cx.strokeRect(lx + 0.5, ly2 + 0.5, 9, 9);
    cx.fillStyle = '#6f87a8'; cx.font = '9px monospace';
    const yl = TY[LG[i][0]];
    cx.fillText(LG[i][1] + ' F' + yl[0] + 'S' + yl[1] + 'T' + yl[2], lx + 14, ly2 + 8);
  }
  // war status + log
  const eC = myCities(1).length, mC = myCities(0).length;
  if (G.civs[1].atWar || G.civs[0].atWar) {
    cx.fillStyle = '#ffd34a'; cx.font = 'bold 10px monospace';
    cx.fillText('⚔ AT WAR', L, 578);
    cx.fillStyle = '#6f87a8'; cx.font = '10px monospace';
    cx.fillText('LUMEN ' + mC + ' · UMBRA ' + eC, L + 78, 578);
  } else {
    cx.fillStyle = '#6f87a8'; cx.font = '10px monospace';
    cx.fillText('LUMEN ' + mC + ' · UMBRA ' + eC + ' cities', L, 578);
  }
  let ly = 596;
  cx.fillStyle = '#6f87a8';
  cx.fillText('LOG', L, ly); ly += 14;
  cx.font = '10px monospace';
  const live = G.log.filter(m => m.T > G.time).slice(-5);
  const KC = { war: '#ffd34a', tech: '#7fd0ff', pop: '#7fe0a8' };
  for (const m of live) { cx.fillStyle = KC[m.kind] || '#9fc0e8'; cx.fillText(m.t.slice(0, 30), L, ly); ly += 13; }
  // end turn
  const anyMoves = myUnits(0).some(u => u.moves > 0 && !u.gar);
  const pulse = !anyMoves && !G.shotMode ? 0.5 + 0.5 * Math.sin(G.time * 4) : 0.4;
  cx.fillStyle = anyMoves ? '#0e1a2c' : '#12324a';
  cx.fillRect(L, 682, W, 26);
  cx.strokeStyle = anyMoves ? '#1d2c44' : 'rgba(62,240,255,' + (0.5 + 0.5 * pulse) + ')';
  cx.lineWidth = anyMoves ? 1 : 2;
  cx.strokeRect(L + 0.5, 682.5, W - 1, 25);
  cx.lineWidth = 1;
  cx.fillStyle = anyMoves ? '#8fa8c8' : '#3ef0ff'; cx.font = 'bold 11px monospace'; cx.textAlign = 'center';
  cx.fillText('END TURN ' + G.turn + ' — TAP OR [ENTER]', L + W / 2, 699);
  cx.textAlign = 'left';
}
function drawMap() {
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) drawTile(x, y);
  // territory tint — ownership readable at a glance
  for (const c of G.cities) {
    cx.fillStyle = G.civs[c.civ].col;
    cx.globalAlpha = 0.07;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const x = c.x + dx, y = c.y + dy;
      if (inb(x, y) && terr(x, y) !== OCEAN) cx.fillRect(x * TS, y * TS, TS, TS);
    }
    cx.globalAlpha = 1;
  }
  // faint grid
  cx.strokeStyle = 'rgba(120,160,220,0.05)'; cx.lineWidth = 1;
  cx.beginPath();
  for (let x = 0; x <= MW; x++) { cx.moveTo(x * TS + 0.5, 0); cx.lineTo(x * TS + 0.5, MH * TS); }
  for (let y = 0; y <= MH; y++) { cx.moveTo(0, y * TS + 0.5); cx.lineTo(MW * TS, y * TS + 0.5); }
  cx.stroke();
  drawTrails();
  for (const c of G.cities) drawCity(c);
  // one badge per stack (top = strongest defender, or the selected unit)
  const seen = new Set();
  const sel = G.units.find(u => u.id === G.sel);
  for (const u of G.units) {
    const key = u.x + ',' + u.y + ',' + u.civ;
    if (seen.has(key)) continue;
    seen.add(key);
    let top = u;
    for (const v of unitsAt(u.x, u.y)) if (v.civ === u.civ && defStrength(v, u.x, u.y) > defStrength(top, u.x, u.y)) top = v;
    if (sel && sel.x === u.x && sel.y === u.y && sel.civ === u.civ) top = sel;
    drawUnit(top, true);
  }
  drawFx();
}
function panel(w, h, title) {
  const x = (SBX - w) / 2, y = (720 - h) / 2;
  cx.fillStyle = 'rgba(2,6,12,0.88)'; cx.fillRect(0, 0, SBX, 720);
  cx.fillStyle = '#070c16'; cx.fillRect(x, y, w, h);
  cx.strokeStyle = '#3ef0ff'; cx.lineWidth = 1.5; cx.strokeRect(x + 0.5, y + 0.5, w, h);
  cx.fillStyle = '#3ef0ff'; cx.font = 'bold 16px monospace'; cx.textAlign = 'left';
  cx.fillText(title, x + 20, y + 30);
  return { x, y };
}
function cityMenu(c) {
  const out = [], locked = [];
  for (const k of ['warrior', 'phalanx', 'legion', 'catapult', 'settler'])
    (canBuild(0, k) ? out : locked).push({ k, u: true, ok: canBuild(0, k) });
  for (const k of Object.keys(BT)) {
    if (c.bldgs[k]) continue;
    (canBuild(0, k) ? out : locked).push({ k, u: false, ok: canBuild(0, k) });
  }
  return { out: out.slice(0, 10), locked };
}
function drawCityScreen() {
  const c = G.cities.find(x => x.id === G.focusCity);
  if (!c) { G.screen = 'map'; return; }
  const { x, y } = panel(880, 560, (c.capital ? '★ ' : '') + c.name + ' — POP ' + c.pop);
  const yl = cityYields(c);
  cx.fillStyle = '#cfe6ff'; cx.font = '12px monospace';
  cx.fillText('FOOD +' + (yl.f - c.pop * 2) + '   SHIELDS ' + yl.s + '   TRADE ' + yl.tr, x + 20, y + 56);
  bar(x + 20, y + 70, 400, 16, c.food / (c.pop * 10), '#2fae62', 'FOOD STORE', c.food + '/' + c.pop * 10);
  const b = c.build;
  bar(x + 20, y + 94, 400, 16, b ? c.shields / buildCost(b) : 0, '#d8a545',
    b ? (b.u ? UT[b.k].name : BT[b.k].name) : 'NOTHING QUEUED', b ? c.shields + '/' + buildCost(b) : '');
  cx.fillStyle = '#6f87a8'; cx.font = '10px monospace';
  cx.fillText('BUILDINGS', x + 20, y + 136);
  let bx = x + 20;
  cx.font = '11px monospace';
  const owned = Object.keys(c.bldgs);
  if (!owned.length) { cx.fillStyle = '#44586f'; cx.fillText('none', bx, y + 152); }
  for (const k of owned) {
    const w2 = BT[k].name.length * 7 + 12;
    cx.fillStyle = '#0e2a3c'; cx.fillRect(bx, y + 141, w2, 16);
    cx.fillStyle = '#3ef0ff'; cx.fillText(BT[k].name, bx + 6, y + 153);
    bx += w2 + 8;
  }
  cx.fillStyle = '#6f87a8'; cx.font = '10px monospace';
  cx.fillText('PRODUCTION ORDERS — tap or press a number', x + 20, y + 186);
  const { out: menu, locked } = cityMenu(c);
  for (let i = 0; i < menu.length; i++) {
    const m = menu[i], my = y + 200 + i * 28;
    const cost = m.u ? UT[m.k].cost : BT[m.k].cost;
    const cur = b && b.k === m.k;
    cx.fillStyle = cur ? '#0e2a3c' : '#0a1220';
    cx.fillRect(x + 20, my, 480, 24);
    cx.strokeStyle = cur ? '#3ef0ff' : '#1d2c44'; cx.strokeRect(x + 20.5, my + 0.5, 480, 24);
    cx.font = '11px monospace';
    cx.fillStyle = '#cfe6ff';
    const nm = m.u ? UT[m.k].name : BT[m.k].name;
    const turns = Math.max(1, Math.ceil((cost - c.shields) / Math.max(1, yl.s)));
    const key = i < 9 ? String(i + 1) : '0';
    cx.fillText(key + '. ' + nm + ' — ' + cost + ' shields (' + turns + 't)', x + 30, my + 16);
    if (m.u) { cx.fillStyle = '#8fa8c8'; cx.fillText('ATT ' + UT[m.k].a + ' DEF ' + UT[m.k].d, x + 400, my + 16); }
  }
  if (locked.length) {
    cx.fillStyle = '#3c4c62'; cx.font = '10px monospace';
    const s = locked.map(m => (m.u ? UT[m.k].name : BT[m.k].name) + ' (' + ((m.u ? UT[m.k].tech : BT[m.k].tech) || '').toUpperCase() + ')').join(' · ');
    cx.fillText('LOCKED: ' + s.slice(0, 96), x + 20, y + 208 + menu.length * 28);
  }
  // right column: the land this city works
  const rx = x + 540;
  cx.fillStyle = '#6f87a8'; cx.font = '10px monospace';
  cx.fillText('WORKED TILES (pop ' + c.pop + ' + centre)', rx, y + 186);
  const tiles = cityTiles(c);
  for (let i = 0; i < tiles.length && i < 9; i++) {
    const [tx2, ty2] = tiles[i], t2 = terr(tx2, ty2), yv = TY[t2];
    const my2 = y + 200 + i * 22;
    cx.fillStyle = TCOL[t2]; cx.fillRect(rx, my2, 14, 14);
    cx.strokeStyle = TACC[t2]; cx.strokeRect(rx + 0.5, my2 + 0.5, 13, 13);
    cx.fillStyle = '#8fa8c8'; cx.font = '10px monospace';
    cx.fillText(TNAME[t2] + (i === 0 ? ' (centre)' : '') + ' · F' + yv[0] + ' S' + yv[1] + ' T' + yv[2], rx + 20, my2 + 11);
  }
  const surplus2 = yl.f - c.pop * 2;
  const growETA = surplus2 > 0 ? Math.max(1, Math.ceil((c.pop * 10 - c.food) / surplus2)) + 't' : 'never';
  cx.fillStyle = '#7fe0a8'; cx.font = '10px monospace';
  cx.fillText('growth in ' + growETA, rx, y + 420);
  let sci2 = yl.tr; if (c.bldgs.library) sci2 = Math.ceil(sci2 * 1.5);
  let g2 = Math.ceil(yl.tr / 2); if (c.bldgs.market) g2 = Math.ceil(g2 * 1.5);
  cx.fillStyle = '#7fd0ff';
  cx.fillText('science +' + sci2 + '/t · gold +' + g2 + '/t', rx, y + 438);
  cx.fillStyle = '#6f87a8'; cx.font = '11px monospace';
  cx.fillText('tap/[R] rush for ' + (b ? Math.max(0, (buildCost(b) - c.shields) * 2) + ' gold' : '—') + '   tap outside/[ESC] close', x + 20, y + 540);
}
function drawTechScreen() {
  const { x, y } = panel(880, 560, 'KNOWLEDGE OF THE AGES');
  const civ = G.civs[0];
  cx.fillStyle = '#cfe6ff'; cx.font = '11px monospace';
  cx.fillText(civ.res ? 'Researching ' + civ.res.toUpperCase() + ' — ' + civ.beakers + '/' + TECHS[civ.res].cost + ' beakers'
    : 'Choose a discovery — tap it or press its number', x + 20, y + 54);
  const avail = TECH_ORDER.filter(k => !civ.techs[k] && !TECHS[k].req.some(r => !civ.techs[r]));
  let i = 0;
  for (const k of TECH_ORDER) {
    const t = TECHS[k], ty = y + 80 + i * 40; i++;
    const done = civ.techs[k], can = avail.includes(k);
    cx.fillStyle = done ? '#0a2418' : can ? '#0e1a2c' : '#0a0e16';
    cx.fillRect(x + 20, ty, 620, 32);
    cx.strokeStyle = done ? '#2fae62' : can ? '#3ef0ff' : '#1d2c44';
    cx.strokeRect(x + 20.5, ty + 0.5, 620, 32);
    cx.font = 'bold 11px monospace';
    cx.fillStyle = done ? '#2fae62' : can ? '#cfe6ff' : '#3c4c62';
    const idx = can ? (avail.indexOf(k) + 1) + '. ' : done ? '✓ ' : '· ';
    cx.fillText(idx + k.toUpperCase() + '  (' + t.cost + ')', x + 30, ty + 14);
    cx.font = '10px monospace';
    cx.fillStyle = done ? '#1f7a48' : '#6f87a8';
    const gives = Object.keys(UT).filter(u => UT[u].tech === k).map(u => UT[u].name)
      .concat(Object.keys(BT).filter(b => BT[b].tech === k).map(b => BT[b].name));
    cx.fillText((t.req.length ? 'needs ' + t.req.join(', ') + '  ' : '') + (gives.length ? '→ ' + gives.join(', ') : ''), x + 30, ty + 27);
  }
  cx.fillStyle = '#6f87a8'; cx.font = '11px monospace';
  cx.fillText('tap outside/[ESC] close', x + 20, y + 540);
}
function drawTitle() {
  cx.fillStyle = '#020409'; cx.fillRect(0, 0, 1280, 720);
  for (let i = 0; i < 120; i++) {
    const sx = hash32(i, 1) * 1280, sy = hash32(i, 2) * 720;
    cx.fillStyle = 'rgba(160,200,255,' + (0.15 + hash32(i, 3) * 0.5) + ')';
    cx.fillRect(sx, sy, hash32(i, 4) > 0.9 ? 2 : 1, 1);
  }
  const cxx = 640, cy = 320, R = 170;
  cx.save();
  cx.shadowColor = '#3ef0ff'; cx.shadowBlur = 18;
  cx.strokeStyle = '#1d6c8c'; cx.lineWidth = 1.5;
  cx.beginPath(); cx.arc(cxx, cy, R, 0, 7); cx.stroke();
  for (let i = 1; i < 4; i++) {
    const w = Math.cos(i * Math.PI / 8) * R;
    cx.beginPath(); cx.ellipse(cxx, cy, R, Math.abs(Math.sin(i * Math.PI / 8)) * R * 0.35 + 8, 0, 0, 7);
    cx.ellipse(cxx, cy, Math.abs(w), R, 0, 0, 7);
    cx.stroke();
  }
  cx.beginPath(); cx.ellipse(cxx, cy, R, R * 0.35, 0, 0, 7); cx.stroke();
  cx.beginPath(); cx.ellipse(cxx, cy, R * 0.5, R, 0, 0, 7); cx.stroke();
  // little continents
  cx.strokeStyle = '#2fae62'; cx.lineWidth = 2;
  cx.beginPath(); cx.moveTo(cxx - 90, cy - 40); cx.quadraticCurveTo(cxx - 40, cy - 90, cxx + 10, cy - 55);
  cx.quadraticCurveTo(cxx - 30, cy - 25, cxx - 90, cy - 40); cx.stroke();
  cx.beginPath(); cx.moveTo(cxx + 30, cy + 20); cx.quadraticCurveTo(cxx + 95, cy - 5, cxx + 105, cy + 55);
  cx.quadraticCurveTo(cxx + 55, cy + 75, cxx + 30, cy + 20); cx.stroke();
  cx.restore();
  cx.textAlign = 'center';
  cx.save();
  cx.shadowColor = '#3ef0ff'; cx.shadowBlur = 24;
  cx.fillStyle = '#aef6ff'; cx.font = 'bold 64px monospace';
  cx.fillText('N E O C I V', 640, 560);
  cx.restore();
  cx.fillStyle = '#6f87a8'; cx.font = '14px monospace';
  cx.fillText('an empire of light — a Civilization tribute', 640, 592);
  if (!G || !G.shotMode) {
    cx.fillStyle = '#e6f8ff'; cx.font = 'bold 14px monospace';
    cx.fillText('PRESS SPACE OR TAP — found LUMEN, out-think UMBRA', 640, 640);
    cx.fillStyle = '#7f98b8'; cx.font = '12px monospace';
    cx.fillText('tap tiles to move · arrows+QEZC · F found · B city · T science · ENTER end turn', 640, 668);
    if (COARSE) { cx.fillStyle = '#5a7090'; cx.fillText('best on a phone in landscape', 640, 690); }
  }
  cx.textAlign = 'left';
}
function drawEnd() {
  const won = G.outcome === 'WON';
  cx.fillStyle = 'rgba(2,5,10,0.88)'; cx.fillRect(0, 0, 1280, 720);
  cx.textAlign = 'center';
  cx.save();
  cx.shadowColor = won ? '#3ef0ff' : '#ff4a5e'; cx.shadowBlur = 30;
  cx.fillStyle = won ? '#aef6ff' : '#ff8a95'; cx.font = 'bold 58px monospace';
  cx.fillText(won ? 'THE LIGHT PREVAILS' : 'LUMEN HAS FALLEN', 640, 296);
  cx.restore();
  cx.fillStyle = '#cfe6ff'; cx.font = '16px monospace';
  cx.fillText(won ? (G.via === 'beacon' ? 'The Great Beacon burns — history ends in light.' : 'Every UMBRA city is yours.')
    : 'UMBRA rules the world that remains.', 640, 344);
  cx.fillStyle = '#8fa8c8'; cx.font = '15px monospace';
  cx.fillText('turn ' + G.turn + ' · ' + yearStr(G.turn) + ' · LUMEN ' + myCities(0).length + ' cities · UMBRA ' +
    myCities(1).length + ' · kills ' + G.kills[0], 640, 384);
  if (!G.shotMode) {
    cx.fillStyle = '#3ef0ff'; cx.font = 'bold 13px monospace';
    cx.fillText('[SPACE] or tap — found a new world', 640, 448);
  }
  cx.textAlign = 'left';
}
function draw() {
  if (!cv) return;
  cx.fillStyle = '#020409'; cx.fillRect(0, 0, 1280, 720);
  if (!G || G.screen === 'title') { drawTitle(); return; }
  drawMap();
  drawSidebar();
  drawBanner();
  if (G.screen === 'city') drawCityScreen();
  else if (G.screen === 'tech') drawTechScreen();
  else if (G.screen === 'end') drawEnd();
}

// ------------------------------ audio ------------------------------
let AC = null;
function beep(f, d, type) {
  if (!G || G.muted) return;
  try {
    AC = AC || new (window.AudioContext || window.webkitAudioContext)();
    if (AC.state === 'suspended') AC.resume();
    const o = AC.createOscillator(), g = AC.createGain();
    o.type = type || 'square'; o.frequency.value = f;
    g.gain.setValueAtTime(0.06, AC.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, AC.currentTime + d);
    o.connect(g); g.connect(AC.destination);
    o.start(); o.stop(AC.currentTime + d);
  } catch (e) { }
}

// ------------------------------ input ------------------------------
function selectNext() {
  const movers = myUnits(0).filter(u => u.moves > 0 && !u.gar);
  if (!movers.length) { G.sel = null; return; }
  const i = movers.findIndex(u => u.id === G.sel);
  G.sel = movers[(i + 1) % movers.length].id;
}
function playerMove(dx, dy) {
  const u = G.units.find(v => v.id === G.sel && v.civ === 0);
  if (!u || !u.moves) return;
  const before = G.units.length;
  if (tryMove(u, dx, dy)) beep(before === G.units.length ? 220 : 140, 0.08);
  if (!u.moves) selectNext();
}
function onKey(e) {
  const k = e.key;
  if (!G || G.screen === 'title') {
    if (k === ' ' || k === 'Enter') { newGame(URLSEED); G.screen = 'map'; beep(440, 0.1); }
    return;
  }
  if (G.screen === 'city') {
    const c = G.cities.find(x => x.id === G.focusCity);
    if (!c) { G.screen = 'map'; return; }
    if ((k >= '1' && k <= '9') || k === '0') {
      const m = cityMenu(c).out[k === '0' ? 9 : +k - 1];
      if (m && m.ok) { setBuild(c, m.k); beep(520, 0.06); }
      return;
    }
    if (k === 'r' || k === 'R') {
      if (c.build) {
        const need = Math.max(0, (buildCost(c.build) - c.shields) * 2);
        if (G.civs[0].gold >= need) { G.civs[0].gold -= need; c.shields = buildCost(c.build); beep(660, 0.1); }
      }
      return;
    }
    if (k === 'Escape' || k === 'b' || k === 'B') { G.screen = 'map'; }
    return;
  }
  if (G.screen === 'tech') {
    const civ = G.civs[0];
    const avail = TECH_ORDER.filter(t => !civ.techs[t] && !TECHS[t].req.some(r => !civ.techs[r]));
    if (k >= '1' && k <= '9') { const t = avail[+k - 1]; if (t) { setResearch(0, t); beep(520, 0.06); G.screen = 'map'; } return; }
    if (k === 'Escape' || k === 't' || k === 'T') G.screen = 'map';
    return;
  }
  if (G.screen === 'end') {
    if (k === ' ' || k === 'Enter') { newGame(G.seed + 1); G.screen = 'map'; beep(440, 0.1); }
    return;
  }
  switch (k) {
    case 'ArrowUp': playerMove(0, -1); break;
    case 'ArrowDown': playerMove(0, 1); break;
    case 'ArrowLeft': playerMove(-1, 0); break;
    case 'ArrowRight': playerMove(1, 0); break;
    case 'q': case 'Q': playerMove(-1, -1); break;
    case 'e': case 'E': playerMove(1, -1); break;
    case 'z': case 'Z': playerMove(-1, 1); break;
    case 'c': case 'C': playerMove(1, 1); break;
    case ' ': { const u = G.units.find(v => v.id === G.sel); if (u) u.moves = 0; selectNext(); break; }
    case 'n': case 'N': selectNext(); break;
    case 'f': case 'F': {
      const u = G.units.find(v => v.id === G.sel && v.civ === 0);
      if (u && u.kind === 'settler') { if (foundCity(u)) beep(392, 0.15); else msg('Too close to another city'); }
      break;
    }
    case 'b': case 'B': {
      const u = G.units.find(v => v.id === G.sel);
      const c = u ? cityAt(u.x, u.y) : myCities(0)[0];
      if (c && c.civ === 0) { G.focusCity = c.id; G.screen = 'city'; }
      break;
    }
    case 't': case 'T': G.screen = 'tech'; break;
    case 'm': case 'M': G.muted = !G.muted; break;
    case 'Enter': endTurn(); beep(330, 0.07); if (!G.sel) selectNext(); break;
  }
}
function onClick(e) {
  if (!G || G.screen === 'title') { newGame(URLSEED); G.screen = 'map'; beep(440, 0.1); return; }
  const r = cv.getBoundingClientRect();
  const px = (e.clientX - r.left) * (1280 / r.width), py = (e.clientY - r.top) * (720 / r.height);
  if (G.screen === 'end') { newGame(G.seed + 1); G.screen = 'map'; beep(440, 0.1); return; }
  if (G.screen === 'city') {
    const c = G.cities.find(x => x.id === G.focusCity);
    if (!c) { G.screen = 'map'; return; }
    const x = (SBX - 880) / 2, y = (720 - 560) / 2; // panel(880, 560)
    if (px < x || px > x + 880 || py < y || py > y + 560) { G.screen = 'map'; return; }
    const menu = cityMenu(c).out;
    const i = Math.floor((py - (y + 200)) / 28);
    if (px >= x + 20 && px <= x + 500 && py >= y + 200 && i >= 0 && i < menu.length && py - (y + 200) - i * 28 <= 24) {
      if (menu[i].ok) { setBuild(c, menu[i].k); beep(520, 0.06); }
      return;
    }
    if (py >= y + 526 && px <= x + 340 && c.build) { // rush line
      const need = Math.max(0, (buildCost(c.build) - c.shields) * 2);
      if (G.civs[0].gold >= need) { G.civs[0].gold -= need; c.shields = buildCost(c.build); beep(660, 0.1); }
    }
    return;
  }
  if (G.screen === 'tech') {
    const x = (SBX - 880) / 2, y = (720 - 560) / 2; // panel(880, 560)
    if (px < x || px > x + 880 || py < y || py > y + 560) { G.screen = 'map'; return; }
    const civ = G.civs[0];
    const avail = TECH_ORDER.filter(t => !civ.techs[t] && !TECHS[t].req.some(rq => !civ.techs[rq]));
    const i = Math.floor((py - (y + 80)) / 40);
    if (px >= x + 20 && px <= x + 640 && py >= y + 80 && i >= 0 && i < TECH_ORDER.length && py - (y + 80) - i * 40 <= 32) {
      const k = TECH_ORDER[i];
      if (avail.includes(k)) { setResearch(0, k); beep(520, 0.06); G.screen = 'map'; }
    }
    return;
  }
  if (px >= SBX) {
    if (py >= 682) { endTurn(); beep(330, 0.07); if (!G.sel) selectNext(); return; }
    if (py >= 96 && py < 112) { G.screen = 'tech'; return; } // research bar
    // city roster rows
    const i = Math.floor((py - 216) / 34);
    const cs = myCities(0);
    if (py >= 216 && i >= 0 && i < Math.min(8, cs.length)) { G.focusCity = cs[i].id; G.screen = 'city'; }
    return;
  }
  const tx = Math.floor(px / TS), ty = Math.floor(py / TS);
  if (!inb(tx, ty)) return;
  const sel = G.units.find(u => u.id === G.sel && u.civ === 0);
  // tap the selected unit's own tile: settlers found, the rest hold
  if (sel && sel.moves > 0 && sel.x === tx && sel.y === ty) {
    if (sel.kind === 'settler') { if (foundCity(sel)) beep(392, 0.15); else msg('Too close to another city'); }
    else { sel.moves = 0; selectNext(); }
    return;
  }
  const mine = unitsAt(tx, ty).filter(u => u.civ === 0 && u.moves > 0);
  if (mine.length) { G.sel = mine[0].id; G.inspect = null; return; }
  const c = cityAt(tx, ty);
  if (sel && sel.moves > 0 && terr(tx, ty) !== OCEAN) {
    // tap-to-move: adjacent tile orders the unit there (attack, capture, garrison included)
    if (Math.max(Math.abs(tx - sel.x), Math.abs(ty - sel.y)) === 1) { playerMove(tx - sel.x, ty - sel.y); return; }
    // farther: one pathfound step toward the tapped tile — except toward my own city, that governs it
    if (!(c && c.civ === 0)) {
      const st = bfsNext(sel.x, sel.y, tx, ty, 0);
      if (st) { playerMove(st.dx, st.dy); return; }
    }
  }
  if (c && c.civ === 0) { G.focusCity = c.id; G.screen = 'city'; return; }
  G.sel = null; G.inspect = { x: tx, y: ty };
}

// ------------------------------ shots ------------------------------
function runTurns(policy, n) { for (let i = 0; i < n && !G.outcome; i++) { policy(); endTurn(); } }
const SHOTS = {
  title: {
    run() { G = null; },
    check() { return true; },
  },
  world: {
    run() { newGame(CAREER_SEED); runTurns(() => civPolicy(0, BOT_OPTS), 60); G.sel = null; },
    check() { return myCities(0).length >= 3 && myCities(1).length >= 2; },
  },
  founding: {
    run() {
      newGame(CAREER_SEED);
      for (let t = 0; t < 60 && !G.outcome; t++) {
        civPolicy(0, BOT_OPTS); endTurn();
        if (myCities(0).length >= 1 && myUnits(0).some(u => u.kind === 'settler')) break;
      }
      const s = myUnits(0).find(u => u.kind === 'settler');
      if (s) G.sel = s.id;
      msg('A settler seeks new land');
    },
    check() { return myCities(0).length >= 1 && myUnits(0).some(u => u.kind === 'settler'); },
  },
  city: {
    run() {
      newGame(CAREER_SEED);
      for (let t = 0; t < 120 && !G.outcome; t++) {
        civPolicy(0, BOT_OPTS); endTurn();
        const cap0 = myCities(0)[0];
        if (cap0 && cap0.pop >= 3 && Object.keys(cap0.bldgs).length >= 1) break;
      }
      const cap = myCities(0)[0];
      G.focusCity = cap && cap.id; G.screen = 'city';
    },
    check() { const c = myCities(0)[0]; return c && c.pop >= 3 && Object.keys(c.bldgs).length >= 1; },
  },
  tech: {
    run() { newGame(CAREER_SEED); runTurns(() => civPolicy(0, BOT_OPTS), 45); G.screen = 'tech'; },
    check() { return Object.keys(G.civs[0].techs).length >= 2; },
  },
  war: {
    run() {
      newGame(CAREER_SEED);
      let met = false;
      for (let t = 0; t < 250 && !met && !G.outcome; t++) {
        civPolicy(0, BOT_OPTS); endTurn();
        met = G.units.some(u => u.civ === 0 && ['legion', 'catapult'].includes(u.kind) &&
          G.units.some(v => v.civ === 1 && Math.max(Math.abs(u.x - v.x), Math.abs(u.y - v.y)) <= 2));
      }
      G.sel = null;
      this._met = met;
    },
    check() { return this._met === true; },
  },
  combat: {
    run() {
      newGame(CAREER_SEED);
      let hadFx = false;
      for (let t = 0; t < 250 && !G.outcome; t++) {
        G.fx = []; civPolicy(0, BOT_OPTS); endTurn();
        if (G.fx.length) { hadFx = true; break; }
      }
      G.time = 0; for (const f of G.fx) f.t = -0.25; // freeze rings mid-bloom
      G.sel = null; this._had = hadFx;
    },
    check() { return this._had === true && G.fx.length > 0; },
  },
  conquest: {
    run() {
      newGame(CAREER_SEED);
      for (let t = 0; t < 250 && !G.outcome && G.captured[0] < 1; t++) { civPolicy(0, BOT_OPTS); endTurn(); }
      G.sel = null;
    },
    check() { return G.captured[0] >= 1; },
  },
  victory: {
    run() { newGame(CAREER_SEED); runTurns(() => civPolicy(0, BOT_OPTS), 250); G.screen = 'end'; },
    check() { return G.outcome === 'WON'; },
  },
  defeat: {
    run() {
      newGame(CAREER_SEED);
      for (let t = 0; t < 150 && !G.outcome; t++) {
        const u = myUnits(0).find(v => v.kind === 'settler');
        if (u && myCities(0).length === 0) foundCity(u);
        endTurn();
      }
      G.screen = 'end';
    },
    check() { return G.outcome === 'LOST'; },
  },
};

// ------------------------------ boot ------------------------------
const QS = new URLSearchParams(location.search);
const URLSEED = +(QS.get('seed') || CAREER_SEED) || CAREER_SEED;
const COARSE = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
function boot() {
  cv = document.getElementById('cv');
  cx = cv.getContext('2d');
  const verify = QS.get('verify');
  const shot = QS.get('shot');
  if (verify) {
    try { runVerify(verify); }
    catch (e) { report(verify, 'ERROR', { error: String(e && e.message || e) }); }
    return;
  }
  if (shot && SHOTS[shot]) {
    const def = SHOTS[shot];
    def.run();
    if (G) { G.shotMode = true; G.time = 100; for (const f of G.fx) f.t = G.time - 0.25; for (const m of G.log) m.T = G.time + 6; if (G.banner) G.banner.t = G.time - 0.5; G.trails = []; }
    const ok = def.check();
    document.title = (ok ? 'shot-OK:' : 'shot-FAILED:') + shot;
    draw();
    return;
  }
  window.addEventListener('keydown', onKey);
  cv.addEventListener('mousedown', onClick);
  let last = 0;
  const loop = (ts) => {
    const dt = Math.min(0.1, (ts - last) / 1000); last = ts;
    if (G) G.time += dt;
    draw();
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
window.addEventListener('DOMContentLoaded', boot);
