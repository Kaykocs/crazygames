// Particles: two instanced billboard pools (alpha-blended: petals, leaves, drops; additive: sparkles, pollen,
// glows, fireflies) with the sprite shapes drawn procedurally in the fragment shader, plus rain streaks.
import * as THREE from 'three';
import { rng } from '../core/math.js';

const VERT = /* glsl */`
  attribute vec4 iPos;      // xyz, size
  attribute vec4 iCol;      // rgb, alpha
  attribute vec2 iRot;      // rotation, shape
  varying vec2 vUv; varying vec4 vCol; varying float vShape;
  #include <fog_pars_vertex>
  void main() {
    vUv = uv - 0.5; vCol = iCol; vShape = iRot.y;
    vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    float c = cos(iRot.x), s = sin(iRot.x);
    vec2 p = vec2(c * position.x - s * position.y, s * position.x + c * position.y) * iPos.w;
    vec3 wp = iPos.xyz + right * p.x + up * p.y;
    vec4 mvPosition = viewMatrix * vec4(wp, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`;
const FRAG = /* glsl */`
  varying vec2 vUv; varying vec4 vCol; varying float vShape;
  #include <fog_pars_fragment>
  void main() {
    vec2 p = vUv * 2.0;
    float a;
    if (vShape < 0.5) {                     // soft round dot
      a = smoothstep(1.0, 0.0, length(p));
    } else if (vShape < 1.5) {              // petal (teardrop)
      vec2 q = vec2(p.x * 1.6, p.y + 0.15);
      a = smoothstep(1.0, 0.86, length(q) + 0.35 * q.y * q.y);
    } else if (vShape < 2.5) {              // four-point sparkle
      float d = min(abs(p.x) * 6.0 + abs(p.y), abs(p.y) * 6.0 + abs(p.x));
      a = smoothstep(1.0, 0.0, d) + smoothstep(0.45, 0.0, length(p)) * 0.8;
    } else if (vShape < 3.5) {              // water drop
      vec2 q = vec2(p.x * 1.8, p.y);
      a = smoothstep(1.0, 0.8, length(q) + max(0.0, q.y) * 0.5);
    } else {                                // ring
      float r = length(p);
      a = smoothstep(0.12, 0.0, abs(r - 0.75));
    }
    gl_FragColor = vec4(vCol.rgb, vCol.a * clamp(a, 0.0, 1.0));
    if (gl_FragColor.a < 0.01) discard;
    #include <colorspace_fragment>
    #include <fog_fragment>
  }`;

export const SHAPE = { DOT: 0, PETAL: 1, SPARK: 2, DROP: 3, RING: 4 };

class Pool {
  constructor(scene, cap, additive) {
    const geo = new THREE.InstancedBufferGeometry();
    const quad = new THREE.PlaneGeometry(1, 1);
    geo.index = quad.index;
    geo.setAttribute('position', quad.attributes.position);
    geo.setAttribute('uv', quad.attributes.uv);
    this.pos = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.col = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.rot = new THREE.InstancedBufferAttribute(new Float32Array(cap * 2), 2).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iPos', this.pos); geo.setAttribute('iCol', this.col); geo.setAttribute('iRot', this.rot);
    geo.instanceCount = 0;
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, fog: true,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog]),
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = additive ? 20 : 10;
    scene.add(this.mesh);
    this.geo = geo;
    this.cap = cap;
    this.list = [];
  }
  spawn(p) { if (this.list.length < this.cap) this.list.push(p); else { this.list.shift(); this.list.push(p); } }
  update(dt) {
    const L = this.list;
    let w = 0;
    for (let i = 0; i < L.length; i++) {
      const p = L[i];
      p.age += dt;
      if (p.age >= p.life) continue;
      p.vy -= (p.g ?? 0) * dt;
      const drag = Math.exp(-(p.drag ?? 0) * dt);
      p.vx *= drag; p.vy *= drag; p.vz *= drag;
      if (p.wander) { p.vx += Math.sin(p.age * 1.7 + p.seed * 9) * p.wander * dt; p.vz += Math.cos(p.age * 1.3 + p.seed * 7) * p.wander * dt; p.vy += Math.sin(p.age * 2.1 + p.seed * 5) * p.wander * 0.5 * dt; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.floor != null && p.y < p.floor) { p.y = p.floor; p.vy = 0; p.vx *= 0.5; p.vz *= 0.5; p.spin *= 0.5; }
      p.rot += (p.spin || 0) * dt;
      L[w++] = p;
    }
    L.length = w;
    const pa = this.pos.array, ca = this.col.array, ra = this.rot.array;
    for (let i = 0; i < w; i++) {
      const p = L[i], k = p.age / p.life;
      const fadeIn = p.fadeIn ? Math.min(1, p.age / p.fadeIn) : 1;
      const alpha = p.a * fadeIn * (k > (p.fadeAt ?? 0.6) ? 1 - (k - (p.fadeAt ?? 0.6)) / (1 - (p.fadeAt ?? 0.6)) : 1);
      const size = p.size * (p.grow ? 1 + p.grow * k : 1) * (p.pulse ? 0.75 + 0.25 * Math.sin(p.age * p.pulse + p.seed * 6) : 1) * (p.shrink ? 1 - k : 1);
      pa[i * 4] = p.x; pa[i * 4 + 1] = p.y; pa[i * 4 + 2] = p.z; pa[i * 4 + 3] = size;
      ca[i * 4] = p.r; ca[i * 4 + 1] = p.gc; ca[i * 4 + 2] = p.b; ca[i * 4 + 3] = alpha;
      ra[i * 2] = p.rot; ra[i * 2 + 1] = p.shape;
    }
    this.geo.instanceCount = w;
    this.pos.needsUpdate = true; this.col.needsUpdate = true; this.rot.needsUpdate = true;
  }
}

const tmpC = new THREE.Color();

export class FX {
  constructor(scene, quality) {
    this.scale = quality.particles ?? 1;
    this.alpha = new Pool(scene, 700, false);
    this.add = new Pool(scene, 700, true);
    this.R = rng(1234);
    this.rain = new Rain(scene, Math.round(700 * this.scale));
    this.fireflies = 0;
    this.motes = 0;
    this.time = 0;
  }

  _p(pool, o) {
    const c = tmpC.set(o.color || '#ffffff');
    pool.spawn({
      x: o.x, y: o.y, z: o.z, vx: o.vx || 0, vy: o.vy || 0, vz: o.vz || 0, g: o.g ?? 0, drag: o.drag ?? 0,
      size: o.size ?? 0.1, life: o.life ?? 1, age: 0, a: o.a ?? 1, r: c.r * (o.bright ?? 1), gc: c.g * (o.bright ?? 1), b: c.b * (o.bright ?? 1),
      rot: o.rot ?? this.R() * 6.28, spin: o.spin ?? 0, shape: o.shape ?? 0, grow: o.grow, shrink: o.shrink, pulse: o.pulse,
      fadeAt: o.fadeAt, fadeIn: o.fadeIn, wander: o.wander, seed: this.R(), floor: o.floor,
    });
  }

  // burst of petals in the flower's colours
  petals(x, y, z, colors, n = 14) {
    const R = this.R;
    n = Math.round(n * this.scale);
    for (let i = 0; i < n; i++) {
      const a = R() * Math.PI * 2, sp = 1 + R() * 2.2;
      this._p(this.alpha, {
        x, y, z, vx: Math.cos(a) * sp, vy: 2 + R() * 2.5, vz: Math.sin(a) * sp, g: 6, drag: 1.6,
        size: 0.14 + R() * 0.1, life: 1.2 + R() * 0.8, color: colors[i % colors.length], shape: SHAPE.PETAL,
        spin: (R() - 0.5) * 10, wander: 3, floor: 0.02, fadeAt: 0.7,
      });
    }
  }

  sparkles(x, y, z, color = '#fff6c2', n = 10, spread = 0.6, big = 1) {
    const R = this.R;
    n = Math.round(n * this.scale);
    for (let i = 0; i < n; i++) {
      const a = R() * Math.PI * 2, r = R() * spread;
      this._p(this.add, {
        x: x + Math.cos(a) * r, y: y + R() * spread, z: z + Math.sin(a) * r, vy: 0.6 + R() * 1.2, vx: Math.cos(a) * 0.4, vz: Math.sin(a) * 0.4, drag: 1.5,
        size: (0.18 + R() * 0.22) * big, life: 0.7 + R() * 0.7, color, shape: SHAPE.SPARK, spin: (R() - 0.5) * 3, fadeAt: 0.4, bright: 1.6,
      });
    }
  }

  pollen(x, y, z, n = 5) {
    const R = this.R;
    for (let i = 0; i < n; i++) {
      this._p(this.add, {
        x: x + (R() - 0.5) * 0.3, y: y + R() * 0.2, z: z + (R() - 0.5) * 0.3, vx: (R() - 0.5) * 0.6, vy: 0.2 + R() * 0.5, vz: (R() - 0.5) * 0.6,
        g: 0.4, drag: 1, size: 0.05 + R() * 0.04, life: 0.9 + R() * 0.6, color: '#ffd23a', shape: SHAPE.DOT, bright: 1.3,
      });
    }
  }

  water(x, y, z, n = 16) {
    const R = this.R;
    n = Math.round(n * this.scale);
    for (let i = 0; i < n; i++) {
      this._p(this.alpha, {
        x: x + (R() - 0.5) * 0.6, y: y + 1.2 + R() * 0.5, z: z + (R() - 0.5) * 0.6, vy: -3 - R() * 2, g: 9,
        size: 0.08 + R() * 0.05, life: 0.5, color: '#7fd4ff', shape: SHAPE.DROP, rot: 0, floor: 0.15, fadeAt: 0.8,
      });
    }
    setTimeout(() => this.ring(x, 0.2, z, '#bfefff', 0.9), 250);
  }

  ring(x, y, z, color = '#ffffff', size = 1) {
    this._p(this.add, { x, y, z, size: size * 0.4, grow: 2.2, life: 0.55, color, shape: SHAPE.RING, a: 0.8, fadeAt: 0.2, rot: 0 });
  }

  leaves(x, y, z, n = 8) {
    const R = this.R;
    for (let i = 0; i < n; i++) {
      const a = R() * Math.PI * 2, sp = 0.6 + R() * 1.2;
      this._p(this.alpha, {
        x, y, z, vx: Math.cos(a) * sp, vy: 1.5 + R() * 1.5, vz: Math.sin(a) * sp, g: 6, drag: 2,
        size: 0.1 + R() * 0.07, life: 0.9 + R() * 0.5, color: R() < 0.5 ? '#6cbf4b' : '#8b5a3c', shape: SHAPE.PETAL, spin: (R() - 0.5) * 8, floor: 0.02,
      });
    }
  }

  dust(x, y, z, n = 8) {
    const R = this.R;
    for (let i = 0; i < n; i++) {
      const a = R() * Math.PI * 2, sp = 0.6 + R() * 0.8;
      this._p(this.alpha, {
        x, y, z, vx: Math.cos(a) * sp, vy: 0.4 + R() * 0.5, vz: Math.sin(a) * sp, g: 1, drag: 2.5,
        size: 0.18 + R() * 0.16, life: 0.7 + R() * 0.4, color: '#b8946a', shape: SHAPE.DOT, a: 0.55, grow: 1.2,
      });
    }
  }

  confetti(center, n = 60) {
    const R = this.R, cols = ['#ff6fa8', '#ffd23f', '#6fd0ff', '#9dffa0', '#c7a6ff', '#ff9f5a'];
    n = Math.round(n * this.scale);
    for (let i = 0; i < n; i++) {
      this._p(this.alpha, {
        x: center.x + (R() - 0.5) * 12, y: center.y + 6 + R() * 4, z: center.z + (R() - 0.5) * 10, vy: -1 - R(), g: 1.2, drag: 0.8,
        size: 0.18 + R() * 0.12, life: 4 + R() * 2, color: cols[i % cols.length], shape: SHAPE.PETAL, spin: (R() - 0.5) * 8, wander: 4, floor: 0.02,
      });
    }
  }

  setFireflies(on) { this.fireflies = on ? 1 : 0; }
  setMotes(on) { this.motes = on ? 1 : 0; }
  setRain(on) { this.rain.target = on ? 1 : 0; }

  update(dt, camera, center) {
    this.time += dt;
    const R = this.R;
    // ambient emitters
    if (this.fireflies && R() < dt * 14 * this.scale) {
      const a = R() * Math.PI * 2, r = 2 + R() * 9;
      this._p(this.add, {
        x: center.x + Math.cos(a) * r, y: 0.4 + R() * 2, z: center.z + Math.sin(a) * r, wander: 2.5, drag: 1,
        size: 0.14 + R() * 0.08, life: 4 + R() * 3, color: '#d9ff7a', shape: SHAPE.DOT, pulse: 5, fadeIn: 0.8, fadeAt: 0.7, bright: 2,
      });
    }
    if (this.motes && R() < dt * 10 * this.scale) {
      const a = R() * Math.PI * 2, r = R() * 8;
      this._p(this.add, {
        x: center.x + Math.cos(a) * r, y: 0.3 + R() * 2.5, z: center.z + Math.sin(a) * r, vy: 0.15, wander: 1.2,
        size: 0.07 + R() * 0.05, life: 3 + R() * 2, color: '#ffd98a', shape: SHAPE.DOT, fadeIn: 0.6, bright: 1.6,
      });
    }
    this.alpha.update(dt);
    this.add.update(dt);
    this.rain.update(dt, camera, center);
  }
}

// rain: stretched camera-facing streaks recycled in a box around the garden
class Rain {
  constructor(scene, n) {
    this.n = n;
    this.target = 0; this.k = 0;
    const geo = new THREE.InstancedBufferGeometry();
    const quad = new THREE.PlaneGeometry(0.025, 0.55);
    geo.index = quad.index;
    geo.setAttribute('position', quad.attributes.position);
    this.off = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iOff', this.off);
    geo.instanceCount = 0;
    const mat = new THREE.ShaderMaterial({
      uniforms: { uA: { value: 0 } },
      vertexShader: /* glsl */`
        attribute vec4 iOff; varying float vA;
        void main(){
          vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
          vec3 wp = iOff.xyz + right * position.x + vec3(0.0, position.y, 0.0);
          vA = iOff.w;
          gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
        }`,
      fragmentShader: 'uniform float uA; varying float vA; void main(){ gl_FragColor = vec4(0.85, 0.92, 1.0, 0.45 * uA * vA); }',
      transparent: true, depthWrite: false,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 30;
    scene.add(this.mesh);
    this.drops = [];
    const R = rng(77);
    for (let i = 0; i < n; i++) this.drops.push({ x: (R() - 0.5) * 22, y: R() * 12, z: (R() - 0.5) * 20, v: 12 + R() * 5, a: 0.5 + R() * 0.5 });
    this.geo = geo;
  }
  update(dt, camera, center) {
    this.k += (this.target - this.k) * Math.min(1, dt * 0.8);
    const live = Math.round(this.n * this.k);
    this.mesh.visible = live > 0;
    this.mesh.material.uniforms.uA.value = Math.min(1, this.k * 1.5);
    if (!live) return;
    const a = this.off.array;
    for (let i = 0; i < live; i++) {
      const d = this.drops[i];
      d.y -= d.v * dt;
      if (d.y < 0) d.y += 12;
      a[i * 4] = center.x + d.x; a[i * 4 + 1] = d.y; a[i * 4 + 2] = center.z + d.z; a[i * 4 + 3] = d.a;
    }
    this.geo.instanceCount = live;
    this.off.needsUpdate = true;
  }
}
