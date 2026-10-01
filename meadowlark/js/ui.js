// The HUD: quest tracker, compass, feathers, prompts, floating markers, dialog with a
// typewriter, toasts, the journal with its painted map, fades and the ending card.
import * as THREE from 'three';
import { HALF, P, PATHS, RIVER } from './layout.js';
import { heightAt, waterAt, pathAt } from './terrain.js';
import { QUESTS, FEATHER_TOTAL } from './quests.js';

const $ = id => document.getElementById(id);
const _v = new THREE.Vector3();

export class UI {
  constructor(ctx) {
    this.ctx = ctx; this.markers = new Map();
    this.layer = document.createElement('div'); this.layer.className = 'markers'; $('hud').prepend(this.layer);
    $('logBtn').onclick = () => this.openJournal();
    $('journalClose').onclick = () => this.closeJournal();
    $('journal').addEventListener('click', e => { if (e.target.id === 'journal') this.closeJournal(); });
    this.buildFeathers();
    this.mapBase = null;
  }
  // ---------------------------------------------------------------- feathers
  buildFeathers() {
    const row = $('featherRow'); row.innerHTML = '';
    for (let i = 0; i < FEATHER_TOTAL; i++) { const f = document.createElement('i'); f.className = 'f'; row.appendChild(f); }
  }
  featherGet(n) {
    const fs = $('featherRow').children;
    for (let i = 0; i < fs.length; i++) fs[i].classList.toggle('on', i < n);
    if (fs[n - 1]) { fs[n - 1].classList.remove('pop'); void fs[n - 1].offsetWidth; fs[n - 1].classList.add('pop'); }
    $('featherCount').textContent = `${n} / ${FEATHER_TOTAL}`;
    $('feathers').classList.remove('bump'); void $('feathers').offsetWidth; $('feathers').classList.add('bump');
  }
  setFeathers(n) { const fs = $('featherRow').children; for (let i = 0; i < fs.length; i++) fs[i].classList.toggle('on', i < n); $('featherCount').textContent = `${n} / ${FEATHER_TOTAL}`; }
  // ---------------------------------------------------------------- toasts and hints
  toast(text, kind = 'info') {
    const icons = { info: 'ph-info', item: 'ph-sparkle', quest: 'ph-scroll', tip: 'ph-lightbulb', feather: 'ph-feather' };
    const d = document.createElement('div'); d.className = `toast ${kind}`;
    d.innerHTML = `<i class="ph-fill ${icons[kind] || icons.info}" aria-hidden="true"></i><span></span>`; d.querySelector('span').textContent = text;
    $('toasts').appendChild(d);
    setTimeout(() => d.classList.add('out'), 3600); setTimeout(() => d.remove(), 4200);
    while ($('toasts').children.length > 4) $('toasts').firstChild.remove();
  }
  hint(text) {
    let h = $('bigHint'); if (!h) { h = document.createElement('div'); h.id = 'bigHint'; h.className = 'big-hint'; $('hud').appendChild(h); }
    h.textContent = text; h.classList.toggle('on', !!text);
  }
  // ---------------------------------------------------------------- tracker + compass
  trackQuest(id) {
    const qs = this.ctx.quests; if (id) qs.tracked = id;
    const o = qs.objective(); this.obj = o;
    $('questTitle').textContent = o.title; $('questBody').textContent = o.text;
    $('quest').classList.remove('flash'); void $('quest').offsetWidth; $('quest').classList.add('flash');
  }
  compass(camYaw, playerPos) {
    const strip = $('compassStrip');
    if (!this.compassBuilt) {
      const marks = ['N', '', 'NE', '', 'E', '', 'SE', '', 'S', '', 'SW', '', 'W', '', 'NW', ''];
      let html = '';
      for (let k = -1; k <= 1; k++) marks.forEach((m, i) => { html += `<span class="${m ? 'm' : 't'}" style="left:${(k * 16 + i) * 40}px">${m}</span>`; });
      strip.innerHTML = html; this.compassBuilt = true;
    }
    // heading: 0 = north (-z), clockwise
    // the camera looks along -(sin yaw, cos yaw), which is a bearing of -yaw from north
    const head = ((-camYaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const px = head / (Math.PI * 2) * 640;
    strip.style.transform = `translateX(${-px + 150}px)`;
    const pin = $('compassPin'), tg = this.obj?.target;
    if (tg) {
      const a = Math.atan2(tg[0] - playerPos.x, -(tg[1] - playerPos.z));    // bearing from north, clockwise
      let rel = ((a - head + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
      const x = Math.max(-140, Math.min(140, rel / (Math.PI * 2) * 640));
      pin.style.transform = `translateX(${x}px)`; pin.hidden = false;
      pin.classList.toggle('edge', Math.abs(x) >= 140);
      const dist = Math.hypot(tg[0] - playerPos.x, tg[1] - playerPos.z);
      pin.dataset.d = dist > 8 ? `${Math.round(dist)} m` : '';
    } else pin.hidden = true;
  }
  // ---------------------------------------------------------------- floating markers over pets
  markersUpdate(camera) {
    const qs = this.ctx.quests, w = innerWidth, h = innerHeight;
    for (const q of QUESTS) {
      const s = qs.questState(q), pet = q.pet;
      let kind = s === 'new' ? 'new' : s === 'ready' && q.id !== 'beacon' ? 'ready' : s === 'locked' ? '' : s === 'active' ? 'busy' : '';
      if (q.id === 'kitten' && s === 'active' && qs.follow) kind = 'ready';
      let el = this.markers.get(q.id);
      if (!el) { el = document.createElement('div'); el.className = 'marker'; el.innerHTML = '<b></b><span></span>'; this.layer.appendChild(el); this.markers.set(q.id, el); }
      _v.copy(pet.root.position); _v.y += pet.scale * 2.4 + 0.5; _v.project(camera);
      const vis = kind && _v.z < 1 && Math.abs(_v.x) < 1.1 && Math.abs(_v.y) < 1.1;
      const dist = camera.position.distanceTo(pet.root.position);
      el.style.display = vis && dist < 90 ? '' : 'none';
      if (!vis) continue;
      el.className = `marker ${kind}`;
      el.querySelector('b').textContent = kind === 'new' ? '!' : kind === 'ready' ? '?' : '…';
      el.querySelector('span').textContent = dist < 18 ? q.who : '';
      const sc = Math.max(0.55, Math.min(1.1, 14 / dist));
      el.style.transform = `translate(${(_v.x * 0.5 + 0.5) * w}px, ${(1 - (_v.y * 0.5 + 0.5)) * h}px) translate(-50%, -100%) scale(${sc})`;
    }
  }
  prompt(it, touch) {
    const p = $('prompt');
    if (!it) { p.hidden = true; return; }
    p.hidden = false; $('promptText').textContent = it.label(); $('promptKey').textContent = touch ? '' : 'E';
    $('promptKey').hidden = touch;
  }
  glide(frac, show) { $('glide').hidden = !show; $('glideBar').style.transform = `scaleX(${Math.max(0, frac)})`; }
  // ---------------------------------------------------------------- dialog
  say(name, color, lines, kind, sfx) {
    return new Promise(resolve => {
      const d = $('dialog'); d.hidden = false; d.classList.remove('out');
      $('dlgName').textContent = name; $('dlgName').style.background = color;
      let i = 0, typing = null, full = '';
      const show = () => {
        full = lines[i]; let n = 0; const el = $('dlgText'); el.textContent = '';
        $('dlgNext').classList.remove('on');
        clearInterval(typing);
        typing = setInterval(() => {
          n += 1; el.textContent = full.slice(0, n);
          if (n % 3 === 0 && full[n] !== ' ') sfx?.blip(kind);
          if (n >= full.length) { clearInterval(typing); typing = null; $('dlgNext').classList.add('on'); }
        }, 22);
      };
      const next = () => {
        if (typing) { clearInterval(typing); typing = null; $('dlgText').textContent = full; $('dlgNext').classList.add('on'); return; }
        i++; if (i >= lines.length) { done(); return; }
        show();
      };
      const key = e => { if (['KeyE', 'Space', 'Enter'].includes(e.code)) { e.preventDefault(); next(); } };
      const click = () => next();
      const done = () => {
        removeEventListener('keydown', key, true); d.removeEventListener('pointerdown', click);
        d.classList.add('out'); setTimeout(() => { d.hidden = true; }, 220); resolve();
      };
      // wait a beat so the key that opened the dialog does not skip the first line
      setTimeout(() => { addEventListener('keydown', key, true); d.addEventListener('pointerdown', click); }, 120);
      show();
    });
  }
  get talking() { return !$('dialog').hidden; }
  // ---------------------------------------------------------------- journal
  openJournal() {
    const qs = this.ctx.quests, list = $('journalList'); list.innerHTML = '';
    for (const q of QUESTS) {
      const s = qs.questState(q); if (s === 'new' || s === 'locked') continue;
      const li = document.createElement('li'); li.className = s;
      const n = qs.count[q.id] || 0;
      li.innerHTML = `<i class="ph-fill ${s === 'done' ? 'ph-check-circle' : 'ph-circle-dashed'}"></i><div><b></b><span></span></div>`;
      li.querySelector('b').textContent = q.title; li.querySelector('span').textContent = s === 'done' ? `Done. ${q.lines.done[0]}` : s === 'ready' ? q.done : q.goal(n);
      if (s !== 'done') { li.tabIndex = 0; li.onclick = () => { this.trackQuest(q.id); this.openJournal(); }; if (qs.objective().q === q) li.classList.add('tracked'); }
      list.appendChild(li);
    }
    if (!list.children.length) list.innerHTML = '<li class="empty">No favours yet. Look for animals with a gold <b>!</b> above them.</li>';
    this.drawMap();
    $('journal').hidden = false; this.ctx.paused = true;
  }
  closeJournal() { $('journal').hidden = true; this.ctx.paused = false; }
  drawMap() {
    const c = $('map'), g = c.getContext('2d'), S = c.width;
    if (!this.mapBase) {
      // a painted map: sea, beaches, greens by height, paths and the river
      const img = g.createImageData(S, S), d = img.data;
      for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
        const x = (i / S - 0.5) * HALF * 2, z = (j / S - 0.5) * HALF * 2, h = heightAt(x, z), w = waterAt(x, z);
        let col;
        if (h < 0.1 || (w > -50 && w > h)) { const dp = Math.min(1, Math.max(0, -h / 10)); col = w > 0.5 ? [120, 200, 220] : [140 - dp * 70, 210 - dp * 70, 220 - dp * 40]; }
        else if (h < 1.5) col = [238, 220, 170];
        else { const k = Math.min(1, h / 45); col = [150 - k * 40 + 40 * (h > 38), 196 - k * 50, 110 - k * 30 + 30 * (h > 38)]; }
        if (pathAt(x, z) > 0.5 && h > 0.5) col = [205, 170, 120];
        const n = (Math.sin(i * 0.9) * Math.sin(j * 1.1)) * 4;
        const o = (j * S + i) * 4; d[o] = col[0] + n; d[o + 1] = col[1] + n; d[o + 2] = col[2] + n; d[o + 3] = 255;
      }
      g.putImageData(img, 0, 0);
      this.mapBase = g.getImageData(0, 0, S, S);
    } else g.putImageData(this.mapBase, 0, 0);
    const tm = (x, z) => [(x / (HALF * 2) + 0.5) * S, (z / (HALF * 2) + 0.5) * S];
    const label = (t, x, z) => { const [a, b] = tm(x, z); g.font = '700 15px Nunito'; g.textAlign = 'center'; g.lineWidth = 4; g.strokeStyle = 'rgba(255,248,232,.9)'; g.strokeText(t, a, b); g.fillStyle = '#4a3420'; g.fillText(t, a, b); };
    label('Village', ...P.village.c); label('Orchard', ...P.orchard.c); label('Windmill', P.windmill.c[0], P.windmill.c[1] + 10); label('Meadow', ...P.meadow.c);
    label('Forest', ...P.forest.c); label('Summit', P.summit[0], P.summit[1] - 6); label('Ruins', P.ruins[0], P.ruins[1] - 6); label('Lighthouse', P.lighthouse[0] - 6, P.lighthouse[1] + 10); label('Dock', P.dock.c[0], P.dock.c[1] + 16); label('Camp', P.camp[0] - 4, P.camp[1] + 7);
    const qs = this.ctx.quests;
    for (const q of QUESTS) {
      const s = qs.questState(q); if (s === 'locked') continue;
      const [a, b] = tm(q.pet.pos.x, q.pet.pos.z);
      g.beginPath(); g.arc(a, b, 7, 0, Math.PI * 2); g.fillStyle = s === 'done' ? '#7fbf5a' : s === 'new' ? '#ffc93c' : '#fff3d6'; g.fill(); g.lineWidth = 2; g.strokeStyle = '#4a3420'; g.stroke();
    }
    const o = qs.objective();
    if (o.target) { const [a, b] = tm(o.target[0], o.target[1]); g.beginPath(); g.arc(a, b, 12, 0, Math.PI * 2); g.setLineDash([4, 4]); g.strokeStyle = '#e8554e'; g.lineWidth = 3; g.stroke(); g.setLineDash([]); }
    const p = this.ctx.player.pos, [px, pz] = tm(p.x, p.z), yaw = this.ctx.player.yaw;
    g.save(); g.translate(px, pz); g.rotate(-yaw + Math.PI);
    g.beginPath(); g.moveTo(0, -11); g.lineTo(8, 8); g.lineTo(0, 4); g.lineTo(-8, 8); g.closePath(); g.fillStyle = '#e8554e'; g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 2; g.stroke();
    g.restore();
  }
  // ---------------------------------------------------------------- fades and the end
  fadeTo(v, ms) { const f = $('fade'); f.style.transition = `opacity ${ms}ms ease`; f.style.opacity = v; return new Promise(r => setTimeout(r, ms)); }
  ending(n, total) {
    const d = document.createElement('div'); d.className = 'ending';
    d.innerHTML = `<div class="ending-card"><i class="ph-fill ph-fire"></i><h2>The beacon is lit</h2><p>Every boat will find its way home tonight. The island won't forget your kindness.</p><p class="small">${n} of ${total} golden feathers found.${n < total ? ' The rest are still out there.' : ' You found them all!'}</p><button class="primary">Keep exploring</button></div>`;
    document.body.appendChild(d);
    d.querySelector('button').onclick = () => { d.classList.add('out'); setTimeout(() => d.remove(), 400); };
  }
}
