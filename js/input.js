// TOPARLAK — klavye + gamepad, değiştirilebilir tuşlar
(function () {
  const keys = new Set();
  let capture = null; // tuş atama modu
  const PREVENT = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Slash', 'Quote', 'Tab', 'Period']);
  window.addEventListener('keydown', (e) => {
    if (capture) { e.preventDefault(); e.stopPropagation(); const f = capture; capture = null; f(e.code); return; }
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT')) return;
    keys.add(e.code);
    if (PREVENT.has(e.code)) e.preventDefault();
  }, true);
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());

  const ACTIONS = [
    { id: 'up', name: 'Yukarı' }, { id: 'down', name: 'Aşağı' }, { id: 'left', name: 'Sol' }, { id: 'right', name: 'Sağ' },
    { id: 'kick', name: 'Şut (basılı tut = sert)' }, { id: 'sp', name: 'Koş (sprint)' }, { id: 'ab', name: 'Yetenek' },
  ];
  const DEFAULTS = {
    solo: { up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
      kick: ['Space', 'KeyX'], sp: ['ShiftLeft', 'ShiftRight'], ab: ['KeyE', 'KeyC', 'KeyQ'] },
    p1: { up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'], kick: ['Space'], sp: ['ShiftLeft'], ab: ['KeyE', 'KeyQ'] },
    p2: { up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'],
      kick: ['KeyL', 'Period', 'Numpad0', 'Enter'], sp: ['KeyK', 'ShiftRight', 'Numpad1'], ab: ['KeyJ', 'Slash', 'Numpad2'] },
  };
  let binds = JSON.parse(JSON.stringify(DEFAULTS));
  try {
    const saved = JSON.parse(localStorage.getItem('tp_binds') || 'null');
    if (saved) for (const s in DEFAULTS) for (const a in DEFAULTS[s]) if (saved[s] && Array.isArray(saved[s][a]) && saved[s][a].length) binds[s][a] = saved[s][a];
  } catch (e) {}
  const persist = () => { try { localStorage.setItem('tp_binds', JSON.stringify(binds)); } catch (e) {} };

  const any = (arr) => arr.some(k => keys.has(k));

  function pads() {
    const out = [];
    const list = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of list) if (p && p.connected) out.push(p);
    return out;
  }
  function readPad(gp) {
    if (!gp) return null;
    let x = gp.axes[0] || 0, y = gp.axes[1] || 0;
    const m = Math.hypot(x, y);
    if (m < 0.2) { x = 0; y = 0; } else { const k = Math.min(1, (m - 0.2) / 0.7) / m; x *= k; y *= k; }
    const bt = (n) => gp.buttons[n] && (gp.buttons[n].pressed || gp.buttons[n].value > 0.4);
    if (bt(14)) x = -1; if (bt(15)) x = 1; if (bt(12)) y = -1; if (bt(13)) y = 1;
    return { x, y, kick: bt(0) || bt(7), sp: bt(5) || bt(6) || bt(10), ab: bt(1) || bt(2) || bt(3) || bt(4) };
  }

  const NAMES = { Space: 'Space', ShiftLeft: 'Sol Shift', ShiftRight: 'Sağ Shift', ControlLeft: 'Sol Ctrl', ControlRight: 'Sağ Ctrl', AltLeft: 'Sol Alt', AltRight: 'Sağ Alt',
    ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Period: '.', Comma: ',', Slash: '/', Semicolon: 'Ş', Quote: 'İ', BracketLeft: 'Ğ', BracketRight: 'Ü',
    Backslash: ',', Enter: 'Enter', Tab: 'Tab', Backspace: 'Silme', MetaLeft: 'Cmd', MetaRight: 'Cmd', CapsLock: 'Caps' };
  function keyName(code) {
    if (NAMES[code]) return NAMES[code];
    if (code.startsWith('Key')) return code.slice(3);
    if (code.startsWith('Digit')) return code.slice(5);
    if (code.startsWith('Numpad')) return 'Num' + code.slice(6);
    return code;
  }

  TP.Input = {
    keys, ACTIONS, keyName,
    get binds() { return binds; },
    read(scheme, padIndex) {
      const s = binds[scheme];
      let x = (any(s.right) ? 1 : 0) - (any(s.left) ? 1 : 0);
      let y = (any(s.down) ? 1 : 0) - (any(s.up) ? 1 : 0);
      let kick = any(s.kick), ab = any(s.ab), sp = any(s.sp);
      if (padIndex != null) {
        const g = readPad(pads()[padIndex]);
        if (g) { if (g.x || g.y) { x = g.x; y = g.y; } kick = kick || g.kick; ab = ab || g.ab; sp = sp || g.sp; }
      }
      return { x, y, kick, ab, sp };
    },
    label(scheme, action, n) { return binds[scheme][action].slice(0, n || 2).map(keyName).join(' / '); },
    capture(fn) { capture = fn; },
    cancelCapture() { capture = null; },
    setBind(scheme, action, code) {
      // aynı şemada bu tuşu kullanan başka eylemden kaldır
      for (const a in binds[scheme]) if (a !== action) binds[scheme][a] = binds[scheme][a].filter(k => k !== code);
      binds[scheme][action] = [code];
      for (const a in binds[scheme]) if (!binds[scheme][a].length) binds[scheme][a] = DEFAULTS[scheme][a].filter(k => !Object.values(binds[scheme]).flat().includes(k)).slice(0, 1);
      persist();
    },
    resetBinds(scheme) { binds[scheme] = JSON.parse(JSON.stringify(DEFAULTS[scheme])); persist(); },
    padCount() { return pads().length; },
  };
})();
