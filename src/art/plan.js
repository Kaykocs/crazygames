// The garden plan: paths, lawn zones and the keep-clear footprint of the flower beds, in world units
// (x → right, z → toward the viewer). Shared by the ground painter (cached tiles) and the prop layout.
//
//   z −45 … −13  woods and a wildflower meadow beyond the back fence (the gate path leads out through it)
//   z  −8.9      picket fence with the gate, tall cottage border in front; mossy stone wall on the back left
//   z  −7 … 8    a gravel walk loops around the honeycomb beds; spurs lead to the shed, the greenhouse and
//                the pond jetty; the hive sits beside the walk, the pond is on the right
//   x ±17.6      hedges close the garden at the sides; kitchen garden front left, wild meadow front right
//   z  8 … 45    the front path winds away toward the viewer between framing trees
import { SQ } from './view3q.js';

// ------------------------------------------------------------------------------------------ bed footprint
// every plot the player can own (hex radius 3, size 1) incl. planter rims and the wild patches on unbought plots
export const BEDS = { hx: 5.45, hz: 6.0, k: 0.573, c: 6.54 };
export function inBeds(x, z, m = 0) {
  const ax = Math.abs(x), az = Math.abs(z);
  return ax <= BEDS.hx + m && az <= BEDS.hz + m && az + BEDS.k * ax <= BEDS.c + m * 1.15;
}

// ------------------------------------------------------------------------------------------ paths
// control points (x, z); smoothed with Catmull-Rom. kind: gravel walk | stepping stones | planks
const RAW = [
  {
    id: 'loop', kind: 'gravel', w: 1.05, closed: true, pts: [
      [0.55, 8.4], [-2.7, 8.2], [-5.2, 7.35], [-6.6, 5.7], [-6.95, 3.3], [-6.7, 0.7], [-7.0, -1.8], [-7.55, -4.0],
      [-7.15, -6.0], [-5.4, -7.1], [-3.3, -7.4], [-1.6, -7.45], [0.6, -7.3], [2.7, -6.9], [4.7, -6.35], [6.6, -5.8],
      [8.7, -5.65], [10.8, -5.05], [12.5, -3.6], [13.05, -1.4], [12.45, 1.0], [10.8, 3.3], [8.9, 4.5], [6.4, 5.9],
      [4.0, 7.35], [2.2, 8.15],
    ],
  },
  { id: 'front', kind: 'gravel', w: 1.2, pts: [[0.55, 8.4], [0.8, 10.4], [1.3, 12.6], [0.7, 15.0], [-0.2, 17.8], [0.2, 21.0], [1.1, 24.5], [0.7, 29], [0.4, 36], [0.6, 48]] },
  { id: 'gate', kind: 'gravel', w: 0.95, pts: [[-1.6, -7.5], [-1.6, -8.9], [-1.45, -10.4], [-0.7, -12.5], [0.6, -15.2], [0.3, -18.5], [-1.0, -22], [-0.6, -27], [0.2, -33], [0, -48]] },
  { id: 'shed', kind: 'gravel', w: 0.85, pts: [[-7.3, -5.4], [-8.6, -6.6], [-10.6, -7.05], [-12.6, -6.95], [-14.35, -6.75]] },
  { id: 'green', kind: 'stones', w: 0.8, pts: [[-6.9, 2.7], [-8.7, 2.5], [-10.6, 2.35], [-12.3, 1.95], [-13.35, 1.55]] },
  { id: 'jetty', kind: 'stones', w: 0.7, pts: [[12.95, -1.0], [12.35, -1.25], [11.75, -1.4]] },
  { id: 'hive', kind: 'stones', w: 0.6, pts: [[-7.2, -4.35], [-6.4, -4.15]] },
];

// dense polyline through the control points
function spline(pts, closed, step = 0.2) {
  const n = pts.length, out = [];
  const P = (i) => (closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const m = Math.max(2, Math.ceil(len / step));
    for (let k = 0; k < m; k++) {
      const t = k / m, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  if (!closed) out.push(pts[n - 1].slice());
  else out.push(out[0].slice());
  return out;
}

export const PATHS = RAW.map((p) => {
  const pts = spline(p.pts, !!p.closed);
  // arc length along the polyline (stepping stones and edge stones are spaced by it)
  const len = [0];
  for (let i = 1; i < pts.length; i++) len.push(len[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const [x, z] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  return { ...p, line: pts, len, box: { x0: x0 - p.w, x1: x1 + p.w, z0: z0 - p.w, z1: z1 + p.w } };
});

// point + unit tangent at arc length s along a path
export function pathAt(p, s) {
  const L = p.len, pts = p.line;
  let lo = 0, hi = L.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (L[m] <= s) lo = m; else hi = m; }
  const t = (s - L[lo]) / Math.max(1e-6, L[hi] - L[lo]);
  const a = pts[lo], b = pts[hi];
  const dx = b[0] - a[0], dz = b[1] - a[1], d = Math.hypot(dx, dz) || 1;
  return { x: a[0] + dx * t, z: a[1] + dz * t, tx: dx / d, tz: dz / d };
}

// shortest distance from (x, z) to a path's centre line
export function pathDist(p, x, z) {
  const b = p.box;
  if (x < b.x0 - 3 || x > b.x1 + 3 || z < b.z0 - 3 || z > b.z1 + 3) return Infinity;
  let best = Infinity;
  const pts = p.line;
  for (let i = 1; i < pts.length; i++) {
    const ax = pts[i - 1][0], az = pts[i - 1][1], bx = pts[i][0], bz = pts[i][1];
    const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
    let t = ((x - ax) * dx + (z - az) * dz) / l2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const ex = ax + dx * t - x, ez = az + dz * t - z, d = ex * ex + ez * ez;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

// ------------------------------------------------------------------------------------------ zones
// soft ellipses (x, z, rx, rz): wild meadow, woods floor, kitchen-garden earth, damp pond margin
export const MEADOWS = [
  { x: 0, z: -17, rx: 30, rz: 8 }, { x: -22, z: -12, rx: 9, rz: 9 }, { x: 22, z: -12, rx: 9, rz: 9 },
  { x: 14.2, z: 8.6, rx: 3.8, rz: 3.3 }, { x: -12.5, z: 12.5, rx: 4.5, rz: 2.4 }, { x: 25, z: 6, rx: 7, rz: 9 },
  { x: -25, z: 4, rx: 7, rz: 10 }, { x: 8, z: 20, rx: 6, rz: 5 }, { x: -9, z: 22, rx: 6, rz: 5 },
];
export const KITCHEN = { x: -13.3, z: 6.3, rx: 3.9, rz: 3.3 };
export const FENCE_LINE = -8.9;
export const SIDE = 17.6;              // hedges at x = ±SIDE close the garden
export const GARDEN_FRONT = 13.5;

// how far (0..1) a point is "outside the tended garden" (woods / wild country)
export function outside(x, z) {
  let o = 0;
  if (z < FENCE_LINE - 0.4) o = Math.min(1, (FENCE_LINE - 0.4 - z) / 3);
  if (Math.abs(x) > SIDE + 0.3) o = Math.max(o, Math.min(1, (Math.abs(x) - SIDE - 0.3) / 3));
  if (z > GARDEN_FRONT) o = Math.max(o, Math.min(1, (z - GARDEN_FRONT) / 5));
  return o;
}

export const toY = (z) => z * SQ;
