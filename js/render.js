// TOPARLAK — canvas çizimi: stadyum, saha, karakterler, efektler, kamera
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
  function pickW(a) { return a[(Math.random() * a.length) | 0]; }
  function rng(seed) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

  // =====================================================================
  //  KARAKTER
  // =====================================================================
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
    // yaka
    ctx.fillStyle = shade(c2, -0.1);
    ctx.beginPath(); ctx.ellipse(0, r * 0.98, r * 0.38, r * 0.16, 0, Math.PI, TAU); ctx.fill();
    const g = ctx.createRadialGradient(-r * 0.35, -r * 0.45, r * 0.1, 0, 0, r * 1.05);
    g.addColorStop(0, 'rgba(255,255,255,0.26)');
    g.addColorStop(0.55, 'rgba(255,255,255,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.34)');
    ctx.fillStyle = g; ctx.fillRect(-r, -r, 2 * r, 2 * r);
    ctx.restore();
  }

  // Saçın gövdenin ARKASINDA kalan kısmı
  function drawHairBack(ctx, r, ch, t, sway) {
    const hc = ch.hairColor, dark = shade(hc, -0.35);
    ctx.fillStyle = hc; ctx.strokeStyle = dark; ctx.lineWidth = Math.max(1, r * 0.07);
    switch (ch.hair) {
      case 'afro': {
        ctx.beginPath();
        for (let i = 0; i <= 10; i++) {
          const a = Math.PI * 0.9 + i / 10 * Math.PI * 1.2;
          ctx.moveTo(Math.cos(a) * r * 0.86 + r * 0.38, Math.sin(a) * r * 0.86 - r * 0.25);
          ctx.arc(Math.cos(a) * r * 0.86, Math.sin(a) * r * 0.86 - r * 0.25, r * 0.38, 0, TAU);
        }
        ctx.fill(); ctx.stroke(); ctx.fill();
        break;
      }
      case 'uzun':
        for (const s of [-1, 1]) {
          ctx.beginPath(); ctx.roundRect(s * r * 0.8 - r * 0.24, -r * 0.55, r * 0.48, r * 1.35, r * 0.24); ctx.fill(); ctx.stroke();
        }
        break;
      case 'atkuyrugu': {
        ctx.save(); ctx.translate(r * 0.55, -r * 0.82); ctx.rotate(0.7 + Math.sin(t * 0.12) * 0.15 + sway * 0.4);
        ctx.beginPath(); ctx.ellipse(r * 0.42, 0, r * 0.48, r * 0.24, 0, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.fillStyle = ch.c2; ctx.beginPath(); ctx.arc(0, 0, r * 0.13, 0, TAU); ctx.fill();
        ctx.restore();
        break;
      }
    }
  }

  // Saçın gövdenin ÜSTÜNDEKİ kısmı
  function drawHairFront(ctx, r, ch) {
    const hc = ch.hairColor, dark = shade(hc, -0.35), light = shade(hc, 0.3);
    if (ch.hair === 'yok') {
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.beginPath(); ctx.ellipse(-r * 0.3, -r * 0.62, r * 0.22, r * 0.12, -0.5, 0, TAU); ctx.fill();
      return;
    }
    // kafa üstünü kaplayan şapka formu (gövdeye kırpılmış)
    ctx.save();
    ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.clip();
    ctx.fillStyle = hc;
    ctx.beginPath();
    switch (ch.hair) {
      case 'kase': ctx.rect(-r, -r, 2 * r, r * 0.66); break;
      case 'ibik': ctx.ellipse(0, -r * 0.7, r * 0.2, r * 0.5, 0, 0, TAU); break;
      case 'uzun': ctx.ellipse(0, -r * 0.74, r * 1.05, r * 0.6, 0, 0, TAU); ctx.rect(-r, -r * 0.5, r * 0.28, r * 1.1); ctx.rect(r * 0.72, -r * 0.5, r * 0.28, r * 1.1); break;
      case 'afro': ctx.ellipse(0, -r * 0.72, r * 1.1, r * 0.62, 0, 0, TAU); break;
      default: // kisa, diken, atkuyrugu
        ctx.ellipse(0, -r * 0.86, r * 1.02, r * 0.56, 0, 0, TAU);
        ctx.rect(-r, -r * 0.55, r * 0.2, r * 0.42); ctx.rect(r * 0.8, -r * 0.55, r * 0.2, r * 0.42);
    }
    ctx.fill();
    // kâkül tutamları
    if (ch.hair === 'kisa' || ch.hair === 'atkuyrugu' || ch.hair === 'diken') {
      for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.arc(i * r * 0.28, -r * 0.33, r * 0.14, 0, Math.PI); ctx.fill(); }
    }
    if (ch.hair === 'kase') { ctx.fillStyle = dark; ctx.fillRect(-r, -r * 0.38, 2 * r, r * 0.05); }
    // parlama
    ctx.strokeStyle = light; ctx.lineWidth = r * 0.07; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(0, -r * 0.2, r * 0.65, Math.PI * 1.25, Math.PI * 1.45); ctx.stroke();
    ctx.restore();
    // dışarı taşan parçalar
    ctx.fillStyle = hc; ctx.strokeStyle = dark; ctx.lineWidth = Math.max(1, r * 0.07); ctx.lineJoin = 'round';
    if (ch.hair === 'diken') {
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI * 0.85 + i * Math.PI * 0.175;
        const ca = Math.cos(a), sa = Math.sin(a);
        ctx.moveTo(Math.cos(a - 0.2) * r * 0.85, Math.sin(a - 0.2) * r * 0.85);
        ctx.lineTo(ca * r * 1.32, sa * r * 1.32);
        ctx.lineTo(Math.cos(a + 0.2) * r * 0.85, Math.sin(a + 0.2) * r * 0.85);
      }
      ctx.closePath(); ctx.fill(); ctx.stroke();
    } else if (ch.hair === 'ibik') {
      ctx.beginPath();
      ctx.moveTo(-r * 0.18, -r * 0.55);
      for (let i = 0; i < 4; i++) { const y = -r * (0.9 + i * 0.12); ctx.lineTo(-r * 0.12 + i * r * 0.03, y - r * 0.32); ctx.lineTo(r * 0.04 * i, y); }
      ctx.lineTo(r * 0.18, -r * 0.55); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
  }

  function drawAccessory(ctx, r, ch, ex, ey) {
    const c2 = ch.c2;
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    switch (ch.acc) {
      case 'sapka': {
        ctx.save(); ctx.beginPath(); ctx.arc(0, 0, r * 1.02, 0, TAU); ctx.clip();
        ctx.fillStyle = c2; ctx.beginPath(); ctx.ellipse(0, -r * 0.78, r * 1.05, r * 0.55, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = shade(c2, -0.2); ctx.fillRect(-r, -r * 0.3, 2 * r, r * 0.08);
        ctx.restore();
        ctx.fillStyle = shade(c2, -0.25); ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = Math.max(1, r * 0.06);
        ctx.beginPath(); ctx.ellipse(ex * 0.6, -r * 0.27, r * 0.72, r * 0.2, 0, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.fillStyle = ch.c1; ctx.beginPath(); ctx.arc(0, -r * 0.95, r * 0.1, 0, TAU); ctx.fill();
        break;
      }
      case 'bandana': {
        ctx.save(); ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.clip();
        ctx.fillStyle = c2; ctx.fillRect(-r, -r * 0.56, 2 * r, r * 0.2);
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        for (let x = -r; x < r; x += r * 0.3) { ctx.beginPath(); ctx.arc(x, -r * 0.46, r * 0.04, 0, TAU); ctx.fill(); }
        ctx.restore();
        ctx.fillStyle = c2; ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = Math.max(1, r * 0.05);
        ctx.beginPath(); ctx.moveTo(r * 0.92, -r * 0.5); ctx.lineTo(r * 1.35, -r * 0.7); ctx.lineTo(r * 1.3, -r * 0.42); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(r * 0.92, -r * 0.45); ctx.lineTo(r * 1.32, -r * 0.25); ctx.lineTo(r * 1.15, -r * 0.12); ctx.closePath(); ctx.fill(); ctx.stroke();
        break;
      }
      case 'tac': {
        ctx.fillStyle = '#ffd23f'; ctx.strokeStyle = '#8a6d00'; ctx.lineWidth = Math.max(1, r * 0.06);
        ctx.beginPath();
        ctx.moveTo(-r * 0.5, -r * 0.82); ctx.lineTo(-r * 0.58, -r * 1.3); ctx.lineTo(-r * 0.26, -r * 1.06); ctx.lineTo(0, -r * 1.42);
        ctx.lineTo(r * 0.26, -r * 1.06); ctx.lineTo(r * 0.58, -r * 1.3); ctx.lineTo(r * 0.5, -r * 0.82); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#e63946'; ctx.beginPath(); ctx.arc(0, -r * 0.98, r * 0.09, 0, TAU); ctx.fill();
        ctx.fillStyle = '#3a86ff'; ctx.beginPath(); ctx.arc(-r * 0.32, -r * 0.94, r * 0.06, 0, TAU); ctx.arc(r * 0.32, -r * 0.94, r * 0.06, 0, TAU); ctx.fill();
        break;
      }
      case 'kulaklik': {
        ctx.strokeStyle = '#222'; ctx.lineWidth = r * 0.14;
        ctx.beginPath(); ctx.arc(0, -r * 0.05, r * 1.06, Math.PI * 1.12, Math.PI * 1.88); ctx.stroke();
        ctx.fillStyle = c2; ctx.strokeStyle = '#111'; ctx.lineWidth = Math.max(1, r * 0.06);
        for (const s of [-1, 1]) { ctx.beginPath(); ctx.roundRect(s * r * 1.0 - r * 0.17, -r * 0.42, r * 0.34, r * 0.6, r * 0.14); ctx.fill(); ctx.stroke(); }
        break;
      }
      case 'biyik': {
        ctx.fillStyle = ch.hair === 'yok' ? '#2b1a0e' : ch.hairColor;
        ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = Math.max(0.8, r * 0.04);
        ctx.save(); ctx.translate(ex, ey + r * 0.36);
        ctx.beginPath();
        ctx.moveTo(0, -r * 0.04);
        ctx.bezierCurveTo(-r * 0.18, -r * 0.16, -r * 0.42, -r * 0.1, -r * 0.48, r * 0.08);
        ctx.bezierCurveTo(-r * 0.3, 0, -r * 0.14, r * 0.06, 0, r * 0.04);
        ctx.bezierCurveTo(r * 0.14, r * 0.06, r * 0.3, 0, r * 0.48, r * 0.08);
        ctx.bezierCurveTo(r * 0.42, -r * 0.1, r * 0.18, -r * 0.16, 0, -r * 0.04);
        ctx.fill(); ctx.stroke(); ctx.restore();
        break;
      }
      case 'yara': {
        ctx.save(); ctx.translate(ex - r * 0.5, ey + r * 0.35); ctx.rotate(-0.5);
        ctx.fillStyle = '#f2cc8f'; ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = Math.max(0.8, r * 0.04);
        ctx.beginPath(); ctx.roundRect(-r * 0.3, -r * 0.09, r * 0.6, r * 0.18, r * 0.08); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#e0a96d'; ctx.fillRect(-r * 0.08, -r * 0.09, r * 0.16, r * 0.18);
        ctx.restore();
        break;
      }
    }
  }

  function drawEyes(ctx, r, ch, lookAng, blink, mood) {
    const style = ch.eyes;
    const ex = Math.cos(lookAng) * r * 0.22, ey = Math.sin(lookAng) * r * 0.14 - r * 0.06;
    const sep = r * 0.31, er = r * 0.23;
    const px = Math.cos(lookAng) * er * 0.38, py = Math.sin(lookAng) * er * 0.38;
    ctx.save();
    ctx.translate(ex, ey);
    if (mood === 'happy') {
      ctx.strokeStyle = '#111'; ctx.lineWidth = Math.max(1.4, r * 0.1); ctx.lineCap = 'round';
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(s * sep, er * 0.3, er * 0.8, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke(); }
      ctx.restore(); return;
    }
    if (style === 'havali' && mood !== 'stun') {
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
    let open = blink ? 0.12 : style === 'uykulu' ? 0.5 : 1;
    if (mood === 'tired' || mood === 'sad') open = Math.min(open, 0.55);
    for (const s of [-1, 1]) {
      ctx.save(); ctx.translate(s * sep, 0);
      ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = Math.max(1, r * 0.06);
      ctx.beginPath(); ctx.ellipse(0, 0, er, er * 1.1 * open, 0, 0, TAU); ctx.fill(); ctx.stroke();
      if (open > 0.2) {
        const pr = style === 'sevimli' ? er * 0.72 : er * 0.5;
        const ppy = mood === 'sad' ? er * 0.3 : py * open;
        if (mood === 'stun') {
          ctx.strokeStyle = '#7b2cbf'; ctx.lineWidth = Math.max(1, r * 0.06);
          ctx.beginPath(); for (let a = 0; a < 9; a += 0.4) { const rr = a / 9 * er * 0.8; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr * open); } ctx.stroke();
        } else if (mood === 'frozen') {
          ctx.fillStyle = '#5ab0e8'; ctx.beginPath(); ctx.arc(px, ppy, pr, 0, TAU); ctx.fill();
        } else {
          ctx.fillStyle = '#111';
          ctx.beginPath(); ctx.arc(px, ppy, pr, 0, TAU); ctx.fill();
          if (style === 'sevimli') { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(px - pr * 0.3, ppy - pr * 0.35, pr * 0.32, 0, TAU); ctx.fill(); }
        }
      }
      if (style === 'uykulu' || mood === 'tired' || mood === 'sad') {
        ctx.fillStyle = shade(ch.c1, -0.25);
        ctx.beginPath(); ctx.ellipse(0, -er * 0.35, er * 1.12, er * 0.75, mood === 'sad' ? s * 0.35 : 0, Math.PI, TAU); ctx.fill();
      }
      if (style === 'kizgin' || mood === 'angry') {
        ctx.strokeStyle = '#111'; ctx.lineWidth = Math.max(1.2, r * 0.1); ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(-er * 1.05, -er * (s > 0 ? 0.75 : 1.3)); ctx.lineTo(er * 1.05, -er * (s > 0 ? 1.3 : 0.75)); ctx.stroke();
      }
      ctx.restore();
    }
    ctx.restore();
  }

  function drawFeet(ctx, r, ch, f) {
    // f: {phase, ang, speed}
    const shoe = shade(ch.c2, -0.55);
    const moving = f && f.speed > 0.3;
    const ang = moving ? f.ang : Math.PI / 2;
    const ca = Math.cos(ang), sa = Math.sin(ang);
    for (const s of [-1, 1]) {
      const swing = moving ? Math.sin(f.phase + (s > 0 ? Math.PI : 0)) * r * 0.42 * Math.min(1, f.speed / 2) : 0;
      const side = r * 0.5 * s;
      let x = -sa * side + ca * swing, y = ca * side + sa * swing;
      if (!moving) { x = s * r * 0.5; y = r * 0.78; }
      else { x += ca * r * 0.15; y += sa * r * 0.15 + r * 0.25; }
      ctx.fillStyle = shoe; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = Math.max(1, r * 0.06);
      ctx.beginPath(); ctx.ellipse(x, y, r * 0.3, r * 0.22, moving ? ang : 0, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.beginPath(); ctx.ellipse(x + (moving ? ca : 0) * r * 0.12, y + (moving ? sa : 0) * r * 0.12 - r * 0.04, r * 0.09, r * 0.05, 0, 0, TAU); ctx.fill();
    }
  }

  function drawPlayerBody(ctx, p, ch, o) {
    // o: {look, blink, kickReady, mood, feet, t, sway}
    const r = p.r;
    const ex = Math.cos(o.look) * r * 0.22, ey = Math.sin(o.look) * r * 0.14 - r * 0.06;
    if (o.feet !== false) drawFeet(ctx, r, ch, o.feet);
    drawHairBack(ctx, r, ch, o.t || 0, o.sway || 0);
    drawJersey(ctx, r, ch);
    // numara (gövdenin alt kısmında)
    ctx.save();
    ctx.font = `900 ${Math.max(7, Math.round(r * 0.42))}px Rubik, system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const light = lum(ch.c1) > 0.6;
    ctx.lineWidth = Math.max(1, r * 0.09); ctx.strokeStyle = light ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.55)';
    ctx.strokeText(String(ch.number), 0, r * 0.6);
    ctx.fillStyle = light ? '#111' : '#fff'; ctx.fillText(String(ch.number), 0, r * 0.6);
    ctx.restore();
    // kenarlık
    ctx.lineWidth = Math.max(2, r * 0.13);
    ctx.strokeStyle = o.kickReady ? '#ffffff' : 'rgba(10,14,20,0.95)';
    ctx.beginPath(); ctx.arc(0, 0, r - ctx.lineWidth / 2 + 0.5, 0, TAU); ctx.stroke();
    drawHairFront(ctx, r, ch);
    drawEyes(ctx, r, ch, o.look, o.blink, o.mood);
    drawAccessory(ctx, r, ch, ex, ey);
    if (o.kickReady && ch.hair !== 'yok') {
      // şut hazır göstergesi saçın üstünde de görünsün
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = Math.max(1.5, r * 0.08);
      ctx.beginPath(); ctx.arc(0, 0, r + r * 0.12, Math.PI * 0.1, Math.PI * 0.9); ctx.stroke();
    }
  }

  // =====================================================================
  //  PARÇACIKLAR
  // =====================================================================
  class FX {
    constructor() { this.parts = []; this.rings = []; this.texts = []; }
    add(p) { if (this.parts.length < 1600) this.parts.push(Object.assign({ drag: 0.92, grav: 0, shape: 'c', rot: 0, vr: 0, z: 0, vz: 0 }, p)); }
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
        ctx.beginPath(); ctx.arc(r.x, r.y, Math.max(0, r.r0 + (r.r1 - r.r0) * e), 0, TAU); ctx.stroke();
      }
      for (const p of this.parts) {
        const a = Math.min(1, p.life / (p.max * 0.4));
        ctx.globalAlpha = a;
        ctx.fillStyle = p.color;
        if (p.shape === 'r') {
          ctx.save(); ctx.translate(p.x, p.y - p.z); ctx.rotate(p.rot);
          ctx.fillRect(-p.size, -p.size * 0.5, p.size * 2, p.size); ctx.restore();
        } else if (p.shape === 'l') {
          ctx.strokeStyle = p.color; ctx.lineWidth = p.size; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 4, p.y - p.vy * 4); ctx.stroke();
        } else {
          ctx.beginPath(); ctx.arc(p.x, p.y - p.z, Math.max(0.1, p.size * (p.shape === 'g' ? a : 1)), 0, TAU); ctx.fill();
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

  // =====================================================================
  //  SAHA (önceden çizilen statik katman)
  // =====================================================================
  const PEN_D = 112, PEN_H = 142, BOX_D = 38, BOX_H = C.GH + 26, SPOT_D = 80, ARC_R = 58, CORNER_R = 11;

  function makePitch(scale, theme) {
    const { FW, FH, OW, OH, GH, GD, CENTER_R } = C;
    const W = 2 * OW, H = 2 * OH;
    const cv = document.createElement('canvas');
    cv.width = Math.ceil(W * scale); cv.height = Math.ceil(H * scale);
    const g = cv.getContext('2d');
    g.scale(scale, scale);
    g.translate(OW, OH);
    const rnd = rng(11);

    // Biçilmiş çim: dikey şeritler x yatay bantlar (dama)
    const cols = 16, rows = 8;
    const sw = 2 * FW / cols * 1, sh = 2 * FH / rows;
    const base = theme === 'kar' ? ['#7fae86', '#88b78e', '#78a67f', '#83b289'] : ['#3e9a3f', '#459f45', '#3a9139', '#41983f'];
    g.fillStyle = base[0]; g.fillRect(-OW, -OH, W, H);
    for (let i = -Math.ceil(OW / sw) - 1; i < Math.ceil(OW / sw) + 1; i++) {
      for (let j = -Math.ceil(OH / sh) - 1; j < Math.ceil(OH / sh) + 1; j++) {
        const k = ((i & 1) ? 1 : 0) + ((j & 1) ? 2 : 0);
        g.fillStyle = base[k];
        g.fillRect(i * sw, j * sh, sw + 0.5, sh + 0.5);
      }
    }
    // çim lifleri
    for (let i = 0; i < W * H / 14; i++) {
      const x = -OW + rnd() * W, y = -OH + rnd() * H;
      const v = rnd();
      g.fillStyle = v < 0.45 ? 'rgba(255,255,230,0.05)' : v < 0.9 ? 'rgba(0,30,0,0.07)' : 'rgba(120,200,80,0.12)';
      g.fillRect(x, y, 1, 2 + rnd() * 2);
    }
    // ton dalgalanması
    for (let i = 0; i < 70; i++) {
      const x = -OW + rnd() * W, y = -OH + rnd() * H, r = 25 + rnd() * 80;
      const rg = g.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, rnd() < 0.5 ? 'rgba(10,50,10,0.09)' : 'rgba(230,255,170,0.06)');
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = rg; g.fillRect(x - r, y - r, 2 * r, 2 * r);
    }
    // kar örtüsü
    if (theme === 'kar') {
      for (let i = 0; i < 160; i++) {
        const x = -OW + rnd() * W, y = -OH + rnd() * H, r = 15 + rnd() * 70;
        const rg = g.createRadialGradient(x, y, 0, x, y, r);
        rg.addColorStop(0, 'rgba(250,252,255,0.55)'); rg.addColorStop(1, 'rgba(250,252,255,0)');
        g.fillStyle = rg; g.fillRect(x - r, y - r, 2 * r, 2 * r);
      }
      for (let i = 0; i < W * H / 30; i++) { g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(-OW + rnd() * W, -OH + rnd() * H, 1.4, 1.4); }
    }
    // aşınma: kale ağızları, penaltı noktaları, orta nokta
    const wear = (x, y, rx, ry, n, a) => {
      for (let i = 0; i < n; i++) {
        const ang = rnd() * TAU, d = Math.pow(rnd(), 0.7);
        const px = x + Math.cos(ang) * rx * d, py = y + Math.sin(ang) * ry * d;
        g.fillStyle = rnd() < 0.6 ? `rgba(150,120,70,${a * (1 - d) + 0.04})` : `rgba(190,170,110,${a * (1 - d)})`;
        g.beginPath(); g.arc(px, py, 0.8 + rnd() * 2.2, 0, TAU); g.fill();
      }
    };
    for (const sx of [-1, 1]) {
      wear(sx * (FW - 14), 0, 26, GH * 0.9, 900, 0.45);
      wear(sx * (FW - SPOT_D), 0, 12, 12, 140, 0.4);
    }
    wear(0, 0, 14, 14, 160, 0.35);

    // Çizgiler — boya dokulu
    const line = (fn, w) => {
      g.save();
      g.strokeStyle = theme === 'kar' ? 'rgba(30,90,200,0.9)' : 'rgba(255,255,255,0.92)'; g.lineWidth = w || 3; g.lineCap = 'butt'; g.lineJoin = 'miter';
      g.beginPath(); fn(); g.stroke();
      g.restore();
    };
    line(() => g.rect(-FW, -FH, 2 * FW, 2 * FH));
    line(() => { g.moveTo(0, -FH); g.lineTo(0, FH); });
    line(() => g.arc(0, 0, CENTER_R, 0, TAU));
    g.fillStyle = theme === 'kar' ? 'rgba(30,90,200,0.95)' : 'rgba(255,255,255,0.95)';
    g.beginPath(); g.arc(0, 0, 3.5, 0, TAU); g.fill();
    const arcA = Math.acos((PEN_D - SPOT_D) / ARC_R);
    for (const sx of [-1, 1]) {
      const gx = sx * FW;
      line(() => { g.moveTo(gx, -PEN_H); g.lineTo(gx - sx * PEN_D, -PEN_H); g.lineTo(gx - sx * PEN_D, PEN_H); g.lineTo(gx, PEN_H); });
      line(() => { g.moveTo(gx, -BOX_H); g.lineTo(gx - sx * BOX_D, -BOX_H); g.lineTo(gx - sx * BOX_D, BOX_H); g.lineTo(gx, BOX_H); });
      const spx = gx - sx * SPOT_D;
      g.beginPath(); g.arc(spx, 0, 3, 0, TAU); g.fill();
      const c = sx < 0 ? 0 : Math.PI; // sahanın ortasına bakan yön
      line(() => g.arc(spx, 0, ARC_R, c - arcA, c + arcA));
      // korner çeyrek daireleri (sahanın içine)
      for (const sy of [-1, 1]) {
        const a0 = Math.atan2(-sy, -sx);
        line(() => g.arc(gx, sy * FH, CORNER_R, a0 - Math.PI / 4, a0 + Math.PI / 4), 2.5);
      }
    }
    // boya pürüzü
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 2600; i++) {
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.fillRect(-OW + rnd() * W, -OH + rnd() * H, 1, 1);
    }
    g.globalCompositeOperation = 'source-over';
    // kale içi zemin (file gölgesi)
    for (const sx of [-1, 1]) {
      const x0 = sx < 0 ? -FW - GD : FW;
      const lg = g.createLinearGradient(sx * FW, 0, sx * (FW + GD), 0);
      lg.addColorStop(0, 'rgba(0,0,0,0.05)'); lg.addColorStop(1, 'rgba(0,0,0,0.28)');
      g.fillStyle = lg; g.fillRect(x0, -GH, GD, 2 * GH);
    }
    // ışık: sol üstten güneş, kenarlarda hafif kararma
    const lg = g.createLinearGradient(-OW, -OH, OW, OH);
    lg.addColorStop(0, 'rgba(255,250,220,0.07)'); lg.addColorStop(0.5, 'rgba(0,0,0,0)'); lg.addColorStop(1, 'rgba(0,0,0,0.1)');
    g.fillStyle = lg; g.fillRect(-OW, -OH, W, H);
    // dış kenar: saha bitimi
    g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 4; g.strokeRect(-OW + 2, -OH + 2, W - 4, H - 4);
    return cv;
  }

  // Stadyum (tribün iskeleti, koltuklar, ışık kuleleri) — statik
  const BOARD_IN = 8, BOARD_W = 13, TRACK = 4, STAND_IN = BOARD_IN + BOARD_W + TRACK + 4, ROWS = 7, ROW_H = 11;
  function makeStadium(scale) {
    const { OW, OH } = C;
    const ext = STAND_IN + ROWS * ROW_H + 60;
    const W = 2 * (OW + ext), H = 2 * (OH + ext);
    const cv = document.createElement('canvas');
    cv.width = Math.ceil(W * scale); cv.height = Math.ceil(H * scale);
    const g = cv.getContext('2d');
    g.scale(scale, scale); g.translate(W / 2, H / 2);
    // beton zemin
    g.fillStyle = '#1a2029'; g.fillRect(-W / 2, -H / 2, W, H);
    // pist (saha ile pano arası)
    g.fillStyle = '#2a4d2c'; g.fillRect(-OW - BOARD_IN, -OH - BOARD_IN, 2 * (OW + BOARD_IN), 2 * (OH + BOARD_IN));
    // tribün basamakları
    for (let r = ROWS - 1; r >= 0; r--) {
      const o = STAND_IN + r * ROW_H;
      g.fillStyle = r % 2 ? '#262e3a' : '#2c3542';
      g.beginPath(); g.roundRect(-OW - o - ROW_H, -OH - o - ROW_H, 2 * (OW + o + ROW_H), 2 * (OH + o + ROW_H), 14 + r * 3); g.fill();
      // basamak ön kenarı
      g.strokeStyle = 'rgba(255,255,255,0.05)'; g.lineWidth = 1.2;
      g.beginPath(); g.roundRect(-OW - o, -OH - o, 2 * (OW + o), 2 * (OH + o), 12 + r * 3); g.stroke();
    }
    // iç duvar
    g.fillStyle = '#141920';
    g.beginPath(); g.roundRect(-OW - STAND_IN, -OH - STAND_IN, 2 * (OW + STAND_IN), 2 * (OH + STAND_IN), 12); g.fill();
    g.fillStyle = '#2a4d2c';
    g.fillRect(-OW - STAND_IN + 3, -OH - STAND_IN + 3, 2 * (OW + STAND_IN - 3), 2 * (OH + STAND_IN - 3));
    // koridor merdivenleri
    const o1 = STAND_IN, o2 = STAND_IN + ROWS * ROW_H;
    g.fillStyle = '#3b4655';
    for (let x = -OW + 60; x < OW - 40; x += 150) {
      g.fillRect(x, -OH - o2, 8, o2 - o1); g.fillRect(x, OH + o1, 8, o2 - o1);
    }
    for (let y = -OH + 80; y < OH - 40; y += 160) {
      g.fillRect(-OW - o2, y, o2 - o1, 8); g.fillRect(OW + o1, y, o2 - o1, 8);
    }
    // çatı kenarı
    g.strokeStyle = '#0c1015'; g.lineWidth = 18;
    g.beginPath(); g.roundRect(-OW - o2 - 12, -OH - o2 - 12, 2 * (OW + o2 + 12), 2 * (OH + o2 + 12), 34); g.stroke();
    g.strokeStyle = '#3b4655'; g.lineWidth = 2;
    g.beginPath(); g.roundRect(-OW - o2 - 3, -OH - o2 - 3, 2 * (OW + o2 + 3), 2 * (OH + o2 + 3), 28); g.stroke();
    // ışık kuleleri (köşelerde)
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
      const x = sx * (OW + o2 - 6), y = sy * (OH + o2 - 6);
      g.save(); g.translate(x, y); g.rotate(Math.atan2(sy, sx) + Math.PI / 2);
      g.fillStyle = '#0b0e12'; g.fillRect(-26, -10, 52, 20);
      g.fillStyle = '#3a4250'; g.fillRect(-24, -8, 48, 16);
      for (let i = 0; i < 6; i++) for (let j = 0; j < 2; j++) { g.fillStyle = '#f4f1de'; g.fillRect(-22 + i * 7.6, -6 + j * 7, 6, 5); }
      g.restore();
    }
    // yedek kulübeleri (alt kenar ortası)
    for (const sx of [-1, 1]) {
      const x = sx * 90 - 45, y = OH + BOARD_IN + BOARD_W + TRACK;
      g.fillStyle = '#0e1218'; g.beginPath(); g.roundRect(x, y, 90, 26, 8); g.fill();
      g.fillStyle = 'rgba(160,200,230,0.25)'; g.beginPath(); g.roundRect(x + 3, y + 3, 84, 20, 6); g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = 1; g.beginPath(); g.roundRect(x + 3, y + 3, 84, 20, 6); g.stroke();
    }
    // teknik alan çizgisi
    g.strokeStyle = 'rgba(255,255,255,0.35)'; g.setLineDash([4, 4]); g.lineWidth = 1.5;
    g.strokeRect(-150, OH + 2, 300, BOARD_IN - 4);
    g.setLineDash([]);
    return { cv, W, H };
  }

  // =====================================================================
  //  RENDERER
  // =====================================================================
  class Renderer {
    constructor(canvas) {
      this.cv = canvas; this.ctx = canvas.getContext('2d');
      this.fx = new FX();
      this.shake = 0; this.zoomPunch = 0; this.flash = 0;
      this.hype = 0; this.hypeTeam = -1; this.time = 0;
      this.ballRot = 0; this.ballZ = 0; this.ballVZ = 0;
      this.netWobble = [[0, 0, 0], [0, 0, 0]];
      this.look = [0, Math.PI]; this.blinkT = [100, 160]; this.stepPhase = [0, 0];
      this.ghosts = []; this.celebrate = null;
      this.crowd = null; this.teamColors = ['#e63946', '#3a86ff'];
      this.pitch = null; this.stadium = null; this.bakedScale = 0;
      this.boardOffset = 0; this.theme = 'gunduz'; this.emotes = [null, null]; this.taunts = [null, null]; this.flyAng = [0, 0]; this.bumperFlash = [0, 0, 0, 0];
      this.resize();
    }

    say(team, text) { this.taunts[team] = { text: String(text).slice(0, 48), t: 200 }; }

    setTheme(t) {
      if (t === this.theme && this.pitch) return;
      this.theme = t; this.bakedScale = 0; this.resize();
    }

    reset() {
      this.fx = new FX(); this.ghosts = []; this.confettiT = 0; this.hype = 0; this.shake = 0; this.flash = 0; this.zoomPunch = 0;
      this.celebrate = null; this.ballZ = 0; this.ballVZ = 0; this.emotes = [null, null]; this.taunts = [null, null];
    }

    setTeams(chars) {
      this.chars = chars;
      this.teamColors = [chars[0].c1, chars[1].c1];
      this.buildCrowd();
    }

    resize() {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = this.cv.clientWidth || window.innerWidth, h = this.cv.clientHeight || window.innerHeight;
      this.cv.width = Math.round(w * dpr); this.cv.height = Math.round(h * dpr);
      this.dpr = dpr; this.w = w; this.h = h;
      const viewW = 2 * (C.OW + 30), viewH = 2 * (C.OH + 30) + 64;
      this.scale = Math.min(w / viewW, h / viewH);
      const gs = Math.min(2.5, Math.max(1, this.scale * dpr));
      if (!this.pitch || Math.abs(gs - this.bakedScale) > 0.2) {
        this.bakedScale = gs;
        this.pitch = makePitch(gs, this.theme);
        this.stadium = makeStadium(Math.min(2, gs));
      }
    }

    buildCrowd() {
      const out = [];
      const rnd = rng(5);
      const neutrals = ['#d9d4c7', '#2b2d42', '#8d99ae', '#edf2f4', '#555b6e', '#f2cc8f', '#6c757d'];
      const skins = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac'];
      const { OW, OH } = C;
      for (let r = 0; r < ROWS; r++) {
        const o = STAND_IN + r * ROW_H + ROW_H * 0.55;
        const pushLine = (ax, ay, bx, by, sideTeam, vertical) => {
          const len = Math.hypot(bx - ax, by - ay), n = Math.floor(len / 9.5);
          for (let i = 0; i <= n; i++) {
            const t = i / n;
            const x = ax + (bx - ax) * t, y = ay + (by - ay) * t;
            // merdiven boşlukları
            if (!vertical && (((x + OW - 60) % 150) + 150) % 150 < 12) continue;
            if (vertical && (((y + OH - 80) % 160) + 160) % 160 < 12) continue;
            if (rnd() < 0.07) continue;
            let team = sideTeam < 0 ? (x < 0 ? 0 : 1) : sideTeam;
            if (rnd() < 0.12) team = 1 - team;
            const fan = rnd() < 0.7;
            const col = fan ? (rnd() < 0.72 ? this.teamColors[team] : this.chars[team].c2) : neutrals[(rnd() * neutrals.length) | 0];
            out.push({ x: x + (rnd() - 0.5) * 2, y: y + (rnd() - 0.5) * 2, c: col, skin: skins[(rnd() * skins.length) | 0], team, ph: rnd() * TAU, sp: 0.8 + rnd() * 0.6,
              flag: fan && rnd() < 0.04, vertical });
          }
        };
        pushLine(-OW - o + 14, -OH - o, OW + o - 14, -OH - o, -1, false);
        pushLine(-OW - o + 14, OH + o, OW + o - 14, OH + o, -1, false);
        pushLine(-OW - o, -OH - o + 14, -OW - o, OH + o - 14, 0, true);
        pushLine(OW + o, -OH - o + 14, OW + o, OH + o - 14, 1, true);
      }
      this.crowd = out;
    }

    shakeBy(v) { this.shake = Math.min(28, this.shake + v); }

    // ---- Olay tabanlı efektler ----
    onEvent(e) {
      const fx = this.fx;
      const tc = (t) => this.teamColors[t] || '#fff';
      switch (e.k) {
        case 'kick':
        case 'curve':
          fx.burst(e.x, e.y, 6, { dir: Math.atan2(e.ny, e.nx) + Math.PI, spread: 1.6, speed: 2, color: ['#cfe8a9', '#86c06c', '#fff'], life: 20, size: 2 });
          this.shakeBy(1.2); this.ballVZ = Math.max(this.ballVZ, 0.5 + (e.ch || 0) * 1.5);
          if (e.k === 'curve') fx.ring(e.x, e.y, 6, 40, 22, '#b28dff', 3);
          break;
        case 'power':
          fx.burst(e.x, e.y, 22, { dir: Math.atan2(e.ny, e.nx), spread: 1.1, speed: 6, color: ['#fff3b0', '#ffd23f', '#ff9f1c', '#fff'], life: 26, size: 2.6 });
          fx.burst(e.x, e.y, 12, { dir: Math.atan2(e.ny, e.nx) + Math.PI, spread: 1.4, speed: 3, color: ['#8a6d3b', '#6b8e23', '#a0855b'], life: 30, size: 2, vz: 3 });
          fx.ring(e.x, e.y, 8, 55, 18, '#fff', 5);
          this.shakeBy(7); this.zoomPunch = Math.max(this.zoomPunch, 0.025); this.ballVZ = 3.2;
          break;
        case 'rocket':
          fx.burst(e.x, e.y, 36, { dir: Math.atan2(e.ny, e.nx), spread: 1.4, speed: 7, color: ['#ffef99', '#ff9f1c', '#ff4d00', '#d00000'], life: 32, size: 3.5 });
          fx.ring(e.x, e.y, 10, 80, 22, '#ff9f1c', 7);
          this.shakeBy(12); this.zoomPunch = Math.max(this.zoomPunch, 0.04); this.flash = 0.35; this.ballVZ = 1.6;
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
          fx.text(e.x, e.y - 30, pickW(['UÇTU!', 'YANDI!', 'FÜZE!']), '#ff9f1c', 26);
          fx.ring(e.x, e.y, 10, 100, 24, '#ff9f1c', 9);
          this.shakeBy(24); this.flash = 0.5; this.zoomPunch = Math.max(this.zoomPunch, 0.06);
          break;
        case 'tired':
          fx.text(e.x, e.y - 30, 'YORULDU', '#cfe8ff', 13);
          fx.burst(e.x, e.y - 10, 6, { dir: -Math.PI / 2, spread: 2, speed: 2, color: '#9fd8ff', life: 30, size: 2, grav: 0.08 });
          break;
        case 'catch':
          fx.ring(e.x, e.y, 8, 36, 16, '#ffe08a', 4);
          fx.burst(e.x, e.y, 12, { speed: 3, color: ['#fff', '#ffe08a', tc(e.team)], life: 20, size: 2.2 });
          fx.text(e.x, e.y - 30, 'TUTTU!', '#ffe08a', 18);
          this.shakeBy(4);
          break;
        case 'shieldhit':
          fx.ring(e.x, e.y, 6, 30, 14, '#ffffff', 3);
          fx.burst(e.x, e.y, 8, { speed: 3, color: ['#fff', tc(e.team)], life: 18, size: 2 });
          this.shakeBy(3);
          break;
        case 'ab': {
          const col = tc(e.team);
          switch (e.a) {
            case 'sok':
              fx.ring(e.x, e.y, 16, 140, 26, '#ffffff', 9);
              fx.ring(e.x, e.y, 16, 120, 32, col, 6);
              fx.burst(e.x, e.y, 30, { speed: 6, color: ['#fff', col], life: 26, size: 2.5, drag: 0.9 });
              this.shakeBy(14); this.flash = 0.2; break;
            case 'atilma':
              fx.burst(e.x, e.y, 14, { speed: 3, color: ['#fff', '#cfe8a9'], life: 20, size: 2.5 }); this.shakeBy(3); break;
            case 'dev':
              fx.ring(e.x, e.y, 20, 70, 24, col, 7); this.shakeBy(8);
              fx.burst(e.x, e.y, 18, { speed: 4, color: ['#fff', col], life: 26, size: 3 }); break;
            case 'miknatis': fx.ring(e.x, e.y, 170, 18, 30, '#7fd1ff', 4); break;
            case 'buz':
              if (e.hit === 0) { // ıskaladı: menzili göster
                fx.ring(e.x, e.y, 20, C.BUZ_RANGE, 22, '#bfe9ff', 3);
                fx.text(e.tx, e.ty - 20, 'ISKA', '#bfe9ff', 14);
                break;
              }
              fx.ring(e.tx, e.ty, 60, 14, 26, '#bfe9ff', 6);
              fx.burst(e.tx, e.ty, 26, { speed: 4, color: ['#e8f7ff', '#9fd8ff', '#ffffff'], life: 34, size: 2.4, shape: 'r' });
              this.shakeBy(5); break;
            case 'isinlan':
              fx.burst(e.fx, e.fy, 22, { speed: 3, color: ['#fff', '#e0c3ff', col], life: 26, size: 2.5 });
              fx.ring(e.fx, e.fy, 24, 4, 16, '#e0c3ff', 4);
              fx.ring(e.x, e.y, 4, 34, 18, '#e0c3ff', 4);
              fx.burst(e.x, e.y, 22, { speed: 3, color: ['#fff', '#e0c3ff', col], life: 26, size: 2.5 }); break;
            case 'kalkan':
              this.shakeBy(6); break;
            case 'eldiven':
              fx.ring(e.x, e.y, 14, 48, 20, '#ffe08a', 4); break;
            case 'ters':
              fx.ring(e.tx, e.ty, 50, 10, 24, '#ff5d8f', 5);
              fx.text(e.tx, e.ty - 36, '?!', '#ff5d8f', 24); break;
            case 'cagir':
              fx.burst(e.fx, e.fy, 18, { speed: 3, color: ['#fff', '#e0c3ff'], life: 24, size: 2.5 });
              fx.ring(e.x, e.y, 40, 6, 18, '#e0c3ff', 4); break;
            case 'turbo':
              fx.ring(e.x, e.y, 10, 60, 18, '#ffd23f', 5); this.shakeBy(4); break;
            case 'ruzgar':
              fx.ring(e.x, e.y, 10, 90, 22, '#cfe8ff', 5); break;
            case 'sis':
              fx.burst(e.x, e.y, 30, { speed: 3, color: ['rgba(220,225,230,0.7)', 'rgba(200,205,210,0.6)'], life: 60, size: 10, drag: 0.95, shape: 'g' }); break;
            default:
              fx.ring(e.x, e.y, 14, 44, 20, e.a === 'roket' ? '#ff9f1c' : '#b28dff', 4);
          }
          const A = TP.ABILITIES[e.a];
          if (A) fx.text(e.x, e.y - 34, A.name.toUpperCase(), '#fff', 15);
          break;
        }
        case 'goal': {
          const col = tc(e.team), col2 = this.chars ? this.chars[e.team].c2 : '#fff';
          const gx = e.team === 0 ? C.FW + C.GD * 0.5 : -C.FW - C.GD * 0.5;
          fx.burst(gx, e.y, 28, { speed: 7, color: [col, col2, '#fff', '#ffd23f'], life: 80, size: 3.5, shape: 'r', drag: 0.95, vz: 5 });
          fx.ring(e.x, e.y, 10, 160, 40, '#fff', 10);
          this.netWobble[e.team === 0 ? 1 : 0] = [22, e.y, 0];
          this.shakeBy(22); this.zoomPunch = 0.07; this.flash = 0.5;
          this.hype = 1; this.hypeTeam = e.team;
          this.confettiT = 45; this.confettiCols = [col, col2, '#fff', '#ffd23f'];
          this.celebrate = { team: e.team, scorer: e.team, t: 170 }; // kendi kalesine golde atan üzülür, puanı alan sevinir
          break;
        }
        case 'kickoff':
          this.hype = Math.max(this.hype, 0.2); this.celebrate = null;
          break;
        case 'hit':
          fx.burst(e.x, e.y, 8, { speed: 3, color: ['#fff', '#ffd23f'], life: 16, size: 2 });
          fx.text(e.x, e.y - 28, '●'.repeat(e.n) + '○'.repeat(Math.max(0, 3 - e.n)), '#ffd23f', 13);
          this.shakeBy(2.5);
          break;
        case 'dizzy':
          fx.ring(e.x, e.y, 10, 70, 26, '#ffd23f', 6);
          fx.burst(e.x, e.y, 20, { speed: 4, color: ['#ffd23f', '#fff'], life: 30, size: 3, shape: 'r' });
          fx.text(e.x, e.y - 36, 'SERSEMLEDİ!', '#ffd23f', 20);
          this.shakeBy(10); this.flash = 0.2;
          break;
        case 'tackle':
          fx.burst(e.x, e.y, 14, { speed: 4.5, color: ['#fff', '#ddd', '#ffd23f'], life: 18, size: 2.5 });
          fx.ring(e.x, e.y, 8, 38, 12, '#ffffff', 4);
          fx.text(e.x, e.y - 22, pickW(['PAT!', 'GÜM!', 'TOK!', 'ÇAT!']), '#fff', 17);
          this.shakeBy(7);
          break;
        case 'smack':
          fx.burst(e.x, e.y, 20, { speed: 5, color: ['#fff', '#ffd23f', '#ff9f1c'], life: 22, size: 3 });
          fx.ring(e.x, e.y, 10, 55, 16, '#fff', 6);
          fx.text(e.x, e.y - 30, pickW(['ÇAAT!', 'BAM!', 'KÜT!']), '#ffd23f', 20);
          this.shakeBy(Math.min(16, e.s)); this.zoomPunch = Math.max(this.zoomPunch, 0.03);
          break;
        case 'slam':
          fx.burst(e.x, e.y, 14, { speed: 3.5, color: ['#fff', '#cfd8dc', '#8d99ae'], life: 22, size: 2.5 });
          fx.ring(e.x, e.y, 6, 34, 14, '#ffffff', 4);
          this.shakeBy(Math.min(14, e.s * 1.2));
          break;
        case 'intogoal':
          fx.burst(e.x, e.y, 40, { speed: 6, color: ['#fff', '#ffd23f', this.teamColors[1 - e.team]], life: 50, size: 3.5, shape: 'r', vz: 4 });
          fx.text(e.x, e.y - 40, 'KALEYE GÖMÜLDÜ!', '#fff', 22);
          this.netWobble[e.x < 0 ? 0 : 1] = [24, e.y, 0];
          this.shakeBy(16); this.hype = Math.max(this.hype, 0.8); this.hypeTeam = 1 - e.team;
          break;
        case 'mine':
        case 'boom': {
          const big = e.k === 'boom';
          fx.ring(e.x, e.y, 10, big ? 170 : 90, 30, '#ffffff', big ? 12 : 8);
          fx.ring(e.x, e.y, 10, big ? 150 : 80, 36, '#ff9f1c', big ? 8 : 6);
          fx.burst(e.x, e.y, big ? 60 : 36, { speed: big ? 8 : 6, color: ['#ffef99', '#ff9f1c', '#ff4d00', '#333', '#666'], life: 40, size: 4, vz: 4 });
          fx.burst(e.x, e.y, 20, { speed: 2, color: ['rgba(60,60,60,0.6)', 'rgba(90,90,90,0.5)'], life: 70, size: 9, drag: 0.95, shape: 'g' });
          fx.text(e.x, e.y - 40, big ? 'BOOOM!' : 'MAYIN!', '#ff9f1c', big ? 30 : 22);
          this.shakeBy(big ? 26 : 18); this.flash = big ? 0.6 : 0.4; this.zoomPunch = Math.max(this.zoomPunch, big ? 0.06 : 0.04);
          break;
        }
        case 'pickspawn': break;
        case 'pickup':
          fx.ring(e.x, e.y, 6, 60, 24, '#7fd1ff', 6);
          fx.burst(e.x, e.y, 26, { speed: 4, color: ['#7fd1ff', '#ffffff', '#ffd23f'], life: 30, size: 2.5, shape: 'r' });
          fx.text(e.x, e.y - 30, e.a && TP.ABILITIES[e.a] ? TP.ABILITIES[e.a].icon + ' HAZIR!' : 'ENERJİ!', '#7fd1ff', 18);
          break;
        case 'emote':
          this.emotes[e.team] = { e: e.e, t: 100 };
          break;
        case 'perfect':
          fx.burst(e.x, e.y, 30, { dir: Math.atan2(e.ny, e.nx), spread: 1.2, speed: 7, color: ['#ffffff', '#7fd1ff', '#ffd23f'], life: 28, size: 3 });
          fx.ring(e.x, e.y, 8, 70, 20, '#7fd1ff', 7);
          fx.text(e.x, e.y - 30, 'MÜKEMMEL!', '#7fd1ff', 22);
          this.shakeBy(10); this.zoomPunch = Math.max(this.zoomPunch, 0.035); this.ballVZ = 3.5;
          break;
        case 'bumper':
          if (e.i >= 0) this.bumperFlash[e.i] = 12;
          fx.ring(e.x, e.y, 18, 36, 12, '#ffd23f', 4);
          this.shakeBy(2);
          break;
        case 'meteor':
          fx.ring(e.x, e.y, 10, 95, 26, '#ffffff', 10);
          fx.ring(e.x, e.y, 10, 85, 32, '#ff9f1c', 7);
          fx.burst(e.x, e.y, 40, { speed: 7, color: ['#ffef99', '#ff9f1c', '#ff4d00', '#5c4033', '#333'], life: 36, size: 3.5, vz: 4 });
          fx.burst(e.x, e.y, 12, { speed: 1.5, color: ['rgba(70,60,50,0.55)'], life: 60, size: 9, drag: 0.95, shape: 'g' });
          this.shakeBy(14); this.flash = Math.max(this.flash, 0.25);
          this.craters = (this.craters || []).concat([{ x: e.x, y: e.y, t: 600 }]).slice(-8);
          break;
        case 'end':
          this.hype = 1; this.hypeTeam = e.winner;
          this.confettiT = 120; this.confettiCols = e.winner >= 0 ? [tc(e.winner), this.chars[e.winner].c2, '#fff', '#ffd23f'] : ['#fff', '#ffd23f'];
          if (e.winner >= 0) this.celebrate = { team: e.winner, scorer: e.winner, t: 100000 };
          break;
      }
    }

    // ---- Ana çizim ----
    draw(sim, dt, ext) {
      ext = ext || 0;
      const ctx = this.ctx;
      this.time += dt;
      this.fx.update(dt);
      this.shake *= Math.pow(0.86, dt);
      this.zoomPunch *= Math.pow(0.92, dt);
      this.flash *= Math.pow(0.88, dt);
      this.hype *= Math.pow(0.995, dt);
      if (this.celebrate) { this.celebrate.t -= dt; if (this.celebrate.t <= 0) this.celebrate = null; }
      for (const nw of this.netWobble) { nw[0] *= Math.pow(0.93, dt); nw[2] += 0.45 * dt; }
      // top yüksekliği (görsel)
      this.ballVZ -= 0.22 * dt; this.ballZ += this.ballVZ * dt;
      if (this.ballZ < 0) { this.ballZ = 0; this.ballVZ = this.ballVZ < -1 ? -this.ballVZ * 0.35 : 0; }

      const b = sim.ball, P = sim.players;
      const pos = (o) => [o.x + o.vx * ext, o.y + o.vy * ext];
      const [bx, by] = pos(b);

      if (this.confettiT > 0) {
        this.confettiT -= dt;
        if (Math.random() < 0.4) for (let i = 0; i < 1; i++) {
          this.fx.add({ x: (Math.random() - 0.5) * 2 * C.OW, y: -C.OH - 30 + Math.random() * 30, vx: (Math.random() - 0.5) * 1.5, vy: 1.5 + Math.random() * 2, life: 200, max: 200, size: 2.5 + Math.random() * 2,
            color: this.confettiCols[(Math.random() * this.confettiCols.length) | 0], drag: 0.995, grav: 0.01, shape: 'r', rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 0.3 });
        }
      }

      // Sürekli efektler
      const bs = Math.hypot(b.vx, b.vy);
      if (b.fire > 0) {
        for (let i = 0; i < 3; i++) this.fx.add({ x: bx + (Math.random() - 0.5) * 8, y: by - this.ballZ + (Math.random() - 0.5) * 8, vx: -b.vx * 0.15 + (Math.random() - 0.5), vy: -b.vy * 0.15 + (Math.random() - 0.5),
          life: 22, max: 22, size: 4 + Math.random() * 4, color: ['#ffef99', '#ff9f1c', '#ff4d00', '#d00000', '#555'][(Math.random() * 5) | 0], drag: 0.9, shape: 'g' });
      }
      if (b.spin) this.fx.add({ x: bx, y: by - this.ballZ, vx: 0, vy: 0, life: 18, max: 18, size: 3, color: '#b28dff', drag: 1, shape: 'g' });
      for (const p of P) {
        const sp = Math.hypot(p.vx, p.vy);
        if (sp > 2.2 && Math.random() < (p.sprinting ? 0.6 : 0.22) * dt) this.fx.add({ x: p.x - p.vx * 3, y: p.y - p.vy * 3 + p.r * 0.6, vx: -p.vx * 0.1, vy: -p.vy * 0.1 - 0.2, life: 20, max: 20, size: 2 + Math.random() * 2.5, color: 'rgba(210,235,180,0.55)', drag: 0.9, shape: 'g' });
        if (p.sprinting && sp > 2.5 && Math.random() < 0.5 * dt) {
          const a = Math.atan2(p.vy, p.vx) + Math.PI, off = (Math.random() - 0.5) * p.r * 1.6;
          this.fx.add({ x: p.x + Math.cos(a) * p.r + Math.cos(a + Math.PI / 2) * off, y: p.y + Math.sin(a) * p.r + Math.sin(a + Math.PI / 2) * off, vx: p.vx * 0.5, vy: p.vy * 0.5, life: 10, max: 10, size: 1.6, color: 'rgba(255,255,255,0.7)', drag: 0.85, shape: 'l' });
        }
        if (p.exhausted && Math.random() < 0.06 * dt) this.fx.add({ x: p.x + (Math.random() - 0.5) * p.r, y: p.y - p.r, vx: (Math.random() - 0.5) * 0.6, vy: -0.5, life: 30, max: 30, size: 1.8, color: '#9fd8ff', grav: 0.06, drag: 0.98 });
        if (p.dash > 0) this.ghosts.push({ x: p.x, y: p.y, r: p.r, team: p.team, life: 14 });
        if (p.charge >= 1 && p.kickReady && Math.random() < 0.5 * dt) {
          const a = Math.random() * TAU;
          this.fx.add({ x: p.x + Math.cos(a) * (p.r + 8), y: p.y + Math.sin(a) * (p.r + 8), vx: Math.cos(a) * 1.2, vy: Math.sin(a) * 1.2, life: 14, max: 14, size: 2, color: '#ffd23f', drag: 0.9 });
        }
        if (p.slow > 0 && Math.random() < 0.3 * dt) this.fx.add({ x: p.x + (Math.random() - 0.5) * p.r * 2, y: p.y + (Math.random() - 0.5) * p.r * 2, vx: 0, vy: 0.3, life: 24, max: 24, size: 1.8, color: '#e8f7ff', shape: 'r', vr: 0.2 });
      }
      for (const g of this.ghosts) g.life -= dt;
      this.ghosts = this.ghosts.filter(g => g.life > 0);

      // Kamera
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#0d1117'; ctx.fillRect(0, 0, this.cv.width, this.cv.height);
      const s = this.scale * (1 + this.zoomPunch) * this.dpr;
      const sx = (Math.random() - 0.5) * this.shake, sy = (Math.random() - 0.5) * this.shake;
      const fx_ = this.zoomPunch * 3 * bx, fy_ = this.zoomPunch * 3 * by;
      ctx.setTransform(s, 0, 0, s, this.cv.width / 2 + (sx - fx_) * this.dpr * this.scale * 0.5, this.cv.height / 2 + 30 * this.dpr * this.scale + (sy - fy_) * this.dpr * this.scale * 0.5);

      this.drawStadium(ctx);
      ctx.drawImage(this.pitch, -C.OW, -C.OH, 2 * C.OW, 2 * C.OH);
      this.drawGoals(ctx, 'back');
      this.drawShields(ctx, sim, 'base');

      // gölgeler
      ctx.fillStyle = 'rgba(0,0,0,0.24)';
      for (const p of P) { const [x, y] = pos(p); ctx.beginPath(); ctx.ellipse(x + 4, y + 7, p.r * 1.0, p.r * 0.85, 0, 0, TAU); ctx.fill(); }
      const z = this.ballZ;
      ctx.fillStyle = `rgba(0,0,0,${0.26 - Math.min(0.12, z * 0.008)})`;
      ctx.beginPath(); ctx.ellipse(bx + 3 + z * 0.7, by + 5 + z * 0.5, b.r * (1 - Math.min(0.3, z * 0.015)), b.r * 0.85 * (1 - Math.min(0.3, z * 0.015)), 0, 0, TAU); ctx.fill();

      // meteor kraterleri
      if (this.craters) {
        for (const c of this.craters) {
          c.t -= dt;
          ctx.fillStyle = `rgba(60,40,25,${Math.min(0.45, c.t / 600 * 0.45)})`;
          ctx.beginPath(); ctx.ellipse(c.x, c.y, 26, 21, 0, 0, TAU); ctx.fill();
        }
        this.craters = this.craters.filter(c => c.t > 0);
      }
      // buzlu zemin
      if (sim.chaos && sim.chaos.k === 'buz') {
        ctx.fillStyle = 'rgba(190,230,255,0.22)'; ctx.fillRect(-C.FW, -C.FH, 2 * C.FW, 2 * C.FH);
        if (Math.random() < 0.5) this.fx.add({ x: (Math.random() - 0.5) * 2 * C.FW, y: (Math.random() - 0.5) * 2 * C.FH, vx: 0, vy: 0, life: 20, max: 20, size: 1.6, color: '#ffffff', shape: 'r', vr: 0.3 });
      }
      // tamponlar (langırt)
      if (sim.bumpers) sim.bumpers.forEach((bp, i) => {
        const f = this.bumperFlash[i] > 0 ? this.bumperFlash[i] / 12 : 0;
        this.bumperFlash[i] = Math.max(0, this.bumperFlash[i] - dt);
        const rr = bp.r * (1 + f * 0.15);
        ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(bp.x + 4, bp.y + 6, rr, rr * 0.9, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = f > 0 ? '#ffffff' : '#e63946'; ctx.strokeStyle = '#0b0f14'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(bp.x, bp.y, rr, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.arc(bp.x, bp.y, rr * 0.62, 0, TAU); ctx.fill();
        ctx.strokeStyle = '#0b0f14'; ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.beginPath(); ctx.ellipse(bp.x - rr * 0.3, bp.y - rr * 0.35, rr * 0.25, rr * 0.13, -0.5, 0, TAU); ctx.fill();
      });
      // meteor hedefleri
      if (sim.meteors) for (const m of sim.meteors) {
        const k = 1 - m.t / 70;
        ctx.strokeStyle = Math.floor(this.time / 4) % 2 ? '#ff4d00' : '#ffd23f'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(m.x, m.y, 85 * (1 - k * 0.6), 0, TAU); ctx.stroke();
        ctx.fillStyle = `rgba(255,77,0,${0.08 + k * 0.18})`; ctx.beginPath(); ctx.arc(m.x, m.y, 85, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.moveTo(m.x - 12, m.y); ctx.lineTo(m.x + 12, m.y); ctx.moveTo(m.x, m.y - 12); ctx.lineTo(m.x, m.y + 12); ctx.stroke();
        if (m.t < 18) {
          const h = m.t * 22, mx = m.x + m.t * 9, my = m.y - h;
          ctx.strokeStyle = 'rgba(255,159,28,0.8)'; ctx.lineWidth = 6; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(mx + 40, my - 70); ctx.stroke();
          ctx.fillStyle = '#5c4033'; ctx.beginPath(); ctx.arc(mx, my, 9, 0, TAU); ctx.fill();
        }
      }

      // mayınlar
      if (sim.mines) for (const m of sim.mines) {
        const col = this.teamColors[m.team];
        ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(m.x + 2, m.y + 3, 9, 7, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#2b2d42'; ctx.strokeStyle = col; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(m.x, m.y, 8, 0, TAU); ctx.fill(); ctx.stroke();
        const blink = m.arm > 0 ? 0.3 : (Math.floor(this.time / (m.t < 120 ? 4 : 12)) % 2 ? 1 : 0.25);
        ctx.fillStyle = m.arm > 0 ? '#999' : `rgba(255,60,60,${blink})`;
        ctx.beginPath(); ctx.arc(m.x, m.y, 3, 0, TAU); ctx.fill();
      }
      // enerji küreleri
      if (sim.pickups) for (const k of sim.pickups) {
        const bob = Math.sin(this.time * 0.1) * 3, rot = this.time * 0.05;
        ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(k.x + 3, k.y + 8, 10, 6, 0, 0, TAU); ctx.fill();
        if (k.t < 120 && Math.floor(this.time / 5) % 2) continue;
        ctx.save(); ctx.translate(k.x, k.y - 6 + bob);
        ctx.strokeStyle = '#7fd1ff'; ctx.lineWidth = 2.5;
        for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(0, 0, 13, rot + i * TAU / 3, rot + i * TAU / 3 + 1.2); ctx.stroke(); }
        ctx.fillStyle = '#0b3d91'; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(0, 0, 9, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#ffd23f'; ctx.beginPath();
        ctx.moveTo(1.5, -6); ctx.lineTo(-3.5, 1); ctx.lineTo(0, 1); ctx.lineTo(-1.5, 6); ctx.lineTo(3.5, -1); ctx.lineTo(0, -1); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
      if (sim.chaos && sim.chaos.k === 'turbo') for (const p of sim.players) if (Math.hypot(p.vx, p.vy) > 2 && Math.random() < 0.6) this.fx.add({ x: p.x, y: p.y, vx: -p.vx * 0.2, vy: -p.vy * 0.2, life: 10, max: 10, size: 2, color: 'rgba(255,210,63,0.8)', shape: 'l', drag: 0.9 });
      // rüzgar
      if (sim.wind && Math.random() < 0.9) {
        const dir = sim.wind.team === 0 ? 1 : -1;
        for (let i = 0; i < 2; i++) this.fx.add({ x: -dir * C.OW + (Math.random() - 0.5) * 200, y: (Math.random() - 0.5) * 2 * C.OH, vx: dir * (9 + Math.random() * 5), vy: 0, life: 60, max: 60, size: 1.5, color: 'rgba(230,240,255,0.55)', drag: 1, shape: 'l' });
      }

      // mıknatıs alanı
      for (const p of P) if (p.magnet > 0) {
        const [x, y] = pos(p);
        ctx.strokeStyle = 'rgba(127,209,255,0.5)'; ctx.lineWidth = 2; ctx.setLineDash([6, 8]);
        ctx.lineDashOffset = -this.time * 1.5;
        ctx.beginPath(); ctx.arc(x, y, 60 + (this.time * 3) % 120, 0, TAU); ctx.stroke();
        ctx.beginPath(); ctx.arc(x, y, 60 + (this.time * 3 + 60) % 120, 0, TAU); ctx.stroke();
        ctx.setLineDash([]);
        if (Math.hypot(b.x - p.x, b.y - p.y) < 180) {
          ctx.strokeStyle = 'rgba(127,209,255,0.7)'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(bx, by); ctx.stroke();
        }
      }

      for (const g of this.ghosts) {
        ctx.globalAlpha = g.life / 14 * 0.35;
        ctx.fillStyle = this.teamColors[g.team];
        ctx.beginPath(); ctx.arc(g.x, g.y, g.r, 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = 1;

      // top izi
      if (bs > 5) {
        const tl = Math.min(6, bs * 0.5);
        const grd = ctx.createLinearGradient(bx, by - z, bx - b.vx * tl, by - z - b.vy * tl);
        grd.addColorStop(0, b.fire > 0 ? 'rgba(255,159,28,0.7)' : 'rgba(255,255,255,0.45)');
        grd.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.strokeStyle = grd; ctx.lineWidth = b.r * 1.6; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(bx, by - z); ctx.lineTo(bx - b.vx * tl, by - z - b.vy * tl); ctx.stroke();
      }

      // derinliğe göre sırala (y)
      const items = [{ y: by, f: () => this.drawBall(ctx, b, bx, by - z, dt, z, sim) }];
      for (let i = 0; i < P.length; i++) { const pp = pos(P[i]); items.push({ y: pp[1], f: () => this.drawPlayer(ctx, sim, i, pp, dt) }); }
      items.sort((a, c) => a.y - c.y).forEach(it => it.f());

      this.drawShields(ctx, sim, 'top');
      this.drawGoals(ctx, 'front');
      this.drawFlags(ctx);
      this.fx.draw(ctx);

      // isim etiketleri + dayanıklılık
      for (let i = 0; i < P.length; i++) {
        const p = P[i], [x, y] = pos(p), ch = this.chars[i];
        const ny = y + p.r + 16;
        if (p.stamina < 0.995) {
          const w = 26, h = 3.5;
          ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(x - w / 2 - 1, ny + 4, w + 2, h + 2);
          ctx.fillStyle = p.exhausted ? '#e63946' : p.stamina < 0.35 ? '#ffd23f' : '#06d6a0';
          ctx.fillRect(x - w / 2, ny + 5, w * p.stamina, h);
        }
        ctx.font = '700 11px Rubik, system-ui, sans-serif'; ctx.textAlign = 'center';
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.6)';
        ctx.strokeText(ch.name, x, ny); ctx.fillStyle = '#fff'; ctx.fillText(ch.name, x, ny);
      }

      // emoji balonları
      for (let i = 0; i < 2; i++) {
        const em = this.emotes[i];
        if (!em) continue;
        em.t -= dt;
        if (em.t <= 0) { this.emotes[i] = null; continue; }
        const p = P[i], [x, y] = pos(p);
        const k = Math.min(1, (100 - em.t) / 8), out = Math.min(1, em.t / 12);
        const sc = (0.6 + 0.4 * k) * out, by2 = y - p.r - 34 - (1 - k) * 10;
        ctx.save(); ctx.translate(x, by2); ctx.scale(sc, sc);
        ctx.fillStyle = '#fff'; ctx.strokeStyle = '#0b0f14'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.roundRect(-17, -17, 34, 30, 10); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-5, 12); ctx.lineTo(0, 20); ctx.lineTo(5, 12); ctx.fill();
        ctx.font = '20px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(TP.EMOTES[em.e] || '❔', 0, -2);
        ctx.restore();
      }

      // laf balonları
      for (let i = 0; i < 2; i++) {
        const tt = this.taunts && this.taunts[i];
        if (!tt) continue;
        tt.t -= dt;
        if (tt.t <= 0) { this.taunts[i] = null; continue; }
        const p = P[i], [x, y] = pos(p);
        const k = Math.min(1, (200 - tt.t) / 8), out = Math.min(1, tt.t / 15);
        ctx.save();
        ctx.font = '800 13px Rubik, system-ui, sans-serif';
        const w = Math.min(280, ctx.measureText(tt.text).width) + 22, h = 30;
        let bx2 = Math.max(-C.OW + w / 2, Math.min(C.OW - w / 2, x));
        const by2 = y - p.r - 30 - (this.emotes[i] ? 42 : 0);
        ctx.translate(bx2, by2); ctx.scale((0.7 + 0.3 * k) * out, (0.7 + 0.3 * k) * out);
        ctx.fillStyle = '#ffffff'; ctx.strokeStyle = this.teamColors[i]; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.roundRect(-w / 2, -h, w, h, 12); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x - bx2 - 6, 0); ctx.lineTo(x - bx2, 9); ctx.lineTo(x - bx2 + 6, 0); ctx.fill();
        ctx.fillStyle = '#0b0f14'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(tt.text, 0, -h / 2, 280);
        ctx.restore();
      }

      // tribün çatısının gölgesi (üst kenar)
      const sg = ctx.createLinearGradient(0, -C.OH - 40, 0, -C.OH + 70);
      sg.addColorStop(0, 'rgba(0,0,10,0.14)'); sg.addColorStop(1, 'rgba(0,0,10,0)');
      ctx.fillStyle = sg; ctx.fillRect(-C.OW - 40, -C.OH - 40, 2 * C.OW + 80, 110);

      if (this.theme === 'gece') {
        // projektörle aydınlanan saha, karanlık tribünler
        ctx.fillStyle = 'rgba(2,6,25,0.4)';
        ctx.beginPath(); ctx.rect(-C.OW - 400, -C.OH - 400, 2 * C.OW + 800, 2 * C.OH + 800);
        ctx.rect(-C.OW, -C.OH, 2 * C.OW, 2 * C.OH); ctx.fill('evenodd');
        const rg = ctx.createRadialGradient(0, 0, C.OH * 0.6, 0, 0, C.OW * 1.1);
        rg.addColorStop(0, 'rgba(2,6,25,0)'); rg.addColorStop(1, 'rgba(2,6,25,0.22)');
        ctx.fillStyle = rg; ctx.fillRect(-C.OW, -C.OH, 2 * C.OW, 2 * C.OH);
      }
      if (this.theme === 'kar' && Math.random() < 0.9) {
        for (let i = 0; i < 2; i++) this.fx.add({ x: (Math.random() - 0.5) * 2 * (C.OW + 60), y: -C.OH - 60, vx: (Math.random() - 0.3) * 0.6, vy: 1 + Math.random() * 1.2, life: 420, max: 420, size: 1.2 + Math.random() * 1.6, color: 'rgba(255,255,255,0.85)', drag: 1, shape: 'c' });
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const tint = { aksam: 'rgba(255,140,60,0.08)', gece: 'rgba(10,20,70,0.06)' }[this.theme];
      if (tint) { ctx.fillStyle = tint; ctx.fillRect(0, 0, this.cv.width, this.cv.height); }
      if (this.flash > 0.01) { ctx.fillStyle = `rgba(255,255,255,${this.flash * 0.5})`; ctx.fillRect(0, 0, this.cv.width, this.cv.height); }
      const vg = ctx.createRadialGradient(this.cv.width / 2, this.cv.height / 2, Math.min(this.cv.width, this.cv.height) * 0.45, this.cv.width / 2, this.cv.height / 2, Math.max(this.cv.width, this.cv.height) * 0.75);
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.18)');
      ctx.fillStyle = vg; ctx.fillRect(0, 0, this.cv.width, this.cv.height);
    }

    drawStadium(ctx) {
      const { OW, OH } = C;
      const st = this.stadium;
      ctx.drawImage(st.cv, -st.W / 2, -st.H / 2, st.W, st.H);
      // seyirciler
      if (this.crowd) {
        const t = this.time;
        for (const c of this.crowd) {
          let jump = 0;
          const h = this.hype * (this.hypeTeam < 0 || this.hypeTeam === c.team ? 1 : 0.15);
          if (h > 0.05) jump = Math.abs(Math.sin(t * 0.22 * c.sp + c.ph)) * 5 * h;
          else jump = Math.max(0, Math.sin(t * 0.03 * c.sp + c.ph) - 0.92) * 8;
          let dx = 0, dy = 0;
          if (c.vertical) dx = Math.sign(c.x) * jump; else dy = Math.sign(c.y) * jump;
          const x = c.x + dx * 0.3, y = c.y - jump * 0.6 + dy * 0.2;
          ctx.fillStyle = c.c;
          ctx.beginPath(); ctx.ellipse(x, y + 1.5, 4, 3.2, 0, 0, TAU); ctx.fill();
          ctx.fillStyle = c.skin;
          ctx.beginPath(); ctx.arc(x, y - 2, 2.1, 0, TAU); ctx.fill();
          if (c.flag && h > 0.2) {
            ctx.fillStyle = c.c;
            const w = Math.sin(t * 0.3 + c.ph) * 2;
            ctx.fillRect(x - 1, y - 12, 1, 10);
            ctx.beginPath(); ctx.moveTo(x, y - 12); ctx.lineTo(x + 9, y - 10 + w); ctx.lineTo(x, y - 7); ctx.fill();
          }
        }
      }
      // reklam panoları (her kenar ayrı, taşma yok)
      this.boardOffset += 0.5;
      const o = BOARD_IN, bw = BOARD_W;
      const boards = [
        { x: -OW - o - bw, y: -OH - o - bw, w: 2 * (OW + o + bw), h: bw, horiz: true },
        { x: -OW - o - bw, y: OH + o, w: 2 * (OW + o + bw), h: bw, horiz: true },
        { x: -OW - o - bw, y: -OH - o, w: bw, h: 2 * (OH + o), horiz: false },
        { x: OW + o, y: -OH - o, w: bw, h: 2 * (OH + o), horiz: false },
      ];
      const msg = '  TOPARLAK LİG   ●   SERT ŞUT   ●   1v1   ●  ';
      ctx.font = '900 9px Rubik, system-ui, sans-serif'; ctx.textBaseline = 'middle';
      const mw = ctx.measureText(msg).width;
      const cols = ['#ffd23f', '#ffffff', this.teamColors[0], this.teamColors[1]];
      for (let k = 0; k < boards.length; k++) {
        const B = boards[k];
        ctx.save();
        ctx.fillStyle = '#0a0d12'; ctx.fillRect(B.x, B.y, B.w, B.h);
        ctx.beginPath(); ctx.rect(B.x + 1, B.y + 1, B.w - 2, B.h - 2); ctx.clip();
        ctx.fillStyle = '#121822'; ctx.fillRect(B.x + 1, B.y + 1, B.w - 2, B.h - 2);
        if (B.horiz) {
          const off = -((this.boardOffset * (k ? -1 : 1)) % mw + mw) % mw;
          let i = 0;
          for (let x = B.x + off - mw; x < B.x + B.w; x += mw, i++) { ctx.fillStyle = cols[i % 2]; ctx.fillText(msg, x, B.y + B.h / 2 + 0.5); }
        } else {
          ctx.translate(B.x + B.w / 2, B.y + B.h / 2); ctx.rotate(B.x < 0 ? -Math.PI / 2 : Math.PI / 2);
          ctx.textAlign = 'center';
          for (let i = -2; i <= 2; i++) { ctx.fillStyle = cols[(i + 4) % 4]; ctx.fillText('TOPARLAK', i * 110, 0.5); }
          ctx.textAlign = 'left';
        }
        // LED tarama çizgileri
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        if (B.horiz) for (let y = B.y; y < B.y + B.h; y += 2) ctx.fillRect(B.x, y, B.w, 0.7);
        ctx.restore();
      }
    }

    drawFlags(ctx) {
      const { FW, FH } = C;
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
        const x = sx * FW, y = sy * FH;
        const col = this.teamColors[sx < 0 ? 0 : 1];
        // gölge
        ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 10, y + 7); ctx.stroke();
        // direk
        ctx.strokeStyle = '#f5f5f5'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 18); ctx.stroke();
        // bayrak (dalgalanan)
        const w1 = Math.sin(this.time * 0.15 + sx + sy) * 2.5, w2 = Math.sin(this.time * 0.15 + 1.2 + sx) * 3;
        ctx.fillStyle = col; ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(x, y - 18);
        ctx.quadraticCurveTo(x + 6, y - 19 + w1, x + 12, y - 15 + w2);
        ctx.quadraticCurveTo(x + 6, y - 12 + w1, x, y - 11);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, 1.6, 0, TAU); ctx.fill();
      }
    }

    drawShields(ctx, sim, layer) {
      if (!sim.shields) return;
      for (const sh of sim.shields) {
        const col = this.teamColors[sh.team];
        const fade = sh.t < 60 && Math.floor(this.time / 4) % 2 ? 0.5 : 1;
        if (layer === 'base') {
          ctx.fillStyle = 'rgba(0,0,0,0.25)';
          ctx.beginPath(); ctx.ellipse(sh.x + 4, sh.y + 6, sh.r, sh.r * 0.9, 0, 0, TAU); ctx.fill();
          continue;
        }
        ctx.save(); ctx.globalAlpha = fade;
        ctx.translate(sh.x, sh.y);
        ctx.fillStyle = rgba(col, 0.38);
        ctx.beginPath();
        for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + Math.PI / 6; ctx.lineTo(Math.cos(a) * sh.r, Math.sin(a) * sh.r); }
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.stroke();
        ctx.strokeStyle = rgba(col, 0.9); ctx.lineWidth = 1.5;
        for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + Math.PI / 6; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * sh.r, Math.sin(a) * sh.r); ctx.stroke(); }
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.beginPath(); ctx.ellipse(-sh.r * 0.3, -sh.r * 0.4, sh.r * 0.35, sh.r * 0.15, -0.5, 0, TAU); ctx.fill();
        ctx.restore();
      }
    }

    drawGoals(ctx, layer) {
      const { FW, GH, GD, POST_R } = C;
      for (const sx of [-1, 1]) {
        const i = sx < 0 ? 0 : 1;
        const [amp, wy, ph] = this.netWobble[i];
        const bx = sx * (FW + GD);
        const bend = (y) => amp * Math.sin(ph) * Math.exp(-Math.pow((y - wy) / 40, 2));
        if (layer === 'back') {
          ctx.fillStyle = 'rgba(255,255,255,0.06)';
          ctx.fillRect(sx < 0 ? bx : FW, -GH, GD, 2 * GH);
          ctx.strokeStyle = 'rgba(255,255,255,0.32)'; ctx.lineWidth = 0.9;
          for (let y = -GH; y <= GH; y += 7) {
            ctx.beginPath(); ctx.moveTo(sx * FW, y); ctx.lineTo(bx + sx * bend(y), y); ctx.stroke();
          }
          for (let x = 0; x <= GD; x += 7) {
            ctx.beginPath();
            for (let y = -GH; y <= GH; y += 6) {
              const xx = sx * (FW + x) + sx * bend(y) * (x / GD);
              if (y === -GH) ctx.moveTo(xx, y); else ctx.lineTo(xx, y);
            }
            ctx.stroke();
          }
          // arka direkler/çerçeve
          ctx.strokeStyle = 'rgba(230,230,230,0.8)'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(sx * FW, -GH); ctx.lineTo(bx + sx * amp * Math.sin(ph) * 0.3, -GH);
          ctx.lineTo(bx + sx * amp * Math.sin(ph) * 0.6, 0); ctx.lineTo(bx + sx * amp * Math.sin(ph) * 0.3, GH); ctx.lineTo(sx * FW, GH);
          ctx.stroke();
        } else {
          // üst direk (kale çizgisi üzerinde) + gölgesi
          ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 4;
          ctx.beginPath(); ctx.moveTo(sx * FW + sx * 9, -GH + 7); ctx.lineTo(sx * FW + sx * 9, GH + 7); ctx.stroke();
          ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 3.2; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(sx * FW, -GH); ctx.lineTo(sx * FW, GH); ctx.stroke();
          for (const sy of [-1, 1]) {
            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            ctx.beginPath(); ctx.arc(sx * FW + 3, sy * GH + 4, POST_R, 0, TAU); ctx.fill();
            const pg = ctx.createRadialGradient(sx * FW - 2, sy * GH - 2, 1, sx * FW, sy * GH, POST_R);
            pg.addColorStop(0, '#ffffff'); pg.addColorStop(1, '#cfd4da');
            ctx.fillStyle = pg; ctx.strokeStyle = '#1b1f24'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(sx * FW, sy * GH, POST_R, 0, TAU); ctx.fill(); ctx.stroke();
          }
        }
      }
    }

    drawBall(ctx, b, x, y, dt, z, sim) {
      const fogged = sim && sim.fog > 0;
      if (fogged) ctx.globalAlpha = 0.07 + 0.05 * Math.sin(this.time * 0.3);
      const sp = Math.hypot(b.vx, b.vy);
      this.ballRot += sp / b.r * dt * 0.6;
      const ang = Math.atan2(b.vy, b.vx);
      const r = b.r * (1 + Math.min(0.35, z * 0.02));
      ctx.save(); ctx.translate(x, y);
      if (b.fire > 0) {
        ctx.fillStyle = 'rgba(255,120,0,0.35)';
        ctx.beginPath(); ctx.arc(0, 0, r + 5, 0, TAU); ctx.fill();
      }
      const bomb = b.bomb > 0, rubber = sim && sim.bouncy > 0;
      ctx.fillStyle = bomb ? '#2b2d42' : rubber ? '#ff7b00' : '#fbfbfb';
      ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
      ctx.save();
      ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.clip();
      ctx.rotate(ang);
      ctx.fillStyle = b.fire > 0 ? '#d00000' : bomb ? '#ff4d00' : rubber ? '#7a3200' : '#1b1f24';
      const D = r * 1.35;
      const roll = (this.ballRot * r) % D;
      for (let row = 0; row < 2; row++) {
        const py = (row ? 0.55 : -0.55) * r;
        for (let k = -2; k <= 2; k++) {
          const px = k * D + roll + (row ? D / 2 : 0) - D / 2;
          if (Math.abs(px) > r * 1.25) continue;
          const sq = Math.max(0.25, Math.cos(Math.min(1.45, Math.abs(px) / r * 1.15)));
          ctx.beginPath();
          for (let i = 0; i < 5; i++) {
            const a = i / 5 * TAU - Math.PI / 2;
            const rx = px + Math.cos(a) * r * 0.34 * sq, ry = py + Math.sin(a) * r * 0.34;
            if (i === 0) ctx.moveTo(rx, ry); else ctx.lineTo(rx, ry);
          }
          ctx.closePath(); ctx.fill();
        }
      }
      ctx.restore();
      const g = ctx.createRadialGradient(-r * 0.35, -r * 0.4, 1, 0, 0, r);
      g.addColorStop(0, 'rgba(255,255,255,0.55)'); g.addColorStop(0.6, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(0,0,0,0.3)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#111'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(0, 0, r - 0.5, 0, TAU); ctx.stroke();
      if (bomb) {
        ctx.strokeStyle = '#c9a66b'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(r * 0.5, -r * 0.8); ctx.quadraticCurveTo(r * 1.1, -r * 1.6, r * 0.6, -r * 2); ctx.stroke();
        if (Math.random() < 0.8) this.fx.add({ x: x + r * 0.6, y: y - r * 2, vx: (Math.random() - 0.5) * 2, vy: -Math.random() * 2, life: 10, max: 10, size: 1.8, color: ['#ffd23f', '#ff9f1c', '#fff'][(Math.random() * 3) | 0] });
        ctx.strokeStyle = Math.floor(this.time / Math.max(2, b.bomb / 8)) % 2 ? '#ff4d00' : '#ffffff'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(0, 0, r + 6, -Math.PI / 2, -Math.PI / 2 + TAU * (b.bomb / 100)); ctx.stroke();
      }
      ctx.restore();
      ctx.globalAlpha = 1;
      if (fogged) {
        for (let i = 0; i < 2; i++) this.fx.add({ x: x + (Math.random() - 0.5) * 40, y: y + (Math.random() - 0.5) * 40, vx: (Math.random() - 0.5) * 0.4, vy: (Math.random() - 0.5) * 0.4, life: 40, max: 40, size: 8 + Math.random() * 8, color: 'rgba(225,230,235,0.35)', drag: 0.98, shape: 'g' });
      }
    }

    drawPlayer(ctx, sim, i, [x, y], dt) {
      const p = sim.players[i], ch = this.chars[i], b = sim.ball;
      const target = Math.atan2(b.y - p.y, b.x - p.x);
      let d = target - this.look[i];
      while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU;
      this.look[i] += d * Math.min(1, 0.2 * dt);
      this.blinkT[i] -= dt;
      if (this.blinkT[i] < -7) this.blinkT[i] = 120 + Math.random() * 200;
      const blink = this.blinkT[i] < 0;
      const sp = Math.hypot(p.vx, p.vy);
      this.stepPhase[i] += sp * 0.22 * dt;

      let hop = 0, mood = null;
      const cel = this.celebrate;
      if (cel) {
        if (cel.team === p.team) { hop = Math.abs(Math.sin(this.time * 0.22)) * 7; mood = 'happy'; }
        else mood = 'sad';
      }
      if (p.stun > 0) mood = 'stun';
      else if (p.slow > 0) mood = 'frozen';
      else if (p.exhausted) mood = mood || 'tired';
      else if (p.charge >= 1 && p.kickReady) mood = 'angry';

      if (p.fly > 0) { this.flyAng[i] += Math.min(0.6, sp * 0.06) * dt; if (Math.random() < 0.6 * dt) this.ghosts.push({ x: p.x, y: p.y, r: p.r, team: p.team, life: 12 }); }
      else this.flyAng[i] *= 0.8;
      if (p.turbo > 0 && sp > 1.5 && Math.random() < 0.7 * dt) {
        const a = Math.atan2(p.vy, p.vx) + Math.PI + (Math.random() - 0.5) * 0.6;
        this.fx.add({ x: x + Math.cos(a) * p.r, y: y + Math.sin(a) * p.r, vx: Math.cos(a) * 2, vy: Math.sin(a) * 2, life: 14, max: 14, size: 3, color: ['#ffd23f', '#ff9f1c', '#fff'][(Math.random() * 3) | 0], shape: 'g', drag: 0.9 });
      }
      ctx.save(); ctx.translate(x, y - hop);
      if (this.flyAng[i]) ctx.rotate(this.flyAng[i]);
      if (p.ghost > 0) ctx.globalAlpha = 0.38 + 0.1 * Math.sin(this.time * 0.3);
      const st = Math.min(0.12, sp * 0.02);
      const va = Math.atan2(p.vy, p.vx);
      ctx.rotate(va); ctx.scale(1 + st, 1 - st * 0.7); ctx.rotate(-va);

      if (p.kickReady && p.charge > 0.08) {
        const k = p.charge;
        const perfectWin = k >= 1 && p.fullT > 0 && p.fullT <= 10;
        ctx.strokeStyle = perfectWin ? '#7fd1ff' : k >= 1 ? (Math.floor(this.time / 3) % 2 ? '#ff4d00' : '#ffd23f') : `hsl(${50 - k * 40},100%,${60 - k * 5}%)`;
        if (perfectWin) ctx.lineWidth = 6;
        ctx.lineWidth = 4; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.arc(0, 0, p.r + 7, -Math.PI / 2, -Math.PI / 2 + TAU * k); ctx.stroke();
      }
      if (p.rocket > 0) {
        ctx.strokeStyle = Math.floor(this.time / 4) % 2 ? '#ff9f1c' : '#ff4d00'; ctx.lineWidth = 3; ctx.setLineDash([5, 4]);
        ctx.lineDashOffset = this.time; ctx.beginPath(); ctx.arc(0, 0, p.r + 12, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
        if (Math.random() < 0.4) this.fx.add({ x: x + (Math.random() - 0.5) * p.r * 2, y: y + (Math.random() - 0.5) * p.r * 2, vx: 0, vy: -0.8, life: 16, max: 16, size: 2.5, color: ['#ff9f1c', '#ff4d00', '#ffd23f'][(Math.random() * 3) | 0], drag: 0.95, shape: 'g' });
      }
      if (p.glove > 0) { // eldiven açık: altın kesikli halka, tutarken dolu
        ctx.strokeStyle = '#ffe08a'; ctx.lineWidth = p.hold > 0 ? 4 : 2.5;
        if (!p.hold) { ctx.setLineDash([5, 5]); ctx.lineDashOffset = -this.time; }
        ctx.beginPath(); ctx.arc(0, 0, p.r + 7, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
      }
      if (p.curve > 0) {
        ctx.strokeStyle = '#b28dff'; ctx.lineWidth = 3;
        for (let k = 0; k < 3; k++) { const a = this.time * 0.15 + k * TAU / 3; ctx.beginPath(); ctx.arc(0, 0, p.r + 11, a, a + 0.8); ctx.stroke(); }
      }
      if (p.giant > 0 && p.giant < 60 && Math.floor(this.time / 5) % 2) ctx.globalAlpha = 0.75;

      drawPlayerBody(ctx, p, ch, {
        look: this.look[i], blink, kickReady: p.kickReady, mood, t: this.time, sway: Math.max(-1, Math.min(1, -p.vx * 0.2)),
        feet: { phase: this.stepPhase[i], ang: va, speed: sp },
      });
      ctx.globalAlpha = 1;
      if (p.slow > 0) {
        ctx.fillStyle = 'rgba(190,233,255,0.45)'; ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 2;
        ctx.beginPath();
        for (let k = 0; k < 8; k++) { const a = k / 8 * TAU, rr = p.r * (k % 2 ? 1.12 : 1.25); ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
        ctx.closePath(); ctx.fill(); ctx.stroke();
      }
      if (p.inv > 0) {
        ctx.strokeStyle = '#ff5d8f'; ctx.lineWidth = 2.5;
        for (let k = 0; k < 2; k++) { const a = -this.time * 0.25 + k * Math.PI; ctx.beginPath(); ctx.arc(0, 0, p.r + 9, a, a + 1.6); ctx.stroke(); }
        ctx.fillStyle = '#ff5d8f'; ctx.font = '900 14px Rubik, system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('?', 0, -p.r - 16);
      }
      if (p.hits > 0) {
        for (let k = 0; k < 3; k++) {
          ctx.fillStyle = k < p.hits ? '#ffd23f' : 'rgba(0,0,0,0.45)'; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc((k - 1) * 8, -p.r - 9, 3, 0, TAU); ctx.fill(); ctx.stroke();
        }
      }
      if (p.stun > 0) {
        for (let k = 0; k < 3; k++) {
          const a = this.time * 0.2 + k * TAU / 3;
          ctx.fillStyle = '#ffd23f'; ctx.font = '12px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText('★', Math.cos(a) * (p.r + 6), Math.sin(a) * (p.r * 0.4) - p.r - 8);
        }
      }

      ctx.restore();
    }
  }

  TP.Renderer = Renderer;
  TP.drawPlayerBody = drawPlayerBody;
  TP.shade = shade;
})();
