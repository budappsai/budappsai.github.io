'use strict';
// LAMES D'ORAGE — animation procédurale : poses des mains/arme/pieds en repère local.
// Utilisé par la simulation (positions de l'arme pour les touches) ET par le rendu (cinématique inverse).
(function (root) {
  const G = root.G, U = G.U;
  const { clamp, lerp, smooth, easeOut, easeIn, easeInOut } = U;
  const DEG = Math.PI / 180;

  // ---------- vecteurs / bras ----------
  const v = (x = 0, y = 0, z = 0) => ({ x, y, z });
  function vset(o, x, y, z) { o.x = x; o.y = y; o.z = z; return o; }
  function vcopy(o, a) { o.x = a.x; o.y = a.y; o.z = a.z; return o; }
  function vlerp(o, a, b, t) { o.x = a.x + (b.x - a.x) * t; o.y = a.y + (b.y - a.y) * t; o.z = a.z + (b.z - a.z) * t; return o; }
  function vnorm(o) { const l = Math.sqrt(o.x * o.x + o.y * o.y + o.z * o.z) || 1; o.x /= l; o.y /= l; o.z /= l; return o; }
  const arm = () => ({ hand: v(), dir: v(0, 1, 0), edge: v(0, 0, 1) });
  function armCopy(o, a) { vcopy(o.hand, a.hand); vcopy(o.dir, a.dir); vcopy(o.edge, a.edge); return o; }
  function fixEdge(o) {
    const d = o.dir, e = o.edge;
    let k = e.x * d.x + e.y * d.y + e.z * d.z;
    e.x -= d.x * k; e.y -= d.y * k; e.z -= d.z * k;
    let l = Math.sqrt(e.x * e.x + e.y * e.y + e.z * e.z);
    if (l < 1e-4) { // dégénéré : on prend un axe perpendiculaire quelconque
      if (Math.abs(d.y) < 0.9) vset(e, 0, 1, 0); else vset(e, 0, 0, 1);
      k = e.x * d.x + e.y * d.y + e.z * d.z; e.x -= d.x * k; e.y -= d.y * k; e.z -= d.z * k;
      l = Math.sqrt(e.x * e.x + e.y * e.y + e.z * e.z) || 1;
    }
    e.x /= l; e.y /= l; e.z /= l;
    return o;
  }
  function armBlend(o, a, b, t) {
    vlerp(o.hand, a.hand, b.hand, t);
    vlerp(o.dir, a.dir, b.dir, t); vnorm(o.dir);
    vlerp(o.edge, a.edge, b.edge, t);
    return fixEdge(o);
  }
  function mkArm(hand, dir, edgeHint) {
    const o = arm();
    vset(o.hand, hand[0], hand[1], hand[2]);
    vset(o.dir, dir[0], dir[1], dir[2]); vnorm(o.dir);
    const eh = edgeHint || (Math.abs(o.dir.z) > 0.85 ? [0, 1, 0] : [0, 0, 1]);
    vset(o.edge, eh[0], eh[1], eh[2]);
    return fixEdge(o);
  }

  // ---------- poses de référence par type d'arme ----------
  const T = {
    stance: {
      sword: { R: mkArm([-0.07, 1.15, 0.34], [0.06, 0.8, 0.6]) },
      spear: { R: mkArm([-0.17, 1.02, -0.02], [0.05, 0.16, 1]) },
      axe: { R: mkArm([-0.05, 1.2, 0.3], [0.1, 0.9, 0.42]) },
      twin: { R: mkArm([-0.21, 1.12, 0.3], [-0.08, 0.35, 1]), L: mkArm([0.19, 1.24, 0.18], [0.12, 0.85, 0.5]) },
      staff: { R: mkArm([-0.18, 1.08, 0.2], [0.12, 0.82, 0.5]) },
    },
    guard: {
      sword: { R: mkArm([-0.03, 1.3, 0.33], [0.85, 0.45, 0.12]) },
      spear: { R: mkArm([-0.22, 1.18, 0.12], [0.8, 0.52, 0.25]) },
      axe: { R: mkArm([-0.2, 1.22, 0.3], [-0.75, 0.62, 0.15]) },
      twin: { R: mkArm([-0.08, 1.3, 0.3], [0.62, 0.72, 0.2]), L: mkArm([0.08, 1.27, 0.32], [-0.62, 0.72, 0.2]) },
      staff: { R: mkArm([-0.18, 1.22, 0.24], [0.85, 0.48, 0.2]) },
    },
    parry: {
      sword: { R: mkArm([-0.02, 1.36, 0.42], [0.55, 0.8, 0.25]) },
      spear: { R: mkArm([-0.2, 1.25, 0.18], [0.75, 0.6, 0.3]) },
      axe: { R: mkArm([-0.15, 1.3, 0.38], [-0.6, 0.75, 0.3]) },
      twin: { R: mkArm([-0.1, 1.38, 0.38], [0.5, 0.82, 0.3]), L: mkArm([0.1, 1.32, 0.4], [-0.5, 0.82, 0.3]) },
      staff: { R: mkArm([-0.16, 1.3, 0.3], [0.7, 0.66, 0.3]) },
    },
    victory: {
      sword: { R: mkArm([-0.05, 1.95, 0.12], [0.05, 1, 0.15]) },
      spear: { R: mkArm([-0.22, 1.3, 0.22], [0.0, 1, 0.08]) },
      axe: { R: mkArm([-0.05, 1.95, 0.1], [0.08, 1, 0.12]) },
      twin: { R: mkArm([-0.1, 1.9, 0.12], [0.05, 1, 0.1]), L: mkArm([0.24, 1.0, 0.12], [0.2, -0.7, 0.6]) },
      staff: { R: mkArm([-0.15, 1.6, 0.15], [0.0, 1, 0.06]) },
    },
    intro: {
      sword: { R: mkArm([-0.12, 1.28, 0.18], [-0.1, 0.55, -0.83]) },
      spear: { R: mkArm([-0.24, 1.15, 0.22], [0.02, 1, 0.05]) },
      axe: { R: mkArm([-0.12, 1.32, 0.15], [-0.15, 0.5, -0.85]) },
      twin: { R: mkArm([-0.22, 1.0, 0.12], [0, -0.6, 0.8]), L: mkArm([0.22, 1.0, 0.12], [0, -0.6, 0.8]) },
      staff: { R: mkArm([-0.24, 1.08, 0.18], [0.02, 1, 0.05]) },
    },
    freeL: mkArm([0.25, 1.05, 0.15], [0, -1, 0.2]),
  };

  // ---------- évaluation d'un segment (arc ou ligne) ----------
  function segEval(sg, p, o) {
    if (sg.type === 'arc') {
      const yaw = (sg.yaw || 0) * DEG, tilt = sg.tilt * DEG;
      const cyw = Math.cos(yaw), syw = Math.sin(yaw);
      const ct = Math.cos(tilt), st = Math.sin(tilt);
      const e2x = ct * cyw, e2y = st, e2z = -ct * syw;
      const th = p * DEG, c = Math.cos(th), s = Math.sin(th);
      const dx = c * syw + s * e2x, dy = s * e2y, dz = c * cyw + s * e2z;
      vset(o.dir, dx, dy, dz);
      vset(o.hand, sg.c[0] + dx * sg.r, sg.c[1] + dy * sg.r, sg.c[2] + dz * sg.r);
      const sgn = sg.to >= sg.from ? 1 : -1;
      vset(o.edge, (-s * syw + c * e2x) * sgn, (c * e2y) * sgn, (-s * cyw + c * e2z) * sgn);
    } else {
      const f = sg.from, t = sg.to;
      vset(o.hand, f[0] + (t[0] - f[0]) * p, f[1] + (t[1] - f[1]) * p, f[2] + (t[2] - f[2]) * p);
      vset(o.dir, sg.d[0], sg.d[1], sg.d[2]);
      vset(o.edge, sg.left ? -1 : 1, 0.15, 0); fixEdge(o);
    }
    return o;
  }

  const TA = arm(), TB = arm(), TC = arm();
  // Séquence de segments d'un bras à l'image f (approche -> armé -> frappe -> accompagnement -> retour)
  function armSeq(seq, f, total, stance, o) {
    let k = 0;
    while (k < seq.length && f >= seq[k].s + seq[k].a) k++;
    if (k < seq.length) {
      const sg = seq[k];
      if (f >= sg.s) {
        const u = clamp((f - sg.s) / sg.a, 0, 1);
        return segEval(sg, lerp(sg.ps, sg.pe, u), o);
      }
      const t0 = k === 0 ? 0 : seq[k - 1].s + seq[k - 1].a;
      const prev = k === 0 ? stance : segEval(seq[k - 1], lerp(seq[k - 1].pe, seq[k - 1].pf, 0.5), TA);
      const q = clamp((f - t0) / Math.max(1, sg.s - t0), 0, 1);
      if (q < 0.72) {
        segEval(sg, sg.pw, TB);
        return armBlend(o, prev, TB, easeOut(q / 0.72));
      }
      return segEval(sg, lerp(sg.pw, sg.ps, easeIn((q - 0.72) / 0.28)), o);
    }
    const last = seq[seq.length - 1];
    const t0 = last.s + last.a;
    const q = clamp((f - t0) / Math.max(1, total - t0), 0, 1);
    if (q < 0.35) return segEval(last, lerp(last.pe, last.pf, easeOut(q / 0.35)), o);
    segEval(last, last.pf, TC);
    return armBlend(o, TC, stance, smooth((q - 0.35) / 0.65));
  }

  // poids du corps pendant un coup (0 -> 1 -> 0)
  function bodyWeight(m, f) {
    const s0 = m.first, e = m.lastEnd, tot = m.total;
    if (f < s0) return easeOut(clamp((f - s0 * 0.35) / (s0 * 0.65), 0, 1));
    const hold = e + (tot - e) * 0.3;
    if (f < hold) return 1;
    return 1 - smooth((f - hold) / Math.max(1, tot - hold));
  }

  // ---------- pose complète ----------
  function newPose() {
    return {
      hipX: 0, hipY: 0.88, hipZ: 0, hipYaw: 0, twist: 0, pitch: 0, roll: 0, headYaw: 0, headPitch: 0,
      R: arm(), L: arm(), h2mode: 0, footL: v(), footR: v(), bodyYaw: 0, tumble: 0, pivotY: 0.95, crouch: 0,
    };
  }
  function poseCopy(o, a) {
    o.hipX = a.hipX; o.hipY = a.hipY; o.hipZ = a.hipZ; o.hipYaw = a.hipYaw; o.twist = a.twist; o.pitch = a.pitch; o.roll = a.roll;
    o.headYaw = a.headYaw; o.headPitch = a.headPitch; armCopy(o.R, a.R); armCopy(o.L, a.L); o.h2mode = a.h2mode;
    vcopy(o.footL, a.footL); vcopy(o.footR, a.footR); o.bodyYaw = a.bodyYaw; o.tumble = a.tumble; o.pivotY = a.pivotY; o.crouch = a.crouch;
    return o;
  }
  function poseBlend(o, a, b, t) {
    o.hipX = lerp(a.hipX, b.hipX, t); o.hipY = lerp(a.hipY, b.hipY, t); o.hipZ = lerp(a.hipZ, b.hipZ, t);
    o.hipYaw = lerp(a.hipYaw, b.hipYaw, t); o.twist = lerp(a.twist, b.twist, t); o.pitch = lerp(a.pitch, b.pitch, t); o.roll = lerp(a.roll, b.roll, t);
    o.headYaw = lerp(a.headYaw, b.headYaw, t); o.headPitch = lerp(a.headPitch, b.headPitch, t);
    armBlend(o.R, a.R, b.R, t); armBlend(o.L, a.L, b.L, t); o.h2mode = t < 0.5 ? a.h2mode : b.h2mode;
    vlerp(o.footL, a.footL, b.footL, t); vlerp(o.footR, a.footR, b.footR, t);
    o.bodyYaw = lerp(a.bodyYaw, b.bodyYaw, t); o.tumble = lerp(a.tumble, b.tumble, t); o.pivotY = lerp(a.pivotY, b.pivotY, t); o.crouch = lerp(a.crouch, b.crouch, t);
    return o;
  }

  function baseStance(o, F) {
    const W = F.char.W, st = T.stance[W.kind];
    o.hipX = 0; o.hipY = 0.88; o.hipZ = 0; o.hipYaw = 0.22; o.twist = -0.12; o.pitch = 0.05; o.roll = 0;
    o.headYaw = 0; o.headPitch = 0; o.bodyYaw = 0; o.tumble = 0; o.pivotY = 0.95; o.crouch = 0;
    armCopy(o.R, st.R);
    if (st.L) { armCopy(o.L, st.L); o.h2mode = 2; } else { armCopy(o.L, T.freeL); o.h2mode = W.twoHand ? 0 : 1; }
    vset(o.footL, 0.13, 0, 0.27); vset(o.footR, -0.17, 0, -0.21);
    // respiration
    const br = Math.sin((F.age || 0) * 0.06);
    o.hipY += br * 0.008; o.R.hand.y += br * 0.01; o.L.hand.y += br * 0.01;
    return o;
  }
  function crouchify(o, amt) {
    o.hipY = lerp(o.hipY, 0.56, amt); o.pitch += 0.16 * amt; o.crouch = amt;
    o.footL.x += 0.07 * amt; o.footL.z += 0.03 * amt; o.footR.x -= 0.05 * amt; o.footR.z += 0.03 * amt;
    o.R.hand.y -= 0.3 * amt; o.L.hand.y -= 0.3 * amt;
  }
  function setArms(o, set) {
    armCopy(o.R, set.R);
    if (set.L) { armCopy(o.L, set.L); o.h2mode = 2; }
  }
  function blendArms(o, set, t) {
    armBlend(o.R, o.R, set.R, t);
    if (set.L) armBlend(o.L, o.L, set.L, t);
  }
  function walkCycle(o, F, ff) {
    const ch = F.char;
    const vf = (F.lvF || 0) / ch.walk, vl = (F.lvL || 0) / ch.side;
    const amt = clamp(Math.hypot(vf, vl), 0, 1.6);
    if (amt < 0.03) return;
    const ph = (F.gait || 0) + ff * (F.gaitRate || 0);
    const s = Math.sin(ph), c = Math.cos(ph);
    const af = clamp(vf, -1.6, 1.6), al = clamp(vl, -1.6, 1.6);
    o.footL.z += s * 0.22 * af; o.footR.z -= s * 0.22 * af;
    o.footL.x += s * 0.15 * al; o.footR.x -= s * 0.15 * al;
    const lift = 0.1 * Math.min(1.2, amt);
    o.footL.y += Math.max(0, c) * lift; o.footR.y += Math.max(0, -c) * lift;
    o.hipY -= Math.abs(s) * 0.025 * Math.min(1, amt);
    o.pitch += af * 0.05; o.roll -= al * 0.05;
  }
  function kickPose(o, m, f) {
    const k = m.kick, h = m.hits[0];
    const s = h.s, e = h.s + h.a, tot = m.total;
    const foot = k.leg === 'L' ? o.footL : o.footR;
    const bx = foot.x, by = foot.y, bz = foot.z;
    const ch = k.ch, ex = k.ext;
    let px, py, pz, t;
    const L3 = (a0, a1, a2, b0, b1, b2, tt) => { px = a0 + (b0 - a0) * tt; py = a1 + (b1 - a1) * tt; pz = a2 + (b2 - a2) * tt; };
    if (f < s) {
      const q = f / s;
      if (q < 0.7) L3(bx, by, bz, ch[0], ch[1], ch[2], easeOut(q / 0.7));
      else { t = easeIn((q - 0.7) / 0.3) * 0.3; L3(ch[0], ch[1], ch[2], ex[0], ex[1], ex[2], t); }
    } else if (f < e) {
      t = 0.3 + 0.7 * ((f - s) / h.a); L3(ch[0], ch[1], ch[2], ex[0], ex[1], ex[2], t);
    } else {
      const q = (f - e) / Math.max(1, tot - e);
      if (q < 0.3) L3(ex[0], ex[1], ex[2], ch[0], ch[1], ch[2], easeOut(q / 0.3));
      else L3(ch[0], ch[1], ch[2], bx, by, bz, smooth((q - 0.3) / 0.7));
    }
    vset(foot, px, py, pz);
    const w = bodyWeight(m, f);
    o.hipYaw += (k.leg === 'R' ? -0.45 : 0.25) * w;
    o.hipY -= 0.03 * w;
  }

  const TP = newPose();
  function movePose(o, F, m, f) {
    const W = F.char.W, st = T.stance[W.kind];
    if (m.crouch) crouchify(o, 1);
    const stR = TA2; armCopy(stR, o.R);
    const stL = TB2; armCopy(stL, o.L);
    if (m.arm) armSeq(m.arm, f, m.total, stR, o.R);
    if (m.arm2) { armSeq(m.arm2, f, m.total, stL, o.L); o.h2mode = 2; }
    if (m.grab) {
      const w = bodyWeight(m, f);
      vset(TC2.hand, -0.13, 1.28, 0.52); vset(TC2.dir, -0.2, -0.5, 0.5); vnorm(TC2.dir); vset(TC2.edge, 0, 0, 1); fixEdge(TC2);
      armBlend(o.R, o.R, TC2, w);
      vset(TC2.hand, 0.13, 1.28, 0.52); vset(TC2.dir, 0, -1, 0.2); vnorm(TC2.dir); fixEdge(TC2);
      armBlend(o.L, o.L, TC2, w); o.h2mode = st.L ? 2 : 1;
      o.pitch += 0.15 * w; o.hipZ += 0.1 * w;
    }
    const w = bodyWeight(m, f), b = m.body || {};
    o.hipY -= (b.drop || 0) * w;
    o.hipZ += (b.step || 0) * 0.45 * w;
    o.footL.z += (b.step || 0) * w;
    o.footR.z -= (b.step || 0) * 0.15 * w;
    o.pitch += (b.lean || 0) * w;
    // torsion et inclinaison automatiques d'après la main qui frappe
    let useL = false;
    if (m.arm2) {
      let lastSeg = null;
      for (const h of m.hits) if (f >= h.s - 4) lastSeg = h.seg;
      useL = lastSeg === 'L' || !m.arm;
    }
    const hd = useL ? o.L.hand : o.R.hand;
    if (m.arm || m.arm2) {
      const hx = hd.x, hy = hd.y, hz = hd.z;
      const hor = Math.hypot(hx, hz);
      const wt = clamp(1 - Math.abs(hy - 1.25) / 0.7, 0, 1) * clamp(hor / 0.35, 0, 1);
      const az = Math.atan2(hx, Math.max(-0.4, hz));
      o.twist = lerp(o.twist, clamp(az * 0.55, -0.9, 0.9), wt * Math.max(w, 0.5));
      o.pitch += clamp((1.25 - hy) * 0.32, -0.25, 0.32) * w;
    }
    if (m.spin) {
      const sp = m.spin, t = clamp((f - sp.s) / Math.max(1, sp.e - sp.s), 0, 1);
      o.bodyYaw = easeInOut(t) * sp.turns * Math.PI * 2;
    }
    if (m.kick) {
      kickPose(o, m, f);
      blendArms(o, T.guard[W.kind], 0.45 * w);
    }
  }
  const TA2 = arm(), TB2 = arm(), TC2 = arm();

  function downPose(o, F) {
    baseStance(o, F);
    o.tumble = -1.5; o.pivotY = 0.2; o.hipY = 0.93; o.hipYaw = 0; o.twist = 0; o.pitch = 0;
    vset(o.footL, 0.17, 0.03, 0.1); vset(o.footR, -0.19, 0.02, 0.0);
    vset(o.R.hand, -0.48, 1.25, 0.1); vset(o.R.dir, -0.3, 0.2, 0.9); vnorm(o.R.dir); fixEdge(o.R);
    vset(o.L.hand, 0.46, 1.28, 0.08); if (o.h2mode !== 2) o.h2mode = 1;
    o.headPitch = 0.2;
  }

  // pose complète du combattant F, ff = fraction d'image (interpolation de rendu)
  function pose(F, ff, o) {
    const W = F.char.W, kind = W.kind;
    baseStance(o, F);
    const sf = F.sf + ff;
    switch (F.state) {
      case 'idle':
        walkCycle(o, F, ff); break;
      case 'crouch':
        crouchify(o, clamp(sf / 4, 0, 1)); break;
      case 'guard': case 'blockstun':
        setArms(o, T.guard[kind]);
        if (F.crouching) { crouchify(o, 1); o.R.hand.y -= 0.05; o.L.hand.y -= 0.05; }
        if (F.state === 'blockstun') { o.pitch -= 0.12; o.R.hand.z -= 0.06; o.hipZ -= 0.05; }
        walkCycle(o, F, ff);
        break;
      case 'dash':
        walkCycle(o, F, ff); o.pitch += 0.28; o.hipY -= 0.06; blendArms(o, T.guard[kind], 0.2); break;
      case 'backdash':
        walkCycle(o, F, ff); o.pitch -= 0.15; o.hipY -= 0.04; break;
      case 'sidestep':
        walkCycle(o, F, ff); o.hipY -= 0.08 * Math.sin(Math.PI * clamp(sf / 16, 0, 1)); break;
      case 'attack':
        if (F.move) movePose(o, F, F.move, F.mf + ff * (F.spd || 1));
        break;
      case 'super':
        if (F.move) movePose(o, F, F.move, F.mf + ff);
        break;
      case 'hitstun': case 'superHit': case 'thrown': {
        o.pitch -= 0.22; o.hipZ -= 0.08; o.headPitch = -0.25;
        o.R.hand.y -= 0.2; o.R.hand.z -= 0.08; o.L.hand.y -= 0.15;
        if (F.crouching) crouchify(o, 1);
        if (F.state !== 'hitstun') { const sh = Math.sin(sf * 1.9) * 0.06; o.roll += sh; o.pitch -= 0.08; }
        break;
      }
      case 'stagger': {
        const wob = Math.sin(sf * 0.22);
        o.pitch -= 0.35; o.roll += wob * 0.14; o.hipZ -= 0.1; o.headPitch = -0.3;
        vset(o.R.hand, -0.36, 1.48, -0.04); vset(o.R.dir, -0.3, 0.9, -0.3); vnorm(o.R.dir); fixEdge(o.R);
        if (o.h2mode !== 2) { vset(o.L.hand, 0.32, 1.4, 0.0); o.h2mode = 1; } else vset(o.L.hand, 0.32, 1.4, 0.0);
        break;
      }
      case 'clash':
        o.pitch -= 0.2; o.R.hand.z -= 0.12; o.R.hand.y += 0.12; o.R.dir.z -= 0.4; vnorm(o.R.dir); fixEdge(o.R); o.hipZ -= 0.06; break;
      case 'parry': {
        const t = sf < 3 ? sf / 3 : sf > 16 ? 1 - (sf - 16) / 8 : 1;
        blendArms(o, T.parry[kind], easeOut(clamp(t, 0, 1)));
        o.pitch -= 0.05; o.twist += 0.2 * clamp(t, 0, 1);
        break;
      }
      case 'parryOk': {
        const t = clamp(sf / 6, 0, 1);
        setArms(o, T.parry[kind]);
        segEval(PARRY_ARC, lerp(PARRY_ARC.ps, PARRY_ARC.pe, easeOut(t)), TA);
        armBlend(o.R, o.R, TA, sf < 10 ? 1 : 1 - clamp((sf - 10) / 6, 0, 1));
        o.twist += 0.35 * (1 - clamp((sf - 8) / 8, 0, 1));
        break;
      }
      case 'eveil': {
        const t = sf < 6 ? easeOut(sf / 6) : sf > 18 ? 1 - smooth((sf - 18) / 6) : 1;
        blendArms(o, T.victory[kind], t); o.pitch -= 0.15 * t; o.headPitch = -0.3 * t; o.hipY -= 0.05 * t;
        break;
      }
      case 'air': case 'ringout': {
        o.tumble = (F.tumble || 0) + ff * (F.tumbleV || 0);
        o.pitch -= 0.1; o.headPitch = -0.2;
        vset(o.footL, 0.16, 0.38, 0.28); vset(o.footR, -0.16, 0.3, 0.06);
        vset(o.R.hand, -0.42, 1.36, 0.02); if (o.h2mode !== 2) o.h2mode = 1; vset(o.L.hand, 0.42, 1.36, 0.02);
        if (F.state === 'ringout') { const fl = Math.sin(sf * 0.5); o.R.hand.y += fl * 0.15; o.L.hand.y -= fl * 0.15; }
        break;
      }
      case 'wallsplat':
        o.pitch -= 0.3; o.hipZ -= 0.1; vset(o.R.hand, -0.4, 1.4, -0.05); if (o.h2mode !== 2) o.h2mode = 1; vset(o.L.hand, 0.4, 1.4, -0.05); break;
      case 'down': case 'ko':
        downPose(o, F); break;
      case 'getup': case 'tech': {
        const dur = F.state === 'tech' ? 14 : 20;
        downPose(TP, F);
        const t = easeOut(clamp(sf / dur, 0, 1));
        poseBlend(o, TP, o, t);
        if (F.state === 'tech') o.roll += Math.sin(t * Math.PI) * 0.6;
        break;
      }
      case 'throw': {
        vset(TC2.hand, -0.13, 1.28, 0.52); vset(TC2.dir, -0.2, -0.5, 0.5); vnorm(TC2.dir); vset(TC2.edge, 0, 0, 1); fixEdge(TC2);
        armCopy(o.R, TC2);
        vset(o.L.hand, 0.13, 1.28, 0.52); if (o.h2mode !== 2) o.h2mode = 1;
        o.pitch += 0.12;
        if (sf > 30 && sf < 44) { const t = Math.sin(clamp((sf - 30) / 14, 0, 1) * Math.PI); o.R.hand.z += 0.18 * t; o.L.hand.z += 0.2 * t; o.pitch += 0.2 * t; o.footL.z += 0.25 * t; }
        if (sf >= 44) { const t = smooth((sf - 44) / 8); baseStance(TP, F); poseBlend(o, o, TP, t); }
        break;
      }
      case 'victory': {
        const t = easeOut(clamp(sf / 20, 0, 1));
        blendArms(o, T.victory[kind], t);
        o.pitch -= 0.08 * t; o.headPitch = -0.15 * t; o.hipYaw = lerp(o.hipYaw, 0.05, t); o.twist = lerp(o.twist, 0, t);
        vset(o.footL, lerp(0.13, 0.12, t), 0, lerp(0.27, 0.12, t)); vset(o.footR, lerp(-0.17, -0.14, t), 0, lerp(-0.21, -0.1, t));
        o.hipY = lerp(o.hipY, 0.93, t);
        break;
      }
      case 'intro':
        setArms(o, T.intro[kind]); o.hipY = 0.92; o.hipYaw = 0.1; o.twist = 0;
        vset(o.footL, 0.12, 0, 0.12); vset(o.footR, -0.14, 0, -0.08);
        break;
      default: break;
    }
    return o;
  }
  const PARRY_ARC = arc0({ tilt: 35, from: -30, to: 115, wind: -10, follow: 15, c: [-0.06, 1.3, 0.1], r: 0.45 });
  function arc0(o) {
    const sg = Object.assign({ type: 'arc', yaw: 0 }, o);
    sg.pw = sg.from + sg.wind; sg.ps = sg.from; sg.pe = sg.to; sg.pf = sg.to + sg.follow;
    return sg;
  }

  // ---------- segments de touche (repère monde) ----------
  const SA = arm();
  const LP = v(), LQ = v();
  // remplit out[] avec {a,b,r,hit} pour les fenêtres actives à l'image f ; retourne le nombre
  function hitSegs(F, m, f, out, pos, yaw, mask) {
    const W = F.char.W, sc = F.char.scale || 1;
    let n = 0;
    let spin = 0;
    if (m.spin) { const sp = m.spin; spin = easeInOut(clamp((f - sp.s) / Math.max(1, sp.e - sp.s), 0, 1)) * sp.turns * Math.PI * 2; }
    const yw = yaw + spin;
    const st = T.stance[W.kind];
    for (let i = 0; i < m.hits.length; i++) {
      const h = m.hits[i];
      if (mask & (1 << i)) continue;
      if (f < h.s || f > h.s + h.a) continue;
      if (h.k === 'throw') continue;
      const o = out[n] || (out[n] = { a: v(), b: v(), r: 0, hit: 0, kick: false });
      if (h.seg === 'K') {
        // jambe : pied -> vers la hanche
        baseStance(TP, F);
        kickPose(TP, m, f);
        const foot = m.kick.leg === 'L' ? TP.footL : TP.footR;
        vset(LP, foot.x, foot.y + 0.07, foot.z);
        const hx = m.kick.leg === 'L' ? 0.1 : -0.1;
        vset(LQ, LP.x + (hx - LP.x) * 0.45, LP.y + (0.84 - LP.y) * 0.45, LP.z + (0 - LP.z) * 0.45);
        U.toWorld(o.a, LP, pos, yw, sc); U.toWorld(o.b, LQ, pos, yw, sc);
        o.r = 0.12 * sc; o.kick = true;
      } else {
        const seq = h.seg === 'L' ? m.arm2 : m.arm;
        if (!seq) continue;
        armSeq(seq, f, m.total, h.seg === 'L' ? (st.L || st.R) : st.R, SA);
        vset(LP, SA.hand.x + SA.dir.x * W.hitFrom, SA.hand.y + SA.dir.y * W.hitFrom, SA.hand.z + SA.dir.z * W.hitFrom);
        vset(LQ, SA.hand.x + SA.dir.x * W.L, SA.hand.y + SA.dir.y * W.L, SA.hand.z + SA.dir.z * W.L);
        if (m.crouch) { /* positions déjà basses par construction */ }
        U.toWorld(o.a, LP, pos, yw, sc); U.toWorld(o.b, LQ, pos, yw, sc);
        o.r = W.hitR * sc; o.kick = false;
      }
      o.hit = i;
      n++;
    }
    return n;
  }

  // pose analytique de l'arme (pour les traînées) : remplit out {base, tip} en local ; retourne false si pas d'arme active
  function weaponLocal(F, m, f, left, outArm) {
    const W = F.char.W, st = T.stance[W.kind];
    const seq = left ? m.arm2 : m.arm;
    if (!seq) return false;
    armSeq(seq, f, m.total, left ? (st.L || st.R) : st.R, outArm);
    return true;
  }
  function spinAt(m, f) {
    if (!m.spin) return 0;
    const sp = m.spin;
    return easeInOut(clamp((f - sp.s) / Math.max(1, sp.e - sp.s), 0, 1)) * sp.turns * Math.PI * 2;
  }

  // ---------- analyse des coups (portée, etc.) pour l'IA et l'affichage ----------
  function lungeAt(m, f) {
    if (!m.lunge) return 0;
    const [a, b, d] = m.lunge;
    return d * clamp((f - a) / Math.max(1, b - a), 0, 1);
  }
  function analyze(ch) {
    const fake = { char: ch, state: 'attack', sf: 0, age: 0 };
    const pos = v(), out = [];
    for (const key of Object.keys(ch.moves)) {
      const m = ch.moves[key];
      let reach = 0, minY = 9, maxY = -9;
      for (let f = m.first; f <= m.lastEnd; f += 0.5) {
        const n = hitSegs(fake, m, f, out, pos, 0, 0);
        const lg = lungeAt(m, f);
        for (let i = 0; i < n; i++) {
          for (const p of [out[i].a, out[i].b]) {
            reach = Math.max(reach, Math.hypot(p.x, p.z + lg) + out[i].r);
            minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
          }
        }
      }
      if (m.hits[0].k === 'throw') reach = 1.15;
      if (m.proj) reach = Math.max(reach, m.proj[0].speed * m.proj[0].life * 0.75);
      m.reach = reach + 0.3;
      m.minY = minY; m.maxY = maxY;
      m.wide = (m.k0 === 'h') || !!m.spin;
    }
  }
  G.CHARS.forEach(analyze);

  G.Anim = { pose, newPose, poseCopy, poseBlend, hitSegs, weaponLocal, spinAt, armSeq, segEval, arm, T, lungeAt, bodyWeight };
})(typeof window !== 'undefined' ? window : globalThis);
