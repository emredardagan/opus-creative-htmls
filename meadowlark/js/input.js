// Keyboard, mouse-drag camera, wheel zoom, and an on-screen stick with buttons for touch.
const $ = id => document.getElementById(id);

export class Input {
  constructor(canvas) {
    this.keys = new Set(); this.pressed = new Set();
    this.move = { x: 0, y: 0 }; this.look = { x: 0, y: 0 }; this.zoom = 0;
    this.touch = matchMedia('(pointer: coarse)').matches;
    this.runToggle = false; this.lastLook = -99;
    addEventListener('keydown', e => {
      if (e.target.tagName === 'INPUT') return;
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', e => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    // drag anywhere on the canvas to look around
    let drag = null;
    canvas.addEventListener('pointerdown', e => {
      if (e.pointerType === 'touch' && this.stickId === e.pointerId) return;
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', e => {
      if (!drag || drag.id !== e.pointerId) return;
      const k = e.pointerType === 'touch' ? 1.5 : 1;
      this.look.x += (e.clientX - drag.x) * k; this.look.y += (e.clientY - drag.y) * k; drag.x = e.clientX; drag.y = e.clientY;
      this.lastLook = performance.now() / 1000;
    });
    const end = e => { if (drag && drag.id === e.pointerId) drag = null; };
    canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('wheel', e => { this.zoom += e.deltaY; e.preventDefault(); }, { passive: false });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    // pinch to zoom on touch
    const pts = new Map(); let pinch = 0;
    canvas.addEventListener('pointerdown', e => { if (e.pointerType === 'touch') pts.set(e.pointerId, [e.clientX, e.clientY]); });
    canvas.addEventListener('pointermove', e => {
      if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (pts.size === 2) { const [a, b] = [...pts.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (pinch) this.zoom += (pinch - d) * 3; pinch = d; }
    });
    const pend = e => { pts.delete(e.pointerId); pinch = 0; };
    canvas.addEventListener('pointerup', pend); canvas.addEventListener('pointercancel', pend);
    if (this.touch) this.setupTouch();
  }
  setupTouch() {
    $('touch').hidden = false;
    const stick = $('stick'), knob = $('knob');
    let id = null, cx = 0, cy = 0;
    stick.addEventListener('pointerdown', e => { id = e.pointerId; this.stickId = id; const r = stick.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2; stick.setPointerCapture(id); upd(e); });
    const upd = e => {
      if (e.pointerId !== id) return;
      let dx = e.clientX - cx, dy = e.clientY - cy; const R = 46, l = Math.hypot(dx, dy); if (l > R) { dx *= R / l; dy *= R / l; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`; this.move.x = dx / R; this.move.y = dy / R;
    };
    stick.addEventListener('pointermove', upd);
    const off = e => { if (e.pointerId !== id) return; id = null; this.stickId = null; knob.style.transform = ''; this.move.x = this.move.y = 0; };
    stick.addEventListener('pointerup', off); stick.addEventListener('pointercancel', off);
    const hold = (el, code) => {
      el.addEventListener('pointerdown', e => { e.preventDefault(); this.keys.add(code); this.pressed.add(code); el.classList.add('on'); });
      const up = () => { this.keys.delete(code); el.classList.remove('on'); };
      el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('pointerleave', up);
    };
    hold($('tJump'), 'Space'); hold($('tAct'), 'KeyE');
    $('tRun').addEventListener('pointerdown', e => { e.preventDefault(); this.runToggle = !this.runToggle; $('tRun').classList.toggle('on', this.runToggle); });
  }
  down(...codes) { return codes.some(c => this.keys.has(c)); }
  hit(...codes) { return codes.some(c => this.pressed.has(c)); }
  axis() {
    let x = this.move.x, y = this.move.y;
    if (this.down('KeyA', 'ArrowLeft')) x -= 1; if (this.down('KeyD', 'ArrowRight')) x += 1;
    if (this.down('KeyW', 'ArrowUp')) y -= 1; if (this.down('KeyS', 'ArrowDown')) y += 1;
    const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
    return { x, y, l: Math.min(1, l) };
  }
  running() { return this.down('ShiftLeft', 'ShiftRight') || this.runToggle; }
  endFrame() { this.pressed.clear(); this.look.x = this.look.y = 0; this.zoom = 0; }
}
