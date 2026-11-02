import * as THREE from 'three';
import { World, LEVELS, LANES, LANE_W, laneX, HALF_W, WING_X, BOARD_X, glowTex, fireTex, tex } from './world.js';
import { Character } from './characters.js';
import { Sfx } from './audio.js';
import { Save, SKINS } from './save.js';

const clamp = THREE.MathUtils.clamp, lerp = THREE.MathUtils.lerp;
const PLAYER_SPEED = 7.2, PLAYER_R = 0.45;
const COMET_ON = 70, COMET_OFF = 35;

export class Game {
  constructor(renderer, input, ui) {
    this.renderer = renderer; this.input = input; this.ui = ui;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 600);
    this.state = 'idle';
    this.clock = new THREE.Clock();
    this.tmp = new THREE.Vector3();
    this._buildBall();
    this._buildSnow();
    this._buildFire();
    this._buildConfetti();
    this.cam = new Character('cam'); this.scene.add(this.cam.root);
    this.mia = new Character('mia'); this.scene.add(this.mia.root);
    this.keeper = new Character('keeper'); this.scene.add(this.keeper.root);
    this.defenders = [];
    this.ready = Promise.all([this.cam.ready, this.mia.ready, this.keeper.ready]);
    window.addEventListener('resize', () => this.resize());
    this.resize();
    this._idleScene();
  }
  resize() {
    this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight, false);
  }

  // ---------- builders ----------
  _buildBall() {
    const geo = new THREE.SphereGeometry(0.23, 20, 16);
    this.ballMats = {
      classic: new THREE.MeshStandardMaterial({ map: tex('assets/textures/ball_leather.jpg'), roughness: 0.6 }),
      bauble: new THREE.MeshStandardMaterial({ color: 0xd62828, roughness: 0.15, metalness: 0.5, emissive: 0x3a0000 }),
      snow: new THREE.MeshStandardMaterial({ color: 0xf8fbff, roughness: 1.0 }),
      gold: new THREE.MeshStandardMaterial({ color: 0xffc83d, roughness: 0.2, metalness: 0.9, emissive: 0x3a2a00 }),
      comet: new THREE.MeshStandardMaterial({ color: 0xff8800, roughness: 0.3, emissive: 0xff4400, emissiveIntensity: 1.2 }),
    };
    this.ball = new THREE.Mesh(geo, this.ballMats.classic); this.ball.castShadow = true; this.scene.add(this.ball);
    this.ballLight = new THREE.PointLight(0xff7a00, 0, 9, 2); this.scene.add(this.ballLight);
    this.ballGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: fireTex, color: 0xffa040, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }));
    this.ballGlow.scale.set(2.2, 2.2, 1); this.scene.add(this.ballGlow);
    this.ballVel = new THREE.Vector3(); this.ballFree = false; this.ballAway = false;
  }
  _buildSnow() {
    const n = 700; const pos = new Float32Array(n * 3); this.snowV = new Float32Array(n);
    for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - 0.5) * 50; pos[i * 3 + 1] = Math.random() * 25; pos[i * 3 + 2] = (Math.random() - 0.5) * 50; this.snowV[i] = 1 + Math.random() * 1.5; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.snow = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.35, map: glowTex, transparent: true, depthWrite: false, opacity: 0.8, color: 0xffffff }));
    this.scene.add(this.snow);
  }
  _buildFire() {
    const n = 160; this.fireN = n; const pos = new Float32Array(n * 3); this.fireLife = new Float32Array(n); this.fireVel = new Float32Array(n * 3);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.fire = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.9, map: fireTex, color: 0xff9a2a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.95 }));
    this.fire.visible = false; this.scene.add(this.fire);
  }
  _buildConfetti() {
    const n = 400; this.confN = n; const pos = new Float32Array(n * 3); const col = new Float32Array(n * 3); this.confVel = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const c = new THREE.Color().setHSL(Math.random(), 0.9, 0.6); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.confetti = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.3, vertexColors: true, transparent: true, depthWrite: false }));
    this.confetti.visible = false; this.scene.add(this.confetti);
  }
  _idleScene() {
    // Title backdrop: London stadium with Cam idle at the centre spot.
    if (!this.world) { this.world = new World(this.scene, 0, 1); this._placeIdle(); }
  }
  _placeIdle() {
    this.cam.position.set(0, 0, 2); this.cam.setHeading(0, 1);
    this.mia.position.set(WING_X, 0, 6); this.mia.setHeading(0, 1);
    this.keeper.position.set(0, 0, this.world.L - 1); this.keeper.setHeading(0, -1);
    this.ball.position.set(0.1, 0.23, 2.9);
    this.camera.position.set(-4, 2.2, -4); this.camera.lookAt(0, 1, 6);
  }

  // ---------- level lifecycle ----------
  startLevel(index) {
    this.levelIndex = index; this.level = LEVELS[index];
    if (this.world) this.world.dispose();
    for (const d of this.defenders) this.scene.remove(d.ch.root);
    this.defenders = [];
    this.world = new World(this.scene, index, 1234 + index * 977 + Math.floor(Math.random() * 9999));
    this.L = this.world.L;
    this.lives = 3; this.coins = 0; this.heat = 0; this.comet = false; this.tricks = 0; this.time = 0; this.livesLost = 0;
    this.passCooldown = 0; this.trickCooldown = 0; this.dash = 0; this.invuln = 0; this.stun = 0;
    this.skin = Save.get().skin; this.ball.material = this.ballMats[this.skin] || this.ballMats.classic;
    this.cam.position.set(0, 0, 0); this.cam.setHeading(0, 1); this.cam.setDown(0);
    this.mia.position.set(WING_X, 0, 5); this.mia.setHeading(0, 1);
    this.keeper.position.set(0, 0, this.L - 1.2); this.keeper.setHeading(0, -1); this.keeper.setDown(0);
    this.ball.position.set(0, 0.23, 0.8); this.ballVel.set(0, 0, 0); this.ballFree = false; this.ballAway = false;
    this.heading = new THREE.Vector3(0, 0, 1);
    for (const s of this.world.defenderSpawns) this._spawnDefender(s);
    this.shoot = null; this.state = 'play';
    this.camera.position.set(0, 5, -8);
    this.ui.setLevel(index); this.ui.lives(this.lives); this.ui.coins(this.coins); this.ui.heat(0, false);
    this.ui.tip(`Dribble to the ${this.level.stadium} goal. Watch for red lanes!`, 3500);
    Sfx.whistle(); Sfx.crowd(0.08);
  }
  _spawnDefender(s) {
    const ch = new Character(s.kind); ch.position.set(s.x, 0, s.z); ch.setHeading(0, -1); this.scene.add(ch.root);
    const flash = new THREE.Mesh(new THREE.PlaneGeometry(LANE_W - 0.25, 12), new THREE.MeshBasicMaterial({ color: 0xff2020, transparent: true, opacity: 0, depthWrite: false }));
    flash.rotation.x = -Math.PI / 2; flash.position.set(s.x, 0.02, s.z - 6); this.scene.add(flash);
    this.defenders.push({ ch, kind: s.kind, lane: s.lane, homeX: s.x, homeZ: s.z, state: 'patrol', t: 0, flash, dir: Math.random() < 0.5 ? -1 : 1, speed: s.kind === 'elf' ? 3.2 : 1.6, slideZ: 0 });
  }
  quit() {
    this.state = 'idle';
    for (const d of this.defenders) { this.scene.remove(d.ch.root); this.scene.remove(d.flash); }
    this.defenders = [];
    if (this.world) this.world.dispose(); this.world = new World(this.scene, 0, 1); this._placeIdle();
    this.fire.visible = false; this.ballLight.intensity = 0; this.ballGlow.material.opacity = 0; this.confetti.visible = false;
    Sfx.crowd(0.03);
  }
  pause(p) { if (this.state === 'play' || this.state === 'shoot' || this.state === 'approach') this.paused = p; }

  // ---------- helpers ----------
  _toast(txt, ms = 900) { this.ui.toast(txt, ms); }
  _addHeat(n) {
    const mult = this.skin === 'comet' ? 1 : 1;
    this.heat = clamp(this.heat + n * mult, 0, 100);
    if (!this.comet && this.heat >= COMET_ON) { this.comet = true; Sfx.ignite(); this._toast('🔥 FLAMING COMET!', 1200); }
  }
  _collideObstacles(p, r) {
    for (const o of this.world.obstacles) {
      const dx = p.x - o.x, dz = p.z - o.z;
      const px = o.hw + r - Math.abs(dx), pz = o.hd + r - Math.abs(dz);
      if (px > 0 && pz > 0) { if (px < pz) p.x += Math.sign(dx || 1) * px; else p.z += Math.sign(dz || 1) * pz; }
    }
    p.x = clamp(p.x, -BOARD_X + 0.6, BOARD_X - 0.6);
    p.z = Math.max(p.z, -6);
  }
  _loseLife(reason) {
    this.lives--; this.livesLost++; this.ui.lives(this.lives); Sfx.tackle();
    this.heat = Math.max(0, this.heat - 40); if (this.heat < COMET_OFF) this.comet = false;
    this._toast(reason, 1100);
    if (this.lives <= 0) { this.state = 'over'; Sfx.lose(); setTimeout(() => this.ui.showResult(false, this), 1200); return; }
    this.invuln = 2.0; this.stun = 0.9; this.ballFree = false; this.ballAway = false;
  }

  // ---------- main update ----------
  update() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    if (this.paused) { this.renderer.render(this.scene, this.camera); return; }
    const t = performance.now() / 1000;
    this._updateSnow(dt);
    if (this.state === 'idle') { this._updateIdle(t, dt); }
    else if (this.state === 'play') { this.time += dt; this._updatePlay(dt, t); }
    else if (this.state === 'approach') { this.time += dt; this._updateApproach(dt, t); }
    else if (this.state === 'shoot') { this.time += dt; this._updateShoot(dt, t); }
    else if (this.state === 'goal' || this.state === 'over') { this._updateAfter(dt, t); }
    this._updateBallFx(dt, t);
    if (this.world && this.world.sun) { const s = this.world.sun; s.position.set(this.cam.position.x + 25, 45, this.cam.position.z - 20); s.target.position.copy(this.cam.position); s.target.updateMatrixWorld(); }
    this.renderer.render(this.scene, this.camera);
  }
  _updateIdle(t, dt) {
    this.cam.update(dt, 0); this.mia.update(dt, 0); this.keeper.update(dt, 0);
    this.camera.position.set(Math.sin(t * 0.15) * 5, 2.4, -4 + Math.cos(t * 0.15) * 2); this.camera.lookAt(0, 1.0, 6);
    this.ball.rotation.y += dt * 0.5;
  }
  _updateSnow(dt) {
    const p = this.snow.geometry.attributes.position.array; const c = this.camera.position;
    for (let i = 0; i < this.snowV.length; i++) {
      p[i * 3 + 1] -= this.snowV[i] * dt; p[i * 3] += Math.sin(p[i * 3 + 1] + i) * dt * 0.3;
      if (p[i * 3 + 1] < 0) { p[i * 3 + 1] = 25; p[i * 3] = c.x + (Math.random() - 0.5) * 50; p[i * 3 + 2] = c.z + (Math.random() - 0.3) * 50; }
    }
    this.snow.geometry.attributes.position.needsUpdate = true;
  }
  _updatePlay(dt, t) {
    const inp = this.input;
    const mv = inp.poll();
    const P = this.cam.position;
    if (this.invuln > 0) this.invuln -= dt; if (this.stun > 0) this.stun -= dt; if (this.passCooldown > 0) this.passCooldown -= dt; if (this.trickCooldown > 0) this.trickCooldown -= dt; if (this.dash > 0) this.dash -= dt;
    this.ui.cool('btn-pass', this.passCooldown > 0); this.ui.cool('btn-trick', this.trickCooldown > 0);
    // movement
    let speed = 0;
    if (this.stun <= 0) {
      const len = Math.hypot(mv.x, mv.y);
      if (len > 0.1) {
        const dx = mv.x / Math.max(len, 1), dz = mv.y / Math.max(len, 1);
        const sp = PLAYER_SPEED * (this.dash > 0 ? 1.7 : 1) * (this.comet ? 1.08 : 1);
        P.x += dx * sp * dt; P.z += dz * sp * dt; speed = sp * Math.min(len, 1);
        this.heading.set(dx, 0, dz).normalize(); this.cam.setHeading(dx, dz);
      } else if (this.dash > 0) { P.addScaledVector(this.heading, PLAYER_SPEED * 1.7 * dt); speed = PLAYER_SPEED * 1.7; }
    }
    this._collideObstacles(P, PLAYER_R);
    this.cam.update(dt, speed);
    this.cam.setDown(this.stun > 0 ? Math.min(1, this.stun * 2) : 0, true);
    this.cam.tilt.rotation.z = this.dash > 0 ? Math.sin(t * 25) * 0.15 : 0;
    // ball
    this._updateBall(dt, speed);
    // tricks
    if (inp.consume('trick') && this.stun <= 0 && this.trickCooldown <= 0 && !this.ballAway) this._doTrick();
    if (inp.consume('pass') && this.stun <= 0 && this.passCooldown <= 0 && !this.ballAway && !this.ballFree) this._doPass();
    // teammate on the wing
    const M = this.mia.position; const mz = P.z + 5.5; M.z = lerp(M.z, mz, 1 - Math.pow(0.001, dt)); M.x = lerp(M.x, WING_X, 1 - Math.pow(0.01, dt));
    this.mia.update(dt, Math.abs(mz - M.z) > 0.3 ? 6 : 0.0); this.mia.setHeading(0, 1);
    this.keeper.update(dt, 0.0);
    // defenders
    this._updateDefenders(dt, t);
    // coins
    for (const c of this.world.coins) {
      if (c.taken) continue; c.mesh.rotation.y += dt * 3;
      if (Math.abs(c.x - P.x) < 1.0 && Math.abs(c.z - P.z) < 1.0) { c.taken = true; c.mesh.visible = false; this.coins += c.value; this.ui.coins(this.coins); c.value > 1 ? Sfx.star() : Sfx.coin(); this._addHeat(c.value > 1 ? 10 : 2); }
    }
    // heat decay
    const decay = (this.skin === 'comet' ? 2 : 4) * (this.comet ? 1.4 : 1);
    this.heat = Math.max(0, this.heat - decay * dt);
    if (this.comet && this.heat < COMET_OFF) this.comet = false;
    this.ui.heat(this.heat, this.comet);
    this.ui.time(this.time);
    inp.consume('tap');
    // enter the box
    if (P.z > this.L - 15 && !this.ballFree && !this.ballAway) this._enterShoot();
    // camera
    this._followCamera(dt, 5.6, -9, 0.9, 11);
  }
  _updateBall(dt, speed) {
    const B = this.ball.position, P = this.cam.position;
    if (this.ballAway) return; // handled by pass animation
    if (!this.ballFree) {
      const target = this.tmp.copy(P).addScaledVector(this.heading, 0.75); target.y = 0.23;
      B.lerp(target, 1 - Math.pow(0.0005, dt));
      this.ball.rotation.x += speed * dt / 0.23; this.ball.rotation.y = this.cam.root.rotation.y;
      if (speed > 0.5 && Math.random() < dt * 4) Sfx.touch();
    } else {
      B.addScaledVector(this.ballVel, dt); this.ballVel.multiplyScalar(Math.pow(0.4, dt));
      if (B.y > 0.23) { this.ballVel.y -= 20 * dt; } else { B.y = 0.23; if (this.ballVel.y < 0) this.ballVel.y *= -0.4; }
      this._collideObstacles(B, 0.23);
      this.ball.rotation.x += this.ballVel.length() * dt / 0.23;
      if (B.distanceTo(P) < 1.1 && this.stun <= 0) { this.ballFree = false; Sfx.touch(); }
    }
  }
  _doTrick() {
    const P = this.cam.position; let best = null, bestD = 3.2;
    for (const d of this.defenders) {
      if (d.state === 'down' || d.state === 'ko' || d.state === 'stunned') continue;
      const dx = d.ch.position.x - P.x, dz = d.ch.position.z - P.z; const dist = Math.hypot(dx, dz);
      if (dist < bestD) { const dot = (dx * this.heading.x + dz * this.heading.z) / Math.max(dist, 0.01); if (dot > 0.55) { best = d; bestD = dist; } }
    }
    this.trickCooldown = 0.9;
    if (best) { // NUTMEG
      best.state = 'stunned'; best.t = 1.4; best.flash.material.opacity = 0; best.ch.setDown(0);
      this.dash = 0.45; this.invuln = Math.max(this.invuln, 0.7); this.tricks++; this.coins += 2; this.ui.coins(this.coins);
      this._addHeat(30); Sfx.nutmeg(); this._toast('NUTMEG! 🥜', 800);
    } else { this.dash = 0.32; this._addHeat(6); Sfx.trick(); this.tricks += 0; }
  }
  _doPass() {
    this.ballAway = true; this.passCooldown = 2.8; this.tricks++; Sfx.pass();
    const start = this.ball.position.clone(); const toM = this.mia.position.clone(); toM.y = 0.23; toM.z += 0.4;
    const t0 = performance.now();
    const step = () => {
      const k = Math.min(1, (performance.now() - t0) / 420);
      this.ball.position.lerpVectors(start, toM, k); this.ball.position.y = 0.23 + Math.sin(k * Math.PI) * 0.8; this.ball.rotation.x += 0.4;
      if (k < 1 && this.state === 'play') requestAnimationFrame(step); else this._returnPass();
    };
    step();
  }
  _returnPass() {
    if (this.state !== 'play') { this.ballAway = false; return; }
    Sfx.pass(); this._addHeat(25); this._toast('ONE-TWO! 🤝', 700);
    const start = this.ball.position.clone(); const t0 = performance.now();
    const step = () => {
      const k = Math.min(1, (performance.now() - t0) / 380);
      const dest = this.tmp.copy(this.cam.position).addScaledVector(this.heading, 3.0); dest.y = 0.23; dest.x = clamp(dest.x, -HALF_W + 0.5, HALF_W + 1.5);
      this.ball.position.lerpVectors(start, dest, k); this.ball.position.y = 0.23 + Math.sin(k * Math.PI) * 1.0; this.ball.rotation.x += 0.4;
      if (k < 1 && this.state === 'play') requestAnimationFrame(step); else { this.ballAway = false; this.ballFree = false; }
    };
    step();
  }
  _updateDefenders(dt, t) {
    const P = this.cam.position; const hasBall = !this.ballFree && !this.ballAway;
    for (const d of this.defenders) {
      const D = d.ch.position; d.t -= dt;
      const dx = P.x - D.x, dz = P.z - D.z;
      if (Math.abs(dz) > 60) { d.flash.material.opacity = 0; continue; } // far away: sleep
      let moving = 0;
      switch (d.state) {
        case 'patrol': {
          // shuffle sideways, elves drift toward the player
          let vx = d.dir * d.speed * 0.5;
          if (d.kind === 'elf' && Math.abs(dz) < 14) vx += Math.sign(dx) * d.speed * 0.6;
          D.x += vx * dt; moving = Math.abs(vx);
          if (D.x > HALF_W - 0.8) { D.x = HALF_W - 0.8; d.dir = -1; } if (D.x < -HALF_W + 0.8) { D.x = -HALF_W + 0.8; d.dir = 1; }
          if (Math.random() < dt * 0.3) d.dir *= -1;
          // zombies shamble toward you when close
          if (d.kind === 'zombie' && dz < 0 && dz > -10 && Math.abs(dx) < 4) { D.z -= d.speed * 0.6 * dt; moving += d.speed * 0.6; }
          d.ch.setHeading(dx, dz);
          d.ch.setDown(0);
          // telegraph a slide when the player is ahead in the same lane
          const laneHit = Math.abs(dx) < LANE_W * 0.55;
          if (hasBall && dz < -2 && dz > -12 && laneHit && d.t <= 0 && this.stun <= 0) { d.state = 'telegraph'; d.t = d.kind === 'elf' ? 0.55 : 0.8; d.slideX = D.x; d.flash.position.set(D.x, 0.02, D.z - 6); }
          break; }
        case 'telegraph': {
          d.flash.material.opacity = 0.35 + 0.3 * Math.sin(t * 30);
          d.ch.setHeading(0, -1);
          if (d.t <= 0) { d.state = 'slide'; d.t = 0.75; d.slideZ = D.z; }
          break; }
        case 'slide': {
          d.flash.material.opacity = 0.55;
          D.z -= 16 * dt; moving = 0; d.ch.setDown(Math.min(1, (0.75 - d.t) * 4), true); d.ch.setHeading(0, -1);
          if (hasBall && Math.abs(D.x - P.x) < 1.25 && Math.abs(D.z - P.z) < 1.2 && this.invuln <= 0) {
            if (this.comet) this._ko(d, 'COMET SMASH! 💥'); else { this._loseLife('TACKLED!'); d.state = 'down'; d.t = 1.5; }
          }
          if (d.t <= 0 || D.z < d.slideZ - 12) { d.state = 'down'; d.t = 1.6; d.flash.material.opacity = 0; }
          break; }
        case 'down': {
          d.flash.material.opacity = 0; d.ch.setDown(1, true);
          if (d.t <= 0) { d.state = 'patrol'; d.t = 1.2 + Math.random(); d.ch.setDown(0); D.z = Math.min(D.z + 0.0, d.homeZ); }
          break; }
        case 'stunned': {
          d.ch.tilt.rotation.y = Math.sin(t * 20) * 0.3;
          if (d.t <= 0) { d.state = 'patrol'; d.t = 0.8; d.ch.tilt.rotation.y = 0; }
          break; }
        case 'ko': {
          d.ch.setDown(1, false); D.y = Math.max(0, D.y - 4 * dt);
          if (d.t <= 0) { d.state = 'patrol'; d.t = 2; d.ch.setDown(0); D.y = 0; }
          break; }
      }
      d.ch.update(dt, d.state === 'patrol' ? Math.max(moving, 0.6) : 0);
      // body contact
      if ((d.state === 'patrol' || d.state === 'telegraph') && hasBall && Math.hypot(dx, dz) < 0.95 && this.invuln <= 0 && this.stun <= 0) {
        if (this.comet) this._ko(d, 'COMET SMASH! 💥'); else this._loseLife(d.kind === 'elf' ? 'ELF ROBBED YOU!' : 'ZOMBIE TACKLE!');
      }
    }
  }
  _ko(d, msg) {
    d.state = 'ko'; d.t = 2.2; d.flash.material.opacity = 0; d.ch.position.y = 1.2; Sfx.ko(); this._toast(msg, 800);
    this.coins += 5; this.ui.coins(this.coins); this.tricks++;
  }
  _followCamera(dt, up, back, lookUp, lookAhead) {
    const P = this.cam.position; const k = 1 - Math.pow(0.02, dt);
    const dest = this.tmp.set(P.x * 0.7, up, P.z + back);
    this.camera.position.lerp(dest, k);
    this._look = this._look || new THREE.Vector3(); this._look.lerp(new THREE.Vector3(P.x * 0.7, lookUp, P.z + lookAhead), k);
    this.camera.lookAt(this._look);
  }

  // ---------- shooting minigame ----------
  _enterShoot() {
    this.state = 'approach'; Sfx.whistle(); Sfx.crowd(0.2);
    this.cam.setHeading(0, 1); this.heading.set(0, 0, 1); this.input.consume('tap');
    this.ui.tip('Into the box! Line up the shot…', 1500);
    for (const d of this.defenders) d.flash.material.opacity = 0;
  }
  _updateApproach(dt, t) {
    const P = this.cam.position; const tx = clamp(P.x, -3, 3) * 0.6, tz = this.L - 11;
    const dx = tx - P.x, dz = tz - P.z; const dist = Math.hypot(dx, dz);
    const step = Math.min(dist, PLAYER_SPEED * dt);
    if (dist > 0.05) { P.x += dx / dist * step; P.z += dz / dist * step; this.heading.set(dx, 0, dz).normalize(); this.cam.setHeading(dx, dz); }
    this.cam.update(dt, dist > 0.05 ? PLAYER_SPEED : 0); this.cam.setDown(0);
    this._updateBall(dt, PLAYER_SPEED); this.mia.update(dt, 0); this.keeper.update(dt, 0);
    this._followCamera(dt, 4.5, -7.5, 1.0, 11);
    this.input.consume('tap'); this.input.consume('trick'); this.input.consume('pass');
    if (dist <= 0.05) this._beginShoot();
  }
  _beginShoot() {
    this.state = 'shoot';
    const P = this.cam.position; this.cam.setHeading(0, 1); this.heading.set(0, 0, 1);
    this.ball.position.set(P.x, 0.23, P.z + 0.8);
    const lvl = this.level;
    this.shoot = { t: 0, ringSpeed: lvl.ring, keeperSpeed: lvl.keeper, reach: lvl.reach, phase: Math.random() * 6, fired: false, result: null, attempts: 0 };
    if (!this.ring) {
      this.ring = new THREE.Group();
      const r1 = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.72, 28), new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthTest: false }));
      const r2 = new THREE.Mesh(new THREE.CircleGeometry(0.16, 16), new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthTest: false }));
      r1.renderOrder = r2.renderOrder = 10; this.ring.add(r1); this.ring.add(r2); this.scene.add(this.ring);
      this.reachZone = new THREE.Mesh(new THREE.PlaneGeometry(1, 2.3), new THREE.MeshBasicMaterial({ color: 0xff3030, transparent: true, opacity: 0.25, depthWrite: false, side: THREE.DoubleSide }));
      this.scene.add(this.reachZone);
    }
    this.ring.visible = true; this.reachZone.visible = true;
    this.ui.shootMode(true); this.ui.tip('', 0); this.input.consume('tap');
  }
  _updateShoot(dt, t) {
    const s = this.shoot; s.t += dt; const L = this.L;
    const reach = s.reach * (this.comet ? 0.6 : 1);
    // keeper patrols + dives
    const kx = Math.sin(s.t * s.keeperSpeed + s.phase) * 2.6;
    const K = this.keeper.position; if (!s.fired) { K.x = kx; K.z = L - 1.2; }
    this.keeper.setHeading(0, -1); this.keeper.update(dt, 0); this.keeper.tilt.rotation.z = s.fired ? 0 : Math.cos(s.t * s.keeperSpeed + s.phase) * 0.35;
    this.reachZone.position.set(K.x, 1.15, L - 0.4); this.reachZone.scale.x = reach * 2;
    // target ring sweeps the goal mouth
    const rx = Math.sin(s.t * s.ringSpeed * 1.3) * 3.3; const ry = 0.7 + (Math.sin(s.t * s.ringSpeed * 0.7 + 1) * 0.5 + 0.5) * 1.3;
    if (!s.fired) this.ring.position.set(rx, ry, L - 0.3);
    this.cam.update(dt, 0); this.cam.setDown(0);
    // camera: low behind the player, looking at the goal
    const P = this.cam.position; const k = 1 - Math.pow(0.02, dt);
    this.camera.position.lerp(this.tmp.set(P.x + 2.4, 2.6, P.z - 3.4), k);
    this._look = this._look || new THREE.Vector3(); this._look.lerp(new THREE.Vector3(P.x * 0.3, 1.4, L), k); this.camera.lookAt(this._look);
    this.ring.scale.setScalar(1 + Math.sin(t * 8) * 0.08);
    this.heat = Math.max(0, this.heat - dt * 1.5); this.ui.heat(this.heat, this.comet); this.ui.time(this.time);
    if (!s.fired && this.input.consume('tap')) this._fire(rx, ry, reach);
    this.input.consume('trick'); this.input.consume('pass');
    if (s.fired) this._animateShot(dt);
  }
  _fire(rx, ry, reach) {
    const s = this.shoot; s.fired = true; s.attempts++; Sfx.kick();
    const kx = this.keeper.position.x;
    const saved = Math.abs(rx - kx) < reach;
    s.result = saved ? 'saved' : 'goal'; s.from = this.ball.position.clone(); s.to = new THREE.Vector3(rx, ry, this.L + (saved ? -0.6 : 1.4)); s.anim = 0;
    s.keeperTo = saved ? rx : (Math.abs(rx - kx) < reach + 1.3 ? rx + Math.sign(kx - rx) * 1.2 : kx);
    this.ring.visible = false; this.ui.shootMode(false); this.dash = 0;
    this.ui.tip('', 0);
  }
  _animateShot(dt) {
    const s = this.shoot; s.anim += dt; const k = Math.min(1, s.anim / 0.55);
    this.ball.position.lerpVectors(s.from, s.to, k); this.ball.position.y = s.from.y + (s.to.y - s.from.y) * k + Math.sin(k * Math.PI) * 0.6;
    this.ball.rotation.x += dt * 30;
    const K = this.keeper.position; K.x = lerp(K.x, s.keeperTo, 1 - Math.pow(0.001, dt));
    this.keeper.tilt.rotation.z = Math.sign(s.keeperTo - s.from.x || 1) * Math.min(1.2, s.anim * 3);
    this.keeper.tilt.position.y = Math.sin(Math.min(1, s.anim * 2) * Math.PI) * 0.8;
    if (k >= 1 && !s.done) {
      s.done = true;
      if (s.result === 'goal') this._goal(); else this._saved();
    }
  }
  _goal() {
    this.state = 'goal'; Sfx.goal(); Sfx.crowd(0.5); this._toast('⚽ GOOOAL!', 2200);
    this.confetti.visible = true; const p = this.confetti.geometry.attributes.position.array;
    for (let i = 0; i < this.confN; i++) { p[i * 3] = (Math.random() - 0.5) * 10; p[i * 3 + 1] = 2 + Math.random() * 4; p[i * 3 + 2] = this.L - 3 + Math.random() * 4; this.confVel[i * 3] = (Math.random() - 0.5) * 4; this.confVel[i * 3 + 1] = 3 + Math.random() * 5; this.confVel[i * 3 + 2] = (Math.random() - 0.5) * 4; }
    this.afterT = 0; this.reachZone.visible = false;
    const stars = 1 + (this.livesLost === 0 ? 1 : 0) + (this.tricks >= this.level.tricksFor3 ? 1 : 0);
    this.result = { stars, coins: this.coins + stars * 10, time: this.time, tricks: this.tricks };
    Save.addCoins(this.result.coins); Save.setStars(this.levelIndex, stars);
    setTimeout(() => this.ui.showResult(true, this), 2600);
  }
  _saved() {
    Sfx.save(); this._toast('SAVED! 🧤', 1000); Sfx.crowd(0.1);
    this.lives--; this.livesLost++; this.ui.lives(this.lives);
    if (this.lives <= 0) { this.state = 'over'; this.reachZone.visible = false; Sfx.lose(); setTimeout(() => this.ui.showResult(false, this), 1200); return; }
    setTimeout(() => {
      if (this.state !== 'shoot') return;
      const s = this.shoot; s.fired = false; s.done = false; s.result = null; s.ringSpeed *= 1.15; s.phase = Math.random() * 6;
      this.ball.position.set(this.cam.position.x, 0.23, this.cam.position.z + 0.8); this.keeper.tilt.rotation.z = 0; this.keeper.tilt.position.y = 0;
      this.ring.visible = true; this.ui.shootMode(true);
    }, 1300);
  }
  _updateAfter(dt, t) {
    this.cam.update(dt, 0); this.keeper.update(dt, 0); this.mia.update(dt, 0);
    if (this.state === 'goal') {
      // celebrate: Cam jumps, Mia runs in, confetti rains, net ripples
      this.cam.position.y = Math.abs(Math.sin(t * 6)) * 0.5; this.cam.root.rotation.y += dt * 4;
      const M = this.mia.position; M.x = lerp(M.x, this.cam.position.x + 1.2, dt * 2); M.z = lerp(M.z, this.cam.position.z, dt * 2);
      const p = this.confetti.geometry.attributes.position.array;
      for (let i = 0; i < this.confN; i++) { this.confVel[i * 3 + 1] -= 9 * dt; p[i * 3] += this.confVel[i * 3] * dt; p[i * 3 + 1] += this.confVel[i * 3 + 1] * dt; p[i * 3 + 2] += this.confVel[i * 3 + 2] * dt; if (p[i * 3 + 1] < 0) { p[i * 3 + 1] = 0; this.confVel[i * 3 + 1] = 0; } }
      this.confetti.geometry.attributes.position.needsUpdate = true;
      if (this.world.net) { this.world.net.position.z = this.L + 1.8 + Math.sin(t * 12) * 0.15 * Math.max(0, 1 - (this.afterT || 0)); }
      this.afterT = (this.afterT || 0) + dt * 0.3;
      if (this.world.santaCage) this.world.santaCage.position.y = Math.min(6, this.world.santaCage.position.y + dt * 1.5);
    } else {
      this.cam.setDown(1, true);
    }
    const k = 1 - Math.pow(0.05, dt);
    this.camera.position.lerp(this.tmp.set(this.cam.position.x + 3, 2.5, this.cam.position.z - 3), k);
    this._look.lerp(new THREE.Vector3(this.cam.position.x, 1, this.L), k); this.camera.lookAt(this._look);
  }
  _updateBallFx(dt, t) {
    const B = this.ball.position; this.ballLight.position.copy(B); this.ballGlow.position.copy(B);
    const on = this.comet || (this.skin === 'comet' && this.state !== 'idle');
    const target = on ? 1 : 0; this._fx = lerp(this._fx || 0, target, 1 - Math.pow(0.01, dt));
    this.ballLight.intensity = this._fx * (12 + Math.sin(t * 20) * 3); this.ballGlow.material.opacity = this._fx * 0.85;
    this.ball.material.emissive && (this.ball.material.emissiveIntensity = on ? (this.skin === 'comet' ? 1.4 : 0.9) : (this.skin === 'bauble' || this.skin === 'gold' ? 0.4 : 0));
    this.fire.visible = this._fx > 0.05;
    if (this.fire.visible) {
      const p = this.fire.geometry.attributes.position.array;
      for (let i = 0; i < this.fireN; i++) {
        this.fireLife[i] -= dt;
        if (this.fireLife[i] <= 0) { this.fireLife[i] = 0.35 + Math.random() * 0.4; p[i * 3] = B.x + (Math.random() - 0.5) * 0.3; p[i * 3 + 1] = B.y + (Math.random() - 0.5) * 0.3; p[i * 3 + 2] = B.z + (Math.random() - 0.5) * 0.3; this.fireVel[i * 3] = (Math.random() - 0.5) * 1.5 - this.heading.x * 2; this.fireVel[i * 3 + 1] = 1.5 + Math.random() * 2; this.fireVel[i * 3 + 2] = (Math.random() - 0.5) * 1.5 - this.heading.z * 3; }
        p[i * 3] += this.fireVel[i * 3] * dt; p[i * 3 + 1] += this.fireVel[i * 3 + 1] * dt; p[i * 3 + 2] += this.fireVel[i * 3 + 2] * dt;
      }
      this.fire.geometry.attributes.position.needsUpdate = true; this.fire.material.opacity = this._fx;
    }
  }
}
