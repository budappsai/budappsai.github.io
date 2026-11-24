'use strict';
// LAMES D'ORAGE — sons synthétisés (WebAudio) : aucun fichier audio, musique procédurale, annonceur vocal.
(function (root) {
  const G = root.G;
  let ctx = null, master, sfxBus, musicBus, verb, verbSend, noiseBuf;
  const vol = { master: 0.8, sfx: 0.9, music: 0.45, voice: true };
  let musicTimer = null, music = null;

  function ensure() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume().catch(() => {}); return ctx.state === 'running'; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = vol.master;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.2;
    master.connect(comp); comp.connect(ctx.destination);
    sfxBus = ctx.createGain(); sfxBus.gain.value = vol.sfx; sfxBus.connect(master);
    musicBus = ctx.createGain(); musicBus.gain.value = vol.music; musicBus.connect(master);
    // réverbération (réponse impulsionnelle générée)
    verb = ctx.createConvolver();
    const len = Math.floor(ctx.sampleRate * 1.8), ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
    verb.buffer = ir;
    verbSend = ctx.createGain(); verbSend.gain.value = 0.32;
    verbSend.connect(verb); verb.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const nd = noiseBuf.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx.state === 'running';
  }
  const ok = () => ctx && ctx.state === 'running';

  function env(g, t, a, peak, d, end = 0.0001) {
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
    g.gain.exponentialRampToValueAtTime(end, t + a + d);
  }
  function noise(t, dur, type, f0, f1, q, peak, a, out, rev) {
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.playbackRate.value = 1;
    const flt = ctx.createBiquadFilter(); flt.type = type; flt.Q.value = q;
    flt.frequency.setValueAtTime(f0, t); flt.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    const g = ctx.createGain(); env(g, t, a, peak, dur);
    src.connect(flt); flt.connect(g); g.connect(out || sfxBus);
    if (rev) g.connect(verbSend);
    src.start(t, Math.random() * 1.5); src.stop(t + a + dur + 0.05);
  }
  function tone(t, type, f0, f1, dur, peak, a, out, rev, detune) {
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    if (detune) o.detune.value = detune;
    const g = ctx.createGain(); env(g, t, a, peak, dur);
    o.connect(g); g.connect(out || sfxBus); if (rev) g.connect(verbSend);
    o.start(t); o.stop(t + a + dur + 0.05);
  }
  function metal(t, base, dur, peak, rev) {
    const ratios = [1, 1.51, 2.42, 3.17, 4.33];
    for (let i = 0; i < ratios.length; i++) tone(t, i % 2 ? 'triangle' : 'square', base * ratios[i] * (0.98 + Math.random() * 0.04), base * ratios[i] * 0.995, dur * (1 - i * 0.12), peak / (i + 1.6), 0.001, sfxBus, rev);
    noise(t, 0.05, 'highpass', 4000, 3000, 0.7, peak * 0.8, 0.001, sfxBus, rev);
  }

  const S = {
    swing(w, k) { // w : poids de l'arme 0..1
      if (!ok()) return; const t = ctx.currentTime;
      if (k === 'k') { noise(t, 0.12, 'bandpass', 500, 1200, 1.2, 0.25, 0.01); return; }
      const lo = 1 - w * 0.55;
      noise(t, 0.16 + w * 0.12, 'bandpass', 700 * lo, 2600 * lo, 1.6, 0.42, 0.02);
      noise(t + 0.02, 0.1, 'highpass', 3000, 6000, 0.8, 0.08, 0.01);
    },
    spell() { // lancement d'un sort de givre
      if (!ok()) return; const t = ctx.currentTime;
      tone(t, 'sine', 1400, 2600, 0.18, 0.18, 0.005, sfxBus, true);
      tone(t + 0.02, 'triangle', 2100, 900, 0.22, 0.1, 0.005, sfxBus, true, 12);
      noise(t, 0.25, 'highpass', 5000, 2500, 0.8, 0.14, 0.01, sfxBus, true);
    },
    hit(power, kind) {
      if (!ok()) return; const t = ctx.currentTime;
      const p = Math.min(1.6, power);
      tone(t, 'sine', 150 + p * 20, 42, 0.18 + p * 0.1, 0.65 * p + 0.2, 0.002);
      noise(t, 0.08 + p * 0.05, 'lowpass', 2600, 600, 0.8, 0.5 * p + 0.15, 0.001);
      if (kind !== 'k') noise(t, 0.06, 'highpass', 2500, 1500, 1, 0.3, 0.001);
      if (p > 0.9) { noise(t, 0.35, 'lowpass', 900, 120, 0.7, 0.35, 0.002, sfxBus, true); }
    },
    block(heavy) { if (!ok()) return; metal(ctx.currentTime, heavy ? 520 : 760, heavy ? 0.45 : 0.3, heavy ? 0.5 : 0.36, true); },
    parry() {
      if (!ok()) return; const t = ctx.currentTime;
      metal(t, 980, 0.6, 0.45, true);
      tone(t, 'sine', 2637, 2600, 1.2, 0.22, 0.002, sfxBus, true);
      tone(t + 0.03, 'sine', 3951, 3900, 0.9, 0.1, 0.002, sfxBus, true);
    },
    clash() { if (!ok()) return; const t = ctx.currentTime; metal(t, 640, 0.7, 0.5, true); metal(t + 0.015, 690, 0.6, 0.35, true); noise(t, 0.3, 'bandpass', 5000, 9000, 2, 0.2, 0.001, sfxBus, true); },
    dash() { if (!ok()) return; const t = ctx.currentTime; noise(t, 0.14, 'lowpass', 900, 300, 0.7, 0.18, 0.005); },
    land(h) { if (!ok()) return; const t = ctx.currentTime; tone(t, 'sine', 90, 35, 0.25, h ? 0.55 : 0.3, 0.002); noise(t, 0.2, 'lowpass', 700, 150, 0.7, h ? 0.35 : 0.2, 0.002); },
    grab() { if (!ok()) return; const t = ctx.currentTime; noise(t, 0.08, 'bandpass', 900, 600, 1.5, 0.3, 0.002); tone(t, 'sine', 200, 120, 0.1, 0.3, 0.002); },
    ko() {
      if (!ok()) return; const t = ctx.currentTime;
      tone(t, 'sine', 95, 28, 1.6, 0.9, 0.003, sfxBus, true);
      noise(t, 1.4, 'lowpass', 1600, 60, 0.6, 0.6, 0.004, sfxBus, true);
      metal(t, 330, 1.4, 0.3, true);
    },
    ringout() { if (!ok()) return; const t = ctx.currentTime; noise(t, 1.3, 'bandpass', 1800, 200, 1.2, 0.4, 0.05, sfxBus, true); tone(t, 'triangle', 600, 120, 1.2, 0.2, 0.02, sfxBus, true); },
    superflash() {
      if (!ok()) return; const t = ctx.currentTime;
      noise(t, 0.5, 'bandpass', 300, 5000, 2, 0.4, 0.05, sfxBus, true);
      [220, 277, 330, 440].forEach((f, i) => tone(t + 0.05, 'sawtooth', f, f, 0.8, 0.07, 0.01, sfxBus, true, i * 4));
      tone(t, 'sine', 60, 40, 0.8, 0.5, 0.01);
    },
    eveil() {
      if (!ok()) return; const t = ctx.currentTime;
      for (let i = 0; i < 6; i++) tone(t + i * 0.05, 'triangle', 440 * Math.pow(1.26, i), 440 * Math.pow(1.26, i), 0.5, 0.08, 0.005, sfxBus, true);
      noise(t, 0.6, 'bandpass', 400, 4000, 1.5, 0.3, 0.1, sfxBus, true);
    },
    ui(kind) {
      if (!ok()) return; const t = ctx.currentTime;
      if (kind === 'move') tone(t, 'triangle', 880, 880, 0.05, 0.08, 0.002);
      else if (kind === 'ok') { tone(t, 'triangle', 660, 660, 0.07, 0.12, 0.002); tone(t + 0.06, 'triangle', 990, 990, 0.12, 0.12, 0.002); }
      else if (kind === 'back') tone(t, 'triangle', 520, 330, 0.12, 0.1, 0.002);
      else if (kind === 'select') { metal(t, 900, 0.4, 0.25, true); }
      else if (kind === 'banner') { noise(t, 0.6, 'bandpass', 200, 2000, 1.5, 0.3, 0.02, sfxBus, true); tone(t, 'sine', 70, 45, 0.6, 0.5, 0.005); }
    },
  };

  // ---------- annonceur (synthèse vocale du navigateur) ----------
  let voiceFr = null;
  function pickVoice() {
    try {
      const vs = speechSynthesis.getVoices();
      voiceFr = vs.find((v) => /fr/i.test(v.lang) && /(Paul|Henri|Thomas|male|Claude|Mathieu)/i.test(v.name)) || vs.find((v) => /^fr/i.test(v.lang)) || null;
    } catch (e) { voiceFr = null; }
  }
  try { if (window.speechSynthesis) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; } } catch (e) { /* ignore */ }
  function say(text, rate = 1.0, pitch = 0.7) {
    if (!vol.voice || !window.speechSynthesis) return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'fr-FR'; if (voiceFr) u.voice = voiceFr;
      u.rate = rate; u.pitch = pitch; u.volume = Math.min(1, vol.master * 1.1);
      speechSynthesis.speak(u);
    } catch (e) { /* ignore */ }
  }

  // ---------- musique procédurale ----------
  const SCALES = {
    menu: { root: 45, mode: [0, 3, 5, 7, 10], bpm: 84 },
    falaise: { root: 45, mode: [0, 2, 3, 7, 8], bpm: 96 },
    temple: { root: 50, mode: [0, 2, 3, 5, 7, 9, 10], bpm: 102 },
    forge: { root: 40, mode: [0, 1, 4, 5, 7, 8], bpm: 112 },
  };
  const mtof = (n) => 440 * Math.pow(2, (n - 69) / 12);
  function startMusic(key) {
    if (!ensure() && !ctx) return;
    if (music && music.key === key) return;
    stopMusic();
    const sc = SCALES[key] || SCALES.menu;
    music = { key, sc, step: 0, next: ctx.currentTime + 0.1, bar: 0, chord: 0 };
    musicTimer = setInterval(tickMusic, 30);
  }
  function stopMusic() { if (musicTimer) clearInterval(musicTimer); musicTimer = null; music = null; }
  const PROG = [0, 5, 3, 4];
  function tickMusic() {
    if (!ok() || !music) return;
    const sc = music.sc, spb = 60 / sc.bpm / 4; // double-croche
    if (music.next < ctx.currentTime - 0.05) music.next = ctx.currentTime; // retour d'arrière-plan : pas de rafale de notes
    while (music.next < ctx.currentTime + 0.12) {
      const t = music.next, s = music.step % 16;
      if (s === 0) { music.bar++; music.chord = PROG[music.bar % 4]; }
      const deg = (i) => { const m = sc.mode; const o = Math.floor(i / m.length); return sc.root + m[((i % m.length) + m.length) % m.length] + o * 12; };
      const chordRoot = music.chord;
      // tambours graves (taiko)
      if (s === 0 || s === 6 || s === 10 || (s === 14 && music.bar % 2)) { tone(t, 'sine', 110, 46, 0.35, 0.55, 0.003, musicBus); noise(t, 0.08, 'lowpass', 800, 200, 0.7, 0.18, 0.002, musicBus); }
      if (s === 4 || s === 12) noise(t, 0.12, 'bandpass', 1800, 900, 1.2, 0.14, 0.002, musicBus, true);
      if (s % 2 === 1 && music.bar > 2) noise(t, 0.03, 'highpass', 7000, 6000, 0.7, 0.03, 0.001, musicBus);
      // basse
      if (s === 0 || s === 8) tone(t, 'sawtooth', mtof(deg(chordRoot) - 12), mtof(deg(chordRoot) - 12), spb * 7, 0.07, 0.01, musicBus);
      // nappe
      if (s === 0 && music.bar % 2 === 0) [0, 2, 4].forEach((iv, i) => tone(t, 'triangle', mtof(deg(chordRoot + iv)), mtof(deg(chordRoot + iv)), spb * 30, 0.025, 0.4, musicBus, true, (i - 1) * 6));
      // arpège pincé
      if (music.bar > 1 && (s % 3 === 0)) {
        const pat = [0, 2, 4, 7, 4, 2];
        const n = deg(chordRoot + pat[(music.step / 3 | 0) % pat.length]) + 12;
        tone(t, 'triangle', mtof(n), mtof(n), 0.22, 0.045, 0.003, musicBus, true);
      }
      music.step++; music.next += spb;
    }
  }

  function setVolumes(v) {
    Object.assign(vol, v);
    if (!ctx) return;
    master.gain.value = vol.master; sfxBus.gain.value = vol.sfx; musicBus.gain.value = vol.music;
  }

  G.Audio = { ensure, S, say, startMusic, stopMusic, setVolumes, vol, get running() { return ok(); } };
})(window);
