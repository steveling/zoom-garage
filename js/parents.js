// Grown-up settings. Hold the small gear for 2 seconds, then answer a times-table question.

const Parents = (() => {
  const HOLD_MS = 2000;
  let holdTimer = 0;
  let holdStart = 0;
  let holdRaf = 0;
  let answer = 0;
  let entry = '';
  let resetArmed = 0;
  let onChange = () => {};
  const $ = (id) => document.getElementById(id);

  function init(changed) {
    onChange = changed;
    document.querySelectorAll('[data-gear]').forEach((btn) => {
      btn.addEventListener('pointerdown', (e) => { e.preventDefault(); beginHold(btn); });
      ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => btn.addEventListener(ev, () => endHold(btn)));
      btn.addEventListener('contextmenu', (e) => e.preventDefault());
      btn.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') openGate(); });
    });

    const keypad = $('keypad');
    keypad.innerHTML = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', 'OK']
      .map((k) => `<button type="button" data-k="${k}">${k}</button>`).join('');
    keypad.addEventListener('click', (e) => {
      const k = e.target.closest('button')?.dataset.k;
      if (!k) return;
      if (k === '⌫') entry = entry.slice(0, -1);
      else if (k === 'OK') return checkGate();
      else if (entry.length < 3) entry += k;
      $('gateEntry').textContent = entry;
    });
    $('gateCancel').addEventListener('click', closeGate);

    $('panelClose').addEventListener('click', closePanel);
    $('setName').addEventListener('input', (e) => {
      const v = e.target.value.toUpperCase().replace(/[^A-Z ]/g, '').slice(0, 10);
      e.target.value = v;
      save.name = v.trim() || 'DRIVER';
      persist();
      onChange();
    });
    $('perMinus').addEventListener('click', () => setPer(save.settings.perSession - 1));
    $('perPlus').addEventListener('click', () => setPer(save.settings.perSession + 1));
    $('setRest').addEventListener('change', (e) => {
      const v = e.target.value;
      save.settings.rest = v === 'tomorrow' ? 'tomorrow' : Number(v);
      persist();
    });
    $('setSound').addEventListener('change', (e) => {
      save.settings.sound = e.target.checked;
      persist();
      if (!e.target.checked) Sound.engineStop();
    });
    $('setVoice').addEventListener('change', (e) => {
      save.settings.voice = e.target.checked;
      persist();
      if (!e.target.checked && 'speechSynthesis' in window) speechSynthesis.cancel();
    });
    $('btnWakeNow').addEventListener('click', () => {
      save.session = { count: 0, sleepUntil: 0 };
      persist();
      status('The car is awake. New set of races ready.');
      onChange();
    });
    $('btnUnlockAll').addEventListener('click', () => {
      save.racesDone = Math.max(save.racesDone, 14);
      persist();
      status('Everything is unlocked.');
      onChange();
    });
    $('btnReset').addEventListener('click', () => {
      const btn = $('btnReset');
      if (Date.now() - resetArmed > 3000) {
        resetArmed = Date.now();
        btn.textContent = 'Tap again to erase all progress';
        setTimeout(() => (btn.textContent = 'Reset progress'), 3000);
        return;
      }
      const keep = { name: save.name, settings: save.settings };
      save = defaultSave();
      save.name = keep.name;
      save.settings = keep.settings;
      persist();
      resetArmed = 0;
      btn.textContent = 'Reset progress';
      status('Progress erased. Back to the first car.');
      onChange();
    });
  }

  function setPer(n) {
    save.settings.perSession = Math.max(1, Math.min(8, n));
    $('perVal').textContent = save.settings.perSession;
    persist();
    onChange();
  }

  function beginHold(btn) {
    holdStart = performance.now();
    btn.classList.add('is-holding');
    const tick = () => {
      const k = Math.min(1, (performance.now() - holdStart) / HOLD_MS);
      btn.style.setProperty('--p', k * 360 + 'deg');
      if (k < 1) holdRaf = requestAnimationFrame(tick);
    };
    holdRaf = requestAnimationFrame(tick);
    holdTimer = setTimeout(() => { endHold(btn); openGate(); }, HOLD_MS);
  }

  function endHold(btn) {
    clearTimeout(holdTimer);
    cancelAnimationFrame(holdRaf);
    btn.classList.remove('is-holding');
    btn.style.setProperty('--p', '0deg');
  }

  function openGate() {
    const a = 3 + Math.floor(Math.random() * 7);
    const b = 4 + Math.floor(Math.random() * 6);
    answer = a * b;
    entry = '';
    $('gateQ').textContent = `What is ${a} × ${b}?`;
    $('gateEntry').textContent = '';
    $('gateEntry').classList.remove('is-wrong');
    $('parentGate').hidden = false;
  }

  function closeGate() {
    $('parentGate').hidden = true;
  }

  function checkGate() {
    if (Number(entry) === answer) {
      closeGate();
      openPanel();
    } else {
      $('gateEntry').classList.add('is-wrong');
      setTimeout(closeGate, 700);
    }
  }

  function status(text) {
    $('panelStatus').textContent = text;
  }

  function openPanel() {
    $('setName').value = save.name;
    $('perVal').textContent = save.settings.perSession;
    $('setRest').value = String(save.settings.rest);
    $('setSound').checked = save.settings.sound;
    $('setVoice').checked = save.settings.voice;
    const sleeping = isSleeping();
    status(`Races finished: ${save.racesDone}. ` + (sleeping ? 'The car is resting right now.' : `${racesLeft()} race${racesLeft() === 1 ? '' : 's'} left before bedtime.`));
    $('parentPanel').hidden = false;
  }

  function closePanel() {
    $('parentPanel').hidden = true;
    onChange();
  }

  return { init };
})();
