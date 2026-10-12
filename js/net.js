// Friend races between two phones over PeerJS (WebRTC), the same way Capy Air visits work.
// One phone makes a 4-digit code, the other types it in. No server of our own: PeerJS's free
// broker only introduces the two phones, then race data goes phone to phone.

const Net = (() => {
  const PREFIX = 'zoomgarage-';
  const PEER_SRC = 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js';
  const OPTS = {
    debug: 0,
    config: {
      iceServers: [
        { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
        {
          urls: ['turn:eu-0.turn.peerjs.com:3478', 'turn:us-0.turn.peerjs.com:3478'],
          username: 'peerjs',
          credential: 'peerjsp',
        },
      ],
    },
  };

  let peer = null;
  let conn = null;
  let role = null; // 'host' | 'guest'
  let handlers = {};
  let joinTimer = 0;
  let loading = null;

  function loadPeer() {
    if (typeof window.Peer === 'function') return Promise.resolve();
    if (loading) return loading;
    loading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = PEER_SRC;
      s.async = true;
      s.onload = () => (typeof window.Peer === 'function' ? resolve() : reject(new Error('no peer')));
      s.onerror = () => { loading = null; s.remove(); reject(new Error('offline')); };
      document.head.appendChild(s);
    });
    return loading;
  }

  function emit(k, data) {
    if (handlers[k]) handlers[k](data);
  }

  function makeCode() {
    const a = new Uint32Array(1);
    (window.crypto || { getRandomValues: (x) => { x[0] = Math.random() * 1e9; return x; } }).getRandomValues(a);
    return String(1000 + (a[0] % 9000));
  }

  function wire(c) {
    conn = c;
    c.on('open', () => emit('open'));
    c.on('data', (d) => {
      if (d && typeof d === 'object' && typeof d.k === 'string') emit('msg', d);
    });
    c.on('close', () => { if (conn === c) { conn = null; emit('left'); } });
    c.on('error', () => {});
  }

  async function host(onCode) {
    close();
    role = 'host';
    await loadPeer();
    const tryCode = () => {
      const code = makeCode();
      peer = new window.Peer(PREFIX + code, OPTS);
      peer.on('open', () => onCode(code));
      peer.on('connection', (c) => {
        if (conn) { c.on('open', () => c.close()); return; }
        wire(c);
      });
      peer.on('error', (e) => {
        if (e && e.type === 'unavailable-id') {
          try { peer.destroy(); } catch (_) {}
          tryCode();
        } else if (!conn) {
          emit('fail', 'net');
        }
      });
    };
    tryCode();
  }

  async function join(code) {
    close();
    role = 'guest';
    await loadPeer();
    peer = new window.Peer(OPTS);
    joinTimer = setTimeout(() => { if (!conn || !conn.open) emit('fail', 'notfound'); }, 12000);
    peer.on('open', () => wire(peer.connect(PREFIX + code, { reliable: true })));
    peer.on('error', (e) => {
      clearTimeout(joinTimer);
      if (!conn || !conn.open) emit('fail', e && e.type === 'peer-unavailable' ? 'notfound' : 'net');
    });
  }

  function send(obj) {
    try { if (conn && conn.open) conn.send(obj); } catch (_) {}
  }

  function close() {
    clearTimeout(joinTimer);
    try { if (conn) { send({ k: 'bye' }); conn.close(); } } catch (_) {}
    try { if (peer) peer.destroy(); } catch (_) {}
    conn = null;
    peer = null;
    role = null;
  }

  return {
    host, join, send, close,
    on(k, fn) { handlers[k] = fn; },
    get role() { return role; },
    get connected() { return !!(conn && conn.open); },
    clearJoinTimer() { clearTimeout(joinTimer); },
  };
})();
