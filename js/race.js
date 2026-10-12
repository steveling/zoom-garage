// The race: a top-down road that bends left and right. Hold GO to speed up; let go before
// sharp curves or the car spins out (no crashes, just a slowdown). Turbo pads, steering,
// cones, stars and the turbo button switch on as he finishes more races (see FEATURE_AT).

const Race = (() => {
  const LANE_W = 62;
  const ROAD_W = LANE_W * 3;
  const CURB = 10;
  const LAP = 4800;
  const LAPS = 3;
  const VMAX = 470;
  const ACC = 300;
  const COAST = 230;
  const GAP = 60; // bumper-to-bumper distance

  let cv, ctx, W = 0, H = 0;
  let s = null;
  let raf = 0;
  let lastT = 0;
  let wakeLock = null;
  const gasPointers = new Set();
  let keyGas = false;
  const ui = {};

  // ---------- road shape ----------
  function cx(tr, d) {
    let x = 0;
    for (const c of tr.curves) x += c[0] * Math.sin((2 * Math.PI * c[1] * d) / LAP + c[2]);
    return x;
  }
  function slope(tr, d) {
    let v = 0;
    for (const c of tr.curves) {
      const w = (2 * Math.PI * c[1]) / LAP;
      v += c[0] * w * Math.cos(w * d + c[2]);
    }
    return v;
  }
  function curv(tr, d) {
    let v = 0;
    for (const c of tr.curves) {
      const w = (2 * Math.PI * c[1]) / LAP;
      v -= c[0] * w * w * Math.sin(w * d + c[2]);
    }
    return v;
  }
  function safeSpeed(tr, d) {
    return (VMAX / (1 + 830 * Math.abs(curv(tr, d)))) * tr.tol;
  }
  function hash(i) {
    const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // ---------- setup ----------
  function buildItems(tr) {
    const items = [];
    const total = LAP * LAPS;
    const steer = has('steer');
    let seed = Math.floor(Math.random() * 10000);
    const rnd = () => hash(++seed);
    if (has('turboPads')) {
      for (let d = 900; d < total - 400; d += 1400 + rnd() * 500) {
        items.push({ k: 'pad', d, lane: steer ? Math.floor(rnd() * 3) : 1 });
      }
    }
    if (steer) {
      for (let d = 700; d < total - 300; d += 520 + rnd() * 380) {
        if (items.some((it) => Math.abs(it.d - d) < 140)) continue;
        const lane = Math.floor(rnd() * 3);
        items.push({ k: 'cone', d, lane });
        if (rnd() < 0.35) items.push({ k: 'cone', d, lane: (lane + 1 + Math.floor(rnd() * 2)) % 3 });
      }
    }
    if (has('turboBtn')) {
      for (let d = 1100; d < total - 300; d += 800 + rnd() * 500) {
        if (items.some((it) => Math.abs(it.d - d) < 220)) continue;
        const lane = steer ? Math.floor(rnd() * 3) : 1;
        for (let j = 0; j < 3; j++) items.push({ k: 'star', d: d + j * 55, lane });
      }
    }
    return items.filter((it) => {
      const m = it.d % LAP;
      return m > 160 && m < LAP - 160;
    });
  }

  function buildSigns(tr) {
    const signs = [];
    let inZone = false;
    for (let d = 0; d < LAP; d += 40) {
      const zone = safeSpeed(tr, d) * 1.08 < VMAX;
      if (zone && !inZone) signs.push({ d: (d - 360 + LAP) % LAP, dir: Math.sign(curv(tr, d + 200)) || 1 });
      inZone = zone;
    }
    return signs;
  }

  function makeRivals(easy) {
    const pool = ['#1f6feb', '#ffc93c', '#2fbf71', '#ff7a1a', '#8b5cf6'];
    const cols = pool.filter((c) => c !== save.car.color).slice(0, 3);
    const lanes = [0, 2, 1];
    const ds = [70, 70, -80];
    return cols.map((c, i) => ({
      car: { body: ['racer', 'rally', 'racer'][i], color: c, number: [3, 8, 12][i], sticker: ['star', 'bolt', 'heart'][i] },
      d: ds[i], lane: lanes[i], laneX: lanes[i], speed: 0,
      base: [0.7, 0.76, 0.82][i] - (easy ? 0.08 : 0),
      think: Math.random() * 0.3, fin: false, bumpT: -9,
    }));
  }

  function start(trackId, onDone) {
    cv = cv || document.getElementById('raceCanvas');
    ctx = cv.getContext('2d');
    ['btnGas', 'btnLeft', 'btnRight', 'btnTurbo', 'hudLap', 'hudPos', 'lights', 'raceBanner', 'curveChip', 'turboRing', 'pauseMenu']
      .forEach((id) => (ui[id] = document.getElementById(id)));
    const tIdx = Math.max(0, TRACKS.findIndex((t) => t.id === trackId));
    const track = TRACKS[tIdx];
    gasPointers.clear();
    keyGas = false;
    s = {
      track, onDone, t: 0, phase: 'count', countT: 3.4, lastLight: -1,
      p: { d: 0, lane: 1, laneX: 1, speed: 0, turbo: 0, meter: 0, skidT: 0, overT: 0, wobble: 0, lap: 1, fin: false, place: 0 },
      rivals: makeRivals(tIdx === 0), items: buildItems(track), signs: buildSigns(track),
      cam: { x: cx(track, 0) }, zoom: 1, particles: [], skids: 0, paused: false, doneT: 0, reported: false,
      hud: {}, bannerT: 0,
    };
    ui.btnLeft.hidden = ui.btnRight.hidden = !has('steer');
    ui.btnTurbo.hidden = !has('turboBtn');
    ui.pauseMenu.hidden = true;
    ui.lights.hidden = false;
    ui.lights.className = 'lights';
    ui.raceBanner.hidden = true;
    ui.curveChip.hidden = true;
    resize();
    Sound.engineStart();
    requestWakeLock();
    cancelAnimationFrame(raf);
    lastT = performance.now();
    raf = requestAnimationFrame(loop);
  }

  function stop() {
    cancelAnimationFrame(raf);
    raf = 0;
    s = null;
    Sound.engineStop();
    releaseWakeLock();
  }

  function resize() {
    if (!cv) return;
    const f = fitCanvas(cv);
    ctx = f.ctx;
    W = f.w;
    H = f.h;
  }

  async function requestWakeLock() {
    try {
      if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen');
    } catch (_) {}
  }
  function releaseWakeLock() {
    try { wakeLock && wakeLock.release(); } catch (_) {}
    wakeLock = null;
  }

  // ---------- input ----------
  function gasDown(id) { gasPointers.add(id); }
  function gasUp(id) { gasPointers.delete(id); }
  function setKeyGas(on) { keyGas = on; }
  function steer(dir) {
    if (!s || s.paused || !has('steer') || s.p.fin) return;
    const n = clamp(s.p.lane + dir, 0, 2);
    if (n !== s.p.lane) { s.p.lane = n; Sound.tap(); }
  }
  function turbo() {
    if (!s || s.paused || s.phase !== 'go') return;
    const p = s.p;
    if (p.meter >= 1 && p.turbo <= 0) {
      p.meter = 0;
      p.turbo = 2.0;
      Sound.turbo();
    }
  }
  function pause(on) {
    if (!s) return;
    s.paused = on;
    ui.pauseMenu.hidden = !on;
    if (on) { gasPointers.clear(); keyGas = false; Sound.engineSet(0, false); }
    lastT = performance.now();
  }
  function isRunning() { return !!s; }

  // ---------- update ----------
  function banner(text) {
    ui.raceBanner.textContent = text;
    ui.raceBanner.hidden = false;
    ui.raceBanner.classList.remove('pop');
    void ui.raceBanner.offsetWidth;
    ui.raceBanner.classList.add('pop');
    s.bannerT = 1.3;
  }

  function puff(x, d, color, n, spread) {
    for (let i = 0; i < n; i++) {
      s.particles.push({
        x: x + (Math.random() - 0.5) * spread, d: d + (Math.random() - 0.5) * spread,
        vx: (Math.random() - 0.5) * 60, vd: (Math.random() - 0.5) * 60,
        r: 6 + Math.random() * 6, life: 0.7 + Math.random() * 0.4, t: 0, color,
      });
    }
  }

  function playerX() {
    return cx(s.track, s.p.d) + (s.p.laneX - 1) * LANE_W;
  }

  function skid() {
    const p = s.p;
    p.skidT = 0.45;
    p.wobble = 0.7;
    p.overT = 0;
    p.speed *= 0.7;
    s.skids++;
    Sound.squeal();
    puff(playerX(), p.d - 20, 'rgba(230,230,230,', 8, 30);
    if (s.skids === 1 || s.skids % 6 === 0) Sound.say('Whoa! Let go on the curves.');
  }

  function collect(it) {
    const p = s.p;
    it.hit = true;
    it.t = 0;
    if (it.k === 'pad') {
      p.turbo = Math.max(p.turbo, 1.4);
      Sound.turbo();
    } else if (it.k === 'cone') {
      p.speed *= 0.5;
      p.wobble = Math.max(p.wobble, 0.5);
      Sound.boing();
    } else if (it.k === 'star') {
      p.meter = Math.min(1, p.meter + 0.25);
      Sound.star();
      puff(cx(s.track, it.d) + (it.lane - 1) * LANE_W, it.d, 'rgba(255,214,60,', 5, 20);
    }
  }

  function pickLane(r) {
    const p = s.p;
    const steerOn = has('steer');
    let best = r.lane;
    let bestScore = Infinity;
    for (let l = 0; l < 3; l++) {
      let score = Math.abs(l - r.lane) * 6;
      for (const it of s.items) {
        if (it.k === 'cone' && !it.hit && it.lane === l && it.d > r.d && it.d - r.d < 280) score += 100;
      }
      if (!steerOn && l === p.lane && Math.abs(r.d - p.d) < 260) score += 200;
      for (const o of s.rivals) {
        if (o !== r && o.lane === l && Math.abs(o.d - r.d) < 90) score += 60;
      }
      if (score < bestScore) { bestScore = score; best = l; }
    }
    return best;
  }

  function updateRivals(dt) {
    const tr = s.track;
    const p = s.p;
    for (const r of s.rivals) {
      if (r.fin) {
        r.speed = Math.max(0, r.speed - 220 * dt);
        r.d += r.speed * dt;
        continue;
      }
      let target = Math.min(r.base * VMAX, safeSpeed(tr, r.d + 60) * 0.96);
      const gap = r.d - p.d;
      if (gap > 220) target *= clamp(1 - (gap - 220) / 700, 0.3, 1);
      if (gap < -400) target *= 1.1;
      if (s.phase === 'count') target = 0;
      r.speed += clamp(target - r.speed, -340 * dt, 260 * dt);
      r.d += r.speed * dt;
      r.think -= dt;
      if (r.think <= 0) { r.think = 0.3; r.lane = pickLane(r); }
      r.laneX += (r.lane - r.laneX) * Math.min(1, 3 * dt);
      if (r.d >= LAP * LAPS) r.fin = true;
    }
    if (has('steer')) {
      for (const r of s.rivals) {
        if (Math.abs(r.laneX - p.laneX) > 0.6) continue;
        const g = r.d - p.d;
        if (g > 0 && g < GAP) {
          p.d = r.d - GAP;
          p.speed = Math.min(p.speed, r.speed * 0.9);
          if (s.t - r.bumpT > 1.2) { r.bumpT = s.t; Sound.honk(); }
        } else if (g <= 0 && g > -GAP) {
          r.d = p.d - GAP;
          r.speed = Math.min(r.speed, p.speed * 0.9);
        }
      }
    }
  }

  function update(dt) {
    const tr = s.track;
    const p = s.p;
    s.t += dt;
    const gas = (gasPointers.size > 0 || keyGas) && !p.fin;

    if (s.phase === 'count') {
      s.countT -= dt;
      const light = s.countT > 2.4 ? 0 : s.countT > 1.4 ? 1 : s.countT > 0.4 ? 2 : 3;
      if (light !== s.lastLight) {
        s.lastLight = light;
        const dots = ui.lights.children;
        for (let i = 0; i < 3; i++) dots[i].classList.toggle('on', i < light && light < 3);
        if (light < 3) Sound.beep(false);
        if (light === 3) {
          ui.lights.classList.add('go');
          Sound.beep(true);
          banner('GO!');
          s.phase = 'go';
          setTimeout(() => { if (ui.lights) ui.lights.hidden = true; }, 700);
        }
      }
      Sound.engineSet(gas ? 0.45 : 0.08, false);
    }

    if (s.phase !== 'count') {
      const vmax = VMAX * (p.turbo > 0 ? 1.45 : 1);
      if (p.skidT > 0) {
        p.skidT -= dt;
        p.speed = Math.max(0, p.speed - 420 * dt);
      } else if (gas) {
        p.speed += (p.turbo > 0 ? ACC * 2.4 : ACC * (1 - (p.speed / vmax) * 0.5)) * dt;
      } else {
        p.speed = Math.max(0, p.speed - (p.fin ? 160 : COAST) * dt);
      }
      if (p.speed > vmax) p.speed = Math.max(vmax, p.speed - 320 * dt);
      if (p.turbo > 0) p.turbo -= dt;

      if (p.turbo <= 0 && p.skidT <= 0 && !p.fin) {
        const lim = safeSpeed(tr, p.d) * (tr.slippery ? 0.95 : 1) * 1.08;
        if (p.speed > lim) {
          p.overT += dt;
          if (p.overT > 0.45) skid();
        } else {
          p.overT = Math.max(0, p.overT - dt * 2);
        }
      }

      p.d += p.speed * dt;
      p.laneX += (p.lane - p.laneX) * Math.min(1, (tr.slippery ? 4 : 8) * dt);
      if (p.wobble > 0) p.wobble -= dt;

      if (!p.fin) {
        for (const it of s.items) {
          if (it.hit) continue;
          const dd = it.d - p.d;
          if (dd > 34 || dd < -30) continue;
          if (Math.abs(it.lane - p.laneX) > 0.55) continue;
          collect(it);
        }
      }

      updateRivals(dt);

      const lap = Math.min(LAPS, Math.floor(p.d / LAP) + 1);
      if (lap > p.lap && !p.fin) {
        p.lap = lap;
        Sound.beep(true);
        if (lap === LAPS) { banner('LAST LAP!'); Sound.say('Last lap!'); }
        else { banner('LAP ' + lap); Sound.say('Lap ' + lap); }
      }

      if (!p.fin && p.d >= LAP * LAPS) {
        p.fin = true;
        p.place = 1 + s.rivals.filter((r) => r.fin).length;
        s.phase = 'done';
        banner(PLACE_WORD[p.place] + '!');
        Sound.cheer();
        puff(playerX(), p.d + 30, 'rgba(255,214,60,', 14, 80);
      }
      if (s.phase === 'done') {
        s.doneT += dt;
        if (s.doneT > 2.4 && !s.reported) {
          s.reported = true;
          const result = { place: p.place, track: tr.id };
          const cb = s.onDone;
          stop();
          cb(result);
          return;
        }
      }

      if (has('turboBtn') && p.turbo <= 0) p.meter = Math.min(1, p.meter + dt * 0.03);
      Sound.engineSet(Math.min(1, p.speed / VMAX), p.turbo > 0);

      if (p.turbo > 0 && Math.random() < 0.5) puff(playerX(), p.d - 36, 'rgba(255,170,60,', 1, 10);
    }

    for (const pt of s.particles) {
      pt.t += dt;
      pt.x += pt.vx * dt;
      pt.d += pt.vd * dt;
    }
    s.particles = s.particles.filter((pt) => pt.t < pt.life);
    for (const it of s.items) if (it.hit) it.t += dt;

    if (s.bannerT > 0) {
      s.bannerT -= dt;
      if (s.bannerT <= 0) ui.raceBanner.hidden = true;
    }
    updateHud();
  }

  function updateHud() {
    const p = s.p;
    const place = p.fin ? p.place : 1 + s.rivals.filter((r) => r.fin || r.d > p.d).length;
    const lapText = `LAP ${p.lap}/${LAPS}`;
    if (s.hud.lap !== lapText) { s.hud.lap = lapText; ui.hudLap.textContent = lapText; }
    if (s.hud.place !== place) {
      s.hud.place = place;
      ui.hudPos.textContent = PLACE_WORD[place];
      ui.hudPos.dataset.place = place;
    }
    // Warn about a sharp curve coming up while going too fast for it.
    let danger = false;
    if (s.phase === 'go' && p.turbo <= 0 && p.skidT <= 0) {
      for (let a = 0; a <= 320; a += 40) {
        if (safeSpeed(s.track, p.d + a) < p.speed * 0.95) { danger = true; break; }
      }
    }
    if (s.hud.danger !== danger) {
      s.hud.danger = danger;
      ui.curveChip.hidden = !danger;
      ui.btnGas.classList.toggle('is-easy', danger);
    }
    const gasOn = gasPointers.size > 0 || keyGas;
    if (s.hud.gas !== gasOn) { s.hud.gas = gasOn; ui.btnGas.classList.toggle('is-down', gasOn); }
    if (has('turboBtn')) {
      const m = Math.round(p.meter * 100);
      if (s.hud.meter !== m) {
        s.hud.meter = m;
        ui.turboRing.style.strokeDashoffset = String(276.5 * (1 - p.meter));
        ui.btnTurbo.classList.toggle('is-ready', p.meter >= 1);
      }
    }
  }

  // ---------- render ----------
  function drawDecor(kind, x, y, sc, k, night) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(sc, sc);
    if (kind === 'tree') {
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.beginPath(); ctx.arc(5, 6, 20, 0, 7); ctx.fill();
      ctx.fillStyle = '#2f8a3a';
      ctx.beginPath(); ctx.arc(0, 0, 20, 0, 7); ctx.fill();
      ctx.fillStyle = '#45a84c';
      ctx.beginPath(); ctx.arc(-5, -5, 12, 0, 7); ctx.fill();
      if (hash(k * 9.1) < 0.3) {
        ctx.fillStyle = '#e5383b';
        [[6, -8], [-8, 6], [8, 8]].forEach(([a, b]) => { ctx.beginPath(); ctx.arc(a, b, 2.6, 0, 7); ctx.fill(); });
      }
    } else if (kind === 'cactus') {
      if (hash(k * 5.3) < 0.35) {
        ctx.fillStyle = '#c9a065';
        ctx.beginPath(); ctx.ellipse(0, 0, 16, 11, 0.4, 0, 7); ctx.fill();
        ctx.fillStyle = '#dbb57a';
        ctx.beginPath(); ctx.ellipse(-4, -3, 8, 5, 0.4, 0, 7); ctx.fill();
      } else {
        ctx.fillStyle = 'rgba(0,0,0,0.15)';
        ctx.beginPath(); ctx.ellipse(6, 22, 14, 5, 0, 0, 7); ctx.fill();
        ctx.fillStyle = '#3f9b52';
        rr(ctx, -6, -22, 12, 44, 6); ctx.fill();
        rr(ctx, -18, -10, 8, 18, 4); ctx.fill();
        rr(ctx, 10, -16, 8, 16, 4); ctx.fill();
        ctx.fillRect(-14, 2, 10, 6); ctx.fillRect(4, -4, 10, 6);
        ctx.fillStyle = '#5cb86c';
        ctx.fillRect(-2, -18, 3, 36);
      }
    } else if (kind === 'building') {
      const w = 46 + hash(k * 2.2) * 26;
      const h = 46 + hash(k * 3.7) * 30;
      ctx.fillStyle = '#161b28';
      ctx.fillRect(-w / 2 + 5, -h / 2 + 6, w, h);
      ctx.fillStyle = ['#384157', '#41395a', '#2f4a57'][Math.floor(hash(k) * 3)];
      ctx.fillRect(-w / 2, -h / 2, w, h);
      for (let yy = -h / 2 + 6; yy < h / 2 - 6; yy += 11) {
        for (let xx = -w / 2 + 6; xx < w / 2 - 6; xx += 11) {
          ctx.fillStyle = hash(k * 31 + xx * 7 + yy * 13) < 0.55 ? '#ffd86b' : '#232a3c';
          ctx.fillRect(xx, yy, 6, 6);
        }
      }
    } else if (kind === 'pine') {
      ctx.fillStyle = 'rgba(40,60,90,0.15)';
      ctx.beginPath(); ctx.arc(5, 6, 19, 0, 7); ctx.fill();
      ctx.fillStyle = '#2c6e4f';
      ctx.beginPath();
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const r = i % 2 ? 12 : 20;
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(-3, -3, 8, 0, 7); ctx.fill();
    }
    ctx.restore();
  }

  function drawSign(x, y, sc, dir) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(sc, sc);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.ellipse(4, 18, 10, 4, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#7a7f88';
    ctx.fillRect(-1.5, 0, 3, 18);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = '#ffc93c';
    ctx.strokeStyle = '#1b2130';
    ctx.lineWidth = 2;
    rr(ctx, -12, -12, 24, 24, 3);
    ctx.fill(); ctx.stroke();
    ctx.rotate(-Math.PI / 4);
    ctx.strokeStyle = '#1b2130';
    ctx.lineWidth = 3.4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(-dir * 3, 7);
    ctx.quadraticCurveTo(-dir * 3, -5, dir * 5, -5);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(dir * 1, -9); ctx.lineTo(dir * 6, -5); ctx.lineTo(dir * 1, -1);
    ctx.stroke();
    ctx.restore();
  }

  function render(dt) {
    const tr = s.track;
    const p = s.p;
    const sp = Math.min(1, p.speed / VMAX);
    const baseScale = Math.min(W / 330, H / 560);
    const zoomTarget = 1 - 0.14 * sp - (p.turbo > 0 ? 0.06 : 0);
    s.zoom += (zoomTarget - s.zoom) * Math.min(1, dt * 2);
    const sc = baseScale * s.zoom;
    const carSY = H * 0.6;
    const camTarget = cx(tr, p.d) + (p.laneX - 1) * LANE_W * 0.55;
    s.cam.x += (camTarget - s.cam.x) * Math.min(1, dt * 6);
    let shakeX = 0;
    let shakeY = 0;
    if (p.turbo > 0 || p.skidT > 0) { shakeX = (Math.random() - 0.5) * 3; shakeY = (Math.random() - 0.5) * 3; }
    const toSX = (wx) => W / 2 + (wx - s.cam.x) * sc + shakeX;
    const toSY = (d) => carSY - (d - p.d) * sc + shakeY;
    const dTop = p.d + carSY / sc + 60;
    const dBot = p.d - (H - carSY) / sc - 60;

    // ground with soft bands
    ctx.fillStyle = tr.ground;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = tr.ground2;
    for (let k = Math.floor(dBot / 240); k <= Math.floor(dTop / 240); k++) {
      if (k % 2 === 0) continue;
      const y0 = toSY((k + 1) * 240);
      ctx.fillRect(0, y0, W, 240 * sc);
    }

    // road body
    const step = 10;
    const pts = [];
    for (let d = dBot - step; d <= dTop + step; d += step) pts.push([d, cx(tr, d)]);
    const half = ROAD_W / 2;
    const roadPoly = (inner, outer, color) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      for (const [d, x] of pts) ctx.lineTo(toSX(x + inner), toSY(d));
      for (let i = pts.length - 1; i >= 0; i--) ctx.lineTo(toSX(pts[i][1] + outer), toSY(pts[i][0]));
      ctx.closePath();
      ctx.fill();
    };
    roadPoly(-half - CURB, half + CURB, '#fbfaf3');
    roadPoly(-half, half, tr.road);

    const quad = (d0, d1, a, b, color) => {
      const x0 = cx(tr, d0);
      const x1 = cx(tr, d1);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(toSX(x0 + a), toSY(d0));
      ctx.lineTo(toSX(x0 + b), toSY(d0));
      ctx.lineTo(toSX(x1 + b), toSY(d1));
      ctx.lineTo(toSX(x1 + a), toSY(d1));
      ctx.closePath();
      ctx.fill();
    };
    // curb stripes
    for (let k = Math.floor(dBot / 36); k <= Math.ceil(dTop / 36); k++) {
      if (k % 2) continue;
      quad(k * 36, k * 36 + 18, -half - CURB, -half, tr.edge);
      quad(k * 36, k * 36 + 18, half, half + CURB, tr.edge);
    }
    // lane dashes
    const dash = tr.night ? 'rgba(255,230,140,0.75)' : 'rgba(251,250,243,0.8)';
    for (let k = Math.floor(dBot / 64); k <= Math.ceil(dTop / 64); k++) {
      quad(k * 64, k * 64 + 32, -LANE_W / 2 - 1.5, -LANE_W / 2 + 1.5, dash);
      quad(k * 64, k * 64 + 32, LANE_W / 2 - 1.5, LANE_W / 2 + 1.5, dash);
    }
    // start / lap lines
    for (let L = 0; L <= LAPS; L++) {
      const dL = L * LAP;
      if (dL < dBot - 40 || dL > dTop + 40) continue;
      const cells = 12;
      const cw = ROAD_W / cells;
      for (let row = 0; row < 2; row++) {
        for (let c = 0; c < cells; c++) {
          quad(dL + row * cw, dL + (row + 1) * cw, -half + c * cw, -half + (c + 1) * cw, (c + row) % 2 ? '#1b2130' : '#fbfaf3');
        }
      }
    }

    // items on the road
    for (const it of s.items) {
      if (it.d < dBot - 60 || it.d > dTop + 60) continue;
      const wx = cx(tr, it.d) + (it.lane - 1) * LANE_W;
      const x = toSX(wx);
      const y = toSY(it.d);
      if (it.k === 'pad') {
        if (it.hit && it.t > 0.6) continue;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(Math.atan(slope(tr, it.d)));
        ctx.scale(sc, sc);
        ctx.fillStyle = '#3a2a6b';
        rr(ctx, -24, -26, 48, 52, 8); ctx.fill();
        const glow = 0.6 + 0.4 * Math.sin(s.t * 8);
        ctx.fillStyle = `rgba(255,210,63,${glow})`;
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.moveTo(-16, 14 - i * 14); ctx.lineTo(0, 2 - i * 14); ctx.lineTo(16, 14 - i * 14);
          ctx.lineTo(16, 20 - i * 14); ctx.lineTo(0, 8 - i * 14); ctx.lineTo(-16, 20 - i * 14);
          ctx.closePath(); ctx.fill();
        }
        ctx.restore();
      } else if (it.k === 'cone') {
        let ox = 0, oy = 0, rot = 0, alpha = 1;
        if (it.hit) {
          ox = it.t * 160 * (it.lane === 0 ? -1 : 1);
          oy = -it.t * 120;
          rot = it.t * 12;
          alpha = Math.max(0, 1 - it.t * 1.4);
          if (alpha <= 0) continue;
        }
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(x + ox * sc, y + oy * sc);
        ctx.rotate(rot);
        ctx.scale(sc, sc);
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.beginPath(); ctx.arc(3, 4, 13, 0, 7); ctx.fill();
        ctx.fillStyle = '#ff7a1a';
        rr(ctx, -13, -13, 26, 26, 4); ctx.fill();
        ctx.fillStyle = '#ff9a3c';
        ctx.beginPath(); ctx.arc(0, 0, 9, 0, 7); ctx.fill();
        ctx.fillStyle = '#fbfaf3';
        ctx.beginPath(); ctx.arc(0, 0, 6, 0, 7); ctx.fill();
        ctx.fillStyle = '#ff7a1a';
        ctx.beginPath(); ctx.arc(0, 0, 3, 0, 7); ctx.fill();
        ctx.restore();
      } else if (it.k === 'star') {
        if (it.hit) continue;
        drawStar(ctx, x, y, 13 * sc, s.t * 2 + it.d, '#ffd23f');
      }
    }

    // signs and scenery
    for (let L = 0; L <= LAPS; L++) {
      for (const sg of s.signs) {
        const d = sg.d + L * LAP;
        if (d < dBot || d > dTop) continue;
        const side = sg.dir > 0 ? -1 : 1;
        drawSign(toSX(cx(tr, d) + side * (half + CURB + 22)), toSY(d), sc, sg.dir);
      }
    }
    const SPACING = 120;
    for (let k = Math.floor(dBot / SPACING) - 1; k <= Math.ceil(dTop / SPACING) + 1; k++) {
      if (hash(k * 7.7 + 1) < 0.2) continue;
      const d = k * SPACING + hash(k * 1.3) * 50;
      const side = hash(k + 0.5) < 0.5 ? -1 : 1;
      const lateral = half + CURB + 46 + hash(k * 3.1) * 110;
      drawDecor(tr.decor, toSX(cx(tr, d) + side * lateral), toSY(d), sc, k, tr.night);
      if (hash(k * 4.4) < 0.45) {
        const lat2 = lateral + 90 + hash(k * 6.6) * 80;
        drawDecor(tr.decor, toSX(cx(tr, d + 50) - side * lat2 * 0.2 + side * lat2), toSY(d + 50), sc, k + 1000, tr.night);
      }
      if (tr.night && k % 3 === 0) {
        const lx = toSX(cx(tr, d) + side * (half + CURB + 14));
        const ly = toSY(d);
        const g = ctx.createRadialGradient(lx, ly, 0, lx, ly, 60 * sc);
        g.addColorStop(0, 'rgba(255,224,140,0.35)');
        g.addColorStop(1, 'rgba(255,224,140,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(lx, ly, 60 * sc, 0, 7); ctx.fill();
        ctx.fillStyle = '#fff1b8';
        ctx.beginPath(); ctx.arc(lx, ly, 3.5 * sc, 0, 7); ctx.fill();
      }
    }

    if (tr.night) {
      ctx.fillStyle = 'rgba(8,12,34,0.32)';
      ctx.fillRect(0, 0, W, H);
    }

    // particles
    for (const pt of s.particles) {
      const k = pt.t / pt.life;
      ctx.fillStyle = pt.color + (1 - k) * 0.7 + ')';
      ctx.beginPath();
      ctx.arc(toSX(pt.x), toSY(pt.d), pt.r * (1 + k) * sc, 0, 7);
      ctx.fill();
    }

    // cars
    const carScale = sc * 0.92;
    const all = s.rivals.map((r) => ({ r, d: r.d })).concat([{ r: null, d: p.d }]);
    all.sort((a, b) => b.d - a.d);
    for (const it of all) {
      if (it.d < dBot - 60 || it.d > dTop + 60) continue;
      if (it.r) {
        const r = it.r;
        const ang = Math.atan(slope(tr, r.d)) + (r.lane - r.laneX) * 0.35;
        drawCar(ctx, r.car, toSX(cx(tr, r.d) + (r.laneX - 1) * LANE_W), toSY(r.d), carScale, { angle: ang, lights: tr.night });
      } else {
        let ang = Math.atan(slope(tr, p.d)) + (p.lane - p.laneX) * 0.35;
        if (p.wobble > 0) ang += Math.sin(s.t * 26) * 0.45 * Math.min(1, p.wobble);
        drawCar(ctx, save.car, toSX(playerX()), toSY(p.d), carScale, {
          angle: ang, lights: tr.night, flame: p.turbo > 0, name: save.name,
        });
      }
    }

    // turbo speed lines
    if (p.turbo > 0) {
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 10; i++) {
        const x = Math.random() * W;
        const y = Math.random() * H;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 40 + Math.random() * 60); ctx.stroke();
      }
    }
  }

  function loop(t) {
    if (!s) return;
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, Math.max(0, (t - lastT) / 1000));
    lastT = t;
    if (!s.paused) update(dt);
    if (s) render(s.paused ? 0 : dt);
  }

  return { start, stop, resize, gasDown, gasUp, setKeyGas, steer, turbo, pause, isRunning };
})();
