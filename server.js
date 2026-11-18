// TOPARLAK LİG — yerel ağ sunucusu
// Oyunu yayınlar (http) ve iki oyuncu arasındaki mesajları WebSocket ile aktarır.
// Çalıştır: node server.js   (port değiştirmek için: PORT=9000 node server.js)
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { WebSocketServer } = require('ws');

const ROOT = __dirname;
const PORT = parseInt(process.env.PORT, 10) || 8080;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.md': 'text/plain; charset=utf-8' };

// ---------- statik dosyalar ----------
const server = http.createServer((req, res) => {
  let p = decodeURIComponent((req.url || '/').split('?')[0].split('#')[0]);
  if (p === '/') p = '/index.html';
  const file = path.normalize(path.join(ROOT, p));
  const rel = path.relative(ROOT, file);
  if (!file.startsWith(ROOT + path.sep) || rel.split(path.sep).some(seg => seg.startsWith('.') || seg === 'node_modules')) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Bulunamadı'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});

// ---------- odalar ----------
// Bağlantı koparsa oyuncunun yeri GRACE ms boyunca saklanır; aynı jetonla geri dönebilir.
const GRACE = 25000;
const ALPHA = 'ABCDEFGHJKLMNPRSTUVYZ23456789';
const rooms = new Map(); // kod -> { host, guest, hostTok, guestTok, name, timers, queue }
const genCode = () => { let c; do { c = Array.from({ length: 5 }, () => ALPHA[(Math.random() * ALPHA.length) | 0]).join(''); } while (rooms.has(c)); return c; };
const tok = () => Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
const sendJ = (ws, o) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); };
const roomList = () => [...rooms.entries()].filter(([, r]) => r.host && !r.guestTok).map(([code, r]) => ({ code, name: r.name }));
const SKIP_QUEUE = /^\{"t":"(s|i|ping|pong)"/; // anlık veriler kuyruğa alınmaz

const wss = new WebSocketServer({ server, path: '/ws', perMessageDeflate: false });
wss.on('connection', (ws, req) => {
  ws.ip = (req.socket.remoteAddress || '').replace('::ffff:', '');
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  try { req.socket.setNoDelay(true); } catch (e) {}

  ws.on('message', (buf) => {
    ws.isAlive = true;
    const str = buf.toString();
    // kontrol mesajları "_" ile başlar; diğer her şey eşine aynen aktarılır (hızlı yol)
    if (str.charCodeAt(6) !== 95 /* '_' */ || !str.startsWith('{"t":"_')) {
      const room = ws.room;
      if (!room) return;
      const partner = ws.role === 'host' ? room.guest : room.host;
      if (partner && partner.readyState === 1) partner.send(str);
      else if (!SKIP_QUEUE.test(str)) { // eş geçici olarak kopuk: önemli mesajları sakla
        const q = room.queue[ws.role === 'host' ? 'guest' : 'host'];
        if (q.length < 50) q.push(str);
      }
      return;
    }
    let m; try { m = JSON.parse(str); } catch (e) { return; }
    switch (m.t) {
      case '_host': {
        leave(ws, true);
        const code = genCode();
        const room = { host: ws, guest: null, hostTok: tok(), guestTok: null, name: String(m.name || 'Oyuncu').slice(0, 14), timers: {}, queue: { host: [], guest: [] } };
        rooms.set(code, room);
        ws.room = room; ws.role = 'host'; ws.code = code;
        sendJ(ws, { t: '_code', code, tok: room.hostTok });
        log(`Oda açıldı ${code} (${room.name}, ${ws.ip})`);
        break;
      }
      case '_join': {
        const code = String(m.code || '').toUpperCase();
        const room = rooms.get(code);
        if (!room || !room.host) return sendJ(ws, { t: '_err', msg: 'Bu kodla açık bir oda yok.' });
        if (room.guestTok) return sendJ(ws, { t: '_err', msg: 'Oda dolu.' });
        leave(ws, true);
        room.guest = ws; room.guestTok = tok(); ws.room = room; ws.role = 'guest'; ws.code = code;
        sendJ(ws, { t: '_joined', code, tok: room.guestTok });
        sendJ(room.host, { t: '_joined', code });
        log(`${ws.ip} odaya katıldı ${code}`);
        break;
      }
      case '_resume': {
        const room = rooms.get(String(m.code || '').toUpperCase());
        let role = null;
        if (room && m.tok && m.tok === room.hostTok) role = 'host';
        else if (room && m.tok && m.tok === room.guestTok) role = 'guest';
        if (!role) return sendJ(ws, { t: '_gone' });
        const old = room[role];
        if (old && old !== ws) { old.room = null; try { old.terminate(); } catch (e) {} }
        clearTimeout(room.timers[role]);
        room[role] = ws; ws.room = room; ws.role = role; ws.code = m.code;
        const other = role === 'host' ? room.guest : room.host;
        sendJ(ws, { t: '_resumed', partner: !!other });
        for (const q of room.queue[role].splice(0)) ws.send(q);
        if (other) sendJ(other, { t: '_resumed', partner: true });
        log(`${role === 'host' ? 'Oda sahibi' : 'Misafir'} geri bağlandı ${m.code} (${ws.ip})`);
        break;
      }
      case '_bye': leave(ws, true); break;
      case '_rooms': sendJ(ws, { t: '_rooms', rooms: roomList() }); break;
      case '_ping': sendJ(ws, { t: '_pong', ts: m.ts }); break;
    }
  });
  ws.on('close', (code) => { if (ws.room) log(`Bağlantı koptu ${ws.code} ${ws.role} (${ws.ip}, kod ${code})`); leave(ws, false); });
  ws.on('error', () => leave(ws, false));
});

// on: true = kasıtlı çıkış (hemen kapat), false = kopma (bekleme süresi tanı)
function leave(ws, intentional) {
  const room = ws.room;
  if (!room) return;
  ws.room = null;
  const role = room.host === ws ? 'host' : room.guest === ws ? 'guest' : null;
  if (!role) return;
  const code = ws.code;
  const other = role === 'host' ? room.guest : room.host;
  room[role] = null;
  const finish = () => {
    if (role === 'host') {
      sendJ(room.guest, { t: '_left' });
      if (room.guest) room.guest.room = null;
      for (const k in room.timers) clearTimeout(room.timers[k]);
      rooms.delete(code);
      log(`Oda kapandı ${code}`);
    } else {
      room.guestTok = null; room.queue.guest = [];
      sendJ(room.host, { t: '_left' });
      log(`Misafir ayrıldı ${code}`);
    }
  };
    if (intentional) { finish(); return; }
  sendJ(other, { t: '_paused' });
  room.timers[role] = setTimeout(() => { if (!room[role]) finish(); }, GRACE);
}

// kopmuş bağlantıları temizle (6 sn yanıt yoksa)
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false; try { ws.ping(); } catch (e) {}
  }
}, 3000);

function log(s) { console.log(`[${new Date().toLocaleTimeString('tr-TR')}] ${s}`); }

function lanIPs() {
  const out = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push({ name, address: a.address });
  }
  // önce yaygın yerel ağ adresleri
  return out.sort((a, b) => (/^(192\.168|10\.|172\.)/.test(b.address) ? 1 : 0) - (/^(192\.168|10\.|172\.)/.test(a.address) ? 1 : 0));
}

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') { console.error(`Port ${PORT} kullanımda. Başka port dene: PORT=9000 node server.js`); process.exit(1); }
  throw e;
});

server.listen(PORT, '0.0.0.0', () => {
  const ips = lanIPs();
  console.log('\n  ⚽  TOPARLAK LİG — yerel ağ sunucusu çalışıyor\n');
  console.log(`  Sen aç:            http://localhost:${PORT}`);
  for (const ip of ips) console.log(`  Arkadaşın açsın:   http://${ip.address}:${PORT}   (${ip.name})`);
  console.log('\n  Kapatmak için: Ctrl+C\n');
});

module.exports = { server, wss, rooms };
