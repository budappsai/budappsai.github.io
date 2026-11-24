'use strict';
// LAMES D'ORAGE — rendu Three.js : personnages procéduraux + cinématique inverse, armes, traînées, particules, caméra.
(function (root) {
  const G = root.G, U = G.U, A = G.Anim;
  const { clamp, lerp, damp } = U;
  const V3 = THREE.Vector3;
  const R = G.R = {};
  let renderer, scene, camera, gradTex, outlineMat, hemi, sun, sunTarget;
  R.quality = 'medium';

  // ---------- initialisation ----------
  R.init = function (canvas, quality) {
    R.quality = quality || 'medium';
    if (THREE.ColorManagement) THREE.ColorManagement.legacyMode = false;
    renderer = new THREE.WebGLRenderer({ canvas, antialias: R.quality !== 'low', powerPreference: 'high-performance' });
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.shadowMap.enabled = R.quality !== 'low';
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(46, 16 / 9, 0.1, 500);
    camera.position.set(0, 2, 8);
    // dégradé « cel-shading » à 3 tons
    const d = new Uint8Array([70, 70, 70, 255, 160, 160, 160, 255, 255, 255, 255, 255]);
    gradTex = new THREE.DataTexture(d, 3, 1, THREE.RGBAFormat);
    gradTex.minFilter = gradTex.magFilter = THREE.NearestFilter; gradTex.needsUpdate = true;
    outlineMat = new THREE.ShaderMaterial({
      uniforms: { thick: { value: 0.011 }, color: { value: new THREE.Color(0x0b0a10) } },
      vertexShader: 'uniform float thick; void main(){ vec3 p = position + normal * thick; gl_Position = projectionMatrix * modelViewMatrix * vec4(p,1.0); }',
      fragmentShader: 'uniform vec3 color; void main(){ gl_FragColor = vec4(color,1.0); }',
      side: THREE.BackSide,
    });
    hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.7); scene.add(hemi);
    sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(6, 12, 5);
    sun.castShadow = R.quality !== 'low';
    const ms = R.quality === 'high' ? 2048 : 1024;
    sun.shadow.mapSize.set(ms, ms);
    const sc = sun.shadow.camera; sc.left = -7; sc.right = 7; sc.top = 7; sc.bottom = -7; sc.near = 1; sc.far = 40;
    sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.02;
    sunTarget = new THREE.Object3D(); scene.add(sunTarget); sun.target = sunTarget;
    scene.add(sun);
    R.fx = new FX(scene);
    R.resize();
    window.addEventListener('resize', R.resize);
    R.renderer = renderer; R.scene = scene; R.camera = camera; R.sun = sun; R.hemi = hemi;
  };
  R.resize = function () {
    const w = window.innerWidth, h = window.innerHeight;
    if (!w || !h) return; // fenêtre cachée (0×0) : on garde l'ancien format, sinon la caméra devient NaN
    const maxPR = R.quality === 'high' ? 2 : R.quality === 'medium' ? 1.25 : 0.85;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxPR));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (R.fx) R.fx.setScale(h * renderer.getPixelRatio());
  };
  const tmpC = new THREE.Color(); // couleur de travail (évite une allocation par particule)
  R.toon = function (color, extra) {
    extra = Object.assign({}, extra || {});
    if (extra.flatShading) { // le matériau « toon » ne gère pas les facettes : matériau standard mat
      return new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.95, metalness: 0 }, extra));
    }
    return new THREE.MeshToonMaterial(Object.assign({ color, gradientMap: gradTex }, extra));
  };
  R.lightRig = function (o) {
    hemi.color.set(o.sky); hemi.groundColor.set(o.ground); hemi.intensity = o.hemi;
    sun.color.set(o.sun); sun.intensity = o.sunI; sun.userData.dir = new V3(o.dir[0], o.dir[1], o.dir[2]).normalize();
    renderer.toneMappingExposure = o.exposure || 1.1;
  };
  R.render = function () { renderer.render(scene, camera); };

  // ---------- géométries partagées ----------
  const GEO = {};
  function geo(key, mk) { return GEO[key] || (GEO[key] = mk()); }
  function capsule(r, len) { return geo('cap' + r.toFixed(3) + '_' + len.toFixed(3), () => new THREE.CapsuleGeometry(r, Math.max(0.001, len - 2 * r), 4, 10)); }
  function addMesh(parent, g, mat, x, y, z, outline, sx, sy, sz) {
    const m = new THREE.Mesh(g, mat);
    m.position.set(x || 0, y || 0, z || 0);
    if (sx) m.scale.set(sx, sy || sx, sz || sx);
    m.castShadow = true;
    parent.add(m);
    if (outline && R.quality !== 'low') {
      const o = new THREE.Mesh(g, outlineMat);
      o.position.copy(m.position); o.scale.copy(m.scale); o.rotation.copy(m.rotation);
      parent.add(o); m.userData.outline = o;
    }
    return m;
  }
  function obj(parent, x, y, z) { const o = new THREE.Bone(); o.position.set(x, y, z); parent.add(o); return o; }

  // ---------- modèles Blender (models/*.js) : maillage lisse déformé par le squelette du jeu ----------
  const MODEL_GEO = {};
  const b64 = (s) => { const bin = atob(s), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; };
  function modelGeo(id, MD) {
    if (MODEL_GEO[id]) return MODEL_GEO[id];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(b64(MD.pos)), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Int8Array(b64(MD.nrm)), 3, true));
    g.setAttribute('skinIndex', new THREE.BufferAttribute(new Uint8Array(b64(MD.si)), 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(new Uint8Array(b64(MD.sw)), 4, true));
    if (MD.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Uint16Array(b64(MD.uv)), 2, true));
    if (MD.cl) g.setAttribute('cloth', new THREE.BufferAttribute(new Uint8Array(b64(MD.cl)), 1, true));
    const idx = new Uint16Array(b64(MD.idx));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    MD.groups.forEach((gr, i) => g.addGroup(gr.start, gr.count, i));
    // contour : mêmes sommets, sans les petits détails du visage (yeux, bouche)
    const keep = [];
    for (const gr of MD.groups) if (gr.mat !== 'eye' && gr.mat !== 'dark') for (let i = gr.start; i < gr.start + gr.count; i++) keep.push(idx[i]);
    const go = new THREE.BufferGeometry();
    for (const k of ['position', 'normal', 'skinIndex', 'skinWeight']) go.setAttribute(k, g.getAttribute(k));
    go.setIndex(new THREE.BufferAttribute(new Uint16Array(keep), 1));
    return (MODEL_GEO[id] = { g, go });
  }
  // étoffes et cheveux qui flottent (modèles texturés) : déplacement dans le nuancier, avant le « skinning »
  function clothShader(mat) {
    const U = { uTime: { value: 0 }, uSway: { value: new V3() }, uWind: { value: new V3() } };
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>' + String.fromCharCode(10) + 'attribute float cloth; uniform float uTime; uniform vec3 uSway; uniform vec3 uWind;')
        .replace('#include <begin_vertex>', [
          '#include <begin_vertex>',
          'float cl = cloth * cloth;',
          'float ph = uTime * 3.1 + position.y * 7.0 + position.x * 4.0;',
          'transformed += cl * (uSway + uWind * (0.55 + 0.45 * sin(ph)));',
          'transformed += cl * vec3(sin(ph * 1.3) * 0.010, 0.0, cos(ph * 1.1 + 1.7) * 0.014);',
        ].join(String.fromCharCode(10)));
    };
    mat.customProgramCacheKey = () => 'cloth';
    return U;
  }
  const MODEL_TEX = {};
  function modelTex(id, MD) {
    if (MODEL_TEX[id]) return MODEL_TEX[id];
    const img = new Image(); const t = new THREE.Texture(img);
    img.onload = () => { t.needsUpdate = true; };
    img.src = MD.tex;
    t.flipY = false; t.encoding = THREE.sRGBEncoding; t.anisotropy = 4;
    return (MODEL_TEX[id] = t);
  }
  let outlineSkinMat = null;
  function getOutlineSkin() {
    return outlineSkinMat || (outlineSkinMat = new THREE.ShaderMaterial({
      uniforms: { thick: { value: 0.0075 }, color: { value: new THREE.Color(0x0b0a10) } },
      vertexShader: [
        '#include <common>', '#include <skinning_pars_vertex>', 'uniform float thick;',
        'void main(){', '#include <beginnormal_vertex>', '#include <skinbase_vertex>', '#include <skinnormal_vertex>',
        '#include <begin_vertex>', '#include <skinning_vertex>',
        'vec3 p = transformed + normalize(objectNormal) * thick;', 'gl_Position = projectionMatrix * modelViewMatrix * vec4(p,1.0); }'].join('\n'),
      fragmentShader: 'uniform vec3 color; void main(){ gl_FragColor = vec4(color,1.0); }',
      side: THREE.BackSide,
    }));
  }
  const DUMMY = new THREE.Object3D();

  // lame à section losange (local : +Y = lame, +X = tranchant)
  function bladeGeo(y0, len, w, th, tipLen, curve) {
    const y1 = y0 + len - tipLen, y2 = y0 + len, c = curve || 0;
    const sec = (y, ww, off) => [[ww / 2 + off, y, 0], [off, y, th / 2], [-ww / 2 + off, y, 0], [off, y, -th / 2]];
    const s0 = sec(y0, w, 0), s1 = sec(y1, w * 0.92, c), tip = [w * 0.15 + c * 1.4, y2, 0];
    const p = [];
    const tri = (a, b, d) => { p.push(...a, ...b, ...d); };
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      tri(s0[i], s1[i], s1[j]); tri(s0[i], s1[j], s0[j]);
      tri(s1[i], tip, s1[j]);
    }
    tri(s0[0], s0[2], s0[1]); tri(s0[0], s0[3], s0[2]);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    g.computeVertexNormals();
    return g;
  }

  function buildWeapon(W, L, mats) {
    const g = new THREE.Group();
    const wood = mats.wood;
    if (W.kind === 'sword') {
      addMesh(g, geo('swordBlade', () => bladeGeo(0.07, 0.98, 0.07, 0.016, 0.17, 0)), mats.metal, 0, 0, 0, true);
      addMesh(g, geo('swordFuller', () => new THREE.BoxGeometry(0.012, 0.7, 0.018)), mats.dark, 0, 0.45, 0);
      addMesh(g, geo('swordGuard', () => new THREE.BoxGeometry(0.26, 0.035, 0.05)), mats.accent, 0, 0.05, 0, true);
      addMesh(g, geo('swordGrip', () => new THREE.CylinderGeometry(0.019, 0.019, 0.26, 8)), mats.leather, 0, -0.08, 0, true);
      addMesh(g, geo('swordPommel', () => new THREE.SphereGeometry(0.032, 8, 6)), mats.accent, 0, -0.22, 0, true);
    } else if (W.kind === 'spear') {
      addMesh(g, geo('spearShaft', () => new THREE.CylinderGeometry(0.022, 0.024, 2.12, 8)), wood, 0, 0.67, 0, true);
      addMesh(g, geo('spearHead', () => bladeGeo(1.72, 0.38, 0.08, 0.02, 0.18, 0)), mats.metal, 0, 0, 0, true);
      addMesh(g, geo('spearCollar', () => new THREE.CylinderGeometry(0.034, 0.03, 0.07, 8)), mats.accent, 0, 1.7, 0, true);
      addMesh(g, geo('spearTassel', () => new THREE.ConeGeometry(0.05, 0.18, 6)), mats.accent2, 0, 1.6, 0, false, 1, -1, 1);
      addMesh(g, geo('spearButt', () => new THREE.ConeGeometry(0.03, 0.08, 6)), mats.metal, 0, -0.42, 0, false, 1, -1, 1);
    } else if (W.kind === 'staff') {
      // bâton de mage : hampe de bois, anneaux, cristal lumineux au sommet
      addMesh(g, geo('staffShaft', () => new THREE.CylinderGeometry(0.02, 0.025, 1.78, 8)), wood, 0, 0.47, 0, true);
      addMesh(g, geo('staffRing', () => new THREE.TorusGeometry(0.03, 0.009, 6, 12)), mats.metal, 0, 1.3, 0, false).rotation.x = Math.PI / 2;
      addMesh(g, geo('staffRing', () => new THREE.TorusGeometry(0.03, 0.009, 6, 12)), mats.metal, 0, 1.24, 0, false).rotation.x = Math.PI / 2;
      for (const a of [0, 2.1, 4.2]) { const c = addMesh(g, geo('staffClaw', () => new THREE.ConeGeometry(0.018, 0.16, 5)), mats.metal, Math.cos(a) * 0.045, 1.42, Math.sin(a) * 0.045, false); c.rotation.z = -Math.cos(a) * 0.4; c.rotation.x = Math.sin(a) * 0.4; }
      const cm = new THREE.MeshBasicMaterial({ color: new THREE.Color(L.trail).multiplyScalar(1.1) });
      addMesh(g, geo('staffCrystal', () => new THREE.OctahedronGeometry(0.07, 0)), cm, 0, 1.47, 0, true, 0.8, 1.6, 0.8);
      addMesh(g, geo('staffButt', () => new THREE.ConeGeometry(0.026, 0.08, 6)), mats.metal, 0, -0.45, 0, false, 1, -1, 1);
    } else if (W.kind === 'axe') {
      addMesh(g, geo('axeShaft', () => new THREE.CylinderGeometry(0.028, 0.032, 1.46, 8)), wood, 0, 0.5, 0, true);
      const sh = new THREE.Shape();
      sh.moveTo(0, 0.9); sh.lineTo(0.13, 0.86); sh.lineTo(0.33, 0.76);
      sh.quadraticCurveTo(0.44, 1.02, 0.33, 1.29);
      sh.lineTo(0.13, 1.18); sh.lineTo(0, 1.13); sh.lineTo(-0.08, 1.06); sh.lineTo(-0.2, 1.03); sh.lineTo(-0.08, 0.98); sh.lineTo(0, 0.9);
      const hg = geo('axeHead', () => { const e = new THREE.ExtrudeGeometry(sh, { depth: 0.04, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 1 }); e.translate(0, 0, -0.02); return e; });
      addMesh(g, hg, mats.metal, 0, 0, 0, true);
      addMesh(g, geo('axeBand', () => new THREE.CylinderGeometry(0.036, 0.036, 0.22, 8)), mats.accent, 0, 1.02, 0, true);
      if (W.L < 1.18) g.scale.setScalar(W.L / 1.18); // hache plus courte (Brann normal) : le dessin suit la zone de touche
      addMesh(g, geo('axeCap', () => new THREE.SphereGeometry(0.04, 8, 6)), mats.accent, 0, -0.24, 0, true);
    } else {
      addMesh(g, geo('dagBlade', () => bladeGeo(0.06, 0.44, 0.05, 0.013, 0.12, 0.02)), mats.metal, 0, 0, 0, true);
      addMesh(g, geo('dagGuard', () => new THREE.BoxGeometry(0.11, 0.025, 0.035)), mats.accent, 0, 0.045, 0, true);
      addMesh(g, geo('dagGrip', () => new THREE.CylinderGeometry(0.017, 0.017, 0.13, 8)), mats.leather, 0, -0.03, 0, true);
    }
    g.traverse((o) => { o.castShadow = !!o.material && o.material !== outlineMat; });
    return g;
  }

  // ---------- chaînes souples (écharpes, queue de cheval) ----------
  class Chain {
    constructor(n, seg, w0, w1, mat) {
      this.n = n; this.seg = seg; this.w0 = w0; this.w1 = w1;
      this.p = []; this.q = [];
      for (let i = 0; i < n; i++) { this.p.push(new V3()); this.q.push(new V3()); }
      const geom = new THREE.BufferGeometry();
      this.pos = new Float32Array(n * 2 * 3);
      geom.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
      const idx = [];
      for (let i = 0; i < n - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      geom.setIndex(idx);
      this.geom = geom;
      this.mesh = new THREE.Mesh(geom, mat);
      this.mesh.frustumCulled = false; this.mesh.castShadow = true;
      this.init = false;
    }
    reset(anchor) { for (let i = 0; i < this.n; i++) { this.p[i].copy(anchor); this.p[i].y -= i * this.seg; this.q[i].copy(this.p[i]); } this.init = true; }
    update(anchor, back, right, dt, wind, center, rad) {
      if (!this.init) this.reset(anchor);
      const n = this.n, p = this.p, q = this.q;
      const sdt = Math.min(dt, 1 / 30);
      const g = -9.0 * sdt * sdt;
      p[0].copy(anchor); q[0].copy(anchor);
      for (let i = 1; i < n; i++) {
        const c = p[i], o = q[i];
        const vx = (c.x - o.x) * 0.95, vy = (c.y - o.y) * 0.95, vz = (c.z - o.z) * 0.95;
        o.copy(c);
        c.x += vx + (wind.x + back.x * 0.6) * sdt * sdt * 4; c.y += vy + g; c.z += vz + (wind.z + back.z * 0.6) * sdt * sdt * 4;
      }
      for (let it = 0; it < 3; it++) {
        p[0].copy(anchor);
        for (let i = 1; i < n; i++) {
          const a = p[i - 1], b = p[i];
          let dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
          const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-5;
          const k = (d - this.seg) / d;
          if (i === 1) { b.x -= dx * k; b.y -= dy * k; b.z -= dz * k; }
          else { a.x += dx * k * 0.5; a.y += dy * k * 0.5; a.z += dz * k * 0.5; b.x -= dx * k * 0.5; b.y -= dy * k * 0.5; b.z -= dz * k * 0.5; }
          // ne pas traverser le corps
          if (center) {
            const ex = b.x - center.x, ez = b.z - center.z, ed = Math.hypot(ex, ez);
            if (ed < rad && b.y > center.y - 0.6 && b.y < center.y + 0.5) { const s = rad / (ed || 1e-4); b.x = center.x + ex * s; b.z = center.z + ez * s; }
          }
          if (b.y < 0.02) b.y = 0.02;
        }
      }
      const pos = this.pos;
      for (let i = 0; i < n; i++) {
        const w = lerp(this.w0, this.w1, i / (n - 1)) / 2;
        const c = p[i];
        let tx, ty, tz;
        if (i < n - 1) { tx = p[i + 1].x - c.x; ty = p[i + 1].y - c.y; tz = p[i + 1].z - c.z; } else { tx = c.x - p[i - 1].x; ty = c.y - p[i - 1].y; tz = c.z - p[i - 1].z; }
        const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
        let ax = right.x, ay = right.y, az = right.z;
        const k = ax * tx + ay * ty + az * tz; ax -= tx * k; ay -= ty * k; az -= tz * k;
        const al = Math.hypot(ax, ay, az) || 1; ax /= al; ay /= al; az /= al;
        pos[i * 6] = c.x - ax * w; pos[i * 6 + 1] = c.y - ay * w; pos[i * 6 + 2] = c.z - az * w;
        pos[i * 6 + 3] = c.x + ax * w; pos[i * 6 + 4] = c.y + ay * w; pos[i * 6 + 5] = c.z + az * w;
      }
      this.geom.attributes.position.needsUpdate = true;
      this.geom.computeVertexNormals(); // (maillage jamais « culled » : pas besoin de sphère englobante)
    }
  }

  // ---------- traînées d'arme ----------
  class Trail {
    constructor(color) {
      this.max = 40; this.n = 0;
      this.b = new Float32Array(this.max * 3); this.t = new Float32Array(this.max * 3); this.age = new Float32Array(this.max);
      const geom = new THREE.BufferGeometry();
      this.pos = new Float32Array(this.max * 2 * 3); this.al = new Float32Array(this.max * 2);
      geom.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
      geom.setAttribute('a', new THREE.BufferAttribute(this.al, 1).setUsage(THREE.DynamicDrawUsage));
      const idx = []; for (let i = 0; i < this.max - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      geom.setIndex(idx);
      this.geom = geom;
      this.mat = new THREE.ShaderMaterial({
        uniforms: { color: { value: new THREE.Color(color) } },
        vertexShader: 'attribute float a; varying float va; void main(){ va = a; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: 'uniform vec3 color; varying float va; void main(){ vec3 c = mix(color, vec3(1.0), va*va*0.55); gl_FragColor = vec4(c * va * 1.5, va); }',
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      });
      this.mesh = new THREE.Mesh(geom, this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 5;
      this.life = 0.16;
    }
    push(b, t) {
      if (this.n === this.max) { this.b.copyWithin(0, 3); this.t.copyWithin(0, 3); this.age.copyWithin(0, 1); this.n--; }
      const i = this.n++;
      this.b[i * 3] = b.x; this.b[i * 3 + 1] = b.y; this.b[i * 3 + 2] = b.z;
      this.t[i * 3] = t.x; this.t[i * 3 + 1] = t.y; this.t[i * 3 + 2] = t.z;
      this.age[i] = 0;
    }
    update(dt) {
      let k = 0;
      for (let i = 0; i < this.n; i++) {
        this.age[i] += dt;
        if (this.age[i] < this.life) {
          if (k !== i) { this.b[k * 3] = this.b[i * 3]; this.b[k * 3 + 1] = this.b[i * 3 + 1]; this.b[k * 3 + 2] = this.b[i * 3 + 2]; this.t[k * 3] = this.t[i * 3]; this.t[k * 3 + 1] = this.t[i * 3 + 1]; this.t[k * 3 + 2] = this.t[i * 3 + 2]; this.age[k] = this.age[i]; }
          k++;
        }
      }
      this.n = k;
      for (let i = 0; i < this.n; i++) {
        const f = 1 - this.age[i] / this.life;
        const pos = this.pos;
        pos[i * 6] = this.b[i * 3]; pos[i * 6 + 1] = this.b[i * 3 + 1]; pos[i * 6 + 2] = this.b[i * 3 + 2];
        pos[i * 6 + 3] = this.t[i * 3]; pos[i * 6 + 4] = this.t[i * 3 + 1]; pos[i * 6 + 5] = this.t[i * 3 + 2];
        this.al[i * 2] = 0.0; this.al[i * 2 + 1] = f * f * 0.95;
      }
      this.geom.setDrawRange(0, Math.max(0, (this.n - 1) * 6));
      this.geom.attributes.position.needsUpdate = true; this.geom.attributes.a.needsUpdate = true;
      this.mesh.visible = this.n > 1;
    }
    clear() { this.n = 0; this.mesh.visible = false; }
  }

  // ---------- IK à deux os ----------
  const vA = new V3(), vT = new V3(), vD = new V3(), vB = new V3(), vE = new V3(), vU1 = new V3(), vU2 = new V3(), vH = new V3(), vX = new V3(), vY = new V3(), vZ = new V3();
  const qT = new THREE.Quaternion(), qP = new THREE.Quaternion(), mT = new THREE.Matrix4();
  function setWorldBasis(o, xAxis, yAxis) {
    vZ.crossVectors(xAxis, yAxis).normalize();
    vX.crossVectors(yAxis, vZ).normalize();
    mT.makeBasis(vX, yAxis, vZ);
    qT.setFromRotationMatrix(mT);
    o.parent.getWorldQuaternion(qP);
    qP.invert();
    o.quaternion.copy(qP.multiply(qT));
  }
  function ik(upper, lower, target, pole, l1, l2, outEnd) {
    upper.getWorldPosition(vA);
    vD.subVectors(target, vA);
    let dist = vD.length();
    dist = clamp(dist, Math.abs(l1 - l2) + 0.02, (l1 + l2) * 0.999);
    vD.normalize();
    vB.subVectors(pole, vA); vB.addScaledVector(vD, -vB.dot(vD));
    if (vB.lengthSq() < 1e-8) { vB.set(0, 0, 1); vB.addScaledVector(vD, -vB.dot(vD)); }
    vB.normalize();
    const cosA = clamp((l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist), -1, 1), sinA = Math.sqrt(1 - cosA * cosA);
    vE.copy(vA).addScaledVector(vD, l1 * cosA).addScaledVector(vB, l1 * sinA);
    vT.copy(vA).addScaledVector(vD, dist);
    vU1.subVectors(vE, vA).normalize(); vU2.subVectors(vT, vE).normalize();
    vH.crossVectors(vD, vB).normalize();
    vY.copy(vU1).negate(); setWorldBasis(upper, vH, vY); upper.updateMatrixWorld(true);
    vY.copy(vU2).negate(); setWorldBasis(lower, vH, vY); lower.updateMatrixWorld(true);
    if (outEnd) outEnd.copy(vT);
  }

  // ---------- vue d'un combattant ----------
  const BULK = { kael: 1, ysra: 0.9, brann: 1.28, vesper: 0.88, nyra: 0.88 };
  const tq = new THREE.Quaternion(), tq2 = new THREE.Quaternion(), tv = new V3(), tv2 = new V3(), tv3 = new V3(), tv4 = new V3(), tv5 = new V3();
  const bx = new V3(), by = new V3(), bz = new V3(), tm = new THREE.Matrix4();
  const WIND0 = new V3();

  class FighterView {
    constructor(ch, pal) {
      this.ch = ch;
      const L = this.L = Object.assign({}, ch.look, pal ? ch.alt : {});
      const bulk = this.bulk = BULK[ch.vis || ch.id] || 1;
      const M = this.mats = {};
      const mk = (k, c, ex) => (M[k] = R.toon(c, ex));
      mk('skin', L.skin); mk('main', L.main); mk('second', L.second); mk('metal', L.metal); mk('accent', L.accent);
      mk('accent2', L.trail); mk('hair', L.hair); mk('leather', L.leather || 0x3a2a1a); mk('fur', L.fur || 0x6b4a2e, { flatShading: true });
      mk('scarf', L.scarf || L.main, { side: THREE.DoubleSide }); mk('dark', 0x15121a); mk('wood', 0x6a4526); mk('eye', 0xf2f2f2);
      M.hairS = R.toon(L.hair, { side: THREE.DoubleSide });
      this.flashMats = ['skin', 'main', 'second', 'metal', 'accent', 'hair', 'leather', 'fur', 'scarf'].map((k) => M[k]);
      this.trailColor = new THREE.Color(L.trail);

      const root = this.root = new THREE.Group();
      this.tumble = new THREE.Group(); this.tumble.position.y = 0.95; root.add(this.tumble);
      const body = this.body = new THREE.Group(); body.position.y = -0.95; this.tumble.add(body);
      root.scale.setScalar(ch.scale || 1);

      // os
      this.hips = obj(body, 0, 0.88, 0);
      this.spine = obj(this.hips, 0, 0.08, 0); this.spine.rotation.order = 'YXZ';
      this.chest = obj(this.spine, 0, 0.24, 0); this.chest.rotation.order = 'YXZ';
      this.neck = obj(this.chest, 0, 0.24, 0);
      this.head = obj(this.neck, 0, 0.11, 0); this.head.rotation.order = 'YXZ';
      this.shR = obj(this.chest, -0.2 * Math.sqrt(bulk), 0.16, 0); this.uaR = obj(this.shR, 0, 0, 0); this.faR = obj(this.uaR, 0, -0.3, 0); this.hR = obj(this.faR, 0, -0.28, 0);
      this.shL = obj(this.chest, 0.2 * Math.sqrt(bulk), 0.16, 0); this.uaL = obj(this.shL, 0, 0, 0); this.faL = obj(this.uaL, 0, -0.3, 0); this.hL = obj(this.faL, 0, -0.28, 0);
      this.thR = obj(this.hips, -0.1, -0.06, 0); this.snR = obj(this.thR, 0, -0.45, 0); this.ftR = obj(this.snR, 0, -0.45, 0);
      this.thL = obj(this.hips, 0.1, -0.06, 0); this.snL = obj(this.thL, 0, -0.45, 0); this.ftL = obj(this.snL, 0, -0.45, 0);

      // maillages : modèle Blender s'il existe, sinon formes simples
      const MD = G.MODELS && G.MODELS[ch.vis || ch.id];
      const addM = MD ? (() => DUMMY) : addMesh;
      const b = bulk, ex = new Set(L.extras || []);
      const armMat = (ch.vis || ch.id) === 'brann' ? M.skin : M.main;
      const foreMat = (ch.vis || ch.id) === 'brann' ? M.skin : (ch.id === 'kael' ? M.skin : M.second);
      addM(this.hips, geo('pelvis', () => new THREE.CylinderGeometry(0.15, 0.165, 0.17, 10)), M.second, 0, 0, 0, true, 1.12 * b, 1, 0.85 * b);
      addM(this.spine, geo('abdomen', () => new THREE.CylinderGeometry(0.135, 0.15, 0.22, 10)), M.main, 0, 0.1, 0, true, 1.08 * b, 1, 0.82 * b);
      addM(this.chest, geo('chest', () => new THREE.CylinderGeometry(0.2, 0.15, 0.32, 10)), M.main, 0, 0.08, 0, true, 1.12 * b, 1, 0.74 * b);
      addM(this.neck, geo('neck', () => new THREE.CylinderGeometry(0.05, 0.058, 0.12, 8)), M.skin, 0, 0, 0, false, b, 1, b);
      addM(this.head, geo('head', () => new THREE.SphereGeometry(0.115, 16, 12)), M.skin, 0, 0, 0.005, true, 0.95, 1.08, 1.0);
      addM(this.head, geo('eye', () => new THREE.BoxGeometry(0.03, 0.014, 0.012)), M.dark, -0.04, 0.012, 0.106);
      addM(this.head, geo('eye', () => new THREE.BoxGeometry(0.03, 0.014, 0.012)), M.dark, 0.04, 0.012, 0.106);
      for (const [ua, fa, h] of [[this.uaR, this.faR, this.hR], [this.uaL, this.faL, this.hL]]) {
        addM(ua, capsule(0.056 * b, 0.32), armMat, 0, -0.15, 0, true);
        addM(fa, capsule(0.049 * b, 0.3), foreMat, 0, -0.14, 0, true);
        addM(h, geo('hand', () => new THREE.SphereGeometry(0.052, 10, 8)), (ch.vis || ch.id) === 'brann' ? M.skin : M.leather, 0, -0.01, 0, true, b, 1, b);
      }
      for (const [th, sn, ft] of [[this.thR, this.snR, this.ftR], [this.thL, this.snL, this.ftL]]) {
        addM(th, capsule(0.078 * b, 0.47), M.second, 0, -0.225, 0, true);
        addM(sn, capsule(0.062 * b, 0.47), M.leather, 0, -0.225, 0, true);
        addM(ft, geo('foot', () => new THREE.BoxGeometry(0.11, 0.075, 0.25)), M.leather, 0, -0.035, 0.05, true, b, 1, 1);
      }
      this.chains = [];
      // coiffures
      const hs = L.hairStyle;
      if (hs === 'spiky' || hs === 'ponytail') {
        const cap = addM(this.head, geo('hairCap', () => new THREE.SphereGeometry(0.125, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.42)), M.hair, 0, 0.018, -0.012, true);
        cap.rotation.x = -0.45; if (cap.userData.outline) cap.userData.outline.rotation.x = -0.45;
        if (hs === 'spiky') {
          const cg = geo('spike', () => new THREE.ConeGeometry(0.045, 0.16, 5));
          const sp = [[0, 0.1, -0.03, -0.5, 0], [0.06, 0.08, -0.05, -0.7, -0.5], [-0.06, 0.08, -0.05, -0.7, 0.5], [0, 0.06, -0.1, -1.3, 0], [0.08, 0.03, -0.07, -1.0, -0.9], [-0.08, 0.03, -0.07, -1.0, 0.9], [0.03, 0.11, 0.04, 0.2, -0.3]];
          for (const s of sp) { const mm = addM(this.head, cg, M.hair, s[0], s[1], s[2], true); mm.rotation.set(s[3], 0, s[4]); if (mm.userData.outline) mm.userData.outline.rotation.copy(mm.rotation); }
        } else {
          const c = new Chain(7, 0.075, 0.075, 0.025, M.hairS); this.chains.push({ c, bone: this.head, off: new V3(0, 0.07, -0.12), body: 0.16 });
        }
      } else if (hs === 'helmet') {
        addM(this.head, geo('helm', () => new THREE.SphereGeometry(0.135, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55)), M.metal, 0, 0.02, -0.005, true);
        addM(this.head, geo('helmRim', () => new THREE.TorusGeometry(0.128, 0.014, 6, 18)), M.accent, 0, 0.02, -0.005, false).rotation.x = Math.PI / 2;
        addM(this.head, geo('nose', () => new THREE.BoxGeometry(0.026, 0.1, 0.022)), M.metal, 0, -0.01, 0.125, true);
      } else if (hs === 'hood') {
        const hg = geo('hood', () => new THREE.SphereGeometry(0.152, 16, 12, Math.PI / 2 + 0.95, Math.PI * 2 - 1.9, 0, Math.PI * 0.72));
        addM(this.head, hg, mk('hood', L.main, { side: THREE.DoubleSide }), 0, 0.015, -0.01, true);
        addM(this.head, geo('hoodTip', () => new THREE.ConeGeometry(0.06, 0.16, 6)), M.main, 0, 0.06, -0.15, false).rotation.x = -2.1;
      }
      // accessoires
      if (ex.has('scarf')) { const c = new Chain(9, 0.11, 0.13, 0.07, M.scarf); this.chains.push({ c, bone: this.neck, off: new V3(-0.04, 0.0, -0.08), body: 0.2 }); addM(this.neck, geo('scarfRing', () => new THREE.TorusGeometry(0.075, 0.035, 6, 14)), M.scarf, 0, 0.0, 0, true).rotation.x = Math.PI / 2; }
      if (ex.has('scarf2')) {
        for (const sx of [-0.05, 0.05]) { const c = new Chain(8, 0.11, 0.09, 0.04, M.scarf); this.chains.push({ c, bone: this.neck, off: new V3(sx, 0.0, -0.08), body: 0.2 }); }
        addM(this.neck, geo('scarfRing', () => new THREE.TorusGeometry(0.075, 0.035, 6, 14)), M.scarf, 0, 0.0, 0, true).rotation.x = Math.PI / 2;
      }
      if (ex.has('pauldronR') || ex.has('pauldrons')) {
        const pg = geo('pauldron', () => new THREE.SphereGeometry(0.105, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2));
        const mat = ex.has('pauldrons') ? M.metal : M.leather;
        addM(this.shR, pg, mat, -0.025, 0.02, 0, true, 1.15, 0.85, 1.05).rotation.z = 0.35;
        if (ex.has('pauldrons')) addM(this.shL, pg, mat, 0.025, 0.02, 0, true, 1.15, 0.85, 1.05).rotation.z = -0.35;
      }
      if (ex.has('skirt')) addM(this.hips, geo('skirt', () => new THREE.CylinderGeometry(0.17, 0.26, 0.34, 12, 1, true)), mk('skirt', L.main, { side: THREE.DoubleSide }), 0, -0.17, 0, false, 1.05, 1, 0.9);
      if (ex.has('tassets')) addM(this.hips, geo('tassets', () => new THREE.CylinderGeometry(0.175, 0.24, 0.26, 8, 1, true)), mk('tassets', L.metal, { side: THREE.DoubleSide, flatShading: true }), 0, -0.12, 0, false, 1.05, 1, 0.9);
      if (ex.has('chestplate')) addM(this.chest, geo('chestplate', () => new THREE.CylinderGeometry(0.21, 0.16, 0.28, 10, 1, false, -Math.PI / 2, Math.PI)), M.metal, 0, 0.09, 0.005, true, 1.12, 1, 0.8);
      if (ex.has('fur')) addM(this.chest, geo('fur', () => new THREE.SphereGeometry(0.2, 12, 8)), M.fur, 0, 0.19, -0.02, true, 1.2 * b, 0.55, 0.9 * b);
      if (ex.has('beard')) addM(this.head, geo('beard', () => new THREE.ConeGeometry(0.08, 0.17, 7)), M.hair, 0, -0.1, 0.06, true).rotation.x = Math.PI + 0.25;
      if (ex.has('belt') || ch.id === 'kael') {
        addM(this.hips, geo('belt', () => new THREE.TorusGeometry(0.165, 0.027, 6, 18)), M.leather, 0, 0.06, 0, false, 1.1 * b, 0.85 * b, 1).rotation.x = Math.PI / 2;
        addM(this.hips, geo('buckle', () => new THREE.BoxGeometry(0.07, 0.06, 0.03)), M.accent, 0, 0.06, 0.15 * b, true);
      }
      if (ex.has('bracers')) for (const fa of [this.faR, this.faL]) addM(fa, geo('bracer', () => new THREE.CylinderGeometry(0.068, 0.062, 0.16, 8)), M.metal, 0, -0.17, 0, true, b, 1, b);
      if (ex.has('wraps')) for (const fa of [this.faR, this.faL]) addM(fa, geo('wrap', () => new THREE.CylinderGeometry(0.056, 0.052, 0.18, 8)), M.leather, 0, -0.16, 0, true);
      if (ex.has('mask')) addM(this.head, geo('mask', () => new THREE.BoxGeometry(0.19, 0.075, 0.08)), M.second, 0, -0.045, 0.075, true);
      if (ex.has('sash')) addM(this.spine, geo('sash', () => new THREE.CylinderGeometry(0.15, 0.155, 0.07, 10)), M.accent, 0, 0.0, 0, false, 1.08, 1, 0.85);

      if (MD) this.buildModel(MD);
      if (MD && MD.source === 'ia') { for (const c of this.chains) c.c.geom.dispose(); this.chains = []; } // le modèle texturé a déjà ses cheveux et ses étoffes

      // armes
      this.weapon = buildWeapon(ch.W, L, M); body.add(this.weapon);
      if (ch.W.twin) { this.weapon2 = buildWeapon(ch.W, L, M); body.add(this.weapon2); }
      this.trails = [new Trail(L.trail)];
      if (ch.W.twin) this.trails.push(new Trail(L.trail));

      this.pose = A.newPose(); this.blendFrom = A.newPose(); this.out = A.newPose();
      this.blendT = 1; this.blendDur = 5; this.lastKey = ''; this.hasPose = false;
      this.spring = { p: 0, pv: 0, r: 0, rv: 0, y: 0, yv: 0 };
      this.lastImpT = -1; this.lastMf = 0; this.lastMoveId = -1;
      this.shake = 0;
      this.visible = true;
      this.added = false;
    }
    buildModel(MD) {
      const { g, go } = modelGeo((this.ch.vis || this.ch.id), MD);
      const bones = MD.bones.map((n) => this[n]);
      // modèle « image -> 3D » sculpté bras écartés (pose A) : on lie le maillage avec les bras du squelette
      // ouverts du même angle ; ensuite, rotation 0 = bras le long du corps, comme pour les autres modèles
      const ap = MD.apose || [0, 0], z0 = [this.uaR.rotation.z, this.uaL.rotation.z];
      this.uaR.rotation.z = -ap[0]; this.uaL.rotation.z = ap[1];
      this.root.updateMatrixWorld(true);
      const skel = new THREE.Skeleton(bones);
      this.uaR.rotation.z = z0[0]; this.uaL.rotation.z = z0[1];
      if (MD.tex && !this.mats.tex) {
        const t = modelTex(this.ch.vis || this.ch.id, MD);
        this.mats.tex = R.toon(0xffffff, { map: t, side: THREE.DoubleSide }); // faces parfois retournées dans les modèles générés
        this.flashMats.push(this.mats.tex);
        if (MD.cl) this.clothU = clothShader(this.mats.tex);
      }
      const mats = MD.groups.map((gr) => this.mats[gr.mat] || this.mats.main);
      const mesh = this.model = new THREE.SkinnedMesh(g, mats);
      mesh.frustumCulled = false; mesh.castShadow = true;
      this.body.add(mesh); mesh.bind(skel);
      if (R.quality !== 'low' && MD.source !== 'ia') { // contour : seulement pour les modèles lisses sans texture
        const ol = new THREE.SkinnedMesh(go, getOutlineSkin());
        ol.frustumCulled = false; this.body.add(ol); ol.bind(skel, mesh.bindMatrix);
      }
    }
    addTo(scene) {
      scene.add(this.root);
      for (const ch of this.chains) scene.add(ch.c.mesh);
      for (const t of this.trails) scene.add(t.mesh);
      this.added = true;
    }
    removeFrom(scene) {
      scene.remove(this.root);
      for (const ch of this.chains) scene.remove(ch.c.mesh);
      for (const t of this.trails) scene.remove(t.mesh);
      this.added = false;
    }
    dispose() {
      if (this.model && this.model.skeleton) this.model.skeleton.dispose();
      for (const k in this.mats) this.mats[k].dispose();
      for (const t of this.trails) { t.geom.dispose(); t.mat.dispose(); }
      for (const c of this.chains) c.c.geom.dispose();
    }
    resetChains() { for (const c of this.chains) c.c.init = false; for (const t of this.trails) t.clear(); this.hasPose = false; }

    // F : combattant de la simulation ; alpha : interpolation [0,1) ; dt : secondes réelles
    update(F, alpha, dt, wind) {
      const ch = this.ch;
      // position / orientation interpolées
      const px = lerp(F.prevPos.x, F.pos.x, alpha), py = lerp(F.prevPos.y, F.pos.y, alpha), pz = lerp(F.prevPos.z, F.pos.z, alpha);
      const yaw = F.prevYaw + U.wrap(F.yaw - F.prevYaw) * alpha;
      // pose cible
      const key = F.state + ':' + (F.state === 'attack' || F.state === 'super' ? F.moveId : '');
      if (key !== this.lastKey) {
        if (this.hasPose) { A.poseCopy(this.blendFrom, this.out); this.blendT = 0; }
        this.blendDur = (F.state === 'attack' || F.state === 'super') ? 3 : (F.state === 'hitstun' || F.state === 'air' || F.state === 'clash' || F.state === 'stagger' || F.state === 'blockstun') ? 2 : 5;
        this.lastKey = key;
      }
      const ff = (F.state === 'attack' || F.state === 'super') ? alpha : alpha;
      A.pose(F, ff, this.pose);
      const out = this.out;
      if (this.blendT < 1) {
        this.blendT = Math.min(1, this.blendT + dt * 60 / this.blendDur);
        A.poseBlend(out, this.blendFrom, this.pose, U.easeOut(this.blendT));
        // la vrille (rotation complète) ne doit pas être mélangée
        out.bodyYaw = this.pose.bodyYaw;
      } else A.poseCopy(out, this.pose);
      this.hasPose = true;

      // ressort de réaction aux coups
      const sp = this.spring;
      if (F.hitImpT !== this.lastImpT && F.hitImpT > 0) {
        this.lastImpT = F.hitImpT;
        const fx = Math.sin(F.yaw), fz = Math.cos(F.yaw);
        const back = -(F.hitImp.x * fx + F.hitImp.z * fz);   // >0 : poussé vers l'arrière
        const lat = F.hitImp.x * fz - F.hitImp.z * fx;
        sp.pv -= 9 * Math.max(0.4, -back < 0 ? 1 : 0.5); sp.rv += lat * 6 + (Math.random() - 0.5) * 4; sp.yv += (Math.random() - 0.5) * 6;
        this.shake = 0.12;
      }
      const kS = 170, cS = 13, sdt = Math.min(dt, 1 / 30);
      sp.pv += (-kS * sp.p - cS * sp.pv) * sdt; sp.p += sp.pv * sdt;
      sp.rv += (-kS * sp.r - cS * sp.rv) * sdt; sp.r += sp.rv * sdt;
      sp.yv += (-kS * sp.y - cS * sp.yv) * sdt; sp.y += sp.yv * sdt;
      this.shake = Math.max(0, this.shake - dt);

      // racine
      let jx = 0, jz = 0;
      if (this.shake > 0 && G.Game && G.Game.match && G.Game.match.hitstop > 0) { jx = (Math.random() - 0.5) * 0.05; jz = (Math.random() - 0.5) * 0.05; }
      this.root.position.set(px + jx, py, pz + jz);
      this.root.rotation.set(0, yaw + out.bodyYaw, 0);
      this.tumble.position.y = out.pivotY;
      this.tumble.rotation.set(out.tumble, 0, out.roll * 0.4);
      this.hips.position.set(out.hipX, out.hipY, out.hipZ);
      this.hips.rotation.set(0, out.hipYaw, 0);
      const pitch = out.pitch + sp.p * 0.6, roll = out.roll + sp.r * 0.5, tw = out.twist + sp.y * 0.3;
      this.spine.rotation.set(pitch * 0.45, tw * 0.45, roll * 0.5);
      this.chest.rotation.set(pitch * 0.55, tw * 0.55, roll * 0.5);
      this.head.rotation.set(out.headPitch - pitch * 0.4 + sp.p * 0.5, -(out.hipYaw + tw) * 0.8 + out.headYaw, -roll * 0.3);
      this.root.updateMatrixWorld(true);

      // repère du corps (monde)
      this.body.getWorldQuaternion(tq);
      bx.set(1, 0, 0).applyQuaternion(tq); by.set(0, 1, 0).applyQuaternion(tq); bz.set(0, 0, 1).applyQuaternion(tq);
      const s = ch.scale || 1;

      // bras droit
      this.body.localToWorld(tv.copy(out.R.hand));
      this.shR.getWorldPosition(tv2);
      tv3.copy(tv2).addScaledVector(bx, -0.6 * s).addScaledVector(by, -1.0 * s).addScaledVector(bz, -0.35 * s);
      ik(this.uaR, this.faR, tv, tv3, 0.3 * s, 0.28 * s, tv4);
      // arme : position à la main atteinte, orientation donnée par la pose (repère du corps)
      this.body.worldToLocal(tv5.copy(tv4));
      this.weapon.position.copy(tv5);
      bz.copy(out.R.edge); by.copy(out.R.dir); bx.crossVectors(by, bz).normalize(); bz.crossVectors(bx, by).normalize();
      // base locale de l'arme : X = tranchant, Y = lame, Z = plat
      tm.makeBasis(bz, by, tv3.crossVectors(bz, by).normalize());
      this.weapon.quaternion.setFromRotationMatrix(tm);
      // main gauche
      const W = ch.W;
      if (out.h2mode === 0 && W.twoHand) {
        tv2.copy(tv5).addScaledVector(out.R.dir, W.offGrip);
        this.body.localToWorld(tv2);
      } else this.body.localToWorld(tv2.copy(out.L.hand));
      this.body.getWorldQuaternion(tq);
      bx.set(1, 0, 0).applyQuaternion(tq); by.set(0, 1, 0).applyQuaternion(tq); bz.set(0, 0, 1).applyQuaternion(tq);
      this.shL.getWorldPosition(tv3);
      tv3.addScaledVector(bx, 0.6 * s).addScaledVector(by, -1.0 * s).addScaledVector(bz, -0.35 * s);
      ik(this.uaL, this.faL, tv2, tv3, 0.3 * s, 0.28 * s, tv4);
      if (this.weapon2) {
        this.body.worldToLocal(tv5.copy(tv4));
        this.weapon2.position.copy(tv5);
        bz.copy(out.L.edge); by.copy(out.L.dir); bx.crossVectors(by, bz).normalize(); bz.crossVectors(bx, by).normalize();
        tm.makeBasis(bz, by, tv3.crossVectors(bz, by).normalize());
        this.weapon2.quaternion.setFromRotationMatrix(tm);
        this.body.getWorldQuaternion(tq);
        bx.set(1, 0, 0).applyQuaternion(tq); by.set(0, 1, 0).applyQuaternion(tq); bz.set(0, 0, 1).applyQuaternion(tq);
      }
      // jambes
      for (const [ft, th, sn, fb, side] of [[out.footR, this.thR, this.snR, this.ftR, -1], [out.footL, this.thL, this.snL, this.ftL, 1]]) {
        tv.set(ft.x, ft.y + 0.07, ft.z); this.body.localToWorld(tv);
        th.getWorldPosition(tv2);
        tv3.copy(tv2).addScaledVector(bz, 1.0 * s).addScaledVector(bx, side * 0.15 * s).addScaledVector(by, -0.3 * s);
        ik(th, sn, tv, tv3, 0.45 * s, 0.45 * s, null);
        // pied à plat dans le repère du corps
        fb.parent.getWorldQuaternion(tq2); tq2.invert();
        fb.quaternion.copy(tq2.multiply(tq));
      }

      // éclat de coup / éveil
      const fl = F.hitFlash > 0 ? F.hitFlash / 6 : 0;
      const ev = F.eveil > 0 ? 0.25 + 0.12 * Math.sin(performance.now() * 0.012) : 0;
      if (fl !== this._fl || ev !== this._ev) {
        this._fl = fl; this._ev = ev;
        for (const m of this.flashMats) {
          if (fl > 0) m.emissive.setRGB(fl * 0.5, fl * 0.42, fl * 0.36);
          else if (ev > 0) m.emissive.copy(this.trailColor).multiplyScalar(ev);
          else m.emissive.setRGB(0, 0, 0);
        }
      }

      // étoffes du modèle texturé : ressort piloté par la vitesse du corps (repère local) + vent de l'arène
      if (this.clothU) {
        const U = this.clothU, k = this.cloth || (this.cloth = { p: new V3(), v: new V3(), x: px, z: pz, y: py, t: 0 });
        const idt = dt > 0 ? 1 / dt : 0;
        tv.set((px - k.x) * idt, (py - k.y) * idt, (pz - k.z) * idt); k.x = px; k.y = py; k.z = pz;
        tq2.copy(tq).invert(); tv.applyQuaternion(tq2);          // vitesse dans le repère du combattant
        if (tv.lengthSq() > 64) tv.set(0, 0, 0);                  // téléportation (nouvelle manche, replacement) : pas d'à-coup
        tv2.set(-tv.x * 0.035, Math.max(-0.03, Math.min(0.05, tv.y * 0.02)), -tv.z * 0.035);
        tv2.clampLength(0, 0.16);
        // ressort amorti (l'étoffe traîne puis revient)
        tv3.subVectors(tv2, k.p).multiplyScalar(90 * dt); k.v.add(tv3); k.v.multiplyScalar(Math.max(0, 1 - 9 * dt)); k.p.addScaledVector(k.v, dt);
        k.t += dt; U.uTime.value = k.t; U.uSway.value.copy(k.p);
        const w = wind || WIND0; tv4.set(w.x, 0, w.z).applyQuaternion(tq2).multiplyScalar(0.012); U.uWind.value.copy(tv4).clampLength(0, 0.05);
      }

      // chaînes souples
      const wnd = wind || WIND0;
      bz.set(0, 0, 1).applyQuaternion(tq); bx.set(1, 0, 0).applyQuaternion(tq);
      tv5.set(-bz.x, -bz.y, -bz.z);
      this.chest.getWorldPosition(tv4);
      for (const c of this.chains) {
        tv.copy(c.off).applyMatrix4(c.bone.matrixWorld);
        c.c.update(tv, tv5, bx, dt, wnd, tv4, c.body * s);
      }

      // traînées
      this.updateTrails(F, alpha, dt, px, py, pz, yaw);
    }

    updateTrails(F, alpha, dt, px, py, pz, yaw) {
      const m = (F.state === 'attack' || F.state === 'super') ? F.move : null;
      if (m && F.moveId !== this.lastMoveId) { this.lastMoveId = F.moveId; this.lastMf = 0; }
      if (m) {
        const fNow = F.mf + alpha * (F.spd || 1);
        const f0 = Math.min(this.lastMf, fNow);
        const W = this.ch.W, s = this.ch.scale || 1;
        for (let side = 0; side < this.trails.length; side++) {
          const seq = side === 0 ? m.arm : m.arm2;
          if (!seq) continue;
          let active = false;
          for (const sg of seq) if (fNow >= sg.s - 3 && f0 <= sg.s + sg.a + 4) active = true;
          if (!active) continue;
          const steps = Math.max(1, Math.min(8, Math.ceil((fNow - f0) * 3)));
          for (let k = 1; k <= steps; k++) {
            const f = f0 + (fNow - f0) * (k / steps);
            if (!A.weaponLocal(F, m, f, side === 1, TRA)) continue;
            const spin = A.spinAt(m, f);
            const lg = 0;
            TB.x = TRA.hand.x + TRA.dir.x * W.L * 0.32; TB.y = TRA.hand.y + TRA.dir.y * W.L * 0.32; TB.z = TRA.hand.z + TRA.dir.z * W.L * 0.32 + lg;
            TT.x = TRA.hand.x + TRA.dir.x * W.L; TT.y = TRA.hand.y + TRA.dir.y * W.L; TT.z = TRA.hand.z + TRA.dir.z * W.L + lg;
            const P = { x: px, y: py, z: pz };
            U.toWorld(TBW, TB, P, yaw + spin, s); U.toWorld(TTW, TT, P, yaw + spin, s);
            this.trails[side].push(TBW, TTW);
          }
        }
        this.lastMf = fNow;
      }
      for (const t of this.trails) t.update(dt);
    }
  }
  const TRA = A.arm(), TB = { x: 0, y: 0, z: 0 }, TT = { x: 0, y: 0, z: 0 }, TBW = { x: 0, y: 0, z: 0 }, TTW = { x: 0, y: 0, z: 0 };
  R.FighterView = FighterView;

  // ---------- particules ----------
  class Particles {
    constructor(max, additive) {
      this.max = max; this.n = 0;
      this.p = new Float32Array(max * 3); this.c = new Float32Array(max * 4); this.sz = new Float32Array(max);
      this.v = new Float32Array(max * 3); this.life = new Float32Array(max); this.ml = new Float32Array(max);
      this.gr = new Float32Array(max); this.dr = new Float32Array(max); this.a0 = new Float32Array(max); this.s0 = new Float32Array(max); this.grow = new Float32Array(max);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(this.p, 3).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('acolor', new THREE.BufferAttribute(this.c, 4).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('size', new THREE.BufferAttribute(this.sz, 1).setUsage(THREE.DynamicDrawUsage));
      this.g = g;
      this.mat = new THREE.ShaderMaterial({
        uniforms: { uScale: { value: 400 } },
        vertexShader: 'attribute float size; attribute vec4 acolor; varying vec4 vC; uniform float uScale; void main(){ vC = acolor; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = size * uScale / max(0.1, -mv.z); gl_Position = projectionMatrix * mv; }',
        fragmentShader: 'varying vec4 vC; void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d); float a = smoothstep(0.5, 0.0, r); gl_FragColor = vec4(vC.rgb, vC.a * a); }',
        transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      });
      this.pts = new THREE.Points(g, this.mat); this.pts.frustumCulled = false; this.pts.renderOrder = 6;
    }
    spawn(x, y, z, vx, vy, vz, r, gg, b, a, size, life, grav, drag, grow) {
      if (this.n >= this.max) return;
      const i = this.n++;
      this.p[i * 3] = x; this.p[i * 3 + 1] = y; this.p[i * 3 + 2] = z;
      this.v[i * 3] = vx; this.v[i * 3 + 1] = vy; this.v[i * 3 + 2] = vz;
      this.c[i * 4] = r; this.c[i * 4 + 1] = gg; this.c[i * 4 + 2] = b; this.c[i * 4 + 3] = a;
      this.a0[i] = a; this.s0[i] = size; this.sz[i] = size; this.life[i] = life; this.ml[i] = life; this.gr[i] = grav || 0; this.dr[i] = drag == null ? 2 : drag; this.grow[i] = grow || 0;
    }
    update(dt) {
      let i = 0;
      while (i < this.n) {
        this.life[i] -= dt;
        if (this.life[i] <= 0) { this.copy(this.n - 1, i); this.n--; continue; }
        const k = Math.exp(-this.dr[i] * dt);
        this.v[i * 3] *= k; this.v[i * 3 + 1] = this.v[i * 3 + 1] * k - this.gr[i] * dt; this.v[i * 3 + 2] *= k;
        this.p[i * 3] += this.v[i * 3] * dt; this.p[i * 3 + 1] += this.v[i * 3 + 1] * dt; this.p[i * 3 + 2] += this.v[i * 3 + 2] * dt;
        const t = this.life[i] / this.ml[i];
        this.c[i * 4 + 3] = this.a0[i] * Math.min(1, t * 2.2);
        this.sz[i] = this.s0[i] * (1 + this.grow[i] * (1 - t));
        i++;
      }
      this.g.setDrawRange(0, this.n);
      this.g.attributes.position.needsUpdate = true; this.g.attributes.acolor.needsUpdate = true; this.g.attributes.size.needsUpdate = true;
    }
    copy(from, to) {
      if (from === to) return;
      for (let k = 0; k < 3; k++) { this.p[to * 3 + k] = this.p[from * 3 + k]; this.v[to * 3 + k] = this.v[from * 3 + k]; }
      for (let k = 0; k < 4; k++) this.c[to * 4 + k] = this.c[from * 4 + k];
      this.sz[to] = this.sz[from]; this.life[to] = this.life[from]; this.ml[to] = this.ml[from]; this.gr[to] = this.gr[from]; this.dr[to] = this.dr[from];
      this.a0[to] = this.a0[from]; this.s0[to] = this.s0[from]; this.grow[to] = this.grow[from];
    }
    clear() { this.n = 0; }
  }
  R.Particles = Particles;

  // ---------- effets ----------
  class FX {
    constructor(sc) {
      const q = R.quality;
      this.add = new Particles(q === 'low' ? 500 : 1400, true);
      this.soft = new Particles(q === 'low' ? 200 : 500, false);
      sc.add(this.add.pts); sc.add(this.soft.pts);
      this.rings = [];
      const rg = new THREE.RingGeometry(0.82, 1, 40);
      for (let i = 0; i < 8; i++) {
        const m = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
        m.visible = false; m.renderOrder = 7; m.frustumCulled = false; sc.add(m);
        this.rings.push({ m, t: 0, life: 1, s0: 0, s1: 1, flat: false });
      }
      this.flashes = [];
      const fg = new THREE.PlaneGeometry(1, 1);
      this.flashTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(c); return t; })();
      for (let i = 0; i < 6; i++) {
        const m = new THREE.Mesh(fg, new THREE.MeshBasicMaterial({ map: this.flashTex, color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
        m.visible = false; m.renderOrder = 8; m.frustumCulled = false; sc.add(m);
        this.flashes.push({ m, t: 0, life: 0.15, s: 1 });
      }
      this.ri = 0; this.fi = 0;
    }
    setScale(h) { this.add.mat.uniforms.uScale.value = h * 0.5; this.soft.mat.uniforms.uScale.value = h * 0.5; }
    ring(p, color, s0, s1, life, flat) {
      const r = this.rings[this.ri++ % this.rings.length];
      r.m.position.set(p.x, p.y, p.z); r.m.material.color.set(color); r.t = 0; r.life = life; r.s0 = s0; r.s1 = s1; r.flat = !!flat; r.m.visible = true;
    }
    flash(p, color, size, life) {
      const f = this.flashes[this.fi++ % this.flashes.length];
      f.m.position.set(p.x, p.y, p.z); f.m.material.color.set(color); f.t = 0; f.life = life; f.s = size; f.m.visible = true;
    }
    burst(p, n, speed, color, size, life, grav, spread, dir) {
      const c = tmpC.set(color);
      for (let i = 0; i < n; i++) {
        let vx = (Math.random() * 2 - 1), vy = (Math.random() * 2 - 1) * 0.8 + 0.3, vz = (Math.random() * 2 - 1);
        if (dir) { vx = vx * spread + dir.x; vy = vy * spread + dir.y; vz = vz * spread + dir.z; }
        const l = Math.hypot(vx, vy, vz) || 1, sp = speed * (0.4 + Math.random() * 0.8);
        const w = 0.7 + Math.random() * 0.3;
        this.add.spawn(p.x, p.y, p.z, vx / l * sp, vy / l * sp, vz / l * sp, c.r * w + (1 - w), c.g * w + (1 - w) * 0.9, c.b * w + (1 - w) * 0.7, 1, size * (0.5 + Math.random()), life * (0.6 + Math.random() * 0.6), grav, 3.5);
      }
    }
    hit(p, dir, power, color) {
      const n = Math.round(14 + power * 20);
      this.burst(p, n, 4 + power * 5, color, 0.06, 0.35, 6, 0.9, dir ? { x: dir.x * 0.8, y: 0.2, z: dir.z * 0.8 } : null);
      this.burst(p, 6, 1.2, 0xffffff, 0.16, 0.18, 0, 1);
      this.flash(p, color, 0.9 + power * 0.9, 0.12);
      if (power > 0.9) this.ring(p, color, 0.2, 1.3, 0.25);
    }
    block(p, heavy) {
      this.burst(p, heavy ? 26 : 16, heavy ? 6 : 4.5, 0xffd27a, 0.045, 0.3, 9, 1);
      this.flash(p, 0xfff0c0, heavy ? 1.1 : 0.7, 0.1);
    }
    clash(p) {
      this.burst(p, 50, 8, 0xfff1b0, 0.05, 0.5, 8, 1);
      this.burst(p, 10, 2, 0xffffff, 0.2, 0.25, 0, 1);
      this.flash(p, 0xffffff, 2.2, 0.18);
      this.ring(p, 0xfff0a0, 0.2, 2.2, 0.3);
    }
    parry(p) {
      this.burst(p, 30, 5, 0x9ff3ff, 0.05, 0.45, 4, 1);
      this.flash(p, 0xbff8ff, 2.4, 0.22);
      this.ring(p, 0x8ff0ff, 0.2, 2.6, 0.35);
      this.ring(p, 0xffffff, 0.1, 1.4, 0.25);
    }
    dust(x, z, n, big) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, sp = (big ? 2.2 : 1.1) * (0.5 + Math.random());
        this.soft.spawn(x + Math.cos(a) * 0.2, 0.05, z + Math.sin(a) * 0.2, Math.cos(a) * sp, 0.4 + Math.random() * 0.6, Math.sin(a) * sp, 0.75, 0.7, 0.62, 0.45, big ? 0.5 : 0.3, 0.6 + Math.random() * 0.4, -0.3, 3, 2.5);
      }
    }
    quake(x, z) { this.dust(x, z, 30, true); this.ring({ x, y: 0.05, z }, 0xffc070, 0.3, 3.5, 0.45, true); }
    aura(x, y, z, color) {
      const c = tmpC.set(color);
      const a = Math.random() * Math.PI * 2, r = 0.25 + Math.random() * 0.25;
      this.add.spawn(x + Math.cos(a) * r, y + Math.random() * 1.6, z + Math.sin(a) * r, 0, 0.8 + Math.random() * 0.8, 0, c.r, c.g, c.b, 0.9, 0.07, 0.6, -0.5, 1);
    }
    update(dt) {
      this.add.update(dt); this.soft.update(dt);
      for (const r of this.rings) {
        if (!r.m.visible) continue;
        r.t += dt; const k = r.t / r.life;
        if (k >= 1) { r.m.visible = false; continue; }
        const s = lerp(r.s0, r.s1, U.easeOut(k));
        r.m.scale.set(s, s, s);
        if (r.flat) r.m.rotation.set(-Math.PI / 2, 0, 0); else r.m.quaternion.copy(camera.quaternion);
        r.m.material.opacity = (1 - k) * 0.9;
      }
      for (const f of this.flashes) {
        if (!f.m.visible) continue;
        f.t += dt; const k = f.t / f.life;
        if (k >= 1) { f.m.visible = false; continue; }
        const s = f.s * (0.6 + k * 0.8);
        f.m.scale.set(s, s, s); f.m.quaternion.copy(camera.quaternion); f.m.material.opacity = 1 - k;
      }
    }
    clear() { this.add.clear(); this.soft.clear(); for (const r of this.rings) r.m.visible = false; for (const f of this.flashes) f.m.visible = false; }
  }

  // ---------- caméra ----------
  // ---------- sorts (projectiles) ----------
  const WHITE = new THREE.Color(0xffffff);
  const ProjViews = R.projs = {
    pool: [], live: new Map(),
    make() {
      const grp = new THREE.Group();
      const core = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      const glow = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0x88ddff, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false }));
      const spike = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 6), new THREE.MeshBasicMaterial({ color: 0xddf6ff }));
      grp.add(core, glow, spike); grp.visible = false; scene.add(grp);
      return { grp, core, glow, spike, t: 0 };
    },
    sync(list, alpha, dt) {
      const seen = new Set();
      if (list) for (const p of list) {
        seen.add(p.id);
        let v = this.live.get(p.id);
        if (!v) {
          v = this.pool.pop() || this.make();
          v.glow.material.color.set(p.owner.char.look.trail); v.spike.material.color.set(p.owner.char.look.trail).lerp(WHITE, 0.5);
          v.t = 0; v.grp.visible = true; this.live.set(p.id, v);
        }
        v.t += dt;
        const x = p.px + (p.x - p.px) * alpha, y = p.py + (p.y - p.py) * alpha, z = p.pz + (p.z - p.pz) * alpha;
        v.grp.position.set(x, y, z);
        v.grp.rotation.y = Math.atan2(p.vx, p.vz);
        const pulse = 1 + Math.sin(v.t * 30) * 0.12;
        if (p.kind === 'spike') {
          v.core.visible = false; v.spike.visible = true; v.spike.rotation.x = 0;
          v.spike.scale.set(p.r * 0.6, p.r * 2.4, p.r * 0.6); v.spike.position.set(0, p.r * 0.4, 0);
          v.glow.scale.set(p.r * 1.3, p.r * 0.5, p.r * 1.3);
        } else if (p.kind === 'lance') {
          v.core.visible = false; v.spike.visible = true;
          v.spike.scale.set(p.r * 0.5, p.r * 4, p.r * 0.5); v.spike.position.set(0, 0, 0); v.spike.rotation.x = Math.PI / 2;
          v.glow.scale.set(p.r * 0.9, p.r * 0.9, p.r * 2.6);
        } else {
          v.core.visible = true; v.spike.visible = false;
          v.core.scale.setScalar(p.r * 0.55); v.glow.scale.setScalar(p.r * 1.25 * pulse);
        }
        // traînée de givre
        const c = v.glow.material.color;
        if (R.fx && dt > 0) for (let k = 0; k < 2; k++) R.fx.add.spawn(x + (Math.random() - 0.5) * p.r, y + (Math.random() - 0.5) * p.r, z + (Math.random() - 0.5) * p.r,
          -p.vx * 10 + (Math.random() - 0.5), (Math.random() - 0.3) * 0.8, -p.vz * 10 + (Math.random() - 0.5), c.r, c.g, c.b, 0.9, 0.05 + Math.random() * 0.04, 0.35, -0.3, 1);
      }
      for (const [id, v] of this.live) if (!seen.has(id)) { v.grp.visible = false; this.live.delete(id); this.pool.push(v); }
    },
  };

  const Cam = R.Cam = {
    pos: new V3(0, 2.2, 8), look: new V3(0, 1, 0), fov: 46, shake: 0, punch: 0, mode: 'fight', side: 1, orbit: 0, cut: false,
    right: new V3(1, 0, 0), fwd: new V3(0, 0, -1),
    desired: new V3(), dlook: new V3(),
    reset(match) { this.side = 1; this.cut = true; this.orbit = 0; this.shake = 0; this.punch = 0; },
    addShake(a) { this.shake = Math.max(this.shake, a); },
    update(dt, m, views, alpha) {
      const a = m.f[0], b = m.f[1];
      const pa = tv.set(lerp(a.prevPos.x, a.pos.x, alpha), lerp(a.prevPos.y, a.pos.y, alpha), lerp(a.prevPos.z, a.pos.z, alpha));
      const pb = tv2.set(lerp(b.prevPos.x, b.pos.x, alpha), lerp(b.prevPos.y, b.pos.y, alpha), lerp(b.prevPos.z, b.pos.z, alpha));
      const mid = tv3.addVectors(pa, pb).multiplyScalar(0.5);
      let k = 6, fov = 46;
      const ax = pb.x - pa.x, az = pb.z - pa.z, d = Math.hypot(ax, az) || 0.001;
      // caméra de combat (perpendiculaire à l'axe des combattants)
      let nx = -az / d, nz = ax / d;
      const cdx = this.pos.x - mid.x, cdz = this.pos.z - mid.z;
      // en début de manche, J1 toujours à gauche de l'écran (coupe nette si la caméra est du mauvais côté)
      if (nx * cdx + nz * cdz < 0) { if (m.phase === 'ready') this.cut = true; else { nx = -nx; nz = -nz; } }
      // distance : assez pour garder les deux combattants dans le cadre, quel que soit le format d'écran
      const tanH = Math.tan(camera.fov * Math.PI / 360) * camera.aspect;
      const D = clamp(Math.max(3.2 + d * 0.95, (d * 0.5 + 1.3) / tanH), 5.6, 16), H = 1.3 + D * 0.12;
      this.desired.set(mid.x + nx * D, H + Math.max(pa.y, pb.y) * 0.3, mid.z + nz * D);
      this.dlook.set(mid.x, 1.0 + Math.max(pa.y, pb.y) * 0.4, mid.z);
      this.mode = 'fight';
      const cf = Math.max(1, Math.sqrt(1.6 / camera.aspect)); // écran vertical : on recule les plans rapprochés
      const supF = a.state === 'super' ? a : (b.state === 'super' ? b : null);
      if (m.phase === 'intro') {
        const pf = m.pf;
        const who = pf < 115 ? a : b, wp = pf < 115 ? pa : pb, q = (pf < 115 ? pf : pf - 115) / 115;
        const fy = who.yaw + 0.9 - q * 1.3;
        const rr = (2.9 - q * 0.6) * cf;
        this.desired.set(wp.x + Math.sin(fy) * rr, 1.35 + q * 0.3, wp.z + Math.cos(fy) * rr);
        this.dlook.set(wp.x, 1.25, wp.z);
        fov = 40; k = pf % 115 < 3 ? 60 : 4; this.mode = 'intro';
      } else if (m.freeze > 0 && m.freezeOwner >= 0) {
        const f = m.f[m.freezeOwner], fp = m.freezeOwner === 0 ? pa : pb;
        const fy = f.yaw + 0.7;
        this.desired.set(fp.x + Math.sin(fy) * 2.0 * cf, 1.45, fp.z + Math.cos(fy) * 2.0 * cf);
        this.dlook.set(fp.x, 1.3, fp.z);
        fov = 34; k = 14; this.mode = 'flash';
      } else if (supF) {
        this.orbit += dt * 1.1;
        const ang = supF.yaw + Math.PI / 2 + Math.sin(this.orbit) * 0.9;
        this.desired.set(mid.x + Math.sin(ang) * 3.3 * cf, 0.9 + Math.sin(this.orbit * 1.7) * 0.25, mid.z + Math.cos(ang) * 3.3 * cf);
        this.dlook.set(mid.x, 1.15, mid.z);
        fov = 42; k = 5; this.mode = 'super';
      } else if (m.phase === 'end' || m.phase === 'over') {
        const w = m.roundWinner >= 0 ? m.f[m.roundWinner] : null, l = w ? w.opp : null;
        if (m.phase === 'end' && m.pf < 100 && l) {
          const lp = l === a ? pa : pb;
          if (m.endType === 'ringout') {
            this.dlook.set(lp.x, Math.max(-6, lp.y + 0.6), lp.z);
            k = 3;
          } else {
            this.orbit += dt * 0.35;
            const ang = this.orbit + l.yaw;
            this.desired.set(lp.x + Math.sin(ang) * 4.0 * cf, 1.6, lp.z + Math.cos(ang) * 4.0 * cf);
            this.dlook.set(lp.x, 0.6, lp.z);
            k = 2.5; fov = 42;
          }
        } else if (w) {
          const wp = w === a ? pa : pb;
          this.orbit += dt * 0.25;
          const ang = w.yaw + 0.5 + Math.sin(this.orbit) * 0.5;
          this.desired.set(wp.x + Math.sin(ang) * 3.0 * cf, 1.55, wp.z + Math.cos(ang) * 3.0 * cf);
          this.dlook.set(wp.x, 1.35, wp.z);
          k = 2.5; fov = 40; this.mode = 'victory';
        }
      } else this.orbit = 0;
      if (!isFinite(this.pos.x + this.pos.y + this.pos.z + this.look.x + this.look.y + this.look.z)) this.cut = true;
      if (this.cut) { this.pos.copy(this.desired); this.look.copy(this.dlook); this.cut = false; }
      const kk = 1 - Math.exp(-k * dt);
      this.pos.lerp(this.desired, kk);
      this.look.lerp(this.dlook, 1 - Math.exp(-Math.max(k, 6) * dt));
      this.fov = damp(this.fov, fov - this.punch * 4, 8, dt);
      this.punch = Math.max(0, this.punch - dt * 3);
      // tremblement
      this.shake = Math.max(0, this.shake - dt * 1.8);
      const sh = this.shake * this.shake * 0.35;
      camera.position.set(this.pos.x + (Math.random() - 0.5) * sh, this.pos.y + (Math.random() - 0.5) * sh, this.pos.z + (Math.random() - 0.5) * sh);
      camera.lookAt(this.look);
      if (Math.abs(camera.fov - this.fov) > 0.01) { camera.fov = this.fov; camera.updateProjectionMatrix(); }
      // côtés à l'écran pour les entrées (droite écran)
      let fx = this.look.x - this.pos.x, fz = this.look.z - this.pos.z; const fl = Math.hypot(fx, fz) || 1; fx /= fl; fz /= fl;
      m.camFwd.x = fx; m.camFwd.z = fz;
      const rx = -fz, rz = fx;
      for (const f of m.f) {
        const fpx = f === a ? pa.x : pb.x, fpz = f === a ? pa.z : pb.z;
        const s = (fpx - mid.x) * rx + (fpz - mid.z) * rz;
        if (Math.abs(s) > 0.25) f.side = s < 0 ? 1 : -1;
      }
      // ombre portée centrée sur l'action
      if (sun.userData.dir) {
        sunTarget.position.set(mid.x, 0, mid.z);
        sun.position.set(mid.x + sun.userData.dir.x * 15, sun.userData.dir.y * 15, mid.z + sun.userData.dir.z * 15);
      }
    },
    // vue fixe (menus / sélection)
    still(pos, look, fov, dt) {
      if (!isFinite(this.pos.x + this.pos.y + this.pos.z + this.look.x + this.look.y + this.look.z)) { this.pos.set(pos[0], pos[1], pos[2]); this.look.set(look[0], look[1], look[2]); }
      this.pos.lerp(tv.set(pos[0], pos[1], pos[2]), 1 - Math.exp(-4 * dt));
      this.look.lerp(tv2.set(look[0], look[1], look[2]), 1 - Math.exp(-4 * dt));
      camera.position.copy(this.pos); camera.lookAt(this.look);
      if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
      if (sun.userData.dir) { sunTarget.position.set(look[0], 0, look[2]); sun.position.set(look[0] + sun.userData.dir.x * 15, sun.userData.dir.y * 15, look[2] + sun.userData.dir.z * 15); }
    },
  };
})(window);
