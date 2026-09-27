// The illustrated 3/4 top-down projection shared by every painter and the camera.
// World: x → right, z → toward the viewer, y → up. Screen (in world units): X = x, Y = z * SQ − y * HY.
export const SQ = 0.72;       // ground foreshortening
export const HY = 0.92;       // height foreshortening
export const toY = (z, y = 0) => z * SQ - y * HY;

// flat-top hexagon corners on the ground plane at height y (screen-space units, centred on 0,0)
export function hexCorners(r, y = 0, squash = SQ) {
  const out = [];
  for (let k = 0; k < 6; k++) {
    const a = (k * Math.PI) / 3;
    out.push([Math.cos(a) * r, Math.sin(a) * r * squash - y * HY]);
  }
  return out;
}
