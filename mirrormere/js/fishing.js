// Casting, waiting, hooking and reeling: the one-button heart of the game.
import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import * as A from './assets.js';
import { depthAt, zoneAt, ZONE_NAME, SPOTS } from './world.js';
import { pickSpecies, rollSize } from './fish.js';

export const CAST_RANGE = [13, 17, 22, 28, 35];
const rr = (a, b) => a + Math.random() * (b - a);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const damp = (a, b, l, dt) => a + (b - a) * (1 - Math.exp(-l * dt));

export function createFishing(world, audio, game) {
  const { scene, camera, water } = world;

  // ---- rod in hand ----
  const rodPivot = new THREE.Group();
  camera.add(rodPivot);
  const rod = A.clone('fishing-rod-b', { size: 1.7, axis: 'y', center: true });
  rod.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  rod.position.y = -0.45;
  rodPivot.add(rod);
  const tip = new THREE.Object3D();
  tip.position.set(0, 1.7 - 0.45, 0);
  rodPivot.add(tip);
  water.hideInMirror.push(rodPivot);

  // ---- bobber ----
  const bobber = new THREE.Group();
  const red = new THREE.MeshStandardMaterial({ color: 0xe8473a, roughness: 0.4 });
  const white = new THREE.MeshStandardMaterial({ color: 0xf7f3ea, roughness: 0.4 });
  const top = new THREE.Mesh(new THREE.SphereGeometry(0.13, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), red);
  const bot = new THREE.Mesh(new THREE.SphereGeometry(0.13, 18, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), white);
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.22, 6), red);
  stick.position.y = 0.2;
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.018, 6, 20), new THREE.MeshStandardMaterial({ color: 0x2b2a3a }));
  band.rotation.x = Math.PI / 2;
  bobber.add(top, bot, stick, band);
  bobber.traverse(o => { if (o.isMesh) o.castShadow = true; });
  bobber.scale.setScalar(1.35);
  bobber.visible = false;
  scene.add(bobber);

  // a soft glow so the bobber can be found at night
  const bobGlow = new THREE.PointLight(0xffd59a, 0, 4, 2);
  bobber.add(bobGlow);

  // ---- fishing line ----
  const N = 28;
  const lineGeo = new LineGeometry();
  const linePts = new Float32Array(N * 3);
  lineGeo.setPositions(linePts);
  const lineMat = new LineMaterial({ color: 0xf6f1e4, linewidth: 1.6, transparent: true, opacity: 0.85, worldUnits: false });
  const line = new Line2(lineGeo, lineMat);
  line.frustumCulled = false;
  line.visible = false;
  scene.add(line);

  // ---- aim marker on the water ----
  const marker = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.72, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.0, depthWrite: false }));
  marker.rotation.x = -Math.PI / 2;
  marker.position.y = 0.04;
  marker.renderOrder = 3;
  scene.add(marker);
  const markerDot = new THREE.Mesh(new THREE.CircleGeometry(0.14, 20), marker.material);
  markerDot.rotation.x = -Math.PI / 2; markerDot.position.y = 0.04; markerDot.renderOrder = 3;
  scene.add(markerDot);
  water.hideInMirror.push(marker, markerDot, line);

  // ---- state ----
  const S = {
    mode: 'idle', t: 0, power: 0, pdir: 1, aim: 0, target: new THREE.Vector3(), from: new THREE.Vector3(),
    flight: 0, flightDur: 1, wait: 0, nibbles: [], biteWindow: 0, approacher: null,
    fish: null, cm: 0, tension: 0, progress: 0, run: false, runT: 0, calmT: 0, slackT: 0,
    fishPos: new THREE.Vector3(), hookPos: new THREE.Vector3(), lateral: 0, latTarget: 0, splashT: 0,
    shake: 0, rodPitch: -1.05, rodYaw: 0, landing: null, showFish: null, breach: null, sweet: false,
  };
  const tipW = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const _q = new THREE.Vector3();

  function spotBasis() {
    const s = SPOTS[world.spot];
    const fwd = new THREE.Vector3(-Math.sin(s.yaw), 0, -Math.cos(s.yaw));
    const right = new THREE.Vector3(Math.cos(s.yaw), 0, -Math.sin(s.yaw));
    return { s, fwd, right };
  }

  // where a cast at this power and aim would land, pulled back off any shore
  function targetFor(power, aim) {
    const { s } = spotBasis();
    const yaw = s.yaw - aim * 0.6;
    const dir = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    const max = CAST_RANGE[game.up.rod];
    let d = 4 + power * (max - 4);
    const p = new THREE.Vector3();
    for (; d > 3; d -= 0.5) {
      p.copy(s.pos).addScaledVector(dir, d).setY(0);
      if (depthAt(p.x, p.z) > 0.35) break;
    }
    return { p, d };
  }

  function setLine(from, to, sag) {
    for (let i = 0; i < N; i++) {
      const k = i / (N - 1);
      tmp.lerpVectors(from, to, k);
      tmp.y -= Math.sin(k * Math.PI) * sag;
      if (tmp.y < -0.05 && k < 0.98) tmp.y = Math.max(tmp.y, -0.02);
      linePts[i * 3] = tmp.x; linePts[i * 3 + 1] = tmp.y; linePts[i * 3 + 2] = tmp.z;
    }
    lineGeo.setPositions(linePts);
    line.computeLineDistances();
  }

  function setMode(m) {
    S.mode = m; S.t = 0;
    game.onMode?.(m);
  }

  function releaseApproacher(scare) {
    const a = S.approacher;
    if (!a) return;
    a.free = true;
    if (scare) { a.a = Math.atan2(a.m.position.z - bobber.position.z, a.m.position.x - bobber.position.x); a.sp = 3; a.t = 1.2; setTimeout(() => { a.sp = rr(0.4, 1); }, 1500); }
    S.approacher = null;
  }

  function startWait() {
    const bait = game.up.bait;
    const cond = game.cond();
    const rainy = cond.weather === 'rain' ? 0.8 : 1;
    S.wait = rr(3.2, 8.5) * (1 - 0.13 * bait) * rainy;
    S.nibbles = [];
    const n = Math.random() < 0.7 ? (Math.random() * 3 | 0) : 0;
    for (let i = 0; i < n; i++) S.nibbles.push(S.wait - 0.6 - i * rr(0.6, 1.1));
    // borrow a fish shadow and send it towards the bobber
    const free = world.shadows.filter(s => s.free);
    const sh = free[Math.random() * free.length | 0];
    if (sh) {
      sh.free = false;
      const a = Math.random() * Math.PI * 2;
      sh.m.position.set(bobber.position.x + Math.cos(a) * 5, 0.025, bobber.position.z + Math.sin(a) * 5);
      if (depthAt(sh.m.position.x, sh.m.position.z) < 0.5) sh.m.position.set(bobber.position.x + Math.cos(a) * 2, 0.025, bobber.position.z + Math.sin(a) * 2);
      sh.m.material.opacity = 0;
      S.approacher = sh;
    }
    setMode('wait');
    game.prompt('Wait for a bite… tap to reel in');
  }

  function beginCast() {
    const t = targetFor(S.power, S.aim);
    S.target.copy(t.p);
    tipW.setFromMatrixPosition(tip.matrixWorld);
    S.from.copy(tipW);
    S.flightDur = 0.55 + t.d * 0.025;
    bobber.visible = true; line.visible = true;
    audio.whoosh();
    setMode('flying');
    game.prompt('');
    game.zone(null);
  }

  function hook() {
    const cond = { ...game.cond(), zone: zoneAt(bobber.position.x, bobber.position.z) };
    const fish = pickSpecies(cond, game.up.bait, game.luck());
    S.fish = fish;
    S.cm = rollSize(fish);
    const sizeK = (S.cm - fish.size[0]) / Math.max(1, fish.size[1] - fish.size[0]);
    S.power = clamp(fish.fight * (0.8 + 0.4 * sizeK), 0.05, 1.05);
    S.stamina = 2.6 + fish.rarity * 1.25 + S.power * 4;
    S.tension = 0.35; S.progress = 0.22; S.run = false; S.calmT = rr(0.6, 1.4); S.slackT = 0;
    S.hookPos.copy(bobber.position);
    S.fishPos.copy(bobber.position);
    S.lateral = 0; S.latTarget = rr(-3, 3);
    bobber.visible = false;
    audio.splash(0.9);
    world.burst(bobber.position, { n: 16, speed: 2, up: 3.4 });
    water.ripple(bobber.position.x, bobber.position.z, 1.4);
    S.shake = 0.5;
    game.onHook?.(fish, S.cm);
    setMode('fight');
  }

  function lose(reason) {
    line.visible = false; bobber.visible = false;
    releaseApproacher(true);
    game.onLose?.(reason, S.fish);
    S.fish = null;
    setMode('cooldown');
  }

  function land() {
    // the fish leaps out of the water and into your hands
    const fish = S.fish;
    const obj = A.clone(fish.model, { size: fishDisplaySize(fish, S.cm), axis: 'max', ground: false });
    tint(obj, fish);
    const a = obj.userData.actions;
    const act = a.Out_Of_Water || a.Swimming_Fast || a.Swim || a[fish.anim || ''] || Object.values(a)[0];
    act?.play();
    scene.add(obj);
    S.landing = { obj, a: S.fishPos.clone().setY(-0.3), t: 0 };
    line.visible = false;
    if (S.approacher) { S.approacher.m.material.opacity = 0; releaseApproacher(false); }
    audio.splash(1.3);
    world.burst(S.fishPos, { n: 26, speed: 3, up: 4.5, size: 0.2 });
    water.ripple(S.fishPos.x, S.fishPos.z, 2);
    setMode('landing');
  }

  function fishDisplaySize(fish, cm) { return fish.junk ? 0.45 : Math.min(1.9, 0.35 + cm / 100 * 0.9); }

  function tint(obj, fish) {
    if (!fish.tint && !fish.glow) return;
    obj.traverse(o => {
      if (!o.isMesh) return;
      o.material = o.material.clone();
      if (fish.tint && !/eye/i.test(o.material.name)) o.material.color.lerp(new THREE.Color(fish.tint), 0.65);
      if (fish.glow) { o.material.emissive = new THREE.Color(fish.glow); o.material.emissiveIntensity = /light/i.test(o.material.name) ? 1.6 : 0.18; }
      if (fish.tint && fish.rarity >= 5) { o.material.metalness = 0.6; o.material.roughness = 0.25; }
    });
  }

  // after the catch card is closed
  function finishCatch(released) {
    const L = S.landing;
    if (L) {
      if (released) {
        // hop back into the lake
        const { fwd } = spotBasis();
        const from = L.obj.getWorldPosition(new THREE.Vector3());
        camera.remove(L.obj); scene.add(L.obj); L.obj.position.copy(from);
        S.release = { obj: L.obj, a: from, b: SPOTS[world.spot].pos.clone().addScaledVector(fwd, 4).setY(-0.4), t: 0 };
      } else {
        camera.remove(L.obj);
      }
    }
    S.landing = null; S.fish = null;
    setMode('cooldown');
  }

  function cancel() {
    bobber.visible = false; line.visible = false;
    releaseApproacher(false);
    setMode('idle');
  }

  // ---- per frame ----
  function update(dt, time, input) {
    S.t += dt;
    const reduced = game.reducedMotion;

    // rod pose
    let pitch = -1.05, yaw = -S.aim * 0.35, roll = -0.12;
    const aspect = camera.aspect;
    rodPivot.position.set(clamp(0.36 * aspect, 0.14, 0.62), -0.46, -0.95);

    if (S.mode === 'idle') {
      game.prompt('Hold to cast', false);
      game.zone(null);
      marker.material.opacity = damp(marker.material.opacity, 0, 8, dt);
      if (input.pressed) { setMode('charge'); S.power = 0; S.pdir = 1; audio.click(); }
    }

    if (S.mode === 'charge') {
      S.power += S.pdir * dt * 0.85;
      if (S.power > 1) { S.power = 1; S.pdir = -1; }
      if (S.power < 0) { S.power = 0; S.pdir = 1; }
      S.aim = damp(S.aim, input.aim, 10, dt);
      const t = targetFor(S.power, S.aim);
      marker.position.set(t.p.x, 0.04, t.p.z);
      markerDot.position.copy(marker.position);
      const pulse = 1 + Math.sin(time * 8) * 0.08;
      marker.scale.setScalar(pulse * (1 + S.power * 0.6));
      marker.material.opacity = damp(marker.material.opacity, 0.85, 10, dt);
      const z = zoneAt(t.p.x, t.p.z);
      marker.material.color.set(z === 'deep' ? 0x9fc8ff : z === 'lily' ? 0xffc8e8 : z === 'shallows' ? 0xc8fff0 : 0xffffff);
      game.zone(`${ZONE_NAME[z]} · ${depthAt(t.p.x, t.p.z).toFixed(1)} m deep`);
      game.power(S.power, t.d);
      pitch = -1.05 + S.power * 1.25;
      if (input.released) { game.power(null); beginCast(); }
    } else if (S.mode !== 'charge') game.power(null);

    if (S.mode === 'flying') {
      const k = Math.min(1, S.t / S.flightDur);
      bobber.position.lerpVectors(S.from, S.target, k);
      bobber.position.y = S.from.y * (1 - k) + Math.sin(k * Math.PI) * (2 + S.from.distanceTo(S.target) * 0.18);
      pitch = -1.05 - 0.35 * Math.sin(Math.min(1, S.t / 0.25) * Math.PI);
      marker.material.opacity = damp(marker.material.opacity, 0, 6, dt);
      tipW.setFromMatrixPosition(tip.matrixWorld);
      setLine(tipW, bobber.position, 0.2);
      if (k >= 1) {
        bobber.position.y = 0;
        audio.splash(0.5);
        world.burst(bobber.position, { n: 10, speed: 1.4, up: 2.2, size: 0.12 });
        water.ripple(bobber.position.x, bobber.position.z, 0.9);
        startWait();
      }
    }

    if (S.mode === 'wait' || S.mode === 'bite') {
      tipW.setFromMatrixPosition(tip.matrixWorld);
      let dip = 0;
      S.wait -= dt;
      // the approaching shadow
      const sh = S.approacher;
      if (sh) {
        const toB = tmp.copy(bobber.position).sub(sh.m.position).setY(0);
        const dist = toB.length();
        const want = Math.atan2(toB.z, toB.x) + (dist < 1.6 ? 1.3 : 0.25 * Math.sin(time * 1.5));
        sh.a = want;
        const sp = dist > 1.2 ? 1.1 : 0.4;
        sh.m.position.x += Math.cos(sh.a) * sp * dt; sh.m.position.z += Math.sin(sh.a) * sp * dt;
        sh.m.rotation.z = -sh.a;
        const big = S.mode === 'bite' ? 1.3 : 1;
        sh.m.scale.set(1.2 * big, 1.2 * big, 1);
        sh.m.material.opacity = damp(sh.m.material.opacity, 0.55, 2, dt);
      }
      if (S.mode === 'wait') {
        for (let i = S.nibbles.length - 1; i >= 0; i--) {
          if (S.wait <= S.nibbles[i]) {
            S.nibbles.splice(i, 1);
            S.nibble = 0.3;
            audio.plop();
            water.ripple(bobber.position.x, bobber.position.z, 0.45);
          }
        }
        if (S.nibble > 0) { S.nibble -= dt; dip = Math.sin((0.3 - S.nibble) / 0.3 * Math.PI) * 0.09; }
        if (S.wait <= 0) {
          setMode('bite');
          S.biteWindow = 0.95 + 0.12 * game.up.bait;
          audio.bite(); audio.splash(0.6);
          water.ripple(bobber.position.x, bobber.position.z, 1.3);
          world.burst(bobber.position, { n: 12, speed: 1.6, up: 2.4, size: 0.13 });
          game.prompt('Tap now!', true);
          game.onBite?.();
          S.shake = 0.25;
        } else if (input.pressed) {
          // reeling in early: empty hook, try again
          game.toast(S.nibble > 0 ? 'Too soon! It was only nibbling.' : 'Reeled in.');
          audio.click();
          cancel();
        }
      } else {
        S.biteWindow -= dt;
        dip = 0.2 + Math.sin(time * 30) * 0.03;
        if (input.pressed) hook();
        else if (S.biteWindow <= 0) {
          game.toast('It got away… wait for the next one.');
          game.prompt('');
          releaseApproacher(true);
          startWait();
        }
      }
      if (S.mode === 'wait' || S.mode === 'bite') {
        bobber.position.y = Math.sin(time * 2.1) * 0.025 - dip;
        bobber.rotation.z = Math.sin(time * 1.6) * 0.08;
        bobGlow.intensity = world.state.night * 1.4;
        setLine(tipW, bobber.position, 0.55);
        pitch = -1.0 - dip * 1.5;
      }
    }

    if (S.mode === 'fight') {
      const hold = input.down;
      const p = S.power;
      const lineK = 1 / (1 + 0.22 * game.up.line);
      const reelK = 1 + 0.2 * game.up.reel;
      if (S.run) { S.runT -= dt; if (S.runT <= 0) { S.run = false; S.calmT = rr(1.0, 2.6) * (1.35 - p * 0.6); } }
      else {
        S.calmT -= dt;
        if (S.calmT <= 0) {
          S.run = true; S.runT = rr(0.7, 1.3) * (0.6 + p * 0.8);
          S.latTarget = rr(-4, 4) * (0.5 + p);
          audio.splash(0.6 + p * 0.6);
          S.shake = 0.3 + p * 0.4;
          if (S.cm > 45 && !S.fish.junk && Math.random() < 0.45 && !S.breach) breach();
        }
      }
      if (hold) {
        S.tension += (S.run ? 0.55 + 1.15 * p : 0.15 + 0.12 * p) * lineK * dt;
        S.sweet = S.tension > 0.28 && S.tension < 0.78;
        S.progress += dt / S.stamina * reelK * (S.run ? 0.12 : 1) * (S.sweet ? 1.25 : 0.75);
        if (Math.random() < dt * 14) audio.click();
      } else {
        S.tension -= (S.run ? 0.22 : 0.75) * dt;
        S.sweet = false;
        S.progress -= dt * (S.run ? 0.08 + 0.12 * p : 0.012);
      }
      S.tension = Math.max(0, S.tension);
      if (S.tension < 0.06 && !hold) S.slackT += dt; else S.slackT = 0;
      if (S.tension >= 1) { audio.snap(); lose('snap'); }
      else if (S.progress <= 0 || S.slackT > 3.2) lose('escape');
      else if (S.progress >= 1) land();

      if (S.mode === 'fight') {
        // the fish swims about, pulled closer as you reel
        const { s, fwd, right } = spotBasis();
        S.lateral = damp(S.lateral, S.latTarget, S.run ? 2.4 : 0.8, dt);
        if (!S.run && Math.random() < dt * 0.6) S.latTarget = rr(-2.5, 2.5);
        const near = s.pos.clone().addScaledVector(fwd, 2.6).setY(0);
        const pos = near.lerp(S.hookPos, 1 - S.progress).addScaledVector(right, S.lateral * (1 - S.progress * 0.7));
        if (depthAt(pos.x, pos.z) > 0.25) {
          const sh = S.approacher;
          if (sh) {
            const dx = pos.x - S.fishPos.x, dz = pos.z - S.fishPos.z;
            if (dx * dx + dz * dz > 1e-5) sh.m.rotation.z = -Math.atan2(dz, dx);
            sh.m.position.set(pos.x, 0.025, pos.z);
            const k = 0.8 + Math.min(1.6, S.cm / 60);
            sh.m.scale.set(k * 1.3, k, 1);
            sh.m.material.opacity = damp(sh.m.material.opacity, 0.7, 4, dt);
          }
          S.fishPos.set(pos.x, -0.15, pos.z);
        }
        S.splashT -= dt;
        if (S.splashT <= 0) {
          S.splashT = S.run ? 0.18 : 0.6;
          world.burst(tmp.copy(S.fishPos).setY(0.05), { n: S.run ? 6 : 2, speed: 1.2 + p, up: 1.8 + p * 2, size: 0.1 + p * 0.06 });
          water.ripple(S.fishPos.x, S.fishPos.z, S.run ? 0.9 : 0.4);
        }
        tipW.setFromMatrixPosition(tip.matrixWorld);
        setLine(tipW, S.fishPos, (1 - Math.min(1, S.tension * 1.3)) * 0.7);
        pitch = -0.7 - S.tension * 0.3 + (S.run ? Math.sin(time * 40) * 0.03 : 0);
        const toFish = tmp.copy(S.fishPos).sub(camera.position);
        const localYaw = Math.atan2(-toFish.x, -toFish.z) - s.yaw;
        yaw = clamp(-localYaw * 0.6, -0.5, 0.5);
        roll = -0.12 - S.tension * 0.25;
        if (S.run) S.shake = Math.max(S.shake, 0.08 + p * 0.1);
        game.fight({ tension: S.tension, progress: S.progress, run: S.run, sweet: S.sweet, hold });
      }
    }

    // a big fish breaching mid-fight
    if (S.breach) {
      const B = S.breach;
      B.t += dt;
      const k = B.t / 0.8;
      B.obj.userData.mixer?.update(dt);
      B.obj.position.copy(S.fishPos).setY(Math.sin(Math.min(1, k) * Math.PI) * B.h - 0.3);
      if (Math.random() < dt * 30) world.burst(B.obj.position, { n: 2, speed: 0.6, up: 0.5, size: 0.1, life: 0.5 });
      B.obj.rotation.x = (0.5 - k) * 2.2;
      if (k >= 1) { scene.remove(B.obj); S.breach = null; audio.splash(1.4); world.burst(S.fishPos, { n: 22, speed: 3, up: 4 }); water.ripple(S.fishPos.x, S.fishPos.z, 2); }
    }

    if (S.mode === 'landing') {
      const L = S.landing;
      L.t += dt;
      const k = Math.min(1, L.t / 0.75);
      L.obj.userData.mixer?.update(dt);
      const end = camera.localToWorld(_q.set(0, -0.12, -1.6));
      L.obj.position.lerpVectors(L.a, end, k);
      L.obj.position.y += Math.sin(k * Math.PI) * 1.6;
      L.obj.rotation.set(0, SPOTS[world.spot].yaw + Math.PI / 2 + k * Math.PI * 2, (1 - k) * 1.5);
      if (k >= 1 && !L.shown) {
        L.shown = true;
        // keep the fish floating in front of the camera behind the card
        scene.remove(L.obj); camera.add(L.obj);
        L.obj.position.set(0, -0.12, -1.6); L.obj.rotation.set(0, Math.PI / 2, 0);
        L.obj.visible = false;
        game.onCatch?.(S.fish, S.cm);
      }
      pitch = -1.2;
    }

    if (S.release) {
      const R = S.release;
      R.t += dt;
      const k = Math.min(1, R.t / 0.7);
      R.obj.userData.mixer?.update(dt);
      R.obj.position.lerpVectors(R.a, R.b, k);
      R.obj.position.y += Math.sin(k * Math.PI) * 1.2;
      R.obj.rotation.z = -k * 2;
      if (k >= 1) {
        scene.remove(R.obj);
        audio.splash(0.8); world.burst(R.b.clone().setY(0), { n: 14 }); water.ripple(R.b.x, R.b.z, 1.2);
        S.release = null;
      }
    }

    if (S.mode === 'cooldown') {
      game.prompt('');
      if (S.t > 0.7) setMode('idle');
    }

    // smooth rod motion and a touch of camera shake
    S.rodPitch = damp(S.rodPitch, pitch, S.mode === 'flying' ? 22 : 9, dt);
    S.rodYaw = damp(S.rodYaw, yaw, 6, dt);
    rodPivot.rotation.set(S.rodPitch, S.rodYaw, roll, 'YXZ');
    S.shake = Math.max(0, S.shake - dt * 1.6);
    const sh = reduced ? 0 : S.shake * 0.02;
    const s = SPOTS[world.spot];
    const lookYaw = s.yaw + (S.mode === 'fight' ? -yaw * 0.25 : -S.aim * 0.12);
    camera.rotation.set(-0.07 + Math.sin(time * 0.5) * 0.004 + (Math.random() - 0.5) * sh, damp(camera.rotation.y, lookYaw, 3, dt) + (Math.random() - 0.5) * sh, 0, 'YXZ');
    camera.position.y = s.pos.y + (world.spot === 'boat' ? Math.sin(time * 1.1) * 0.05 : 0);
    if (world.spot === 'boat') camera.rotation.z = Math.sin(time * 0.9) * 0.012;

    // the cat watches the bobber
    // half watching the water, half watching you, so you see its face
    const cat = world.cat;
    const look = S.mode === 'fight' ? S.fishPos : bobber.visible ? bobber.position : null;
    const dc = tmp.copy(camera.position).sub(cat.position);
    const toYou = Math.atan2(dc.x, dc.z);
    let want = toYou + 0.6;
    if (look) {
      const d = _q.copy(look).sub(cat.position);
      const toFish = Math.atan2(d.x, d.z);
      let mix = Math.atan2(Math.sin(toYou - toFish), Math.cos(toYou - toFish));
      want = toFish + mix * (S.mode === 'fight' ? 0.35 : 0.62);
    }
    let diff = want - cat.rotation.y; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    cat.rotation.y += diff * Math.min(1, dt * 2.5);
    lineMat.resolution.set(innerWidth, innerHeight);
  }

  function breach() {
    const f = S.fish;
    const obj = A.clone(f.model, { size: fishDisplaySize(f, S.cm) * 1.6, axis: 'max', ground: false });
    tint(obj, f);
    const a = obj.userData.actions;
    (a.Swimming_Fast || a.Swim_Fast || a.Swim || Object.values(a)[0])?.play();
    // side-on to the camera so you see the whole fish
    obj.rotation.order = 'YXZ';
    obj.rotation.y = SPOTS[world.spot].yaw + (Math.random() < 0.5 ? 1 : -1) * Math.PI / 2;
    scene.add(obj);
    S.breach = { obj, t: 0, h: 1.1 + S.power * 1.2 };
    audio.splash(1.2);
    world.burst(S.fishPos, { n: 20, speed: 2.5, up: 4 });
  }

  // ambient leaping fish elsewhere on the lake
  world.hooks.spawnJumper = () => {
    const { s, fwd, right } = spotBasis();
    const pool = ['goldfish', 'fish-a', 'fish-b', 'koi', 'tuna', 'mackerel', 'tetra', 'fish-c'];
    for (let t = 0; t < 10; t++) {
      const p = s.pos.clone().addScaledVector(fwd, rr(10, 40)).addScaledVector(right, rr(-18, 18)).setY(0);
      if (depthAt(p.x, p.z) < 1) continue;
      const name = pool[Math.random() * pool.length | 0];
      const obj = A.clone(name, { size: rr(0.4, 0.8), axis: 'max', ground: false });
      const acts = obj.userData.actions;
      (acts.Swimming_Fast || acts.Swim || Object.values(acts)[0])?.play();
      const dir = Math.random() < 0.5 ? -1 : 1;
      const b = p.clone().addScaledVector(right, dir * rr(1.2, 2.2));
      obj.rotation.y = Math.atan2(-(b.x - p.x), -(b.z - p.z)) + Math.PI / 2;
      scene.add(obj);
      world.jumpers.push({ obj, a: p, b, t: 0, dur: 0.75, h: rr(0.7, 1.3), dir });
      audio.splash(0.5);
      world.burst(p.clone().setY(0.05), { n: 10, speed: 1.4, up: 2.6, size: 0.12 });
      water.ripple(p.x, p.z, 1);
      break;
    }
  };
  world.hooks.onJumpEnd = (p) => {
    world.burst(p.clone().setY(0.05), { n: 10, speed: 1.4, up: 2.4, size: 0.12 });
    water.ripple(p.x, p.z, 0.9);
  };

  return {
    S, update, finishCatch, cancel, tint, fishDisplaySize,
    get busy() { return S.mode !== 'idle'; },
    get landingObj() { return S.landing?.obj; },
  };
}
