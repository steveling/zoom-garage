// Little synthesized sounds (no audio files) and an optional talking voice for non-readers.

const Sound = (() => {
  let ctx = null;
  let master = null;
  let engine = null;

  function ensure() {
    if (!save.settings.sound) return null;
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.55;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(freq, dur, type = 'sine', vol = 0.2, when = 0, slideTo = 0) {
    const c = ensure();
    if (!c) return;
    const t = c.currentTime + when;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  function noise(dur, vol = 0.12, freq = 1200, q = 1) {
    const c = ensure();
    if (!c) return;
    const len = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = buf;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = q;
    const g = c.createGain();
    const t = c.currentTime;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(master);
    src.start();
  }

  return {
    unlock: ensure,
    tap() { tone(660, 0.08, 'triangle', 0.14); },
    beep(high) { tone(high ? 880 : 440, high ? 0.5 : 0.22, 'square', 0.1); },
    chime() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.3, 'triangle', 0.15, i * 0.11)); },
    boing() { tone(320, 0.35, 'sine', 0.25, 0, 120); },
    zip() { tone(380, 0.18, 'sawtooth', 0.07, 0, 1300); },
    squeal() { noise(0.5, 0.11, 2600, 4); },
    turbo() { tone(200, 0.6, 'sawtooth', 0.09, 0, 900); noise(0.6, 0.07, 800, 0.7); },
    star() { tone(988, 0.12, 'triangle', 0.13); tone(1319, 0.18, 'triangle', 0.13, 0.08); },
    glug() { tone(150, 0.12, 'sine', 0.25, 0, 90); },
    scrub() { noise(0.07, 0.05, 3200, 0.8); },
    honk() { tone(392, 0.22, 'square', 0.08); tone(330, 0.22, 'square', 0.08); },
    cheer() {
      noise(1.2, 0.07, 1500, 0.5);
      [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.25, 'triangle', 0.12, i * 0.09));
    },
    engineStart() {
      const c = ensure();
      if (!c || engine) return;
      const o = c.createOscillator();
      const o2 = c.createOscillator();
      const f = c.createBiquadFilter();
      const g = c.createGain();
      o.type = 'sawtooth';
      o2.type = 'square';
      f.type = 'lowpass';
      f.frequency.value = 400;
      g.gain.value = 0;
      o.frequency.value = 55;
      o2.frequency.value = 27.5;
      o.connect(f);
      o2.connect(f);
      f.connect(g);
      g.connect(master);
      o.start();
      o2.start();
      engine = { o, o2, f, g };
    },
    engineSet(speed01, turbo) {
      if (!engine || !ctx) return;
      const t = ctx.currentTime;
      const fr = 50 + speed01 * 130 + (turbo ? 40 : 0);
      engine.o.frequency.setTargetAtTime(fr, t, 0.08);
      engine.o2.frequency.setTargetAtTime(fr / 2, t, 0.08);
      engine.g.gain.setTargetAtTime(save.settings.sound ? 0.025 + speed01 * 0.045 : 0, t, 0.1);
      engine.f.frequency.setTargetAtTime(350 + speed01 * 900, t, 0.1);
    },
    engineStop() {
      if (!engine || !ctx) return;
      const e = engine;
      engine = null;
      try {
        e.g.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
        e.o.stop(ctx.currentTime + 0.3);
        e.o2.stop(ctx.currentTime + 0.3);
      } catch (_) {}
    },
    say(text) {
      if (!save.settings.voice || !('speechSynthesis' in window)) return;
      try {
        speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.rate = 0.95;
        u.pitch = 1.15;
        speechSynthesis.speak(u);
      } catch (_) {}
    },
  };
})();
