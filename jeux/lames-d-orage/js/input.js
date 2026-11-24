'use strict';
// LAMES D'ORAGE — entrées : clavier (2 joueurs possibles) + manettes (PS5/PS4, Xbox, génériques), vibrations, glyphes.
(function (root) {
  const G = root.G;
  const ACTIONS = ['H', 'V', 'K', 'G', 'P', 'C', 'T', 'S', 'E', 'start'];
  const ACTION_LABEL = {
    H: 'Taille horizontale', V: 'Taille verticale', K: 'Coup de pied', G: 'Garde', P: 'Parade', C: 'Accroupi (maintenir)',
    T: 'Saisie', S: 'Frappe de Tempête', E: 'Éveil', start: 'Pause',
  };
  // manette « standard » (Chrome/Edge/Firefox) : 0 bas, 1 droite, 2 gauche, 3 haut, 4 L1, 5 R1, 6 L2, 7 R2, 8 select, 9 start, 10 L3, 11 R3, 12-15 croix
  const PAD_DEFAULT = { H: [2], V: [3], K: [1], G: [0], P: [4], C: [5], T: [6], S: [7], E: [11], start: [9] };
  const KB_DEFAULT = {
    kb1: { up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'], H: ['KeyJ'], V: ['KeyI'], K: ['KeyL'], G: ['KeyK'], P: ['KeyU'], C: ['Space'], T: ['KeyO'], S: ['KeyH'], E: ['KeyY'], start: ['Escape'] },
    kb2: { up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'], H: ['Numpad4'], V: ['Numpad8'], K: ['Numpad6'], G: ['Numpad5'], P: ['Numpad7'], C: ['Numpad0'], T: ['Numpad9'], S: ['Numpad1'], E: ['Numpad3'], start: ['NumpadEnter'] },
  };
  const GAME_KEYS = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab']);

  const keys = new Set();
  const pads = [];          // état lu à chaque image
  let layoutMap = null;
  let bindings = load();
  let lastDevice = 'kb1';
  let rumbleOn = true;
  let anyInputCb = null;

  function load() {
    try {
      const s = JSON.parse(localStorage.getItem('lames.bindings') || 'null');
      if (s && s.v === 1) return s;
    } catch (e) { /* stockage indisponible */ }
    return { v: 1, kb1: clone(KB_DEFAULT.kb1), kb2: clone(KB_DEFAULT.kb2), pad: {} };
  }
  function save() { try { localStorage.setItem('lames.bindings', JSON.stringify(bindings)); } catch (e) { /* ignore */ } }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function init() {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) { if (GAME_KEYS.has(e.code)) e.preventDefault(); return; }
      keys.add(e.code);
      if (GAME_KEYS.has(e.code)) e.preventDefault();
      lastDevice = KB_DEFAULT.kb2.up.includes(e.code) || /^(Arrow|Numpad)/.test(e.code) ? 'kb2' : 'kb1';
      if (captureCb && captureDev.startsWith('kb')) { const cb = captureCb; captureCb = null; cb(e.code); e.preventDefault(); }
      if (anyInputCb) anyInputCb('key');
    }, { passive: false });
    window.addEventListener('keyup', (e) => { keys.delete(e.code); });
    window.addEventListener('blur', () => keys.clear());
    window.addEventListener('gamepadconnected', (e) => {
      const ns = e.gamepad.mapping !== 'standard';
      G.UI && G.UI.toast && G.UI.toast('Manette connectée : ' + shortName(e.gamepad.id) + (ns ? ' — non standard : vérifiez les touches dans « Commandes & coups »' : ''));
    });
    window.addEventListener('gamepaddisconnected', (e) => {
      G.UI && G.UI.toast && G.UI.toast('Manette déconnectée');
      // une manette qui joue se débranche : on met le combat en pause
      const g = G.Game, dev = 'pad' + e.gamepad.index;
      if (g && g.inFight && g.inFight() && g.slots && g.slots.some((s) => s && s.dev === dev)) g.pause();
    });
    try { if (navigator.keyboard && navigator.keyboard.getLayoutMap) navigator.keyboard.getLayoutMap().then((m) => { layoutMap = m; }).catch(() => {}); } catch (e) { /* ignore */ }
  }

  // ---------- manettes ----------
  function poll() {
    let list = [];
    try { list = navigator.getGamepads ? navigator.getGamepads() : []; } catch (e) { list = []; }
    for (let i = 0; i < 4; i++) {
      const gp = list[i];
      if (!gp || !gp.connected) { pads[i] = null; continue; }
      const st = pads[i] || (pads[i] = { id: '', kind: 'generic', b: new Array(20).fill(false), ax: [0, 0, 0, 0], gp: null, standard: true });
      st.id = gp.id; st.gp = gp; st.standard = gp.mapping === 'standard'; st.kind = padKind(gp.id);
      let any = false;
      for (let b = 0; b < 20; b++) {
        const btn = gp.buttons[b];
        const v = btn ? (btn.pressed || btn.value > 0.5) : false;
        if (v && !st.b[b]) any = true;
        st.b[b] = v;
      }
      for (let a = 0; a < 4; a++) st.ax[a] = gp.axes[a] || 0;
      // manettes non standard (DirectInput) : la croix est souvent un « chapeau » sur l'axe 9
      st.hat = !st.standard && gp.axes.length > 9 ? gp.axes[9] : 2;
      if (any) {
        lastDevice = 'pad' + i;
        if (anyInputCb) anyInputCb('pad');
        if (captureCb && captureDev === 'pad' + i) {
          for (let b = 0; b < 20; b++) if (st.b[b] && b < 12) { const cb = captureCb; captureCb = null; cb(b); break; }
        }
      }
    }
  }
  function padKind(id) {
    const s = (id || '').toLowerCase();
    // Xbox d'abord : son identifiant contient aussi « Wireless Controller »
    if (/xbox|xinput|045e|microsoft/.test(s)) return 'xbox';
    if (/dualsense|dualshock|playstation|054c|ps5|ps4/.test(s)) return 'ps';
    if (/nintendo|057e|pro controller|switch/.test(s)) return 'nin';
    return 'generic';
  }
  function shortName(id) {
    const k = padKind(id);
    return k === 'ps' ? 'PlayStation' : k === 'xbox' ? 'Xbox' : k === 'nin' ? 'Nintendo' : (id || 'manette').split('(')[0].trim().slice(0, 28);
  }
  function padBind(i) {
    const st = pads[i];
    const id = st ? st.id : '';
    return bindings.pad[id] || PAD_DEFAULT;
  }

  // ---------- lecture brute d'un appareil ----------
  // retourne {x:-1/0/1 (écran), y:+1 haut, b:{action:bool}}
  function raw(dev, out) {
    out = out || { x: 0, y: 0, b: {} };
    out.x = 0; out.y = 0;
    for (const a of ACTIONS) out.b[a] = false;
    if (!dev) return out;
    if (dev.startsWith('kb')) {
      const bd = bindings[dev];
      const has = (arr) => arr && arr.some((c) => keys.has(c));
      out.x = (has(bd.right) ? 1 : 0) - (has(bd.left) ? 1 : 0);
      out.y = (has(bd.up) ? 1 : 0) - (has(bd.down) ? 1 : 0);
      for (const a of ACTIONS) out.b[a] = has(bd[a]);
    } else {
      const i = +dev.slice(3), st = pads[i];
      if (!st) return out;
      const bd = padBind(i);
      const ax = st.ax[0], ay = st.ax[1];
      let x = Math.abs(ax) > 0.42 ? Math.sign(ax) : 0, y = Math.abs(ay) > 0.42 ? -Math.sign(ay) : 0;
      if (st.standard) {
        if (st.b[14]) x = -1; if (st.b[15]) x = 1; if (st.b[12]) y = 1; if (st.b[13]) y = -1;
      } else if (st.hat >= -1.05 && st.hat <= 1.05) {
        // chapeau : -1 haut, -0.43 droite, 0.14 bas, 0.71 gauche (pas de 2/7)
        const k = Math.round((st.hat + 1) * 3.5) % 8; // 0 haut … 2 droite … 4 bas … 6 gauche
        const HX = [0, 1, 1, 1, 0, -1, -1, -1], HY = [1, 1, 0, -1, -1, -1, 0, 1];
        x = HX[k]; y = HY[k];
      }
      out.x = x; out.y = y;
      for (const a of ACTIONS) out.b[a] = (bd[a] || []).some((b) => st.b[b]);
    }
    return out;
  }

  // ---------- conversion en ordres de jeu pour un joueur ----------
  class PlayerInput {
    constructor(dev) { this.dev = dev; this.prev = { x: 0, y: 0, b: {} }; this.cur = { x: 0, y: 0, b: {} }; this.t = 0; this.lastF = {}; this.press = {}; this.out = { held: { fwd: false, back: false, lat: 0, guard: false, crouch: false }, cmds: [] }; this.prevF = 0; this.prevL = 0; }
    // side : +1 si le combattant est à gauche de l'écran (droite = avancer)
    read(side) {
      const t = ++this.t;
      const p = this.prev; this.prev = this.cur; this.cur = p;
      raw(this.dev, this.cur);
      const c = this.cur, pr = this.prev, o = this.out, H = o.held;
      o.cmds.length = 0;
      const f = c.x * side, l = c.y;
      H.fwd = f > 0; H.back = f < 0; H.lat = l; H.guard = c.b.G; H.crouch = c.b.C;
      // doubles tapes : ruée, recul, pas de côté
      const tap = (key, now, before) => {
        if (now && !before) {
          const last = this.lastF[key];
          this.lastF[key] = t;
          if (last != null && t - last <= 13) { this.lastF[key] = -99; return true; }
        }
        return false;
      };
      if (tap('f', f > 0, this.prevF > 0)) o.cmds.push({ t: 'dash' });
      if (tap('b', f < 0, this.prevF < 0)) o.cmds.push({ t: 'bdash' });
      if (tap('u', l > 0, this.prevL > 0)) o.cmds.push({ t: 'side', d: 1 });
      if (tap('d', l < 0, this.prevL < 0)) o.cmds.push({ t: 'side', d: -1 });
      this.prevF = f; this.prevL = l;
      const pressed = (a) => c.b[a] && !pr.b[a];
      for (const a of ['H', 'V', 'K', 'G']) if (pressed(a)) this.press[a] = t;
      const near = (a) => this.press[a] != null && t - this.press[a] <= 2;
      // combinaisons
      const pair = (a, b) => (pressed(a) && near(b)) || (pressed(b) && near(a));
      const comboT = pair('H', 'G');                       // □+✕ : saisie
      const comboHV = !comboT && pair('H', 'V');           // □+△ : Brise-garde
      const comboVK = !comboHV && pair('V', 'K');          // △+○ : Élan ascendant (lanceur)
      // une paire émise consomme ses deux appuis (pas de double paire en roulé sur 3 boutons)
      if (comboT) { delete this.press.H; delete this.press.G; }
      if (comboHV) { delete this.press.H; delete this.press.V; }
      if (comboVK) { delete this.press.V; delete this.press.K; }
      if (comboT) o.cmds.push({ t: 'throw' });
      if (comboHV) o.cmds.push({ t: 'atk', b: 'HV' });
      if (comboVK) o.cmds.push({ t: 'atk', b: 'VK' });
      const used = comboT || comboHV || comboVK;
      if (!used && pressed('H')) o.cmds.push({ t: 'atk', b: 'H' });
      if (!used && pressed('V')) o.cmds.push({ t: 'atk', b: 'V' });
      if (!used && pressed('K')) o.cmds.push({ t: 'atk', b: 'K' });
      if (pressed('G')) o.cmds.push({ t: 'tech' });
      if (pressed('P')) o.cmds.push({ t: 'parry' });
      if (pressed('T')) o.cmds.push({ t: 'throw' });
      if (pressed('S')) o.cmds.push({ t: 'super' });
      if (pressed('E')) o.cmds.push({ t: 'eveil' });
      o.pause = pressed('start');
      return o;
    }
    reset() { raw(this.dev, this.prev); raw(this.dev, this.cur); this.lastF = {}; this.press = {}; }
  }

  // ---------- navigation des menus (tous appareils) ----------
  const menuPrev = {};
  const menuRep = {};
  function devices() {
    const list = ['kb1', 'kb2'];
    for (let i = 0; i < 4; i++) if (pads[i]) list.push('pad' + i);
    return list;
  }
  // retourne les fronts {up,down,left,right,ok,back,start,dev} d'un appareil (avec répétition)
  function menuEdges(dev, now) {
    const e = { up: false, down: false, left: false, right: false, ok: false, back: false, start: false, any: false, dev };
    const r = raw(dev, { x: 0, y: 0, b: {} });
    let ok = r.b.G, back = r.b.K, start = r.b.start;
    if (dev === 'kb1') {
      ok = ok || keys.has('Enter') || keys.has('Space');
      back = back || keys.has('Escape') || keys.has('Backspace');
      start = start || keys.has('Escape');
    } else if (dev === 'kb2') {
      ok = ok || keys.has('NumpadEnter');
      start = start || keys.has('NumpadEnter');
    } else {
      const st = pads[+dev.slice(3)];
      if (st && st.standard) { ok = ok || st.b[0]; back = back || st.b[1]; start = start || st.b[9]; }
    }
    const cur = { up: r.y > 0, down: r.y < 0, left: r.x < 0, right: r.x > 0, ok, back, start };
    const pv = menuPrev[dev] || {};
    const rp = menuRep[dev] || (menuRep[dev] = {});
    for (const k of ['up', 'down', 'left', 'right']) {
      if (cur[k] && !pv[k]) { e[k] = true; rp[k] = now + 380; }
      else if (cur[k] && rp[k] && now >= rp[k]) { e[k] = true; rp[k] = now + 95; }
    }
    for (const k of ['ok', 'back', 'start']) if (cur[k] && !pv[k]) e[k] = true;
    menuPrev[dev] = cur;
    e.any = e.up || e.down || e.left || e.right || e.ok || e.back || e.start;
    return e;
  }
  function menuAll(now) {
    const agg = { up: false, down: false, left: false, right: false, ok: false, back: false, start: false, any: false, dev: null };
    for (const d of devices()) {
      const e = menuEdges(d, now);
      if (e.any) {
        for (const k of ['up', 'down', 'left', 'right', 'ok', 'back', 'start']) agg[k] = agg[k] || e[k];
        agg.any = true; if (!agg.dev) agg.dev = d;
      }
    }
    return agg;
  }
  function syncMenu() { const now = performance.now(); for (const d of devices()) menuEdges(d, now); }

  // ---------- vibrations ----------
  function rumble(dev, strong, weak, ms) {
    if (!rumbleOn || !dev || !dev.startsWith('pad')) return;
    const st = pads[+dev.slice(3)];
    const gp = st && st.gp;
    if (!gp) return;
    try {
      if (gp.vibrationActuator && gp.vibrationActuator.playEffect) {
        gp.vibrationActuator.playEffect('dual-rumble', { startDelay: 0, duration: ms, weakMagnitude: Math.min(1, weak), strongMagnitude: Math.min(1, strong) }).catch(() => {});
      } else if (gp.hapticActuators && gp.hapticActuators[0]) gp.hapticActuators[0].pulse(Math.min(1, strong), ms);
    } catch (e) { /* non pris en charge */ }
  }

  // ---------- glyphes (affichage des boutons) ----------
  const PS = { 0: ['✕', 'ps-x'], 1: ['○', 'ps-o'], 2: ['□', 'ps-s'], 3: ['△', 'ps-t'], 4: ['L1'], 5: ['R1'], 6: ['L2'], 7: ['R2'], 8: ['CREATE'], 9: ['OPTIONS'], 10: ['L3'], 11: ['R3'], 12: ['↑'], 13: ['↓'], 14: ['←'], 15: ['→'] };
  const XB = { 0: ['A', 'xb-a'], 1: ['B', 'xb-b'], 2: ['X', 'xb-x'], 3: ['Y', 'xb-y'], 4: ['LB'], 5: ['RB'], 6: ['LT'], 7: ['RT'], 8: ['VUE'], 9: ['MENU'], 10: ['LS'], 11: ['RS'], 12: ['↑'], 13: ['↓'], 14: ['←'], 15: ['→'] };
  function devKind(dev) {
    if (!dev || dev.startsWith('kb')) return 'kb';
    const st = pads[+dev.slice(3)];
    return st ? st.kind : 'xbox';
  }
  function keyLabel(code) {
    if (!code) return '?';
    if (layoutMap && layoutMap.get(code)) { const k = layoutMap.get(code); return k === ' ' ? 'ESPACE' : k.toUpperCase(); }
    const map = { Space: 'ESPACE', Escape: 'ÉCHAP', Enter: 'ENTRÉE', ShiftLeft: 'MAJ', ShiftRight: 'MAJ D', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', NumpadEnter: 'ENTRÉE PN', Backspace: 'RETOUR' };
    if (map[code]) return map[code];
    if (code.startsWith('Key')) return code.slice(3);
    if (code.startsWith('Digit')) return code.slice(5);
    if (code.startsWith('Numpad')) return 'PN' + code.slice(6);
    return code;
  }
  function glyph(dev, action) {
    const kind = devKind(dev);
    if (kind === 'kb') {
      const bd = bindings[dev || 'kb1'] || bindings.kb1;
      const c = (bd[action] || [])[0];
      return '<span class="gl kb">' + keyLabel(c) + '</span>';
    }
    const i = +dev.slice(3);
    const b = (padBind(i)[action] || [])[0];
    const tab = kind === 'ps' ? PS : XB;
    const g = tab[b] || ['B' + b];
    return '<span class="gl ' + (g[1] || 'pad') + '">' + g[0] + '</span>';
  }
  function dirGlyph(dev, d) {
    const kind = devKind(dev);
    if (kind === 'kb') {
      const bd = bindings[dev || 'kb1'] || bindings.kb1;
      return '<span class="gl kb">' + keyLabel((bd[d] || [])[0]) + '</span>';
    }
    return '<span class="gl dir">' + ({ up: '↑', down: '↓', left: '←', right: '→' }[d]) + '</span>';
  }

  // ---------- reconfiguration ----------
  let captureCb = null, captureDev = '';
  function capture(dev, cb) { captureDev = dev; captureCb = cb; }
  function cancelCapture() { captureCb = null; }
  function setBinding(dev, action, value) {
    if (dev.startsWith('kb')) {
      // une touche ne sert qu'à une action (et à un seul des deux claviers)
      for (const k of ['kb1', 'kb2']) for (const a of Object.keys(bindings[k])) bindings[k][a] = bindings[k][a].filter((c) => c !== value);
      bindings[dev][action] = [value];
    }
    else {
      const st = pads[+dev.slice(3)];
      if (!st) return;
      const cur = clone(bindings.pad[st.id] || PAD_DEFAULT);
      for (const a of Object.keys(cur)) cur[a] = cur[a].filter((b) => b !== value);
      cur[action] = [value];
      bindings.pad[st.id] = cur;
    }
    save();
  }
  function resetBindings(dev) {
    if (dev.startsWith('kb')) bindings[dev] = clone(KB_DEFAULT[dev]);
    else { const st = pads[+dev.slice(3)]; if (st) delete bindings.pad[st.id]; }
    save();
  }
  function devName(dev) {
    if (!dev) return '—';
    if (dev === 'kb1') return 'Clavier (gauche)';
    if (dev === 'kb2') return 'Clavier (flèches)';
    const st = pads[+dev.slice(3)];
    return st ? 'Manette ' + shortName(st.id) : 'Manette';
  }

  G.Input = {
    init, poll, raw, PlayerInput, menuAll, menuEdges, syncMenu, devices, rumble, glyph, dirGlyph, devKind, devName, keyLabel,
    capture, cancelCapture, setBinding, resetBindings, ACTIONS, ACTION_LABEL,
    get lastDevice() { return lastDevice; },
    set rumbleOn(v) { rumbleOn = v; },
    onAny(cb) { anyInputCb = cb; },
    padCount() { return pads.filter(Boolean).length; },
    pads,
  };
})(window);
