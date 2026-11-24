'use strict';
// LAMES D'ORAGE — simulation du combat (pas fixe 60 i/s, déterministe, sans rendu).
(function (root) {
  const G = root.G, U = G.U, A = G.Anim;
  const { clamp, wrap, approach, approachAngle } = U;

  const GRAV = 0.0085;          // m / image²
  const BODY_R = 0.33;          // rayon de collision entre combattants
  const HURT_R = 0.3;           // rayon du volume touchable
  const BUF = 10;               // tampon d'ordres (images)
  const PARRY_LEN = 24, PARRY_ON = 2, PARRY_OFF = 11;
  const MAX_HP = 200;
  const HIT_PUSH = 0.42; // part du recul appliquée en touche simple (1 = ancien comportement)
  const UNCONTROLLED = new Set(['hitstun', 'air', 'stagger', 'thrown']);
  const INVULN = new Set(['down', 'getup', 'tech', 'ko', 'ringout', 'thrown', 'throw', 'intro', 'victory']);

  // ---------- Arène ----------
  class Arena {
    constructor(def) {
      this.def = def;
      let pts;
      if (def.shape === 'ngon') {
        pts = [];
        for (let i = 0; i < def.n; i++) {
          const a = ((def.rot || 0) * Math.PI / 180) + i / def.n * Math.PI * 2;
          pts.push([Math.cos(a) * def.radius, Math.sin(a) * def.radius]);
        }
      } else pts = def.pts;
      this.pts = pts;
      this.edges = [];
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        let nx = b[1] - a[1], nz = -(b[0] - a[0]);
        const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
        const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
        if (nx * mx + nz * mz < 0) { nx = -nx; nz = -nz; }
        this.edges.push({ ax: a[0], az: a[1], bx: b[0], bz: b[1], nx, nz, d: nx * a[0] + nz * a[1], wall: !!(def.walls && def.walls[i]) });
      }
    }
    // retourne la marge vers le bord le plus proche (positif = dehors) et l'index du bord
    worst(p) {
      let best = -1e9, bi = 0;
      for (let i = 0; i < this.edges.length; i++) {
        const e = this.edges[i];
        const s = e.nx * p.x + e.nz * p.z - e.d;
        if (s > best) { best = s; bi = i; }
      }
      return { d: best, e: bi };
    }
    edgeDist(p) { return -this.worst(p).d; }
  }

  // ---------- Combattant ----------
  class Fighter {
    constructor(idx, char, palette) {
      this.idx = idx; this.char = char; this.pal = palette || 0;
      this.pos = U.v3(); this.vel = U.v3(); this.prevPos = U.v3();
      this.yaw = 0; this.prevYaw = 0;
      this.held = { fwd: false, back: false, lat: 0, guard: false, crouch: false };
      this.gauge = 0; this.wins = 0; this.age = 0;
      this.side = idx === 0 ? 1 : -1;
      this.moveId = 0;
      this.stats = { hits: 0, dmg: 0, parries: 0, maxCombo: 0 };
      this.resetRound(0, 0, 0);
    }
    resetRound(x, z, yaw) {
      U.V.set(this.pos, x, 0, z); U.V.set(this.vel, 0, 0, 0); U.V.copy(this.prevPos, this.pos);
      this.yaw = yaw; this.prevYaw = yaw;
      this.hp = MAX_HP; this.maxHp = MAX_HP; this.guardHp = 100;
      this.state = 'intro'; this.sf = 0; this.move = null; this.moveKey = null; this.mf = 0; this.prevMf = 0; this.spd = 1;
      this.hitMask = 0; this.nextKey = null; this.buf = null; this.stun = 0; this.invuln = 0;
      this.crouching = false; this.tumble = 0; this.tumbleV = 0; this.techBuf = 0;
      this.comboHits = 0; this.comboDmg = 0; this.juggle = 0;
      this.eveil = 0; this.latFrames = 0; this.lastDashEnd = -99; this.frame = 0;
      this.lvF = 0; this.lvL = 0; this.gait = 0; this.gaitRate = 0;
      this.hitFlash = 0; this.hitImp = U.v3(); this.hitImpT = 0; this.dead = false;
      this.throwYaw0 = 0; this.superFrom = null; this.downLen = 30; this.neutralT = 0;
      this.lastAdv = null; this.advRef = null;
    }
    get opp() { return this._opp; }
    set opp(o) { this._opp = o; }

    // ---- états ----
    setState(s) { this.state = s; this.sf = 0; }
    toNeutral() {
      this.move = null; this.moveKey = null; this.nextKey = null;
      this.state = this.held.guard ? 'guard' : (this.held.crouch ? 'crouch' : 'idle');
      this.crouching = this.held.crouch && !this.held.guard ? true : (this.held.guard && this.held.crouch);
      this.sf = 0;
      if (this.comboHits > 0) this.endCombo();
    }
    endCombo() {
      const op = this._opp;
      if (op && this.comboHits > op.stats.maxCombo) op.stats.maxCombo = this.comboHits;
      this.comboHits = 0; this.comboDmg = 0; this.juggle = 0;
    }
    actionable() {
      switch (this.state) {
        case 'idle': case 'crouch': case 'guard': return true;
        case 'dash': return this.sf >= 3;
        case 'sidestep': return this.sf >= 11;
        case 'backdash': return this.sf >= 12;
        case 'parryOk': return this.sf >= 4;
        default: return false;
      }
    }
    speedMul() { return this.eveil > 0 ? 1.12 : 1; }
    dmgMul() { return this.eveil > 0 ? 1.15 : 1; }
    facing(o) { o.x = Math.sin(this.yaw); o.y = 0; o.z = Math.cos(this.yaw); return o; }
    yawTo(p) { return Math.atan2(p.x - this.pos.x, p.z - this.pos.z); }
    faceOpp(rate) { this.yaw = approachAngle(this.yaw, this.yawTo(this._opp.pos), rate); }
    isCrouchHurt() {
      if (this.state === 'crouch') return this.sf >= 2;
      if (this.state === 'guard' || this.state === 'blockstun') return this.crouching;
      if (this.state === 'attack' && this.move && this.move.crouch) return true;
      if (this.state === 'hitstun') return this.crouching;
      return false;
    }
    canBeHit() {
      if (this.invuln > 0) return false;
      if (INVULN.has(this.state)) return false;
      if (this.state === 'superHit') return false;
      return true;
    }

    // ---- entrées : held = état tenu ; cmds = ordres frais de cette image ----
    receive(held, cmds, m) {
      const H = this.held;
      H.fwd = !!held.fwd; H.back = !!held.back; H.lat = held.lat | 0; H.guard = !!held.guard; H.crouch = !!held.crouch;
      if (this.state === 'idle' && H.lat !== 0 && !H.fwd && !H.back) this.latFrames++; else if (this.state !== 'sidestep') this.latFrames = 0;
      if (!cmds) return;
      for (const c of cmds) this.command(c, m);
    }
    command(c, m) {
      // ordres spéciaux qui priment
      if (c.t === 'tech') { if (this.state === 'air') this.techBuf = 10; return; }
      if (this.state === 'thrown' && this.sf <= 12 && (c.t === 'throw' || (c.t === 'atk' && c.b === 'H'))) { m.breakThrow(this); return; }
      // « amélioration » : H puis G (saisie), ou super / éveil, pressés juste après un coup qui démarre
      if ((c.t === 'throw' || c.t === 'eveil' || c.t === 'super') && this.state === 'attack' && this.mf <= 3 && this.hitMask === 0 &&
        this.move && !this.move.superStart && this.move.k0 !== 'throw' &&
        (c.t === 'throw' || (this.gauge >= 50 && (c.t === 'super' || this.eveil <= 0)))) {
        this.move = null; this.state = 'idle';
      }
      if (c.t === 'atk') {
        // enchaînement (chaîne de coups)
        const strong = c.b === 'HV' || c.b === 'VK';
        // coup puissant (2 boutons) arrivé juste après le 1er bouton : il remplace le coup simple qui démarre
        if (strong && this.state === 'attack' && this.move && this.mf <= 3 && this.hitMask === 0 && !this.move.superStart &&
          /^(6|4|2|8|66)?[HVK]$/.test(this.moveKey)) { this.move = null; this.state = 'idle'; }
        if (this.state === 'attack' && this.move && this.move.next && this.move.next[c.b] && !(strong && this.strongUsed) && (!this.nextKey || (strong && this.frame - this.nextKeyT <= 3))) {
          const w = this.move.nextWin;
          if (this.mf >= w[0] && this.mf <= w[1]) { this.nextKey = this.move.next[c.b]; this.nextKeyT = this.frame; return; }
        }
        const H = this.held;
        let mod = '';
        if (H.crouch) mod = '2';
        else if (this.state === 'dash' || (this.frame - this.lastDashEnd) <= 6) mod = '66';
        else if (H.fwd) mod = '6';
        else if (H.back) mod = '4';
        else if (this.state === 'sidestep' || (H.lat !== 0 && this.latFrames >= 4)) mod = '8';
        this.buf = { t: 'atk', b: c.b, mod, age: 0 };
        return;
      }
      this.buf = Object.assign({ age: 0 }, c);
    }
    resolveKey(b, mod) {
      const mv = this.char.moves;
      if (mod === '66') { if (mv['66' + b]) return '66' + b; if (mv['6' + b]) return '6' + b; }
      else if (mod && mv[mod + b]) return mod + b;
      return mv[b] ? b : null;
    }
    tryBuffered(m, ctx) {
      const c = this.buf;
      if (!c) return false;
      if (ctx === 'dash' && !(c.t === 'atk' || c.t === 'throw' || c.t === 'super')) return false;
      switch (c.t) {
        case 'atk': {
          const key = this.resolveKey(c.b, c.mod);
          this.buf = null;
          return key ? this.startMove(key, m) : false;
        }
        case 'throw': this.buf = null; return this.startMove('T', m);
        case 'parry': this.buf = null; this.setState('parry'); this.move = null; this.vel.x *= 0.3; this.vel.z *= 0.3; m.ev('parryTry', { f: this }); return true;
        case 'super':
          this.buf = null;
          if (this.gauge >= 50) { this.gauge -= 50; this.startMove('S', m); m.superFlash(this); return true; }
          return false;
        case 'eveil':
          this.buf = null;
          if (this.gauge >= 50 && this.eveil <= 0) {
            this.gauge -= 50; this.setState('eveil'); this.move = null; this.invuln = 12; this.eveil = 480; m.ev('eveil', { f: this }); return true;
          }
          return false;
        case 'dash': this.buf = null; this.setState('dash'); m.ev('dash', { f: this }); return true;
        case 'bdash': this.buf = null; this.setState('backdash'); m.ev('dash', { f: this, back: true }); return true;
        case 'side': this.buf = null; this.setState('sidestep'); this.sideDir = c.d || 1; this.latFrames = 4; m.ev('dash', { f: this, side: true }); return true;
        default: this.buf = null; return false;
      }
    }
    startMove(key, m) {
      const mv = this.char.moves[key];
      if (!mv) return false;
      this.state = 'attack'; this.sf = 0; this.move = mv; this.moveKey = key; this.mf = 0; this.prevMf = 0;
      this.hitMask = 0; this.nextKey = null; this.crouching = !!mv.crouch; this.moveId++;
      this.swingDone = 0; this.projDone = 0;
      if (key === 'HV' || key === 'VK') this.strongUsed = true;
      else if (!this.chaining) this.strongUsed = false;
      if (m.training) m.ev('move', { f: this, key });
      return true;
    }

    // ---- mise à jour d'une image ----
    update(m) {
      const op = this._opp;
      U.V.copy(this.prevPos, this.pos); this.prevYaw = this.yaw;
      this.age++; this.frame = m.frame;
      this.sf += 1;
      if (this.invuln > 0) this.invuln--;
      if (this.eveil > 0) this.eveil--;
      if (this.techBuf > 0) this.techBuf--;
      if (this.hitFlash > 0) this.hitFlash--;
      if (this.buf) { this.buf.age++; if (this.buf.age > BUF) this.buf = null; }
      if (this.state !== 'guard' && this.state !== 'blockstun') this.guardHp = Math.min(100, this.guardHp + 0.12);
      this.spd = this.speedMul();
      const ch = this.char;
      let walking = false;

      switch (this.state) {
        case 'intro': case 'victory':
          this.faceOpp(0.15); break;
        case 'idle': case 'crouch': case 'guard':
          if (this.tryBuffered(m)) break;
          walking = this.neutral(m);
          break;
        case 'dash': {
          const t = this.sf / 16;
          this.setVelForward(ch.dash * (1 - t * 0.65), 0);
          walking = true;
          this.faceOpp(0.3);
          if (this.sf >= 3 && this.tryBuffered(m, 'dash')) break;
          if (this.held.guard && this.sf >= 8) { this.lastDashEnd = this.frame; this.toNeutral(); break; }
          if (this.sf >= 16) { this.lastDashEnd = this.frame; this.toNeutral(); }
          break;
        }
        case 'backdash': {
          const t = this.sf / 18;
          this.setVelForward(-ch.dash * 0.85 * (1 - t * 0.7), 0);
          walking = true; this.faceOpp(0.3);
          if (this.sf >= 12 && this.tryBuffered(m)) break;
          if (this.sf >= 18) this.toNeutral();
          break;
        }
        case 'sidestep': {
          const t = clamp(this.sf / 16, 0, 1);
          this.setVelForward(0, this.sideDir * 0.118 * Math.sin(Math.PI * t) * (ch.side / 0.042), m);
          walking = true; this.faceOpp(0.4);
          if (this.sf >= 11 && this.tryBuffered(m)) break;
          if (this.held.guard && this.sf >= 10) { this.toNeutral(); break; }
          if (this.sf >= 16) this.toNeutral();
          break;
        }
        case 'attack': this.updAttack(m); break;
        case 'super': this.updSuper(m); break;
        case 'superHit': {
          const at = op;
          if (at.state === 'super') {
            const fx = Math.sin(at.yaw), fz = Math.cos(at.yaw);
            this.pos.x = at.pos.x + fx * 1.15; this.pos.z = at.pos.z + fz * 1.15; this.pos.y = 0;
            this.yaw = at.yaw + Math.PI; this.vel.x = this.vel.z = 0;
          } else { this.setState('hitstun'); this.stun = 10; }
          break;
        }
        case 'hitstun': case 'blockstun': case 'stagger': case 'clash':
          this.stun--;
          if (this.stun <= 0) {
            const wasBlock = this.state === 'blockstun';
            this.toNeutral();
            if (!wasBlock) this.neutralT = 0;
            this.tryBuffered(m);
          }
          break;
        case 'parry':
          if (this.sf >= PARRY_LEN) this.toNeutral();
          break;
        case 'parryOk':
          if (this.sf >= 4 && this.tryBuffered(m)) break;
          if (this.sf >= 16) this.toNeutral();
          break;
        case 'eveil':
          if (this.sf === 6) {
            const d = U.V.distXZ(this.pos, op.pos);
            if (d < 2.3 && op.canBeHit() && op.state !== 'air') {
              const nx = (op.pos.x - this.pos.x) / (d || 1), nz = (op.pos.z - this.pos.z) / (d || 1);
              op.vel.x += nx * 0.16; op.vel.z += nz * 0.16;
              if (op.state === 'attack' || op.state === 'idle' || op.state === 'crouch' || op.state === 'guard') { op.move = null; op.setState('hitstun'); op.stun = 12; }
            }
            m.ev('eveilWave', { f: this });
          }
          if (this.sf >= 24) this.toNeutral();
          break;
        case 'air': this.updAir(m); break;
        case 'down':
          if (this.sf >= this.downLen || (this.sf >= 14 && (this.buf || this.held.guard || this.held.fwd || this.held.back || this.held.lat))) {
            this.setState('getup'); this.invuln = 22; this.buf = null; this.tumble = 0;
          }
          break;
        case 'getup':
          if (this.sf >= 20) { this.toNeutral(); this.invuln = 2; }
          break;
        case 'tech':
          if (this.sf >= 14) { this.toNeutral(); this.invuln = 2; }
          break;
        case 'ko': break;
        case 'throw': this.updThrow(m); break;
        case 'thrown': break; // piloté par le lanceur
        case 'wallsplat':
          this.stun--; this.vel.x = this.vel.z = 0;
          if (this.stun <= 0) { this.toNeutral(); }
          break;
        case 'ringout':
          this.vel.y -= GRAV; this.tumble = approach(this.tumble, -1.3, 0.04);
          break;
        default: break;
      }
      this.integrate(m, walking);
    }

    setVelForward(f, l, m) {
      const op = this._opp;
      let ax = op.pos.x - this.pos.x, az = op.pos.z - this.pos.z;
      const d = Math.hypot(ax, az) || 1; ax /= d; az /= d;
      // latéral : +1 = s'éloigner de la caméra
      let lx = -az, lz = ax;
      const cf = (m || this._m) ? (m || this._m).camFwd : null;
      if (cf && lx * cf.x + lz * cf.z < 0) { lx = -lx; lz = -lz; }
      this.vel.x = ax * f + lx * l; this.vel.z = az * f + lz * l;
      if (l !== 0 && f === 0) this.orbit = d; else this.orbit = 0;
    }

    neutral(m) {
      const H = this.held, ch = this.char;
      this._m = m;
      if (H.guard) {
        if (this.state !== 'guard') this.setState('guard');
        this.crouching = H.crouch;
        this.vel.x *= 0.6; this.vel.z *= 0.6; this.faceOpp(0.3); this.orbit = 0;
        return false;
      }
      if (H.crouch) {
        if (this.state !== 'crouch') this.setState('crouch');
        this.crouching = true; this.vel.x *= 0.6; this.vel.z *= 0.6; this.faceOpp(0.3); this.orbit = 0;
        return false;
      }
      if (this.state !== 'idle') this.setState('idle');
      this.crouching = false;
      const f = (H.fwd ? 1 : 0) - (H.back ? 1 : 0), l = H.lat;
      const d = U.V.distXZ(this.pos, this._opp.pos);
      let sp = f > 0 ? ch.walk : ch.walk * 0.85;
      if (f > 0 && d < 0.85) sp = 0;
      const k = (f !== 0 && l !== 0) ? 0.75 : 1;
      const tx0 = this.vel.x, tz0 = this.vel.z;
      this.setVelForward(f * sp * k, l * ch.side * k, m);
      // accélération douce
      this.vel.x = approach(tx0, this.vel.x, 0.012); this.vel.z = approach(tz0, this.vel.z, 0.012);
      this.faceOpp(0.35);
      return true;
    }

    updAttack(m) {
      const mv = this.move, op = this._opp;
      this.prevMf = this.mf;
      this.mf += this.spd;
      const f = this.mf;
      if (f <= mv.track) this.faceOpp(mv.wide ? 0.22 : 0.12);
      if (mv.lunge) {
        const [a, b, dist] = mv.lunge;
        const o0 = Math.max(this.prevMf, a), o1 = Math.min(f, b);
        if (o1 > o0) {
          const step = dist * (o1 - o0) / Math.max(1, b - a);
          const dd = U.V.distXZ(this.pos, op.pos);
          if (dd > 0.8) { this.pos.x += Math.sin(this.yaw) * step; this.pos.z += Math.cos(this.yaw) * step; }
        }
      }
      for (let i = 0; i < mv.hits.length; i++) {
        const h = mv.hits[i];
        if (!(this.swingDone & (1 << i)) && f >= h.s - 3) { this.swingDone |= (1 << i); if (h.k !== 'throw') m.ev('swing', { f: this, k: h.k, w: this.char.W.weight }); }
      }
      if (mv.proj) for (let i = 0; i < mv.proj.length; i++) {
        if (!(this.projDone & (1 << i)) && f >= mv.proj[i].at) { this.projDone |= (1 << i); m.spawnProj(this, mv.proj[i]); }
      }
      if (this.nextKey && f >= mv.nextAt) { const k = this.nextKey; this.nextKey = null; this.chaining = true; this.startMove(k, m); this.chaining = false; return; }
      if (f >= mv.total) { this.toNeutral(); this.tryBuffered(m); }
    }

    updSuper(m) {
      const mv = this.move, op = this._opp;
      this.prevMf = this.mf;
      this.mf += 1;
      const f = this.mf;
      for (let i = 0; i < mv.hits.length; i++) {
        const h = mv.hits[i];
        if (!(this.hitMask & (1 << i)) && f >= h.s) {
          this.hitMask |= (1 << i);
          m.ev('swing', { f: this, k: h.k, w: this.char.W.weight });
          if (op.state === 'superHit') m.autoHit(this, op, mv, i);
        }
      }
      if (f >= mv.total) { this.toNeutral(); this.tryBuffered(m); }
    }

    updAir(m) {
      this.vel.y -= GRAV;
      this.tumble += this.tumbleV;
      if (this.tumble < -1.5) { this.tumble = -1.5; this.tumbleV = 0; }
      if (this.pos.y + this.vel.y <= 0 && this.vel.y < 0) {
        this.pos.y = 0; this.vel.y = 0;
        m.ev('land', { f: this, heavy: true });
        if (this.hp <= 0) { this.setState('ko'); this.tumble = -1.5; return; }
        if (this.techBuf > 0 && !this.noTech) { this.setState('tech'); this.invuln = 14; this.tumble = 0; this.endCombo(); m.ev('tech', { f: this }); return; }
        this.setState('down'); this.invuln = 99; this.downLen = 30; this.tumble = -1.5; this.endCombo();
      }
    }

    updThrow(m) {
      const op = this._opp;
      const s = this.sf;
      if (op.state !== 'thrown') { if (s > 50) this.toNeutral(); else if (s > 12 && s < 33) this.toNeutral(); return; }
      if (s > 12 && s <= 32) {
        const t = (s - 12) / 20;
        this.yaw = this.throwYaw0 + U.easeInOut(t) * Math.PI;
      }
      const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
      if (s <= 32) {
        op.pos.x = this.pos.x + fx * 0.85; op.pos.z = this.pos.z + fz * 0.85; op.pos.y = 0;
        op.yaw = this.yaw + Math.PI; op.vel.x = op.vel.z = 0;
      }
      if (s === 33) {
        const dmg = Math.round(36 * this.dmgMul());
        this.stats.hits++; this.stats.dmg += Math.min(op.hp, dmg);
        op.hp = Math.max(0, op.hp - dmg);
        op.comboHits = 1; op.comboDmg = dmg;
        this.gauge = Math.min(100, this.gauge + 8); op.gauge = Math.min(100, op.gauge + 6);
        op.setState('air'); op.vel.x = fx * 0.16; op.vel.z = fz * 0.16; op.vel.y = 0.095; op.tumbleV = -0.07; op.noTech = true; op.invuln = 0;
        m.hitstop = 10;
        m.ev('hit', { att: this, def: op, p: { x: op.pos.x, y: 1.1, z: op.pos.z }, dmg, kind: 'throw', heavy: true });
        if (op.hp <= 0) m.onKO(this, op);
      }
      if (s >= 50) this.toNeutral();
    }

    integrate(m, walking) {
      const air = this.state === 'air' || this.state === 'ringout';
      this.pos.x += this.vel.x; this.pos.z += this.vel.z;
      if (air) this.pos.y += this.vel.y; else this.pos.y = 0;
      if (!walking && this.state !== 'superHit') {
        const fr = air ? (this.state === 'ringout' ? 0.985 : 0.945) :(this.state === 'hitstun' || this.state === 'stagger' || this.state === 'blockstun' || this.state === 'clash' ? 0.88 : 0.82);
        this.vel.x *= fr; this.vel.z *= fr;
      }
      // tourner autour de l'adversaire en gardant la distance
      if (walking && this.orbit > 0.5 && this.state === 'idle') {
        const op = this._opp;
        const dx = this.pos.x - op.pos.x, dz = this.pos.z - op.pos.z, d = Math.hypot(dx, dz) || 1;
        this.pos.x = op.pos.x + dx / d * this.orbit; this.pos.z = op.pos.z + dz / d * this.orbit;
      }
      if (this.state !== 'ringout') this.arena(m);
      // vitesses locales pour l'animation de marche
      const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
      const vx = this.pos.x - this.prevPos.x, vz = this.pos.z - this.prevPos.z;
      this.lvF = vx * fx + vz * fz; this.lvL = vx * fz - vz * fx;
      const sp = Math.hypot(vx, vz);
      this.gaitRate = sp * 7.5;
      this.gait += this.gaitRate;
    }

    arena(m) {
      const ar = m.arena;
      const res = ar.worst(this.pos);
      const unctrl = UNCONTROLLED.has(this.state);
      if (unctrl || this.state === 'ko') {
        if (res.d > 0.05) {
          const e = ar.edges[res.e];
          if (e.wall) {
            this.pos.x -= e.nx * (res.d + 0.3); this.pos.z -= e.nz * (res.d + 0.3);
            const sp = Math.hypot(this.vel.x, this.vel.z);
            if (sp > 0.06 && this.state !== 'thrown' && this.state !== 'ko' && this.hp > 0) {
              this.setState('wallsplat'); this.stun = 30; this.pos.y = 0; this.vel.y = 0; this.tumble = 0;
              this.vel.x = this.vel.z = 0;
              m.ev('wall', { f: this, p: { x: this.pos.x + e.nx * 0.3, y: 1.1, z: this.pos.z + e.nz * 0.3 } });
            } else { this.vel.x *= -0.2; this.vel.z *= -0.2; }
          } else if (this.state !== 'ko' || this.pos.y > 0.01 || res.d > 0.4) {
            this.setState('ringout'); this.vel.y = Math.max(this.vel.y, 0.02); this.tumbleV = 0;
            m.onRingout(this);
          }
        }
        return;
      }
      for (let i = 0; i < ar.edges.length; i++) {
        const e = ar.edges[i];
        const lim = e.wall ? -0.4 : -0.25;
        const s = e.nx * this.pos.x + e.nz * this.pos.z - e.d;
        if (s > lim) { this.pos.x -= e.nx * (s - lim); this.pos.z -= e.nz * (s - lim); }
      }
    }

    // volume touchable (capsule)
    hurt(o) {
      const sc = this.char.scale || 1;
      if (this.state === 'air') {
        const t = this.tumble;
        const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
        // axe du corps : haut local tourné de t autour de l'axe latéral
        const ux = fx * Math.sin(t), uy = Math.cos(t), uz = fz * Math.sin(t);
        const cy = this.pos.y + 0.95 * sc;
        U.V.set(o.a, this.pos.x - ux * 0.85 * sc, cy - uy * 0.85 * sc, this.pos.z - uz * 0.85 * sc);
        U.V.set(o.b, this.pos.x + ux * 0.75 * sc, cy + uy * 0.75 * sc, this.pos.z + uz * 0.75 * sc);
      } else {
        const top = this.isCrouchHurt() ? 1.02 : 1.68;
        U.V.set(o.a, this.pos.x, this.pos.y + 0.12, this.pos.z);
        U.V.set(o.b, this.pos.x, this.pos.y + top * sc, this.pos.z);
      }
      o.r = HURT_R * sc;
      return o;
    }
    guarding() {
      if (this.state === 'guard' || this.state === 'blockstun') return true;
      return false;
    }
  }

  // ---------- Combat (une manche ou un match complet) ----------
  class Match {
    constructor(o) {
      this.o = o;
      this.mode = o.mode || 'versus';
      this.training = this.mode === 'training';
      this.demo = this.mode === 'demo';
      this.roundsToWin = o.roundsToWin || 2;
      this.timeLimit = o.time == null ? 60 : o.time; // 0 = infini
      this.arena = new Arena(o.arena || G.ARENAS[0]);
      const c0 = o.chars[0], c1 = o.chars[1];
      this.f = [new Fighter(0, c0, 0), new Fighter(1, c1, c0.id === c1.id ? 1 : 0)];
      this.f[0].opp = this.f[1]; this.f[1].opp = this.f[0];
      this.events = [];
      this.frame = 0; this.round = 0; this.phase = 'intro'; this.pf = 0;
      this.hitstop = 0; this.freeze = 0; this.freezeOwner = -1;
      this.camFwd = { x: 0, z: -1 };
      this.winner = -1; this.endType = null; this.roundWinner = -1;
      this.trainOpts = o.trainOpts || { dummy: 'stand', gauge: true };
      this.segA = []; this.segB = []; this.capA = { a: U.v3(), b: U.v3(), r: 0 }; this.capB = { a: U.v3(), b: U.v3(), r: 0 };
      this.cp1 = U.v3(); this.cp2 = U.v3();
      this.projs = []; this.projId = 0;
      this.startRound(true);
    }
    ev(type, d) { const e = d || {}; e.type = type; e.frame = this.frame; this.events.push(e); return e; }
    isFinalRound() { return this.f[0].wins === this.roundsToWin - 1 && this.f[1].wins === this.roundsToWin - 1; }
    startRound(first) {
      this.round++;
      const sp = this.o.spawn || 1.6;
      this.f[0].resetRound(-sp, 0, Math.PI / 2);
      this.f[1].resetRound(sp, 0, -Math.PI / 2);
      this.phase = (first && !this.training && !this.o.skipIntro) ? 'intro' : 'ready';
      this.pf = 0; this.timer = this.timeLimit * 60; this.roundWinner = -1; this.endType = null; this.koPending = null;
      if (this.projs) this.projs.length = 0;
      if (this.training) { this.phase = 'fight'; for (const f of this.f) f.setState('idle'); }
      this.ev('roundStart', { n: this.round, first });
    }
    skipIntro() { if (this.phase === 'intro') { this.phase = 'ready'; this.pf = 0; } }
    superFlash(f) { this.freeze = 34; this.freezeOwner = f.idx; this.ev('superflash', { f }); }

    // inputs : [{held, cmds}, {held, cmds}]
    step(inputs) {
      this.frame++;
      const ctrl = this.phase === 'fight';
      if (this.freeze > 0 || this.hitstop > 0) {
        if (ctrl) for (let i = 0; i < 2; i++) { const inp = inputs[i]; if (inp) this.f[i].receive(inp.held, inp.cmds, this); }
        if (this.freeze > 0) this.freeze--; else this.hitstop--;
        return;
      }
      this.pf++;
      for (let i = 0; i < 2; i++) {
        const f = this.f[i], inp = inputs[i];
        if (ctrl && inp) f.receive(inp.held, inp.cmds, this);
        else f.receive(NEUTRAL, null, this);
      }
      switch (this.phase) {
        case 'intro':
          if (this.pf >= 230) { this.phase = 'ready'; this.pf = 0; }
          break;
        case 'ready':
          if (this.pf === 1) { for (const f of this.f) if (f.state === 'intro') f.toNeutral(); this.ev('round', { n: this.round, final: this.isFinalRound() }); }
          if (this.pf === 70) this.ev('fight');
          if (this.pf >= 82) { this.phase = 'fight'; this.pf = 0; }
          break;
        case 'fight':
          // le chrono s'arrête pendant les séquences filmées (Frappe de Tempête, saisie)
          if (this.timeLimit > 0 && !this.training && !this.f.some(f => f.state === 'super' || f.state === 'throw')) {
            this.timer--;
            if (this.timer <= 0) { this.timer = 0; this.onTimeout(); }
          }
          break;
        case 'end':
          if (this.pf === 100) {
            const w = this.roundWinner;
            if (w >= 0) { const wf = this.f[w]; if (wf.state !== 'ringout' && wf.hp > 0) { wf.move = null; wf.setState('victory'); } }
            this.ev('roundResult', { winner: w, how: this.endType });
          }
          if (this.pf >= 220) {
            if (this.f[0].wins >= this.roundsToWin || this.f[1].wins >= this.roundsToWin) {
              this.phase = 'over'; this.pf = 0;
              this.winner = this.f[0].wins >= this.roundsToWin ? (this.f[1].wins >= this.roundsToWin ? -1 : 0) : 1;
              this.ev('matchOver', { winner: this.winner });
            } else this.startRound(false);
          }
          break;
        case 'over': break;
        default: break;
      }
      this.f[0].update(this); this.f[1].update(this);
      this.separate();
      if (this.phase === 'fight') { this.combat(); this.updProjs(); }
      this.resolveKO();
      if (this.training) this.trainingTick();
    }

    separate() {
      const a = this.f[0], b = this.f[1];
      const skip = (f) => f.state === 'air' || f.state === 'ringout' || f.state === 'down' || f.state === 'ko' || f.state === 'thrown' || f.state === 'superHit' || f.state === 'getup';
      if (skip(a) || skip(b)) return;
      const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
      let d = Math.hypot(dx, dz);
      const min = BODY_R * (a.char.scale || 1) + BODY_R * (b.char.scale || 1);
      if (d < min) {
        let nx, nz;
        if (d < 1e-4) { nx = Math.sin(a.yaw); nz = Math.cos(a.yaw); d = 0; } else { nx = dx / d; nz = dz / d; }
        const push = (min - d) / 2;
        a.pos.x -= nx * push; a.pos.z -= nz * push; b.pos.x += nx * push; b.pos.z += nz * push;
        a.arena(this); b.arena(this);
      }
    }

    // ---- détection des touches ----
    attackCandidates(att, def, segs) {
      if (att.state !== 'attack' || !att.move) return null;
      const m = att.move;
      const f0 = att.prevMf, f1 = att.mf;
      let best = null;
      for (let i = 0; i < m.hits.length; i++) {
        const h = m.hits[i];
        if (att.hitMask & (1 << i)) continue;
        const ts = Math.max(f0, h.s), te = Math.min(f1, h.s + h.a);
        if (te < ts) continue;
        if (h.k === 'throw') {
          if (this.canThrow(att, def)) return { i, throw: true };
          continue;
        }
        if (h.k === 'cast') continue;
        if (!def.canBeHit()) continue;
        if (h.h === 'high' && def.isCrouchHurt()) continue;
        def.hurt(this.capB);
        // balayage fin : ~8 échantillons par image pour ne pas « traverser » la cible (arcs rapides, Éveil)
        const steps = Math.min(12, Math.max(2, Math.ceil((te - ts) * 8)));
        for (let s = 0; s <= steps; s++) {
          const ff = ts + (te - ts) * (s / steps);
          const n = A.hitSegs(att, m, ff, segs, att.pos, att.yaw, ~(1 << i) & 0xffff);
          for (let k = 0; k < n; k++) {
            const sg = segs[k];
            const d = U.segSeg(sg.a, sg.b, this.capB.a, this.capB.b, this.cp1, this.cp2);
            if (d < sg.r + this.capB.r) {
              best = { i, p: U.v3(this.cp1.x, this.cp1.y, this.cp1.z), edge: null };
              return best;
            }
          }
        }
      }
      return best;
    }
    canThrow(att, def) {
      if (!def.canBeHit()) return false;
      if (def.state === 'air' || def.state === 'hitstun' || def.state === 'blockstun' || def.state === 'stagger' || def.state === 'wallsplat') return false;
      if (def.isCrouchHurt()) return false;
      const d = U.V.distXZ(att.pos, def.pos);
      if (d > 1.15 * Math.max(att.char.scale, def.char.scale)) return false;
      const a = Math.abs(wrap(att.yawTo(def.pos) - att.yaw));
      return a < 0.9;
    }
    activeWeaponSeg(f, out) {
      if (f.state !== 'attack' || !f.move) return 0;
      const m = f.move;
      let any = false;
      for (const h of m.hits) if (h.k !== 'k' && h.k !== 'throw' && h.k !== 'cast' && f.mf >= h.s && f.mf <= h.s + h.a) any = true;
      if (!any) return 0;
      return A.hitSegs(f, m, f.mf, out, f.pos, f.yaw, f.hitMask);
    }

    combat() {
      const A0 = this.f[0], B0 = this.f[1];
      const ca = this.attackCandidates(A0, B0, this.segA);
      const cb = this.attackCandidates(B0, A0, this.segB);
      // choc des lames : deux armes actives qui se croisent
      if (A0.state === 'attack' && B0.state === 'attack') {
        const na = this.activeWeaponSeg(A0, this.segA), nb = this.activeWeaponSeg(B0, this.segB);
        let clashP = null;
        for (let i = 0; i < na && !clashP; i++) for (let j = 0; j < nb && !clashP; j++) {
          const d = U.segSeg(this.segA[i].a, this.segA[i].b, this.segB[j].a, this.segB[j].b, this.cp1, this.cp2);
          if (d < 0.14) clashP = U.v3((this.cp1.x + this.cp2.x) / 2, (this.cp1.y + this.cp2.y) / 2, (this.cp1.z + this.cp2.z) / 2);
        }
        if (!clashP && ca && cb && !ca.throw && !cb.throw && A0.move.hits[ca.i].k !== 'k' && B0.move.hits[cb.i].k !== 'k') {
          clashP = U.v3((ca.p.x + cb.p.x) / 2, (ca.p.y + cb.p.y) / 2, (ca.p.z + cb.p.z) / 2);
        }
        if (clashP && !A0.move.superStart && !B0.move.superStart) { this.clash(A0, B0, clashP); return; }
      }
      if (ca && cb && ca.throw && cb.throw) { this.breakThrowBoth(A0, B0); return; }
      // échange de coups simultané : on fige les deux coups avant d'appliquer
      const mA = A0.move, mfA = A0.mf, mB = B0.move, mfB = B0.mf;
      let a = ca, b = cb;
      const aHit = a && !a.throw, bHit = b && !b.throw;
      // règles symétriques : un coup bat une saisie ; lors d'un échange, la Frappe de Tempête est interrompue
      if (a && a.throw && bHit) a = null;
      if (b && b.throw && aHit) b = null;
      if (aHit && bHit) {
        // deux Frappes de Tempête qui se touchent ensemble : choc, personne ne l'emporte
        if (mA.superStart && mB.superStart) { this.clash(A0, B0, U.v3((a.p.x + b.p.x) / 2, (a.p.y + b.p.y) / 2, (a.p.z + b.p.z) / 2)); return; }
        if (mA.superStart && !mB.superStart) a = null;
        else if (mB.superStart && !mA.superStart) b = null;
      }
      if (a) this.apply(A0, B0, a, mA, mfA);
      if (b && mB && (B0.state === 'attack' || (a && !a.throw && B0.state !== 'thrown'))) this.apply(B0, A0, b, mB, mfB);
    }
    // ---- sorts (projectiles) ----
    spawnProj(f, P) {
      if (this.phase !== 'fight') return;
      const op = f._opp;
      let ux = Math.sin(f.yaw), uz = Math.cos(f.yaw);
      // léger ajustement vers l'adversaire au lancement (pas de guidage ensuite : un pas de côté l'évite)
      const dx = op.pos.x - f.pos.x, dz = op.pos.z - f.pos.z, d = Math.hypot(dx, dz) || 1;
      if ((ux * dx + uz * dz) / d > 0.85) { ux = dx / d; uz = dz / d; }
      const sc = f.char.scale || 1;
      const p = {
        id: ++this.projId, owner: f, P, mv: P.mv, kind: P.kind, h: P.h, r: P.r, life: P.life,
        x: f.pos.x + ux * 0.6, y: P.y * sc, z: f.pos.z + uz * 0.6, vx: ux * P.speed, vz: uz * P.speed,
        a: U.v3(), b: U.v3(),
      };
      p.px = p.x; p.py = p.y; p.pz = p.z;
      this.projs.push(p);
      this.ev('proj', { p, f });
    }
    updProjs() {
      const list = this.projs;
      for (let i = list.length - 1; i >= 0; i--) {
        const p = list[i];
        if (!p) continue;
        p.px = p.x; p.py = p.y; p.pz = p.z;
        p.x += p.vx; p.z += p.vz; p.life--;
        let dead = p.life <= 0 || Math.hypot(p.x, p.z) > 16;
        // deux sorts adverses qui se croisent s'annulent
        for (let j = 0; j < list.length && !dead; j++) {
          const q = list[j];
          if (!q || q === p || q.owner === p.owner) continue;
          if (Math.hypot(q.x - p.x, q.z - p.z) < q.r + p.r && Math.abs(q.y - p.y) < 0.6) {
            this.ev('projclash', { p: U.v3((p.x + q.x) / 2, (p.y + q.y) / 2, (p.z + q.z) / 2) });
            list[j] = null; dead = true;
          }
        }
        const def = p.owner._opp;
        if (!dead && def.canBeHit() && def.state !== 'ringout' && def.state !== 'super' && !(p.h === 'high' && def.isCrouchHurt())) {
          def.hurt(this.capB);
          U.V.set(p.a, p.px, p.py, p.pz); U.V.set(p.b, p.x, p.y, p.z);
          const dd = U.segSeg(p.a, p.b, this.capB.a, this.capB.b, this.cp1, this.cp2);
          if (dd < p.r + this.capB.r) { this.projHit(p, def, U.v3(this.cp1.x, this.cp1.y, this.cp1.z)); dead = true; }
        }
        if (dead) list[i] = null;
      }
      for (let i = list.length - 1; i >= 0; i--) if (!list[i]) list.splice(i, 1);
    }
    projHit(p, def, pt) {
      const att = p.owner;
      if (def.state === 'parry' && def.sf >= PARRY_ON && def.sf <= PARRY_OFF) {
        // parade d'un sort : il est dissipé (le lanceur, loin, n'est pas déséquilibré)
        def.setState('parryOk'); def.invuln = 6; def.gauge = Math.min(100, def.gauge + 10); def.stats.parries++;
        this.hitstop = 10;
        this.ev('parry', { att, def, p: pt, proj: true });
        return;
      }
      this.apply(att, def, { i: 0, p: pt, proj: true, dx: p.vx, dz: p.vz }, p.mv, 0);
    }
    // décision du K.O. après application de tous les coups de l'image (double K.O. = manche nulle)
    resolveKO() {
      if (!this.koPending) return;
      const att = this.koPending; this.koPending = null;
      if (this.phase !== 'fight') return;
      const a = this.f[0], b = this.f[1];
      const both = a.hp <= 0 && b.hp <= 0;
      const winner = both ? -1 : (a.hp <= 0 ? 1 : 0);
      const def = winner >= 0 ? this.f[winner]._opp : att._opp;
      this.ev('ko', { att: winner >= 0 ? this.f[winner] : att, def, final: winner >= 0 && (this.f[winner].wins + 1) >= this.roundsToWin });
      this.endRound(winner, both ? 'draw' : 'ko');
    }

    clash(a, b, p) {
      for (const f of [a, b]) {
        const o = f === a ? b : a;
        f.move = null; f.setState('clash'); f.stun = 16;
        const d = U.V.distXZ(f.pos, o.pos) || 1;
        f.vel.x = (f.pos.x - o.pos.x) / d * 0.09; f.vel.z = (f.pos.z - o.pos.z) / d * 0.09;
        f.gauge = Math.min(100, f.gauge + 4);
      }
      this.hitstop = 12;
      this.ev('clash', { p, a, b });
    }

    apply(att, def, c, mv, mfv) {
      const m = mv || att.move, h = m.hits[c.i];
      const attMf = mfv != null ? mfv : att.mf;
      if (!c.proj) att.hitMask |= (1 << c.i);
      if (c.throw) {
        if (def.state === 'attack' && def.move && def.move.k0 === 'throw' && def.mf < def.move.lastEnd) { this.breakThrowBoth(att, def); return; }
        att.state = 'throw'; att.sf = 0; att.move = null; att.throwYaw0 = att.yaw;
        def.state = 'thrown'; def.sf = 0; def.move = null; def.vel.x = def.vel.z = 0;
        this.ev('grab', { att, def });
        return;
      }
      const dx = def.pos.x - att.pos.x, dz = def.pos.z - att.pos.z, dd = Math.hypot(dx, dz) || 1;
      let nx = dx / dd, nz = dz / dd;
      if (c.proj && c.dx != null) { const l = Math.hypot(c.dx, c.dz) || 1; nx = c.dx / l; nz = c.dz / l; } // un sort pousse dans son sens de vol
      const remaining = Math.max(0, m.total - attMf);
      // parade
      if (!c.proj && def.state === 'parry' && def.sf >= PARRY_ON && def.sf <= PARRY_OFF && !m.noParry) {
        att.move = null; att.setState('stagger'); att.stun = 36; att.vel.x = -nx * 0.05; att.vel.z = -nz * 0.05;
        def.setState('parryOk'); def.invuln = 6; def.gauge = Math.min(100, def.gauge + 10);
        def.stats.parries++;
        this.hitstop = 16;
        this.ev('parry', { att, def, p: c.p });
        return;
      }
      // garde
      const facingOk = c.proj ? (-nx * Math.sin(def.yaw) - nz * Math.cos(def.yaw)) > Math.cos(1.75) : Math.abs(wrap(def.yawTo(att.pos) - def.yaw)) < 1.75;
      const isLow = h.h === 'low', isMid = h.h === 'mid';
      if (def.guarding() && facingOk && !m.unblock) {
        const crouchG = def.crouching;
        const blocked = crouchG ? (isLow || h.h === 'high') : !isLow;
        if (blocked) {
          def.setState('blockstun'); def.crouching = crouchG;
          def.stun = Math.max(4, Math.round(remaining + m.advB));
          def.vel.x = nx * m.bpush / def.char.weight; def.vel.z = nz * m.bpush / def.char.weight;
          let chip = att.eveil > 0 ? Math.round(h.dmg * 0.12) : 0;
          if (m.superStart) chip = 10;
          if (chip) { def.hp = Math.max(1, def.hp - chip); }
          def.guardHp -= (m.guard || h.dmg * 1.1);
          att.gauge = Math.min(100, att.gauge + 2); def.gauge = Math.min(100, def.gauge + 3);
          if (def.guardHp <= 0) {
            def.guardHp = 100; def.setState('stagger'); def.stun = 40;
            this.hitstop = 14;
            this.ev('guardbreak', { att, def, p: c.p });
          } else {
            this.hitstop = h.dmg >= 18 ? 9 : 6;
            this.ev('block', { att, def, p: c.p, heavy: h.dmg >= 18, kind: h.k });
          }
          def.endCombo();
          this.setAdv(att, def);
          return;
        }
      }
      // armure (encaisse sans broncher)
      if (def.state === 'attack' && def.move && def.move.armor && def.mf >= def.move.armor[0] && def.mf <= def.move.armor[1] && !m.superStart) {
        const dmg = Math.round(h.dmg * att.dmgMul() * 0.6);
        def.hp = Math.max(0, def.hp - dmg);
        this.hitstop = 8;
        this.ev('armor', { att, def, p: c.p, dmg });
        if (def.hp <= 0) { def.move = null; this.knock(def, nx, nz, 0.1, 0.11); def.noTech = true; this.onKO(att, def); }
        return;
      }
      // Frappe de Tempête : bascule en séquence filmée
      if (m.superStart) {
        att.state = 'super'; att.sf = 0; att.move = att.char.moves.S2; att.mf = 0; att.hitMask = 0;
        def.move = null; def.setState('superHit'); def.vel.x = def.vel.z = 0; def.pos.y = 0;
        def.comboHits = 0; def.comboDmg = 0;
        this.hitstop = 6;
        this.ev('superHit', { att, def, p: c.p });
        return;
      }
      this.hitDef(att, def, m, c.i, c.p, nx, nz, remaining, false);
    }

    hitDef(att, def, m, i, p, nx, nz, remaining, auto) {
      const h = m.hits[i];
      const counter = !auto && def.state === 'attack' && def.move && def.mf < def.move.first;
      let dmg = h.dmg * att.dmgMul();
      if (counter) dmg *= 1.2;
      if (!auto) dmg *= Math.max(0.35, 1 - 0.12 * def.comboHits);
      dmg = Math.max(1, Math.round(dmg));
      att.stats.hits++; att.stats.dmg += Math.min(def.hp, dmg);
      def.hp = Math.max(0, def.hp - dmg);
      def.comboHits++; def.comboDmg += dmg;
      att.gauge = Math.min(100, att.gauge + dmg * 0.55); def.gauge = Math.min(100, def.gauge + dmg * 0.35);
      def.hitFlash = 6;
      // impulsion visuelle (direction du tranchant)
      def.hitImp.x = nx; def.hitImp.z = nz; def.hitImp.y = h.k === 'v' ? -0.5 : 0.2; def.hitImpT = this.frame;
      const isLast = i === m.hits.length - 1;
      const eff = h.eff || (isLast ? m.eff : null);
      const wasAir = def.state === 'air' || def.pos.y > 0.05;
      const push = h.push != null ? h.push : m.push; // poussée propre au coup (coups multiples)
      def.move = null; def.nextKey = null; def.buf = null;
      if (def.hp <= 0) {
        this.knock(def, nx, nz, Math.max(push, 0.1), 0.11); def.noTech = true;
        this.hitstop = 20;
        this.ev('hit', { att, def, p, dmg, kind: h.k, heavy: true, counter, ko: true });
        this.onKO(att, def);
        return;
      }
      if (wasAir) {
        def.juggle++;
        // jonglage : on garde l'adversaire à portée pour enchaîner
        this.knock(def, nx, nz, push * 0.25 + 0.012, Math.max(0.03, 0.085 - def.juggle * 0.012));
        def.tumbleV = -0.05;
      } else if (eff === 'launch') {
        this.knock(def, nx, nz, 0.03, m.lv || 0.16); def.tumbleV = -0.035; def.noTech = false;
      } else if (eff === 'knock') {
        this.knock(def, nx, nz, push, m.lv || 0.085); def.tumbleV = -0.09; def.noTech = false;
      } else if (eff === 'trip') {
        this.knock(def, nx, nz, 0.03, 0.055); def.tumbleV = -0.14; def.noTech = false;
      } else {
        def.setState('hitstun'); def.crouching = def.isCrouchHurt();
        def.stun = Math.max(8, Math.round(remaining + m.advH + 2 + (counter ? 4 : 0)));
        // recul réduit en touche simple : l'adversaire reste à portée du coup suivant (combos)
        const hp = push * HIT_PUSH;
        def.vel.x = nx * hp / def.char.weight; def.vel.z = nz * hp / def.char.weight;
        // l'attaquant suit légèrement son coup
        if (!m.proj) { att.vel.x += nx * hp * 0.35; att.vel.z += nz * hp * 0.35; }
      }
      this.setAdv(att, def);
      let hs = Math.round(clamp(4 + dmg * 0.22, 5, 13));
      if (counter) hs += 3;
      if (auto) hs = isLast ? 18 : 4;
      this.hitstop = Math.max(this.hitstop, hs);
      this.ev('hit', { att, def, p, dmg, kind: h.k, heavy: dmg >= 18 || eff === 'launch' || eff === 'knock', counter, eff, auto, quake: !!(m.quake && isLast) });
    }
    setAdv(att, def) { def.advRef = { att, frame: this.frame }; def.freeAt = null; att.freeAt = null; }
    knock(def, nx, nz, push, vy) {
      def.setState('air');
      def.vel.x = nx * push / def.char.weight; def.vel.z = nz * push / def.char.weight; def.vel.y = vy;
      def.pos.y = Math.max(def.pos.y, 0.02);
    }
    autoHit(att, def, m, i) {
      const fx = Math.sin(att.yaw), fz = Math.cos(att.yaw);
      const p = U.v3(def.pos.x - fx * 0.25, 1.15, def.pos.z - fz * 0.25);
      const isLast = i === m.hits.length - 1;
      if (isLast) {
        this.hitDef(att, def, m, i, p, fx, fz, 0, true);
      } else {
        const h = m.hits[i];
        const dmg = Math.max(1, Math.round(h.dmg * att.dmgMul()));
        att.stats.hits++; att.stats.dmg += Math.min(def.hp, dmg);
        def.hp = Math.max(0, def.hp - dmg);
        def.comboHits++; def.comboDmg += dmg; def.hitFlash = 5;
        def.hitImp.x = fx; def.hitImp.z = fz; def.hitImp.y = 0.2; def.hitImpT = this.frame;
        this.hitstop = Math.max(this.hitstop, 4);
        this.ev('hit', { att, def, p, dmg, kind: h.k, heavy: false, auto: true });
      }
    }
    breakThrow(def) {
      const att = def._opp;
      this.breakThrowBoth(att, def);
    }
    breakThrowBoth(a, b) {
      for (const f of [a, b]) {
        const o = f === a ? b : a;
        f.move = null; f.setState('clash'); f.stun = 18;
        const d = U.V.distXZ(f.pos, o.pos) || 1;
        f.vel.x = (f.pos.x - o.pos.x) / d * 0.12; f.vel.z = (f.pos.z - o.pos.z) / d * 0.12;
      }
      this.hitstop = 8;
      this.ev('throwbreak', { a, b, p: U.v3((a.pos.x + b.pos.x) / 2, 1.2, (a.pos.z + b.pos.z) / 2) });
    }

    // ---- fin de manche ----
    endRound(winner, type) {
      if (this.phase !== 'fight') return;
      this.phase = 'end'; this.pf = 0; this.roundWinner = winner; this.endType = type;
      this.projs.length = 0;
      if (winner >= 0) this.f[winner].wins++;
      const matchPoint = winner >= 0 && this.f[winner].wins >= this.roundsToWin;
      this.ev('roundEnd', { winner, how: type, final: matchPoint });
    }
    onKO(att, def) {
      if (this.training) { this.ev('ko', { att, def, final: false, training: true }); return; }
      if (this.phase !== 'fight') return;
      if (!this.koPending) this.koPending = att; // décidé en fin d'image (resolveKO)
    }
    onRingout(f) {
      if (this.training) { this.ev('ringout', { f, training: true }); this.trainReset = 70; return; }
      if (this.phase !== 'fight') return;
      const w = f._opp;
      this.ev('ringout', { f, final: (w.wins + 1) >= this.roundsToWin });
      this.endRound(w.idx, 'ringout');
    }
    onTimeout() {
      const a = this.f[0], b = this.f[1];
      const ra = a.hp / a.maxHp, rb = b.hp / b.maxHp;
      const w = Math.abs(ra - rb) < 1e-6 ? -1 : (ra > rb ? 0 : 1);
      this.ev('timeup', { winner: w });
      this.endRound(w, 'time');
    }

    trainingTick() {
      for (const f of this.f) {
        if (this.trainOpts.gauge) f.gauge = 100;
        if (f.hp <= 0 && f.state !== 'air') { f.hp = f.maxHp; if (f.state === 'ko') { f.setState('getup'); f.invuln = 20; } }
        const neutral = f.state === 'idle' || f.state === 'guard' || f.state === 'crouch';
        if (neutral) { f.neutralT++; if (f.neutralT > 50 && f.hp < f.maxHp) f.hp = f.maxHp; } else f.neutralT = 0;
      }
      if (this.trainReset > 0) {
        this.trainReset--;
        if (this.trainReset === 0) {
          const sp = 1.6;
          this.f[0].resetRound(-sp, 0, Math.PI / 2); this.f[1].resetRound(sp, 0, -Math.PI / 2);
          for (const f of this.f) f.setState('idle');
          this.projs.length = 0;
          this.ev('trainReset');
        }
      }
      // avantage en images : quand les deux redeviennent libres après un échange
      for (const f of this.f) {
        const ref = f.advRef;
        if (!ref) continue;
        const a = ref.att;
        const fFree = f.actionable(), aFree = a.actionable();
        if (fFree && aFree) {
          const adv = (f.freeAt != null ? f.freeAt : this.frame) - (a.freeAt != null ? a.freeAt : this.frame);
          a.lastAdv = adv; f.advRef = null; f.freeAt = null; a.freeAt = null;
          this.ev('adv', { f: a, adv });
        } else {
          if (fFree && f.freeAt == null) f.freeAt = this.frame;
          if (aFree && a.freeAt == null) a.freeAt = this.frame;
        }
      }
    }
  }
  const NEUTRAL = { fwd: false, back: false, lat: 0, guard: false, crouch: false };

  G.Sim = { Match, Fighter, Arena, MAX_HP, GRAV, PARRY_ON, PARRY_OFF, PARRY_LEN, NEUTRAL };
})(typeof window !== 'undefined' ? window : globalThis);
