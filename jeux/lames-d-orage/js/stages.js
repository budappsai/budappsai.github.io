'use strict';
// LAMES D'ORAGE — décors des arènes (géométrie procédurale, aucun fichier externe).
(function (root) {
  const G = root.G, R = G.R;
  const S = G.Stages = {};
  let current = null;

  function skyDome(top, mid, bottom, sunDir, sunColor, sunSize) {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        cTop: { value: new THREE.Color(top) }, cMid: { value: new THREE.Color(mid) }, cBot: { value: new THREE.Color(bottom) },
        sunDir: { value: new THREE.Vector3(sunDir[0], sunDir[1], sunDir[2]).normalize() }, sunCol: { value: new THREE.Color(sunColor) }, sunSize: { value: sunSize },
      },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: [
        'uniform vec3 cTop, cMid, cBot, sunCol, sunDir; uniform float sunSize; varying vec3 vP;',
        'void main(){ float h = vP.y; vec3 c = h > 0.0 ? mix(cMid, cTop, pow(clamp(h,0.0,1.0),0.55)) : mix(cMid, cBot, pow(clamp(-h*3.0,0.0,1.0),0.7));',
        ' float s = max(dot(vP, sunDir), 0.0); c += sunCol * (pow(s, 600.0/sunSize) * 2.2 + pow(s, 12.0) * 0.35);',
        ' gl_FragColor = vec4(c, 1.0); }',
      ].join('\n'),
      side: THREE.BackSide, depthWrite: false, fog: false,
    });
    const m = new THREE.Mesh(new THREE.SphereGeometry(300, 32, 16), mat);
    m.renderOrder = -10;
    return m;
  }
  function canvasTex(w, h, draw, repeat) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    t.anisotropy = 4;
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); }
    return t;
  }
  function mesh(g, mat, x, y, z, shadow) {
    const m = new THREE.Mesh(g, mat); m.position.set(x || 0, y || 0, z || 0);
    if (shadow) { m.castShadow = true; m.receiveShadow = true; }
    return m;
  }
  function rnd(seed) { return G.U.rng(seed); }

  // décor de montagnes lointaines
  function mountains(group, color, count, rMin, rMax, hMin, hMax, seed, y0) {
    const r = rnd(seed), mat = R.toon(color, { flatShading: true });
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + r.range(-0.1, 0.1);
      const rad = r.range(rMin, rMax), h = r.range(hMin, hMax);
      const m = mesh(new THREE.ConeGeometry(h * r.range(0.6, 1.1), h, 5 + r.int(3)), mat, Math.cos(a) * rad, (y0 || 0) + h / 2 - 2, Math.sin(a) * rad);
      m.rotation.y = r.range(0, 6);
      group.add(m);
    }
  }

  // ---------- 1. Falaise du Couchant ----------
  function falaise() {
    const g = new THREE.Group();
    g.add(skyDome(0x2b1d52, 0xf08a5a, 0x3a2350, [0.2, 0.06, -1], 0xffd2a0, 1.4));
    // plateau de pierre circulaire
    const top = canvasTex(1024, 1024, (x, w, h) => {
      x.fillStyle = '#8f8270'; x.fillRect(0, 0, w, h);
      const cx = w / 2, cy = h / 2;
      for (let ring = 0; ring < 7; ring++) {
        const r0 = ring * 72, r1 = r0 + 72, n = 6 + ring * 6;
        for (let i = 0; i < n; i++) {
          const a0 = i / n * Math.PI * 2, a1 = (i + 1) / n * Math.PI * 2;
          const v = 120 + Math.random() * 40;
          x.fillStyle = 'rgb(' + (v + 15 | 0) + ',' + (v + 5 | 0) + ',' + (v - 12 | 0) + ')';
          x.beginPath(); x.arc(cx, cy, r1 - 3, a0 + 0.01, a1 - 0.01); x.arc(cx, cy, r0 + 3, a1 - 0.01, a0 + 0.01, true); x.closePath(); x.fill();
        }
      }
      x.strokeStyle = 'rgba(214,166,64,0.7)'; x.lineWidth = 10;
      x.beginPath(); x.arc(cx, cy, 150, 0, Math.PI * 2); x.stroke();
      x.lineWidth = 4; for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; x.beginPath(); x.moveTo(cx + Math.cos(a) * 150, cy + Math.sin(a) * 150); x.lineTo(cx + Math.cos(a) * 470, cy + Math.sin(a) * 470); x.stroke(); }
      for (let i = 0; i < 3000; i++) { x.fillStyle = 'rgba(0,0,0,' + Math.random() * 0.12 + ')'; x.fillRect(Math.random() * w, Math.random() * h, 3, 3); }
    });
    const stone = R.toon(0x8a7b68), stoneDark = R.toon(0x5d5248, { flatShading: true });
    const plat = mesh(new THREE.CylinderGeometry(7.2, 7.2, 1.2, 64), [stone, R.toon(0xffffff, { map: top }), stone], 0, -0.6, 0);
    plat.receiveShadow = true; g.add(plat);
    const rim = mesh(new THREE.TorusGeometry(7.2, 0.12, 6, 64), R.toon(0xb59a62), 0, 0, 0); rim.rotation.x = Math.PI / 2; g.add(rim);
    // falaise en dessous
    const cliff = mesh(new THREE.CylinderGeometry(7.0, 3.2, 40, 14, 4), stoneDark, 0, -21.2, 0);
    const pa = cliff.geometry.attributes.position;
    for (let i = 0; i < pa.count; i++) { if (pa.getY(i) < 19.9) { pa.setX(i, pa.getX(i) * (0.85 + Math.random() * 0.3)); pa.setZ(i, pa.getZ(i) * (0.85 + Math.random() * 0.3)); } }
    cliff.geometry.computeVertexNormals(); g.add(cliff);
    // piliers brisés sur des rochers voisins
    const r = rnd(7);
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * Math.PI * 2 + 0.3, rad = 11 + r.range(0, 3);
      const rock = mesh(new THREE.DodecahedronGeometry(r.range(1.6, 2.6), 0), stoneDark, Math.cos(a) * rad, r.range(-3.5, -1.5), Math.sin(a) * rad, true);
      g.add(rock);
      const h = r.range(2, 6);
      const pil = mesh(new THREE.CylinderGeometry(0.45, 0.5, h, 10), stone, Math.cos(a) * rad, rock.position.y + 1.2 + h / 2, Math.sin(a) * rad, true);
      pil.rotation.z = r.range(-0.15, 0.15); g.add(pil);
    }
    // mer lointaine et reflet
    const sea = mesh(new THREE.PlaneGeometry(800, 800), new THREE.MeshBasicMaterial({ color: 0x3b2a55, fog: true }), 0, -38, 0); sea.rotation.x = -Math.PI / 2; g.add(sea);
    const glint = mesh(new THREE.PlaneGeometry(30, 260), new THREE.MeshBasicMaterial({ color: 0xffb070, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }), 40, -37.9, -150);
    glint.rotation.x = -Math.PI / 2; glint.rotation.z = 0.2; g.add(glint);
    mountains(g, 0x5a3a66, 16, 120, 170, 25, 55, 3, -30);
    mountains(g, 0x7a4a6a, 12, 80, 110, 14, 30, 5, -30);
    return {
      group: g, fog: new THREE.Fog(0xd98a72, 30, 190), music: 'falaise',
      light: { sky: 0xffc2a0, ground: 0x4a3050, hemi: 0.75, sun: 0xffc890, sunI: 1.6, dir: [0.35, 0.55, -0.75], exposure: 1.05 },
      wind: new THREE.Vector3(1.5, 0, 0.6),
      ambient: { kind: 'petals', color: 0xffb0c8, rate: 14 },
    };
  }

  // ---------- 2. Temple des Neiges ----------
  function temple() {
    const g = new THREE.Group();
    g.add(skyDome(0x1a2340, 0x7d8fb0, 0x2a3245, [-0.4, 0.35, -1], 0xe8f0ff, 3));
    const slabs = canvasTex(1024, 1024, (x, w, h) => {
      x.fillStyle = '#6f7380'; x.fillRect(0, 0, w, h);
      const n = 8, s = w / n;
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        const v = 105 + Math.random() * 35;
        x.fillStyle = 'rgb(' + (v | 0) + ',' + (v + 4 | 0) + ',' + (v + 14 | 0) + ')'; x.fillRect(i * s + 3, j * s + 3, s - 6, s - 6);
      }
      x.fillStyle = 'rgba(240,245,255,0.55)';
      for (let i = 0; i < 400; i++) { x.beginPath(); x.arc(Math.random() * w, Math.random() * h, Math.random() * 14, 0, 7); x.fill(); }
      x.strokeStyle = 'rgba(150,40,40,0.8)'; x.lineWidth = 8; x.strokeRect(s * 2, s * 2, s * 4, s * 4);
    });
    const stone = R.toon(0x7b7f8c), snow = R.toon(0xe8eef7), wood = R.toon(0x8a2a22), dark = R.toon(0x2b2f3a), roof = R.toon(0x2d3a4a, { flatShading: true });
    const base = mesh(new THREE.BoxGeometry(14, 4, 14), [stone, stone, R.toon(0xffffff, { map: slabs }), stone, stone, stone], 0, -2, 0);
    base.receiveShadow = true; g.add(base);
    // murs (nord et est), muret de pierre enneigé
    const wallN = mesh(new THREE.BoxGeometry(14.6, 1.15, 0.6), stone, 0, 0.575, -7.3, true); g.add(wallN);
    g.add(mesh(new THREE.BoxGeometry(14.8, 0.18, 0.75), snow, 0, 1.2, -7.3));
    const wallE = mesh(new THREE.BoxGeometry(0.6, 1.15, 14.6), stone, 7.3, 0.575, 0, true); g.add(wallE);
    g.add(mesh(new THREE.BoxGeometry(0.75, 0.18, 14.8), snow, 7.3, 1.2, 0));
    for (let i = -3; i <= 3; i++) { g.add(mesh(new THREE.BoxGeometry(0.5, 1.5, 0.5), dark, i * 2.1, 0.75, -7.35, true)); g.add(mesh(new THREE.BoxGeometry(0.5, 1.5, 0.5), dark, 7.35, 0.75, i * 2.1, true)); }
    // terrasse inférieure enneigée (côtés ouverts)
    const low = mesh(new THREE.BoxGeometry(80, 1, 80), snow, 0, -6.5, 0); low.receiveShadow = true; g.add(low);
    // pavillon du temple au nord
    const tz = -15;
    g.add(mesh(new THREE.BoxGeometry(16, 1, 8), stone, 0, 0, tz, true));
    for (let i = -3; i <= 3; i++) g.add(mesh(new THREE.CylinderGeometry(0.3, 0.3, 5, 10), wood, i * 2.4, 3, tz + 3, true));
    g.add(mesh(new THREE.BoxGeometry(15, 4.6, 5), R.toon(0xc9b99a), 0, 2.8, tz - 0.5, true));
    const rf = new THREE.Shape(); rf.moveTo(-10, 0); rf.lineTo(10, 0); rf.lineTo(7, 3); rf.lineTo(-7, 3); rf.lineTo(-10, 0);
    const roofM = mesh(new THREE.ExtrudeGeometry(rf, { depth: 9, bevelEnabled: false }), roof, 0, 5.4, tz - 5); g.add(roofM);
    const roofS = mesh(new THREE.ExtrudeGeometry(rf, { depth: 9.2, bevelEnabled: false }), snow, 0, 5.75, tz - 5.1); roofS.scale.set(0.97, 0.9, 1); g.add(roofS);
    // lanternes
    const lantMat = new THREE.MeshBasicMaterial({ color: 0xffb35a });
    for (const [x, z] of [[-6, tz + 3.4], [6, tz + 3.4], [-8.5, 8.5], [8.5, 8.5]]) {
      g.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.4, 6), dark, x, -0.2 + (z > 0 ? -1.5 : 3.2), z));
      g.add(mesh(new THREE.SphereGeometry(0.32, 10, 8), lantMat, x, (z > 0 ? -0.3 : 4.4), z));
    }
    const pl = new THREE.PointLight(0xffa050, 1.6, 22, 2); pl.position.set(0, 4, tz + 4); g.add(pl);
    // pins
    const r = rnd(11), pine = R.toon(0x1f3d33, { flatShading: true });
    for (let i = 0; i < 26; i++) {
      const a = r.range(0, Math.PI * 2), rad = r.range(14, 40);
      const x = Math.cos(a) * rad, z = Math.sin(a) * rad;
      if (z < -9 && Math.abs(x) < 11) continue;
      const h = r.range(4, 9), y = -6;
      for (let k = 0; k < 3; k++) {
        g.add(mesh(new THREE.ConeGeometry(h * 0.32 * (1 - k * 0.22), h * 0.5, 7), pine, x, y + h * 0.3 + k * h * 0.22, z));
        g.add(mesh(new THREE.ConeGeometry(h * 0.2 * (1 - k * 0.22), h * 0.18, 7), snow, x, y + h * 0.47 + k * h * 0.22, z));
      }
    }
    mountains(g, 0x8090a8, 14, 110, 160, 30, 60, 9, -6);
    return {
      group: g, fog: new THREE.Fog(0x9fb0c8, 25, 150), music: 'temple',
      light: { sky: 0xc8d8ff, ground: 0x404858, hemi: 0.85, sun: 0xdde8ff, sunI: 1.25, dir: [-0.5, 0.75, 0.45], exposure: 1.05 },
      wind: new THREE.Vector3(-0.8, 0, 0.4),
      ambient: { kind: 'snow', color: 0xffffff, rate: 40 },
    };
  }

  // ---------- 3. Forge de Lave ----------
  function forge() {
    const g = new THREE.Group();
    g.add(skyDome(0x0d0406, 0x5a1a0c, 0x1a0805, [0.5, 0.15, -1], 0xff5a20, 6));
    const plate = canvasTex(1024, 1024, (x, w, h) => {
      x.fillStyle = '#2b2624'; x.fillRect(0, 0, w, h);
      for (let i = 0; i < 9; i++) { x.strokeStyle = 'rgba(0,0,0,0.6)'; x.lineWidth = 5; x.beginPath(); x.moveTo(0, i * 128); x.lineTo(w, i * 128); x.stroke(); x.beginPath(); x.moveTo(i * 128, 0); x.lineTo(i * 128, h); x.stroke(); }
      for (let i = 0; i < 260; i++) { x.fillStyle = 'rgba(140,130,120,0.5)'; x.beginPath(); x.arc((i % 16) * 64 + 32, Math.floor(i / 16) * 64 + 32, 4, 0, 7); x.fill(); }
      x.strokeStyle = 'rgba(255,110,30,0.9)'; x.lineWidth = 3; x.shadowColor = '#ff6a20'; x.shadowBlur = 12;
      for (let i = 0; i < 14; i++) { x.beginPath(); let px = Math.random() * w, py = Math.random() * h; x.moveTo(px, py); for (let k = 0; k < 6; k++) { px += (Math.random() - 0.5) * 120; py += (Math.random() - 0.5) * 120; x.lineTo(px, py); } x.stroke(); }
    });
    const iron = R.toon(0x3a3330, { flatShading: true }), rock = R.toon(0x1e1614, { flatShading: true });
    const topMat = R.toon(0xffffff, { map: plate, emissive: 0x401006, emissiveIntensity: 0.6 });
    const plat = mesh(new THREE.CylinderGeometry(7.4, 6.8, 1.2, 8), [iron, topMat, iron], 0, -0.6, 0);
    plat.rotation.y = Math.PI / 8; plat.receiveShadow = true; g.add(plat);
    const rim = mesh(new THREE.TorusGeometry(7.3, 0.14, 4, 8), R.toon(0x6a5a4a, { flatShading: true }), 0, 0.02, 0); rim.rotation.x = Math.PI / 2; rim.rotation.z = Math.PI / 8; g.add(rim);
    // chaînes de suspension
    for (let i = 0; i < 4; i++) { const a = Math.PI / 4 + i * Math.PI / 2; g.add(mesh(new THREE.CylinderGeometry(0.12, 0.12, 30, 6), iron, Math.cos(a) * 7.6, 15, Math.sin(a) * 7.6)); }
    // lave animée
    const lavaMat = new THREE.ShaderMaterial({
      uniforms: { t: { value: 0 } },
      vertexShader: 'varying vec2 vU; void main(){ vU = uv * 40.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: [
        'uniform float t; varying vec2 vU;',
        'float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }',
        'float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }',
        'void main(){ vec2 p = vU; float v = n(p + vec2(t*0.15, t*0.1)) * 0.6 + n(p*2.3 - vec2(t*0.2, -t*0.12)) * 0.4;',
        ' v = pow(v, 1.6); vec3 c = mix(vec3(0.35,0.02,0.0), vec3(1.0,0.45,0.05), v); c = mix(c, vec3(1.0,0.9,0.4), smoothstep(0.75,1.0,v));',
        ' gl_FragColor = vec4(c * 1.4, 1.0); }',
      ].join('\n'),
    });
    const lava = mesh(new THREE.PlaneGeometry(400, 400), lavaMat, 0, -9, 0); lava.rotation.x = -Math.PI / 2; g.add(lava);
    const r = rnd(21);
    for (let i = 0; i < 22; i++) {
      const a = r.range(0, Math.PI * 2), rad = r.range(13, 60), h = r.range(6, 26);
      const sp = mesh(new THREE.ConeGeometry(r.range(1.5, 4), h, 5), rock, Math.cos(a) * rad, -9 + h / 2, Math.sin(a) * rad, rad < 25);
      sp.rotation.set(r.range(-0.2, 0.2), r.range(0, 6), r.range(-0.2, 0.2)); g.add(sp);
    }
    const pl = new THREE.PointLight(0xff5a1a, 1.2, 30, 1.6); pl.position.set(0, -4, 0); g.add(pl);
    const flick = new THREE.PointLight(0xff8a30, 0.7, 20, 2); flick.position.set(4, 3, -3); g.add(flick);
    mountains(g, 0x2a1210, 16, 110, 160, 30, 70, 13, -9);
    return {
      group: g, fog: new THREE.Fog(0x3a1006, 20, 140), music: 'forge',
      light: { sky: 0xd8b0a0, ground: 0x8a2a10, hemi: 0.55, sun: 0xffe0c8, sunI: 1.15, dir: [0.4, 0.7, 0.5], exposure: 0.95 },
      wind: new THREE.Vector3(0, 0, 0),
      ambient: { kind: 'embers', color: 0xff7a2a, rate: 30 },
      update(dt, t) { lavaMat.uniforms.t.value = t; flick.intensity = 0.6 + Math.sin(t * 13) * 0.15 + Math.sin(t * 7.3) * 0.12; },
    };
  }

  const BUILDERS = { falaise, temple, forge };

  S.load = function (id) {
    if (current && current.id === id) return current;
    S.unload();
    const def = BUILDERS[id]();
    def.id = id;
    R.scene.add(def.group);
    R.scene.fog = def.fog;
    R.lightRig(def.light);
    def.ambT = 0;
    current = def;
    return def;
  };
  S.unload = function () {
    if (!current) return;
    R.scene.remove(current.group);
    // libère aussi matériaux et textures (sinon chaque changement d'arène fait grossir la mémoire vidéo)
    const seen = new Set();
    current.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
      for (const mt of mats) {
        if (seen.has(mt)) continue; seen.add(mt);
        for (const k of ['map', 'emissiveMap', 'alphaMap', 'normalMap', 'bumpMap', 'roughnessMap']) if (mt[k] && !seen.has(mt[k])) { seen.add(mt[k]); mt[k].dispose(); }
        mt.dispose();
      }
    });
    current = null;
  };
  S.current = () => current;
  const ambC = new THREE.Color();
  S.update = function (dt, t, focus) {
    if (!current) return;
    if (current.update) current.update(dt, t);
    // particules d'ambiance autour de l'action
    const amb = current.ambient;
    if (!amb) return;
    current.ambT += dt * amb.rate * (R.quality === 'low' ? 0.4 : 1);
    const fx = R.fx, c = ambC.set(amb.color);
    const cx = focus ? focus.x : 0, cz = focus ? focus.z : 0;
    while (current.ambT > 1) {
      current.ambT -= 1;
      const x = cx + (Math.random() - 0.5) * 22, z = cz + (Math.random() - 0.5) * 22;
      if (amb.kind === 'snow') fx.soft.spawn(x, 7 + Math.random() * 3, z, -0.6 + Math.random() * 0.3, -1.1 - Math.random() * 0.5, 0.3, 1, 1, 1, 0.85, 0.07 + Math.random() * 0.05, 7, 0, 0.1);
      else if (amb.kind === 'petals') fx.soft.spawn(x - 6, 2 + Math.random() * 5, z, 1.4 + Math.random(), -0.35 - Math.random() * 0.3, 0.5 * (Math.random() - 0.5), c.r, c.g, c.b, 0.9, 0.08, 7, 0, 0.1);
      else if (amb.kind === 'embers') fx.add.spawn(x, -1 - Math.random() * 3, z, (Math.random() - 0.5) * 0.4, 1.2 + Math.random() * 1.6, (Math.random() - 0.5) * 0.4, c.r, c.g * 0.8, c.b * 0.5, 0.9, 0.06 + Math.random() * 0.05, 4.5, -0.15, 0.2);
    }
  };
})(window);
