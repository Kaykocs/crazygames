// WebGL renderer: quality tiers, device-aware defaults, resize handling and a dynamic-resolution governor that
// keeps weak devices (4 GB Chromebooks, older phones) smooth.
import * as THREE from 'three';
import { QUALITY } from '../config.js';

// r186's PCF uses 5 taps rotated by per-pixel noise → visible stipple on soft edges. Replace with a noise-free
// 3×3 grid of hardware-filtered taps (smooth and temporally stable; cheap enough for a small diorama).
(function patchShadowFilter() {
  const chunk = THREE.ShaderChunk.shadowmap_pars_fragment;
  const re = /shadow = \(\s*texture\( shadowMap, vec3\( shadowCoord\.xy \+ vogelDiskSample\( 0, 5, phi \) \* radius, shadowCoord\.z \) \)[\s\S]*?\) \* 0\.2;/;
  if (!re.test(chunk)) { console.warn('[renderer] shadow chunk changed; keeping stock PCF'); return; }
  THREE.ShaderChunk.shadowmap_pars_fragment = chunk.replace(re, `vec2 ts = texelSize * max( shadowRadius * 0.6, 0.75 );
				float s9 = 0.0;
				for ( int sx = -1; sx <= 1; sx ++ ) for ( int sy = -1; sy <= 1; sy ++ ) s9 += texture( shadowMap, vec3( shadowCoord.xy + vec2( float( sx ), float( sy ) ) * ts, shadowCoord.z ) );
				shadow = s9 * ( 1.0 / 9.0 );`);
})();

export function detectQuality(sysInfo) {
  const ua = navigator.userAgent || '';
  const touch = navigator.maxTouchPoints > 0 || 'ontouchstart' in window;
  const deviceType = sysInfo?.device?.type;
  const mobile = deviceType === 'mobile' || deviceType === 'tablet' || /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (touch && Math.min(screen.width, screen.height) < 820);
  const cores = navigator.hardwareConcurrency || 4;
  const mem = navigator.deviceMemory || 4;
  const cros = /CrOS/.test(ua);
  if (cores <= 2 || mem <= 2) return 'low';
  if (mobile || cros || mem <= 4) return 'medium';
  return 'high';
}

export class Renderer {
  constructor(container, qualityName) {
    this.container = container;
    this.qualityName = qualityName;
    this.q = QUALITY[qualityName] || QUALITY.medium;
    this.dynScale = 1;
    this._createRenderer();
    this._w = 0; this._h = 0;
    this.onResize = null;
    this.frameTimes = [];
    this.governorT = 0;
    this.stepsDown = 0;
  }

  _createRenderer() {
    const r = new THREE.WebGLRenderer({
      antialias: this.q.antialias, alpha: false, stencil: false, depth: true,
      powerPreference: 'high-performance', preserveDrawingBuffer: false,
    });
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.NeutralToneMapping;
    r.toneMappingExposure = 1.0;
    r.shadowMap.enabled = !!this.q.shadows;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.domElement.id = 'game-canvas';
    r.domElement.setAttribute('aria-label', 'Game');
    this.container.appendChild(r.domElement);
    this.renderer = r;
  }

  get pixelRatio() { return Math.min(window.devicePixelRatio || 1, this.q.pixelRatio) * this.dynScale; }

  resize(force = false) {
    const w = Math.max(1, this.container.clientWidth || window.innerWidth);
    const h = Math.max(1, this.container.clientHeight || window.innerHeight);
    if (!force && w === this._w && h === this._h) return false;
    this._w = w; this._h = h;
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(w, h, false);
    this.onResize?.(w, h);
    return true;
  }
  get width() { return this._w; }
  get height() { return this._h; }

  setQuality(name) {
    const q = QUALITY[name];
    if (!q) return;
    const needNew = q.antialias !== this.q.antialias;
    this.qualityName = name; this.q = q; this.dynScale = 1;
    if (needNew) {
      // MSAA is a context attribute: recreate the renderer (scene objects re-upload lazily)
      const old = this.renderer;
      this._createRenderer();
      old.domElement.remove();
      old.dispose();
      this.onContextReplaced?.(this.renderer);
    }
    this.renderer.shadowMap.enabled = !!q.shadows;
    this.onQuality?.(q);
    this.resize(true);
  }

  // Called every frame with the real frame time. Two gentle steps: lower resolution, then drop shadows.
  govern(dt, active) {
    if (!active || dt <= 0 || dt > 0.25 || document.hidden) { this.governorT = 0; this.frameTimes.length = 0; return; }
    this.frameTimes.push(dt);
    this.governorT += dt;
    if (this.governorT < 3) return;
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    this.frameTimes.length = 0; this.governorT = 0;
    if (avg > 1 / 42 && this.stepsDown < 3) {
      this.stepsDown++;
      if (this.dynScale > 0.7) { this.dynScale = Math.max(0.6, this.dynScale - 0.2); this.resize(true); }
      else if (this.renderer.shadowMap.enabled) { this.renderer.shadowMap.enabled = false; this.onQuality?.({ ...this.q, shadows: false }); }
      console.info('[renderer] stepping down: scale', this.dynScale.toFixed(2), 'shadows', this.renderer.shadowMap.enabled);
    }
  }

  render(scene, camera) { this.renderer.render(scene, camera); }
}
