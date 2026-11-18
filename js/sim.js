// TOPARLAK — deterministik fizik / maç simülasyonu (host tarafında çalışır)
(function () {
  const C = TP.C;
  const NONE = { x: 0, y: 0, kick: false, ab: false };

  function seg(x1, y1, x2, y2, mask) { return { x1, y1, x2, y2, mask }; }
  const BALL = 1, PLAYER = 2;

  function buildWalls() {
    const { FW, FH, GH, GD, OW, OH } = C;
    const s = [];
    // Topun saha sınırları
    s.push(seg(-FW, -FH, FW, -FH, BALL));
    s.push(seg(-FW, FH, FW, FH, BALL));
    for (const sx of [-1, 1]) {
      s.push(seg(sx * FW, -FH, sx * FW, -GH, BALL));
      s.push(seg(sx * FW, GH, sx * FW, FH, BALL));
      // Kale filesi (top + oyuncu)
      const bx = sx * (FW + GD);
      s.push(seg(sx * FW, -GH, bx, -GH, BALL | PLAYER));
      s.push(seg(bx, -GH, bx, GH, BALL | PLAYER));
      s.push(seg(bx, GH, sx * FW, GH, BALL | PLAYER));
    }
    // Oyuncu dış sınırı
    s.push(seg(-OW, -OH, OW, -OH, PLAYER));
    s.push(seg(-OW, OH, OW, OH, PLAYER));
    s.push(seg(-OW, -OH, -OW, OH, PLAYER));
    s.push(seg(OW, -OH, OW, OH, PLAYER));
    return s;
  }

  function buildPosts() {
    const p = [];
    for (const sx of [-1, 1]) for (const sy of [-1, 1])
      p.push({ x: sx * C.FW, y: sy * C.GH, r: C.POST_R, vx: 0, vy: 0, invMass: 0 });
    return p;
  }

  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; }

  function makePlayer(team, ch, deck) {
    deck = (deck && deck.length ? deck : [ch.ability || 'roket']).filter(k => TP.ABILITIES[k]);
    if (!deck.length) deck = ['roket'];
    const p = {
      team, ch, deck, queue: [], ability: null, next: null, slow: 0,
      x: 0, y: 0, vx: 0, vy: 0, r: C.PLAYER_R, invMass: C.PLAYER_INVMASS,
      kickReady: false, kickHeld: false, charge: 0, abHeld: false,
      cd: 0, cdMax: 1, rocket: 0, curve: 0, magnet: 0, giant: 0, dash: 0, stun: 0,
      ix: 0, iy: 0, stamina: 1, stDelay: 0, exhausted: false, sprinting: false, kickBuf: 0,
      glove: 0, hold: 0,
    };
    drawCard(p);
    return p;
  }

  // Kart destesinden rastgele sırayla yetenek çek
  function drawCard(p) {
    if (!p.queue.length) {
      p.queue = shuffle(p.deck.slice());
      if (p.deck.length > 1 && p.queue[0] === p.ability) p.queue.push(p.queue.shift());
    }
    p.ability = p.queue.shift();
    if (!p.queue.length) {
      p.queue = shuffle(p.deck.slice());
      if (p.deck.length > 1 && p.queue[0] === p.ability) p.queue.push(p.queue.shift());
    }
    p.next = p.queue[0];
  }

  function collideCircles(a, b, bounce) {
    const dx = a.x - b.x, dy = a.y - b.y;
    const rr = a.r + b.r;
    const d2 = dx * dx + dy * dy;
    if (d2 >= rr * rr || d2 === 0) return null;
    const d = Math.sqrt(d2), nx = dx / d, ny = dy / d;
    const im = a.invMass + b.invMass;
    if (im === 0) return null;
    const pen = rr - d;
    a.x += nx * pen * a.invMass / im; a.y += ny * pen * a.invMass / im;
    b.x -= nx * pen * b.invMass / im; b.y -= ny * pen * b.invMass / im;
    const rv = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
    if (rv < 0) {
      const j = -(1 + bounce) * rv / im;
      a.vx += nx * j * a.invMass; a.vy += ny * j * a.invMass;
      b.vx -= nx * j * b.invMass; b.vy -= ny * j * b.invMass;
    }
    return { nx, ny, rv };
  }

  function collideSeg(o, s, bounce) {
    const ex = s.x2 - s.x1, ey = s.y2 - s.y1;
    const l2 = ex * ex + ey * ey;
    let t = ((o.x - s.x1) * ex + (o.y - s.y1) * ey) / l2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const cx = s.x1 + ex * t, cy = s.y1 + ey * t;
    const dx = o.x - cx, dy = o.y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 >= o.r * o.r || d2 === 0) return 0;
    const d = Math.sqrt(d2), nx = dx / d, ny = dy / d;
    o.x += nx * (o.r - d); o.y += ny * (o.r - d);
    const vn = o.vx * nx + o.vy * ny;
    if (vn < 0) { o.vx -= (1 + bounce) * vn * nx; o.vy -= (1 + bounce) * vn * ny; }
    return -vn;
  }

  class Sim {
    constructor(opts) {
      this.opts = Object.assign({ timeLimit: 180, scoreLimit: 5 }, opts);
      this.walls = buildWalls();
      this.posts = buildPosts();
      const decks = opts.decks || [];
      this.players = [makePlayer(0, opts.chars[0], decks[0]), makePlayer(1, opts.chars[1], decks[1])];
      this.shields = [];
      this.ball = { x: 0, y: 0, vx: 0, vy: 0, r: C.BALL_R, invMass: C.BALL_INVMASS, fire: 0, fireTeam: -1, spin: 0 };
      this.score = [0, 0];
      this.tick = 0;
      this.timeLeft = this.opts.timeLimit > 0 ? this.opts.timeLimit * 60 : -1;
      this.overtime = false;
      this.phase = 'kickoff';
      this.kickoffTeam = Math.random() < 0.5 ? 0 : 1;
      this.freeze = 0;
      this.goalTimer = 0;
      this.lastTouch = -1;
      this.lastGoal = null;
      this.winner = -1;
      this.events = [];
      this.evId = 0;
      this.stats = { kicks: [0, 0], power: [0, 0], poss: [0, 0], abil: [0, 0] };
      this.resetKickoff(true);
    }

    emit(k, data) { this.events.push(Object.assign({ id: ++this.evId, k }, data)); }

    resetKickoff(first) {
      const b = this.ball;
      b.x = 0; b.y = 0; b.vx = 0; b.vy = 0; b.fire = 0; b.spin = 0;
      this.shields = [];
      this.players.forEach((p, i) => {
        const side = p.team === 0 ? -1 : 1;
        p.x = side * 200; p.y = 0; p.vx = 0; p.vy = 0;
        p.kickReady = false; p.charge = 0; p.dash = 0; p.stun = 0; p.magnet = 0; p.giant = 0; p.kickBuf = 0; p.slow = 0;
        p.glove = 0; p.hold = 0;
        p.stamina = Math.max(p.stamina, 0.6); p.exhausted = false;
        p.r = C.PLAYER_R; p.invMass = C.PLAYER_INVMASS;
      });
      this.phase = 'kickoff';
      this.freeze = first ? 90 : C.KICKOFF_FREEZE;
      this.emit('kickoff', { team: this.kickoffTeam, first: !!first });
    }

    useAbility(p, ax, ay) {
      const used = p.ability;
      const A = TP.ABILITIES[used];
      const opp = this.players[1 - p.team];
      const b = this.ball;
      p.cd = p.cdMax = Math.round(A.cd * 60);
      this.stats.abil[p.team]++;
      const extra = {};
      switch (used) {
        case 'buz': {
          // yalnız menzildeki rakip donar; ıskalarsan kart boşa gider
          const dx = opp.x - p.x, dy = opp.y - p.y, d = Math.hypot(dx, dy) || 1;
          if (d <= C.BUZ_RANGE + opp.r) {
            opp.slow = 150; opp.kickReady = false; opp.charge = 0;
            extra.tx = opp.x; extra.ty = opp.y; extra.hit = 1;
          } else {
            extra.tx = p.x + dx / d * C.BUZ_RANGE; extra.ty = p.y + dy / d * C.BUZ_RANGE; extra.hit = 0;
          }
          break;
        }
        case 'isinlan': {
          const side = p.team === 0 ? 1 : -1; // hücum yönü
          let gx = side * (C.FW + 10) - b.x, gy = -b.y;
          const gl = Math.hypot(gx, gy) || 1; gx /= gl; gy /= gl;
          const dd = p.r + b.r + 8;
          extra.fx = p.x; extra.fy = p.y;
          let tx = b.x - gx * dd, ty = b.y - gy * dd;
          // hedef rakibin üstüne denk gelirse yanına kay (iç içe doğup savrulmasınlar)
          const need = p.r + opp.r + 2, ox = tx - opp.x, oy = ty - opp.y, od = Math.hypot(ox, oy);
          if (od < need) {
            const ux = od > 0.01 ? ox / od : -gx, uy = od > 0.01 ? oy / od : -gy;
            tx = opp.x + ux * need; ty = opp.y + uy * need;
          }
          p.x = Math.max(-C.OW + p.r, Math.min(C.OW - p.r, tx));
          p.y = Math.max(-C.OH + p.r, Math.min(C.OH - p.r, ty));
          p.vx = gx * 1.5; p.vy = gy * 1.5;
          break;
        }
        case 'kalkan': {
          const sx = p.team === 0 ? -1 : 1;
          this.shields = this.shields.filter(s => s.team !== p.team);
          const y = Math.max(-C.GH + 30, Math.min(C.GH - 30, b.y * 0.4));
          this.shields.push({ team: p.team, x: sx * (C.FW - 30), y, r: 30, t: 270, invMass: 0, vx: 0, vy: 0 });
          break;
        }
        case 'roket': p.rocket = 240; break;
        case 'falso': p.curve = 300; break;
        case 'miknatis': p.magnet = 96; break;
        case 'dev': p.giant = 300; break;
        case 'eldiven': p.glove = C.GLOVE_TIME; break;
        case 'atilma': {
          let dx = ax, dy = ay;
          let l = Math.hypot(dx, dy);
          if (l < 0.1) { dx = p.vx; dy = p.vy; l = Math.hypot(dx, dy); }
          if (l < 0.1) { dx = b.x - p.x; dy = b.y - p.y; l = Math.hypot(dx, dy) || 1; }
          dx /= l; dy /= l;
          p.vx = p.vx * 0.25 + dx * 8.2; p.vy = p.vy * 0.25 + dy * 8.2;
          p.dash = 16;
          break;
        }
        case 'sok': {
          const R = 135;
          for (const o of [b, opp]) {
            const dx = o.x - p.x, dy = o.y - p.y;
            const d = Math.hypot(dx, dy) || 1;
            if (d < R + o.r) {
              const f = 3.5 + 6.5 * Math.max(0, 1 - d / R);
              const k = o === b ? 1.15 : 1;
              o.vx += dx / d * f * k; o.vy += dy / d * f * k;
              if (o === b) { b.spin = 0; this.lastTouch = p.team; }
              else { o.stun = Math.max(o.stun, 14); o.kickReady = false; }
            }
          }
          break;
        }
      }
      drawCard(p);
      this.emit('ab', Object.assign({ a: used, team: p.team, x: p.x, y: p.y }, extra));
    }

    kick(p) {
      const b = this.ball;
      p.magnet = 0; // kendi şutunu geri çekip öldürmesin
      if (p.hold > 0) { p.hold = 0; p.glove = 0; }
      const dx = b.x - p.x, dy = b.y - p.y;
      const d = Math.hypot(dx, dy) || 1;
      let nx = dx / d, ny = dy / d;
      // Nişan yardımı: bastığın yön şutu yönlendirir
      const il = Math.hypot(p.ix, p.iy);
      if (il > 0.3) {
        const ux = p.ix / il, uy = p.iy / il;
        if (ux * nx + uy * ny > 0.05) {
          let ax = nx + ux * C.AIM_ASSIST, ay = ny + uy * C.AIM_ASSIST;
          const al = Math.hypot(ax, ay) || 1; nx = ax / al; ny = ay / al;
        }
      }
      const ch = p.charge;
      let s = C.KICK_BASE + C.KICK_CHARGE_BONUS * Math.pow(ch, 1.3);
      let kind = ch > 0.6 ? 'power' : 'kick';
      if (p.giant > 0) s *= C.GIANT_KICK;
      if (p.rocket > 0) {
        s = 13.5;
        b.vx = nx * s; b.vy = ny * s;
        b.fire = 110; b.fireTeam = p.team;
        p.rocket = 0; kind = 'rocket';
      } else {
        b.vx += nx * s; b.vy += ny * s;
      }
      b.spin = 0;
      if (p.curve > 0) {
        const lat = p.ix * (-ny) + p.iy * nx;
        let sign = Math.abs(lat) > 0.2 ? Math.sign(lat) : (Math.sign(p.vx * (-ny) + p.vy * nx) || 1);
        b.spin = -sign * 0.0135;
        p.curve = 0; kind = kind === 'kick' ? 'curve' : kind;
      }
      p.vx -= nx * C.KICK_RECOIL; p.vy -= ny * C.KICK_RECOIL;
      p.kickReady = false; p.kickBuf = 0;
      this.lastTouch = p.team;
      this.stats.kicks[p.team]++;
      if (ch > 0.6) this.stats.power[p.team]++;
      this.emit(kind, { x: b.x, y: b.y, team: p.team, s, ch, nx, ny });
      p.charge = 0;
    }

    step(inputs) {
      this.tick++;
      const b = this.ball, P = this.players;
      if (this.freeze > 0) {
        this.freeze--;
        if (this.freeze === 0) this.emit('whistle', {});
      }
      const frozen = this.freeze > 0;

      // Girdi + yetenekler
      for (let i = 0; i < 2; i++) {
        const p = P[i];
        const raw = inputs[i] || NONE;
        const inp = (frozen || p.stun > 0 || this.phase === 'over') ? NONE : raw;
        let ax = inp.x || 0, ay = inp.y || 0;
        const l = Math.hypot(ax, ay);
        if (l > 1) { ax /= l; ay /= l; }
        p.ix = ax; p.iy = ay;
        // Şut: basınca hazır, basılı tutunca şarj; bırakınca kısa bir süre daha geçerli (tampon)
        if (inp.kick && !p.kickHeld) { p.kickReady = true; p.charge = 0; }
        if (inp.kick) p.kickBuf = C.KICK_BUFFER;
        else if (p.kickBuf > 0) { p.kickBuf--; if (p.kickBuf === 0) { p.kickReady = false; p.charge = 0; } }
        else { p.kickReady = false; p.charge = 0; }
        p.kickHeld = !!inp.kick;
        if (p.kickReady && p.kickHeld) p.charge = Math.min(1, p.charge + 1 / C.CHARGE_TIME);
        let acc = p.kickHeld && p.kickReady ? C.PLAYER_KICK_ACC : C.PLAYER_ACC;
        if (p.giant > 0) acc *= 0.92;
        if (p.slow > 0) acc *= 0.4;
        // Sprint + dayanıklılık
        const moving = Math.hypot(ax, ay) > 0.1;
        if (p.exhausted && p.stamina >= C.STAMINA_MIN) p.exhausted = false;
        p.sprinting = !!inp.sp && moving && !p.exhausted && p.stamina > 0 && p.slow <= 0;
        if (p.sprinting) {
          acc *= C.SPRINT_MULT;
          p.stamina = Math.max(0, p.stamina - C.STAMINA_DRAIN);
          p.stDelay = C.STAMINA_DELAY;
          if (p.stamina <= 0) { p.exhausted = true; this.emit('tired', { team: p.team, x: p.x, y: p.y }); }
        } else if (p.stDelay > 0) p.stDelay--;
        else p.stamina = Math.min(1, p.stamina + C.STAMINA_REGEN * (p.exhausted ? 1.25 : 1));
        p.vx += ax * acc; p.vy += ay * acc;
        if (inp.ab && !p.abHeld && p.cd <= 0 && this.phase !== 'goal' && this.phase !== 'over') this.useAbility(p, ax, ay);
        p.abHeld = !!inp.ab;

        if (p.cd > 0) p.cd--;
        if (p.rocket > 0) p.rocket--;
        if (p.curve > 0) p.curve--;
        if (p.dash > 0) p.dash--;
        if (p.stun > 0) p.stun--;
        if (p.slow > 0) p.slow--;
        if (p.giant > 0) p.giant--;
        if (p.glove > 0 && p.hold === 0) p.glove--;
        const tr = p.giant > 0 ? C.GIANT_R : C.PLAYER_R;
        p.r += (tr - p.r) * 0.18;
        p.invMass = p.giant > 0 ? C.GIANT_INVMASS : C.PLAYER_INVMASS;
        if (p.magnet > 0) {
          p.magnet--;
          // topu kendine değil, önündeki hücum noktasına çek (kendine çekince top kendi kalene doğru gidiyordu)
          const atk = p.team === 0 ? 1 : -1;
          const px = p.x + atk * (p.r + b.r + 6), py = p.y;
          const dx = px - b.x, dy = py - b.y, d = Math.hypot(dx, dy) || 1;
          if (d < 180 && d > 4) {
            const f = 0.26 * (1 - d / 200);
            b.vx += dx / d * f; b.vy += dy / d * f;
            b.vx *= 0.975; b.vy *= 0.975;
          }
        }
      }

      for (const sh of this.shields) sh.t--;
      if (this.shields.length) this.shields = this.shields.filter(sh => sh.t > 0);

      // Falso: hız vektörünü döndür
      if (b.spin !== 0) {
        const c = Math.cos(b.spin), s = Math.sin(b.spin);
        const vx = b.vx * c - b.vy * s, vy = b.vx * s + b.vy * c;
        b.vx = vx; b.vy = vy;
        b.spin *= 0.984;
        if (Math.abs(b.spin) < 0.0008) b.spin = 0;
      }

      // Alt adımlı hareket + çarpışma
      const maxV = Math.max(Math.hypot(b.vx, b.vy), Math.hypot(P[0].vx, P[0].vy), Math.hypot(P[1].vx, P[1].vy));
      const N = Math.min(4, Math.max(1, Math.ceil(maxV / 6)));
      let wallHit = 0, postHit = 0, netHit = 0, bump = 0, touch = [0, 0];
      for (let k = 0; k < N; k++) {
        for (const o of [b, P[0], P[1]]) { o.x += o.vx / N; o.y += o.vy / N; }
        // oyuncu - top
        for (const p of P) {
          const fireBefore = b.fire > 0 && b.fireTeam !== p.team;
          const sp = Math.hypot(b.vx, b.vy);
          const c = collideCircles(b, p, 0.3);
          if (c) {
            touch[p.team] = 1;
            if (fireBefore && sp > 4 && !(p.glove > 0)) {
              p.vx -= c.nx * 7.5; p.vy -= c.ny * 7.5;
              p.stun = 40; p.kickReady = false; b.fire = 0;
              this.emit('burn', { x: p.x, y: p.y, team: p.team });
            }
            b.spin = 0;
          }
        }
        // oyuncu - oyuncu
        const c = collideCircles(P[0], P[1], 0.3);
        if (c) {
          const rv = -c.rv;
          for (let i = 0; i < 2; i++) {
            const p = P[i], o = P[1 - i];
            if (p.dash > 0 && o.dash <= 0) {
              const s = i === 0 ? -1 : 1; // normal P0'dan P1'e işaret
              o.vx += c.nx * s * 5.5 * o.invMass * 2; o.vy += c.ny * s * 5.5 * o.invMass * 2;
              o.stun = Math.max(o.stun, 10);
              p.dash = 0;
              bump = Math.max(bump, 6);
            }
          }
          if (rv > 1.5) bump = Math.max(bump, rv);
        }
        // duvarlar
        for (const w of this.walls) {
          if (w.mask & BALL) {
            const h = collideSeg(b, w, C.BALL_BOUNCE);
            if (h > 0) {
              const isNet = w.mask & PLAYER;
              if (isNet) netHit = Math.max(netHit, h); else wallHit = Math.max(wallHit, h);
              b.spin = 0;
            }
          }
          if (w.mask & PLAYER) for (const p of P) collideSeg(p, w, C.PLAYER_BOUNCE);
        }
        for (const sh of this.shields) {
          const cb = collideCircles(b, sh, 0.6);
          if (cb && -cb.rv > 1) { this.emit('shieldhit', { x: b.x, y: b.y, team: sh.team }); b.spin = 0; b.fire = 0; }
          for (const p of P) collideCircles(p, sh, 0.4);
        }
        for (const post of this.posts) {
          const cb = collideCircles(b, post, 0.5);
          if (cb && -cb.rv > postHit) { postHit = -cb.rv; b.spin = 0; }
          for (const p of P) collideCircles(p, post, 0.5);
        }
      }
      if (touch[0] || touch[1]) {
        if (touch[0] && !touch[1]) this.lastTouch = 0;
        else if (touch[1] && !touch[0]) this.lastTouch = 1;
      }
      if (wallHit > 2) this.emit('wall', { x: b.x, y: b.y, s: wallHit });
      if (postHit > 1.5) this.emit('post', { x: b.x, y: b.y, s: postHit });
      if (netHit > 1) this.emit('net', { x: b.x, y: b.y, s: netHit, side: Math.sign(b.x) });
      if (bump > 0) this.emit('bump', { x: (P[0].x + P[1].x) / 2, y: (P[0].y + P[1].y) / 2, s: bump });

      // Kaleci eldiveni: kendi yarında topa değince kısa süre tut
      for (const p of P) {
        const atk = p.team === 0 ? 1 : -1; // hücum yönü
        if (p.hold > 0) {
          if (p.stun > 0 || this.phase !== 'play') { p.hold = 0; p.glove = 0; continue; }
          p.hold--;
          // top hep hücum yönünde önünde durur (kendi kalene sokamazsın), yukarı/aşağı ile kaydırılır
          let fx = atk, fy = p.iy * 0.9;
          const fl = Math.hypot(fx, fy); fx /= fl; fy /= fl;
          const dd = p.r + b.r + 0.5;
          b.x = p.x + fx * dd; b.y = p.y + fy * dd; b.vx = p.vx; b.vy = p.vy; b.spin = 0; b.fire = 0;
          this.lastTouch = p.team;
          if (p.hold === 0) { b.vx += fx * 2.5; b.vy += fy * 2.5; p.glove = 0; }
        } else if (p.glove > 0 && touch[p.team] && this.phase === 'play' && atk * b.x < 20) {
          p.hold = C.GLOVE_HOLD;
          this.emit('catch', { x: b.x, y: b.y, team: p.team });
        }
      }

      // Şut
      for (const p of P) {
        if (!p.kickReady) continue;
        const d = Math.hypot(b.x - p.x, b.y - p.y) - p.r - b.r;
        if (d < C.KICK_RANGE) this.kick(p);
      }

      // Sönümleme
      for (const p of P) { p.vx *= C.PLAYER_DAMP; p.vy *= C.PLAYER_DAMP; }
      b.vx *= C.BALL_DAMP; b.vy *= C.BALL_DAMP;
      if (b.fire > 0) { b.fire--; if (Math.hypot(b.vx, b.vy) < 3) b.fire = 0; }

      // Emniyet kelepçesi
      const lim = C.FW + C.GD - b.r;
      if (b.x < -lim) { b.x = -lim; b.vx = Math.abs(b.vx) * 0.3; }
      if (b.x > lim) { b.x = lim; b.vx = -Math.abs(b.vx) * 0.3; }
      if (b.y < -C.FH + b.r) { b.y = -C.FH + b.r; b.vy = Math.abs(b.vy) * 0.5; }
      if (b.y > C.FH - b.r) { b.y = C.FH - b.r; b.vy = -Math.abs(b.vy) * 0.5; }

      // Başlama vuruşu kısıtı
      if (this.phase === 'kickoff') {
        if (Math.hypot(b.vx, b.vy) > 0.01 || b.x !== 0 || b.y !== 0) this.phase = 'play';
        else for (const p of P) {
          const side = p.team === 0 ? -1 : 1;
          const dc = Math.hypot(p.x, p.y);
          if (p.team === this.kickoffTeam) {
            if (dc > C.CENTER_R && side * p.x < p.r) { p.x = side * p.r; p.vx = 0; }
          } else {
            if (side * p.x < p.r) { p.x = side * p.r; p.vx = 0; }
            const lim2 = C.CENTER_R + p.r;
            if (dc < lim2) { const f = lim2 / (dc || 1); p.x = (dc ? p.x * f : side * lim2); p.y *= (dc ? f : 0); }
          }
        }
      }

      // Top hakimiyeti
      if (this.phase === 'play') {
        let best = -1, bd = 40;
        for (const p of P) { const d = Math.hypot(b.x - p.x, b.y - p.y) - p.r - b.r; if (d < bd) { bd = d; best = p.team; } }
        if (best >= 0) this.stats.poss[best]++;
      }

      // Gol
      if (this.phase === 'play' || this.phase === 'kickoff') {
        let scorer = -1;
        if (b.x < -C.FW - b.r && Math.abs(b.y) < C.GH) scorer = 1;
        else if (b.x > C.FW + b.r && Math.abs(b.y) < C.GH) scorer = 0;
        if (scorer >= 0) {
          this.score[scorer]++;
          const own = this.lastTouch >= 0 && this.lastTouch !== scorer;
          this.lastGoal = { team: scorer, own, speed: Math.hypot(b.vx, b.vy), fire: b.fire > 0 };
          this.phase = 'goal';
          this.goalTimer = C.GOAL_PAUSE;
          this.kickoffTeam = 1 - scorer;
          this.emit('goal', { team: scorer, own, x: b.x, y: b.y, s: Math.hypot(b.vx, b.vy), score: this.score.slice() });
        }
      }

      if (this.phase === 'goal') {
        this.goalTimer--;
        if (this.goalTimer <= 0) {
          const lim = this.opts.scoreLimit;
          if (this.overtime || (lim > 0 && this.score[this.lastGoal.team] >= lim)) this.endMatch();
          else this.resetKickoff(false);
        }
      }

      // Süre
      if ((this.phase === 'play' || this.phase === 'kickoff') && this.freeze <= 0 && this.timeLeft > 0 && !this.overtime) {
        this.timeLeft--;
        if (this.timeLeft === 0) {
          if (this.score[0] === this.score[1]) { this.overtime = true; this.emit('overtime', {}); }
          else this.endMatch();
        }
      }
    }

    endMatch() {
      this.phase = 'over';
      this.winner = this.score[0] > this.score[1] ? 0 : this.score[1] > this.score[0] ? 1 : -1;
      this.emit('end', { winner: this.winner, score: this.score.slice() });
    }

    // --- Ağ ---
    snapshot() {
      const r = (v) => Math.round(v * 100) / 100;
      const b = this.ball;
      return {
        tk: this.tick, ph: this.phase, fr: this.freeze, gt: this.goalTimer, tl: this.timeLeft, ot: this.overtime ? 1 : 0,
        sc: this.score, ko: this.kickoffTeam, lt: this.lastTouch, w: this.winner, lg: this.lastGoal,
        b: [r(b.x), r(b.y), r(b.vx), r(b.vy), b.fire, r(b.spin * 1000), b.fireTeam],
        p: this.players.map(p => [r(p.x), r(p.y), r(p.vx), r(p.vy), r(p.r), p.kickReady ? 1 : 0, r(p.charge), p.cd, p.cdMax,
          p.rocket, p.curve, p.magnet, p.giant, p.dash, p.stun, Math.round(p.stamina * 100) / 100, (p.sprinting ? 1 : 0) | (p.exhausted ? 2 : 0), p.ability, p.next, p.slow,
          p.kickHeld ? 1 : 0, p.abHeld ? 1 : 0, p.kickBuf, p.stDelay, p.glove, p.hold]),
        sh: this.shields.map(s => [s.team, Math.round(s.x), Math.round(s.y), s.r, s.t]),
        st: [this.stats.kicks, this.stats.power, this.stats.poss, this.stats.abil],
      };
    }

    applySnapshot(s) {
      this.tick = s.tk; this.phase = s.ph; this.freeze = s.fr; this.goalTimer = s.gt; this.timeLeft = s.tl;
      this.overtime = !!s.ot; this.score = s.sc; this.kickoffTeam = s.ko; this.lastTouch = s.lt; this.winner = s.w; this.lastGoal = s.lg;
      const b = this.ball;
      [b.x, b.y, b.vx, b.vy, b.fire] = s.b; b.spin = s.b[5] / 1000; b.fireTeam = s.b[6];
      s.p.forEach((a, i) => {
        const p = this.players[i];
        [p.x, p.y, p.vx, p.vy, p.r] = a; p.kickReady = !!a[5];
        [p.charge, p.cd, p.cdMax, p.rocket, p.curve, p.magnet, p.giant, p.dash, p.stun, p.stamina] = a.slice(6);
        p.sprinting = !!(a[16] & 1); p.exhausted = !!(a[16] & 2);
        p.ability = a[17]; p.next = a[18]; p.slow = a[19];
        // misafirdeki tahmin bu durumdan ileri sardığı için tuş geçmişi de gerekli
        if (a.length > 20) { p.kickHeld = !!a[20]; p.abHeld = !!a[21]; p.kickBuf = a[22]; p.stDelay = a[23]; }
        if (a.length > 24) { p.glove = a[24]; p.hold = a[25]; }
      });
      this.stats = { kicks: s.st[0], power: s.st[1], poss: s.st[2], abil: s.st[3] };
      this.shields = (s.sh || []).map(a => ({ team: a[0], x: a[1], y: a[2], r: a[3], t: a[4], invMass: 0, vx: 0, vy: 0 }));
    }
  }

  TP.Sim = Sim;
  TP.NO_INPUT = NONE;
})();
