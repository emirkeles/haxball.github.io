// TOPARLAK — bağlantı: önce PeerJS (WebRTC, doğrudan), olmazsa MQTT aktarma (her ağda çalışır)
(function () {
  const PREFIX = 'toparlak-lig-v1-';
  const TOPIC = 'toparlak-lig/v1/';
  const ALPHA = 'ABCDEFGHJKLMNPRSTUVYZ23456789';
  const BROKERS = ['wss://broker.hivemq.com:8884/mqtt', 'wss://broker.emqx.io:8084/mqtt'];
  const ICE = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun.cloudflare.com:3478' },
    ],
  };
  const FORCE_RELAY = /[?&]relay=1/.test(location.search); // test için
  const P2P_WAIT = 5000;     // doğrudan bağlantı için bekleme
  const RELAY_WAIT = 15000;  // aktarma için bekleme
  const genCode = () => Array.from({ length: 5 }, () => ALPHA[(Math.random() * ALPHA.length) | 0]).join('');
  const rid = () => Math.random().toString(36).slice(2, 10);

  // ---- MQTT bağlantısı (yedekli broker) ----
  function mqttConnect(onReady, onFail, idx) {
    idx = idx || 0;
    if (typeof window.mqtt === 'undefined' || idx >= BROKERS.length) { onFail(); return null; }
    let done = false;
    const c = window.mqtt.connect(BROKERS[idx], { clientId: 'tpl_' + rid(), clean: true, connectTimeout: 5000, reconnectPeriod: 2000, keepalive: 20 });
    const fail = () => { if (done) return; done = true; try { c.end(true); } catch (e) {} mqttConnect(onReady, onFail, idx + 1); };
    const t = setTimeout(fail, 6000);
    c.on('connect', () => { if (done) return; done = true; clearTimeout(t); onReady(c); });
    c.on('error', () => { if (!done) { clearTimeout(t); fail(); } });
    return c;
  }

  class Session {
    constructor(role) {
      this.role = role; this.peer = null; this.ctl = null; this.fast = null;
      this.mq = null; this.via = null; this.sid = rid(); this.partner = null;
      this.handlers = {}; this.connected = false; this.closed = false; this.rtt = 0;
      this.lastHeard = 0; this.lastFastS = 0;
    }
    on(ev, fn) { this.handlers[ev] = fn; return this; }
    fire(ev, a) { const f = this.handlers[ev]; if (f) f(a); }

    send(msg, fast) {
      if (this.via === 'relay') {
        if (!this.mq) return;
        if (fast && msg.t === 's') { // anlık görüntüleri ~30 Hz'e indir
          const now = performance.now();
          if (now - this.lastFastS < 30) return;
          this.lastFastS = now;
        }
        const topic = TOPIC + this.code + (this.role === 'host' ? '/g' : '/h');
        try { this.mq.publish(topic, JSON.stringify({ s: this.sid, d: msg }), { qos: 0 }); } catch (e) {}
        return;
      }
      const c = fast && this.fast && this.fast.open ? this.fast : this.ctl;
      if (c && c.open) { try { c.send(msg); } catch (e) {} }
    }

    _recv(d) {
      this.lastHeard = performance.now();
      if (d && d.t === 'ping') return this.send({ t: 'pong', ts: d.ts }, true);
      if (d && d.t === 'pong') { this.rtt = performance.now() - d.ts; return; }
      this.fire('msg', d);
    }

    _ready(via) {
      if (this.connected) return;
      this.connected = true; this.via = via;
      clearTimeout(this.timer); clearTimeout(this.p2pTimer);
      this.lastHeard = performance.now();
      this.pingTimer = setInterval(() => {
        this.send({ t: 'ping', ts: performance.now() }, true);
        if (this.via === 'relay' && performance.now() - this.lastHeard > 9000) this._lost();
      }, 1000);
      // doğrudan bağlantı kurulduysa aktarmaya gerek yok
      if (via === 'p2p' && this.mq && this.role === 'guest') { try { this.mq.end(true); } catch (e) {} this.mq = null; }
      this.fire('connected', via);
    }

    _wire(conn) {
      conn.on('data', (d) => this._recv(d));
      conn.on('close', () => { if (this.via === 'p2p') this._lost(); });
      conn.on('error', () => { if (this.via === 'p2p') this._lost(); });
    }

    _checkP2P() {
      if (!this.connected && this.ctl && this.ctl.open && this.fast && this.fast.open) this._ready('p2p');
    }

    _lost() {
      if (this.closed) return;
      if (this.connected) { this.connected = false; this.fire('lost'); }
    }

    // ---------- HOST ----------
    host() {
      this.code = genCode();
      let announced = false;
      const announce = () => { if (!announced) { announced = true; this.fire('code', this.code); } };
      // 1) PeerJS
      if (typeof window.Peer === 'function') {
        const peer = this.peer = new Peer(PREFIX + this.code, { debug: 0, config: ICE });
        peer.on('open', announce);
        peer.on('error', () => {});
        peer.on('disconnected', () => { if (!this.closed && !peer.destroyed) try { peer.reconnect(); } catch (e) {} });
        peer.on('connection', (conn) => {
          const ch = conn.metadata && conn.metadata.ch;
          if (this.connected || (ch === 'ctl' && this.ctl) || (ch === 'fast' && this.fast) || !ch) { conn.on('open', () => conn.close()); return; }
          if (ch === 'ctl') this.ctl = conn; else this.fast = conn;
          this._wire(conn);
          conn.on('open', () => this._checkP2P());
        });
      }
      // 2) MQTT aktarma (misafir doğrudan bağlanamazsa buradan gelir)
      this.mq = mqttConnect((c) => {
        if (this.closed) { c.end(true); return; }
        this.mq = c;
        c.subscribe(TOPIC + this.code + '/h', { qos: 0 });
        c.on('message', (_t, buf) => {
          let m; try { m = JSON.parse(buf.toString()); } catch (e) { return; }
          if (!m || m.s === this.sid) return;
          if (m.d && m.d.t === 'join') {
            if (this.connected && this.via === 'p2p') return;
            if (this.partner && this.partner !== m.s) return; // oda dolu
            this.partner = m.s;
            this.via = 'relay';
            this.send({ t: 'welcome' });
            this._ready('relay');
            return;
          }
          if (this.via === 'relay' && m.s === this.partner) this._recv(m.d);
        });
        announce();
      }, () => { if (!announced && !this.peer) this.fire('error', 'Bağlantı sunucularına ulaşılamadı.'); });
      setTimeout(() => { if (!announced) this.fire('error', 'Oda kurulamadı. İnternet bağlantını kontrol et.'); }, 12000);
      return this;
    }

    // ---------- MİSAFİR ----------
    join(code) {
      this.code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      // 1) doğrudan dene
      if (typeof window.Peer === 'function' && !FORCE_RELAY) {
        const peer = this.peer = new Peer({ debug: 0, config: ICE });
        peer.on('error', () => this._startRelay());
        peer.on('open', () => {
          const id = PREFIX + this.code;
          this.ctl = peer.connect(id, { reliable: true, serialization: 'json', metadata: { ch: 'ctl' } });
          this.fast = peer.connect(id, { reliable: false, serialization: 'json', metadata: { ch: 'fast' } });
          for (const c of [this.ctl, this.fast]) { this._wire(c); c.on('open', () => this._checkP2P()); }
        });
      }
      // 2) süre içinde olmazsa aktarmaya geç
      this.p2pTimer = setTimeout(() => this._startRelay(), typeof window.Peer === 'function' && !FORCE_RELAY ? P2P_WAIT : 0);
      return this;
    }

    _startRelay() {
      if (this.connected || this.relayStarted || this.closed) return;
      this.relayStarted = true;
      this.fire('status', 'Doğrudan bağlantı olmadı, sunucu üzerinden bağlanılıyor…');
      this.timer = setTimeout(() => { if (!this.connected) this.fire('error', 'Odaya bağlanılamadı. Kodun doğru olduğundan ve oda sahibinin sayfada beklediğinden emin ol.'); }, RELAY_WAIT);
      mqttConnect((c) => {
        if (this.closed || this.connected) { c.end(true); return; }
        this.mq = c;
        c.subscribe(TOPIC + this.code + '/g', { qos: 0 });
        c.on('message', (_t, buf) => {
          let m; try { m = JSON.parse(buf.toString()); } catch (e) { return; }
          if (!m || m.s === this.sid) return;
          if (m.d && m.d.t === 'welcome') {
            if (this.connected) return;
            this.partner = m.s; this.via = 'relay';
            clearInterval(this.joinTimer);
            this._ready('relay');
            return;
          }
          if (this.via === 'relay' && (!this.partner || m.s === this.partner)) this._recv(m.d);
        });
        const knock = () => { try { c.publish(TOPIC + this.code + '/h', JSON.stringify({ s: this.sid, d: { t: 'join' } }), { qos: 0 }); } catch (e) {} };
        knock(); this.joinTimer = setInterval(() => { if (this.connected) clearInterval(this.joinTimer); else knock(); }, 1000);
      }, () => this.fire('error', 'Bağlantı sunucularına ulaşılamadı. İnternet bağlantını kontrol et.'));
    }

    close() {
      this.closed = true;
      clearTimeout(this.timer); clearTimeout(this.p2pTimer); clearInterval(this.pingTimer); clearInterval(this.joinTimer);
      try { this.ctl && this.ctl.close(); } catch (e) {}
      try { this.fast && this.fast.close(); } catch (e) {}
      try { this.peer && this.peer.destroy(); } catch (e) {}
      try { this.mq && this.mq.end && this.mq.end(true); } catch (e) {}
    }
  }

  // ---------- YEREL AĞ (kendi sunucumuz: node server.js) ----------
  const LAN = /^https?:$/.test(location.protocol) && !/github\.io$/.test(location.hostname) && !/[?&]online=1/.test(location.search);
  const wsURL = () => (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';

  class LanSession {
    constructor(role) {
      this.role = role; this.via = 'lan'; this.handlers = {}; this.connected = false; this.closed = false; this.rtt = 0;
      this.code = null; this.tok = null; this.reconnecting = false; this.lastMsg = 0;
    }
    on(ev, fn) { this.handlers[ev] = fn; return this; }
    fire(ev, a) { const f = this.handlers[ev]; if (f) f(a); }
    send(msg) { if (this.ws && this.ws.readyState === 1) { try { this.ws.send(JSON.stringify(msg)); } catch (e) {} } }

    _open(first) {
      const ws = this.ws = new WebSocket(wsURL());
      const to = setTimeout(() => { if (ws.readyState !== 1) { try { ws.close(); } catch (e) {} if (!this.tok) this.fire('error', 'Oyun sunucusuna bağlanılamadı. Sunucu açık mı?'); } }, 4000);
      ws.onopen = () => { clearTimeout(to); this.lastMsg = performance.now(); first(); };
      ws.onerror = () => {};
      ws.onclose = () => {
        clearTimeout(to);
        if (this.ws !== ws || this.closed) return;
        if (this.tok) this._reconnect();       // daha önce odadaydık: geri bağlanmayı dene
        else this.fire('error', 'Oyun sunucusuna bağlanılamadı. Sunucu açık mı?');
      };
      ws.onmessage = (ev) => {
        this.lastMsg = performance.now();
        let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
        switch (m.t) {
          case '_code': this.code = m.code; this.tok = m.tok; this._startWatch(); this.fire('code', m.code); return;
          case '_err': this.fire('error', m.msg); return;
          case '_pong': return;
          case '_left': this._end(); return;
          case '_gone': this._end(); return;
          case '_paused': this.fire('paused', 'partner'); return;
          case '_resumed':
            if (this.reconnecting) { this.reconnecting = false; clearTimeout(this.giveUp); }
            this.fire('resumed', m.partner); return;
          case '_joined':
            if (m.tok) this.tok = m.tok;
            this._startWatch();
            if (this.connected) return;
            this.connected = true; this.code = m.code;
            this.fire('connected', 'lan');
            return;
          case 'ping': this.send({ t: 'pong', ts: m.ts }); return;
          case 'pong': this.rtt = performance.now() - m.ts; return;
        }
        this.fire('msg', m);
      };
    }

    // sunucuya düzenli nabız; 3.5 sn ses yoksa bağlantıyı yenile
    _startWatch() {
      if (this.watch) return;
      this.watch = setInterval(() => {
        if (this.closed) return;
        this.send({ t: '_ping', ts: performance.now() });
        if (this.connected) this.send({ t: 'ping', ts: performance.now() });
        if (!this.reconnecting && this.ws && this.ws.readyState === 1 && performance.now() - this.lastMsg > 3500) {
          try { this.ws.close(); } catch (e) {}
        }
      }, 1000);
    }

    _reconnect() {
      if (this.closed) return;
      if (!this.reconnecting) {
        this.reconnecting = true;
        this.fire('paused', 'self');
        this.giveUp = setTimeout(() => { if (this.reconnecting) this._end(); }, 24000);
      }
      setTimeout(() => {
        if (this.closed || !this.reconnecting) return;
        this._open(() => this.send({ t: '_resume', code: this.code, tok: this.tok }));
      }, 700);
    }

    _end() {
      if (this.closed) return;
      this.closed = true; this.reconnecting = false;
      clearInterval(this.watch); clearTimeout(this.giveUp);
      try { this.ws && this.ws.close(); } catch (e) {}
      if (this.connected || this.tok) { this.connected = false; this.fire('lost'); }
    }

    host(name) { this._open(() => this.send({ t: '_host', name })); return this; }
    join(code) { this._open(() => this.send({ t: '_join', code: String(code || '').toUpperCase() })); return this; }
    close() {
      if (this.closed) return;
      this.closed = true; clearInterval(this.watch); clearTimeout(this.giveUp);
      this.send({ t: '_bye' });
      const ws = this.ws; setTimeout(() => { try { ws && ws.close(); } catch (e) {} }, 50);
    }
  }

  // Yerel ağdaki açık odaları listele
  function lanRooms(cb) {
    let ws;
    try { ws = new WebSocket(wsURL()); } catch (e) { cb(null); return; }
    const t = setTimeout(() => { try { ws.close(); } catch (e) {} cb(null); }, 3000);
    ws.onopen = () => ws.send(JSON.stringify({ t: '_rooms' }));
    ws.onmessage = (ev) => { clearTimeout(t); let m; try { m = JSON.parse(ev.data); } catch (e) {} ws.close(); cb(m && m.rooms || []); };
    ws.onerror = () => { clearTimeout(t); cb(null); };
  }

  TP.Net = {
    LAN,
    available: () => LAN || typeof window.Peer === 'function' || typeof window.mqtt !== 'undefined',
    host: (name) => LAN ? new LanSession('host').host(name) : new Session('host').host(),
    join: (code) => LAN ? new LanSession('guest').join(code) : new Session('guest').join(code),
    lanRooms,
  };
})();
