'use strict';
// LAMES D'ORAGE — boucle principale et déroulement du jeu.
(function (root) {
  const G = root.G, U = G.U, I = G.Input, R = G.R, UI = G.UI, Au = G.Audio;
  const STEP = 1 / 60;
  const DEF = { rounds: 2, time: 60, level: 1, vMaster: 0.8, vSfx: 0.85, vMusic: 0.4, voice: true, rumble: true, quality: 'medium', eco: true, fps: false };
  const NUM = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf'];

  const Game = G.Game = {
    cfg: Object.assign({}, DEF),
    match: null, views: [null, null], slots: [null, null], dummy: 'stand',
    mode: 'boot', paused: false, acc: 0, timeScale: 1, slowT: 0, flashA: 0, flashC: '#ffffff',
    previewF: [null, null], previewChars: [null, null], stageOrbit: 0, lastCfg: null, arcade: null, overT: -1, demoOverT: 0,

    loadCfg() { try { const s = JSON.parse(localStorage.getItem('lames.cfg') || 'null'); if (s) Object.assign(this.cfg, s); } catch (e) { /* ignore */ } },
    saveCfg() { try { localStorage.setItem('lames.cfg', JSON.stringify(this.cfg)); } catch (e) { /* ignore */ } },
    applyAudio() { const c = this.cfg; Au.setVolumes({ master: c.vMaster, sfx: c.vSfx, music: c.vMusic, voice: c.voice }); I.rumbleOn = c.rumble; },

    // ---------- vues 3D ----------
    setViews(chars) {
      for (let i = 0; i < 2; i++) {
        const want = chars[i];
        const pal = (i === 1 && chars[0] && want && chars[0].id === want.id) ? 1 : 0;
        const v = this.views[i];
        if (v && want && v.ch === want && v.pal === pal) continue;
        if (v) { v.removeFrom(R.scene); v.dispose(); this.views[i] = null; }
        if (want) { const nv = new R.FighterView(want, pal); nv.pal = pal; nv.addTo(R.scene); this.views[i] = nv; }
      }
    },

    // ---------- démo (fond des menus) ----------
    demo(on) {
      if (!on) return;
      if (this.mode === 'demo' && this.match) return;
      const r = Math.random;
      const c0 = G.CHARS[Math.floor(r() * G.CHARS.length)], c1 = G.CHARS[Math.floor(r() * G.CHARS.length)];
      const arena = G.ARENAS[Math.floor(r() * G.ARENAS.length)];
      this.begin({ mode: 'demo', chars: [c0, c1], arena, devs: [null, null] }, true);
    },

    // ---------- aperçu de sélection ----------
    preview(chars) {
      if (this.mode !== 'preview') {
        this.endMatch();
        this.mode = 'preview';
        if (!G.Stages.current()) G.Stages.load('falaise');
        UI.hud.show(false);
        R.Cam.cut = true;
      }
      this.setViews(chars);
      for (let i = 0; i < 2; i++) {
        const ch = chars[i];
        if (!ch) { this.previewF[i] = null; continue; }
        if (!this.previewF[i] || this.previewF[i].char !== ch) {
          const f = new G.Sim.Fighter(i, ch, 0);
          const x = i === 0 ? -1.15 : 1.15;
          f.resetRound(x, 0.6, i === 0 ? 0.35 : -0.35);
          f.state = 'idle'; f.age = Math.random() * 100;
          this.previewF[i] = f;
          if (this.views[i]) this.views[i].resetChains();
        }
      }
      for (const v of this.views) if (v) { v.root.visible = true; for (const c of v.chains) c.c.mesh.visible = true; }
    },
    previewStage(id) {
      this.mode = 'stage';
      if (id) G.Stages.load(id);
      for (const v of this.views) if (v) { v.root.visible = false; for (const c of v.chains) c.c.mesh.visible = false; }
    },

    // ---------- lancement des combats ----------
    startVersus(cfg) {
      UI.vs(cfg.chars[0], cfg.chars[1], cfg.arena.name, () => this.begin(cfg));
    },
    startArcade(ch, dev) {
      // 3 adversaires au hasard, puis le combat final contre BRANN ★ le Champion (ou contre votre double si vous l'avez choisi)
      const boss = G.CHAR_BY_ID.brann_ch || ch;
      const others = G.CHARS.filter((c) => c !== ch && c !== boss);
      for (let i = others.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [others[i], others[j]] = [others[j], others[i]]; }
      others.length = Math.min(others.length, 3);
      others.push(ch === boss ? ch : boss);
      const L = this.cfg.level;
      this.arcade = { ch, dev, order: others, idx: 0, levels: [Math.max(0, L - 1), L, L, Math.min(3, L + 1)] };
      this.arcadeNext();
    },
    arcadeNext() {
      const a = this.arcade, opp = a.order[a.idx], arena = G.ARENAS[a.idx % G.ARENAS.length];
      const sub = (a.idx === 3 ? 'COMBAT FINAL · ' : 'COMBAT ' + (a.idx + 1) + ' / 4 · ') + arena.name;
      UI.vs(a.ch, opp, sub, () => this.begin({ mode: 'arcade', chars: [a.ch, opp], devs: [a.dev, null], arena, level: a.levels[a.idx] }));
    },
    begin(cfg, isDemo) {
      this.endMatch();
      this.lastCfg = cfg;
      const c = this.cfg;
      const mode = cfg.mode;
      const m = new G.Sim.Match({
        chars: cfg.chars, arena: cfg.arena, mode: mode === 'demo' ? 'demo' : (mode === 'training' ? 'training' : 'versus'),
        roundsToWin: mode === 'demo' ? 2 : c.rounds, time: mode === 'training' ? 0 : c.time, skipIntro: mode === 'demo',
        trainOpts: { dummy: 'stand', gauge: true },
      });
      this.match = m;
      this.mode = isDemo ? 'demo' : 'fight';
      this.paused = false; this.acc = 0; this.timeScale = 1; this.slowT = 0; this.overT = -1; this.demoOverT = 0;
      G.Stages.load(cfg.arena.id);
      this.setViews(cfg.chars);
      for (const v of this.views) if (v) { v.root.visible = true; v.resetChains(); for (const ch of v.chains) ch.c.mesh.visible = true; }
      R.fx.clear();
      R.Cam.reset(); R.Cam.cut = true;
      // emplacements : joueur, IA ou mannequin
      const lvl = cfg.level != null ? cfg.level : c.level;
      this.slots = [0, 1].map((i) => {
        if (mode === 'demo') return { kind: 'ai', ai: new G.AI(2, 1000 + i * 77 + Math.floor(Math.random() * 1000)) };
        if (i === 0) return { kind: 'human', inp: new I.PlayerInput(cfg.devs[0] || I.lastDevice), dev: cfg.devs[0] || I.lastDevice };
        if (mode === 'versus') return { kind: 'human', inp: new I.PlayerInput(cfg.devs[1]), dev: cfg.devs[1] };
        if (mode === 'training') return { kind: 'dummy', out: { held: {}, cmds: [] } };
        return { kind: 'ai', ai: new G.AI(lvl, 4242 + Math.floor(Math.random() * 9999)) };
      });
      // la touche qui a validé l'écran précédent ne doit pas compter comme un appui en combat
      for (const s of this.slots) if (s && s.inp) s.inp.reset();
      this.dummy = 'stand';
      if (!isDemo) {
        UI.hide();
        UI.hud.init(m); UI.hud.show(true);
        Au.startMusic(G.Stages.current().music);
      } else UI.hud.show(false);
      document.querySelector('#vignette').className = '';
    },
    endMatch() {
      this.match = null;
      R.projs.sync(null, 1, 0);
      this.previewF = [null, null];
      this.paused = false;
      UI.hud.show(false);
      if (window.speechSynthesis) try { speechSynthesis.cancel(); } catch (e) { /* ignore */ }
    },
    stopMatch() { this.endMatch(); this.mode = 'menu'; this.timeScale = 1; },
    restart() { const c = this.lastCfg; this.begin(c); },
    inFight() { return this.mode === 'fight' && this.match && !this.paused; },
    pause() { if (!this.inFight()) return; this.paused = true; Au.S.ui('back'); UI.pause(); },
    resume() { this.paused = false; UI.hide(); I.syncMenu(); for (const s of this.slots) if (s && s.inp) s.inp.reset(); },
    devOf(i) { const s = this.slots[i]; return s && s.kind === 'human' ? s.dev : null; },
    setDummy(mode) {
      this.dummy = mode;
      if (!this.match) return;
      if (mode === 'cpu') this.slots[1] = { kind: 'ai', ai: new G.AI(this.cfg.level, 777) };
      else if (mode === 'player') {
        const other = I.devices().find((d) => d !== this.slots[0].dev && (d.startsWith('pad') || d === 'kb2')) || (this.slots[0].dev === 'kb2' ? 'kb1' : 'kb2');
        this.slots[1] = { kind: 'human', inp: new I.PlayerInput(other), dev: other };
        UI.toast('Mannequin contrôlé par : ' + I.devName(other));
      } else this.slots[1] = { kind: 'dummy', out: { held: {}, cmds: [] } };
    },
    setSlow(scale, sec) { this.timeScale = scale; this.slowT = sec; document.querySelector('#vignette').classList.add('slow'); },
    flash(color, a) { this.flashC = color; this.flashA = Math.max(this.flashA, a); },

    // ---------- une image de simulation ----------
    simStep() {
      const m = this.match;
      const inputs = [null, null];
      for (let i = 0; i < 2; i++) {
        const s = this.slots[i], f = m.f[i];
        if (!s) continue;
        if (s.kind === 'human') inputs[i] = s.inp.read(f.side);
        else if (s.kind === 'ai') inputs[i] = s.ai.think(m, f, f.opp);
        else inputs[i] = G.dummyInput(this.dummy, f, f.opp, s.out);
      }
      // passer l'intro
      if (m.phase === 'intro') for (let i = 0; i < 2; i++) { const inp = inputs[i]; if (this.slots[i].kind === 'human' && inp && inp.cmds.some((c) => c.t === 'atk' || c.t === 'tech')) m.skipIntro(); }
      m.step(inputs);
    },

    update(dt) {
      const m = this.match;
      const fx = R.fx;
      if ((this.mode === 'fight' || this.mode === 'demo') && m) {
        if (!this.paused) {
          this.acc += dt * this.timeScale;
          let n = 0;
          while (this.acc >= STEP && n < 5) { this.simStep(); this.acc -= STEP; n++; }
          if (n >= 5) this.acc = 0;
          if (this.slowT > 0) { this.slowT -= dt; if (this.slowT <= 0) { this.timeScale = 1; document.querySelector('#vignette').classList.remove('slow'); } }
        }
        // pendant la pause, l'arrêt sur image ou le gel du super : pas d'interpolation (sinon tremblement)
        const alpha = (this.paused || m.hitstop > 0 || m.freeze > 0) ? 1 : U.clamp(this.acc / STEP, 0, 1);
        const vdt = this.paused ? 0 : dt;
        for (const e of m.events) this.onEvent(e);
        m.events.length = 0;
        if (!this.match) return; // l'événement a pu arrêter le match
        const wind = G.Stages.current() ? G.Stages.current().wind : null;
        for (let i = 0; i < 2; i++) if (this.views[i]) this.views[i].update(m.f[i], alpha, vdt, wind);
        R.Cam.update(vdt || 0.0001, m, this.views, alpha);
        R.projs.sync(m.projs, alpha, vdt);
        if (this.mode === 'fight') UI.hud.update(m, dt);
        const mid = { x: (m.f[0].pos.x + m.f[1].pos.x) / 2, z: (m.f[0].pos.z + m.f[1].pos.z) / 2 };
        if (!this.paused) {
          G.Stages.update(dt, performance.now() / 1000, mid);
          for (let i = 0; i < 2; i++) {
            const f = m.f[i];
            if (f.eveil > 0 && this.views[i]) for (let k = 0; k < 2; k++) fx.aura(f.pos.x, f.pos.y, f.pos.z, this.views[i].L.trail);
          }
          fx.update(dt * Math.max(0.35, this.timeScale));
        }
        // fin de match
        if (m.phase === 'over') {
          if (this.mode === 'demo') { this.demoOverT += dt; if (this.demoOverT > 4) { this.mode = 'menu'; this.demo(true); } }
          else if (this.overT >= 0 && !this.paused) { this.overT -= dt; if (this.overT < 0) this.showResults(); }
        }
        // super : vignette sombre
        const sup = m.freeze > 0 || m.f.some((f) => f.state === 'super');
        const vg = this.vgEl || (this.vgEl = document.querySelector('#vignette'));
        if (sup) vg.classList.add('super'); else vg.classList.remove('super');
      } else if (this.mode === 'preview') {
        for (let i = 0; i < 2; i++) {
          const f = this.previewF[i], v = this.views[i];
          if (!f || !v) { if (v) { v.root.visible = false; for (const c of v.chains) c.c.mesh.visible = false; for (const t of v.trails) t.clear(); } continue; }
          if (!v.root.visible) { v.root.visible = true; for (const c of v.chains) c.c.mesh.visible = true; }
          f.age += dt * 60; f.sf += dt * 60;
          v.update(f, 0, dt, G.Stages.current() ? G.Stages.current().wind : null);
        }
        const tanH = Math.tan(42 * Math.PI / 360) * R.camera.aspect;
        const pd = Math.max(6.6, 1.95 / tanH);
        R.Cam.still([0, 1.35, pd], [0, 0.95, 0.4], 42, dt);
        G.Stages.update(dt, performance.now() / 1000, { x: 0, z: 0 });
        fx.update(dt);
      } else if (this.mode === 'stage') {
        const t = this.stageOrbit;
        R.Cam.still([Math.sin(t) * 13, 5.5, Math.cos(t) * 13], [0, 0.5, 0], 50, dt);
        G.Stages.update(dt, performance.now() / 1000, { x: 0, z: 0 });
        fx.update(dt);
      }
      // éclair plein écran
      if (this.flashA > 0) {
        this.flashA = Math.max(0, this.flashA - dt * 3.2);
        const el = document.querySelector('#flash'); el.style.background = this.flashC; el.style.opacity = this.flashA.toFixed(3);
      }
    },

    showResults() {
      const m = this.match, cfg = this.lastCfg;
      const items = [];
      let sub = '';
      if (cfg.mode === 'arcade') {
        const a = this.arcade, won = m.winner === 0;
        if (won && a.idx >= 3) {
          sub = 'CHAMPION ! Vous avez vaincu les quatre lames.';
          items.push({ label: 'MENU PRINCIPAL', act: () => { this.stopMatch(); UI.mainMenu(); } });
        } else if (won) {
          sub = 'Combat ' + (a.idx + 1) + ' / 4 remporté';
          items.push({ label: 'COMBAT SUIVANT', act: () => { a.idx++; this.arcadeNext(); } });
          items.push({ label: 'MENU PRINCIPAL', act: () => { this.stopMatch(); UI.mainMenu(); } });
        } else {
          sub = 'Défaite au combat ' + (a.idx + 1) + ' / 4';
          items.push({ label: 'RÉESSAYER', act: () => this.arcadeNext() });
          items.push({ label: 'ABANDONNER', act: () => { this.stopMatch(); UI.mainMenu(); } });
        }
      } else {
        items.push({ label: 'REVANCHE', act: () => this.restart() });
        items.push({ label: 'CHANGER DE COMBATTANTS', act: () => { const md = cfg.mode; this.stopMatch(); UI.select({ mode: md, keep: [G.CHARS.indexOf(cfg.chars[0]), G.CHARS.indexOf(cfg.chars[1])] }); } });
        items.push({ label: 'CHANGER D\'ARÈNE', act: () => { this.stopMatch(); UI.stage(Object.assign({}, cfg)); } });
        items.push({ label: 'MENU PRINCIPAL', act: () => { this.stopMatch(); UI.mainMenu(); } });
      }
      UI.hud.show(false);
      UI.results(m, { items, sub });
    },

    // ---------- événements de combat → sons, effets, vibrations, annonces ----------
    onEvent(e) {
      const demo = this.mode === 'demo';
      const S = Au.S, fx = R.fx, Cam = R.Cam;
      const devOf = (f) => (f ? this.devOf(f.idx) : null);
      const rum = (f, s, w, ms) => { const d = devOf(f); if (d) I.rumble(d, s, w, ms); };
      const color = (f) => (this.views[f.idx] ? this.views[f.idx].L.trail : 0xffaa55);
      switch (e.type) {
        case 'swing': if (!demo) S.swing(e.w, e.k); break;
        case 'hit': {
          const pw = U.clamp(e.dmg / 20, 0.3, 1.6) + (e.counter ? 0.25 : 0);
          const dx = e.def.pos.x - e.att.pos.x, dz = e.def.pos.z - e.att.pos.z, dl = Math.hypot(dx, dz) || 1;
          fx.hit(e.p, { x: dx / dl, z: dz / dl }, pw, color(e.att));
          if (!demo) S.hit(pw, e.kind);
          Cam.addShake(0.18 + pw * 0.28 + (e.ko ? 0.6 : 0));
          if (e.heavy) Cam.punch = Math.min(1, Cam.punch + 0.6);
          rum(e.def, 0.35 + pw * 0.45, 0.3 + pw * 0.3, 110 + pw * 120); rum(e.att, 0.1, 0.35, 70);
          if (e.counter && !demo) UI.tag(e.att.idx, 'CONTRE !');
          if (e.quake) { fx.quake(e.def.pos.x, e.def.pos.z); Cam.addShake(0.8); }
          if (this.match && this.match.training) { UI.hud.trainCombo = e.def.comboHits; UI.hud.trainDmg = e.def.comboDmg; }
          break;
        }
        case 'block':
          fx.block(e.p, e.heavy); if (!demo) S.block(e.heavy); Cam.addShake(e.heavy ? 0.2 : 0.1);
          rum(e.def, 0.15, 0.3, 70); break;
        case 'parry':
          fx.parry(e.p); if (!demo) { S.parry(); UI.tag(e.def.idx, 'PARADE !'); }
          this.flash('#bff8ff', 0.3); this.setSlow(0.45, 0.25); Cam.addShake(0.3);
          rum(e.def, 0.2, 0.6, 120); if (!e.proj) rum(e.att, 0.5, 0.3, 160); break;
        case 'clash':
          fx.clash(e.p); if (!demo) { S.clash(); UI.tag(0, 'CHOC !'); UI.tag(1, 'CHOC !'); }
          this.flash('#fff6d8', 0.35); Cam.addShake(0.45); this.setSlow(0.4, 0.2);
          rum(e.a, 0.4, 0.4, 140); rum(e.b, 0.4, 0.4, 140); break;
        case 'proj': if (!demo) S.spell(); rum(e.f, 0.1, 0.3, 60); break;
        case 'projclash': fx.clash(e.p); if (!demo) S.clash(); Cam.addShake(0.25); break;
        case 'dash': if (!demo) S.dash(); fx.dust(e.f.pos.x, e.f.pos.z, 5); break;
        case 'land': if (!demo) S.land(e.heavy); fx.dust(e.f.pos.x, e.f.pos.z, 12, true); Cam.addShake(0.15); rum(e.f, 0.3, 0.1, 90); break;
        case 'tech': if (!demo) UI.tag(e.f.idx, 'RATTRAPAGE'); break;
        case 'grab': if (!demo) S.grab(); rum(e.def, 0.3, 0.2, 100); break;
        case 'throwbreak': fx.block(e.p, true); if (!demo) { S.block(true); UI.tag(e.a.idx, 'DÉGAGEMENT'); UI.tag(e.b.idx, 'DÉGAGEMENT'); } break;
        case 'superflash':
          if (!demo) { S.superflash(); UI.banner('FRAPPE DE TEMPÊTE', 'gold', 1.1); }
          this.flash('#ffffff', 0.5); Cam.punch = 1; rum(e.f, 0.4, 0.6, 300);
          fx.ring({ x: e.f.pos.x, y: 1.2, z: e.f.pos.z }, color(e.f), 0.3, 3, 0.5);
          break;
        case 'superHit': if (!demo) UI.sub(e.att.char.moves.S2.name.toUpperCase()); break;
        case 'eveil':
          if (!demo) { S.eveil(); UI.tag(e.f.idx, 'ÉVEIL'); }
          fx.ring({ x: e.f.pos.x, y: 1.1, z: e.f.pos.z }, color(e.f), 0.3, 2.5, 0.5); this.flash('#c8b8ff', 0.25); rum(e.f, 0.2, 0.5, 250); break;
        case 'eveilWave': fx.ring({ x: e.f.pos.x, y: 0.08, z: e.f.pos.z }, color(e.f), 0.3, 4, 0.5, true); Cam.addShake(0.3); break;
        case 'wall': if (!demo) { UI.tag(e.f.idx, 'MUR !'); S.hit(1.0, 'h'); } fx.dust(e.p.x, e.p.z, 14, true); Cam.addShake(0.5); break;
        case 'armor': if (!demo) { S.block(true); S.hit(0.5, 'h'); UI.tag(e.def.idx, 'ENCAISSE !'); } fx.block(e.p, true); Cam.addShake(0.3); break;
        case 'guardbreak': if (!demo) { S.clash(); UI.tag(e.def.idx, 'GARDE BRISÉE'); } fx.clash(e.p); Cam.addShake(0.5); break;
        case 'round': {
          if (demo) break;
          const txt = e.final ? 'MANCHE FINALE' : 'MANCHE ' + e.n;
          UI.banner(txt, 'gold', 1.15); S.ui('banner');
          Au.say(e.final ? 'Manche finale' : 'Manche ' + (NUM[e.n] || e.n));
          break;
        }
        case 'fight': if (!demo) { UI.banner('COMBATTEZ !', 'red', 1.0); Au.say('Combattez !', 1.1); } break;
        case 'ko':
          if (e.training) break;
          this.setSlow(e.final ? 0.22 : 0.4, e.final ? 1.9 : 1.0);
          this.flash('#ffffff', 0.6);
          rum(e.att, 0.6, 0.6, 400); rum(e.def, 1, 1, 600);
          if (!demo) { S.ko(); UI.banner('K.O.', 'red', 2.0); Au.say('K.O. !', 0.9); }
          break;
        case 'ringout':
          if (e.training) { if (!demo) UI.tag(e.f.idx, 'HORS-JEU'); break; }
          this.setSlow(0.5, 1.0);
          if (!demo) { S.ringout(); UI.banner('HORS-JEU !', 'ice', 2.0); Au.say('Hors-jeu !'); }
          break;
        case 'timeup': if (!demo) { UI.banner('TEMPS ÉCOULÉ', 'gold', 1.8); Au.say('Temps écoulé'); } break;
        case 'roundResult':
          if (demo) break;
          if (e.winner < 0) UI.sub('MANCHE NULLE');
          else {
            const w = this.match.f[e.winner];
            if (w.hp >= w.maxHp) { UI.sub('PARFAIT !'); Au.say('Parfait !'); } else UI.sub(w.char.name + ' REMPORTE LA MANCHE');
          }
          break;
        case 'matchOver':
          if (demo) break;
          if (e.winner >= 0) { UI.banner('VICTOIRE', 'gold', 2.6); UI.sub(this.match.f[e.winner].char.name); Au.say('Victoire de ' + this.match.f[e.winner].char.name.replace(/[^\p{L}\s'-]/gu, '').trim().toLowerCase()); }
          else UI.banner('MATCH NUL', 'gold', 2.4);
          this.overT = 2.8;
          break;
        case 'move': { const mv = e.f.char.moves[e.key]; if (e.f.idx === 0 && mv) UI.hud.trainMove = mv.name + ' (démarrage ' + mv.first + ' img)'; break; }
        default: break;
      }
    },
  };

  // ---------- démarrage ----------
  function boot() {
    const canvas = document.getElementById('c');
    Game.loadCfg();
    try {
      R.init(canvas, Game.cfg.quality);
    } catch (err) {
      document.querySelector('#loading .ld').innerHTML = '<div class="err">Impossible d\'initialiser la 3D (WebGL). Mettez à jour le navigateur ou les pilotes graphiques, ou essayez Chrome / Edge.<br><small>' + String(err && err.message || err) + '</small></div>';
      return;
    }
    I.init();
    I.rumbleOn = Game.cfg.rumble;
    Game.applyAudio();
    // le son ne peut démarrer qu'après une action de l'utilisateur
    const unlock = () => { Au.ensure(); Game.applyAudio(); };
    window.addEventListener('pointerdown', unlock); window.addEventListener('keydown', unlock);
    I.onAny((kind) => { if (kind === 'pad') Au.ensure(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden && Game.inFight()) Game.pause(); });
    UI.title();
    setTimeout(() => document.getElementById('loading').classList.add('gone'), 250);
    requestAnimationFrame(loop);
  }

  let ecoNext = 0, last = performance.now(), frames = 0, fpsT = 0, fpsN = 0, hz = 60, hzS = 0, hzN = 0;
  function loop(now) {
    requestAnimationFrame(loop);
    const raw = (now - last) / 1000;
    // mesure de la fréquence de l'écran (pour le mode économie)
    if (hzN < 120 && raw > 0.002 && raw < 0.05) { hzS += raw; hzN++; if (hzN === 120) hz = 1 / (hzS / hzN); }
    frames++;
    // mode économie : ~60 images/s quel que soit l'écran (90, 100, 120, 144, 165 Hz…), au temps et non au compte d'images
    if (Game.cfg.eco && hz > 75) {
      const iv = 1000 / 60, tol = 0.4 * 1000 / hz;
      if (now < ecoNext - tol) return;
      ecoNext = (now - ecoNext > iv) ? now + iv : ecoNext + iv;
    }
    const dt = Math.min(0.1, raw);
    last = now;
    I.poll();
    UI.update(dt, now);
    Game.update(dt);
    R.render();
    if (Game.cfg.fps) {
      fpsT += raw; fpsN++;
      if (fpsT > 0.5) { document.getElementById('fps').textContent = Math.round(fpsN / fpsT) + ' i/s'; fpsT = 0; fpsN = 0; }
    } else if (fpsN) { document.getElementById('fps').textContent = ''; fpsN = 0; fpsT = 0; }
  }

  // outil de test : avance le jeu de n images (utile quand l'onglet est en arrière-plan)
  G.debugStep = function (n, dt) {
    dt = dt || STEP;
    document.getElementById('loading').style.display = 'none';
    for (let i = 0; i < (n || 1); i++) { I.poll(); UI.update(dt, performance.now()); Game.update(dt); }
    R.render();
  };

  window.addEventListener('load', boot);
})(window);
