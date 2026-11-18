// TOPARLAK — PeerJS (WebRTC) ile P2P bağlantı
(function () {
  const PREFIX = 'toparlak-lig-v1-';
  const ALPHA = 'ABCDEFGHJKLMNPRSTUVYZ23456789';
  const ICE = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun.cloudflare.com:3478' },
    ],
  };
  const genCode = () => Array.from({ length: 5 }, () => ALPHA[(Math.random() * ALPHA.length) | 0]).join('');

  class Session {
    constructor(role) {
      this.role = role; this.peer = null; this.ctl = null; this.fast = null;
      this.handlers = {}; this.connected = false; this.closed = false; this.rtt = 0;
    }
    on(ev, fn) { this.handlers[ev] = fn; return this; }
    fire(ev, a) { const f = this.handlers[ev]; if (f) f(a); }

    send(msg, fast) {
      const c = fast && this.fast && this.fast.open ? this.fast : this.ctl;
      if (c && c.open) { try { c.send(msg); } catch (e) {} }
    }

    _wire(conn) {
      conn.on('data', (d) => {
        if (d && d.t === 'ping') return this.send({ t: 'pong', ts: d.ts }, true);
        if (d && d.t === 'pong') { this.rtt = performance.now() - d.ts; return; }
        this.fire('msg', d);
      });
      conn.on('close', () => this._lost());
      conn.on('error', () => this._lost());
    }

    _checkReady() {
      if (!this.connected && this.ctl && this.ctl.open && this.fast && this.fast.open) {
        this.connected = true;
        clearTimeout(this.timer);
        this.pingTimer = setInterval(() => this.send({ t: 'ping', ts: performance.now() }, true), 1000);
        this.fire('connected');
      }
    }

    _lost() {
      if (this.closed) return;
      if (this.connected) { this.connected = false; this.fire('lost'); }
    }

    host() {
      const code = genCode();
      this.code = code;
      const peer = this.peer = new Peer(PREFIX + code, { debug: 0, config: ICE });
      peer.on('open', () => this.fire('code', code));
      peer.on('error', (err) => {
        if (err.type === 'unavailable-id') { peer.destroy(); this.host(); return; }
        this.fire('error', describe(err));
      });
      peer.on('disconnected', () => { if (!this.closed && !peer.destroyed) peer.reconnect(); });
      peer.on('connection', (conn) => {
        const ch = conn.metadata && conn.metadata.ch;
        if ((ch === 'ctl' && this.ctl) || (ch === 'fast' && this.fast) || !ch) { conn.on('open', () => conn.close()); return; }
        if (ch === 'ctl') this.ctl = conn; else this.fast = conn;
        this._wire(conn);
        conn.on('open', () => this._checkReady());
      });
      return this;
    }

    join(code) {
      code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      const peer = this.peer = new Peer({ debug: 0, config: ICE });
      this.timer = setTimeout(() => { if (!this.connected) this.fire('error', 'Bağlantı zaman aşımına uğradı. Kodu kontrol et ya da başka bir ağ dene.'); }, 16000);
      peer.on('error', (err) => this.fire('error', describe(err)));
      peer.on('open', () => {
        const id = PREFIX + code;
        this.ctl = peer.connect(id, { reliable: true, serialization: 'json', metadata: { ch: 'ctl' } });
        this.fast = peer.connect(id, { reliable: false, serialization: 'json', metadata: { ch: 'fast' } });
        for (const c of [this.ctl, this.fast]) { this._wire(c); c.on('open', () => this._checkReady()); }
      });
      return this;
    }

    close() {
      this.closed = true;
      clearTimeout(this.timer); clearInterval(this.pingTimer);
      try { this.ctl && this.ctl.close(); } catch (e) {}
      try { this.fast && this.fast.close(); } catch (e) {}
      try { this.peer && this.peer.destroy(); } catch (e) {}
    }
  }

  function describe(err) {
    const t = err && err.type;
    if (t === 'peer-unavailable') return 'Bu kodla açık bir oda bulunamadı.';
    if (t === 'network' || t === 'server-error' || t === 'socket-error') return 'Eşleştirme sunucusuna ulaşılamadı. İnternet bağlantını kontrol et.';
    if (t === 'browser-incompatible') return 'Tarayıcın WebRTC desteklemiyor.';
    return 'Bağlantı hatası: ' + (t || err);
  }

  TP.Net = {
    available: () => typeof window.Peer === 'function',
    host: () => new Session('host').host(),
    join: (code) => new Session('guest').join(code),
  };
})();
