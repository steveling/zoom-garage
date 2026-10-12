// Pit stop after each race: hold to fill the gas, rub the mud off, and (once unlocked)
// tap each tire to change it. There is no timer and no way to fail.

const Pit = (() => {
  let cv, ctx, W = 0, H = 0;
  let s = null;
  let raf = 0;
  let lastT = 0;
  const ui = {};
  const STEP_INFO = {
    fuel: { icon: '⛽', say: 'Fill up the gas! Hold the button.', text: 'Hold to fill the gas!' },
    wash: { icon: '🧽', say: 'Uh oh, mud! Rub it off with your finger.', text: 'Rub off the mud!' },
    tires: { icon: '🔧', say: 'Tap each tire to change it.', text: 'Tap each tire!' },
  };

  function makeMud() {
    const spots = [];
    const n = 7;
    for (let i = 0; i < n; i++) {
      spots.push({ x: -12 + Math.random() * 24, y: -26 + (i / (n - 1)) * 52 + (Math.random() - 0.5) * 6, r: 5 + Math.random() * 3.5, a: 1, seed: Math.random() * 6 });
    }
    return spots;
  }

  function start(onDone) {
    cv = cv || document.getElementById('pitCanvas');
    ['pitSteps', 'pitSay', 'fuelBox', 'fuelBar', 'btnFuel', 'btnPitDone'].forEach((id) => (ui[id] = document.getElementById(id)));
    const steps = ['fuel', 'wash'];
    if (has('tires')) steps.push('tires');
    s = {
      onDone, steps, i: 0, fuel: 0, fueling: false, glugT: 0, mud: makeMud(),
      wheels: [0, 0, 0, 0], pop: [0, 0, 0, 0], bubbles: [], sparkle: 0, enter: 0, t: 0,
      rubbing: false, scrubT: 0, finished: false,
    };
    if (!steps.includes('tires')) s.wheels = [2, 2, 2, 2];
    ui.pitSteps.innerHTML = steps.map((k) => `<span class="pit-step" data-step="${k}">${STEP_INFO[k].icon}</span>`).join('');
    ui.btnPitDone.hidden = true;
    resize();
    setStep();
    cancelAnimationFrame(raf);
    lastT = performance.now();
    raf = requestAnimationFrame(loop);
  }

  function stop() {
    cancelAnimationFrame(raf);
    raf = 0;
    s = null;
  }

  function resize() {
    if (!cv) return;
    const f = fitCanvas(cv);
    ctx = f.ctx;
    W = f.w;
    H = f.h;
  }

  function current() {
    return s && !s.finished ? s.steps[s.i] : null;
  }

  function setStep() {
    const k = current();
    [...ui.pitSteps.children].forEach((el, i) => {
      el.classList.toggle('is-done', i < s.i);
      el.classList.toggle('is-now', i === s.i && !s.finished);
    });
    ui.fuelBox.hidden = k !== 'fuel';
    if (k) {
      ui.pitSay.textContent = STEP_INFO[k].text;
      Sound.say(STEP_INFO[k].say);
    }
  }

  function stepDone() {
    Sound.chime();
    s.i++;
    if (s.i >= s.steps.length) {
      s.finished = true;
      s.sparkle = 1.5;
      ui.pitSay.textContent = 'All set!';
      ui.btnPitDone.hidden = false;
      Sound.say('All set! Great job, pit crew!');
    }
    setStep();
  }

  function carGeom() {
    const sc = Math.min((W * 0.62) / 50, (H * 0.84) / 76);
    const enterK = Math.min(1, s.enter / 0.8);
    const ease = 1 - Math.pow(1 - enterK, 3);
    const cy = H / 2 + (1 - ease) * H * 0.7;
    return { sc, cx: W / 2, cy };
  }

  function toCar(e) {
    const r = cv.getBoundingClientRect();
    const g = carGeom();
    return { x: (e.clientX - r.left - g.cx) / g.sc, y: (e.clientY - r.top - g.cy) / g.sc, sx: e.clientX - r.left, sy: e.clientY - r.top };
  }

  function rub(e) {
    if (current() !== 'wash') return;
    const c = toCar(e);
    let any = false;
    for (const m of s.mud) {
      if (m.a <= 0) continue;
      const d = Math.hypot(c.x - m.x, c.y - m.y);
      if (d < m.r + 7) { m.a -= 0.09; any = true; }
    }
    if (any) {
      if (s.t - s.scrubT > 0.09) { s.scrubT = s.t; Sound.scrub(); }
      s.bubbles.push({ x: c.sx, y: c.sy, r: 4 + Math.random() * 7, t: 0, vx: (Math.random() - 0.5) * 40 });
    }
    if (s.mud.every((m) => m.a <= 0.05)) {
      s.mud.forEach((m) => (m.a = 0));
      s.sparkle = 1.2;
      stepDone();
    }
  }

  function tapTire(e) {
    if (current() !== 'tires') return;
    const c = toCar(e);
    const W4 = WHEELS[WHEELS[save.car.body] ? save.car.body : 'racer'];
    W4.forEach((w, i) => {
      if (s.wheels[i] !== 0) return;
      if (Math.hypot(c.x - w[0], c.y - w[1]) < 16) {
        s.wheels[i] = 1;
        s.pop[i] = 1;
        Sound.zip();
      }
    });
    if (s.wheels.every((w) => w === 1)) setTimeout(() => s && current() === 'tires' && stepDone(), 450);
  }

  function pointerDown(e) {
    if (!s) return;
    s.rubbing = true;
    rub(e);
    tapTire(e);
  }
  function pointerMove(e) {
    if (!s || !s.rubbing) return;
    rub(e);
  }
  function pointerUp() {
    if (s) s.rubbing = false;
  }
  function fuelOn(on) {
    if (!s || current() !== 'fuel') return;
    s.fueling = on;
  }

  function update(dt) {
    s.t += dt;
    s.enter += dt;
    if (current() === 'fuel' && s.fueling) {
      s.fuel = Math.min(1, s.fuel + dt / 2.4);
      s.glugT -= dt;
      if (s.glugT <= 0) { s.glugT = 0.32; Sound.glug(); }
      if (s.fuel >= 1) { s.fueling = false; stepDone(); }
    }
    ui.fuelBar.style.width = Math.round(s.fuel * 100) + '%';
    ui.btnFuel.classList.toggle('is-down', s.fueling);
    for (let i = 0; i < 4; i++) if (s.pop[i] > 0) s.pop[i] = Math.max(0, s.pop[i] - dt * 2.4);
    for (const b of s.bubbles) { b.t += dt; b.y -= 30 * dt; b.x += b.vx * dt; }
    s.bubbles = s.bubbles.filter((b) => b.t < 0.9);
    if (s.sparkle > 0) s.sparkle -= dt;
  }

  function render() {
    // pit box floor
    ctx.fillStyle = '#3a4048';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#ffc93c';
    ctx.lineWidth = 6;
    ctx.setLineDash([18, 12]);
    ctx.strokeRect(W * 0.14, 10, W * 0.72, H - 20);
    ctx.setLineDash([]);

    const g = carGeom();
    const k = current();

    // fuel hose
    if (k === 'fuel' || s.fueling) {
      const capX = g.cx + 17 * g.sc;
      const capY = g.cy + 8 * g.sc;
      ctx.strokeStyle = '#1b2130';
      ctx.lineWidth = 8;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(W + 10, H * 0.2);
      ctx.bezierCurveTo(W - 10, H * 0.5, capX + 50, capY + 40, capX + 16, capY);
      ctx.stroke();
      ctx.fillStyle = s.fueling ? '#2fbf71' : '#e5383b';
      rr(ctx, capX - 2, capY - 9, 22, 18, 5);
      ctx.fill();
    }

    const pulse = 0.5 + 0.5 * Math.sin(s.t * 6);
    drawCar(ctx, save.car, g.cx, g.cy, g.sc, { wheels: s.wheels, pop: s.pop, mud: s.mud, name: save.name });

    if (k === 'tires') {
      const W4 = WHEELS[WHEELS[save.car.body] ? save.car.body : 'racer'];
      W4.forEach((w, i) => {
        if (s.wheels[i] !== 0) return;
        ctx.strokeStyle = `rgba(255,201,60,${0.5 + pulse * 0.5})`;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(g.cx + w[0] * g.sc, g.cy + w[1] * g.sc, (14 + pulse * 3) * g.sc * 0.7, 0, 7);
        ctx.stroke();
      });
    }

    for (const b of s.bubbles) {
      ctx.strokeStyle = `rgba(255,255,255,${1 - b.t})`;
      ctx.fillStyle = `rgba(190,230,255,${0.4 * (1 - b.t)})`;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 7); ctx.fill(); ctx.stroke();
    }

    if (s.sparkle > 0) {
      for (let i = 0; i < 6; i++) {
        const a = s.t * 2 + i;
        const r = 34 * g.sc * (0.7 + 0.3 * Math.sin(a * 3));
        drawStar(ctx, g.cx + Math.cos(a) * r * 0.7, g.cy + Math.sin(a) * r, 7 * Math.min(1, s.sparkle), a, '#fff7c2');
      }
    }
  }

  function loop(t) {
    if (!s) return;
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, Math.max(0, (t - lastT) / 1000));
    lastT = t;
    update(dt);
    render();
  }

  function finish() {
    if (!s || !s.finished) return;
    const cb = s.onDone;
    stop();
    cb();
  }

  return { start, stop, resize, pointerDown, pointerMove, pointerUp, fuelOn, finish };
})();
