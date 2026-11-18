// TOPARLAK — canvas çizimi, efektler, kamera
(function () {
  const C = TP.C;
  const TAU = Math.PI * 2;

  function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function shade(h, k) {
    const [r, g, b] = hexToRgb(h);
    const f = (v) => Math.max(0, Math.min(255, Math.round(k > 0 ? v + (255 - v) * k : v * (1 + k))));
    return `rgb(${f(r)},${f(g)},${f(b)})`;
  }
  function lum(h) { const [r, g, b] = hexToRgb(h); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; }
  function rgba(h, a) { const [r, g, b] = hexToRgb(h); return `rgba(${r},${g},${b},${a})`; }

  // ---- Forma çizimi (yuvarlak gövde içinde kırpılmış) ----
  function drawJersey(ctx, r, ch) {
    const { c1, c2, pattern } = ch;
    ctx.save();
    ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.clip();
    ctx.fillStyle = c1; ctx.fillRect(-r, -r, 2 * r, 2 * r);
    ctx.fillStyle = c2;
    const w = r / 2.6;
    switch (pattern) {
      case 'dikey': for (let x = -r + w * 0.5; x < r; x += w * 2) ctx.fillRect(x, -r, w, 2 * r); break;
      case 'yatay': for (let y = -r + w * 0.5; y < r; y += w * 2) ctx.fillRect(-r, y, 2 * r, w); break;
      case 'yarim': ctx.fillRect(0, -r, r, 2 * r); break;
      case 'capraz': ctx.save(); ctx.rotate(-Math.PI / 4); ctx.fillRect(-r * 1.5, -r * 0.28, r * 3, r * 0.56); ctx.restore(); break;
      case 'halka': ctx.beginPath(); ctx.arc(0, 0, r * 0.72, 0, TAU); ctx.arc(0, 0, r * 0.46, 0, TAU, true); ctx.fill(); break;
      case 'dama': { const s = r / 2; for (let i = -2; i < 2; i++) for (let j = -2; j < 2; j++) if ((i + j) & 1) ctx.fillRect(i * s, j * s, s, s); break; }
      case 'sevron': ctx.beginPath(); ctx.moveTo(-r, -r * 0.1); ctx.lineTo(0, r * 0.45); ctx.lineTo(r, -r * 0.1); ctx.lineTo(r, r * 0.35); ctx.lineTo(0, r * 0.9); ctx.lineTo(-r, r * 0.35); ctx.closePath(); ctx.fill(); break;
    }
    // hacim: üstten ışık, alttan gölge
    const g = ctx.createRadialGradient(-r * 0.35, -r * 0.45, r * 0.1, 0, 0, r * 1.05);
    g.addColorStop(0, 'rgba(255,255,255,0.28)');
    g.addColorStop(0.55, 'rgba(255,255,255,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.32)');
    ctx.fillStyle = g; ctx.fillRect(-r, -r, 2 * r, 2 * r);
    ctx.restore();
  }

  function drawEyes(ctx, r, ch, lookAng, blink, mood) {
    const style = ch.eyes;
    const off = r * 0.26;
    const ex = Math.cos(lookAng) * off, ey = Math.sin(lookAng) * off * 0.85 - r * 0.08;
    const sep = r * 0.31, er = r * 0.23;
    const px = Math.cos(lookAng) * er * 0.38, py = Math.sin(lookAng) * er * 0.38;
    ctx.save();
    ctx.translate(ex, ey);
    if (style === 'havali') {
      ctx.fillStyle = '#111';
      ctx.beginPath();
      ctx.roundRect(-sep - er * 1.15, -er * 0.75, er * 2.3, er * 1.5, er * 0.5);
      ctx.roundRect(sep - er * 1.15, -er * 0.75, er * 2.3, er * 1.5, er * 0.5);
      ctx.fill();
      ctx.fillRect(-sep, -er * 0.55, sep * 2, er * 0.35);
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fillRect(-sep - er * 0.7, -er * 0.45, er * 0.5, er * 0.25);
      ctx.fillRect(sep - er * 0.7, -er * 0.45, er * 0.5, er * 0.25);
      ctx.restore(); return;
    }
    const open = blink ? 0.12 : style === 'uykulu' ? 0.5 : 1;
    for (const s of [-1, 1]) {
      ctx.save(); ctx.translate(s * sep, 0);
      ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = Math.max(1, r * 0.06);
      ctx.beginPath(); ctx.ellipse(0, 0, er, er * 1.1 * open, 0, 0, TAU); ctx.fill(); ctx.stroke();
      if (open > 0.2) {
        const pr = style === 'sevimli' ? er * 0.72 : er * 0.5;
        ctx.fillStyle = mood === 'stun' ? '#7b2cbf' : '#111';
        ctx.beginPath(); ctx.arc(px, py * open, pr, 0, TAU); ctx.fill();
        if (style === 'sevimli') { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(px - pr * 0.3, py * open - pr * 0.35, pr * 0.32, 0, TAU); ctx.fill(); }
      }
      if (style === 'uykulu') { ctx.fillStyle = shade(ch.c1, -0.25); ctx.fillRect(-er * 1.2, -er * 1.3, er * 2.4, er * 0.75); }
      if (style === 'kizgin' || mood === 'angry') {
        ctx.strokeStyle = '#111'; ctx.lineWidth = Math.max(1.2, r * 0.1); ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(-er * 1.05, -er * (s > 0 ? 0.75 : 1.3)); ctx.lineTo(er * 1.05, -er * (s > 0 ? 1.3 : 0.75)); ctx.stroke();
      }
      ctx.restore();
    }
    ctx.restore();
  }

  function drawPlayerBody(ctx, p, ch, o) {
    // o: {look, blink, kickReady, charge, t, mood}
    const r = p.r;
    drawJersey(ctx, r, ch);
    // numara (arkada, bakışın tersinde)
    const na = o.look + Math.PI;
    const nx = Math.cos(na) * r * 0.6, ny = Math.sin(na) * r * 0.6;
    ctx.save();
    ctx.font = `900 ${Math.max(7, Math.round(r * 0.46))}px Rubik, system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const txtCol = lum(ch.c1) > 0.6 ? '#111' : '#fff';
    ctx.lineWidth = r * 0.1; ctx.strokeStyle = lum(ch.c1) > 0.6 ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.55)';
    ctx.strokeText(String(ch.number), nx, ny + r * 0.02);
    ctx.fillStyle = txtCol; ctx.fillText(String(ch.number), nx, ny + r * 0.02);
    ctx.restore();
    drawEyes(ctx, r, ch, o.look, o.blink, o.mood);
    // kenarlık: şut hazırken beyaz
    ctx.lineWidth = Math.max(2, r * 0.14);
    ctx.strokeStyle = o.kickReady ? '#ffffff' : 'rgba(10,14,20,0.95)';
    ctx.beginPath(); ctx.arc(0, 0, r - ctx.lineWidth / 2 + 0.5, 0, TAU); ctx.stroke();
  }

  // ---- Parçacıklar ----
  class FX {
    constructor() { this.parts = []; this.rings = []; this.texts = []; this.trails = []; }
    add(p) { if (this.parts.length < 1400) this.parts.push(p); }
    burst(x, y, n, opt) {
      for (let i = 0; i < n; i++) {
        const a = (opt.dir != null ? opt.dir + (Math.random() - 0.5) * (opt.spread || 1) : Math.random() * TAU);
        const s = (opt.speed || 3) * (0.3 + Math.random() * 0.9);
        this.add({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: (opt.life || 30) * (0.6 + Math.random() * 0.6), max: opt.life || 30,
          size: (opt.size || 3) * (0.5 + Math.random()), color: Array.isArray(opt.color) ? opt.color[(Math.random() * opt.color.length) | 0] : opt.color,
          drag: opt.drag || 0.92, grav: opt.grav || 0, shape: opt.shape || 'c', rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 0.4, z: opt.z || 0, vz: opt.vz ? opt.vz * (0.5 + Math.random()) : 0 });
      }
    }
    ring(x, y, r0, r1, life, color, width) { this.rings.push({ x, y, r0, r1, life, max: life, color, width: width || 4 }); }
    text(x, y, str, color, size) { this.texts.push({ x, y, str, color, size: size || 18, life: 60, max: 60 }); }
    update(dt) {
      for (const p of this.parts) {
        p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= Math.pow(p.drag, dt); p.vy *= Math.pow(p.drag, dt);
        if (p.vz || p.z) { p.vz -= 0.35 * dt; p.z += p.vz * dt; if (p.z < 0) { p.z = 0; p.vz *= -0.3; p.vx *= 0.7; p.vy *= 0.7; } }
        p.vy += p.grav * dt; p.rot += p.vr * dt; p.life -= dt;
      }
      this.parts = this.parts.filter(p => p.life > 0);
      for (const r of this.rings) r.life -= dt;
      this.rings = this.rings.filter(r => r.life > 0);
      for (const t of this.texts) { t.life -= dt; t.y -= 0.5 * dt; }
      this.texts = this.texts.filter(t => t.life > 0);
    }
    draw(ctx) {
      for (const r of this.rings) {
        const k = 1 - r.life / r.max, e = 1 - Math.pow(1 - k, 3);
        ctx.globalAlpha = (1 - k) * 0.9;
        ctx.strokeStyle = r.color; ctx.lineWidth = r.width * (1 - k) + 0.5;
        ctx.beginPath(); ctx.arc(r.x, r.y, r.r0 + (r.r1 - r.r0) * e, 0, TAU); ctx.stroke();
      }
      for (const p of this.parts) {
        const a = Math.min(1, p.life / (p.max * 0.4));
        ctx.globalAlpha = a;
        ctx.fillStyle = p.color;
        if (p.shape === 'r') {
          ctx.save(); ctx.translate(p.x, p.y - p.z); ctx.rotate(p.rot);
          ctx.fillRect(-p.size, -p.size * 0.5, p.size * 2, p.size); ctx.restore();
        } else {
          ctx.beginPath(); ctx.arc(p.x, p.y - p.z, p.size * (p.shape === 'g' ? a : 1), 0, TAU); ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
      for (const t of this.texts) {
        const k = t.life / t.max;
        ctx.globalAlpha = Math.min(1, k * 2);
        ctx.font = `900 ${t.size}px Rubik, system-ui, sans-serif`; ctx.textAlign = 'center';
        ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.strokeText(t.str, t.x, t.y);
        ctx.fillStyle = t.color; ctx.fillText(t.str, t.x, t.y);
      }
      ctx.globalAlpha = 1;
    }
  }

  // ---- Statik katmanlar ----
  function makeGrass(w, h, scale) {
    const cv = document.createElement('canvas');
    cv.width = Math.ceil(w * scale); cv.height = Math.ceil(h * scale);
    const g = cv.getContext('2d');
    g.scale(scale, scale);
    const stripes = 14, sw = w / stripes;
    for (let i = 0; i < stripes; i++) { g.fillStyle = i % 2 ? '#3f8f3a' : '#47a042'; g.fillRect(i * sw, 0, sw + 1, h); }
    // çim dokusu
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < w * h / 26; i++) {
      const x = rnd() * w, y = rnd() * h;
      g.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.05)';
      g.fillRect(x, y, 1.2, 2.6);
    }
    // yumuşak lekeler
    for (let i = 0; i < 40; i++) {
      const x = rnd() * w, y = rnd() * h, r = 30 + rnd() * 90;
      const rg = g.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, rnd() < 0.5 ? 'rgba(20,60,10,0.08)' : 'rgba(220,255,160,0.05)');
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = rg; g.fillRect(x - r, y - r, 2 * r, 2 * r);
    }
    return cv;
  }

  class Renderer {
    constructor(canvas) {
      this.cv = canvas; this.ctx = canvas.getContext('2d');
      this.fx = new FX();
      this.shake = 0; this.zoomPunch = 0; this.flash = 0;
      this.hype = 0; this.hypeTeam = -1; this.time = 0;
      this.ballRot = 0; this.ballSpinVis = 0;
      this.netWobble = [[0, 0, 0], [0, 0, 0]]; // [sol, sağ] [genlik, y, faz]
      this.look = [0, Math.PI]; this.blinkT = [100, 160];
      this.ghosts = [];
      this.crowd = null; this.teamColors = ['#e63946', '#3a86ff'];
      this.grass = null; this.grassScale = 0;
      this.boardOffset = 0;
      this.resize();
    }

    setTeams(chars) {
      this.chars = chars;
      this.teamColors = [chars[0].c1, chars[1].c1];
      this.buildCrowd();
    }

    resize() {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = this.cv.clientWidth, h = this.cv.clientHeight;
      this.cv.width = Math.round(w * dpr); this.cv.height = Math.round(h * dpr);
      this.dpr = dpr; this.w = w; this.h = h;
      const viewW = 2 * (C.OW + 34), viewH = 2 * (C.OH + 34) + 60;
      this.scale = Math.min(w / viewW, h / viewH);
      const gs = Math.min(2.5, this.scale * dpr);
      if (!this.grass || Math.abs(gs - this.grassScale) > 0.2) {
        this.grassScale = gs;
        this.grass = makeGrass(2 * C.OW, 2 * C.OH, gs);
      }
    }

    buildCrowd() {
      const rows = 6, out = [];
      let seed = 3; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      const x0 = C.OW + 30, y0 = C.OH + 30;
      const neutrals = ['#d9d4c7', '#2b2d42', '#8d99ae', '#edf2f4', '#555b6e', '#f2cc8f'];
      for (let r = 0; r < rows; r++) {
        const ox = x0 + r * 11, oy = y0 + r * 11;
        const per = (len) => Math.floor(len / 10.5);
        const pushLine = (ax, ay, bx, by, sideTeam) => {
          const n = per(Math.hypot(bx - ax, by - ay));
          for (let i = 0; i <= n; i++) {
            const t = i / n;
            if (rnd() < 0.08) continue;
            let team = sideTeam;
            if (team < 0) team = (ax + (bx - ax) * t) < 0 ? 0 : 1;
            const col = rnd() < 0.62 ? (rnd() < 0.7 ? this.teamColors[team] : (team === 0 ? this.chars[0].c2 : this.chars[1].c2)) : neutrals[(rnd() * neutrals.length) | 0];
            out.push({ x: ax + (bx - ax) * t + (rnd() - 0.5) * 3, y: ay + (by - ay) * t + (rnd() - 0.5) * 3, c: col, team, ph: rnd() * TAU, sp: 0.8 + rnd() * 0.6, r });
          }
        };
        pushLine(-ox, -oy, ox, -oy, -1);
        pushLine(-ox, oy, ox, oy, -1);
        pushLine(-ox, -oy + 10, -ox, oy - 10, 0);
        pushLine(ox, -oy + 10, ox, oy - 10, 1);
      }
      this.crowd = out;
    }

    shakeBy(v) { this.shake = Math.min(28, this.shake + v); }

    // ---- Olay tabanlı efektler ----
    onEvent(e, sim) {
      const fx = this.fx;
      const tc = (t) => this.teamColors[t] || '#fff';
      switch (e.k) {
        case 'kick':
        case 'curve':
          fx.burst(e.x, e.y, 6, { dir: Math.atan2(e.ny, e.nx) + Math.PI, spread: 1.6, speed: 2, color: ['#cfe8a9', '#86c06c', '#fff'], life: 20, size: 2 });
          this.shakeBy(1.2);
          if (e.k === 'curve') fx.ring(e.x, e.y, 6, 40, 22, '#b28dff', 3);
          break;
        case 'power':
          fx.burst(e.x, e.y, 22, { dir: Math.atan2(e.ny, e.nx), spread: 1.1, speed: 6, color: ['#fff3b0', '#ffd23f', '#ff9f1c', '#fff'], life: 26, size: 2.6 });
          fx.ring(e.x, e.y, 8, 55, 18, '#fff', 5);
          this.shakeBy(7); this.zoomPunch = Math.max(this.zoomPunch, 0.025);
          break;
        case 'rocket':
          fx.burst(e.x, e.y, 36, { dir: Math.atan2(e.ny, e.nx), spread: 1.4, speed: 7, color: ['#ffef99', '#ff9f1c', '#ff4d00', '#d00000'], life: 32, size: 3.5 });
          fx.ring(e.x, e.y, 10, 80, 22, '#ff9f1c', 7);
          this.shakeBy(12); this.zoomPunch = Math.max(this.zoomPunch, 0.04); this.flash = 0.35;
          break;
        case 'post':
          fx.burst(e.x, e.y, 14, { speed: 4, color: ['#fff', '#e0e0e0', '#ffd23f'], life: 22, size: 2 });
          fx.ring(e.x, e.y, 6, 34, 16, '#fff', 3);
          fx.text(e.x, e.y - 24, 'DİREK!', '#fff', 20);
          this.shakeBy(6); this.hype = Math.max(this.hype, 0.5);
          break;
        case 'wall':
          if (e.s > 4) { fx.burst(e.x, e.y, 5, { speed: 2, color: '#ffffffaa', life: 14, size: 1.6 }); this.shakeBy(1.5); }
          break;
        case 'net': {
          const i = e.side < 0 ? 0 : 1;
          this.netWobble[i] = [Math.min(16, 3 + e.s * 1.6), e.y, 0];
          break;
        }
        case 'bump':
          fx.burst(e.x, e.y, 10, { speed: 3, color: ['#fff', '#ddd'], life: 18, size: 2 });
          fx.ring(e.x, e.y, 10, 40, 14, '#ffffff', 3);
          this.shakeBy(Math.min(10, e.s * 1.4));
          break;
        case 'burn':
          fx.burst(e.x, e.y, 30, { speed: 5, color: ['#ffef99', '#ff9f1c', '#ff4d00', '#333'], life: 34, size: 3 });
          fx.text(e.x, e.y - 30, 'YANDI!', '#ff9f1c', 22);
          this.shakeBy(12); this.flash = 0.25;
          break;
        case 'ab': {
          const col = tc(e.team);
          if (e.a === 'sok') {
            fx.ring(e.x, e.y, 16, 140, 26, '#ffffff', 9);
            fx.ring(e.x, e.y, 16, 120, 32, col, 6);
            fx.burst(e.x, e.y, 30, { speed: 6, color: ['#fff', col], life: 26, size: 2.5, drag: 0.9 });
            this.shakeBy(14); this.flash = 0.2;
          } else if (e.a === 'atilma') {
            fx.burst(e.x, e.y, 14, { speed: 3, color: ['#fff', '#cfe8a9'], life: 20, size: 2.5 });
            this.shakeBy(3);
          } else if (e.a === 'dev') {
            fx.ring(e.x, e.y, 20, 70, 24, col, 7); this.shakeBy(8);
            fx.burst(e.x, e.y, 18, { speed: 4, color: ['#fff', col], life: 26, size: 3 });
          } else if (e.a === 'miknatis') {
            fx.ring(e.x, e.y, 170, 18, 30, '#7fd1ff', 4);
          } else {
            fx.ring(e.x, e.y, 14, 44, 20, e.a === 'roket' ? '#ff9f1c' : '#b28dff', 4);
          }
          const A = TP.ABILITIES[e.a];
          fx.text(e.x, e.y - 34, A.name.toUpperCase(), '#fff', 15);
          break;
        }
        case 'goal': {
          const col = tc(e.team), col2 = this.chars ? this.chars[e.team].c2 : '#fff';
          const gx = e.team === 0 ? C.FW + C.GD * 0.5 : -C.FW - C.GD * 0.5;
          fx.burst(gx, e.y, 90, { speed: 9, color: [col, col2, '#fff', '#ffd23f'], life: 110, size: 4, shape: 'r', drag: 0.96, vz: 6 });
          fx.ring(e.x, e.y, 10, 160, 40, '#fff', 10);
          this.netWobble[e.team === 0 ? 1 : 0] = [22, e.y, 0];
          this.shakeBy(22); this.zoomPunch = 0.07; this.flash = 0.5;
          this.hype = 1; this.hypeTeam = e.team;
          // konfeti yağmuru
          this.confettiT = 150; this.confettiCols = [col, col2, '#fff', '#ffd23f'];
          break;
        }
        case 'kickoff':
          this.hype = Math.max(this.hype, 0.2);
          break;
        case 'end':
          this.hype = 1; this.hypeTeam = e.winner;
          this.confettiT = 400; this.confettiCols = e.winner >= 0 ? [tc(e.winner), this.chars[e.winner].c2, '#fff', '#ffd23f'] : ['#fff', '#ffd23f'];
          break;
      }
    }

    // ---- Ana çizim ----
    draw(sim, dt, ext) {
      // ext: tahmini ileri sarma (tick) — istemcide kullanılır
      ext = ext || 0;
      const ctx = this.ctx;
      this.time += dt;
      this.fx.update(dt);
      this.shake *= Math.pow(0.86, dt);
      this.zoomPunch *= Math.pow(0.92, dt);
      this.flash *= Math.pow(0.88, dt);
      this.hype *= Math.pow(0.995, dt);
      for (const nw of this.netWobble) { nw[0] *= Math.pow(0.93, dt); nw[2] += 0.45 * dt; }

      const b = sim.ball, P = sim.players;
      const pos = (o) => [o.x + o.vx * ext, o.y + o.vy * ext];
      const [bx, by] = pos(b);

      // konfeti yağmuru
      if (this.confettiT > 0) {
        this.confettiT -= dt;
        for (let i = 0; i < 3; i++) {
          const x = (Math.random() - 0.5) * 2 * C.OW, y = -C.OH - 30 + Math.random() * 30;
          this.fx.add({ x, y, vx: (Math.random() - 0.5) * 1.5, vy: 1.5 + Math.random() * 2, life: 200, max: 200, size: 2.5 + Math.random() * 2,
            color: this.confettiCols[(Math.random() * this.confettiCols.length) | 0], drag: 0.995, grav: 0.01, shape: 'r', rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 0.3, z: 0, vz: 0 });
        }
      }

      // Parçacık izleri
      const bs = Math.hypot(b.vx, b.vy);
      if (b.fire > 0) {
        for (let i = 0; i < 3; i++) this.fx.add({ x: bx + (Math.random() - 0.5) * 8, y: by + (Math.random() - 0.5) * 8, vx: -b.vx * 0.15 + (Math.random() - 0.5), vy: -b.vy * 0.15 + (Math.random() - 0.5),
          life: 22, max: 22, size: 4 + Math.random() * 4, color: ['#ffef99', '#ff9f1c', '#ff4d00', '#d00000', '#555'][(Math.random() * 5) | 0], drag: 0.9, grav: 0, shape: 'g', rot: 0, vr: 0, z: 0, vz: 0 });
      }
      if (b.spin) {
        this.fx.add({ x: bx, y: by, vx: 0, vy: 0, life: 18, max: 18, size: 3, color: '#b28dff', drag: 1, grav: 0, shape: 'g', rot: 0, vr: 0, z: 0, vz: 0 });
      }
      for (const p of P) {
        const sp = Math.hypot(p.vx, p.vy);
        if (sp > 2.2 && Math.random() < 0.25 * dt) this.fx.add({ x: p.x - p.vx * 3, y: p.y - p.vy * 3 + p.r * 0.5, vx: -p.vx * 0.1, vy: -p.vy * 0.1, life: 18, max: 18, size: 2 + Math.random() * 2, color: 'rgba(200,230,170,0.6)', drag: 0.9, grav: 0, shape: 'g', rot: 0, vr: 0, z: 0, vz: 0 });
        if (p.dash > 0) this.ghosts.push({ x: p.x, y: p.y, r: p.r, team: p.team, life: 14 });
        if (p.charge >= 1 && p.kickReady && Math.random() < 0.5 * dt) {
          const a = Math.random() * TAU;
          this.fx.add({ x: p.x + Math.cos(a) * (p.r + 8), y: p.y + Math.sin(a) * (p.r + 8), vx: Math.cos(a) * 1.2, vy: Math.sin(a) * 1.2, life: 14, max: 14, size: 2, color: '#ffd23f', drag: 0.9, grav: 0, shape: 'c', rot: 0, vr: 0, z: 0, vz: 0 });
        }
      }
      for (const g of this.ghosts) g.life -= dt;
      this.ghosts = this.ghosts.filter(g => g.life > 0);

      // Kamera
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#0d1117'; ctx.fillRect(0, 0, this.cv.width, this.cv.height);
      const s = this.scale * (1 + this.zoomPunch) * this.dpr;
      const sx = (Math.random() - 0.5) * this.shake, sy = (Math.random() - 0.5) * this.shake;
      // gol anında topa doğru hafif kayma
      const fx_ = this.zoomPunch * 3 * bx, fy_ = this.zoomPunch * 3 * by;
      ctx.setTransform(s, 0, 0, s, this.cv.width / 2 + (sx - fx_) * this.dpr * this.scale * 0.5, this.cv.height / 2 + 26 * this.dpr * this.scale + (sy - fy_) * this.dpr * this.scale * 0.5);

      this.drawStadium(ctx, sim);
      this.drawPitch(ctx);
      this.drawGoals(ctx, 'back');

      // gölgeler
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      for (const p of P) { const [x, y] = pos(p); ctx.beginPath(); ctx.ellipse(x + 4, y + 6, p.r * 1.02, p.r * 0.92, 0, 0, TAU); ctx.fill(); }
      ctx.beginPath(); ctx.ellipse(bx + 3, by + 5, b.r, b.r * 0.85, 0, 0, TAU); ctx.fill();

      // mıknatıs alanı
      for (const p of P) if (p.magnet > 0) {
        const [x, y] = pos(p);
        ctx.strokeStyle = 'rgba(127,209,255,0.5)'; ctx.lineWidth = 2; ctx.setLineDash([6, 8]);
        ctx.lineDashOffset = -this.time * 1.5;
        ctx.beginPath(); ctx.arc(x, y, 60 + (this.time * 3) % 120, 0, TAU); ctx.stroke();
        ctx.beginPath(); ctx.arc(x, y, 60 + (this.time * 3 + 60) % 120, 0, TAU); ctx.stroke();
        ctx.setLineDash([]);
        // çekim çizgisi
        if (Math.hypot(b.x - p.x, b.y - p.y) < 180) {
          ctx.strokeStyle = 'rgba(127,209,255,0.7)'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(bx, by); ctx.stroke();
        }
      }

      // hayaletler (atılma)
      for (const g of this.ghosts) {
        ctx.globalAlpha = g.life / 14 * 0.35;
        ctx.fillStyle = this.teamColors[g.team];
        ctx.beginPath(); ctx.arc(g.x, g.y, g.r, 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = 1;

      // top izi
      if (bs > 5) {
        const tl = Math.min(6, bs * 0.5);
        const grd = ctx.createLinearGradient(bx, by, bx - b.vx * tl, by - b.vy * tl);
        grd.addColorStop(0, b.fire > 0 ? 'rgba(255,159,28,0.7)' : 'rgba(255,255,255,0.45)');
        grd.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.strokeStyle = grd; ctx.lineWidth = b.r * 1.6; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx - b.vx * tl, by - b.vy * tl); ctx.stroke();
      }

      this.drawBall(ctx, b, bx, by, dt);
      for (let i = 0; i < P.length; i++) this.drawPlayer(ctx, sim, i, pos(P[i]), dt);
      this.drawGoals(ctx, 'front');
      this.fx.draw(ctx);

      // isim etiketleri
      for (let i = 0; i < P.length; i++) {
        const p = P[i], [x, y] = pos(p), ch = this.chars[i];
        ctx.font = '700 11px Rubik, system-ui, sans-serif'; ctx.textAlign = 'center';
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.6)';
        ctx.strokeText(ch.name, x, y + p.r + 15); ctx.fillStyle = '#fff'; ctx.fillText(ch.name, x, y + p.r + 15);
      }

      // flaş
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (this.flash > 0.01) { ctx.fillStyle = `rgba(255,255,255,${this.flash * 0.5})`; ctx.fillRect(0, 0, this.cv.width, this.cv.height); }
      // vinyet
      const vg = ctx.createRadialGradient(this.cv.width / 2, this.cv.height / 2, Math.min(this.cv.width, this.cv.height) * 0.45, this.cv.width / 2, this.cv.height / 2, Math.max(this.cv.width, this.cv.height) * 0.75);
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.5)');
      ctx.fillStyle = vg; ctx.fillRect(0, 0, this.cv.width, this.cv.height);
    }

    drawStadium(ctx, sim) {
      const ow = C.OW, oh = C.OH;
      // tribün zemini
      ctx.fillStyle = '#161b22';
      ctx.fillRect(-ow - 110, -oh - 110, 2 * ow + 220, 2 * oh + 220);
      ctx.fillStyle = '#1f2630';
      for (let r = 0; r < 6; r++) {
        const o = 30 + r * 11;
        ctx.strokeStyle = r % 2 ? '#1c222b' : '#232b36'; ctx.lineWidth = 11;
        ctx.strokeRect(-ow - o, -oh - o, 2 * (ow + o), 2 * (oh + o));
      }
      // seyirciler
      if (this.crowd) {
        const t = this.time;
        for (const c of this.crowd) {
          let jump = Math.sin(t * 0.08 * c.sp + c.ph) * 0.6;
          const h = this.hype * (this.hypeTeam < 0 || this.hypeTeam === c.team ? 1 : 0.25);
          if (h > 0.05) jump += Math.abs(Math.sin(t * 0.22 * c.sp + c.ph)) * 6 * h;
          // dışa doğru zıpla
          const ax = Math.abs(c.x) - ow, ay = Math.abs(c.y) - oh;
          let dx = 0, dy = 0;
          if (ax > ay) dx = Math.sign(c.x) * jump; else dy = Math.sign(c.y) * jump;
          ctx.fillStyle = c.c;
          ctx.beginPath(); ctx.arc(c.x + dx, c.y + dy, 4, 0, TAU); ctx.fill();
        }
      }
      // reklam panoları
      this.boardOffset += 0.6;
      ctx.save();
      ctx.fillStyle = '#0b0e13';
      const bw = 14, o = 18;
      ctx.fillRect(-ow - o, -oh - o - bw / 2, 2 * (ow + o), bw);
      ctx.fillRect(-ow - o, oh + o - bw / 2, 2 * (ow + o), bw);
      ctx.beginPath(); ctx.rect(-ow - o, -oh - o - bw / 2, 2 * (ow + o), bw); ctx.rect(-ow - o, oh + o - bw / 2, 2 * (ow + o), bw); ctx.clip();
      ctx.font = '900 10px Rubik, system-ui, sans-serif'; ctx.textBaseline = 'middle';
      const msg = '  TOPARLAK LİG  ●  SERT ŞUT  ●  1v1  ●  ';
      const mw = ctx.measureText(msg).width;
      const off = -(this.boardOffset % mw);
      const cols = ['#ffd23f', '#fff'];
      for (const yy of [-oh - o, oh + o]) {
        let i = 0;
        for (let x = -ow - o + off; x < ow + o; x += mw, i++) { ctx.fillStyle = cols[i % 2]; ctx.fillText(msg, x, yy + 1); }
      }
      ctx.restore();
    }

    drawPitch(ctx) {
      const { FW, FH, OW, OH, GH, CENTER_R } = C;
      ctx.drawImage(this.grass, -OW, -OH, 2 * OW, 2 * OH);
      // kenar gölgesi
      ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 6;
      ctx.strokeRect(-OW + 3, -OH + 3, 2 * OW - 6, 2 * OH - 6);
      ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 3;
      ctx.strokeRect(-FW, -FH, 2 * FW, 2 * FH);
      ctx.beginPath(); ctx.moveTo(0, -FH); ctx.lineTo(0, FH); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, CENTER_R, 0, TAU); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath(); ctx.arc(0, 0, 4, 0, TAU); ctx.fill();
      ctx.lineWidth = 2.5; ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      for (const sx of [-1, 1]) {
        // ceza sahası ve yay
        ctx.strokeRect(sx > 0 ? FW - 110 : -FW, -140, 110, 280);
        ctx.strokeRect(sx > 0 ? FW - 38 : -FW, -GH - 22, 38, 2 * GH + 44);
        ctx.beginPath(); ctx.arc(sx * (FW - 80), 0, 58, sx > 0 ? Math.PI * 0.62 : -Math.PI * 0.38, sx > 0 ? Math.PI * 1.38 : Math.PI * 0.38); ctx.stroke();
        ctx.beginPath(); ctx.arc(sx * (FW - 80), 0, 3, 0, TAU); ctx.fill();
        // korner yayları
        for (const sy of [-1, 1]) { ctx.beginPath(); ctx.arc(sx * FW, sy * FH, 12, 0, TAU); ctx.stroke(); }
      }
      // başlama vuruşu bölgesi yarı saydam
    }

    drawGoals(ctx, layer) {
      const { FW, GH, GD, POST_R } = C;
      for (const sx of [-1, 1]) {
        const i = sx < 0 ? 0 : 1;
        const [amp, wy, ph] = this.netWobble[i];
        const bx = sx * (FW + GD);
        if (layer === 'back') {
          // file
          ctx.fillStyle = 'rgba(255,255,255,0.08)';
          ctx.fillRect(sx < 0 ? bx : FW, -GH, GD, 2 * GH);
          ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1;
          const bend = (y) => amp * Math.sin(ph) * Math.exp(-Math.pow((y - wy) / 40, 2));
          for (let y = -GH; y <= GH; y += 8) {
            ctx.beginPath(); ctx.moveTo(sx * FW, y);
            ctx.lineTo(bx + sx * bend(y), y); ctx.stroke();
          }
          for (let x = 0; x <= GD; x += 8) {
            ctx.beginPath();
            for (let y = -GH; y <= GH; y += 6) {
              const k = x / GD;
              const xx = sx * (FW + x) + sx * bend(y) * k;
              if (y === -GH) ctx.moveTo(xx, y); else ctx.lineTo(xx, y);
            }
            ctx.stroke();
          }
        } else {
          // kale çerçevesi
          ctx.strokeStyle = '#f5f5f5'; ctx.lineWidth = 4; ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(sx * FW, -GH); ctx.lineTo(bx + sx * amp * Math.sin(ph) * 0.3, -GH);
          ctx.lineTo(bx + sx * amp * Math.sin(ph), GH * 0); ctx.lineTo(bx + sx * amp * Math.sin(ph) * 0.3, GH); ctx.lineTo(sx * FW, GH);
          ctx.stroke();
          for (const sy of [-1, 1]) {
            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            ctx.beginPath(); ctx.arc(sx * FW + 2, sy * GH + 3, POST_R, 0, TAU); ctx.fill();
            ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#1b1f24'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(sx * FW, sy * GH, POST_R, 0, TAU); ctx.fill(); ctx.stroke();
          }
        }
      }
    }

    drawBall(ctx, b, x, y, dt) {
      const sp = Math.hypot(b.vx, b.vy);
      this.ballRot += sp / b.r * dt * 0.6;
      const ang = Math.atan2(b.vy, b.vx);
      ctx.save(); ctx.translate(x, y);
      if (b.fire > 0) {
        ctx.fillStyle = 'rgba(255,120,0,0.35)';
        ctx.beginPath(); ctx.arc(0, 0, b.r + 5, 0, TAU); ctx.fill();
      }
      ctx.fillStyle = '#fbfbfb';
      ctx.beginPath(); ctx.arc(0, 0, b.r, 0, TAU); ctx.fill();
      ctx.save();
      ctx.beginPath(); ctx.arc(0, 0, b.r, 0, TAU); ctx.clip();
      ctx.rotate(ang);
      // dönen beşgenler (yuvarlanma efekti)
      ctx.fillStyle = b.fire > 0 ? '#d00000' : '#1b1f24';
      const D = b.r * 1.35;
      const roll = (this.ballRot * b.r) % D;
      for (let row = 0; row < 2; row++) {
        const py = (row ? 0.55 : -0.55) * b.r;
        for (let k = -2; k <= 2; k++) {
          const px = k * D + roll + (row ? D / 2 : 0) - D / 2;
          if (Math.abs(px) > b.r * 1.25) continue;
          const sq = Math.max(0.25, Math.cos(Math.min(1.45, Math.abs(px) / b.r * 1.15)));
          ctx.beginPath();
          for (let i = 0; i < 5; i++) {
            const a = i / 5 * TAU - Math.PI / 2;
            const rx = px + Math.cos(a) * b.r * 0.34 * sq, ry = py + Math.sin(a) * b.r * 0.34;
            if (i === 0) ctx.moveTo(rx, ry); else ctx.lineTo(rx, ry);
          }
          ctx.closePath(); ctx.fill();
        }
      }
      ctx.restore();
      const g = ctx.createRadialGradient(-b.r * 0.35, -b.r * 0.4, 1, 0, 0, b.r);
      g.addColorStop(0, 'rgba(255,255,255,0.55)'); g.addColorStop(0.6, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(0,0,0,0.3)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, b.r, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#111'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(0, 0, b.r - 0.5, 0, TAU); ctx.stroke();
      ctx.restore();
    }

    drawPlayer(ctx, sim, i, [x, y], dt) {
      const p = sim.players[i], ch = this.chars[i], b = sim.ball;
      // bakış yönü: topa
      const target = Math.atan2(b.y - p.y, b.x - p.x);
      let d = target - this.look[i];
      while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU;
      this.look[i] += d * Math.min(1, 0.2 * dt);
      this.blinkT[i] -= dt;
      if (this.blinkT[i] < -7) this.blinkT[i] = 120 + Math.random() * 200;
      const blink = this.blinkT[i] < 0;

      ctx.save(); ctx.translate(x, y);
      // squash & stretch hızla
      const sp = Math.hypot(p.vx, p.vy);
      const st = Math.min(0.12, sp * 0.02);
      const va = Math.atan2(p.vy, p.vx);
      ctx.rotate(va); ctx.scale(1 + st, 1 - st * 0.7); ctx.rotate(-va);

      // şarj halkası
      if (p.kickReady && p.charge > 0.08) {
        const k = p.charge;
        ctx.strokeStyle = k >= 1 ? (Math.floor(this.time / 3) % 2 ? '#ff4d00' : '#ffd23f') : `hsl(${50 - k * 40},100%,${60 - k * 5}%)`;
        ctx.lineWidth = 4; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.arc(0, 0, p.r + 6, -Math.PI / 2, -Math.PI / 2 + TAU * k); ctx.stroke();
      }
      // silahlı yetenek göstergeleri
      if (p.rocket > 0) {
        ctx.strokeStyle = Math.floor(this.time / 4) % 2 ? '#ff9f1c' : '#ff4d00'; ctx.lineWidth = 3; ctx.setLineDash([5, 4]);
        ctx.lineDashOffset = this.time; ctx.beginPath(); ctx.arc(0, 0, p.r + 11, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
        if (Math.random() < 0.4) this.fx.add({ x: x + (Math.random() - 0.5) * p.r * 2, y: y + (Math.random() - 0.5) * p.r * 2, vx: 0, vy: -0.8, life: 16, max: 16, size: 2.5, color: ['#ff9f1c', '#ff4d00', '#ffd23f'][(Math.random() * 3) | 0], drag: 0.95, grav: 0, shape: 'g', rot: 0, vr: 0, z: 0, vz: 0 });
      }
      if (p.curve > 0) {
        ctx.strokeStyle = '#b28dff'; ctx.lineWidth = 3;
        for (let k = 0; k < 3; k++) { const a = this.time * 0.15 + k * TAU / 3; ctx.beginPath(); ctx.arc(0, 0, p.r + 10, a, a + 0.8); ctx.stroke(); }
      }
      if (p.stun > 0) {
        for (let k = 0; k < 3; k++) {
          const a = this.time * 0.2 + k * TAU / 3;
          ctx.fillStyle = '#ffd23f'; ctx.font = '12px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText('★', Math.cos(a) * (p.r + 6), Math.sin(a) * (p.r * 0.4) - p.r - 4);
        }
      }
      if (p.giant > 0 && p.giant < 60 && Math.floor(this.time / 5) % 2) ctx.globalAlpha = 0.75;
      drawPlayerBody(ctx, p, ch, { look: this.look[i], blink, kickReady: p.kickReady, mood: p.stun > 0 ? 'stun' : p.charge >= 1 ? 'angry' : null });
      ctx.globalAlpha = 1;
      // bekleme süresi halkası (küçük)
      if (p.cd > 0) {
        ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(0, 0, p.r + 3, 0, TAU); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.7)';
        ctx.beginPath(); ctx.arc(0, 0, p.r + 3, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - p.cd / p.cdMax)); ctx.stroke();
      }
      ctx.restore();
    }
  }

  TP.Renderer = Renderer;
  TP.drawPlayerBody = drawPlayerBody;
  TP.shade = shade;
})();
