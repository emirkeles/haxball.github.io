// TOPARLAK — sabitler, yetenekler, renkler
window.TP = window.TP || {};

TP.C = {
  TICK: 1 / 60,
  // Saha (dünya koordinatları, merkez 0,0)
  FW: 420,          // saha yarı genişliği (çizgi)
  FH: 200,          // saha yarı yüksekliği
  GH: 66,           // kale ağzı yarı yüksekliği
  GD: 46,           // kale derinliği
  OW: 502,          // oyuncu sınırı yarı genişlik
  OH: 254,          // oyuncu sınırı yarı yükseklik
  CENTER_R: 76,
  POST_R: 7,

  PLAYER_R: 16,
  PLAYER_ACC: 0.125,
  PLAYER_KICK_ACC: 0.088,
  PLAYER_DAMP: 0.958,
  PLAYER_INVMASS: 0.5,

  BALL_R: 10,
  BALL_DAMP: 0.99,
  BALL_INVMASS: 1,
  BALL_BOUNCE: 0.5,
  PLAYER_BOUNCE: 0.5,

  KICK_RANGE: 4.5,
  KICK_BASE: 5.4,
  KICK_CHARGE_BONUS: 5.6,
  CHARGE_TIME: 55,  // tick'te tam şarj
  KICK_RECOIL: 0.35,

  GOAL_PAUSE: 170,  // gol sonrası tick
  KICKOFF_FREEZE: 50,
};

// Yetenekler
TP.ABILITIES = {
  roket:  { name: 'Roket Şut',   icon: '🚀', cd: 9.5, desc: 'Sonraki şutun alev alır: çok hızlı gider, rakibe çarparsa onu savurur ve sersemletir.' },
  atilma: { name: 'Atılma',      icon: '💨', cd: 4.5, desc: 'Gittiğin yöne ani hız patlaması. Rakibe çarparsan onu itersin.' },
  falso:  { name: 'Falso',       icon: '🌀', cd: 7,   desc: 'Sonraki şutun kavis alır. Şut anında yana basarak falsonun yönünü seç.' },
  sok:    { name: 'Şok Dalgası', icon: '💥', cd: 8,   desc: 'Etrafındaki top ve rakibi güçlü bir dalgayla dışarı fırlatır.' },
  miknatis:{ name: 'Mıknatıs',   icon: '🧲', cd: 10,  desc: '1.6 saniye boyunca topu kendine çeker. Dripling ustası.' },
  dev:    { name: 'Dev Mod',     icon: '🦍', cd: 13,  desc: '5 saniye boyunca büyür ve ağırlaşırsın. Kaleyi kapat, rakibi ez.' },
};
TP.ABILITY_KEYS = Object.keys(TP.ABILITIES);

TP.PATTERNS = [
  { id: 'duz', name: 'Düz' },
  { id: 'dikey', name: 'Dikey Çizgi' },
  { id: 'yatay', name: 'Yatay Çizgi' },
  { id: 'yarim', name: 'Yarım' },
  { id: 'capraz', name: 'Çapraz Bant' },
  { id: 'halka', name: 'Halka' },
  { id: 'dama', name: 'Dama' },
  { id: 'sevron', name: 'Şevron' },
];

TP.EYES = [
  { id: 'normal', name: 'Normal' },
  { id: 'kizgin', name: 'Kızgın' },
  { id: 'sevimli', name: 'Sevimli' },
  { id: 'havali', name: 'Havalı' },
  { id: 'uykulu', name: 'Uykulu' },
];

TP.SWATCHES = ['#e63946', '#f4a261', '#ffd23f', '#2a9d8f', '#06d6a0', '#118ab2', '#3a86ff', '#7b2cbf',
  '#ff5d8f', '#1d1d1d', '#f8f9fa', '#6c4f3d', '#8ac926', '#0b3d91', '#ff7b00', '#9aa5b1'];

TP.defaultChar = function (i) {
  const presets = [
    { name: 'Oyuncu 1', c1: '#e63946', c2: '#f8f9fa', pattern: 'dikey', number: 10, eyes: 'kizgin', ability: 'roket' },
    { name: 'Oyuncu 2', c1: '#3a86ff', c2: '#ffd23f', pattern: 'halka', number: 7, eyes: 'normal', ability: 'atilma' },
  ];
  return Object.assign({}, presets[i % 2]);
};

TP.randomChar = function (name) {
  const r = (a) => a[Math.floor(Math.random() * a.length)];
  let c1 = r(TP.SWATCHES), c2 = r(TP.SWATCHES);
  while (c2 === c1) c2 = r(TP.SWATCHES);
  return {
    name: name || r(['Robo', 'Bilye', 'Topçu', 'Fırtına', 'Kartal', 'Yumurcak']),
    c1, c2, pattern: r(TP.PATTERNS).id, number: 1 + Math.floor(Math.random() * 99),
    eyes: r(TP.EYES).id, ability: r(TP.ABILITY_KEYS),
  };
};

TP.sanitizeChar = function (c, i) {
  const d = TP.defaultChar(i || 0);
  c = c || {};
  const hex = (v, f) => (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v : f);
  return {
    name: String(c.name || d.name).slice(0, 14),
    c1: hex(c.c1, d.c1),
    c2: hex(c.c2, d.c2),
    pattern: TP.PATTERNS.some(p => p.id === c.pattern) ? c.pattern : d.pattern,
    number: Math.max(0, Math.min(99, parseInt(c.number, 10) || 0)),
    eyes: TP.EYES.some(p => p.id === c.eyes) ? c.eyes : d.eyes,
    ability: TP.ABILITIES[c.ability] ? c.ability : d.ability,
  };
};

// Forma çakışması: renkler çok benzerse ikinci oyuncu deplasman formasını giyer
TP.resolveKits = function (cs) {
  const rgb = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const dist = (a, b) => { const x = rgb(a), y = rgb(b); return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]); };
  const a = cs[0], b = Object.assign({}, cs[1]);
  if (dist(a.c1, b.c1) < 90) {
    if (dist(a.c1, b.c2) >= 90) { const t = b.c1; b.c1 = b.c2; b.c2 = t; }
    else {
      let best = TP.SWATCHES[0], bd = -1;
      for (const s of TP.SWATCHES) { const d = Math.min(dist(s, a.c1), dist(s, a.c2)); if (d > bd) { bd = d; best = s; } }
      b.c1 = best;
    }
  }
  if (a.name === b.name) b.name = b.name.slice(0, 12) + ' 2';
  return [a, b];
};
