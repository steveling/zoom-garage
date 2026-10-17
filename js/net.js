// Friend races between two phones. Both phones connect to a small "race room" on this site's own
// Cloudflare Worker (worker.js, /room/<code>), which passes messages between them. Going through
// the server works on any network (home Wi-Fi, cellular, guest Wi-Fi), unlike a direct
// phone-to-phone link. Only names, car looks and race positions are sent, and nothing is stored.

const Net = (() => {
  const CONNECT_MS = 10000;
  const PING_MS = 20000;

  let ws = null;
  let role = null; // 'host' | 'guest'
  let paired = false;
  let handlers = {};
  let timer = 0;
  let pinger = 0;
  let gen = 0; // ignores events from sockets we already gave up on

  function emit(k, data) {
    if (handlers[k]) handlers[k](data);
  }

  function makeCode() {
    const a = new Uint32Array(1);
    if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(a);
    else a[0] = Math.floor(Math.random() * 1e9);
    return String(1000 + (a[0] % 9000));
  }

  function roomUrl(code, r) {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${location.host}/room/${code}?role=${r}`;
  }

  function stopTimers() {
    clearTimeout(timer);
    clearInterval(pinger);
  }

  // Opens one socket. `on` gets server notes ({k:'ready'|'paired'|'taken'|'nohost'|'full'|'left'}).
  function open(code, r, on) {
    const my = ++gen;
    let sock;
    try {
      sock = new WebSocket(roomUrl(code, r));
    } catch (_) {
      setTimeout(() => my === gen && emit('fail', 'net'), 0);
      return;
    }
    ws = sock;
    timer = setTimeout(() => {
      if (my !== gen || paired || (r === 'host' && sock.readyState === WebSocket.OPEN)) return;
      drop();
      emit('fail', r === 'guest' ? 'notfound' : 'net');
    }, CONNECT_MS);
    sock.onopen = () => {
      if (my !== gen) return;
      clearInterval(pinger);
      pinger = setInterval(() => { try { sock.send('ping'); } catch (_) {} }, PING_MS);
    };
    sock.onmessage = (ev) => {
      if (my !== gen || typeof ev.data !== 'string' || ev.data === 'pong') return;
      let m;
      try { m = JSON.parse(ev.data); } catch (_) { return; }
      if (!m || typeof m.k !== 'string') return;
      on(m);
    };
    sock.onclose = () => {
      if (my !== gen) return;
      const was = paired;
      drop();
      if (was) emit('left');
      else emit('fail', 'net');
    };
    sock.onerror = () => {};
  }

  // Server notes common to both sides; everything else is the friend's message.
  function common(m) {
    if (m.k === 'paired') {
      paired = true;
      clearTimeout(timer);
      emit('open');
    } else if (m.k === 'left') {
      if (!paired) return;
      paired = false;
      emit('left');
    } else {
      emit('msg', m);
    }
  }

  async function host(onCode) {
    close();
    role = 'host';
    let tries = 0;
    const attempt = () => {
      const code = makeCode();
      open(code, 'host', (m) => {
        if (m.k === 'ready') { clearTimeout(timer); onCode(code); }
        else if (m.k === 'taken') {
          if (++tries > 8) { drop(); emit('fail', 'net'); return; }
          drop(true);
          attempt();
        } else common(m);
      });
    };
    attempt();
  }

  async function join(code) {
    close();
    role = 'guest';
    open(code, 'guest', (m) => {
      if (m.k === 'nohost') { drop(); emit('fail', 'notfound'); }
      else if (m.k === 'full') { drop(); emit('fail', 'full'); }
      else common(m);
    });
  }

  function send(obj) {
    try { if (ws && paired && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj)); } catch (_) {}
  }

  // Forget the current socket without telling anyone (keepRole: retrying as host).
  function drop(keepRole) {
    stopTimers();
    gen++;
    const s = ws;
    ws = null;
    paired = false;
    if (!keepRole) role = null;
    try { if (s) s.close(1000, 'bye'); } catch (_) {}
  }

  function close() {
    if (paired) send({ k: 'bye' });
    drop();
  }

  return {
    host, join, send, close,
    on(k, fn) { handlers[k] = fn; },
    get role() { return role; },
    get connected() { return paired && !!ws && ws.readyState === WebSocket.OPEN; },
    clearJoinTimer() { clearTimeout(timer); },
  };
})();
