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
const ALPHA = 'ABCDEFGHJKLMNPRSTUVYZ23456789';
const rooms = new Map(); // kod -> { host, guest, name, created }
const genCode = () => { let c; do { c = Array.from({ length: 5 }, () => ALPHA[(Math.random() * ALPHA.length) | 0]).join(''); } while (rooms.has(c)); return c; };
const sendJ = (ws, o) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); };
const roomList = () => [...rooms.entries()].filter(([, r]) => !r.guest).map(([code, r]) => ({ code, name: r.name }));

const wss = new WebSocketServer({ server, path: '/ws', perMessageDeflate: false });
wss.on('connection', (ws, req) => {
  ws.ip = (req.socket.remoteAddress || '').replace('::ffff:', '');
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  try { req.socket.setNoDelay(true); } catch (e) {}

  ws.on('message', (buf, isBinary) => {
    const str = buf.toString();
    // kontrol mesajları "_" ile başlar; diğer her şey eşine aynen aktarılır (hızlı yol)
    if (str.charCodeAt(6) !== 95 /* '_' */ || !str.startsWith('{"t":"_')) {
      const partner = ws.room && (ws.role === 'host' ? ws.room.guest : ws.room.host);
      if (partner && partner.readyState === 1) partner.send(str);
      return;
    }
    let m; try { m = JSON.parse(str); } catch (e) { return; }
    switch (m.t) {
      case '_host': {
        leave(ws);
        const code = genCode();
        const room = { host: ws, guest: null, name: String(m.name || 'Oyuncu').slice(0, 14), created: Date.now() };
        rooms.set(code, room);
        ws.room = room; ws.role = 'host'; ws.code = code;
        sendJ(ws, { t: '_code', code });
        log(`Oda açıldı ${code} (${room.name}, ${ws.ip})`);
        break;
      }
      case '_join': {
        const code = String(m.code || '').toUpperCase();
        const room = rooms.get(code);
        if (!room) return sendJ(ws, { t: '_err', msg: 'Bu kodla açık bir oda yok.' });
        if (room.guest) return sendJ(ws, { t: '_err', msg: 'Oda dolu.' });
        leave(ws);
        room.guest = ws; ws.room = room; ws.role = 'guest'; ws.code = code;
        sendJ(ws, { t: '_joined', code });
        sendJ(room.host, { t: '_joined', code });
        log(`${ws.ip} odaya katıldı ${code}`);
        break;
      }
      case '_rooms': sendJ(ws, { t: '_rooms', rooms: roomList() }); break;
      case '_ping': sendJ(ws, { t: '_pong', ts: m.ts }); break;
    }
  });
  ws.on('close', () => leave(ws));
  ws.on('error', () => leave(ws));
});

function leave(ws) {
  const room = ws.room;
  if (!room) return;
  ws.room = null;
  if (room.host === ws) {
    sendJ(room.guest, { t: '_left' });
    if (room.guest) room.guest.room = null;
    rooms.delete(ws.code);
    log(`Oda kapandı ${ws.code}`);
  } else if (room.guest === ws) {
    room.guest = null;
    sendJ(room.host, { t: '_left' });
    log(`Misafir ayrıldı ${ws.code}`);
  }
}

// kopmuş bağlantıları temizle
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false; try { ws.ping(); } catch (e) {}
  }
}, 5000);

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
