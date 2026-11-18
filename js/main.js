// TOPARLAK — oyun akışı, menüler, ağ senkronu
(function () {
  const $ = (id) => document.getElementById(id);
  const C = TP.C;
  const A = TP.Audio;

  function load(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

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
  let matchChars = null, matchOpts = null, matchId = 0;
  let opponentChar = null, endShown = false, hintTimer = null;
  let guestSeq = 0, lastInputSent = 0, lastInputKey = '';
  let mouse = { x: 0, y: 0 };
  window.addEventListener('mousemove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY; });

  const SCREENS = ['menu', 'creator', 'online', 'help', 'pause', 'endScreen'];
  function show(id) {
    for (const s of SCREENS) $(s).classList.toggle('hidden', s !== id);
    if (id === 'menu') refreshMenu();
  }

  function toast(msg, ms) {
    const t = $('toast'); t.textContent = msg; t.classList.remove('hidden');
    clearTimeout(toast.tm); toast.tm = setTimeout(() => t.classList.add('hidden'), ms || 2200);
  }

  function resetFX() {
    R.fx.parts = []; R.fx.rings = []; R.fx.texts = []; R.ghosts = []; R.confettiT = 0; R.hype = 0; R.shake = 0; R.flash = 0; R.zoomPunch = 0;
  }

  // ---------- arka plan (menüde botlar oynar) ----------
  function startAttract() {
    mode = 'attract'; paused = false;
    const a = TP.randomChar(), b = TP.randomChar();
    sim = new TP.Sim({ chars: [a, b], timeLimit: 0, scoreLimit: 0 });
    bots = [new TP.Bot('zor'), new TP.Bot('orta')];
    R.setTeams([a, b]); resetFX();
    $('hud').classList.add('hidden');
  }

  // ---------- maç ----------
  function startMatch(m, cs, opts) {
    mode = m; paused = false; endShown = false; slowT = 0; acc = 0;
    if (m !== 'guest') cs = TP.resolveKits(cs);
    matchChars = cs; matchOpts = opts;
    sim = new TP.Sim({ chars: cs, timeLimit: opts.time, scoreLimit: opts.goals });
    bots = m === 'bot' ? [null, new TP.Bot(settings.bot)] : [];
    lastSnapTk = -1; lastEvId = 0; recentEv = [];
    R.setTeams(cs); resetFX();
    for (const s of SCREENS) $(s).classList.add('hidden');
    $('hud').classList.remove('hidden');
    for (let i = 0; i < 2; i++) {
      $('sbName' + i).textContent = cs[i].name;
      $('sbBadge' + i).style.background = `linear-gradient(90deg, ${cs[i].c1} 50%, ${cs[i].c2} 50%)`;
      const card = $('ab' + i), ab = TP.ABILITIES[cs[i].ability];
      card.querySelector('.ab-icon').textContent = ab.icon;
      card.querySelector('.ab-name').textContent = ab.name;
      card.querySelector('.ab-key').textContent = keyLabel(i);
      card.querySelector('.ab-fill').style.background = cs[i].c1;
    }
    $('ping').classList.toggle('hidden', !(m === 'host' || m === 'guest'));
    hud.score = [-1, -1];
    const hint = m === 'local'
      ? 'P1: WASD • Space şut • Shift/Q yetenek    |    P2: Oklar • . (nokta) şut • / yetenek    —    şutu basılı tut = SERT ŞUT'
      : 'WASD/Oklar hareket • Space/X şut (basılı tut = SERT ŞUT) • Shift/Z/E yetenek • Esc menü';
    const h = $('controlsHint'); h.textContent = hint; h.classList.remove('fade', 'hidden');
    clearTimeout(hintTimer); hintTimer = setTimeout(() => h.classList.add('fade'), 7000);
    A.init(); A.crowdLevel(0.3);
  }

  function keyLabel(i) {
    if (mode === 'local') return i === 0 ? 'Shift / Q' : '/ veya Sağ Shift';
    if (mode === 'bot') return i === 0 ? 'Shift / Z / E' : 'BOT';
    if (mode === 'host') return i === 0 ? 'Shift / Z / E' : 'RAKİP';
    if (mode === 'guest') return i === 1 ? 'Shift / Z / E' : 'RAKİP';
    return '';
  }

  function hostStep() {
    let inputs;
    if (mode === 'attract') inputs = [bots[0].think(sim, 0), bots[1].think(sim, 1)];
    else if (mode === 'bot') inputs = [TP.Input.read('solo', 0), bots[1].think(sim, 1)];
    else if (mode === 'local') inputs = [TP.Input.read('p1', 0), TP.Input.read('p2', 1)];
    else if (mode === 'host') inputs = [TP.Input.read('solo', 0), remoteInput];
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

  // ---------- olaylar ----------
  function handleEvent(e, silent) {
    R.onEvent(e, sim);
    if (silent) return;
    switch (e.k) {
      case 'kick': A.kick(e.s); break;
      case 'curve': A.curve(); break;
      case 'power': A.power(e.s); break;
      case 'rocket': A.rocket(); break;
      case 'post': A.post(e.s); break;
      case 'wall': A.wall(e.s); break;
      case 'net': A.net(e.s); break;
      case 'bump': A.bump(e.s); break;
      case 'burn': A.burn(); break;
      case 'ab': A.ability(e.a); break;
      case 'whistle': A.whistle(false); centerText('BAŞLA!', 650, true); break;
      case 'goal': A.goal(); slowT = 0.6; goalBanner(e); break;
      case 'overtime': A.whistle(false); centerText('ALTIN GOL!', 2000, true); break;
      case 'end': A.whistle(true); A.end(); setTimeout(showEnd, 1700); break;
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
    const own = e.own;
    gb.style.setProperty('--gcol', cs[e.team].c1);
    const words = ['GOL!', 'GOOL!', 'GOOOL!', 'GOOOOL!'];
    const kmh = Math.round(e.s * 10.8);
    gb.querySelector('.gb-word').textContent = kmh > 110 ? words[3] : kmh > 80 ? words[2] : words[1];
    const fire = sim.lastGoal && sim.lastGoal.fire;
    let sub = own ? `${cs[1 - e.team].name} kendi kalesine!` : `${cs[e.team].name}${fire ? ' • 🔥 ROKET GOL' : ''}`;
    sub += `  •  ${kmh} km/sa`;
    gb.querySelector('.gb-sub').textContent = sub;
    gb.classList.remove('show'); void gb.offsetWidth; gb.classList.add('show');
    const sc = $('sbScore' + e.team);
    sc.classList.remove('bump'); void sc.offsetWidth; sc.classList.add('bump');
  }

  // ---------- HUD ----------
  const hud = { score: [-1, -1], time: '', cls: ['', ''] };
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
      const armed = p.rocket > 0 || p.curve > 0 || p.magnet > 0 || p.giant > 0;
      const cls = armed ? 'armed' : p.cd > 0 ? 'cool' : 'ready';
      const card = $('ab' + i);
      if (hud.cls[i] !== cls) { card.classList.remove('armed', 'cool', 'ready'); card.classList.add(cls); hud.cls[i] = cls; }
      card.querySelector('.ab-fill').style.width = (p.cd > 0 ? (1 - p.cd / p.cdMax) * 100 : 100) + '%';
    }
    if (sim.freeze > 0 && sim.phase === 'kickoff') {
      const el = $('centerText');
      if (!el.classList.contains('show') || el.textContent !== 'HAZIR') { el.textContent = 'HAZIR'; el.classList.add('show'); el.classList.remove('pop'); clearTimeout(centerText.tm); }
    }
    if (net && (mode === 'host' || mode === 'guest')) $('ping').textContent = `ping ${Math.round(net.rtt)} ms`;
  }

  // ---------- maç sonu ----------
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
  let endWinnerChar = null;
  function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  function rematch() {
    A.uiOk();
    if (mode === 'bot' || mode === 'local') startMatch(mode, matchChars, matchOpts);
    else if (mode === 'host') hostStartGame();
    else if (mode === 'guest' && net) { net.send({ t: 'rematch' }); toast('Rövanş isteği gönderildi'); }
  }

  function quitToMenu() {
    if (net) { net.close(); net = null; }
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
      if (!$('pause').classList.contains('hidden')) closePause();
      else if (mode !== 'attract' && $('endScreen').classList.contains('hidden')) openPause();
    }
  });
  window.addEventListener('pointerdown', () => A.init());
  $('resumeBtn').onclick = () => { A.ui(); closePause(); };
  $('restartBtn').onclick = () => { A.ui(); if (mode === 'host') hostStartGame(); else startMatch(mode, matchChars, matchOpts); };
  $('quitBtn').onclick = () => { A.ui(); quitToMenu(); };
  $('rematchBtn').onclick = rematch;
  $('endMenuBtn').onclick = () => { A.ui(); quitToMenu(); };

  // ---------- menü ----------
  function refreshMenu() {
    $('menuCharName').textContent = chars[0].name;
    const ab = TP.ABILITIES[chars[0].ability];
    $('menuCharAb').textContent = `${ab.icon} ${ab.name}`;
    for (const b of $('botLevel').children) b.classList.toggle('on', b.dataset.v === settings.bot);
    $('setTime').value = String(settings.time);
    $('setGoals').value = String(settings.goals);
    $('muteBtn').textContent = A.muted ? '🔇 Ses kapalı' : '🔊 Ses açık';
  }
  $('botLevel').onclick = (e) => { const v = e.target.dataset.v; if (!v) return; settings.bot = v; save('tp_settings', settings); A.ui(); refreshMenu(); };
  $('setTime').onchange = (e) => { settings.time = +e.target.value; save('tp_settings', settings); };
  $('setGoals').onchange = (e) => { settings.goals = +e.target.value; save('tp_settings', settings); };
  $('muteBtn').onclick = () => { A.init(); A.toggleMute(); refreshMenu(); };

  document.addEventListener('click', (e) => {
    const go = e.target.closest('[data-go]');
    if (!go) return;
    A.init(); A.ui();
    const g = go.dataset.go;
    if (g === 'bot') {
      const bc = TP.randomChar(['Robo', 'Çelik', 'Vınn', 'Bilgisayar', 'Tornado'][Math.floor(Math.random() * 5)]);
      bc.name = 'BOT ' + bc.name;
      startMatch('bot', [chars[0], bc], { time: settings.time, goals: settings.goals });
    } else if (g === 'local') startMatch('local', [chars[0], chars[1]], { time: settings.time, goals: settings.goals });
    else if (g === 'online') openOnline();
    else if (g === 'creator') openCreator(0);
    else if (g === 'help') { fillHelp(); show('help'); }
    else if (g === 'menu') show('menu');
  });

  function fillHelp() {
    $('helpAbs').innerHTML = TP.ABILITY_KEYS.map(k => { const a = TP.ABILITIES[k]; return `<div><b>${a.icon} ${a.name} <span class="muted">(${a.cd} sn)</span></b>${a.desc}</div>`; }).join('');
  }

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
    const r = cv.width * (opt.scale || 0.36);
    const t = performance.now() / 16.67;
    let look = opt.look;
    if (look == null) {
      const rect = cv.getBoundingClientRect();
      look = Math.atan2(mouse.y - (rect.top + rect.height / 2), mouse.x - (rect.left + rect.width / 2));
    }
    let bs = blinkState.get(cv); if (!bs) { bs = { t: 60 + Math.random() * 200 }; blinkState.set(cv, bs); }
    bs.t -= 1; if (bs.t < -7) bs.t = 120 + Math.random() * 220;
    const bob = opt.still ? 0 : Math.sin(t * 0.06) * r * 0.04;
    ctx.translate(cv.width / 2, cv.height / 2 + bob);
    if (!opt.noShadow) {
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath(); ctx.ellipse(r * 0.12, r * 0.2 - bob, r * 1.0, r * 0.9, 0, 0, Math.PI * 2); ctx.fill();
    }
    TP.drawPlayerBody(ctx, { r }, ch, { look, blink: !opt.still && bs.t < 0, kickReady: !!opt.ring });
  }

  // ---------- karakter oluşturucu ----------
  let editIdx = 0;
  function openCreator(i) {
    editIdx = i; buildCreator(); show('creator');
  }
  function buildCreator() {
    const ch = chars[editIdx];
    for (const b of $('creatorTabs').children) b.classList.toggle('on', +b.dataset.i === editIdx);
    $('cName').value = ch.name; $('cNum').value = ch.number;
    buildSwatches('sw1', 'c1'); buildSwatches('sw2', 'c2');
    $('patterns').innerHTML = TP.PATTERNS.map(p => `<button class="chip ${ch.pattern === p.id ? 'on' : ''}" data-p="${p.id}"><canvas></canvas>${p.name}</button>`).join('');
    $('eyes').innerHTML = TP.EYES.map(p => `<button class="chip ${ch.eyes === p.id ? 'on' : ''}" data-e="${p.id}"><canvas></canvas>${p.name}</button>`).join('');
    $('abilities').innerHTML = TP.ABILITY_KEYS.map(k => { const a = TP.ABILITIES[k]; return `<button class="abl ${ch.ability === k ? 'on' : ''}" data-a="${k}"><div class="t">${a.icon} ${a.name}<i>${a.cd} sn</i></div><div class="d">${a.desc}</div></button>`; }).join('');
    drawChips();
  }
  function drawChips() {
    const ch = chars[editIdx];
    $('patterns').querySelectorAll('.chip').forEach(el => drawChar(el.querySelector('canvas'), Object.assign({}, ch, { pattern: el.dataset.p }), { look: 0.6, still: true, noShadow: true, scale: 0.44 }));
    $('eyes').querySelectorAll('.chip').forEach(el => drawChar(el.querySelector('canvas'), Object.assign({}, ch, { eyes: el.dataset.e }), { look: 0.6, still: true, noShadow: true, scale: 0.44 }));
  }
  function buildSwatches(id, key) {
    const ch = chars[editIdx];
    const el = $(id);
    el.innerHTML = TP.SWATCHES.map(c => `<button class="swatch ${ch[key] === c ? 'on' : ''}" data-c="${c}" style="background:${c}"></button>`).join('') +
      `<label class="swatch custom ${TP.SWATCHES.includes(ch[key]) ? '' : 'on'}" title="Özel renk"><input type="color" value="${ch[key]}"></label>`;
    el.onclick = (e) => { const c = e.target.dataset && e.target.dataset.c; if (!c) return; ch[key] = c; A.ui(); buildSwatches(id, key); drawChips(); };
    el.querySelector('input').oninput = (e) => { ch[key] = e.target.value; drawChips(); el.querySelectorAll('.swatch').forEach(s => s.classList.remove('on')); el.querySelector('.custom').classList.add('on'); };
  }
  $('creatorTabs').onclick = (e) => { const i = e.target.dataset.i; if (i == null) return; A.ui(); editIdx = +i; buildCreator(); };
  $('cName').oninput = (e) => { chars[editIdx].name = e.target.value.slice(0, 14) || 'Oyuncu'; };
  $('cNum').oninput = (e) => { chars[editIdx].number = Math.max(0, Math.min(99, parseInt(e.target.value, 10) || 0)); drawChips(); };
  $('patterns').onclick = (e) => { const b = e.target.closest('.chip'); if (!b) return; chars[editIdx].pattern = b.dataset.p; A.ui(); buildCreator(); };
  $('eyes').onclick = (e) => { const b = e.target.closest('.chip'); if (!b) return; chars[editIdx].eyes = b.dataset.e; A.ui(); buildCreator(); };
  $('abilities').onclick = (e) => { const b = e.target.closest('.abl'); if (!b) return; chars[editIdx].ability = b.dataset.a; A.ability(b.dataset.a); buildCreator(); };
  $('randomBtn').onclick = () => { const r = TP.randomChar(chars[editIdx].name); chars[editIdx] = r; A.uiOk(); buildCreator(); };
  $('creatorDone').onclick = () => {
    chars = chars.map((c, i) => TP.sanitizeChar(c, i));
    save('tp_chars', chars); A.uiOk();
    if (net && net.connected) { net.send({ t: 'hello', ch: chars[0] }); show('online'); refreshLobby(); }
    else show('menu');
  };

  // ---------- online ----------
  function openOnline(code) {
    if (!TP.Net.available()) { toast('Online kütüphanesi yüklenemedi — internet bağlantını kontrol et.', 3500); return; }
    show('online');
    $('onlineChoose').classList.remove('hidden');
    $('onlineWait').classList.add('hidden'); $('lobby').classList.add('hidden'); $('onlineError').classList.add('hidden');
    if (code) { $('joinCode').value = code; doJoin(); }
  }
  function onlineErr(msg) {
    const el = $('onlineError'); el.textContent = msg; el.classList.remove('hidden');
    $('spinner').classList.add('hidden');
  }
  function wireNet(n) {
    n.on('error', (m) => onlineErr(m));
    n.on('connected', () => {
      $('onlineStatus').textContent = 'Bağlandı!';
      n.send({ t: 'hello', ch: chars[0] });
      A.uiOk();
    });
    n.on('lost', () => {
      toast('Bağlantı koptu 😕', 3500);
      net = null; n.close();
      startAttract(); show('menu');
    });
    n.on('msg', onNetMsg);
  }
  function doHost() {
    A.init();
    if (net) net.close();
    net = TP.Net.host(); wireNet(net);
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
  $('onlineBack').onclick = () => { A.ui(); if (net) { net.close(); net = null; } show('menu'); };
  $('startOnline').onclick = () => { if (net && net.role === 'host' && opponentChar) hostStartGame(); };

  function refreshLobby() {
    if (!net) return;
    $('onlineWait').classList.add('hidden'); $('onlineChoose').classList.add('hidden'); $('lobby').classList.remove('hidden');
    const cs = net.role === 'host' ? [chars[0], opponentChar] : [opponentChar, chars[0]];
    for (let i = 0; i < 2; i++) {
      const c = cs[i];
      $('lobbyN' + i).textContent = c ? c.name + (((net.role === 'host') === (i === 0)) ? ' (sen)' : '') : '…';
      $('lobbyA' + i).textContent = c ? `${TP.ABILITIES[c.ability].icon} ${TP.ABILITIES[c.ability].name}` : '';
    }
    const tl = settings.time ? `${settings.time / 60} dk` : 'sınırsız süre';
    const gl = settings.goals ? `${settings.goals} gol` : 'gol sınırı yok';
    $('lobbyInfo').innerHTML = net.role === 'host'
      ? `Ayarlar: ${tl} • ${gl} (ana menüden değiştirebilirsin)<br>Karakterini değiştirmek için: <a href="#" id="lobbyEdit" style="color:var(--yellow)">düzenle</a>`
      : `Oda sahibinin maçı başlatması bekleniyor…<br><a href="#" id="lobbyEdit" style="color:var(--yellow)">Karakterini düzenle</a>`;
    $('lobbyEdit').onclick = (e) => { e.preventDefault(); openCreator(0); };
    $('startOnline').classList.toggle('hidden', net.role !== 'host');
  }

  function hostStartGame() {
    if (!net || !opponentChar) return;
    matchId++;
    const cs = TP.resolveKits([chars[0], opponentChar]);
    const opts = { time: settings.time, goals: settings.goals };
    net.send({ t: 'start', id: matchId, chars: cs, opts });
    startMatch('host', cs, opts);
  }

  function onNetMsg(m) {
    if (!m || typeof m !== 'object') return;
    switch (m.t) {
      case 'hello':
        opponentChar = TP.sanitizeChar(m.ch, 1);
        if (mode === 'attract') refreshLobby();
        break;
      case 'start':
        if (net.role !== 'guest') return;
        matchId = m.id;
        startMatch('guest', m.chars.map((c, i) => TP.sanitizeChar(c, i)), m.opts);
        break;
      case 'rematch':
        if (net.role === 'host' && sim && sim.phase === 'over') hostStartGame();
        else if (net.role === 'host') toast('Rakip rövanş istiyor');
        break;
      case 'i':
        if (net.role !== 'host') return;
        if (m.q > remoteQ || m.q < remoteQ - 1000) { remoteQ = m.q; remoteInput = { x: +m.x || 0, y: +m.y || 0, kick: !!m.k, ab: !!m.a }; }
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
    const inp = TP.Input.read('solo', 0);
    const key = `${inp.x},${inp.y},${inp.kick ? 1 : 0},${inp.ab ? 1 : 0}`;
    if (key !== lastInputKey || now - lastInputSent > 33) {
      lastInputKey = key; lastInputSent = now;
      net.send({ t: 'i', q: ++guestSeq, x: inp.x, y: inp.y, k: inp.kick ? 1 : 0, a: inp.ab ? 1 : 0 }, true);
    }
  }

  // ---------- döngü ----------
  let last = performance.now();
  function pump(now, maxSteps) {
    let dt = Math.min(0.25, (now - last) / 1000); last = now;
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
    if (!$('menu').classList.contains('hidden')) drawChar($('menuPreview'), chars[0]);
    if (!$('creator').classList.contains('hidden')) drawChar($('bigPreview'), chars[editIdx], { ring: (performance.now() % 2000) < 400 });
    if (!$('lobby').classList.contains('hidden') && net) {
      const cs = net.role === 'host' ? [chars[0], opponentChar] : [opponentChar, chars[0]];
      for (let i = 0; i < 2; i++) if (cs[i]) drawChar($('lobbyC' + i), cs[i], { look: i === 0 ? 0 : Math.PI });
    }
    if (!$('endScreen').classList.contains('hidden') && endWinnerChar) drawChar($('endWinner'), endWinnerChar);
  }
  // sekme arka plandayken host simülasyonu durmasın
  setInterval(() => { if (document.hidden && mode === 'host') pump(performance.now(), 120); }, 50);

  // ---------- başlat ----------
  startAttract();
  show('menu');
  const hash = location.hash.replace('#', '').toUpperCase();
  if (/^[A-Z0-9]{5}$/.test(hash)) { history.replaceState(null, '', location.pathname); setTimeout(() => openOnline(hash), 200); }
  requestAnimationFrame(frame);

  // test kancası
  window.__tp = { get sim() { return sim; }, get mode() { return mode; }, startMatch, chars, settings, R };
})();
