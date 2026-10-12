// Screens and flow: title → garage → (track) → race → finish → (new unlock) → pit stop
// → back to the garage, until the set of races is done and the car goes to bed.

const $ = (id) => document.getElementById(id);
let currentScreen = '';
let garageTab = 'body';
let pendingUnlocks = [];

// ---------- screens ----------
function show(id) {
  document.querySelectorAll('.screen').forEach((el) => (el.hidden = el.id !== id));
  currentScreen = id;
  Anim.set(null);
}

// One animation loop for the small decorative canvases.
const Anim = (() => {
  let fn = null;
  let raf = 0;
  let t0 = 0;
  function frame(t) {
    if (!fn) return;
    raf = requestAnimationFrame(frame);
    fn((t - t0) / 1000);
  }
  return {
    set(f) {
      cancelAnimationFrame(raf);
      fn = f;
      if (f) { t0 = performance.now(); raf = requestAnimationFrame(frame); }
    },
  };
})();

function flagsHtml() {
  const total = save.settings.perSession;
  const done = Math.min(total, save.session.count);
  let html = '';
  for (let i = 0; i < total; i++) html += `<span class="flag${i < done ? ' is-done' : ''}"></span>`;
  return html;
}

function renderFlags() {
  const label = `${racesLeft()} race${racesLeft() === 1 ? '' : 's'} left today`;
  ['flagsTitle', 'flagsGarage'].forEach((id) => {
    $(id).innerHTML = flagsHtml();
    $(id).setAttribute('aria-label', label);
  });
}

function renderShelf() {
  const counts = [0, 0, 0, 0, 0];
  save.trophies.forEach((t) => counts[t.place]++);
  if (!save.trophies.length) {
    $('shelf').innerHTML = '<span class="shelf-empty">Win trophies on the track!</span>';
    return;
  }
  $('shelf').innerHTML = [1, 2, 3, 4]
    .filter((p) => counts[p])
    .map((p) => `<span class="shelf-item" data-place="${p}"><i></i>×${counts[p]}</span>`)
    .join('');
}

// ---------- title ----------
function showTitle() {
  show('scr-title');
  renderShelf();
  renderFlags();
  const cv = $('titleCar');
  Anim.set((t) => {
    const { ctx, w, h } = fitCanvas(cv);
    ctx.clearRect(0, 0, w, h);
    const sc = Math.min(w / 120, h / 90);
    const bob = Math.sin(t * 9) * 0.6;
    drawCar(ctx, save.car, w / 2, h / 2 + bob, sc, { angle: Math.PI / 2, name: save.name });
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    for (let i = 0; i < 3; i++) {
      const x = w / 2 - 40 * sc - ((t * 120 + i * 30) % 90);
      ctx.fillRect(x, h / 2 - 12 * sc + i * 12 * sc, 18, 3);
    }
  });
}

// ---------- garage ----------
function showGarage() {
  if (isSleeping()) return showSleep(false);
  show('scr-garage');
  $('garageName').textContent = `${save.name}'S CAR`;
  renderFlags();
  renderTabs();
  renderOptions();
  const cv = $('previewCar');
  Anim.set((t) => {
    const { ctx, w, h } = fitCanvas(cv);
    ctx.clearRect(0, 0, w, h);
    const g = ctx.createRadialGradient(w / 2, h * 0.55, 10, w / 2, h * 0.55, w * 0.5);
    g.addColorStop(0, 'rgba(255,240,200,0.35)');
    g.addColorStop(1, 'rgba(255,240,200,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    const sc = Math.min(w / 110, h / 88);
    drawCar(ctx, save.car, w / 2, h / 2 + Math.sin(t * 2) * 2, sc, { angle: Math.PI / 2 + Math.sin(t * 0.8) * 0.12, name: save.name });
  });
}

function renderTabs() {
  document.querySelectorAll('.tab').forEach((b) => {
    const on = b.dataset.tab === garageTab;
    b.classList.toggle('is-on', on);
    b.setAttribute('aria-selected', on);
  });
}

function lockBadge(item) {
  const left = item.at - save.racesDone;
  return `<span class="lock">🔒<b>${left}</b></span>`;
}

function renderOptions() {
  const box = $('options');
  box.dataset.tab = garageTab;
  if (garageTab === 'number') {
    box.innerHTML = `
      <div class="num-pick">
        <button type="button" class="num-btn" data-num="-1" aria-label="Smaller number">−</button>
        <output class="num-val">${save.car.number}</output>
        <button type="button" class="num-btn" data-num="1" aria-label="Bigger number">+</button>
      </div>`;
    return;
  }
  const list = garageTab === 'body' ? BODIES : garageTab === 'color' ? COLORS : STICKERS;
  const key = garageTab === 'color' ? 'hex' : 'id';
  const field = garageTab === 'body' ? 'body' : garageTab === 'color' ? 'color' : 'sticker';
  box.innerHTML = list
    .map((item, i) => {
      const open = unlocked(item);
      const sel = save.car[field] === item[key];
      const inner = garageTab === 'color' ? `<span class="swatch" style="background:${item.hex}"></span>` : `<canvas data-i="${i}"></canvas>`;
      const label = garageTab === 'body' ? `<span class="tile-label">${item.name}</span>` : '';
      return `<button type="button" class="tile${sel ? ' is-on' : ''}${open ? '' : ' is-locked'}" data-i="${i}" aria-pressed="${sel}" aria-label="${item.name || item.id}${open ? '' : ' (locked)'}">${inner}${label}${open ? '' : lockBadge(item)}</button>`;
    })
    .join('');
  box.querySelectorAll('canvas').forEach((cv) => {
    const item = list[Number(cv.dataset.i)];
    const { ctx, w, h } = fitCanvas(cv);
    ctx.clearRect(0, 0, w, h);
    if (garageTab === 'body') {
      drawCar(ctx, { ...save.car, body: item.id }, w / 2, h / 2, Math.min(w / 64, h / 80), { angle: 0 });
    } else {
      drawSticker(ctx, item.id, w / 2, h / 2, Math.min(w, h) * 0.36);
    }
  });
}

function pickOption(i) {
  const list = garageTab === 'body' ? BODIES : garageTab === 'color' ? COLORS : STICKERS;
  const item = list[i];
  if (!item) return;
  if (!unlocked(item)) {
    const left = item.at - save.racesDone;
    Sound.boing();
    Sound.say(`Finish ${left} more race${left === 1 ? '' : 's'} to unlock it!`);
    return;
  }
  if (garageTab === 'body') save.car.body = item.id;
  if (garageTab === 'color') save.car.color = item.hex;
  if (garageTab === 'sticker') save.car.sticker = item.id;
  persist();
  Sound.tap();
  renderOptions();
}

// ---------- tracks ----------
function goRace() {
  const open = TRACKS.filter(unlocked);
  if (open.length < 2) return startRace(open[0].id);
  show('scr-tracks');
  $('trackList').innerHTML = TRACKS.map((t) => {
    const ok = unlocked(t);
    return `<button type="button" class="track-card${ok ? '' : ' is-locked'}" data-track="${t.id}" style="--g:${t.ground};--r:${t.road};--e:${t.edge}">
      <span class="track-art"><i>${t.icon}</i></span>
      <span class="track-name">${t.name}</span>${ok ? '' : lockBadge(t)}</button>`;
  }).join('');
  Sound.say('Pick a track!');
}

// ---------- race ----------
function startRace(trackId) {
  show('scr-race');
  Sound.unlock();
  requestAnimationFrame(() => Race.start(trackId, onRaceDone));
}

function onRaceDone(result) {
  const before = save.racesDone;
  save.racesDone++;
  save.session.count++;
  save.trophies.push({ track: result.track, place: result.place, t: Date.now() });
  if (save.trophies.length > 300) save.trophies = save.trophies.slice(-300);
  persist();
  pendingUnlocks = UNLOCKS.filter((u) => u.at > before && u.at <= save.racesDone);
  showFinish(result.place);
}

function showFinish(place) {
  show('scr-finish');
  const scr = $('scr-finish');
  scr.dataset.place = place;
  $('finishPlace').textContent = PLACE_WORD[place] + '!';
  $('trophyNum').textContent = place;
  const msgs = {
    1: [`You won, ${save.name}!`, `You won! First place! Great driving, ${save.name}!`],
    2: ['Second place!', 'Second place! Great driving!'],
    3: ['Third place!', 'Third place! Nice racing!'],
    4: ['You finished!', 'You finished the race! Great job!'],
  };
  $('finishMsg').textContent = msgs[place][0];
  setTimeout(() => Sound.say(msgs[place][1]), 300);
  confetti();
  const cv = $('finishCar');
  Anim.set((t) => {
    const { ctx, w, h } = fitCanvas(cv);
    ctx.clearRect(0, 0, w, h);
    const sc = Math.min(w / 110, h / 70);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath(); ctx.ellipse(w / 2, h * 0.8, 46 * sc, 8 * sc, 0, 0, 7); ctx.fill();
    drawCar(ctx, save.car, w / 2, h / 2 - Math.abs(Math.sin(t * 5)) * 6, sc, { angle: Math.PI / 2, name: save.name });
  });
}

function confetti() {
  const box = $('confetti');
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { box.innerHTML = ''; return; }
  const cols = ['#e5383b', '#ffc93c', '#1f6feb', '#2fbf71', '#ff5fa2', '#fbfaf3'];
  let html = '';
  for (let i = 0; i < 36; i++) {
    html += `<i style="left:${Math.random() * 100}%;background:${cols[i % cols.length]};animation-delay:${Math.random() * 1.2}s;animation-duration:${2 + Math.random() * 1.5}s;transform:rotate(${Math.random() * 360}deg)"></i>`;
  }
  box.innerHTML = html;
}

function afterFinish() {
  if (pendingUnlocks.length) return showUnlock(pendingUnlocks.shift());
  showPit();
}

function showUnlock(u) {
  show('scr-unlock');
  $('unlockIcon').textContent = u.icon;
  $('unlockTitle').textContent = u.title;
  $('unlockText').textContent = u.text;
  Sound.chime();
  setTimeout(() => Sound.say(u.say), 400);
}

// ---------- pit ----------
function showPit() {
  show('scr-pit');
  requestAnimationFrame(() => Pit.start(afterPit));
}

function afterPit() {
  if (save.session.count >= save.settings.perSession) {
    startBedtime();
    showSleep(true);
  } else {
    Sound.say(`${racesLeft()} more race${racesLeft() === 1 ? '' : 's'} today!`);
    showGarage();
  }
}

// ---------- bedtime ----------
let sleepTimer = 0;
function showSleep(animate) {
  show('scr-sleep');
  const door = $('sleepDoor');
  const resting = isSleeping();
  const tomorrow = save.settings.rest === 'tomorrow';
  $('sleepTitle').textContent = 'NIGHT NIGHT, CAR';
  $('sleepText').textContent = !resting
    ? 'All rested! Ready for more?'
    : tomorrow ? `See you tomorrow, ${save.name}!` : `Your car is resting. Back in a little while, ${save.name}!`;
  $('btnWake').hidden = resting;
  door.classList.toggle('is-closed', !animate && resting);
  if (animate) {
    door.classList.remove('is-closed');
    Sound.say(`Great racing today, ${save.name}! Your car is going to sleep in the garage.`);
    setTimeout(() => door.classList.add('is-closed'), 1600);
  }
  const cv = $('sleepCar');
  let t0 = null;
  Anim.set((t) => {
    if (t0 === null) t0 = t;
    const k = animate ? Math.min(1, (t - t0) / 1.4) : 1;
    const { ctx, w, h } = fitCanvas(cv);
    ctx.clearRect(0, 0, w, h);
    const sc = Math.min(w / 60, h / 90);
    const y = h + 50 * sc - k * (h / 2 + 50 * sc);
    drawCar(ctx, save.car, w / 2, y, sc, { angle: 0 });
  });
  clearInterval(sleepTimer);
  sleepTimer = setInterval(() => {
    if (currentScreen !== 'scr-sleep') return clearInterval(sleepTimer);
    if (!isSleeping() && $('btnWake').hidden) {
      $('btnWake').hidden = false;
      $('sleepText').textContent = 'All rested! Ready for more?';
      door.classList.remove('is-closed');
    }
  }, 15000);
}

// ---------- wiring ----------
function bindPress(el, down, up) {
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    try { el.setPointerCapture(e.pointerId); } catch (_) {}
    down(e);
  });
  const end = (e) => up && up(e);
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  el.addEventListener('lostpointercapture', end);
  el.addEventListener('contextmenu', (e) => e.preventDefault());
}

function init() {
  // Title
  $('btnStart').addEventListener('click', () => {
    Sound.unlock();
    Sound.tap();
    if (isSleeping()) return showSleep(false);
    Sound.say(`Hi ${save.name}! Build your car, then race!`);
    showGarage();
  });

  // Garage
  document.querySelectorAll('.tab').forEach((b) =>
    b.addEventListener('click', () => { garageTab = b.dataset.tab; Sound.tap(); renderTabs(); renderOptions(); }),
  );
  $('options').addEventListener('click', (e) => {
    const num = e.target.closest('[data-num]');
    if (num) {
      save.car.number = (save.car.number + Number(num.dataset.num) + 100) % 100;
      persist();
      Sound.tap();
      renderOptions();
      return;
    }
    const tile = e.target.closest('.tile');
    if (tile) pickOption(Number(tile.dataset.i));
  });
  $('btnRace').addEventListener('click', () => { Sound.unlock(); Sound.tap(); goRace(); });

  // Tracks
  $('trackList').addEventListener('click', (e) => {
    const card = e.target.closest('.track-card');
    if (!card) return;
    const t = TRACKS.find((x) => x.id === card.dataset.track);
    if (!unlocked(t)) {
      const left = t.at - save.racesDone;
      Sound.boing();
      Sound.say(`Finish ${left} more race${left === 1 ? '' : 's'} to unlock ${t.name}!`);
      return;
    }
    Sound.tap();
    startRace(t.id);
  });
  $('btnTracksBack').addEventListener('click', () => { Sound.tap(); showGarage(); });

  // Race controls
  bindPress($('btnGas'), (e) => Race.gasDown(e.pointerId), (e) => Race.gasUp(e.pointerId));
  bindPress($('raceCanvas'), (e) => Race.gasDown(e.pointerId), (e) => Race.gasUp(e.pointerId));
  bindPress($('btnLeft'), () => Race.steer(-1));
  bindPress($('btnRight'), () => Race.steer(1));
  bindPress($('btnTurbo'), () => Race.turbo());
  $('btnPause').addEventListener('click', () => Race.pause(true));
  $('btnResume').addEventListener('click', () => Race.pause(false));
  $('btnQuit').addEventListener('click', () => { Race.stop(); showGarage(); });

  // Finish, unlock, pit
  $('btnToPit').addEventListener('click', () => { Sound.tap(); afterFinish(); });
  $('btnUnlockOk').addEventListener('click', () => { Sound.tap(); afterFinish(); });
  bindPress($('btnFuel'), () => Pit.fuelOn(true), () => Pit.fuelOn(false));
  const pc = $('pitCanvas');
  pc.addEventListener('pointerdown', (e) => { e.preventDefault(); try { pc.setPointerCapture(e.pointerId); } catch (_) {} Pit.pointerDown(e); });
  pc.addEventListener('pointermove', (e) => Pit.pointerMove(e));
  ['pointerup', 'pointercancel'].forEach((ev) => pc.addEventListener(ev, () => Pit.pointerUp()));
  $('btnPitDone').addEventListener('click', () => { Sound.tap(); Pit.finish(); });

  // Bedtime
  $('btnWake').addEventListener('click', () => {
    Sound.unlock();
    Sound.tap();
    save.session = { count: 0, sleepUntil: 0 };
    persist();
    showGarage();
  });

  // Keyboard (for testing on a computer)
  window.addEventListener('keydown', (e) => {
    if (currentScreen !== 'scr-race' || e.repeat) return;
    if (e.key === ' ' || e.key === 'ArrowUp') { Race.setKeyGas(true); e.preventDefault(); }
    if (e.key === 'ArrowLeft') Race.steer(-1);
    if (e.key === 'ArrowRight') Race.steer(1);
    if (e.key === 't' || e.key === 'Shift') Race.turbo();
  });
  window.addEventListener('keyup', (e) => {
    if (e.key === ' ' || e.key === 'ArrowUp') Race.setKeyGas(false);
  });

  window.addEventListener('resize', () => { Race.resize(); Pit.resize(); if (currentScreen === 'scr-garage') renderOptions(); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && Race.isRunning()) Race.pause(true);
  });
  // Stop double-tap zoom and long-press menus in the game area.
  document.addEventListener('dblclick', (e) => e.preventDefault());
  document.addEventListener('gesturestart', (e) => e.preventDefault());

  Parents.init(() => {
    renderFlags();
    renderShelf();
    if (currentScreen === 'scr-garage') { $('garageName').textContent = `${save.name}'S CAR`; renderOptions(); }
    if (currentScreen === 'scr-sleep' && !isSleeping()) {
      $('btnWake').hidden = false;
      $('sleepText').textContent = 'All rested! Ready for more?';
      $('sleepDoor').classList.remove('is-closed');
    }
  });

  if (isSleeping()) showSleep(false);
  else showTitle();

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => {}).catch(() => {});
init();
