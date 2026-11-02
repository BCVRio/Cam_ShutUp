// Touch joystick + action buttons + keyboard fallback.
export class Input {
  constructor() {
    this.move = { x: 0, y: 0 };
    this.trick = false; this.pass = false; this.tap = false;
    this._keys = {};
    this._joyId = null; this._origin = null;
    this.joyEl = document.getElementById('joystick');
    this.base = document.getElementById('joy-base');
    this.knob = document.getElementById('joy-knob');
    this.R = 46;

    const onStart = (e) => {
      for (const t of e.changedTouches) {
        if (this._joyId !== null) continue;
        this._joyId = t.identifier; this._origin = { x: t.clientX, y: t.clientY };
        this.base.style.display = 'block'; this.base.style.left = t.clientX + 'px'; this.base.style.top = t.clientY + 'px';
        this.knob.style.transform = 'translate(-50%,-50%)';
      }
      e.preventDefault();
    };
    const onMove = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== this._joyId) continue;
        let dx = t.clientX - this._origin.x, dy = t.clientY - this._origin.y;
        const len = Math.hypot(dx, dy); const m = Math.min(len, this.R);
        if (len > 0) { dx = dx / len * m; dy = dy / len * m; }
        this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
        this.move.x = dx / this.R; this.move.y = -dy / this.R;
      }
      e.preventDefault();
    };
    const onEnd = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== this._joyId) continue;
        this._joyId = null; this.move.x = 0; this.move.y = 0; this.base.style.display = 'none';
      }
    };
    this.joyEl.addEventListener('touchstart', onStart, { passive: false });
    this.joyEl.addEventListener('touchmove', onMove, { passive: false });
    this.joyEl.addEventListener('touchend', onEnd); this.joyEl.addEventListener('touchcancel', onEnd);

    // Mouse drag fallback on desktop
    let mouseDown = false;
    this.joyEl.addEventListener('mousedown', (e) => { mouseDown = true; this._origin = { x: e.clientX, y: e.clientY }; this.base.style.display = 'block'; this.base.style.left = e.clientX + 'px'; this.base.style.top = e.clientY + 'px'; });
    window.addEventListener('mousemove', (e) => { if (!mouseDown) return; let dx = e.clientX - this._origin.x, dy = e.clientY - this._origin.y; const len = Math.hypot(dx, dy); const m = Math.min(len, this.R); if (len > 0) { dx = dx / len * m; dy = dy / len * m; } this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`; this.move.x = dx / this.R; this.move.y = -dy / this.R; });
    window.addEventListener('mouseup', () => { if (!mouseDown) return; mouseDown = false; this.move.x = 0; this.move.y = 0; this.base.style.display = 'none'; });

    const bind = (id, flag) => {
      const el = document.getElementById(id);
      const fire = (e) => { e.preventDefault(); this[flag] = true; };
      el.addEventListener('touchstart', fire, { passive: false });
      el.addEventListener('mousedown', fire);
    };
    bind('btn-trick', 'trick'); bind('btn-pass', 'pass');

    const shoot = document.getElementById('shoot-ui');
    const tapFire = (e) => { e.preventDefault(); this.tap = true; };
    shoot.addEventListener('touchstart', tapFire, { passive: false });
    shoot.addEventListener('mousedown', tapFire);

    window.addEventListener('keydown', (e) => {
      this._keys[e.code] = true;
      if (e.code === 'Space') { this.trick = true; this.tap = true; e.preventDefault(); }
      if (e.code === 'KeyE' || e.code === 'ShiftLeft') this.pass = true;
      if (e.code === 'Enter') this.tap = true;
    });
    window.addEventListener('keyup', (e) => { this._keys[e.code] = false; });
  }
  // Keyboard merges into move each frame
  poll() {
    const k = this._keys;
    let kx = (k.ArrowRight || k.KeyD ? 1 : 0) - (k.ArrowLeft || k.KeyA ? 1 : 0);
    let ky = (k.ArrowUp || k.KeyW ? 1 : 0) - (k.ArrowDown || k.KeyS ? 1 : 0);
    if (kx || ky) { const l = Math.hypot(kx, ky); return { x: kx / l, y: ky / l }; }
    return this.move;
  }
  consume(flag) { const v = this[flag]; this[flag] = false; return v; }
}
