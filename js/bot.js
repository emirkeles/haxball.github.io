// TOPARLAK — basit ama inatçı yapay zeka
(function () {
  const C = TP.C;
  class Bot {
    constructor(level) {
      this.level = level || 'orta';
      const L = { kolay: { speed: 0.62, react: 14, aim: 0.55, ab: 0.004 }, orta: { speed: 0.85, react: 7, aim: 0.75, ab: 0.012 }, zor: { speed: 1, react: 2, aim: 0.88, ab: 0.03 } };
      this.cfg = L[this.level] || L.orta;
      this.out = { x: 0, y: 0, kick: false, ab: false, sp: false };
      this.t = 0; this.kickHold = 0; this.mode = 'atk'; this.holding = false; this.held = 0; this.holdTarget = 0; this.tackling = false;
      this.wobble = Math.random() * 10;
    }

    think(sim, idx) {
      this.t++;
      const me = sim.players[idx], opp = sim.players[1 - idx], b = sim.ball;
      const side = me.team === 0 ? -1 : 1;              // kendi kalemiz bu tarafta
      const goalX = -side * (C.FW + 10);                // hücum kalesi
      const ownX = side * C.FW;
      const cfg = this.cfg;
      if (this.t % cfg.react !== 0 && this.t > 1) return this.out;

      // Topun birkaç tick sonraki konumu
      const look = 8;
      const bx = b.x + b.vx * look, by = b.y + b.vy * look;
      const dB = Math.hypot(bx - me.x, by - me.y);
      const dO = Math.hypot(bx - opp.x, by - opp.y);

      // Hedef: topun arkasında, kaleye doğru bakacak nokta
      let aimY = Math.max(-C.GH + 18, Math.min(C.GH - 18, by * 0.3 + Math.sin(this.t * 0.01 + this.wobble) * 30));
      let gx = goalX - bx, gy = aimY - by;
      let gl = Math.hypot(gx, gy) || 1; gx /= gl; gy /= gl;
      const behind = me.r + b.r + 4;
      let tx = bx - gx * behind, ty = by - gy * behind;

      // Savunma: rakip topa çok daha yakın ve top bizim yarıda ise kaleyle top arasına gir
      const ballOurHalf = side * b.x > -60;
      const myKickoff = sim.phase === 'kickoff' && sim.kickoffTeam === me.team;
      const defend = !myKickoff && dO + 40 < dB && ballOurHalf;
      if (defend) {
        const k = 0.35;
        tx = ownX + (b.x - ownX) * k; ty = b.y * k * 1.4;
        tx -= side * 18;
      }

      // Topun yanlış tarafındaysak etrafından dolaş
      const mx = me.x - bx, my = me.y - by;
      const wrongSide = (mx * gx + my * gy) > 0;
      if (!defend && wrongSide && Math.hypot(mx, my) < 90) {
        const perp = (mx * -gy + my * gx) >= 0 ? 1 : -1;
        tx = bx - gx * 30 + -gy * perp * 42; ty = by - gy * 30 + gx * perp * 42;
      }

      // Topun arkasında ve hizalıysak içinden geç (dripling)
      const nearBall = Math.hypot(me.x - bx, me.y - by) < me.r + b.r + 14;
      if (!defend && !wrongSide && nearBall) { tx = bx + gx * 20; ty = by + gy * 20; }

      let dx = tx - me.x, dy = ty - me.y;
      const dl = Math.hypot(dx, dy);
      let speed = cfg.speed;
      if (dl < 6) speed *= dl / 6;
      if (dl > 0.01) { dx /= dl; dy /= dl; }
      this.out.x = dx * speed; this.out.y = dy * speed;
      // Sprint: uzaktaysak ve nefesimiz varsa koş
      this.out.sp = (dB > 130 || (defend && dB > 70)) && me.stamina > (this.level === 'kolay' ? 0.7 : 0.35) && this.level !== 'kolay' || (this.level === 'kolay' && dB > 250 && me.stamina > 0.8);

      // Şut kararı
      const toBx = b.x - me.x, toBy = b.y - me.y, tl = Math.hypot(toBx, toBy) || 1;
      const align = (toBx / tl) * gx + (toBy / tl) * gy;
      const close = tl - me.r - b.r < 22;
      const distGoal = Math.abs(goalX - b.x);
      const inRange = tl - me.r - b.r < C.KICK_RANGE + 1;
      const dOppNow = Math.hypot(opp.x - me.x, opp.y - me.y);
      // Şut tuşu bırakınca vurur: bas, (gerekirse şarj et), topa değince bırak
      if (this.holding) {
        this.held += cfg.react;
        const ready = this.held >= this.holdTarget;
        if ((ready && inRange && (align > cfg.aim - 0.2 || defend)) || this.held > 100 || this.tackling) { this.out.kick = false; this.holding = false; this.tackling = false; }
        else this.out.kick = true;
      } else if (close && (align > cfg.aim || (defend && align > -0.2))) {
        this.holding = true; this.held = 0; this.holdTarget = distGoal > 260 && Math.random() < 0.5 ? 45 : 1; this.out.kick = true;
      } else if (!close && distGoal < 380 && align > 0.85 && tl < 90 && Math.random() < 0.1) {
        this.holding = true; this.held = 0; this.holdTarget = 40; this.out.kick = true; // şarj ederek yaklaş
      } else if (!close && dOppNow < me.r + opp.r + 9 && Math.random() < 0.25 * cfg.speed) {
        this.holding = true; this.held = 0; this.holdTarget = 0; this.tackling = true; this.out.kick = true; // rakibe vur
      } else this.out.kick = false;

      // Yetenek
      this.out.ab = false;
      if (me.cd <= 0 && Math.random() < cfg.ab * cfg.react) {
        const a = me.ability;
        const dOpp = Math.hypot(opp.x - me.x, opp.y - me.y);
        if (a === 'roket' && close && align > 0.6 && distGoal < 520) this.out.ab = true;
        else if (a === 'falso' && close && distGoal < 450) this.out.ab = true;
        else if (a === 'atilma' && dB > 140 && !wrongSide) this.out.ab = true;
        else if (a === 'sok' && dOpp < 90 && Math.hypot(opp.x - b.x, opp.y - b.y) < 60) this.out.ab = true;
        else if (a === 'miknatis' && dB < 150 && dB > 50 && dO < dB) this.out.ab = true;
        else if (a === 'dev' && (defend || dOpp < 70)) this.out.ab = true;
        else if (a === 'buz' && dO < dB && dO < 80) this.out.ab = true;
        else if (a === 'isinlan' && (wrongSide || dB > 220) && !defend) this.out.ab = true;
        else if (a === 'kalkan' && Math.abs(ownX - b.x) < 200 && b.vx * side > 1.5) this.out.ab = true;
        else if (a === 'hayalet' && dOpp < 60 && dB < 120) this.out.ab = true;
        else if (a === 'turbo' && dB > 160) this.out.ab = true;
        else if ((a === 'kucult' || a === 'ters') && dOpp < 160 && dO < dB + 40) this.out.ab = true;
        else if (a === 'bomba' && Math.hypot(opp.x - b.x, opp.y - b.y) < 70 && dB > 60) this.out.ab = true;
        else if (a === 'mayin' && (defend || Math.abs(ownX - me.x) < 220)) this.out.ab = true;
        else if (a === 'ruzgar' && side * b.x < 0 && Math.abs(goalX - b.x) < 420) this.out.ab = true;
        else if (a === 'lastik' && close) this.out.ab = true;
        else if (a === 'cagir' && dB > 180 && dO < dB) this.out.ab = true;
        else if (a === 'sis' && close && distGoal < 400) this.out.ab = true;
      }
      return this.out;
    }
  }
  TP.Bot = Bot;
})();
