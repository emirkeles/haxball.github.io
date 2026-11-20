// TOPARLAK LİG — yerel ağ sunucusu
// Oyunu yayınlar (http) ve odadaki oyuncular arasındaki mesajları WebSocket ile aktarır (oda başına 8 kişiye kadar).
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
// Bir oda: 1 oda sahibi + en çok 7 misafir. Oda sahibinin tarayıcısı oyunu çalıştırır; sunucu yalnız aktarır.
// Misafir → oda sahibi: {"t":"_from","g":<misafir>,"d":<mesaj>}
// Oda sahibi → herkes: '_' ile başlamayan mesaj aynen tüm misafirlere; tek misafire: {"t":"_to","g":..,"d":..}
// Bağlantı koparsa yer GRACE ms saklanır; aynı jetonla geri dönülebilir.
const GRACE = 25000, MAX_GUESTS = 7;
const ALPHA = 'ABCDEFGHJKLMNPRSTUVYZ23456789';
const rooms = new Map(); // kod -> { host, hostTok, hostTimer, name, guests: Map(gid -> { ws, tok, timer, queue }) }
const genCode = () => { let c; do { c = Array.from({ length: 5 }, () => ALPHA[(Math.random() * ALPHA.length) | 0]).join(''); } while (rooms.has(c)); return c; };
const tok = () => Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
const sendJ = (ws, o) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); };
const roomList = () => [...rooms.entries()].filter(([, r]) => r.host && r.guests.size < MAX_GUESTS).map(([code, r]) => ({ code, name: r.name, n: r.guests.size + 1 }));
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
    const room = ws.room;
    // hızlı yol: kontrol mesajı değilse
    if (!str.startsWith('{"t":"_')) {
      if (!room) return;
      if (ws.role === 'host') { for (const g of room.guests.values()) if (g.ws && g.ws.readyState === 1) g.ws.send(str); }
      else {
        const out = '{"t":"_from","g":"' + ws.gid + '","d":' + str + '}';
        if (room.host && room.host.readyState === 1) room.host.send(out);
      }
      return;
    }
    let m; try { m = JSON.parse(str); } catch (e) { return; }
    switch (m.t) {
      case '_to': { // oda sahibi → tek misafir
        if (!room || ws.role !== 'host') return;
        const g = room.guests.get(m.g); if (!g) return;
        const out = JSON.stringify(m.d);
        if (g.ws && g.ws.readyState === 1) g.ws.send(out);
        else if (!SKIP_QUEUE.test(out) && g.queue.length < 50) g.queue.push(out);
        break;
      }
      case '_host': {
        leave(ws, true);
        const code = genCode();
        const r = { host: ws, hostTok: tok(), hostTimer: null, name: String(m.name || 'Oyuncu').slice(0, 14), guests: new Map() };
        rooms.set(code, r);
        ws.room = r; ws.role = 'host'; ws.code = code;
        sendJ(ws, { t: '_code', code, tok: r.hostTok });
        log(`Oda açıldı ${code} (${r.name}, ${ws.ip})`);
        break;
      }
      case '_join': {
        const code = String(m.code || '').toUpperCase();
        const r = rooms.get(code);
        if (!r || !r.host) return sendJ(ws, { t: '_err', msg: 'Bu kodla açık bir oda yok.' });
        if (r.guests.size >= MAX_GUESTS) return sendJ(ws, { t: '_err', msg: 'Oda dolu.' });
        leave(ws, true);
        const gid = tok().slice(0, 8);
        const g = { ws, tok: tok(), timer: null, queue: [] };
        r.guests.set(gid, g);
        ws.room = r; ws.role = 'guest'; ws.code = code; ws.gid = gid;
        sendJ(ws, { t: '_joined', code, tok: g.tok, gid });
        sendJ(r.host, { t: '_gjoin', g: gid });
        log(`${ws.ip} odaya katıldı ${code} (${r.guests.size + 1} kişi)`);
        break;
      }
      case '_resume': {
        const code = String(m.code || '').toUpperCase();
        const r = rooms.get(code);
        if (!r || !m.tok) return sendJ(ws, { t: '_gone' });
        if (m.tok === r.hostTok) {
          if (r.host && r.host !== ws) { r.host.room = null; try { r.host.terminate(); } catch (e) {} }
          clearTimeout(r.hostTimer);
          r.host = ws; ws.room = r; ws.role = 'host'; ws.code = code;
          sendJ(ws, { t: '_resumed', partner: true });
          for (const [gid, g] of r.guests) { sendJ(g.ws, { t: '_resumed', partner: true }); if (g.ws) sendJ(ws, { t: '_gjoin', g: gid }); }
          log(`Oda sahibi geri bağlandı ${code}`);
          return;
        }
        for (const [gid, g] of r.guests) if (g.tok === m.tok) {
          if (g.ws && g.ws !== ws) { g.ws.room = null; try { g.ws.terminate(); } catch (e) {} }
          clearTimeout(g.timer);
          g.ws = ws; ws.room = r; ws.role = 'guest'; ws.code = code; ws.gid = gid;
          sendJ(ws, { t: '_resumed', partner: !!r.host });
          for (const q of g.queue.splice(0)) ws.send(q);
          log(`Misafir geri bağlandı ${code}`);
          return;
        }
        sendJ(ws, { t: '_gone' });
        break;
      }
      case '_kick': {
        if (!room || ws.role !== 'host') return;
        const g = room.guests.get(m.g); if (!g) return;
        setTimeout(() => { if (g.ws) { sendJ(g.ws, { t: '_left' }); g.ws.room = null; } dropGuest(room, m.g); }, 150);
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

function dropGuest(r, gid) {
  const g = r.guests.get(gid); if (!g) return;
  clearTimeout(g.timer);
  r.guests.delete(gid);
  sendJ(r.host, { t: '_gleave', g: gid });
}
function closeRoom(code, r) {
  for (const g of r.guests.values()) { clearTimeout(g.timer); if (g.ws) { sendJ(g.ws, { t: '_left' }); g.ws.room = null; } }
  clearTimeout(r.hostTimer);
  rooms.delete(code);
  log(`Oda kapandı ${code}`);
}

// intentional: true = kasıtlı çıkış (hemen), false = kopma (bekleme süresi tanı)
function leave(ws, intentional) {
  const r = ws.room;
  if (!r) return;
  ws.room = null;
  const code = ws.code;
  if (ws.role === 'host' && r.host === ws) {
    r.host = null;
    if (intentional) { closeRoom(code, r); return; }
    for (const g of r.guests.values()) sendJ(g.ws, { t: '_paused' });
    r.hostTimer = setTimeout(() => { if (!r.host) closeRoom(code, r); }, GRACE);
  } else if (ws.role === 'guest') {
    const g = r.guests.get(ws.gid);
    if (!g || g.ws !== ws) return;
    g.ws = null;
    if (intentional) { dropGuest(r, ws.gid); log(`Misafir ayrıldı ${code}`); return; }
    g.timer = setTimeout(() => { if (!g.ws) { dropGuest(r, ws.gid); log(`Misafir düştü ${code}`); } }, GRACE);
  }
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
