// TOPARLAK — oyun akışı, menüler, kart seçimi, ağ senkronu
(function () {
  const $ = (id) => document.getElementById(id);
  const C = TP.C;
  const A = TP.Audio;
  const I = TP.Input;

  function load(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  let chars = load('tp_chars', null);
  if (!Array.isArray(chars) || chars.length < 2) chars = [TP.defaultChar(0), TP.defaultChar(1)];
  chars = chars.map((c, i) => TP.sanitizeChar(c, i));
  const settings = Object.assign({ time: 180, goals: 5, bot: 'orta' }, load('tp_settings', {}));

  const canvas = $('game');
  const R = new TP.Renderer(canvas);
  window.addEventListener('resize', () => R.resize());

  // ---------- durum ----------
  let mode = 'attract';          // attract | bot | local | host | guest
  let sim = null, bots = [], net = null;
  let remoteInput = TP.NO_INPUT, remoteQ = 0;
  let paused = false, slowT = 0, acc = 0;
  let recentEv = [], lastEvId = 0, lastSnapTk = -1, snapAt = 0;
  let matchChars = null, matchOpts = null, matchId = 0, matchMode = null;
  let opponentChar = null, endShown = false, hintTimer = null;
  let guestSeq = 0, lastInputSent = 0, lastInputKey = '';
  let onlineDecks = [null, null];
  const mouse = { x: 0, y: 0 };
  window.addEventListener('mousemove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY; });

  const SCREENS = ['menu', 'creator', 'online', 'help', 'pause', 'endScreen', 'draft', 'keys'];
  function show(id) {
    for (const s of SCREENS) $(s).classList.toggle('hidden', s !== id);
    if (id === 'menu') refreshMenu();
  }
  const visible = (id) => !$(id).classList.contains('hidden');

  function toast(msg, ms) {
    const t = $('toast'); t.textContent = msg; t.classList.remove('hidden');
    clearTimeout(toast.tm); toast.tm = setTimeout(() => t.classList.add('hidden'), ms || 2200);
  }

  // ---------- arka plan (menüde botlar oynar) ----------
  function startAttract() {
    mode = 'attract'; paused = false;
    const a = TP.randomChar(), b = TP.randomChar();
    sim = new TP.Sim({ chars: [a, b], timeLimit: 0, scoreLimit: 0, decks: [TP.randomDeck(), TP.randomDeck()] });
    bots = [new TP.Bot('zor'), new TP.Bot('orta')];
    R.setTeams([a, b]); R.reset();
    $('hud').classList.add('hidden');
  }

  // ---------- maç ----------
  function startMatch(m, cs, opts, decks) {
    mode = m; matchMode = m; paused = false; endShown = false; slowT = 0; acc = 0;
    if (m !== 'guest') cs = TP.resolveKits(cs);
    matchChars = cs; matchOpts = opts;
    sim = new TP.Sim({ chars: cs, timeLimit: opts.time, scoreLimit: opts.goals, decks });
    bots = m === 'bot' ? [null, new TP.Bot(settings.bot)] : [];
    lastSnapTk = -1; lastEvId = 0; recentEv = [];
    R.setTeams(cs); R.reset();
    for (const s of SCREENS) $(s).classList.add('hidden');
    $('hud').classList.remove('hidden');
    for (let i = 0; i < 2; i++) {
      $('sbName' + i).textContent = cs[i].name;
      $('sbBadge' + i).style.background = `linear-gradient(90deg, ${cs[i].c1} 50%, ${cs[i].c2} 50%)`;
      const card = $('ab' + i);
      card.querySelector('.ab-key').textContent = keyLabel(i);
      card.querySelector('.ab-fill').style.background = cs[i].c1;
    }
    hud.ab = [null, null]; hud.next = [null, null]; hud.cls = ['', ''];
    $('ping').classList.toggle('hidden', !(m === 'host' || m === 'guest'));
    hud.score = [-1, -1];
    const L = (s, a) => I.label(s, a, 1);
    const hint = m === 'local'
      ? `P1: WASD • ${L('p1', 'kick')} şut • ${L('p1', 'sp')} koş • ${L('p1', 'ab')} yetenek   |   P2: Oklar • ${L('p2', 'kick')} şut • ${L('p2', 'sp')} koş • ${L('p2', 'ab')} yetenek`
      : `WASD/Oklar hareket • ${I.label('solo', 'kick')} şut (basılı tut = SERT) • ${I.label('solo', 'sp')} koş • ${I.label('solo', 'ab')} yetenek • Esc menü`;
    const h = $('controlsHint'); h.textContent = hint; h.classList.remove('fade', 'hidden');
    clearTimeout(hintTimer); hintTimer = setTimeout(() => h.classList.add('fade'), 7000);
    spiker(`Hoş geldiniz! ${cs[0].name} ile ${cs[1].name} karşı karşıya!`, 3500, true);
    A.init(); A.crowdLevel(0.3);
  }

  function keyLabel(i) {
    if (mode === 'local') return 'Yetenek: ' + I.label(i === 0 ? 'p1' : 'p2', 'ab', 1);
    if (mode === 'bot') return i === 0 ? 'Yetenek: ' + I.label('solo', 'ab', 1) : 'BOT';
    if (mode === 'host') return i === 0 ? 'Yetenek: ' + I.label('solo', 'ab', 1) : 'RAKİP';
    if (mode === 'guest') return i === 1 ? 'Yetenek: ' + I.label('solo', 'ab', 1) : 'RAKİP';
    return '';
  }

  function hostStep() {
    let inputs;
    if (mode === 'attract') inputs = [bots[0].think(sim, 0), bots[1].think(sim, 1)];
    else if (mode === 'bot') inputs = [I.read('solo', 0), bots[1].think(sim, 1)];
    else if (mode === 'local') inputs = [I.read('p1', 0), I.read('p2', 1)];
    else if (mode === 'host') inputs = [I.read('solo', 0), remoteInput];
    sim.step(inputs);
    const evs = sim.events; sim.events = [];
    for (const e of evs) { e.tk = sim.tick; handleEvent(e, mode === 'attract'); }
    if (mode === 'host' && net) {
      if (evs.length) recentEv.push(...evs);
      if (recentEv.length) recentEv = recentEv.filter(e => e.tk > sim.tick - 40);
      net.send({ t: 's', m: matchId, s: sim.snapshot(), ev: recentEv }, true);
    }
    if (mode === 'attract' && (sim.score[0] + sim.score[1] >= 7 || sim.tick > 60 * 150)) startAttract();
  }

  // ---------- spiker ----------
  const LINES = {
    goal: ['{n} ağları sarsıyor!', 'GOOOL! {n} affetmedi!', 'Ne vuruş! {n} kaleciyi çaresiz bıraktı!', '{n} topu ağlara gömdü!', 'Tribünler ayakta! Gol {n}\'den!'],
    goalFast: ['{n} füze gibi vurdu, {k} km/sa!', 'Top ışık hızında! {n}, {k} km/sa!'],
    own: ['Eyvah! {o} kendi kalesine attı!', 'Talihsiz an! {o} topu kendi ağlarına gönderdi!'],
    post: ['Direk! {n} çok şanssız!', 'Direkten döndü! Nefesler tutuldu!', 'Tahta çıktı! {n} az kalsın…'],
    power: ['{n} sert vurdu!', 'Bomba gibi şut {n}\'den!', '{n} topu patlattı!'],
    burn: ['{v} alevlerin içinde kaldı!', 'Roket {v}\'yi yerle bir etti!'],
    tired: ['{n} nefes nefese kaldı!', '{n} çok yoruldu, biraz dinlenmeli.'],
    ab: { dev: '{n} devleşti!', sok: '{n} şok dalgasıyla ortalığı dağıttı!', atilma: '{n} rüzgar gibi atıldı!', roket: '{n} roket şutu hazırlıyor!', falso: '{n} falsolu bir şey deneyecek…',
      miknatis: '{n} topu kendine çekiyor!', buz: '{n} rakibini dondurdu!', isinlan: '{n} topun arkasına ışınlandı!', kalkan: '{n} kalesinin önüne duvar ördü!' },
    overtime: ['Süre bitti, eşitlik! Altın gol zamanı!'],
    end: ['Ve maç bitti! {n} kazanıyor!', 'Son düdük! Zafer {n}\'nin!'],
  };
  const pick = (a) => a[(Math.random() * a.length) | 0];
  function spiker(text, ms, force) {
    const el = $('spiker');
    if (!force && spiker.lock > performance.now()) return;
    $('spikerText').textContent = text; el.classList.add('show');
    spiker.lock = performance.now() + Math.min(ms || 2500, 1600);
    clearTimeout(spiker.tm); spiker.tm = setTimeout(() => el.classList.remove('show'), ms || 2500);
  }
  function fmtLine(s, d) { return s.replace(/\{(\w)\}/g, (_, k) => d[k] != null ? d[k] : ''); }

  // ---------- olaylar ----------
  function handleEvent(e, silent) {
    R.onEvent(e);
    if (silent) return;
    const nm = (t) => matchChars && matchChars[t] ? matchChars[t].name : '';
    switch (e.k) {
      case 'kick': A.kick(e.s); break;
      case 'curve': A.curve(); break;
      case 'power': A.power(e.s); if (Math.random() < 0.35) spiker(fmtLine(pick(LINES.power), { n: nm(e.team) })); break;
      case 'rocket': A.rocket(); break;
      case 'post': A.post(e.s); spiker(fmtLine(pick(LINES.post), { n: nm(sim.lastTouch >= 0 ? sim.lastTouch : 0) }), 2500, true); break;
      case 'wall': A.wall(e.s); break;
      case 'net': A.net(e.s); break;
      case 'bump': A.bump(e.s); break;
      case 'burn': A.burn(); spiker(fmtLine(pick(LINES.burn), { v: nm(e.team) }), 2500, true); break;
      case 'tired': spiker(fmtLine(pick(LINES.tired), { n: nm(e.team) })); break;
      case 'shieldhit': A.wall(6); break;
      case 'ab': A.ability(e.a); if (LINES.ab[e.a]) spiker(fmtLine(LINES.ab[e.a], { n: nm(e.team) })); break;
      case 'whistle': A.whistle(false); centerText('BAŞLA!', 650, true); break;
      case 'goal': {
        A.goal(); slowT = 0.6; goalBanner(e);
        const k = Math.round(e.s * 10.8);
        const line = e.own ? pick(LINES.own) : k > 115 ? pick(LINES.goalFast) : pick(LINES.goal);
        spiker(fmtLine(line, { n: nm(e.team), o: nm(1 - e.team), k }), 3500, true);
        break;
      }
      case 'overtime': A.whistle(false); centerText('ALTIN GOL!', 2000, true); spiker(LINES.overtime[0], 3000, true); break;
      case 'end': A.whistle(true); A.end(); if (e.winner >= 0) spiker(fmtLine(pick(LINES.end), { n: nm(e.winner) }), 4000, true); setTimeout(showEnd, 1700); break;
    }
  }

  function centerText(str, ms, pop) {
    const el = $('centerText');
    el.textContent = str; el.classList.add('show');
    if (pop) { el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); }
    clearTimeout(centerText.tm);
    if (ms) centerText.tm = setTimeout(() => el.classList.remove('show'), ms);
  }

  function goalBanner(e) {
    const cs = matchChars;
    const gb = $('goalBanner');
    gb.style.setProperty('--gcol', cs[e.team].c1);
    const kmh = Math.round(e.s * 10.8);
    gb.querySelector('.gb-word').textContent = kmh > 110 ? 'GOOOOL!' : kmh > 80 ? 'GOOOL!' : 'GOOL!';
    const fire = sim.lastGoal && sim.lastGoal.fire;
    let sub = e.own ? `${cs[1 - e.team].name} kendi kalesine!` : `${cs[e.team].name}${fire ? ' • 🔥 ROKET GOL' : ''}`;
    sub += `  •  ${kmh} km/sa`;
    gb.querySelector('.gb-sub').textContent = sub;
    gb.classList.remove('show'); void gb.offsetWidth; gb.classList.add('show');
    const sc = $('sbScore' + e.team);
    sc.classList.remove('bump'); void sc.offsetWidth; sc.classList.add('bump');
  }

  // ---------- HUD ----------
  const hud = { score: [-1, -1], time: '', cls: ['', ''], ab: [null, null], next: [null, null], st: [-1, -1] };
  function fmt(t) { t = Math.max(0, Math.ceil(t / 60)); return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'); }
  function updateHUD() {
    if (!sim || mode === 'attract') return;
    for (let i = 0; i < 2; i++) if (hud.score[i] !== sim.score[i]) { hud.score[i] = sim.score[i]; $('sbScore' + i).textContent = sim.score[i]; }
    let t;
    if (sim.overtime) t = 'ALTIN GOL';
    else if (sim.timeLeft < 0) t = fmt(sim.tick);
    else t = fmt(sim.timeLeft);
    if (t !== hud.time) { hud.time = t; const el = $('sbTime'); el.textContent = t; el.classList.toggle('ot', sim.overtime || (sim.timeLeft >= 0 && sim.timeLeft < 600)); }
    for (let i = 0; i < 2; i++) {
      const p = sim.players[i];
      const card = $('ab' + i);
      if (p.ability && hud.ab[i] !== p.ability) {
        const swap = hud.ab[i] != null;
        hud.ab[i] = p.ability;
        const ab = TP.ABILITIES[p.ability];
        card.querySelector('.ab-icon').textContent = ab.icon;
        card.querySelector('.ab-name').textContent = ab.name;
        if (swap) { card.classList.remove('swap'); void card.offsetWidth; card.classList.add('swap'); }
      }
      if (hud.next[i] !== p.next) { hud.next[i] = p.next; card.querySelector('.ab-next').textContent = p.next && TP.ABILITIES[p.next] ? TP.ABILITIES[p.next].icon : ''; }
      const armed = p.rocket > 0 || p.curve > 0 || p.magnet > 0 || p.giant > 0;
      const cls = armed ? 'armed' : p.cd > 0 ? 'cool' : 'ready';
      if (hud.cls[i] !== cls) { card.classList.remove('armed', 'cool', 'ready'); card.classList.add(cls); hud.cls[i] = cls; }
      card.querySelector('.ab-fill').style.width = (p.cd > 0 ? (1 - p.cd / p.cdMax) * 100 : 100) + '%';
      const stv = Math.round(p.stamina * 100) + (p.exhausted ? 1000 : 0);
      if (hud.st[i] !== stv) {
        hud.st[i] = stv;
        const bar = card.querySelector('.ab-stam i');
        bar.style.width = (p.stamina * 100) + '%';
        bar.style.background = p.exhausted ? 'var(--red)' : p.stamina < 0.35 ? 'var(--yellow)' : 'var(--green)';
      }
    }
    if (sim.freeze > 0 && sim.phase === 'kickoff') {
      const el = $('centerText');
      if (!el.classList.contains('show') || el.textContent !== 'HAZIR') { el.textContent = 'HAZIR'; el.classList.add('show'); el.classList.remove('pop'); clearTimeout(centerText.tm); }
    }
    if (net && (mode === 'host' || mode === 'guest')) $('ping').textContent = `ping ${Math.round(net.rtt)} ms${net.via === 'relay' ? ' • sunucu' : net.via === 'lan' ? ' • yerel ağ' : ''}`;
  }

  // ---------- maç sonu ----------
  let endWinnerChar = null;
  function showEnd() {
    if (endShown || !sim || sim.phase !== 'over') return;
    endShown = true;
    const cs = matchChars, w = sim.winner;
    let title;
    if (w < 0) title = 'BERABERE';
    else if (mode === 'host' || mode === 'bot') title = w === 0 ? 'KAZANDIN! 🏆' : 'KAYBETTİN';
    else if (mode === 'guest') title = w === 1 ? 'KAZANDIN! 🏆' : 'KAYBETTİN';
    else title = `${cs[w].name} KAZANDI! 🏆`;
    $('endTitle').textContent = title;
    $('endScore').innerHTML = `<span style="color:${cs[0].c1}">${sim.score[0]}</span> - <span style="color:${cs[1].c1}">${sim.score[1]}</span>`;
    const st = sim.stats;
    const pt = st.poss[0] + st.poss[1] || 1;
    const rows = [
      ['Şut', st.kicks[0], st.kicks[1]],
      ['Sert şut', st.power[0], st.power[1]],
      ['Top hakimiyeti', Math.round(st.poss[0] / pt * 100) + '%', Math.round(st.poss[1] / pt * 100) + '%'],
      ['Yetenek', st.abil[0], st.abil[1]],
    ];
    $('endStats').innerHTML = `<tr><td style="color:${cs[0].c1}">${esc(cs[0].name)}</td><td></td><td style="color:${cs[1].c1}">${esc(cs[1].name)}</td></tr>` +
      rows.map(r => `<tr><td>${r[1]}</td><td>${r[0]}</td><td>${r[2]}</td></tr>`).join('');
    endWinnerChar = w >= 0 ? cs[w] : cs[0];
    $('endNote').textContent = mode === 'guest' ? 'Rövanş isteği oda sahibine gider.' : '';
    show('endScreen');
  }

  function rematch() {
    A.uiOk();
    if (mode === 'bot' || mode === 'local') beginOffline(mode);
    else if (mode === 'host') hostBeginDraft();
    else if (mode === 'guest' && net) { net.send({ t: 'rematch' }); toast('Rövanş isteği gönderildi'); }
  }

  function quitToMenu() {
    if (net) { net.close(); net = null; }
    draft = null;
    startAttract();
    show('menu');
  }

  // ---------- duraklatma ----------
  function openPause() {
    if (mode === 'attract' || endShown) return;
    const online = mode === 'host' || mode === 'guest';
    if (!online) paused = true;
    $('pauseTitle').textContent = online ? 'Menü (maç devam ediyor)' : 'Duraklatıldı';
    $('restartBtn').classList.toggle('hidden', mode === 'guest');
    $('quitBtn').textContent = online ? 'Maçtan Ayrıl' : 'Menüye Dön';
    show('pause');
  }
  function closePause() { paused = false; $('pause').classList.add('hidden'); }
  window.addEventListener('keydown', (e) => {
    A.init();
    if (e.code === 'Escape') {
      if (visible('pause')) closePause();
      else if (mode !== 'attract' && !visible('endScreen') && !visible('draft')) openPause();
    }
  });
  window.addEventListener('pointerdown', () => A.init());
  $('resumeBtn').onclick = () => { A.ui(); closePause(); };
  $('restartBtn').onclick = () => { A.ui(); if (mode === 'host') hostBeginDraft(); else startMatch(mode, matchChars, matchOpts, sim.players.map(p => p.deck)); };
  $('quitBtn').onclick = () => { A.ui(); quitToMenu(); };
  $('rematchBtn').onclick = rematch;
  $('endMenuBtn').onclick = () => { A.ui(); quitToMenu(); };

  // ---------- menü ----------
  function refreshMenu() {
    $('menuCharName').textContent = chars[0].name;
    for (const b of $('botLevel').children) b.classList.toggle('on', b.dataset.v === settings.bot);
    $('setTime').value = String(settings.time);
    $('setGoals').value = String(settings.goals);
    $('muteBtn').textContent = A.muted ? '🔇 Ses kapalı' : '🔊 Ses açık';
  }
  $('botLevel').onclick = (e) => { const v = e.target.dataset.v; if (!v) return; settings.bot = v; save('tp_settings', settings); A.ui(); refreshMenu(); };
  $('setTime').onchange = (e) => { settings.time = +e.target.value; save('tp_settings', settings); };
  $('setGoals').onchange = (e) => { settings.goals = +e.target.value; save('tp_settings', settings); };
  $('muteBtn').onclick = () => { A.init(); A.toggleMute(); refreshMenu(); };

  function beginOffline(m) {
    const opts = { time: settings.time, goals: settings.goals };
    if (m === 'bot') {
      const bc = TP.randomChar(['Robo', 'Çelik', 'Vınn', 'Tornado', 'Pervane'][Math.floor(Math.random() * 5)]);
      bc.name = 'BOT ' + bc.name;
      const cs = [chars[0], bc];
      openDraft([{ idx: 0, ch: chars[0], slot: 0 }], (decks) => startMatch('bot', cs, opts, [decks[0], TP.randomDeck()]));
    } else {
      const cs = [chars[0], chars[1]];
      openDraft([{ idx: 0, ch: chars[0], slot: 0 }, { idx: 1, ch: chars[1], slot: 1 }], (decks) => startMatch('local', cs, opts, decks));
    }
  }

  document.addEventListener('click', (e) => {
    const go = e.target.closest('[data-go]');
    if (!go) return;
    A.init(); A.ui();
    const g = go.dataset.go;
    if (g === 'bot') { mode = 'attract'; beginOffline('bot'); }
    else if (g === 'local') { mode = 'attract'; beginOffline('local'); }
    else if (g === 'online') openOnline();
    else if (g === 'creator') openCreator(0);
    else if (g === 'help') { fillHelp(); show('help'); }
    else if (g === 'keys') { buildKeys(); show('keys'); }
    else if (g === 'menu') { I.cancelCapture(); show('menu'); }
  });

  function fillHelp() {
    $('helpAbs').innerHTML = TP.ABILITY_KEYS.map(k => { const a = TP.ABILITIES[k]; return `<div><b>${a.icon} ${a.name} <span class="muted">(${a.cd} sn)</span></b>${a.desc}</div>`; }).join('');
    const row = (lbl, s) => `<tr><td>${lbl}</td><td>${I.label(s, 'up', 1)}${I.label(s, 'left', 1)}${I.label(s, 'down', 1)}${I.label(s, 'right', 1)}</td><td>${I.label(s, 'kick')}</td><td>${I.label(s, 'sp')}</td><td>${I.label(s, 'ab')}</td></tr>`;
    $('helpKeys').innerHTML = '<tr><th></th><th>Hareket</th><th>Şut</th><th>Koş</th><th>Yetenek</th></tr>' +
      row('Tek / Online', 'solo') + row('Aynı klavye P1', 'p1') + row('Aynı klavye P2', 'p2') +
      '<tr><td>Gamepad</td><td>Sol çubuk</td><td>A / RT</td><td>RB / LT</td><td>B / X / Y</td></tr>';
  }

  // ---------- tuş ayarları ----------
  let keyScheme = 'solo';
  function buildKeys() {
    for (const b of $('keyTabs').children) b.classList.toggle('on', b.dataset.s === keyScheme);
    $('keyList').innerHTML = I.ACTIONS.map(a => `<div class="krow"><span>${a.name}</span><button class="kbtn" data-a="${a.id}">${esc(I.label(keyScheme, a.id, 3))}</button></div>`).join('');
  }
  $('keyTabs').onclick = (e) => { const s = e.target.dataset.s; if (!s) return; I.cancelCapture(); keyScheme = s; A.ui(); buildKeys(); };
  $('keyList').onclick = (e) => {
    const b = e.target.closest('.kbtn'); if (!b) return;
    buildKeys();
    const btn = $('keyList').querySelector(`[data-a="${b.dataset.a}"]`);
    btn.classList.add('wait'); btn.textContent = 'Bir tuşa bas…';
    I.capture((code) => { if (code !== 'Escape') { I.setBind(keyScheme, b.dataset.a, code); A.uiOk(); } buildKeys(); });
  };
  $('keyReset').onclick = () => { I.resetBinds(keyScheme); A.ui(); buildKeys(); };

  // ---------- karakter çizimi (önizlemeler) ----------
  function fitCanvas(cv) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(cv.clientWidth * dpr), h = Math.round(cv.clientHeight * dpr);
    if (w > 0 && (cv.width !== w || cv.height !== h)) { cv.width = w; cv.height = h; }
  }
  const blinkState = new Map();
  function drawChar(cv, ch, opt) {
    opt = opt || {};
    fitCanvas(cv);
    const ctx = cv.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    const r = cv.width * (opt.scale || 0.3);
    const t = performance.now() / 16.67;
    let look = opt.look;
    if (look == null) {
      const rect = cv.getBoundingClientRect();
      look = Math.atan2(mouse.y - (rect.top + rect.height / 2), mouse.x - (rect.left + rect.width / 2));
    }
    let bs = blinkState.get(cv); if (!bs) { bs = { t: 60 + Math.random() * 200 }; blinkState.set(cv, bs); }
    bs.t -= 1; if (bs.t < -7) bs.t = 120 + Math.random() * 220;
    const bob = opt.still ? 0 : Math.abs(Math.sin(t * 0.06)) * r * 0.06;
    ctx.translate(cv.width / 2, cv.height / 2 + r * 0.12);
    if (!opt.noShadow) {
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath(); ctx.ellipse(r * 0.1, r * 0.95, r * 0.9 * (1 - bob / r), r * 0.28, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.translate(0, -bob);
    TP.drawPlayerBody(ctx, { r }, ch, { look, blink: !opt.still && bs.t < 0, kickReady: !!opt.ring, t, mood: opt.mood, feet: opt.noFeet ? false : null });
  }

  // ---------- karakter oluşturucu ----------
  let editIdx = 0;
  function openCreator(i) { editIdx = i; show('creator'); buildCreator(); }
  function chipsHTML(list, cur, attr) { return list.map(p => `<button class="chip ${cur === p.id ? 'on' : ''}" data-${attr}="${p.id}"><canvas width="92" height="92"></canvas>${p.name}</button>`).join(''); }
  function buildCreator() {
    const ch = chars[editIdx];
    for (const b of $('creatorTabs').children) b.classList.toggle('on', +b.dataset.i === editIdx);
    $('cName').value = ch.name; $('cNum').value = ch.number;
    buildSwatches('sw1', 'c1', TP.SWATCHES); buildSwatches('sw2', 'c2', TP.SWATCHES); buildSwatches('swH', 'hairColor', TP.HAIR_COLORS);
    $('patterns').innerHTML = chipsHTML(TP.PATTERNS, ch.pattern, 'p');
    $('eyes').innerHTML = chipsHTML(TP.EYES, ch.eyes, 'e');
    $('hairs').innerHTML = chipsHTML(TP.HAIRS, ch.hair, 'h');
    $('accs').innerHTML = chipsHTML(TP.ACCS, ch.acc, 'c');
    drawChips();
  }
  function drawChips() {
    const ch = chars[editIdx];
    const o = { look: 0.6, still: true, noShadow: true, scale: 0.34, noFeet: true };
    $('patterns').querySelectorAll('.chip').forEach(el => drawChar(el.querySelector('canvas'), Object.assign({}, ch, { pattern: el.dataset.p }), o));
    $('eyes').querySelectorAll('.chip').forEach(el => drawChar(el.querySelector('canvas'), Object.assign({}, ch, { eyes: el.dataset.e }), o));
    $('hairs').querySelectorAll('.chip').forEach(el => drawChar(el.querySelector('canvas'), Object.assign({}, ch, { hair: el.dataset.h }), o));
    $('accs').querySelectorAll('.chip').forEach(el => drawChar(el.querySelector('canvas'), Object.assign({}, ch, { acc: el.dataset.c }), o));
  }
  function buildSwatches(id, key, list) {
    const ch = chars[editIdx];
    const el = $(id);
    el.innerHTML = list.map(c => `<button class="swatch ${ch[key] === c ? 'on' : ''}" data-c="${c}" style="background:${c}"></button>`).join('') +
      `<label class="swatch custom ${list.includes(ch[key]) ? '' : 'on'}" title="Özel renk"><input type="color" value="${ch[key]}"></label>`;
    el.onclick = (e) => { const c = e.target.dataset && e.target.dataset.c; if (!c) return; ch[key] = c; A.ui(); buildSwatches(id, key, list); drawChips(); };
    el.querySelector('input').oninput = (e) => { ch[key] = e.target.value; drawChips(); el.querySelectorAll('.swatch').forEach(s => s.classList.remove('on')); el.querySelector('.custom').classList.add('on'); };
  }
  $('creatorTabs').onclick = (e) => { const i = e.target.dataset.i; if (i == null) return; A.ui(); editIdx = +i; buildCreator(); };
  $('cName').oninput = (e) => { chars[editIdx].name = e.target.value.slice(0, 14) || 'Oyuncu'; };
  $('cNum').oninput = (e) => { chars[editIdx].number = Math.max(0, Math.min(99, parseInt(e.target.value, 10) || 0)); drawChips(); };
  const chipHandler = (id, key, attr) => { $(id).onclick = (e) => { const b = e.target.closest('.chip'); if (!b) return; chars[editIdx][key] = b.dataset[attr]; A.ui(); buildCreator(); }; };
  chipHandler('patterns', 'pattern', 'p'); chipHandler('eyes', 'eyes', 'e'); chipHandler('hairs', 'hair', 'h'); chipHandler('accs', 'acc', 'c');
  $('randomBtn').onclick = () => { const r = TP.randomChar(chars[editIdx].name); r.number = chars[editIdx].number; chars[editIdx] = r; A.uiOk(); buildCreator(); };
  $('creatorDone').onclick = () => {
    chars = chars.map((c, i) => TP.sanitizeChar(c, i));
    save('tp_chars', chars); A.uiOk();
    if (net && net.connected) { net.send({ t: 'hello', ch: chars[0] }); show('online'); refreshLobby(); }
    else show('menu');
  };

  // ---------- KART SEÇİMİ ----------
  const CARD_COLORS = { roket: ['#ff7b00', '#7a1e00'], atilma: ['#9aa5b1', '#2b3748'], falso: ['#9b5de5', '#3c1a6e'], sok: ['#f8f9fa', '#5c677d'], miknatis: ['#3a86ff', '#0b3d91'],
    dev: ['#8ac926', '#2d5016'], buz: ['#a2d2ff', '#1d4e89'], isinlan: ['#e0c3ff', '#5a189a'], kalkan: ['#ffd23f', '#7a5c00'] };
  let draft = null;
  // players: [{idx, ch, slot}], online: true ise süre sınırı ve bekleme
  function openDraft(players, onDone, online) {
    draft = { players, k: 0, decks: [null, null], onDone, online, sel: [] };
    draftFor(0);
  }
  function draftFor(k) {
    const pl = draft.players[k];
    draft.k = k;
    const prev = load('tp_deck' + pl.slot, []);
    draft.sel = Array.isArray(prev) ? prev.filter(a => TP.ABILITIES[a]).slice(0, TP.DECK_SIZE) : [];
    draft.ch = pl.ch;
    $('draftWho').textContent = draft.players.length > 1 ? `${pl.ch.name} seçiyor (${k + 1}/${draft.players.length})` : pl.ch.name;
    $('draftCards').innerHTML = TP.ABILITY_KEYS.map((a, i) => {
      const A_ = TP.ABILITIES[a], c = CARD_COLORS[a] || ['#2b3748', '#18202b'];
      return `<button class="acard" data-a="${a}" style="--ca:${c[0]};--cb:${c[1]};animation-delay:${i * 45}ms"><div class="badge"></div><div class="art">${A_.icon}</div>
        <div class="body"><div class="nm">${A_.name}</div><div class="cdv">⏱ ${A_.cd} sn bekleme</div><div class="ds">${A_.desc}</div></div></button>`;
    }).join('');
    $('draftWait').classList.add('hidden');
    $('draftCards').classList.remove('hidden'); $('draftRandom').disabled = false;
    refreshDraft();
    show('draft');
    clearInterval(draft.timer);
    $('draftTimer').classList.toggle('hidden', !draft.online);
    if (draft.online) {
      let left = 30; $('draftTimer').textContent = left;
      draft.timer = setInterval(() => {
        left--; $('draftTimer').textContent = left;
        if (left <= 5 && left > 0) A.tick();
        if (left <= 0) { clearInterval(draft.timer); fillRandom(); confirmDraft(); }
      }, 1000);
    }
  }
  function refreshDraft() {
    const sel = draft.sel;
    $('draftCards').querySelectorAll('.acard').forEach(el => {
      const i = sel.indexOf(el.dataset.a);
      el.classList.toggle('on', i >= 0);
      el.classList.toggle('dim', i < 0 && sel.length >= TP.DECK_SIZE);
      el.querySelector('.badge').textContent = i >= 0 ? i + 1 : '';
    });
    let h = '';
    for (let i = 0; i < TP.DECK_SIZE; i++) h += sel[i] ? `<span class="f">${TP.ABILITIES[sel[i]].icon}</span>` : '<span>?</span>';
    $('draftPicked').innerHTML = h;
    $('draftOk').disabled = sel.length !== TP.DECK_SIZE;
  }
  function fillRandom() {
    const pool = TP.ABILITY_KEYS.filter(a => !draft.sel.includes(a)).sort(() => Math.random() - 0.5);
    while (draft.sel.length < TP.DECK_SIZE) draft.sel.push(pool.shift());
  }
  $('draftCards').onclick = (e) => {
    const c = e.target.closest('.acard'); if (!c || !draft) return;
    const a = c.dataset.a, i = draft.sel.indexOf(a);
    if (i >= 0) { draft.sel.splice(i, 1); A.ui(); }
    else if (draft.sel.length < TP.DECK_SIZE) { draft.sel.push(a); A.ability(a); }
    else { draft.sel[TP.DECK_SIZE - 1] = a; A.ability(a); }
    refreshDraft();
  };
  $('draftRandom').onclick = () => { if (!draft) return; draft.sel = []; fillRandom(); A.uiOk(); refreshDraft(); };
  $('draftOk').onclick = () => confirmDraft();
  function confirmDraft() {
    if (!draft || draft.sel.length !== TP.DECK_SIZE) return;
    clearInterval(draft.timer);
    const pl = draft.players[draft.k];
    draft.decks[pl.idx] = draft.sel.slice();
    save('tp_deck' + pl.slot, draft.sel);
    A.uiOk();
    if (draft.k + 1 < draft.players.length) { draftFor(draft.k + 1); return; }
    const d = draft; draft = d.online ? d : null;
    if (d.online) {
      $('draftCards').classList.add('hidden'); $('draftWait').classList.remove('hidden');
      $('draftOk').disabled = true; $('draftRandom').disabled = true; $('draftTimer').classList.add('hidden');
    }
    d.onDone(d.decks);
  }

  // ---------- online ----------
  function openOnline(code) {
    if (!TP.Net.available()) { toast('Online kütüphanesi yüklenemedi — internet bağlantını kontrol et.', 3500); return; }
    show('online');
    $('onlineChoose').classList.remove('hidden');
    $('onlineWait').classList.add('hidden'); $('lobby').classList.add('hidden'); $('onlineError').classList.add('hidden');
    if (code) { $('joinCode').value = code; doJoin(); }
    else if (TP.Net.LAN) startRoomPoll();
  }
  // yerel ağdaki açık odalar
  let roomPoll = null;
  function startRoomPoll() {
    stopRoomPoll();
    const tick = () => TP.Net.lanRooms((list) => {
      const el = $('lanRooms');
      if (!list) { el.classList.add('hidden'); return; }
      el.classList.remove('hidden');
      el.innerHTML = list.length
        ? '<div class="rooms-h">Açık odalar</div>' + list.map(r => `<button class="btn small room" data-code="${r.code}">⚽ ${esc(r.name)} <b>${r.code}</b> — Katıl</button>`).join('')
        : '<div class="rooms-h">Henüz açık oda yok…</div>';
    });
    tick(); roomPoll = setInterval(() => { if (visible('online') && visible('onlineChoose')) tick(); }, 2000);
  }
  function stopRoomPoll() { clearInterval(roomPoll); roomPoll = null; }
  $('lanRooms').onclick = (e) => { const b = e.target.closest('.room'); if (!b) return; $('joinCode').value = b.dataset.code; doJoin(); };
  function onlineErr(msg) {
    const el = $('onlineError'); el.textContent = msg; el.classList.remove('hidden');
    $('spinner').classList.add('hidden');
  }
  function wireNet(n) {
    n.on('error', (m) => onlineErr(m));
    n.on('status', (m) => { $('onlineStatus').textContent = m; });
    n.on('connected', (via) => {
      stopRoomPoll();
      $('onlineStatus').textContent = via === 'relay' ? 'Bağlandı (sunucu üzerinden)!' : 'Bağlandı!';
      n.send({ t: 'hello', ch: chars[0] });
      A.uiOk();
    });
    n.on('lost', () => {
      toast('Bağlantı koptu 😕', 3500);
      net = null; n.close(); draft = null;
      startAttract(); show('menu');
    });
    n.on('msg', onNetMsg);
  }
  function doHost() {
    A.init();
    if (net) net.close();
    net = TP.Net.host(chars[0].name); wireNet(net);
    $('onlineChoose').classList.add('hidden'); $('onlineWait').classList.remove('hidden'); $('onlineError').classList.add('hidden');
    $('codeBox').classList.add('hidden'); $('spinner').classList.remove('hidden');
    $('onlineStatus').textContent = 'Oda kuruluyor…';
    net.on('code', (code) => {
      $('roomCode').textContent = code; $('codeBox').classList.remove('hidden');
      $('onlineStatus').textContent = 'Arkadaşın bekleniyor… Kodu ona gönder.';
    });
  }
  function doJoin() {
    A.init();
    const code = $('joinCode').value.trim().toUpperCase();
    if (code.length < 5) { onlineErr('Kod 5 karakter olmalı.'); return; }
    if (net) net.close();
    net = TP.Net.join(code); wireNet(net);
    $('onlineChoose').classList.add('hidden'); $('onlineWait').classList.remove('hidden'); $('onlineError').classList.add('hidden');
    $('codeBox').classList.add('hidden'); $('spinner').classList.remove('hidden');
    $('onlineStatus').textContent = `${code} odasına bağlanılıyor…`;
  }
  $('hostBtn').onclick = doHost;
  $('joinBtn').onclick = doJoin;
  $('joinCode').addEventListener('keydown', (e) => { if (e.key === 'Enter') doJoin(); });
  $('joinCode').addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
  $('copyCode').onclick = () => copy($('roomCode').textContent);
  $('copyLink').onclick = () => copy(location.origin + location.pathname + '#' + $('roomCode').textContent);
  function copy(s) { (navigator.clipboard ? navigator.clipboard.writeText(s) : Promise.reject()).then(() => toast('Kopyalandı: ' + s)).catch(() => toast(s, 5000)); }
  $('onlineBack').onclick = () => { A.ui(); stopRoomPoll(); if (net) { net.close(); net = null; } show('menu'); };
  $('startOnline').onclick = () => { if (net && net.role === 'host' && opponentChar) hostBeginDraft(); };

  function refreshLobby() {
    if (!net) return;
    $('onlineWait').classList.add('hidden'); $('onlineChoose').classList.add('hidden'); $('lobby').classList.remove('hidden');
    const cs = net.role === 'host' ? [chars[0], opponentChar] : [opponentChar, chars[0]];
    for (let i = 0; i < 2; i++) {
      const c = cs[i];
      $('lobbyN' + i).textContent = c ? c.name + (((net.role === 'host') === (i === 0)) ? ' (sen)' : '') : '…';
      $('lobbyA' + i).textContent = '';
    }
    const tl = settings.time ? `${settings.time / 60} dk` : 'sınırsız süre';
    const gl = settings.goals ? `${settings.goals} gol` : 'gol sınırı yok';
    $('lobbyInfo').innerHTML = net.role === 'host'
      ? `Ayarlar: ${tl} • ${gl} (ana menüden değiştirebilirsin)<br>Başlatınca ikiniz de 3 yetenek kartı seçeceksiniz. <a href="#" id="lobbyEdit" style="color:var(--yellow)">Karakterini düzenle</a>`
      : `Oda sahibinin maçı başlatması bekleniyor…<br><a href="#" id="lobbyEdit" style="color:var(--yellow)">Karakterini düzenle</a>`;
    $('lobbyEdit').onclick = (e) => { e.preventDefault(); openCreator(0); };
    $('startOnline').classList.toggle('hidden', net.role !== 'host');
  }

  function hostBeginDraft() {
    if (!net || !opponentChar) return;
    onlineDecks = [null, null];
    mode = 'attract'; startAttract();
    net.send({ t: 'draft' });
    openDraft([{ idx: 0, ch: chars[0], slot: 0 }], (decks) => { onlineDecks[0] = decks[0]; tryHostStart(); }, true);
  }
  function tryHostStart() {
    if (!onlineDecks[0] || !onlineDecks[1] || !net) return;
    matchId++;
    draft = null;
    const cs = TP.resolveKits([chars[0], opponentChar]);
    const opts = { time: settings.time, goals: settings.goals };
    const decks = onlineDecks.slice();
    net.send({ t: 'start', id: matchId, chars: cs, opts, decks });
    startMatch('host', cs, opts, decks);
  }

  function onNetMsg(m) {
    if (!m || typeof m !== 'object') return;
    switch (m.t) {
      case 'hello':
        opponentChar = TP.sanitizeChar(m.ch, 1);
        if (mode === 'attract' && !visible('draft')) refreshLobby();
        break;
      case 'draft':
        if (net.role !== 'guest') return;
        mode = 'attract'; startAttract();
        openDraft([{ idx: 1, ch: chars[0], slot: 0 }], (decks) => net.send({ t: 'deck', deck: decks[1] }), true);
        break;
      case 'deck':
        if (net.role !== 'host' || !Array.isArray(m.deck)) return;
        onlineDecks[1] = m.deck.filter(a => TP.ABILITIES[a]).slice(0, TP.DECK_SIZE);
        if (onlineDecks[1].length < 1) onlineDecks[1] = TP.randomDeck();
        tryHostStart();
        break;
      case 'start':
        if (net.role !== 'guest') return;
        matchId = m.id; draft = null;
        startMatch('guest', m.chars.map((c, i) => TP.sanitizeChar(c, i)), m.opts, m.decks);
        break;
      case 'rematch':
        if (net.role === 'host' && sim && (sim.phase === 'over' || endShown)) hostBeginDraft();
        else if (net.role === 'host') toast('Rakip rövanş istiyor');
        break;
      case 'i':
        if (net.role !== 'host') return;
        if (m.q > remoteQ || m.q < remoteQ - 1000) { remoteQ = m.q; remoteInput = { x: +m.x || 0, y: +m.y || 0, kick: !!m.k, ab: !!m.a, sp: !!m.p }; }
        break;
      case 's':
        if (mode !== 'guest' || m.m !== matchId) return;
        if (m.s.tk <= lastSnapTk) return;
        lastSnapTk = m.s.tk; snapAt = performance.now();
        sim.applySnapshot(m.s);
        for (const e of m.ev) if (e.id > lastEvId) { lastEvId = e.id; handleEvent(e, false); }
        break;
    }
  }

  function sendGuestInput(now) {
    const inp = I.read('solo', 0);
    const key = `${inp.x},${inp.y},${inp.kick ? 1 : 0},${inp.ab ? 1 : 0},${inp.sp ? 1 : 0}`;
    if (key !== lastInputKey || now - lastInputSent > 33) {
      lastInputKey = key; lastInputSent = now;
      net.send({ t: 'i', q: ++guestSeq, x: inp.x, y: inp.y, k: inp.kick ? 1 : 0, a: inp.ab ? 1 : 0, p: inp.sp ? 1 : 0 }, true);
    }
  }

  // ---------- döngü ----------
  let last = performance.now();
  function pump(now, maxSteps) {
    const dt = Math.min(0.25, (now - last) / 1000); last = now;
    let ts = 1;
    if (slowT > 0) { slowT -= dt; ts = 0.3; }
    if (mode === 'guest') {
      if (net) sendGuestInput(now);
      return { dt, ts, ext: Math.min(5, (now - snapAt) / 16.67 * ts) };
    }
    if (sim && !paused) {
      acc += dt * ts;
      let n = 0;
      while (acc >= C.TICK && n < maxSteps) { acc -= C.TICK; hostStep(); n++; }
      if (n >= maxSteps) acc = 0;
    }
    return { dt, ts, ext: 0 };
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const { dt, ts, ext } = pump(now, 8);
    if (sim) R.draw(sim, paused ? 0 : dt * 60 * ts, ext);
    updateHUD();
    if (visible('menu')) drawChar($('menuPreview'), chars[0]);
    if (visible('creator')) drawChar($('bigPreview'), chars[editIdx], { ring: (performance.now() % 2000) < 400 });
    if (visible('draft') && draft && draft.ch) drawChar($('draftChar'), draft.ch, { scale: 0.28 });
    if (visible('online') && visible('lobby') && net) {
      const cs = net.role === 'host' ? [chars[0], opponentChar] : [opponentChar, chars[0]];
      for (let i = 0; i < 2; i++) if (cs[i]) drawChar($('lobbyC' + i), cs[i], { look: i === 0 ? 0 : Math.PI });
    }
    if (visible('endScreen') && endWinnerChar) drawChar($('endWinner'), endWinnerChar, { mood: 'happy' });
  }
  setInterval(() => { if (document.hidden && mode === 'host') pump(performance.now(), 120); }, 50);

  // ---------- başlat ----------
  $('version').textContent = TP.VERSION + (TP.Net.LAN ? ' • yerel ağ' : '');
  if (TP.Net.LAN) {
    $('onlineBtnTitle').textContent = 'Yerel Ağda Oyna';
    $('onlineBtnSub').textContent = 'Aynı ağdaki arkadaşınla, gecikmesiz';
    $('onlineTitle').textContent = 'Yerel Ağ 1v1';
  }
  startAttract();
  show('menu');
  const hash = location.hash.replace('#', '').toUpperCase();
  if (/^[A-Z0-9]{5}$/.test(hash)) { history.replaceState(null, '', location.pathname); setTimeout(() => openOnline(hash), 200); }
  requestAnimationFrame(frame);

  window.__tp = { get sim() { return sim; }, get mode() { return mode; }, startMatch, chars, settings, R, beginOffline };
})();
