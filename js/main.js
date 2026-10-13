// Screens and flow: title → garage → (track) → race → finish → (new unlock) → pit stop
// → back to the garage, until the set of races is done and the car goes to bed.

const $ = (id) => document.getElementById(id);
let currentScreen = '';
let garageTab = 'body';
let pendingUnlocks = [];
let afterUnlocks = 'pit'; // where to go once the unlock cards are done: 'pit' or 'garage'
let trackPickFor = 'solo'; // 'solo' or 'friend'
let friend = null; // { host, name, car, track, seed, feat, meReady, theyReady, gone }

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
  $('btnFriend').hidden = save.settings.friends === false;
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
function goRace(mode) {
  trackPickFor = mode === 'friend' ? 'friend' : 'solo';
  const open = TRACKS.filter(unlocked);
  if (open.length < 2) return trackPickFor === 'friend' ? hostWith(open[0].id) : startRace(open[0].id);
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
  afterUnlocks = 'pit';
  showFinish(result.place);
}

function showFinish(place, vsFriend) {
  show('scr-finish');
  $('btnToPit').textContent = vsFriend ? 'AGAIN!' : 'PIT STOP ▶';
  $('btnToPit').hidden = false;
  $('btnFinishGarage').hidden = !vsFriend;
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
  if (vsFriend) {
    msgs[1] = [`You beat ${friend.name}!`, `You won! You beat ${friend.name}!`];
    msgs[2] = [`${friend.name} won!`, `${friend.name} won! Great race!`];
  }
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
  if (afterUnlocks === 'garage') showGarage();
  else showPit();
}

// ---------- race a friend ----------
const cleanName = (v) => String(v == null ? '' : v).toUpperCase().replace(/[^A-Z ]/g, '').slice(0, 10).trim() || 'FRIEND';
function cleanCar(c) {
  c = c && typeof c === 'object' ? c : {};
  return {
    body: WHEELS[c.body] ? c.body : 'racer',
    color: /^#[0-9a-f]{6}$/i.test(c.color) ? c.color : '#1f6feb',
    number: Number.isInteger(c.number) && c.number >= 0 && c.number < 100 ? c.number : 7,
    sticker: STICKERS.some((x) => x.id === c.sticker) ? c.sticker : 'star',
  };
}

function friendPane(id, msg) {
  ['fChoose', 'fHost', 'fJoin', 'fFound'].forEach((p) => ($(p).hidden = p !== id));
  $('fMsg').textContent = msg || '';
}

function codeBoxes(code, len) {
  let html = '';
  for (let i = 0; i < len; i++) html += `<span>${code[i] || ''}</span>`;
  return html;
}

function showFriend(msg) {
  Net.close();
  friend = null;
  show('scr-friend');
  friendPane('fChoose', msg);
  if (!msg) Sound.say("Make a code, or type your friend's code!");
}

function wireNet() {
  Net.on('open', () => Net.send({ k: 'hello', v: 1, name: save.name, car: save.car }));
  Net.on('msg', onNetMsg);
  Net.on('left', onFriendLeft);
  Net.on('fail', (kind) => {
    if (currentScreen !== 'scr-friend') return;
    if (kind === 'notfound') {
      joinEntry = '';
      $('fEntry').innerHTML = codeBoxes('', 4);
      friendPane('fJoin', "Can't find that code. Try again!");
      Sound.say("I can't find that code. Try again!");
    } else {
      friendPane('fChoose', 'Racing a friend needs the internet.');
    }
  });
}

function hostWith(trackId) {
  show('scr-friend');
  friend = { host: true, track: trackId, name: 'FRIEND', car: null };
  friendPane('fHost');
  $('fCode').innerHTML = codeBoxes('', 4);
  wireNet();
  Net.host((code) => {
    $('fCode').innerHTML = codeBoxes(code, 4);
    Sound.say('Your code is ' + code.split('').join(' '));
  }).catch(() => friendPane('fChoose', 'Racing a friend needs the internet.'));
}

let joinEntry = '';
function showJoin() {
  joinEntry = '';
  friendPane('fJoin');
  $('fEntry').innerHTML = codeBoxes('', 4);
  Sound.say("Type your friend's code.");
}

function joinKey(k) {
  if (k === '⌫') joinEntry = joinEntry.slice(0, -1);
  else if (joinEntry.length < 4) joinEntry += k;
  Sound.tap();
  $('fEntry').innerHTML = codeBoxes(joinEntry, 4);
  if (joinEntry.length === 4) {
    friend = { host: false, track: 'sunny', name: 'FRIEND', car: null };
    $('fMsg').textContent = 'Looking for your friend…';
    wireNet();
    Net.join(joinEntry).catch(() => friendPane('fChoose', 'Racing a friend needs the internet.'));
  }
}

function newRound() {
  friend.seed = Math.floor(Math.random() * 100000);
  friend.feat = { turboPads: has('turboPads'), steer: has('steer'), turboBtn: has('turboBtn') };
  Net.send({ k: 'setup', track: friend.track, seed: friend.seed, feat: friend.feat, name: save.name, car: save.car });
}

function onNetMsg(m) {
  if (!friend) return;
  switch (m.k) {
    case 'hello':
      Net.clearJoinTimer();
      friend.name = cleanName(m.name);
      friend.car = cleanCar(m.car);
      if (friend.host) {
        newRound();
        showFound();
        setTimeout(() => {
          if (friend && Net.connected && currentScreen === 'scr-friend') {
            Net.send({ k: 'go' });
            startFriendRace();
          }
        }, 3200);
      }
      break;
    case 'setup':
      if (friend.host) break;
      if (m.name) friend.name = cleanName(m.name);
      if (m.car || !friend.car) friend.car = cleanCar(m.car);
      friend.track = TRACKS.some((t) => t.id === m.track) ? m.track : 'sunny';
      friend.seed = Number.isFinite(m.seed) ? m.seed : 1;
      friend.feat = {
        turboPads: !!(m.feat && m.feat.turboPads),
        steer: !!(m.feat && m.feat.steer),
        turboBtn: !!(m.feat && m.feat.turboBtn),
      };
      if (currentScreen === 'scr-friend') showFound();
      break;
    case 'go':
      if (!friend.host && friend.feat) startFriendRace();
      break;
    case 'st':
      Race.remoteState(m);
      break;
    case 'fin':
      Race.remoteFinish(m);
      break;
    case 'again':
      friend.theyReady = true;
      if (currentScreen === 'scr-finish') {
        if (friend.host && friend.meReady) againRace();
        else if (!friend.meReady) $('finishMsg').textContent = `${friend.name} wants to race again!`;
      }
      break;
    case 'bye':
      onFriendLeft();
      break;
  }
}

function showFound() {
  friendPane('fFound');
  $('fNameMe').textContent = save.name;
  $('fNameThem').textContent = friend.name;
  Sound.say(`${friend.name} is here! Get ready!`);
  Anim.set((t) => {
    [['fCarMe', save.car], ['fCarThem', friend.car]].forEach(([id, car], i) => {
      const { ctx, w, h } = fitCanvas($(id));
      ctx.clearRect(0, 0, w, h);
      drawCar(ctx, car, w / 2, h / 2 + Math.sin(t * 6 + i) * 2, Math.min(w / 56, h / 80), { angle: 0 });
    });
  });
}

function startFriendRace() {
  friend.meReady = false;
  friend.theyReady = false;
  show('scr-race');
  Sound.unlock();
  requestAnimationFrame(() =>
    Race.start(friend.track, onFriendRaceDone, {
      friend: { name: friend.name, car: friend.car },
      seed: friend.seed,
      feat: friend.feat,
      lane: friend.host ? 0 : 2,
      send: (o) => Net.send(o),
    }),
  );
}

function onFriendRaceDone(result) {
  // Friend races count toward unlocks and trophies, but not toward bedtime.
  const before = save.racesDone;
  save.racesDone++;
  save.trophies.push({ track: result.track, place: result.place, t: Date.now(), friend: true });
  if (save.trophies.length > 300) save.trophies = save.trophies.slice(-300);
  persist();
  pendingUnlocks.push(...UNLOCKS.filter((u) => u.at > before && u.at <= save.racesDone));
  showFinish(result.place, true);
  if (friend && friend.gone) friendGoneOnFinish();
}

function againRace() {
  newRound();
  Net.send({ k: 'go' });
  startFriendRace();
}

function askAgain() {
  if (!friend || friend.gone || !Net.connected) return friendGoneOnFinish();
  friend.meReady = true;
  Sound.tap();
  Net.send({ k: 'again' });
  if (friend.host && friend.theyReady) return againRace();
  $('finishMsg').textContent = friend.theyReady ? 'Here we go!' : `Waiting for ${friend.name}…`;
}

function friendGoneOnFinish() {
  $('btnToPit').hidden = true;
  $('finishMsg').textContent = `${friend ? friend.name : 'Your friend'} went home.`;
}

function onFriendLeft() {
  if (!friend || friend.gone) return;
  friend.gone = true;
  if (currentScreen === 'scr-race') Race.remoteLeft();
  else if (currentScreen === 'scr-finish') friendGoneOnFinish();
  else if (currentScreen === 'scr-friend') showFriend('Your friend left.');
}

function leaveFriend() {
  Net.close();
  friend = null;
  afterUnlocks = 'garage';
  afterFinish();
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
  $('btnRace').addEventListener('click', () => { Sound.unlock(); Sound.tap(); goRace('solo'); });
  $('btnFriend').addEventListener('click', () => { Sound.unlock(); Sound.tap(); showFriend(); });
  $('btnMakeCode').addEventListener('click', () => { Sound.tap(); goRace('friend'); });
  $('btnTypeCode').addEventListener('click', () => { Sound.tap(); showJoin(); });
  $('kidPad').innerHTML = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫']
    .map((k) => (k ? `<button type="button" data-k="${k}">${k}</button>` : '<span></span>')).join('');
  $('kidPad').addEventListener('click', (e) => {
    const k = e.target.closest('button')?.dataset.k;
    if (k && joinEntry.length < 4 || k === '⌫') joinKey(k);
  });
  $('btnFriendBack').addEventListener('click', () => { Sound.tap(); Net.close(); friend = null; showGarage(); });
  $('btnFinishGarage').addEventListener('click', () => { Sound.tap(); leaveFriend(); });

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
    if (trackPickFor === 'friend') hostWith(t.id);
    else startRace(t.id);
  });
  $('btnTracksBack').addEventListener('click', () => { Sound.tap(); trackPickFor === 'friend' ? showFriend() : showGarage(); });

  // Race controls
  bindPress($('btnGas'), (e) => Race.gasDown(e.pointerId), (e) => Race.gasUp(e.pointerId));
  bindPress($('raceCanvas'), (e) => Race.gasDown(e.pointerId), (e) => Race.gasUp(e.pointerId));
  // Steering reacts on touch-down (not on release) and shows a pressed state, since
  // :active is unreliable once the touch is captured.
  [['btnLeft', -1], ['btnRight', 1]].forEach(([id, dir]) => {
    const el = $(id);
    bindPress(el, () => { el.classList.add('is-down'); Race.steer(dir); }, () => el.classList.remove('is-down'));
  });
  bindPress($('btnTurbo'), () => Race.turbo());
  $('btnPause').addEventListener('click', () => Race.pause(true));
  $('btnResume').addEventListener('click', () => Race.pause(false));
  $('btnQuit').addEventListener('click', () => {
    Race.stop();
    if (friend) { Net.close(); friend = null; }
    showGarage();
  });

  // Finish, unlock, pit
  $('btnToPit').addEventListener('click', () => {
    if (friend) return askAgain();
    Sound.tap();
    afterFinish();
  });
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
