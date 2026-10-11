// Football physics: a rolling, spinning, bouncing ball with air drag, Magnus curl and rolling resistance.
import { THREE, scene, synth, pbr, Q, setupMaterial } from './core.js';

const G = 9.81 * 1.15;
export const BALL_R = 0.15;
const _n = new THREE.Vector3(), _t = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion(), _axis = new THREE.Vector3();

function soccerTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#f6f6f6'; g.fillRect(0, 0, 512, 512);
  g.fillStyle = '#1a1a1a';
  const pent = (x, y, r, rot) => { g.beginPath(); for (let i = 0; i < 5; i++) { const a = rot + i * Math.PI * 2 / 5; g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } g.closePath(); g.fill(); };
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) pent(64 + x * 128 + (y % 2) * 64, 64 + y * 128, 34, y * 0.3);
  g.strokeStyle = 'rgba(0,0,0,0.12)'; g.lineWidth = 3;
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { g.beginPath(); g.arc(64 + x * 128 + (y % 2) * 64, 64 + y * 128, 62, 0, 7); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
let ballTex = null;

export class Ball {
  constructor(x, y, z) {
    ballTex = ballTex || soccerTexture();
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 32, 24), Q() ? setupMaterial(pbr('ball', 2, 1, true, { bump: 0.7 })) : new THREE.MeshStandardMaterial({ map: ballTex, roughness: 0.42, metalness: 0.02 }));
    this.mesh.castShadow = true;
    scene.add(this.mesh);
    this.pos = new THREE.Vector3(x, y, z);
    this.vel = new THREE.Vector3();
    this.ang = new THREE.Vector3();   // angular velocity (rad/s), world axes
    this.grounded = false;
    this.surface = 'grass';
    this.lastTouch = 0;
    this.lastKicker = null;
    this.home = new THREE.Vector3(x, y, z);
    this.sleep = 0;
  }
  reset(x, y, z) { this.pos.set(x, y, z); this.vel.set(0, 0, 0); this.ang.set(0, 0, 0); this.sleep = 0; }
  // Kick: direction (unit, horizontal mostly), speed m/s, loft (0..1), curl (-1..1 side spin), backspin (0..1)
  kick(dir, speed, loft = 0.15, curl = 0, back = 0.2) {
    const up = loft * speed;
    this.vel.set(dir.x * speed, up, dir.z * speed);
    // side spin around the up axis bends the flight (Magnus); backspin around the side axis keeps it floating
    _t.set(-dir.z, 0, dir.x);
    this.ang.set(0, curl * 30, 0).addScaledVector(_t, -back * 25 * (speed / 20));
    this.grounded = false; this.sleep = 0;
    synth(speed > 12 ? 'kick' : 'tap', Math.min(1, speed / 18));
  }
  step(dt, groundAt, colliders) {
    // swept: never move more than ~half a radius per sub-step so fast shots can't tunnel through posts, nets or boards
    const n = Math.min(16, Math.max(1, Math.ceil(this.vel.length() * dt / (BALL_R * 0.55))));
    const h = dt / n;
    for (let i = 0; i < n; i++) this.sub(h, groundAt, colliders);
    // mesh
    const w = this.ang, wl = w.length();
    this.mesh.position.copy(this.pos);
    if (wl > 1e-4) { _axis.copy(w).multiplyScalar(1 / wl); _q.setFromAxisAngle(_axis, wl * dt); this.mesh.quaternion.premultiply(_q); }
  }
  sub(dt, groundAt, colliders) {
    const p = this.pos, v = this.vel, w = this.ang;
    // gravity, drag, Magnus
    v.y -= G * dt;
    const speed = v.length();
    if (speed > 0.001) {
      const drag = 0.0045 * speed;              // quadratic air drag
      v.multiplyScalar(Math.max(0, 1 - drag * dt));
      _w.crossVectors(w, v).multiplyScalar(0.0022 * dt);   // Magnus: a = k (ω × v)
      v.add(_w);
    }
    p.addScaledVector(v, dt);
    // ground
    const g = groundAt(p.x, p.z);
    const gy = g.y + BALL_R;
    this.surface = g.surface || 'grass';
    if (p.y <= gy) {
      p.y = gy;
      if (v.y < -1.2) {
        // bounce: restitution by surface; friction converts slip into spin
        const e = this.surface === 'astro' ? 0.62 : this.surface === 'hard' ? 0.7 : 0.5;
        v.y = -v.y * e;
        // tangential slip = v_t - (ω × n) r ; apply friction impulse
        _n.set(0, 1, 0);
        _t.crossVectors(w, _n).multiplyScalar(BALL_R);        // surface velocity from spin
        const sx = v.x - _t.x, sz = v.z - _t.z;                 // slip
        const mu = 0.35;
        v.x -= sx * mu; v.z -= sz * mu;
        // spin from the impact: ω ≈ n × v / r (partial)
        _w.crossVectors(_n, v).multiplyScalar(1 / BALL_R);
        w.lerp(_w, 0.45);
        synth('bounce', Math.min(1, Math.abs(v.y) / 6));
        this.grounded = false;
      } else {
        v.y = 0; this.grounded = true;
        // rolling: resistance by surface, spin locked to velocity (no slip)
        const rr = this.surface === 'astro' ? 0.55 : this.surface === 'hard' ? 0.35 : 1.1;
        const hs = Math.hypot(v.x, v.z);
        if (hs > 0.02) {
          const dec = Math.min(hs, rr * dt + hs * 0.08 * dt);
          v.x -= (v.x / hs) * dec; v.z -= (v.z / hs) * dec;
          _n.set(0, 1, 0); w.crossVectors(_n, v).multiplyScalar(1 / BALL_R);
        } else { v.x = v.z = 0; w.multiplyScalar(Math.max(0, 1 - 6 * dt)); }
        // slopes: roll downhill a little
        const dx = groundAt(p.x + 0.5, p.z).y - groundAt(p.x - 0.5, p.z).y, dz = groundAt(p.x, p.z + 0.5).y - groundAt(p.x, p.z - 0.5).y;
        v.x -= dx * 2.2 * dt; v.z -= dz * 2.2 * dt;
      }
    } else {
      this.grounded = false;
      w.multiplyScalar(Math.max(0, 1 - 0.25 * dt));   // spin decays slowly in the air
    }
    // colliders: segments (walls/fences), circles (posts, trunks), boxes handled by caller
    if (colliders) colliders(this);
    // sleep
    if (this.grounded && v.lengthSq() < 0.0004) this.sleep += dt; else this.sleep = 0;
  }
  // reflect off a wall with normal n (unit, horizontal) and restitution e
  bounceOff(nx, nz, e = 0.72, sfx = 'fence') {
    const v = this.vel; const vn = v.x * nx + v.z * nz;
    if (vn >= 0) return false;
    v.x -= (1 + e) * vn * nx; v.z -= (1 + e) * vn * nz;
    v.x *= 0.92; v.z *= 0.92;
    this.ang.multiplyScalar(0.6);
    if (Math.abs(vn) > 1.5) synth(sfx, Math.min(1, Math.abs(vn) / 10));
    return true;
  }
}

// --- 2D helpers used by the world colliders ---
export function circleSegmentPush(px, pz, r, ax, az, bx, bz) {
  // returns [nx, nz, depth] if the circle (px,pz,r) overlaps segment a-b, else null
  const dx = bx - ax, dz = bz - az, len2 = dx * dx + dz * dz;
  let t = len2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / len2 : 0; t = Math.max(0, Math.min(1, t));
  const cx = ax + dx * t, cz = az + dz * t;
  let nx = px - cx, nz = pz - cz; const d = Math.hypot(nx, nz);
  if (d >= r) return null;
  if (d < 1e-6) { nx = -dz; nz = dx; const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l; return [nx, nz, r]; }
  return [nx / d, nz / d, r - d];
}
