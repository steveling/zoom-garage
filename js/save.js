// Progress and settings, kept in this browser only (localStorage). Nothing leaves the phone.

const SAVE_KEY = 'zg:save';

function defaultSave() {
  return {
    v: 1,
    name: 'ANDY',
    car: { body: 'racer', color: '#e5383b', number: 5, sticker: 'bolt' },
    racesDone: 0,
    trophies: [], // { track, place, t }
    settings: { perSession: 3, rest: 60, sound: true, voice: true, friends: true },
    session: { count: 0, sleepUntil: 0 },
  };
}

function mergeSave(base, stored) {
  if (!stored || typeof stored !== 'object') return base;
  for (const k of Object.keys(base)) {
    const b = base[k];
    const s = stored[k];
    if (s === undefined) continue;
    if (b && typeof b === 'object' && !Array.isArray(b)) base[k] = mergeSave(b, s);
    else base[k] = s;
  }
  return base;
}

function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) return mergeSave(defaultSave(), JSON.parse(raw));
  } catch (e) {}
  return defaultSave();
}

let save = loadSave();

function persist() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch (e) {}
}

function has(feature) {
  return save.racesDone >= FEATURE_AT[feature];
}

function unlocked(item) {
  return save.racesDone >= item.at;
}

function isSleeping() {
  return save.session.sleepUntil > Date.now();
}

function startBedtime() {
  const rest = save.settings.rest;
  let until = 0;
  if (rest === 'tomorrow') {
    const t = new Date();
    t.setDate(t.getDate() + 1);
    t.setHours(6, 0, 0, 0);
    until = t.getTime();
  } else if (Number(rest) > 0) {
    until = Date.now() + Number(rest) * 60000;
  }
  save.session = { count: 0, sleepUntil: until };
  persist();
}

function racesLeft() {
  return Math.max(0, save.settings.perSession - save.session.count);
}
