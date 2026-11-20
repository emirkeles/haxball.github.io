// TOPARLAK LİG — online bağlantı (yıldız düzeni)
//  Odayı kuran oyuncunun tarayıcısı sunucudur; herkes ona bağlanır.
//  Önce PeerJS (WebRTC, doğrudan). Olmazsa MQTT aktarma (her ağda çalışır).
(function () {
  const PREFIX = 'toparlak-lig-v4-';
  const TOPIC = 'toparlak-lig/v4/';
  const ALPHA = 'ABCDEFGHJKLMNPRSTUVYZ23456789';
  // test.mosquitto.org en hızlısı; EMQX genel sunucusu mesaj sınırı koyuyor (yedek), HiveMQ ara ara düşüyor
  const BROKERS = ['wss://test.mosquitto.org:8081/mqtt', 'wss://broker.emqx.io:8084/mqtt', 'wss://broker.hivemq.com:8884/mqtt'];
  const ICE = { iceServers: [
    { urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }, { urls: 'stun:stun.cloudflare.com:3478' },
  ] };
  const FORCE_RELAY = /[?&]relay=1/.test(location.search); // test için
  const P2P_WAIT = 5000, RELAY_WAIT = 15000, SILENCE = 7000;
  const MAX_GUESTS = 7;
  const genCode = () => Array.from({ length: 5 }, () => ALPHA[(Math.random() * ALPHA.length) | 0]).join('');
  const rid = () => Math.random().toString(36).slice(2, 10);
  const isFast = (m) => m.t === 'i' || m.t === 's'; // Lig'de anlık görüntüler olayları 40 tick tekrarlar, kayıp sorun değil

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

  // tek aracıya bağlan (oda sahibi için; yeniden bağlanmayı mqtt.js yapar)
  function mqttOne(url, onReady, onFail) {
    if (typeof window.mqtt === 'undefined') { onFail(); return; }
    let done = false;
    const c = window.mqtt.connect(url, { clientId: 'tpl_' + rid(), clean: true, connectTimeout: 6000, reconnectPeriod: 3000, keepalive: 20 });
    const t = setTimeout(() => { if (!done) { done = true; try { c.end(true); } catch (e) {} onFail(); } }, 9000);
    c.on('connect', () => { if (done) return; done = true; clearTimeout(t); onReady(c); });
  }

  class Emitter {
    constructor() { this.handlers = {}; }
    on(ev, fn) { this.handlers[ev] = fn; return this; }
    fire(ev, a, b) { const f = this.handlers[ev]; if (f) f(a, b); }
  }

  // ================= ODA SAHİBİ =================
  // Her misafir tek kayıt (kimlik = misafirin sid'i). Doğrudan kanal ve aktarma aynı kayda bağlanır;
  // misafir hangi yoldan en son konuştuysa cevap o yoldan gider.
  class HostNet extends Emitter {
    constructor() {
      super();
      this.role = 'host'; this.sid = rid(); this.code = genCode(); this.closed = false;
      this.guests = new Map(); // gid → { via, ctl, fast, rsid, mq, last, rtt }
      this.pending = new Map(); // gid → { ctl, fast } (henüz açılmamış doğrudan kanallar)
      this.mqs = []; this.peer = null;
    }
    start() {
      let announced = false;
      const announce = () => { if (!announced) { announced = true; this.fire('code', this.code); } };
      if (typeof window.Peer === 'function') {
        const peer = this.peer = new Peer(PREFIX + this.code, { debug: 0, config: ICE });
        peer.on('open', announce);
        peer.on('error', (e) => { if (e && e.type === 'unavailable-id') this.fire('error', 'Kod çakıştı, tekrar dene.'); });
        peer.on('disconnected', () => { if (!this.closed && !peer.destroyed) try { peer.reconnect(); } catch (e) {} });
        peer.on('connection', (conn) => this._incoming(conn));
      }
      // aktarma: TÜM aracılara aynı anda bağlan; misafir hangisinden gelirse oradan cevap ver
      let failed = 0;
      BROKERS.forEach((url) => mqttOne(url, (c) => {
        if (this.closed) { c.end(true); return; }
        this.mqs.push(c);
        c.subscribe(TOPIC + this.code + '/h', { qos: 1 });
        c.on('message', (_t, buf) => {
          let m; try { m = JSON.parse(buf.toString()); } catch (e) { return; }
          if (!m || !m.s || m.s === this.sid || !m.d) return;
          const gid = m.s;
          let g = this.guests.get(gid);
          if (m.d.t === 'join') {
            if (!g) {
              if (this.guests.size >= MAX_GUESTS) { this._pubTo({ rsid: gid, mq: c }, { t: 'full' }); return; }
              g = this._add(gid, 'relay');
            }
            g.rsid = gid; g.mq = c; g.via = 'relay'; g.last = performance.now();
            this._pubTo(g, { t: 'welcome' });
            return;
          }
          if (!g) return;
          g.rsid = gid; g.mq = c; g.via = 'relay';
          this._recv(gid, g, m.d);
        });
        announce();
      }, () => { if (++failed === BROKERS.length && !announced && !this.peer) this.fire('error', 'Bağlantı sunucularına ulaşılamadı.'); }));
      setTimeout(() => { if (!announced && !this.closed) this.fire('error', 'Oda kurulamadı. İnternet bağlantını kontrol et.'); }, 12000);
      this.pingT = setInterval(() => this._tick(), 1000);
      return this;
    }
    _add(gid, via) {
      const g = { via, last: performance.now(), rtt: 0 };
      this.guests.set(gid, g);
      this.fire('join', gid);
      return g;
    }
    _incoming(conn) {
      const md = conn.metadata || {}, gid = md.gid, ch = md.ch;
      if (!ch || !gid) { conn.on('open', () => conn.close()); return; }
      if (!this.guests.has(gid) && !this.pending.has(gid) && this.guests.size >= MAX_GUESTS) {
        conn.on('open', () => { try { conn.send({ t: 'full' }); } catch (e) {} setTimeout(() => conn.close(), 300); }); return;
      }
      const pd = this.pending.get(gid) || {};
      pd[ch] = conn; this.pending.set(gid, pd);
      conn.on('data', (d) => { const g = this.guests.get(gid); if (g && (g.ctl === conn || g.fast === conn)) { g.via = 'p2p'; this._recv(gid, g, d); } });
      conn.on('close', () => this._drop(gid, conn));
      conn.on('error', () => this._drop(gid, conn));
      conn.on('open', () => {
        const p = this.pending.get(gid);
        if (!(p && p.ctl && p.fast && p.ctl.open && p.fast.open)) return;
        this.pending.delete(gid);
        let g = this.guests.get(gid);
        if (!g) g = this._add(gid, 'p2p');
        g.ctl = p.ctl; g.fast = p.fast; g.last = performance.now();
        // yol, misafirin ilk mesajıyla kesinleşir (aktarmayı seçtiyse doğrudan kanalı kapatır)
      });
    }
    _drop(gid, conn) {
      const g = this.guests.get(gid);
      if (g && (g.ctl === conn || g.fast === conn)) {
        g.ctl = g.fast = null;
        if (g.via === 'p2p') this._leave(gid);
      } else if (this.pending.has(gid)) this.pending.delete(gid);
    }
    _leave(gid) {
      const g = this.guests.get(gid); if (!g) return;
      this.guests.delete(gid);
      try { g.ctl && g.ctl.close(); } catch (e) {} try { g.fast && g.fast.close(); } catch (e) {}
      this.fire('leave', gid);
    }
    _recv(gid, g, d) {
      g.last = performance.now();
      if (!d) return;
      if (d.t === 'ping') { this.send(gid, { t: 'pong', ts: d.ts }); return; }
      if (d.t === 'pong') { g.rtt = performance.now() - d.ts; return; }
      if (d.t === 'bye') { this._leave(gid); return; }
      this.fire('msg', gid, d);
    }
    _tick() {
      const now = performance.now();
      for (const [gid, g] of this.guests) {
        if (now - g.last > SILENCE) { this._leave(gid); continue; }
        this.send(gid, { t: 'ping', ts: now });
      }
    }
    _pubTo(g, d, fast) { if (g.mq) try { g.mq.publish(TOPIC + this.code + '/g', JSON.stringify({ s: this.sid, to: g.rsid, d }), { qos: fast ? 0 : 1 }); } catch (e) {} }
    rtt(gid) { const g = this.guests.get(gid); return g ? Math.round(g.rtt) : 0; }
    via(gid) { const g = this.guests.get(gid); return g ? g.via : null; }
    send(gid, m, fast) {
      const g = this.guests.get(gid); if (!g) return;
      if (fast === undefined) fast = isFast(m);
      if (g.via === 'relay' || !g.ctl) { this._pubTo(g, m, fast); return; }
      const c = fast && g.fast && g.fast.open ? g.fast : g.ctl;
      if (c && c.open) try { c.send(m); } catch (e) {}
    }
    broadcast(m, fast) {
      if (fast === undefined) fast = isFast(m);
      const used = new Set();
      for (const [gid, g] of this.guests) { if (g.via === 'relay' || !g.ctl) { if (g.mq) used.add(g.mq); } else this.send(gid, m, fast); }
      // aktarmadakilere aracı başına tek yayın
      if (used.size && !(m.t === 's' && performance.now() - (this.lastRelayS || 0) < 30)) {
        if (m.t === 's') this.lastRelayS = performance.now();
        const msg = JSON.stringify({ s: this.sid, d: m }); for (const c of used) try { c.publish(TOPIC + this.code + '/g', msg, { qos: fast ? 0 : 1 }); } catch (e) {}
      }
    }
    kick(gid) { this.send(gid, { t: 'kick' }); setTimeout(() => this._leave(gid), 200); }
    close() {
      if (this.closed) return;
      this.broadcast({ t: 'bye' });
      this.closed = true; clearInterval(this.pingT);
      setTimeout(() => {
        for (const [, g] of this.guests) { try { g.ctl && g.ctl.close(); } catch (e) {} try { g.fast && g.fast.close(); } catch (e) {} }
        try { this.peer && this.peer.destroy(); } catch (e) {}
        for (const c of this.mqs) try { c.end(true); } catch (e) {}
      }, 150);
    }
  }

  // ================= MİSAFİR =================
  class GuestNet extends Emitter {
    constructor(code) {
      super();
      this.role = 'guest'; this.sid = rid(); this.code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      this.connected = false; this.closed = false; this.via = null; this.rtt = 0; this.last = 0; this.hostSid = null;
    }
    start() {
      if (typeof window.Peer === 'function' && !FORCE_RELAY) {
        const peer = this.peer = new Peer({ debug: 0, config: ICE });
        peer.on('error', () => this._startRelay());
        peer.on('open', () => {
          const id = PREFIX + this.code;
          this.ctl = peer.connect(id, { reliable: true, serialization: 'json', metadata: { ch: 'ctl', gid: this.sid } });
          this.fast = peer.connect(id, { reliable: false, serialization: 'json', metadata: { ch: 'fast', gid: this.sid } });
          for (const c of [this.ctl, this.fast]) {
            c.on('data', (d) => { if (this.via === 'p2p') this._recv(d); });
            c.on('close', () => { if (this.via === 'p2p') this._lost(); });
            c.on('error', () => { if (this.via === 'p2p') this._lost(); });
            c.on('open', () => { if (!this.connected && this.ctl.open && this.fast.open) this._ready('p2p'); });
          }
        });
      }
      this.p2pTimer = setTimeout(() => this._startRelay(), typeof window.Peer === 'function' && !FORCE_RELAY ? P2P_WAIT : 0);
      return this;
    }
    _startRelay() {
      if (this.connected || this.relayStarted || this.closed) return;
      this.relayStarted = true;
      this.fire('status', 'Doğrudan bağlantı olmadı, sunucu üzerinden bağlanılıyor…');
      this.timer = setTimeout(() => { if (!this.connected && !this.closed) this.fire('error', 'Odaya bağlanılamadı. Kodun doğru olduğundan ve oda sahibinin sayfada beklediğinden emin ol.'); }, RELAY_WAIT);
      mqttConnect((c) => {
        if (this.closed || this.connected) { c.end(true); return; }
        this.mq = c;
        c.subscribe(TOPIC + this.code + '/g', { qos: 1 });
        c.on('message', (_t, buf) => {
          let m; try { m = JSON.parse(buf.toString()); } catch (e) { return; }
          if (!m || (m.to && m.to !== this.sid)) return;
          if (m.d && m.d.t === 'welcome') { if (!this.connected) { this.hostSid = m.s; clearInterval(this.knockT); this._ready('relay'); } return; }
          if (m.d && m.d.t === 'full') { this.fire('error', 'Oda dolu.'); this.close(); return; }
          if (this.via === 'relay' && m.s === this.hostSid) this._recv(m.d);
        });
        const knock = () => { try { c.publish(TOPIC + this.code + '/h', JSON.stringify({ s: this.sid, d: { t: 'join' } }), { qos: 0 }); } catch (e) {} };
        knock(); this.knockT = setInterval(() => { if (this.connected) clearInterval(this.knockT); else knock(); }, 1000);
      }, () => this.fire('error', 'Bağlantı sunucularına ulaşılamadı. İnternet bağlantını kontrol et.'));
    }
    _ready(via) {
      if (this.connected) return;
      this.connected = true; this.via = via; this.last = performance.now();
      clearTimeout(this.timer); clearTimeout(this.p2pTimer);
      if (via === 'p2p' && this.mq) { try { this.mq.end(true); } catch (e) {} this.mq = null; }
      if (via === 'relay') { try { this.peer && this.peer.destroy(); } catch (e) {} }
      this.pingT = setInterval(() => {
        this.send({ t: 'ping', ts: performance.now() });
        if (performance.now() - this.last > SILENCE) this._lost();
      }, 1000);
      this.fire('connected', via);
    }
    _recv(d) {
      this.last = performance.now();
      if (!d) return;
      if (d.t === 'ping') { this.send({ t: 'pong', ts: d.ts }); return; }
      if (d.t === 'pong') { this.rtt = performance.now() - d.ts; return; }
      if (d.t === 'full') { this.fire('error', 'Oda dolu.'); this.close(); return; }
      if (d.t === 'bye') { this._lost(); return; }
      this.fire('msg', d);
    }
    _lost() { if (this.closed) return; const was = this.connected; this.close(true); if (was) this.fire('lost'); }
    send(m, fast) {
      if (fast === undefined) fast = isFast(m);
      if (this.via === 'relay') {
        if (!this.mq) return;
        // aktarmada girdiyi ~30 Hz'e indir; tuş değişince hemen yolla
        if (m.t === 'i') {
          const key = JSON.stringify(Object.assign({}, m, { q: 0, c: 0 })), now = performance.now();
          if (key === this.lastIKey && now - (this.lastIAt || 0) < 33) return;
          this.lastIKey = key; this.lastIAt = now;
        }
        try { this.mq.publish(TOPIC + this.code + '/h', JSON.stringify({ s: this.sid, d: m }), { qos: fast ? 0 : 1 }); } catch (e) {}
        return;
      }
      const c = fast && this.fast && this.fast.open ? this.fast : this.ctl;
      if (c && c.open) try { c.send(m); } catch (e) {}
    }
    close(quiet) {
      if (this.closed) return;
      if (!quiet && this.connected) this.send({ t: 'bye' });
      this.closed = true;
      clearTimeout(this.timer); clearTimeout(this.p2pTimer); clearInterval(this.pingT); clearInterval(this.knockT);
      setTimeout(() => {
        try { this.ctl && this.ctl.close(); } catch (e) {}
        try { this.fast && this.fast.close(); } catch (e) {}
        try { this.peer && this.peer.destroy(); } catch (e) {}
        try { this.mq && this.mq.end && this.mq.end(true); } catch (e) {}
      }, 120);
    }
  }

  // ================= YEREL AĞ (node server.js) =================
  // Sayfa github.io dışından http ile açılınca: sunucu odaları tutar, mesajları aktarır.
  const LAN = /^https?:$/.test(location.protocol) && !/github\.io$/.test(location.hostname) && !/[?&]online=1/.test(location.search);
  const wsURL = () => (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';

  class LanBase extends Emitter {
    constructor(role) { super(); this.role = role; this.closed = false; this.code = null; this.tok = null; this.reconnecting = false; this.lastMsg = 0; this.via = 'lan'; }
    _raw(o) { if (this.ws && this.ws.readyState === 1) try { this.ws.send(JSON.stringify(o)); } catch (e) {} }
    _open(first) {
      const ws = this.ws = new WebSocket(wsURL());
      const to = setTimeout(() => { if (ws.readyState !== 1) { try { ws.close(); } catch (e) {} if (!this.tok) this.fire('error', 'Oyun sunucusuna bağlanılamadı. Sunucu açık mı?'); } }, 4000);
      ws.onopen = () => { clearTimeout(to); this.lastMsg = performance.now(); first(); };
      ws.onerror = () => {};
      ws.onclose = () => {
        clearTimeout(to);
        if (this.ws !== ws || this.closed) return;
        if (this.tok) this._reconnect(); else this.fire('error', 'Oyun sunucusuna bağlanılamadı. Sunucu açık mı?');
      };
      ws.onmessage = (ev) => { this.lastMsg = performance.now(); let m; try { m = JSON.parse(ev.data); } catch (e) { return; } this._on(m); };
    }
    _watch() {
      if (this.watchT) return;
      this.watchT = setInterval(() => {
        if (this.closed) return;
        this._raw({ t: '_ping', ts: performance.now() });
        this._tick && this._tick();
        if (!this.reconnecting && this.ws && this.ws.readyState === 1 && performance.now() - this.lastMsg > 3500) try { this.ws.close(); } catch (e) {}
      }, 1000);
    }
    _reconnect() {
      if (this.closed) return;
      if (!this.reconnecting) { this.reconnecting = true; this.fire('paused', 'self'); this.giveUp = setTimeout(() => { if (this.reconnecting) this._end(); }, 24000); }
      setTimeout(() => { if (!this.closed && this.reconnecting) this._open(() => this._raw({ t: '_resume', code: this.code, tok: this.tok })); }, 700);
    }
    _end() { if (this.closed) return; this.closed = true; clearInterval(this.watchT); clearTimeout(this.giveUp); try { this.ws && this.ws.close(); } catch (e) {} this.fire('lost'); }
    close() {
      if (this.closed) return;
      this.closed = true; clearInterval(this.watchT); clearTimeout(this.giveUp);
      this._raw({ t: '_bye' });
      const ws = this.ws; setTimeout(() => { try { ws && ws.close(); } catch (e) {} }, 60);
    }
  }

  class LanHost extends LanBase {
    constructor(name) { super('host'); this.name = name; this.guests = new Map(); }
    start() { this._open(() => this._raw({ t: '_host', name: this.name })); return this; }
    _on(m) {
      switch (m.t) {
        case '_code': this.code = m.code; this.tok = m.tok; this._watch(); this.fire('code', m.code); return;
        case '_err': this.fire('error', m.msg); return;
        case '_pong': return;
        case '_gjoin': if (!this.guests.has(m.g)) { this.guests.set(m.g, { rtt: 0, last: performance.now() }); this.fire('join', m.g); } return;
        case '_gleave': if (this.guests.delete(m.g)) this.fire('leave', m.g); return;
        case '_resumed': if (this.reconnecting) { this.reconnecting = false; clearTimeout(this.giveUp); } this.fire('resumed', true); return;
        case '_gone': this._end(); return;
        case '_from': {
          const g = this.guests.get(m.g), d = m.d; if (!g || !d) return;
          g.last = performance.now();
          if (d.t === 'ping') { this.send(m.g, { t: 'pong', ts: d.ts }); return; }
          if (d.t === 'pong') { g.rtt = performance.now() - d.ts; return; }
          this.fire('msg', m.g, d);
        }
      }
    }
    _tick() { const now = performance.now(); for (const gid of this.guests.keys()) this.send(gid, { t: 'ping', ts: now }); }
    send(gid, m) { this._raw({ t: '_to', g: gid, d: m }); }
    broadcast(m) { if (this.ws && this.ws.readyState === 1) try { this.ws.send(JSON.stringify(m)); } catch (e) {} } // '_' ile başlamayan her şey tüm misafirlere gider
    rtt(gid) { const g = this.guests.get(gid); return g ? Math.round(g.rtt) : 0; }
    via() { return 'lan'; }
    kick(gid) { this.send(gid, { t: 'kick' }); this._raw({ t: '_kick', g: gid }); }
  }

  class LanGuest extends LanBase {
    constructor(code) { super('guest'); this.code = String(code || '').toUpperCase(); this.connected = false; this.rtt = 0; }
    start() { this._open(() => this._raw({ t: '_join', code: this.code })); return this; }
    _on(m) {
      switch (m.t) {
        case '_joined': this.tok = m.tok; this._watch(); if (!this.connected) { this.connected = true; this.fire('connected', 'lan'); } return;
        case '_err': this.fire('error', m.msg); return;
        case '_pong': return;
        case '_left': case '_gone': this._end(); return;
        case '_paused': this.fire('paused', 'partner'); return;
        case '_resumed': if (this.reconnecting) { this.reconnecting = false; clearTimeout(this.giveUp); } this.fire('resumed', m.partner); return;
        case 'ping': this.send({ t: 'pong', ts: m.ts }); return;
        case 'pong': this.rtt = performance.now() - m.ts; return;
        case 'bye': this._end(); return;
      }
      this.fire('msg', m);
    }
    _tick() { if (this.connected) this.send({ t: 'ping', ts: performance.now() }); }
    send(m) { if (this.ws && this.ws.readyState === 1) try { this.ws.send(JSON.stringify(m)); } catch (e) {} }
  }

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
    host: (name) => LAN ? new LanHost(name).start() : new HostNet().start(),
    join: (code) => LAN ? new LanGuest(code).start() : new GuestNet(code).start(),
    lanRooms,
  };
})();
