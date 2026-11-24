'use strict';
// LAMES D'ORAGE — données : combattants, coups (données d'images à 60 i/s), arènes.
// Repère local : le combattant regarde vers +Z, sa droite est -X, sa gauche +X, Y vers le haut (mètres).
(function (root) {
  const G = root.G;

  // ---------- petites fabriques ----------
  const arc = (o) => Object.assign({ type: 'arc', tilt: 0, from: -100, to: 100, wind: -30, follow: 30, yaw: 0 }, o);
  const ln = (o) => Object.assign({ type: 'line', pull: 0.18 }, o);
  const hit = (s, a, dmg, h, k, seg) => ({ s, a, dmg, h, k, seg: seg || (k === 'k' ? 'K' : 'R') });
  const lead = (o) => Object.assign(o, { push: 0.025 }); // coup d'ouverture d'un multi-coups : ne repousse pas hors de portée
  const mv = (name, hits, r, o) => Object.assign({ name, hits, r }, o);
  // miroir gauche/droite d'un segment (pour la main gauche des lames jumelles)
  const mir = (sg) => {
    if (sg.type === 'arc') return Object.assign({}, sg, { tilt: 180 - (sg.tilt || 0), c: sg.c ? [-sg.c[0], sg.c[1], sg.c[2]] : null, left: true });
    return Object.assign({}, sg, {
      from: [-sg.from[0], sg.from[1], sg.from[2]], to: [-sg.to[0], sg.to[1], sg.to[2]], dir: [-sg.dir[0], sg.dir[1], sg.dir[2]], left: true,
    });
  };

  // ---------- jeu de coups commun (s'adapte à l'arme via W) ----------
  function baseSet(W) {
    const cx = W.cx, cy = W.cy, r = W.r;
    const C = (dy = 0, dz = 0.08, dx = 0) => [cx + dx, cy + dy, dz];
    return {
      H: mv('Taille vive', [hit(10, 3, 10, 'high', 'h')], 14, {
        advH: 6, advB: -2, push: 0.05, bpush: 0.06, track: 9, next: { H: 'HH' },
        arm: [arc({ tilt: 6, from: -118, to: 105, wind: -28, follow: 32, c: C(0.06) })], body: { step: 0.12, drop: 0.03 },
      }),
      HH: mv('Revers', [hit(9, 3, 12, 'mid', 'h')], 18, {
        advH: 4, advB: -6, push: 0.08, track: 8,
        arm: [arc({ tilt: -12, from: 108, to: -122, wind: 26, follow: -30, c: C(-0.1, 0.1) })], body: { step: 0.25, drop: 0.06 },
      }),
      '6H': mv('Fauche avancée', [hit(16, 4, 18, 'mid', 'h')], 20, {
        advH: 2, advB: -8, push: 0.16, bpush: 0.1, track: 14, lunge: [7, 18, 0.6],
        arm: [arc({ tilt: -5, from: -135, to: 118, wind: -22, follow: 35, c: C(-0.14, 0.14), r: r + 0.04 })], body: { step: 0.45, drop: 0.12, lean: 0.1 },
      }),
      '4H': mv('Tourbillon', [hit(20, 8, 24, 'high', 'h')], 22, {
        advH: 0, advB: -14, eff: 'knock', push: 0.24, bpush: 0.12, track: 20,
        arm: [arc({ tilt: 4, from: -92, to: -88, wind: -15, follow: 0, c: C(0.04, 0.02), r: r + 0.05 })], spin: { turns: 1, s: 16, e: 30 }, body: { step: 0.15, drop: 0.05 },
      }),
      '2H': mv('Fauche basse', [hit(16, 4, 14, 'low', 'h')], 22, {
        advH: 0, advB: -16, eff: 'trip', push: 0.05, track: 14, crouch: true,
        arm: [arc({ tilt: -26, from: -122, to: 112, wind: -20, follow: 25, c: [cx, 0.66, 0.16], r: r + 0.05 })], body: { step: 0.25, drop: 0.04 },
      }),
      V: mv('Taille verticale', [hit(14, 3, 15, 'mid', 'v')], 18, {
        advH: 4, advB: -4, push: 0.07, track: 3, next: { V: 'VV' },
        arm: [arc({ tilt: 90, from: 140, to: -55, wind: 15, follow: -20, c: C(0.05, 0.12) })], body: { step: 0.3, drop: 0.1 },
      }),
      VV: mv('Remontée', [hit(10, 3, 16, 'mid', 'v')], 22, {
        advH: 2, advB: -10, push: 0.14, track: 3,
        arm: [arc({ tilt: 90, from: -70, to: 120, wind: -15, follow: 20, c: C(0, 0.12) })], body: { step: 0.35, drop: 0.05 },
      }),
      '6V': mv('Fendoir', [hit(20, 4, 26, 'mid', 'v')], 22, {
        advH: 0, advB: -6, eff: 'knock', push: 0.14, bpush: 0.14, guard: 35, track: 4, lunge: [10, 22, 0.55],
        arm: [arc({ tilt: 90, from: 158, to: -65, wind: 22, follow: -15, c: C(0.1, 0.15), r: r + 0.05 })], body: { step: 0.5, drop: 0.2, lean: 0.15 },
      }),
      '4V': mv('Envol', [hit(18, 4, 18, 'mid', 'v')], 26, {
        advH: 0, advB: -14, eff: 'launch', lv: 0.17, push: 0.03, track: 4,
        arm: [arc({ tilt: 90, from: -110, to: 150, wind: -12, follow: 15, c: C(-0.1, 0.1) })], body: { step: 0.2, drop: -0.04, lean: -0.1 },
      }),
      '2V': mv('Estoc bas', [hit(14, 3, 12, 'mid', 't')], 18, {
        advH: 4, advB: -6, push: 0.08, track: 3, crouch: true,
        arm: [ln({ from: [cx, 0.92, 0.08], to: [cx + 0.03, 1.05, 0.62], dir: [0.02, 0.25, 1] })], body: { step: 0.3 },
      }),
      K: mv('Coup de pied haut', [hit(12, 3, 10, 'high', 'k')], 14, {
        advH: 4, advB: -2, push: 0.06, track: 8,
        kick: { leg: 'L', ch: [0.12, 0.78, 0.36], ext: [0.08, 1.38, 0.82] }, body: { lean: -0.25 },
      }),
      '6K': mv('Poussée', [hit(15, 3, 12, 'mid', 'k')], 18, {
        advH: 2, advB: 0, push: 0.22, bpush: 0.2, track: 8, lunge: [6, 16, 0.35],
        kick: { leg: 'R', ch: [-0.1, 0.72, 0.3], ext: [-0.05, 0.98, 0.86] }, body: { lean: -0.1 },
      }),
      '2K': mv('Balayette', [hit(11, 3, 8, 'low', 'k')], 16, {
        advH: 2, advB: -6, push: 0.05, track: 8, crouch: true,
        kick: { leg: 'L', ch: [0.12, 0.3, 0.3], ext: [0.1, 0.12, 0.82] },
      }),
      '8H': mv('Taille de course', [hit(16, 4, 16, 'mid', 'h')], 18, {
        advH: 2, advB: -6, push: 0.1, track: 16,
        arm: [arc({ tilt: -8, from: -128, to: 112, wind: -20, follow: 30, c: C(-0.1, 0.1) })], body: { step: 0.3, drop: 0.1 },
      }),
      '8V': mv('Verticale de course', [hit(16, 4, 20, 'mid', 'v')], 20, {
        advH: 0, advB: -8, eff: 'knock', push: 0.12, track: 5,
        arm: [arc({ tilt: 82, from: 148, to: -60, wind: 20, follow: -15, c: C(0.05, 0.12) })], body: { step: 0.4, drop: 0.15 },
      }),
      '66H': mv('Charge tranchante', [hit(16, 4, 18, 'mid', 'h')], 20, {
        advH: 0, advB: -10, eff: 'knock', push: 0.16, track: 14, lunge: [3, 17, 1.0],
        arm: [arc({ tilt: -5, from: -135, to: 118, wind: -22, follow: 35, c: C(-0.12, 0.14), r: r + 0.04 })], body: { step: 0.5, drop: 0.12, lean: 0.15 },
      }),
      '66V': mv('Estoc chargé', [hit(16, 4, 20, 'mid', 't')], 22, {
        advH: 0, advB: -10, push: 0.2, track: 6, lunge: [3, 18, 1.4],
        arm: [ln({ from: [cx, 1.2, 0.0], to: [cx + 0.05, 1.26, 0.7], dir: [0.03, 0.04, 1], pull: 0.22 })], body: { step: 0.6, drop: 0.15, lean: 0.2 },
      }),
      // coups puissants à deux boutons (aussi en fin d'enchaînement)
      HV: mv('Brise-garde', [hit(16, 5, 28, 'mid', 'v')], 24, {
        advH: 0, advB: -4, eff: 'knock', push: 0.18, bpush: 0.16, guard: 60, track: 10, lunge: [8, 22, 0.6],
        arm: [arc({ tilt: 50, from: 150, to: -80, wind: 30, follow: -20, c: C(0.12, 0.14), r: r + 0.06 })], body: { step: 0.55, drop: 0.22, lean: 0.22 },
      }),
      VK: mv('Élan ascendant', [hit(13, 4, 16, 'mid', 'v')], 24, {
        advH: 0, advB: -12, eff: 'launch', lv: 0.19, push: 0.04, track: 6, lunge: [4, 14, 0.4], next: { H: 'H', V: 'V', K: 'K' }, // lanceur : enchaîner en l'air
        arm: [arc({ tilt: 80, from: -120, to: 155, wind: -15, follow: 15, c: C(-0.12, 0.12) })], body: { step: 0.35, drop: -0.06, lean: -0.12 },
      }),
      T: mv('Saisie', [hit(10, 3, 0, 'high', 'throw')], 26, { track: 6, grab: true, noParry: true }),
      // Frappe de Tempête : élan (la séquence filmée S2 est propre à chaque combattant)
      S: mv('Frappe de Tempête', [hit(12, 8, 0, 'mid', 'h')], 34, {
        advH: 0, advB: -16, push: 0.1, track: 12, lunge: [2, 18, 3.0], noParry: true, superStart: true,
        arm: [ln({ from: [cx, 1.2, -0.05], to: [cx + 0.03, 1.24, 0.66], dir: [0.03, 0.05, 1], pull: 0.25 })], body: { step: 0.6, drop: 0.18, lean: 0.3 },
      }),
    };
  }

  // ---------- combattants ----------
  function makeKael() {
    const W = { kind: 'sword', L: 1.05, hitFrom: 0.15, hitR: 0.07, r: 0.45, cx: -0.06, cy: 1.3, spd: 1, dmg: 1, push: 1, twoHand: true, offGrip: -0.14, weight: 0.55 };
    const M = baseSet(W), r = W.r, cx = W.cx, cy = W.cy;
    M.HH.next = { H: 'HHH' };
    M.HHH = mv('Lame tournoyante', [hit(14, 6, 18, 'mid', 'h')], 24, {
      advH: 0, advB: -12, eff: 'knock', push: 0.2, track: 12,
      arm: [arc({ tilt: 4, from: -94, to: -90, wind: -10, follow: 0, c: [cx, cy, 0.05], r: r + 0.03 })], spin: { turns: 1, s: 11, e: 23 }, body: { step: 0.2, drop: 0.1 },
    });
    M.S2 = mv('Tempête d’acier', [hit(10, 4, 8, 'mid', 'h'), hit(24, 4, 8, 'mid', 'h'), hit(38, 4, 8, 'mid', 'v'), hit(52, 4, 9, 'mid', 'h'), hit(72, 6, 25, 'mid', 'v')], 26, {
      eff: 'knock', push: 0.24, lv: 0.14,
      arm: [
        arc({ tilt: 5, from: -125, to: 112, wind: -20, follow: 20 }),
        arc({ tilt: -15, from: 112, to: -125, wind: 20, follow: -20 }),
        arc({ tilt: 90, from: 150, to: -60, wind: 15, follow: -10 }),
        arc({ tilt: 40, from: -112, to: 112, wind: -15, follow: 15 }),
        arc({ tilt: 90, from: 168, to: -72, wind: 25, follow: -12, r: r + 0.06 }),
      ], body: { step: 0.4, drop: 0.15, lean: 0.1 },
    });
    return {
      id: 'kael', name: 'KAËL', title: 'La Lame Errante', weapon: 'Épée longue',
      desc: 'Épéiste vagabond, équilibré et précis. Le meilleur choix pour débuter.',
      stats: { power: 3, speed: 3, reach: 3 }, W, moves: M,
      walk: 0.045, side: 0.042, dash: 0.13, weight: 1, scale: 1,
      look: { skin: 0xe2b48c, hair: 0x2b1a10, main: 0x9b1d1d, second: 0x2a2c35, metal: 0xc9ced8, accent: 0xd6a640, leather: 0x5a3a22, trail: 0xff6a3a, hairStyle: 'spiky', scarf: 0xb81f1f, extras: ['scarf', 'pauldronR', 'skirt'] },
      alt: { main: 0x1d4f9b, scarf: 0x1f6ab8, trail: 0x4ab0ff },
    };
  }

  function makeYsra() {
    const W = { kind: 'spear', L: 2.05, hitFrom: 0.35, hitR: 0.07, r: 0.32, cx: -0.12, cy: 1.22, spd: 1.04, dmg: 1, push: 1.05, twoHand: true, offGrip: 0.4, weight: 0.45 };
    const M = baseSet(W), cx = W.cx;
    M.H.hits[0].s = 11;
    M.V = mv('Estoc', [hit(12, 3, 12, 'mid', 't')], 16, {
      advH: 4, advB: -4, push: 0.08, track: 3, next: { V: 'VV' },
      arm: [ln({ from: [cx, 1.18, -0.1], to: [cx + 0.02, 1.22, 0.42], dir: [0, 0.02, 1], pull: 0.16 })], body: { step: 0.25 },
    });
    M.VV = mv('Double estoc', [hit(9, 3, 12, 'mid', 't')], 18, {
      advH: 3, advB: -6, push: 0.09, track: 3, next: { V: 'VVV' },
      arm: [ln({ from: [cx, 1.16, -0.08], to: [cx + 0.02, 1.2, 0.46], dir: [0, 0.0, 1], pull: 0.16 })], body: { step: 0.3 },
    });
    M.VVV = mv('Percée du nord', [hit(14, 4, 18, 'mid', 't')], 22, {
      advH: 0, advB: -10, eff: 'knock', push: 0.2, track: 4, lunge: [4, 16, 0.6],
      arm: [ln({ from: [cx, 1.2, -0.12], to: [cx + 0.03, 1.24, 0.55], dir: [0, 0.03, 1], pull: 0.2 })], body: { step: 0.55, drop: 0.1, lean: 0.2 },
    });
    M['2V'] = mv('Estoc rasant', [hit(14, 3, 12, 'low', 't')], 20, {
      advH: 2, advB: -10, push: 0.06, track: 3, crouch: true,
      arm: [ln({ from: [cx, 0.66, -0.05], to: [cx, 0.52, 0.5], dir: [0, -0.2, 1], pull: 0.14 })], body: { step: 0.3 },
    });
    M['66V'].lunge = [3, 18, 1.9]; M['66V'].hits[0].dmg = 22; M['66V'].name = 'Lance du blizzard';
    M.S2 = mv('Avalanche de givre', [hit(10, 3, 5, 'mid', 't'), hit(17, 3, 5, 'mid', 't'), hit(24, 3, 5, 'mid', 't'), hit(31, 3, 5, 'mid', 't'), hit(38, 3, 6, 'mid', 't'), hit(62, 6, 26, 'mid', 'h')], 26, {
      eff: 'knock', push: 0.26, lv: 0.12,
      arm: [
        ln({ from: [cx, 1.18, -0.1], to: [cx + 0.02, 1.25, 0.45], dir: [0.02, 0.06, 1], pull: 0.12 }),
        ln({ from: [cx, 1.1, -0.1], to: [cx - 0.02, 1.12, 0.45], dir: [-0.04, -0.02, 1], pull: 0.12 }),
        ln({ from: [cx, 1.25, -0.1], to: [cx + 0.03, 1.3, 0.45], dir: [0.05, 0.08, 1], pull: 0.12 }),
        ln({ from: [cx, 1.05, -0.1], to: [cx, 1.08, 0.45], dir: [-0.02, -0.05, 1], pull: 0.12 }),
        ln({ from: [cx, 1.18, -0.12], to: [cx + 0.02, 1.2, 0.5], dir: [0, 0.02, 1], pull: 0.15 }),
        arc({ tilt: 10, from: -140, to: 125, wind: -25, follow: 30 }),
      ], body: { step: 0.45, drop: 0.12, lean: 0.12 },
    });
    return {
      id: 'ysra', name: 'YSRA', title: 'La Lance du Nord', weapon: 'Lance',
      desc: 'Guerrière des glaces à l’allonge redoutable. Elle tient l’adversaire à distance.',
      stats: { power: 2, speed: 3, reach: 5 }, W, moves: M,
      walk: 0.044, side: 0.041, dash: 0.125, weight: 0.95, scale: 0.98,
      look: { skin: 0xf0cfb0, hair: 0xe6ebf4, main: 0x1f8a8a, second: 0xdfe6ec, metal: 0xd4dde6, accent: 0x7fd0e8, leather: 0x3d4a55, trail: 0x7ff0ff, hairStyle: 'ponytail', extras: ['ponytail', 'pauldrons', 'tassets', 'chestplate'] },
      alt: { main: 0x8a1f6a, accent: 0xe87fc0, trail: 0xff7fe0 },
    };
  }

  // champion = true : la version d'origine, volontairement trop forte (« Brann le Champion »)
  function makeBrann(champion) {
    const W = champion
      ? { kind: 'axe', L: 1.18, hitFrom: 0.12, hitR: 0.13, r: 0.42, cx: -0.06, cy: 1.32, spd: 1.14, dmg: 1.32, push: 1.15, twoHand: true, offGrip: -0.3, weight: 1 }
      : { kind: 'axe', L: 1.08, hitFrom: 0.12, hitR: 0.12, r: 0.42, cx: -0.06, cy: 1.32, spd: 1.16, dmg: 1.2, push: 1.08, twoHand: true, offGrip: -0.3, weight: 1 };
    const M = baseSet(W), cx = W.cx;
    M['6V'].guard = 50; M['6V'].name = 'Brise-roc'; M['6V'].quake = true;
    M['6V'].armor = champion ? [5, 19] : [8, 17];
    M['4H'].name = 'Ouragan de fer';
    if (champion) M['4H'].armor = [6, 19];
    M['2V'] = mv('Taille montante', [hit(15, 4, 13, 'mid', 'v')], 20, {
      advH: 2, advB: -8, push: 0.1, track: 3, crouch: true,
      arm: [arc({ tilt: 70, from: -100, to: 60, wind: -15, follow: 20, c: [cx, 0.8, 0.15] })], body: { step: 0.3 },
    });
    M['66V'] = mv('Charge du bélier', [hit(17, 4, 24, 'mid', 'v')], 22, {
      advH: 0, advB: -10, eff: 'knock', push: 0.18, track: 5, lunge: [3, 18, 1.2],
      arm: [arc({ tilt: 90, from: 160, to: -60, wind: 20, follow: -15, c: [cx, W.cy + 0.08, 0.15] })], body: { step: 0.6, drop: 0.2, lean: 0.2 },
    });
    M.S2 = mv('Colère du volcan', [hit(12, 5, 10, 'mid', 'h'), hit(32, 5, 10, 'mid', 'h'), hit(52, 5, 12, 'mid', 'v'), hit(76, 7, 30, 'mid', 'v')], 28, {
      eff: 'knock', push: 0.3, lv: 0.15, quake: true,
      arm: [
        arc({ tilt: 0, from: -135, to: 115, wind: -25, follow: 25 }),
        arc({ tilt: -10, from: 115, to: -135, wind: 25, follow: -25 }),
        arc({ tilt: 60, from: -120, to: 120, wind: -15, follow: 20 }),
        arc({ tilt: 90, from: 170, to: -70, wind: 25, follow: -10, r: W.r + 0.06 }),
      ], body: { step: 0.45, drop: 0.2, lean: 0.15 },
    });
    if (!champion) {
      // une hache lourde se rattrape mal : chaque coup paré laisse 1 image de plus à l'adversaire
      for (const k of Object.keys(M)) if (!['T', 'S', 'S2'].includes(k)) M[k].advB = (M[k].advB != null ? M[k].advB : -6) - 1;
    }
    if (champion) return {
      id: 'brann_ch', vis: 'brann', name: 'BRANN ★', title: 'Le Champion', weapon: 'Hache de guerre',
      desc: 'Brann au sommet de sa force : frappe très fort, de loin, et encaisse deux coups. Volontairement trop fort, pour les défis.',
      stats: { power: 5, speed: 2, reach: 4 }, W, moves: M, card: 0xd9a836,
      walk: 0.036, side: 0.034, dash: 0.11, weight: 1.3, scale: 1.12,
      look: { skin: 0xc98d64, hair: 0x2a1a12, main: 0x2a2226, second: 0x161214, metal: 0xd9a836, accent: 0xf2d46b, leather: 0x2a1c14, fur: 0x3a3030, trail: 0xffd040, hairStyle: 'helmet', extras: ['fur', 'beard', 'belt', 'bracers'] },
      alt: { main: 0x5a1a1a, fur: 0x4a3a3a, metal: 0xc0c6cc, trail: 0xff4030 },
    };
    return {
      id: 'brann', name: 'BRANN', title: 'Le Briseur', weapon: 'Hache de guerre',
      desc: 'Colosse des montagnes. Lent et puissant ; le Brise-roc encaisse sans broncher, mais ses coups parés se paient cher.',
      stats: { power: 4, speed: 1, reach: 3 }, W, moves: M,
      walk: 0.036, side: 0.034, dash: 0.11, weight: 1.3, scale: 1.12,
      look: { skin: 0xc98d64, hair: 0x8a4b22, main: 0x7a5230, second: 0x3b2a1e, metal: 0xb58f52, accent: 0xd9c27a, leather: 0x4a3020, fur: 0x6b4a2e, trail: 0xffb030, hairStyle: 'helmet', extras: ['fur', 'beard', 'belt', 'bracers'] },
      alt: { main: 0x3a4a5a, fur: 0x5a5a5e, metal: 0x9aa4ad, trail: 0xff4030 },
    };
  }

  function makeVesper() {
    const W = { kind: 'twin', L: 0.5, hitFrom: 0.06, hitR: 0.07, r: 0.44, cx: -0.13, cy: 1.26, spd: 0.86, dmg: 0.8, push: 0.85, twoHand: false, twin: true, weight: 0.25 };
    const M = baseSet(W), cx = W.cx, cy = W.cy, r = W.r;
    const aH = arc({ tilt: 6, from: -115, to: 100, wind: -28, follow: 30, c: [cx, cy + 0.06, 0.1] });
    M.H = mv('Double entaille', [hit(8, 3, 7, 'high', 'h', 'R'), hit(14, 3, 7, 'high', 'h', 'L')], 12, {
      advH: 6, advB: -2, push: 0.04, track: 10, next: { H: 'HH' }, arm: [aH], arm2: [mir(aH)], body: { step: 0.15 },
    });
    const aHH = arc({ tilt: -12, from: 108, to: -118, wind: 24, follow: -28, c: [cx, cy - 0.08, 0.12] });
    M.HH = mv('Revers croisés', [hit(8, 3, 7, 'mid', 'h', 'R'), hit(13, 3, 7, 'mid', 'h', 'L')], 14, {
      advH: 4, advB: -6, push: 0.06, track: 8, next: { H: 'HHH' }, arm: [aHH], arm2: [mir(aHH)], body: { step: 0.25 },
    });
    const aSpin = arc({ tilt: 4, from: -92, to: -88, wind: -10, follow: 0, c: [cx, cy, 0.04], r: r + 0.04 });
    M.HHH = mv('Valse des lames', [lead(hit(10, 4, 8, 'mid', 'h', 'R')), hit(13, 4, 9, 'mid', 'h', 'L')], 20, {
      advH: 0, advB: -12, eff: 'knock', push: 0.18, track: 10, arm: [aSpin], arm2: [mir(aSpin)], spin: { turns: 1.5, s: 8, e: 22 }, body: { step: 0.2 },
    });
    const aV = arc({ tilt: 90, from: 140, to: -55, wind: 15, follow: -20, c: [cx, cy + 0.05, 0.12] });
    M.V = mv('Croc', [hit(10, 3, 9, 'mid', 'v', 'R')], 14, { advH: 4, advB: -4, push: 0.06, track: 3, next: { V: 'VV' }, arm: [aV], body: { step: 0.25, drop: 0.08 } });
    M.VV = mv('Second croc', [hit(8, 3, 9, 'mid', 'v', 'L')], 14, { advH: 4, advB: -4, push: 0.06, track: 3, next: { V: 'VVV' }, arm2: [mir(aV)], body: { step: 0.25, drop: 0.08 } });
    const aT = ln({ from: [cx, 1.2, -0.05], to: [cx + 0.04, 1.24, 0.56], dir: [0.06, 0.05, 1], pull: 0.18 });
    M.VVV = mv('Double perforation', [hit(12, 3, 8, 'mid', 't', 'R'), hit(13, 3, 8, 'mid', 't', 'L')], 20, {
      advH: 0, advB: -10, eff: 'knock', push: 0.16, track: 3, lunge: [4, 14, 0.5], arm: [aT], arm2: [mir(aT)], body: { step: 0.5, drop: 0.1, lean: 0.2 },
    });
    const aX = arc({ tilt: -40, from: -112, to: 85, wind: -20, follow: 25, c: [cx, cy, 0.12] });
    M['6H'] = mv('Croix d’ombre', [hit(14, 4, 9, 'mid', 'h', 'R'), hit(15, 4, 9, 'mid', 'h', 'L')], 18, {
      advH: 2, advB: -8, push: 0.14, track: 12, lunge: [4, 14, 0.8], arm: [aX], arm2: [mir(aX)], body: { step: 0.45, drop: 0.1, lean: 0.15 },
    });
    M['4H'] = mv('Cyclone noir', [lead(hit(14, 5, 8, 'high', 'h', 'R')), hit(16, 5, 9, 'high', 'h', 'L')], 20, {
      advH: 0, advB: -14, eff: 'knock', push: 0.2, track: 16, arm: [aSpin], arm2: [mir(aSpin)], spin: { turns: 2, s: 11, e: 27 }, body: { step: 0.15 },
    });
    const aUp = arc({ tilt: 90, from: -110, to: 150, wind: -12, follow: 15, c: [cx, cy - 0.1, 0.1] });
    M['4V'] = mv('Envol jumeau', [hit(14, 4, 8, 'mid', 'v', 'R'), hit(15, 4, 9, 'mid', 'v', 'L')], 22, {
      advH: 0, advB: -14, eff: 'launch', lv: 0.17, push: 0.03, track: 4, arm: [aUp], arm2: [mir(aUp)], body: { step: 0.2, lean: -0.1 },
    });
    const aDash = arc({ tilt: -5, from: -130, to: 110, wind: -20, follow: 30, c: [cx, cy - 0.1, 0.14] });
    M['66H'] = mv('Ombre filante', [lead(hit(10, 3, 6, 'mid', 'h', 'R')), lead(hit(14, 3, 6, 'mid', 'h', 'L')), hit(19, 3, 8, 'mid', 'h', 'R')], 18, {
      advH: 0, advB: -10, eff: 'knock', push: 0.16, track: 14, lunge: [2, 18, 2.0],
      arm: [aDash, arc({ tilt: 10, from: -125, to: 115, wind: -10, follow: 30, c: [cx, cy, 0.14] })], arm2: [mir(aDash)], body: { step: 0.5, drop: 0.12, lean: 0.2 },
    });
    M['66V'] = mv('Dard double', [hit(14, 4, 9, 'mid', 't', 'R'), hit(15, 4, 9, 'mid', 't', 'L')], 20, {
      advH: 0, advB: -10, push: 0.18, track: 6, lunge: [3, 16, 1.5], arm: [aT], arm2: [mir(aT)], body: { step: 0.6, drop: 0.15, lean: 0.25 },
    });
    M.K.hits[0].s = 10;
    M.S2 = mv('Danse des ombres', [
      hit(8, 3, 5, 'mid', 'h', 'R'), hit(14, 3, 5, 'mid', 'h', 'L'), hit(20, 3, 5, 'mid', 'h', 'R'), hit(26, 3, 5, 'mid', 'h', 'L'),
      hit(32, 3, 5, 'mid', 'v', 'R'), hit(38, 3, 5, 'mid', 'v', 'L'), hit(62, 5, 22, 'mid', 't', 'R')], 24, {
      eff: 'knock', push: 0.24, lv: 0.13,
      arm: [aH, arc({ tilt: -12, from: 108, to: -118, wind: 20, follow: -20 }), aV, aT],
      arm2: [mir(aH), mir(arc({ tilt: -12, from: 108, to: -118, wind: 20, follow: -20 })), mir(aV)],
      body: { step: 0.4, drop: 0.12, lean: 0.12 },
    });
    // la séquence des bras doit suivre l'ordre des coups R / L
    return {
      id: 'vesper', name: 'VESPER', title: 'L’Ombre Jumelle', weapon: 'Lames jumelles',
      desc: 'Assassin insaisissable. Très rapide, enchaîne les coups multiples mais frappe de près.',
      stats: { power: 2, speed: 5, reach: 1 }, W, moves: M,
      walk: 0.052, side: 0.05, dash: 0.15, weight: 0.9, scale: 0.97,
      look: { skin: 0xd9a882, hair: 0x15121c, main: 0x4b2a6e, second: 0x18151f, metal: 0xb7b9cf, accent: 0xa76cff, leather: 0x241c2e, trail: 0xb07bff, hairStyle: 'hood', scarf: 0x6a3a9a, extras: ['scarf2', 'mask', 'sash', 'wraps'] },
      alt: { main: 0x6e2a2a, scarf: 0x9a3a3a, accent: 0xff6a5a, trail: 0xff5a6a },
    };
  }

  // ---------- finalisation : échelles de temps, valeurs dérivées ----------
  function nrm(a) { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
  function prepSeg(sg, W, left) {
    if (sg.type === 'arc') {
      if (!sg.c) sg.c = [left ? -W.cx : W.cx, W.cy, 0.08];
      if (!sg.r) sg.r = W.r;
      sg.pw = sg.from + sg.wind; sg.ps = sg.from; sg.pe = sg.to; sg.pf = sg.to + sg.follow;
    } else {
      sg.d = nrm(sg.dir);
      const len = Math.hypot(sg.to[0] - sg.from[0], sg.to[1] - sg.from[1], sg.to[2] - sg.from[2]) || 0.01;
      sg.pw = -(sg.pull || 0.15) / len; sg.ps = 0; sg.pe = 1; sg.pf = 1 + 0.05 / len;
    }
  }

  function finalize(ch) {
    const W = ch.W;
    for (const key of Object.keys(ch.moves)) {
      const m = ch.moves[key];
      m.key = key;
      // les segments peuvent être partagés entre coups : on les clone avant d'y écrire les temps
      m.hits = m.hits.map((h) => Object.assign({}, h));
      if (m.arm) m.arm = m.arm.map((sg) => Object.assign({}, sg));
      if (m.arm2) m.arm2 = m.arm2.map((sg) => Object.assign({}, sg));
      if (m.kick) m.kick = Object.assign({}, m.kick);
      const sp =(key === 'S' || key === 'S2' || key === 'T') ? 1 : W.spd;
      const dm = (key === 'S2') ? Math.sqrt(W.dmg) : W.dmg;
      for (const h of m.hits) { h.s = Math.round(h.s * sp); h.dmg = Math.round(h.dmg * dm); }
      m.r = Math.round(m.r * sp);
      if (m.armor) m.armor = m.armor.map((v) => Math.round(v * sp));
      if (m.lunge) m.lunge = [Math.round(m.lunge[0] * sp), Math.round(m.lunge[1] * sp), m.lunge[2]];
      // sorts (projectiles) : moment de lancement, dégâts, et « coup » équivalent utilisé à l'impact
      if (m.proj) m.proj = m.proj.map((P) => {
        const q = Object.assign({ speed: 0.12, dmg: 14, h: 'mid', r: 0.16, life: 70, y: 1.2, stun: 16, bstun: 6, push: 0.08, kind: 'orb' }, P);
        q.at = Math.round(q.at * sp); q.dmg = Math.round(q.dmg * W.dmg);
        q.mv = {
          name: m.name, key: key + '*', proj: true, hits: [{ s: 0, a: 1, dmg: q.dmg, h: q.h, k: 'p', seg: 'R' }],
          total: 0, first: 0, lastEnd: 1, push: q.push, bpush: q.push * 0.7, advH: q.stun, advB: q.bstun,
          eff: q.eff || null, lv: q.lv, guard: q.dmg * 1.2, k0: 'p', h0: q.h, dmgTotal: q.dmg,
        };
        return q;
      });
      if (m.spin) m.spin = { turns: m.spin.turns, s: Math.round(m.spin.s * sp), e: Math.round(m.spin.e * sp) };
      m.track = Math.round((m.track || 0) * sp);
      m.push = (m.push != null ? m.push : 0.06) * W.push;
      m.bpush = (m.bpush != null ? m.bpush : 0.07) * W.push;
      if (m.advH == null) m.advH = 4;
      if (m.advB == null) m.advB = -6;
      // tout coup simple ou d'enchaînement peut finir par un coup puissant
      if (['H', 'HH', 'HHH', 'V', 'VV', 'VVV', 'K'].includes(key)) m.next = Object.assign({}, m.next || {}, { HV: 'HV', VK: 'VK' });
      if (W.twin && (key === 'HV' || key === 'VK') && m.arm && !m.arm2) m.arm2 = [mir(m.arm[0])];
      const last = m.hits[m.hits.length - 1];
      m.first = m.hits[0].s; m.lastEnd = last.s + last.a; m.total = m.lastEnd + m.r;
      m.k0 = m.hits[0].k; m.h0 = m.hits[0].h;
      m.dmgTotal = m.hits.reduce((s, h) => s + h.dmg, 0);
      if (m.next) { m.nextAt = m.lastEnd + 2; m.nextWin = [Math.max(1, m.first - 6), m.total - 2]; }
      const rh = m.hits.filter((h) => h.seg === 'R'), lh = m.hits.filter((h) => h.seg === 'L');
      if (m.arm) m.arm.forEach((sg, i) => {
        prepSeg(sg, W, false);
        if (sg.s == null) { const h = rh[i] || m.hits[Math.min(i, m.hits.length - 1)]; sg.s = h.s; sg.a = h.a; }
      });
      if (m.arm2) m.arm2.forEach((sg, i) => {
        prepSeg(sg, W, true);
        if (sg.s == null) { const h = lh[i] || m.hits[Math.min(i, m.hits.length - 1)]; sg.s = h.s; sg.a = h.a; }
      });
    }
    ch.moves.S2.auto = true;
    return ch;
  }

  // ---------- NYRA : mage du givre (bâton) ----------
  function makeNyra() {
    const W = { kind: 'staff', L: 1.5, hitFrom: 0.3, hitR: 0.07, r: 0.42, cx: -0.1, cy: 1.26, spd: 1.04, dmg: 0.85, push: 0.95, twoHand: true, offGrip: 0.32, weight: 0.4 };
    const M = baseSet(W), cx = W.cx, r = W.r;
    const cast = (f) => [hit(f, 1, 0, 'mid', 'cast')];
    const aCast = ln({ from: [cx, 1.15, -0.1], to: [cx + 0.02, 1.32, 0.5], dir: [0.02, 0.55, 1], pull: 0.2 });
    M['4V'] = mv('Orbe de givre', cast(15), 20, {
      advB: -8, track: 4, arm: [aCast], body: { step: 0.2, lean: 0.1 },
      proj: [{ at: 15, speed: 0.12, dmg: 16, h: 'mid', r: 0.18, life: 70, y: 1.15, stun: 18, bstun: 6, push: 0.1, kind: 'orb' }],
    });
    M['2V'] = mv('Ronce de glace', cast(17), 22, {
      advB: -10, track: 4, crouch: true, arm: [ln({ from: [cx, 1.0, 0.0], to: [cx + 0.03, 0.45, 0.55], dir: [0.02, -0.4, 1], pull: 0.15 })], body: { step: 0.15, drop: 0.12 },
      proj: [{ at: 17, speed: 0.1, dmg: 14, h: 'low', r: 0.2, life: 55, y: 0.22, eff: 'trip', push: 0.05, kind: 'spike' }],
    });
    M['66V'] = mv('Lance de givre', cast(12), 18, {
      advB: -8, track: 4, arm: [ln({ from: [cx, 1.3, -0.1], to: [cx + 0.02, 1.42, 0.62], dir: [0.02, 0.1, 1], pull: 0.25 })], body: { step: 0.35, lean: 0.18 },
      proj: [{ at: 12, speed: 0.22, dmg: 12, h: 'high', r: 0.12, life: 42, y: 1.45, stun: 12, kind: 'lance' }],
    });
    M.S2 = mv('Tempête de givre', [hit(10, 4, 8, 'mid', 'h'), hit(24, 4, 8, 'mid', 'v'), hit(38, 4, 9, 'mid', 'h'), hit(64, 6, 26, 'mid', 'v')], 26, {
      eff: 'knock', push: 0.24, lv: 0.15,
      arm: [arc({ tilt: 5, from: -125, to: 112, wind: -20, follow: 20 }), arc({ tilt: 90, from: 150, to: -60, wind: 15, follow: -10 }),
        arc({ tilt: -15, from: 112, to: -125, wind: 20, follow: -20 }), arc({ tilt: 90, from: 168, to: -72, wind: 25, follow: -12, r: r + 0.06 })],
      body: { step: 0.3, drop: 0.12, lean: 0.1 },
    });
    return {
      id: 'nyra', name: 'NYRA', title: 'L’Arcaniste du Givre', weapon: 'Bâton de cristal', family: 'Mage',
      desc: 'Mage. Tient l’adversaire à distance avec ses sorts (← △, ↓ △, →→ △) mais souffre au corps à corps.',
      stats: { power: 3, speed: 3, reach: 5 }, W, moves: M,
      walk: 0.043, side: 0.044, dash: 0.125, weight: 0.88, scale: 0.98,
      look: { skin: 0xf0d2b8, hair: 0x1c2a4a, main: 0x2a3f8f, second: 0xd8dcef, metal: 0xc9d6ff, accent: 0x8fe3ff, leather: 0x3a3350, trail: 0x9fe8ff, hairStyle: 'ponytail', extras: ['ponytail'] },
      alt: { main: 0x5a2a6f, accent: 0xff9ff0, trail: 0xff9ff0 },
    };
  }

  const FAMILY = { kael: 'Combattant', ysra: 'Combattante', brann: 'Gros bras', brann_ch: 'Gros bras · Champion', vesper: 'Assassin' };
  G.CHARS = [makeKael(), makeYsra(), makeBrann(), makeVesper(), makeNyra(), makeBrann(true)].map(finalize);
  G.CHARS.forEach((c) => { c.family = c.family || FAMILY[c.id] || ''; });
  G.CHAR_BY_ID = {};
  G.CHARS.forEach((c) => { G.CHAR_BY_ID[c.id] = c; });

  // ---------- arènes (géométrie de jeu ; le décor est dans stages.js) ----------
  G.ARENAS = [
    { id: 'falaise', name: 'Falaise du Couchant', desc: 'Plateau circulaire au bord du vide. Hors-jeu de tous côtés.', shape: 'ngon', n: 32, radius: 7.2, rot: 0 },
    { id: 'temple', name: 'Temple des Neiges', desc: 'Cour carrée : murs au nord et à l’est, vide au sud et à l’ouest.', shape: 'poly', pts: [[-7, -7], [7, -7], [7, 7], [-7, 7]], walls: [true, true, false, false] },
    { id: 'forge', name: 'Forge de Lave', desc: 'Octogone de fer suspendu au-dessus d’un lac de lave.', shape: 'ngon', n: 8, radius: 7.4, rot: 22.5 },
  ];

  // Libellés des commandes (notation)
  G.MOD_LABEL = { '': '', '6': '→', '4': '←', '2': 'ACCROUPI', '8': 'PAS DE CÔTÉ', '66': '→→' };
})(typeof window !== 'undefined' ? window : globalThis);
