'use strict';
// LAMES D'ORAGE — intelligence artificielle (adversaire ordinateur). Produit les mêmes ordres qu'un joueur.
(function (root) {
  const G = root.G, U = G.U;
  const { clamp } = U;

  // niveaux : 0 Facile, 1 Normal, 2 Difficile, 3 Maître
  const LEVELS = [
    { name: 'Facile', react: 26, block: 0.3, lowRead: 0.15, parry: 0.0, side: 0.08, duck: 0.05, interrupt: 0.04, punish: 0.2, juggle: 0.25, string: 0.45, tech: 0.15, throwBreak: 0.1, aggr: 0.03, circle: 0.12, turtle: 0.05, superP: 0.15, tick: [24, 46] },
    { name: 'Normal', react: 17, block: 0.55, lowRead: 0.4, parry: 0.04, side: 0.18, duck: 0.12, interrupt: 0.12, punish: 0.5, juggle: 0.55, string: 0.65, tech: 0.45, throwBreak: 0.3, aggr: 0.05, circle: 0.2, turtle: 0.1, superP: 0.45, tick: [16, 34] },
    { name: 'Difficile', react: 11, block: 0.75, lowRead: 0.65, parry: 0.1, side: 0.28, duck: 0.2, interrupt: 0.22, punish: 0.78, juggle: 0.8, string: 0.78, tech: 0.7, throwBreak: 0.5, aggr: 0.07, circle: 0.25, turtle: 0.12, superP: 0.75, tick: [12, 26] },
    { name: 'Maître', react: 7, block: 0.86, lowRead: 0.85, parry: 0.2, side: 0.33, duck: 0.25, interrupt: 0.28, punish: 0.95, juggle: 0.95, string: 0.88, tech: 0.92, throwBreak: 0.7, aggr: 0.09, circle: 0.28, turtle: 0.1, superP: 1, tick: [9, 20] },
  ];
  const DIRECT = ['H', 'V', 'K', '6H', '6V', '6K', '4H', '4V', '2H', '2V', '2K', 'T', 'HV', 'VK'];
  const RINGOUT = ['6K', '6H', '4H', '66V', '66H', '6V'];
  const N = 48;

  class AI {
    constructor(level, seed) {
      this.level = clamp(level | 0, 0, 3);
      this.p = LEVELS[this.level];
      this.rng = U.rng(seed || 12345);
      this.hist = []; for (let i = 0; i < N; i++) this.hist.push({ state: 'idle', moveId: -1, mf: 0 });
      this.hi = 0;
      this.out = { held: { fwd: false, back: false, lat: 0, guard: false, crouch: false }, cmds: [] };
      this.plan = 'wait'; this.planT = 0; this.planLat = 1;
      this.respId = -1; this.resp = null; this.punishId = -1; this.stringId = -1;
      this.opGuard = 0.2; this.opCrouch = 0.1; this.techTried = false; this.breakAt = -1; this.dashAtk = null;
    }

    think(m, me, op) {
      const o = this.out, H = o.held, cmds = o.cmds, p = this.p, R = this.rng;
      cmds.length = 0;
      H.fwd = H.back = H.guard = H.crouch = false; H.lat = 0;
      // perception retardée
      const sn = this.hist[this.hi];
      sn.state = op.state; sn.moveId = op.moveId; sn.mf = op.mf;
      this.hi = (this.hi + 1) % N;
      const seen = this.hist[(this.hi - 1 - p.react + N * 4) % N];
      if (m.phase !== 'fight') return o;

      const dist = U.V.distXZ(me.pos, op.pos);
      // statistiques sur le style adverse
      if (dist < 2.8) {
        const g = (op.state === 'guard' || op.state === 'blockstun') ? 1 : 0;
        this.opGuard += (g - this.opGuard) * 0.01;
        const c = op.isCrouchHurt() ? 1 : 0;
        this.opCrouch += (c - this.opCrouch) * 0.01;
      }

      // en l'air : rattrapage
      if (me.state === 'air') {
        if (me.vel.y < 0 && me.pos.y < 0.6 && !this.techTried) { this.techTried = true; if (R.chance(p.tech)) cmds.push({ t: 'tech' }); }
        return o;
      }
      this.techTried = false;
      if (me.state === 'thrown') {
        if (this.breakAt < 0) this.breakAt = R.chance(p.throwBreak) ? 3 + R.int(8) : 999;
        if (me.sf === this.breakAt) cmds.push({ t: 'throw' });
        return o;
      }
      this.breakAt = -1;
      if (me.state === 'down') { if (me.sf > 16 && R.chance(0.08)) H.lat = R.chance(0.5) ? 1 : -1; return o; }

      // suite d'enchaînement pendant mon propre coup
      if (me.state === 'attack' && me.move) {
        const mv = me.move;
        if (mv.next && !me.nextKey && me.mf >= mv.nextWin[0] + 1 && this.stringId !== me.moveId) {
          this.stringId = me.moveId;
          const contact = me.hitMask !== 0 || op.state === 'blockstun' || op.state === 'hitstun';
          if (R.chance(contact ? p.string : p.string * 0.3)) {
            const keys = Object.keys(mv.next);
            cmds.push({ t: 'atk', b: keys[R.int(keys.length)] });
          }
        }
        return o;
      }
      if (this.dashAtk && me.state === 'dash') {
        if (me.sf >= this.dashAtk.at) { cmds.push({ t: 'atk', b: this.dashAtk.b }); this.dashAtk = null; }
        return o;
      }
      this.dashAtk = null;
      if (!me.actionable() && me.state !== 'blockstun' && me.state !== 'hitstun' && me.state !== 'parry') return o;

      // ---- menace : l'adversaire attaque ----
      const tm = (op.state === 'attack' && op.move) ? op.move : null;
      const perceived = tm && seen.state === 'attack' && seen.moveId === op.moveId;
      if (perceived && dist < tm.reach + 0.7) {
        let h = null;
        for (const hh of tm.hits) if (hh.s + hh.a > op.mf) { h = hh; break; }
        if (h) {
          const until = (h.s - op.mf) / (op.spd || 1);
          if (this.respId !== op.moveId) { this.respId = op.moveId; this.resp = this.choose(tm, h, until, dist, me, op, m); }
          if (this.execResp(this.resp, until, H, cmds, me, op, m)) return o;
        }
      }
      if (me.state === 'blockstun' || me.state === 'hitstun') {
        // garder la garde un peu après un coup bloqué
        if (me.state === 'blockstun') { H.guard = true; H.crouch = me.crouching; }
        return o;
      }
      if (me.state === 'parry') return o;

      // ---- jongle ----
      if (op.state === 'air' && op.vel.y < 0.06 && op.pos.y < 1.6 && dist < 2.6 && op.hp > 0) {
        if (this.punishId !== op.moveId * 1000 + op.juggle && R.chance(p.juggle * 0.25)) {
          this.punishId = op.moveId * 1000 + op.juggle;
          const k = this.best(me, dist + 0.2, 20, ['V', 'H', '6H', 'K', '6V']);
          if (k) { this.issue(k, H, cmds); return o; }
        }
      }

      // ---- punition ----
      let left = 0;
      if (op.state === 'attack' && op.move && op.mf >= op.move.lastEnd) left = (op.move.total - op.mf) / (op.spd || 1);
      else if (op.state === 'stagger' || op.state === 'clash') left = op.stun;
      else if (op.state === 'parry' && op.sf > G.Sim.PARRY_OFF) left = G.Sim.PARRY_LEN - op.sf;
      else if (op.state === 'wallsplat') left = op.stun;
      if (left > 3 && seen.state === op.state) {
        const pid = op.moveId * 7 + (op.state === 'attack' ? 1 : 2);
        if (this.punishId !== pid) {
          this.punishId = pid;
          if (R.chance(p.punish)) {
            if (me.gauge >= 50 && left >= 13 && dist < 3.4 && R.chance(p.superP * 0.6)) { cmds.push({ t: 'super' }); return o; }
            const k = this.best(me, dist, left - 1, DIRECT.filter((x) => x !== 'T'));
            if (k) { this.issue(k, H, cmds); return o; }
          }
        }
      }

      // ---- neutre ----
      const ar = m.arena;
      const myEdge = ar.edgeDist(me.pos), opEdge = ar.edgeDist(op.pos);
      const pref = this.prefRange(me);
      this.planT--;
      if (this.planT <= 0) {
        const t = p.tick;
        this.planT = t[0] + R.int(t[1] - t[0]);
        const r = R.next();
        if (dist > pref + 0.5) this.plan = (dist > 4 && R.chance(0.35)) ? 'dash' : 'approach';
        else if (r < p.circle) { this.plan = 'circle'; this.planLat = R.chance(0.5) ? 1 : -1; }
        else if (r < p.circle + p.turtle) this.plan = 'guard';
        else if (dist < pref - 0.7 && R.chance(0.4)) this.plan = 'retreat';
        else if (R.chance(0.4)) this.plan = 'approach';
        else this.plan = 'wait';
      }
      switch (this.plan) {
        case 'approach': if (dist > pref - 0.2) H.fwd = true; break;
        case 'dash': cmds.push({ t: 'dash' }); this.plan = 'approach'; break;
        case 'retreat': H.back = true; break;
        case 'circle': H.lat = this.planLat; break;
        case 'guard': H.guard = true; H.crouch = R.chance(0.02) ? !H.crouch : false; break;
        default: break;
      }
      // éviter le bord : tourner vers le centre plutôt que reculer
      if (myEdge < 1.7) {
        H.back = false;
        const lat = this.latSign(me, op, m);
        if (lat !== 0) H.lat = lat;
        if (myEdge < 1.0 && dist > 1.2) H.fwd = true;
      }

      // ---- sort adverse qui arrive : garde ou pas de côté ----
      if (m.projs) for (const pr of m.projs) {
        if (pr.owner !== op) continue;
        const dx = me.pos.x - pr.x, dz = me.pos.z - pr.z, d = Math.hypot(dx, dz);
        if (d > 2.8 || pr.vx * dx + pr.vz * dz <= 0) continue;
        if (pr.P.life - pr.life < p.react * 0.6) continue;   // temps de réaction
        if (!this.projResp || this.projResp.id !== pr.id) this.projResp = { id: pr.id, t: R.chance(p.side + 0.1) ? 'side' : (R.chance(p.block + 0.15) ? 'block' : 'none'), done: false };
        const rr = this.projResp;
        if (rr.t === 'block') { H.guard = true; H.crouch = pr.h === 'low'; return o; }
        if (rr.t === 'side' && !rr.done && d < 2.0) { rr.done = true; cmds.push({ t: 'side', d: this.latSign(me, op, m) || 1 }); return o; }
      }
      // ---- attaque ----
      if (me.gauge >= 50 && me.eveil <= 0 && me.hp < me.maxHp * 0.45 && dist > 2.2 && R.chance(0.006 * p.superP)) { cmds.push({ t: 'eveil' }); return o; }
      if (me.gauge >= 50 && dist < 3.0 && dist > 1.4 && R.chance(0.0025 * p.superP)) { cmds.push({ t: 'super' }); return o; }
      if (R.chance(p.aggr)) {
        const k = this.pick(me, op, dist, opEdge, m);
        if (k) {
          if (k.startsWith('66')) { cmds.push({ t: 'dash' }); this.dashAtk = { b: k[2], at: 4 + R.int(5) }; }
          else this.issue(k, H, cmds);
          this.planT = Math.min(this.planT, 8);
        }
      }
      return o;
    }

    choose(tm, h, until, dist, me, op) {
      const p = this.p, R = this.rng;
      if (tm.k0 === 'throw') return { t: R.chance(p.duck) ? 'duck' : 'none' };
      if (tm.superStart) return { t: R.chance(p.side) ? 'side' : (R.chance(p.block) ? 'block' : 'none'), d: R.chance(0.5) ? 1 : -1 };
      const linear = h.k === 'v' || h.k === 't';
      const opts = [];
      if (!tm.noParry && p.parry > 0) opts.push(['parry', p.parry]);
      opts.push(['side', linear ? p.side : 0.02]);
      if (h.h === 'high') opts.push(['duck', p.duck]);
      const fast = this.fastest(me);
      if (fast && fast.first < until - 2 && fast.reach > dist) opts.push(['interrupt', p.interrupt]);
      opts.push(['block', p.block]);
      let sum = 0; for (const x of opts) sum += x[1];
      const none = Math.max(0.05, 1 - sum);
      let r = R.next() * (sum + none);
      let t = 'none';
      for (const x of opts) { if (r < x[1]) { t = x[0]; break; } r -= x[1]; }
      return {
        t, crouch: h.h === 'low' ? R.chance(p.lowRead) : (R.chance(0.05)),
        at: 3 + R.int(5), d: R.chance(0.5) ? 1 : -1, done: false, key: fast ? fast.key : 'H',
      };
    }
    execResp(r, until, H, cmds, me, op, m) {
      if (!r) return false;
      switch (r.t) {
        case 'block': H.guard = true; H.crouch = r.crouch; return true;
        case 'duck': H.crouch = true; return true;
        case 'parry': if (!r.done && until <= r.at) { r.done = true; cmds.push({ t: 'parry' }); } return true;
        case 'side': if (!r.done && until <= 10) { r.done = true; cmds.push({ t: 'side', d: this.latSign(me, op, m) || r.d }); } return true;
        case 'interrupt': if (!r.done) { r.done = true; this.issue(r.key, H, cmds); } return true;
        default: return false;
      }
    }
    issue(key, H, cmds) {
      let b = key;
      if (key === 'HV' || key === 'VK') { H.fwd = H.back = H.crouch = H.guard = false; H.lat = 0; cmds.push({ t: 'atk', b: key }); return; }
      if (key.length === 2 && key !== 'HH' && key !== 'VV') {
        const mod = key[0]; b = key[1];
        if (mod === '6') H.fwd = true; else if (mod === '4') H.back = true; else if (mod === '2') H.crouch = true;
        H.guard = false;
      } else { H.fwd = false; H.back = false; H.crouch = false; H.guard = false; H.lat = 0; }
      if (key === 'T') { cmds.push({ t: 'throw' }); return; }
      cmds.push({ t: 'atk', b });
    }
    fastest(me) {
      let best = null;
      for (const k of DIRECT) { const mv = me.char.moves[k]; if (mv && k !== 'T' && (!best || mv.first < best.first)) best = mv; }
      return best;
    }
    best(me, dist, maxStartup, keys) {
      let best = null, bs = -1;
      for (const k of keys) {
        const mv = me.char.moves[k];
        if (!mv || mv.first > maxStartup || mv.reach < dist + 0.05) continue;
        let s = mv.dmgTotal + (mv.eff === 'launch' ? 14 : 0) + (mv.eff === 'knock' ? 4 : 0);
        if (s > bs) { bs = s; best = k; }
      }
      return best;
    }
    prefRange(me) {
      if (!me._pref) {
        const mv = me.char.moves;
        me._pref = Math.max(1.1, ((mv.H.reach + mv.V.reach + mv.K.reach) / 3) * 0.88);
        if (me.char.family === 'Mage') me._pref = 3.2;   // le mage garde ses distances
      }
      return me._pref;
    }
    latSign(me, op, m) {
      // signe latéral qui rapproche du centre de l'arène (même convention que la simulation)
      let ax = op.pos.x - me.pos.x, az = op.pos.z - me.pos.z;
      const d = Math.hypot(ax, az) || 1; ax /= d; az /= d;
      let lx = -az, lz = ax;
      const cf = m.camFwd;
      if (cf && lx * cf.x + lz * cf.z < 0) { lx = -lx; lz = -lz; }
      const dot = (-me.pos.x) * lx + (-me.pos.z) * lz;
      return Math.abs(dot) < 0.3 ? 0 : (dot > 0 ? 1 : -1);
    }
    pick(me, op, dist, opEdge, m) {
      const R = this.rng, mv = me.char.moves;
      const pool = [];
      const add = (k, w) => { if (mv[k] && w > 0) pool.push([k, w]); };
      // pousser vers le vide ?
      let pushOut = false;
      if (opEdge < 2.3) {
        const res = m.arena.worst(op.pos), e = m.arena.edges[res.e];
        const ax = op.pos.x - me.pos.x, az = op.pos.z - me.pos.z, l = Math.hypot(ax, az) || 1;
        pushOut = !e.wall && (ax / l * e.nx + az / l * e.nz) > 0.5;
      }
      for (const k of DIRECT) {
        const x = mv[k];
        if (!x) continue;
        if (k === 'T') { if (dist < 1.05) add('T', 0.5 + this.opGuard * 3); continue; }
        if (x.reach < dist + 0.05) continue;
        if (!x.proj && x.reach > dist + 2.2 && x.first > 16) continue;
        let w = 1;
        if (x.proj) w *= dist > 2.2 ? 4 : 0.3;   // sorts : à distance
        if (x.h0 === 'low') w *= 0.7 + this.opGuard * 2.5;
        if (x.h0 === 'mid') w *= 1 + this.opCrouch * 2;
        if (x.h0 === 'high') w *= Math.max(0.2, 1 - this.opCrouch * 2);
        if (x.first <= 12) w *= 1.6;
        if (x.first >= 20) w *= 0.6;
        if (pushOut && RINGOUT.includes(k)) w *= 4;
        add(k, w);
      }
      if (dist > 2.2 && dist < 4.2) { add('66V', pushOut ? 2 : 0.6); add('66H', 0.5); }
      if (!pool.length) return null;
      let sum = 0; for (const x of pool) sum += x[1];
      let r = R.next() * sum;
      for (const x of pool) { if (r < x[1]) return x[0]; r -= x[1]; }
      return pool[0][0];
    }
  }

  // Mannequin d'entraînement
  function dummyInput(mode, me, op, out) {
    const H = out.held; out.cmds.length = 0;
    H.fwd = H.back = H.guard = H.crouch = false; H.lat = 0;
    if (mode === 'guard' || mode === 'guardAll') {
      H.guard = true;
      if (op.state === 'attack' && op.move) {
        let h = null; for (const hh of op.move.hits) if (hh.s + hh.a > op.mf) { h = hh; break; }
        if (h) H.crouch = h.h === 'low';
      }
    } else if (mode === 'crouch') H.crouch = true;
    if (me.state === 'air' && me.vel.y < 0 && me.pos.y < 0.5) out.cmds.push({ t: 'tech' });
    return out;
  }

  G.AI = AI;
  G.AI_LEVELS = LEVELS;
  G.dummyInput = dummyInput;
})(typeof window !== 'undefined' ? window : globalThis);
