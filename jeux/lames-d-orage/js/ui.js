'use strict';
// LAMES D'ORAGE — interface : menus navigables à la manette / au clavier / à la souris, HUD.
(function (root) {
  const G = root.G, I = G.Input;
  const UI = G.UI = {};
  const $ = (s, el) => (el || document).querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const snd = (k) => G.Audio && G.Audio.S.ui(k);
  let cur = null;

  UI.show = function (id, html, h) {
    UI.hide();
    const el = document.createElement('section');
    el.id = 's-' + id; el.innerHTML = html;
    $('#screens').appendChild(el);
    cur = { id, el, h: h || {} };
    I.syncMenu();
    if (cur.h.init) cur.h.init(el);
    return el;
  };
  UI.hide = function () { if (cur && cur.h.leave) cur.h.leave(); $('#screens').innerHTML = ''; cur = null; };
  UI.current = () => (cur ? cur.id : null);
  UI.update = function (dt, now) {
    if (cur) {
      if (cur.h.perDevice) cur.h.update(now, dt);
      else { const e = I.menuAll(now); if (e.any && cur.h.input) cur.h.input(e); }
      if (cur && cur.h.tick) cur.h.tick(dt);
    } else {
      const e = I.menuAll(now);
      if (e.start && G.Game.inFight()) G.Game.pause();
    }
  };

  // ---------- menu générique ----------
  class Menu {
    constructor(box, items, opts) { this.box = box; this.items = items; this.opts = opts || {}; this.i = 0; this.render(); }
    render() {
      this.box.innerHTML = '';
      this.items.forEach((it, k) => {
        const d = document.createElement('div');
        d.className = 'it';
        d.innerHTML = '<span>' + it.label + (it.sub ? ' <small>' + it.sub + '</small>' : '') + '</span>' + (it.values ? '<span class="val"></span>' : '');
        d.addEventListener('mouseenter', () => this.set(k));
        d.addEventListener('click', () => { this.set(k); if (it.values) this.change(1); else this.ok(); });
        this.box.appendChild(d); it.el = d;
      });
      this.refresh();
    }
    refresh() {
      this.items.forEach((it, k) => {
        it.el.classList.toggle('on', k === this.i);
        if (it.values) it.el.querySelector('.val').textContent = it.values[it.get()];
      });
    }
    set(k) { if (k !== this.i) { this.i = k; snd('move'); this.refresh(); if (this.opts.onMove) this.opts.onMove(this.items[k], k); } }
    change(d) {
      const it = this.items[this.i];
      if (!it.values) return;
      const n = it.values.length;
      it.set((it.get() + d + n) % n); snd('move'); this.refresh();
    }
    ok() { const it = this.items[this.i]; if (it.act) { snd('ok'); it.act(it); } else if (it.values) this.change(1); }
    input(e) {
      if (e.up) this.set((this.i - 1 + this.items.length) % this.items.length);
      else if (e.down) this.set((this.i + 1) % this.items.length);
      else if (e.left) this.change(-1);
      else if (e.right) this.change(1);
      else if (e.ok) this.ok();
      else if (e.back && this.opts.back) { snd('back'); this.opts.back(); }
    }
  }
  UI.Menu = Menu;

  // ---------- écran titre ----------
  UI.title = function () {
    G.Game.demo(true);
    const el = UI.show('title', '<div class="logo">LAMES <span>D\'ORAGE</span></div><div class="press">APPUYEZ SUR UNE TOUCHE</div>' +
      '<div class="hint">Manette PS5, Xbox ou autre : branchez-la puis appuyez sur un bouton · Clavier : Entrée</div>', {
      input(e) { if (e.any) go(); },
    });
    const go = () => { G.Audio.ensure(); snd('select'); UI.mainMenu(); };
    el.addEventListener('pointerdown', go);
  };

  // ---------- menu principal ----------
  UI.mainMenu = function (sel) {
    G.Game.demo(true);
    G.Audio.startMusic('menu');
    let menu;
    UI.show('main', '<div class="mainwrap"><div class="logo">LAMES <span>D\'ORAGE</span></div><div class="menu" id="mm"></div><div class="hint" id="mmh"></div></div>', {
      init(el) {
        const items = [
          { label: 'ARCADE', sub: '4 duels de suite', act: () => UI.select({ mode: 'arcade' }) },
          { label: 'DUEL CONTRE L\'ORDI', sub: '1 joueur', act: () => UI.select({ mode: 'cpu' }) },
          { label: 'VERSUS', sub: '2 joueurs', act: () => UI.select({ mode: 'versus' }) },
          { label: 'ENTRAÎNEMENT', sub: 'mannequin', act: () => UI.select({ mode: 'training' }) },
          { label: 'COMMANDES & COUPS', act: () => UI.controls(() => UI.mainMenu(4)) },
          { label: 'OPTIONS', act: () => UI.options(() => UI.mainMenu(5)) },
        ];
        menu = new Menu($('#mm', el), items);
        if (sel) { menu.i = sel; menu.refresh(); }
        const n = I.padCount();
        $('#mmh', el).textContent = n ? n + ' manette(s) détectée(s) · ✕/A : valider · ○/B : retour' : 'Aucune manette détectée : appuyez sur un bouton de la manette pour l\'activer · Clavier : flèches/ZQSD + Entrée';
      },
      input(e) { menu.input(e); if (e.back) UI.title(); },
    });
  };

  // ---------- sélection des combattants ----------
  const N = G.CHARS.length;
  function statBar(n) { let s = ''; for (let i = 1; i <= 5; i++) s += '<i class="' + (i <= n ? 'on' : '') + '"></i>'; return '<b>' + s + '</b>'; }
  function infoHTML(ch, who) {
    return '<div class="who">' + who + '</div><div class="nm">' + esc(ch.name) + '</div><div class="tt">' + esc(ch.title) + ' · ' + esc(ch.weapon) + (ch.family ? ' · <b>' + esc(ch.family.toUpperCase()) + '</b>' : '') + '</div>' +
      '<div class="ds">' + esc(ch.desc) + '</div>' +
      '<div class="stat"><span>PUISSANCE</span>' + statBar(ch.stats.power) + '</div><div class="stat"><span>VITESSE</span>' + statBar(ch.stats.speed) + '</div><div class="stat"><span>PORTÉE</span>' + statBar(ch.stats.reach) + '</div>';
  }
  UI.select = function (opt) {
    const mode = opt.mode;
    const S = {
      mode, pick: [0, 1], lock: [false, false], devs: [I.lastDevice, null], step: 0, done: 0,
    };
    if (opt.keep) { S.pick = opt.keep.slice(); }
    const two = mode === 'versus';
    const title = { arcade: 'ARCADE', cpu: 'DUEL CONTRE L\'ORDINATEUR', versus: 'VERSUS', training: 'ENTRAÎNEMENT' }[mode];
    let cards = '';
    G.CHARS.forEach((c, i) => {
      const col = '#' + (c.card || c.look.main).toString(16).padStart(6, '0');
      cards += '<div class="card" data-i="' + i + '"><div class="cn">' + esc(c.name) + '</div><div class="cw">' + esc(c.weapon) + '</div><div class="sw" style="background:' + col + '"></div></div>';
    });
    const el = UI.show('select', '<div class="selhead"><h2>' + title + '</h2><div class="hint" id="selh"></div></div>' +
      '<div class="selinfo p1"></div><div class="selinfo p2"></div><div class="grid">' + cards + '</div><div class="hint selfoot">◀ ▶ choisir · ✕/A/Entrée valider · ○/B/Échap retour</div>', {
      perDevice: true,
      update(now) {
        for (const d of I.devices()) {
          const e = I.menuEdges(d, now);
          if (!e.any) continue;
          let p;
          if (two) {
            if (d === S.devs[0]) p = 0;
            else if (d === S.devs[1]) p = 1;
            else if (!S.devs[1] && e.ok && d !== S.devs[0]) { S.devs[1] = d; snd('select'); render(); continue; }
            else continue;
          } else { p = S.step; if (S.devs[0] !== d && !S.lock[0]) { S.devs[0] = d; render(); } }
          handle(p, e);
        }
      },
    });
    const handle = (p, e) => {
      if (e.back) {
        snd('back');
        if (S.lock[p]) { S.lock[p] = false; if (!two && p === 1) S.step = 1; render(); return; }
        if (!two && S.step === 1) { S.step = 0; S.lock[0] = false; render(); return; }
        UI.mainMenu(); return;
      }
      if (S.lock[p]) return;
      if (e.left) { S.pick[p] = (S.pick[p] - 1 + N) % N; snd('move'); render(); }
      if (e.right) { S.pick[p] = (S.pick[p] + 1) % N; snd('move'); render(); }
      if (e.up || e.down) { S.pick[p] = (S.pick[p] + (e.up ? N - 3 : 3)) % N; snd('move'); render(); }
      if (e.ok) {
        S.lock[p] = true; snd('select');
        if (mode === 'arcade') { S.lock[1] = true; }
        else if (!two && p === 0) S.step = 1;
        render();
        if (S.lock[0] && S.lock[1]) setTimeout(() => { if (UI.current() === 'select' && S.lock[0] && S.lock[1] && !S.done) { S.done = 1; finish(); } }, 450);
      }
    };
    const finish = () => {
      const chars = [G.CHARS[S.pick[0]], G.CHARS[S.pick[1]]];
      if (mode === 'arcade') G.Game.startArcade(chars[0], S.devs[0]);
      else UI.stage({ mode, chars, devs: S.devs });
    };
    const render = () => {
      el.querySelectorAll('.card').forEach((c) => {
        const i = +c.dataset.i;
        const on1 = S.pick[0] === i, on2 = (mode !== 'arcade') && S.pick[1] === i && (two ? !!S.devs[1] : (S.step === 1 || S.lock[1]));
        c.classList.toggle('c1', on1); c.classList.toggle('c2', on2);
        c.innerHTML = c.innerHTML.replace(/<span class="cur[^<]*<\/span>/g, '') + (on1 ? '<span class="cur p1">J1</span>' : '') + (on2 ? '<span class="cur p2">' + (two ? 'J2' : 'CPU') + '</span>' : '');
      });
      const i1 = $('.selinfo.p1', el), i2 = $('.selinfo.p2', el);
      i1.innerHTML = infoHTML(G.CHARS[S.pick[0]], 'JOUEUR 1 · ' + esc(I.devName(S.devs[0]))) + (S.lock[0] ? '<div class="ready">PRÊT !</div>' : '');
      i2.classList.toggle('hidden', mode === 'arcade' || (!two && S.step === 0 && !S.lock[1]));
      if (two && !S.devs[1]) i2.innerHTML = '<div class="who">JOUEUR 2</div><div class="join">Appuyez sur ✕ / A (2e manette)<br>ou Entrée du pavé numérique (clavier flèches)</div>';
      else i2.innerHTML = infoHTML(G.CHARS[S.pick[1]], two ? 'JOUEUR 2 · ' + esc(I.devName(S.devs[1])) : (mode === 'training' ? 'MANNEQUIN' : 'ORDINATEUR')) + (S.lock[1] ? '<div class="ready">PRÊT !</div>' : '');
      $('#selh', el).textContent = two ? '' : (S.step === 0 ? 'Choisissez votre combattant' : (mode === 'training' ? 'Choisissez le mannequin' : 'Choisissez votre adversaire'));
      const showP2 = mode !== 'arcade' && (two ? !!S.devs[1] : S.step === 1 || S.lock[1]);
      G.Game.preview([G.CHARS[S.pick[0]], showP2 ? G.CHARS[S.pick[1]] : null]);
    };
    el.querySelectorAll('.card').forEach((c) => c.addEventListener('click', () => {
      const p = two ? 0 : S.step;
      if (S.lock[p]) return;
      S.pick[p] = +c.dataset.i; render(); handle(p, { ok: true });
    }));
    render();
  };

  // ---------- sélection de l'arène ----------
  UI.stage = function (cfg) {
    const list = G.ARENAS.map((a, i) => ({ id: a.id, name: a.name, desc: a.desc, i }));
    list.push({ id: 'random', name: 'Aléatoire', desc: 'Laissez le destin choisir.' });
    let i = cfg.stageIdx || 0;
    let html = '<div class="selhead"><h2>CHOIX DE L\'ARÈNE</h2></div><div class="stages">';
    list.forEach((s, k) => { html += '<div class="stg" data-k="' + k + '"><b>' + esc(s.name) + '</b><span>' + esc(s.desc) + '</span></div>'; });
    html += '</div><div class="hint">◀ ▶ choisir · ✕/A valider · ○/B retour</div>';
    const el = UI.show('stage', html, {
      input(e) {
        if (e.left) { i = (i - 1 + list.length) % list.length; snd('move'); upd(); }
        if (e.right) { i = (i + 1) % list.length; snd('move'); upd(); }
        if (e.ok) { snd('select'); go(); }
        if (e.back) { snd('back'); UI.select({ mode: cfg.mode, keep: [G.CHARS.indexOf(cfg.chars[0]), G.CHARS.indexOf(cfg.chars[1])] }); }
      },
      tick(dt) { G.Game.stageOrbit = (G.Game.stageOrbit || 0) + dt * 0.25; },
    });
    el.style.justifyContent = 'flex-end'; el.style.paddingBottom = '40px';
    const upd = () => {
      el.querySelectorAll('.stg').forEach((s) => s.classList.toggle('on', +s.dataset.k === i));
      const id = list[i].id === 'random' ? null : list[i].id;
      G.Game.previewStage(id);
    };
    const go = () => {
      let a = list[i];
      if (a.id === 'random') a = list[Math.floor(Math.random() * G.ARENAS.length)];
      cfg.stageIdx = i;
      G.Game.startVersus(Object.assign({}, cfg, { arena: G.ARENAS[a.i] }));
    };
    el.querySelectorAll('.stg').forEach((s) => s.addEventListener('click', () => { i = +s.dataset.k; upd(); go(); }));
    upd();
  };

  // ---------- écran versus ----------
  UI.vs = function (c0, c1, sub, cb) {
    UI.show('vs', '<div class="vs"><div class="n l">' + esc(c0.name) + '</div><div class="x">VS</div><div class="n r">' + esc(c1.name) + '</div></div><div class="vsub">' + esc(sub || '') + '</div>', {
      input(e) { if (e.ok || e.start) { done(); } },
    });
    snd('banner');
    let fired = false;
    const done = () => { if (fired) return; fired = true; UI.hide(); cb(); };
    setTimeout(done, 1700);
  };

  // ---------- pause ----------
  UI.pause = function () {
    const g = G.Game, m = g.match;
    const items = [{ label: 'REPRENDRE', act: () => g.resume() }];
    items.push({ label: 'LISTE DES COUPS', act: () => UI.moves(m.f[0].char, () => UI.pause(), g.devOf(0)) });
    items.push({ label: 'COMMANDES', act: () => UI.controls(() => UI.pause()) });
    if (m.training) {
      const modes = ['stand', 'guard', 'crouch', 'cpu', 'player'];
      const labels = ['Immobile', 'Garde parfaite', 'Accroupi', 'Ordinateur', 'Joueur 2'];
      items.push({ label: 'MANNEQUIN', values: labels, get: () => Math.max(0, modes.indexOf(g.dummy)), set: (k) => g.setDummy(modes[k]) });
      items.push({ label: 'JAUGE INFINIE', values: ['Non', 'Oui'], get: () => (m.trainOpts.gauge ? 1 : 0), set: (k) => { m.trainOpts.gauge = !!k; } });
    }
    items.push({ label: 'RECOMMENCER', act: () => g.restart() });
    items.push({ label: 'CHANGER DE COMBATTANTS', act: () => { g.stopMatch(); UI.select({ mode: g.lastCfg.mode === 'arcade' ? 'arcade' : g.lastCfg.mode }); } });
    items.push({ label: 'MENU PRINCIPAL', act: () => { g.stopMatch(); UI.mainMenu(); } });
    let menu;
    UI.show('pause', '<div class="panel" style="max-width:520px"><h2>PAUSE</h2><div class="menu small" id="pm"></div></div>', {
      init(el) { menu = new Menu($('#pm', el), items, { back: () => g.resume() }); },
      input(e) { if (e.start && !e.back && !e.ok) { g.resume(); return; } menu.input(e); },
    });
  };

  // ---------- résultats ----------
  UI.results = function (m, opts) {
    const w = m.winner;
    const f0 = m.f[0], f1 = m.f[1];
    const title = w < 0 ? 'MATCH NUL' : 'VICTOIRE · ' + esc(m.f[w].char.name);
    const row = (lab, a, b) => '<div class="l">' + a + '</div><div class="c">' + lab + '</div><div class="r">' + b + '</div>';
    let html = '<div class="panel" style="max-width:640px"><h2>' + title + '</h2>';
    if (opts && opts.sub) html += '<div class="subt">' + esc(opts.sub) + '</div>';
    html += '<div class="res">' + row('', esc(f0.char.name), esc(f1.char.name)) + row('MANCHES', f0.wins, f1.wins) + row('COUPS PORTÉS', f0.stats.hits, f1.stats.hits) +
      row('DÉGÂTS', f0.stats.dmg, f1.stats.dmg) + row('PARADES', f0.stats.parries, f1.stats.parries) + row('COMBO MAX', f0.stats.maxCombo, f1.stats.maxCombo) + '</div><div class="menu small" id="rm"></div></div>';
    let menu;
    UI.show('results', html, {
      init(el) { menu = new Menu($('#rm', el), opts.items); },
      input(e) { menu.input(e); },
    });
  };

  // ---------- options ----------
  UI.options = function (back) {
    const g = G.Game, c = g.cfg;
    const idx = (arr, v) => Math.max(0, arr.indexOf(v));
    const R3 = [1, 2, 3], T = [30, 60, 99, 0], Q = ['low', 'medium', 'high'], VOL = [0, 0.2, 0.4, 0.6, 0.8, 1];
    const pct = VOL.map((v) => Math.round(v * 100) + ' %');
    const items = [
      { label: 'MANCHES GAGNANTES', values: ['1', '2', '3'], get: () => idx(R3, c.rounds), set: (k) => { c.rounds = R3[k]; } },
      { label: 'TEMPS PAR MANCHE', values: ['30 s', '60 s', '99 s', 'Illimité'], get: () => idx(T, c.time), set: (k) => { c.time = T[k]; } },
      { label: 'DIFFICULTÉ (ORDI)', values: G.AI_LEVELS.map((l) => l.name), get: () => c.level, set: (k) => { c.level = k; } },
      { label: 'VOLUME GÉNÉRAL', values: pct, get: () => idx(VOL, c.vMaster), set: (k) => { c.vMaster = VOL[k]; g.applyAudio(); } },
      { label: 'EFFETS SONORES', values: pct, get: () => idx(VOL, c.vSfx), set: (k) => { c.vSfx = VOL[k]; g.applyAudio(); G.Audio.S.hit(0.8); } },
      { label: 'MUSIQUE', values: pct, get: () => idx(VOL, c.vMusic), set: (k) => { c.vMusic = VOL[k]; g.applyAudio(); } },
      { label: 'ANNONCEUR (VOIX)', values: ['Non', 'Oui'], get: () => (c.voice ? 1 : 0), set: (k) => { c.voice = !!k; g.applyAudio(); if (k) G.Audio.say('Combattez !'); } },
      { label: 'VIBRATIONS MANETTE', values: ['Non', 'Oui'], get: () => (c.rumble ? 1 : 0), set: (k) => { c.rumble = !!k; I.rumbleOn = c.rumble; } },
      { label: 'QUALITÉ GRAPHIQUE', values: ['Basse', 'Moyenne', 'Haute'], get: () => idx(Q, c.quality), set: (k) => { c.quality = Q[k]; g.qualityChanged = true; } },
      { label: 'ÉCONOMIE (≈ 60 IMAGES/S)', values: ['Non', 'Oui'], get: () => (c.eco ? 1 : 0), set: (k) => { c.eco = !!k; } },
      { label: 'AFFICHER IMAGES/S', values: ['Non', 'Oui'], get: () => (c.fps ? 1 : 0), set: (k) => { c.fps = !!k; } },
      { label: 'RETOUR', act: () => leave() },
    ];
    const leave = () => {
      g.saveCfg();
      if (g.qualityChanged) {
        g.qualityChanged = false;
        // question jouable à la manette (pas de boîte de dialogue du navigateur)
        let qm;
        UI.show('options', '<div class="panel" style="max-width:640px"><h2>QUALITÉ GRAPHIQUE</h2><div class="hint">La nouvelle qualité s’applique au redémarrage du jeu.</div><div class="menu small" id="qm"></div></div>', {
          init(el) { qm = new Menu($('#qm', el), [{ label: 'REDÉMARRER MAINTENANT', act: () => location.reload() }, { label: 'PLUS TARD', act: () => back() }], { back: () => back() }); },
          input(e) { qm.input(e); },
        });
        return;
      }
      back();
    };
    let menu;
    UI.show('options', '<div class="panel" style="max-width:640px"><h2>OPTIONS</h2><div class="menu small" id="om"></div><div class="hint">◀ ▶ modifier · ○/B retour</div></div>', {
      init(el) { menu = new Menu($('#om', el), items, { back: leave }); },
      input(e) { menu.input(e); },
    });
  };

  // ---------- commandes ----------
  function howto() {
    return '<div class="howto"><b>Principe</b> : réduisez la vie adverse à zéro (K.O.) ou <b>éjectez</b> l\'adversaire hors de l\'arène.<br>' +
      '<b>Tailles horizontales</b> : rattrapent les pas de côté. <b>Tailles verticales</b> : puissantes, mais évitées par un pas de côté.<br>' +
      '<b>Garde</b> debout : bloque les coups hauts et moyens. <b>Garde accroupie</b> : bloque les coups bas. Les coups hauts passent au-dessus d\'un adversaire accroupi.<br>' +
      '<b>Parade</b> : au bon moment, dévie n\'importe quel coup (sauf saisie et super) et laisse l\'adversaire sans défense.<br>' +
      '<b>Saisie</b> : passe la garde. Dégagez-vous en appuyant sur Saisie (ou Taille horizontale) dès qu\'on vous attrape.<br>' +
      '<b>Jauge de Tempête</b> (2 barres) : se remplit en frappant et en encaissant. 1 barre = <b>Frappe de Tempête</b> (super-coup filmé) ou <b>Éveil</b> (8 s plus rapide et plus fort).<br>' +
      '<b>Déplacements</b> : avancer/reculer, haut/bas = tourner autour de l\'adversaire. Double appui : ruée (→→), recul (←←), pas de côté (↑↑ / ↓↓).<br>' +
      '<b>Rattrapage</b> : appuyez sur Garde juste avant de toucher le sol.</div>';
  }
  UI.controls = function (back) {
    let devs = I.devices();
    let di = Math.max(0, devs.indexOf(I.lastDevice));
    let row = 0, capturing = false;
    const acts = I.ACTIONS;
    const el = UI.show('controls', '<div class="panel"><h2>COMMANDES</h2><div class="cols"><div><div class="hint" style="text-align:left;margin:0 0 6px">◀ ▶ appareil · ✕/A reconfigurer · ○/B retour</div><div id="cdev" style="font-weight:700;letter-spacing:2px;color:var(--gold);margin-bottom:6px"></div><table class="kv" id="ctab"></table></div><div>' + howto() + '</div></div></div>', {
      input(e) {
        if (capturing) return;
        if (e.left || e.right) { devs = I.devices(); di = (di + (e.left ? -1 : 1) + devs.length) % devs.length; snd('move'); draw(); }
        else if (e.up) { row = (row - 1 + acts.length + 2) % (acts.length + 2); snd('move'); draw(); }
        else if (e.down) { row = (row + 1) % (acts.length + 2); snd('move'); draw(); }
        else if (e.ok) {
          const d = devs[di];
          if (row === acts.length) { I.resetBindings(d); snd('ok'); draw(); }
          else if (row === acts.length + 1) { snd('back'); back(); }
          else {
            capturing = true; draw();
            I.capture(d, (v) => { I.setBinding(d, acts[row], v); capturing = false; snd('ok'); I.syncMenu(); draw(); });
          }
        } else if (e.back) { snd('back'); back(); }
      },
      leave() { I.cancelCapture(); },
    });
    const draw = () => {
      const d = devs[di];
      $('#cdev', el).textContent = '◀ ' + I.devName(d) + ' ▶';
      let h = '<tr><td>Déplacements</td><td>' + I.dirGlyph(d, 'left') + I.dirGlyph(d, 'right') + I.dirGlyph(d, 'up') + I.dirGlyph(d, 'down') + (d.startsWith('pad') ? ' <small>ou stick gauche</small>' : '') + '</td></tr>';
      acts.forEach((a, k) => {
        h += '<tr class="' + (k === row ? 'on' : '') + '"><td>' + I.ACTION_LABEL[a] + '</td><td>' + (capturing && k === row ? '<b style="color:var(--gold)">Appuyez sur une touche…</b>' : I.glyph(d, a)) + '</td></tr>';
      });
      h += '<tr class="' + (row === acts.length ? 'on' : '') + '"><td colspan="2"><b>Réinitialiser cet appareil</b></td></tr>';
      h += '<tr class="' + (row === acts.length + 1 ? 'on' : '') + '"><td colspan="2"><b>Retour</b></td></tr>';
      $('#ctab', el).innerHTML = h;
    };
    draw();
  };

  // ---------- liste des coups ----------
  const HL = { high: 'haut', mid: 'moyen', low: 'bas' };
  function notation(key, dev) {
    const g = (a) => I.glyph(dev, a);
    const fw = '<span class="gl dir">→</span>', bk = '<span class="gl dir">←</span>';
    if (key === 'T') return g('T') + ' ou ' + g('H') + '+' + g('G');
    if (key === 'S') return g('S');
    if (key === 'HV') return g('H') + '+' + g('V');
    if (key === 'VK') return g('V') + '+' + g('K');
    if (/^[HVK]+$/.test(key)) return key.split('').map(g).join(' ');
    const b = key.slice(-1), mod = key.slice(0, -1);
    const pre = { 6: fw + '+', 4: bk + '+', 2: g('C') + '+', 8: '<span class="gl dir">↑</span>/<span class="gl dir">↓</span> maintenu +', 66: fw + fw + '+' }[mod] || '';
    return pre + ' ' + g(b);
  }
  const ORDER = ['H', 'HH', 'HHH', '6H', '4H', '2H', '8H', '66H', 'V', 'VV', 'VVV', '6V', '4V', '2V', '8V', '66V', 'K', '6K', '2K', 'HV', 'VK', 'T', 'S'];
  UI.moves = function (ch, back, dev) {
    let ci = G.CHARS.indexOf(ch);
    dev = dev || I.lastDevice;
    const el = UI.show('moves', '<div class="panel"><h2 id="mvh"></h2><div class="subt">◀ ▶ changer de combattant · → = vers l\'adversaire · ○/B retour</div><table class="kv" id="mvt"></table></div>', {
      input(e) {
        if (e.left || e.right) { ci = (ci + (e.left ? -1 : 1) + G.CHARS.length) % G.CHARS.length; snd('move'); draw(); }
        if (e.back || e.ok) { snd('back'); back(); }
      },
    });
    const draw = () => {
      const c = G.CHARS[ci];
      $('#mvh', el).textContent = c.name + ' — ' + c.weapon;
      let h = '';
      for (const k of ORDER) {
        const m = c.moves[k];
        if (!m) continue;
        const props = [];
        if (m.proj) props.push('sort à distance · ' + HL[m.proj[0].h]);
        else if (k !== 'T' && k !== 'S') props.push(m.hits.map((x) => HL[x.h]).filter((v, i, a) => a.indexOf(v) === i).join('/'));
        if (m.hits.length > 1) props.push(m.hits.length + ' coups');
        if (m.eff === 'launch') props.push('projette en l\'air');
        if (m.eff === 'knock') props.push('renverse');
        if (m.eff === 'trip') props.push('fait chuter');
        if (m.armor) props.push('encaisse');
        if (m.spin) props.push('rattrape les pas de côté');
        if (k === 'T') props.push('passe la garde');
        if (k === 'S') props.push('1 barre · séquence filmée');
        if (k === 'HV' || k === 'VK') props.push('coup puissant · aussi en fin d’enchaînement');
        if (k === 'VK') props.push('lanceur : enchaînez en l’air');
        h += '<tr><td class="nm">' + esc(k === 'S' ? m.name + ' : ' + c.moves.S2.name : m.name) + '</td><td>' + notation(k, dev) + '</td><td class="pr">' + props.join(' · ') + '</td></tr>';
      }
      h += '<tr><td class="nm">Parade</td><td>' + I.glyph(dev, 'P') + '</td><td class="pr">au moment de l\'impact</td></tr>';
      h += '<tr><td class="nm">Éveil</td><td>' + I.glyph(dev, 'E') + '</td><td class="pr">1 barre · 8 s plus rapide et plus fort</td></tr>';
      h += '<tr><td class="nm">Ruée / Recul / Pas de côté</td><td>→→ / ←← / ↑↑ ↓↓</td><td class="pr">double appui</td></tr>';
      $('#mvt', el).innerHTML = h;
    };
    draw();
  };

  // ---------- HUD ----------
  const H = UI.hud = {
    els: null,
    init(m) {
      const q = (s) => document.querySelector(s);
      H.els = {
        root: q('#hud'), timer: q('#timer'), banner: q('#banner'), sub: q('#subbanner'), train: q('#train-info'),
        side: [0, 1].map((i) => {
          const c = '.p' + (i + 1);
          return {
            nm: q('.hb' + c + ' .nm'), pips: q('.hb' + c + ' .pips'), fill: q('.hb' + c + ' .hb-fill'), red: q('.hb' + c + ' .hb-red'), guard: q('.hb' + c + ' .hb-guard div'),
            segs: Array.from(document.querySelectorAll('.gauge' + c + ' .g-seg')), combo: q('.combo' + c), tag: q('.tag' + c),
            last: { hp: -1, gd: -1, gauge: -1, combo: -1, wins: -1 }, comboT: 0,
          };
        }),
      };
      m.f.forEach((f, i) => {
        const s = H.els.side[i];
        s.nm.textContent = f.char.name;
        s.last = { hp: -1, gd: -1, gauge: -1, combo: -1, wins: -1 };
        s.red.style.transition = 'none'; s.red.style.width = '100%'; void s.red.offsetWidth; s.red.style.transition = '';
        s.combo.classList.remove('show');
      });
      H.els.train.classList.toggle('hidden', !m.training);
      H.els.timer.classList.toggle('hidden', m.training);
      H.lastTimer = -1;
    },
    show(b) { document.querySelector('#hud').classList.toggle('hidden', !b); },
    update(m, dt) {
      const E = H.els;
      if (!E) return;
      const t = m.timeLimit > 0 ? Math.ceil(m.timer / 60) : '∞';
      if (t !== H.lastTimer) { H.lastTimer = t; E.timer.textContent = t; E.timer.classList.toggle('warn', t !== '∞' && t <= 10); }
      m.f.forEach((f, i) => {
        const s = E.side[i], L = s.last;
        if (f.hp !== L.hp) {
          const r = Math.max(0, f.hp / f.maxHp);
          s.fill.style.width = (r * 100).toFixed(1) + '%';
          if (f.hp > L.hp) { s.red.style.transition = 'none'; s.red.style.width = s.fill.style.width; void s.red.offsetWidth; s.red.style.transition = ''; }
          else s.red.style.width = s.fill.style.width;
          s.fill.classList.toggle('low', r < 0.25);
          L.hp = f.hp;
        }
        const gd = Math.round(f.guardHp);
        if (gd !== L.gd) { s.guard.style.width = gd + '%'; L.gd = gd; }
        const ga = Math.floor(f.gauge);
        if (ga !== L.gauge) {
          const a = Math.min(1, ga / 50), b = Math.max(0, (ga - 50) / 50);
          s.segs[i === 0 ? 0 : 1].querySelector('i').style.width = (a * 100) + '%';
          s.segs[i === 0 ? 1 : 0].querySelector('i').style.width = (b * 100) + '%';
          s.segs[i === 0 ? 0 : 1].classList.toggle('full', a >= 1);
          s.segs[i === 0 ? 1 : 0].classList.toggle('full', b >= 1);
          L.gauge = ga;
        }
        if (f.wins !== L.wins) {
          let p = '';
          for (let k = 0; k < m.roundsToWin; k++) p += '<i class="' + (k < f.wins ? 'on' : '') + '"></i>';
          s.pips.innerHTML = m.training ? '' : p; L.wins = f.wins;
        }
        // combo affiché du côté de l'attaquant
        const def = f.opp;
        if (def.comboHits >= 2) {
          if (def.comboHits !== L.combo) {
            s.combo.innerHTML = '<b>' + def.comboHits + '</b><small>COUPS · ' + def.comboDmg + ' DÉGÂTS</small>';
            s.combo.classList.add('show'); L.combo = def.comboHits;
          }
          s.comboT = 1.2;
        } else if (s.comboT > 0) { s.comboT -= dt; if (s.comboT <= 0) { s.combo.classList.remove('show'); L.combo = -1; } }
      });
      if (m.training) {
        const f = m.f[0], mv = f.move;
        const lm = H.trainMove || '—';
        E.train.innerHTML = 'Coup : <b>' + esc(lm) + '</b><br>Combo : ' + (H.trainCombo || 0) + ' coups · ' + (H.trainDmg || 0) + ' dégâts<br>Avantage : ' +
          (f.lastAdv == null ? '—' : (f.lastAdv > 0 ? '+' : '') + f.lastAdv + ' images') + '<br><small>Pause : réglages du mannequin</small>';
        void mv;
      }
    },
  };
  UI.banner = function (text, cls, dur) {
    const b = H.els ? H.els.banner : document.querySelector('#banner');
    b.className = ''; void b.offsetWidth;
    b.textContent = text;
    b.style.setProperty('--d', (dur || 1.4) + 's');
    b.className = 'show ' + (cls || '');
  };
  UI.sub = function (text) {
    const b = document.querySelector('#subbanner');
    b.className = ''; void b.offsetWidth; b.textContent = text; b.className = 'show';
  };
  UI.tag = function (side, text) {
    if (!H.els) return;
    const t = H.els.side[side].tag;
    t.className = 'tag p' + (side + 1); void t.offsetWidth; t.textContent = text; t.className = 'tag p' + (side + 1) + ' show';
  };
  let toastT = null;
  UI.toast = function (msg) {
    const t = document.querySelector('#toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2600);
  };
})(window);
