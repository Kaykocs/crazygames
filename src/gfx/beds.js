// Wooden hexagonal planter beds: six wood-grain planks, six corner posts and an inset soil bed, all instanced.
// Plots that can be bought are staked out with short posts; buying one raises the planks plank by plank.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { roundedHexPrism } from './geometry.js';
import { woodTexture, soilTexture } from './textures.js';
import { clamp, ease } from '../core/math.js';

export const BED = { R: 0.94, soilTop: 0.2, plankH: 0.27 };

const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3(), tmpE = new THREE.Euler();
const col = new THREE.Color();

export class Beds {
  constructor(scene, positions) {
    this.pos = positions;
    const N = (this.N = positions.length);
    const wood = woodTexture();
    const side = BED.R;                               // hex side length = circumradius
    const plankGeo = new RoundedBoxGeometry(side * 1.02, BED.plankH, 0.11, 2, 0.035);
    plankGeo.translate(0, BED.plankH / 2, 0);
    // stretch the wood texture along the plank
    const uv = plankGeo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 1.6, uv.getY(i) * 0.35);
    const postGeo = new RoundedBoxGeometry(0.15, BED.plankH + 0.08, 0.15, 2, 0.04);
    postGeo.translate(0, (BED.plankH + 0.08) / 2, 0);
    const soilGeo = roundedHexPrism({ radius: BED.R - 0.1, height: BED.soilTop, corner: 0.16, bevel: 0.06, bevelSegs: 3 });
    const suv = soilGeo.attributes.uv;
    for (let i = 0; i < suv.count; i++) suv.setXY(i, suv.getX(i) * 0.55, suv.getY(i) * 0.55);
    const plankMat = new THREE.MeshStandardMaterial({ map: wood, roughness: 0.78, color: '#ffffff' });
    const postMat = new THREE.MeshStandardMaterial({ map: wood, roughness: 0.8, color: '#ffffff' });
    const soilMat = new THREE.MeshStandardMaterial({ map: soilTexture(), roughness: 1, color: '#ffffff' });
    this.planks = new THREE.InstancedMesh(plankGeo, plankMat, N * 6);
    this.posts = new THREE.InstancedMesh(postGeo, postMat, N * 6);
    this.soil = new THREE.InstancedMesh(soilGeo, soilMat, N);
    for (const m of [this.planks, this.posts, this.soil]) {
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(m.count * 3).fill(1), 3);
      m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false;
      scene.add(m);
    }
    // per-plank colour variation (fixed)
    this.plankTint = new Float32Array(N * 6);
    for (let i = 0; i < N * 6; i++) this.plankTint[i] = 0.9 + ((i * 7919) % 97) / 97 * 0.2;
  }

  // state: { owned, buyable, k (0..1 built), hover, glow, wet, bump }
  set(i, st, time) {
    const c = this.pos[i];
    const k = st.k;
    // planks: rise one after another as the bed is built
    for (let e = 0; e < 6; e++) {
      const idx = i * 6 + e;
      const a = (e * 60 + 30) * Math.PI / 180;
      const d = BED.R * Math.cos(Math.PI / 6) - 0.055;
      const ke = clamp(k * 1.6 - e * 0.1, 0, 1);
      const rise = ke > 0 ? ease.outBack(ke) : 0;
      tmpP.set(c.x + Math.cos(a) * d, 0, c.z + Math.sin(a) * d);
      tmpE.set(0, -a + Math.PI / 2, 0);
      tmpQ.setFromEuler(tmpE);
      const bump = 1 + st.bump * 0.08;
      if (rise <= 0.001) tmpS.set(0.0001, 0.0001, 0.0001);            // fully hidden (not just flattened)
      else tmpS.set(bump, rise * (1 + st.hover * 0.04), bump);
      tmpM.compose(tmpP, tmpQ, tmpS);
      this.planks.setMatrixAt(idx, tmpM);
      const t = this.plankTint[idx] * (1 + st.hover * 0.18);
      col.setRGB(t, t * 0.97, t * 0.92);
      this.planks.setColorAt(idx, col);
      // corner posts: full height when built, short stakes when the plot is for sale
      const pa = (e * 60) * Math.PI / 180;
      tmpP.set(c.x + Math.cos(pa) * (BED.R - 0.06), 0, c.z + Math.sin(pa) * (BED.R - 0.06));
      tmpE.set(0, -pa, 0);
      tmpQ.setFromEuler(tmpE);
      const postH = st.owned ? ease.outBack(clamp(k * 1.4 - 0.1, 0, 1)) : st.buyable ? 0.5 : 0;
      if (postH <= 0.001) tmpS.set(0.0001, 0.0001, 0.0001); else tmpS.set(1, postH, 1);
      tmpM.compose(tmpP, tmpQ, tmpS);
      this.posts.setMatrixAt(idx, tmpM);
      const pt = (st.owned ? 0.78 : 1.05) * (1 + st.hover * 0.2);
      col.setRGB(pt, pt * 0.95, pt * 0.9);
      this.posts.setColorAt(idx, col);
    }
    // soil fills in once the frame is up
    const ks = st.owned ? ease.outCubic(clamp(k * 1.5 - 0.45, 0, 1)) : 0;
    tmpP.set(c.x, -0.02 - (1 - ks) * 0.2, c.z);
    tmpQ.identity();
    const sb = 1 + st.bump * 0.06;
    tmpS.set(Math.max(0.0001, ks) * sb, Math.max(0.0001, ks) * (1 - st.bump * 0.15), Math.max(0.0001, ks) * sb);
    tmpM.compose(tmpP, tmpQ, tmpS);
    this.soil.setMatrixAt(i, tmpM);
    const glow = st.glow ? 0.16 + 0.1 * Math.sin(time * 5) : 0;
    const v = (1 - st.wet * 0.35) * (1 + st.hover * 0.25 + glow);
    col.setRGB(v, v + glow * 0.5, v);
    this.soil.setColorAt(i, col);
  }

  commit() {
    for (const m of [this.planks, this.posts, this.soil]) { m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; }
  }
}
