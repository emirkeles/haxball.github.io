// TOPARLAK — klavye + gamepad
(function () {
  const keys = new Set();
  const PREVENT = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Slash', 'Quote', 'Tab']);
  window.addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    keys.add(e.code);
    if (PREVENT.has(e.code)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());

  const SCHEMES = {
    p1: { up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'], kick: ['Space', 'KeyC'], ab: ['ShiftLeft', 'KeyQ', 'KeyE'] },
    p2: { up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'], kick: ['Period', 'Enter', 'Numpad0', 'KeyL'], ab: ['Slash', 'ShiftRight', 'Numpad1', 'KeyK'] },
    solo: { up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'], kick: ['Space', 'KeyX', 'KeyK'], ab: ['ShiftLeft', 'ShiftRight', 'KeyZ', 'KeyE', 'KeyQ', 'KeyL'] },
  };
  const any = (arr) => arr.some(k => keys.has(k));

  function pad(i) {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const list = [];
    for (const p of pads) if (p && p.connected) list.push(p);
    return list[i] || null;
  }

  function readPad(gp) {
    if (!gp) return null;
    let x = gp.axes[0] || 0, y = gp.axes[1] || 0;
    if (Math.hypot(x, y) < 0.22) { x = 0; y = 0; }
    const bt = (n) => gp.buttons[n] && gp.buttons[n].pressed;
    if (bt(14)) x = -1; if (bt(15)) x = 1; if (bt(12)) y = -1; if (bt(13)) y = 1;
    return { x, y, kick: bt(0) || bt(7) || bt(5), ab: bt(1) || bt(2) || bt(6) || bt(4) };
  }

  TP.Input = {
    keys,
    read(scheme, padIndex) {
      const s = SCHEMES[scheme];
      let x = (any(s.right) ? 1 : 0) - (any(s.left) ? 1 : 0);
      let y = (any(s.down) ? 1 : 0) - (any(s.up) ? 1 : 0);
      let kick = any(s.kick), ab = any(s.ab);
      if (padIndex != null) {
        const g = readPad(pad(padIndex));
        if (g) { if (g.x || g.y) { x = g.x; y = g.y; } kick = kick || g.kick; ab = ab || g.ab; }
      }
      return { x, y, kick, ab };
    },
    padCount() { const p = navigator.getGamepads ? navigator.getGamepads() : []; let n = 0; for (const g of p) if (g && g.connected) n++; return n; },
  };
})();
