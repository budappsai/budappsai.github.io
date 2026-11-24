'use strict';
// LAMES D'ORAGE — utilitaires mathématiques (sans dépendance, utilisables dans Node pour les tests)
(function (root) {
  const G = root.G = root.G || {};

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  const easeOut = (t) => { t = clamp(t, 0, 1); const u = 1 - t; return 1 - u * u * u; };
  const easeIn = (t) => { t = clamp(t, 0, 1); return t * t * t; };
  const easeInOut = (t) => { t = clamp(t, 0, 1); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
  const TAU = Math.PI * 2;
  const wrap = (a) => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };
  const approach = (v, t, d) => (v < t ? Math.min(v + d, t) : Math.max(v - d, t));
  const approachAngle = (a, t, d) => { const diff = wrap(t - a); return Math.abs(diff) <= d ? t : a + Math.sign(diff) * d; };
  const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));
  const v3 = (x = 0, y = 0, z = 0) => ({ x, y, z });

  const V = {
    set(o, x, y, z) { o.x = x; o.y = y; o.z = z; return o; },
    copy(o, a) { o.x = a.x; o.y = a.y; o.z = a.z; return o; },
    add(o, a, b) { o.x = a.x + b.x; o.y = a.y + b.y; o.z = a.z + b.z; return o; },
    sub(o, a, b) { o.x = a.x - b.x; o.y = a.y - b.y; o.z = a.z - b.z; return o; },
    scale(o, a, s) { o.x = a.x * s; o.y = a.y * s; o.z = a.z * s; return o; },
    addS(o, a, b, s) { o.x = a.x + b.x * s; o.y = a.y + b.y * s; o.z = a.z + b.z * s; return o; },
    lerp(o, a, b, t) { o.x = a.x + (b.x - a.x) * t; o.y = a.y + (b.y - a.y) * t; o.z = a.z + (b.z - a.z) * t; return o; },
    dot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; },
    cross(o, a, b) { const x = a.y * b.z - a.z * b.y, y = a.z * b.x - a.x * b.z, z = a.x * b.y - a.y * b.x; o.x = x; o.y = y; o.z = z; return o; },
    len(a) { return Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z); },
    norm(o, a) { a = a || o; const l = Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z) || 1; o.x = a.x / l; o.y = a.y / l; o.z = a.z / l; return o; },
    dist(a, b) { const x = a.x - b.x, y = a.y - b.y, z = a.z - b.z; return Math.sqrt(x * x + y * y + z * z); },
    distXZ(a, b) { const x = a.x - b.x, z = a.z - b.z; return Math.sqrt(x * x + z * z); },
  };

  // Repère local d'un combattant : il regarde vers +Z local ; yaw = rotation autour de Y (comme Three.js).
  function toWorld(o, p, pos, yaw, scale) {
    const s = scale || 1, c = Math.cos(yaw), sn = Math.sin(yaw);
    const x = p.x * s, y = p.y * s, z = p.z * s;
    o.x = pos.x + x * c + z * sn;
    o.y = pos.y + y;
    o.z = pos.z - x * sn + z * c;
    return o;
  }

  // Générateur pseudo-aléatoire déterministe (mulberry32)
  function rng(seed) {
    let a = (seed >>> 0) || 1;
    const r = {
      next() {
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      },
      range(lo, hi) { return lo + (hi - lo) * r.next(); },
      chance(p) { return r.next() < p; },
      int(n) { return Math.floor(r.next() * n); },
      pick(arr) { return arr[Math.floor(r.next() * arr.length)]; },
    };
    return r;
  }

  // Distance minimale entre deux segments [p1,q1] et [p2,q2] (Ericson, Real-Time Collision Detection)
  function segSeg(p1, q1, p2, q2, c1, c2) {
    const d1x = q1.x - p1.x, d1y = q1.y - p1.y, d1z = q1.z - p1.z;
    const d2x = q2.x - p2.x, d2y = q2.y - p2.y, d2z = q2.z - p2.z;
    const rx = p1.x - p2.x, ry = p1.y - p2.y, rz = p1.z - p2.z;
    const a = d1x * d1x + d1y * d1y + d1z * d1z;
    const e = d2x * d2x + d2y * d2y + d2z * d2z;
    const f = d2x * rx + d2y * ry + d2z * rz;
    const EPS = 1e-9;
    let s, t;
    if (a <= EPS && e <= EPS) { s = 0; t = 0; }
    else if (a <= EPS) { s = 0; t = clamp(f / e, 0, 1); }
    else {
      const c = d1x * rx + d1y * ry + d1z * rz;
      if (e <= EPS) { t = 0; s = clamp(-c / a, 0, 1); }
      else {
        const b = d1x * d2x + d1y * d2y + d1z * d2z;
        const denom = a * e - b * b;
        s = denom > EPS ? clamp((b * f - c * e) / denom, 0, 1) : 0;
        t = (b * s + f) / e;
        if (t < 0) { t = 0; s = clamp(-c / a, 0, 1); }
        else if (t > 1) { t = 1; s = clamp((b - c) / a, 0, 1); }
      }
    }
    const x1 = p1.x + d1x * s, y1 = p1.y + d1y * s, z1 = p1.z + d1z * s;
    const x2 = p2.x + d2x * t, y2 = p2.y + d2y * t, z2 = p2.z + d2z * t;
    if (c1) { c1.x = x1; c1.y = y1; c1.z = z1; }
    if (c2) { c2.x = x2; c2.y = y2; c2.z = z2; }
    const dx = x1 - x2, dy = y1 - y2, dz = z1 - z2;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  G.U = { clamp, lerp, smooth, easeOut, easeIn, easeInOut, wrap, approach, approachAngle, damp, v3, V, toWorld, rng, segSeg, TAU, DEG: Math.PI / 180 };
})(typeof window !== 'undefined' ? window : globalThis);
