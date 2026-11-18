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
    { id: 'kick', name: 'Şut (basılı tut, bırak)' }, { id: 'sp', name: 'Koş (sprint)' },
    { id: 'ab1', name: 'Yetenek 1' }, { id: 'ab2', name: 'Yetenek 2' }, { id: 'ab3', name: 'Yetenek 3' },
  ];
  const DEFAULTS = {
    solo: { up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
      kick: ['Space', 'KeyX'], sp: ['ShiftLeft', 'ShiftRight'], ab1: ['Digit1', 'KeyQ', 'KeyC'], ab2: ['Digit2', 'KeyE', 'KeyV'], ab3: ['Digit3', 'KeyR', 'KeyB'] },
    p1: { up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'], kick: ['Space'], sp: ['ShiftLeft'], ab1: ['Digit1', 'KeyQ'], ab2: ['Digit2', 'KeyE'], ab3: ['Digit3', 'KeyR'] },
    p2: { up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'],
      kick: ['KeyL', 'Period', 'Numpad0', 'Enter'], sp: ['KeyK', 'ShiftRight'], ab1: ['KeyU', 'Numpad1'], ab2: ['KeyI', 'Numpad2'], ab3: ['KeyO', 'Numpad3'] },
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
    return { x, y, kick: bt(0) || bt(7), sp: bt(5) || bt(6) || bt(10), ab: (bt(1) || bt(4) ? 1 : 0) | (bt(2) ? 2 : 0) | (bt(3) ? 4 : 0) };
  }

  const NAMES = { Space: 'Space', ShiftLeft: 'Sol Shift', ShiftRight: 'Sağ Shift', ControlLeft: 'Sol Ctrl', ControlRight: 'Sağ Ctrl', AltLeft: 'Sol Alt', AltRight: 'Sağ Alt',
    ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Period: '.', Comma: ',', Slash: '/', Semicolon: 'Ş', Quote: 'İ', BracketLeft: 'Ğ', BracketRight: 'Ü',
    Backslash: ',', Minus: '*', Equal: '-', Enter: 'Enter', Tab: 'Tab', Backspace: 'Silme', MetaLeft: 'Cmd', MetaRight: 'Cmd', CapsLock: 'Caps' };
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
      let kick = any(s.kick), sp = any(s.sp);
      let ab = (any(s.ab1) ? 1 : 0) | (any(s.ab2) ? 2 : 0) | (any(s.ab3) ? 4 : 0);
      if (padIndex != null) {
        const g = readPad(pads()[padIndex]);
        if (g) { if (g.x || g.y) { x = g.x; y = g.y; } kick = kick || g.kick; ab = ab | g.ab; sp = sp || g.sp; }
      }
      // emoji: tek oyunculu/P1 için 5-8, P2 için 9 0 * =
      const ek = scheme === 'p2' ? ['Digit9', 'Digit0', 'Minus', 'Equal'] : ['Digit5', 'Digit6', 'Digit7', 'Digit8'];
      let emo = 0;
      for (let i = 0; i < 4; i++) if (keys.has(ek[i])) { emo = i + 1; break; }
      return { x, y, kick, ab, sp, emo };
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
