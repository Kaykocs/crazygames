// Flat-top hex grid in axial coordinates (q, r). World layout: x to the right, z toward the camera.
// Offset layout used by the shape helpers is "odd-q": odd columns sit half a cell lower (toward the camera).
export const SQRT3 = Math.sqrt(3);
export const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];

export const key = (q, r) => q + ',' + r;
export const hexDist = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.q + a.r - b.q - b.r)) / 2;

// centre of cell (q, r) for a hex of circumradius `size`
export function hexToWorld(q, r, size) {
  return { x: size * 1.5 * q, z: size * SQRT3 * (r + q / 2) };
}

const fromOffset = (col, row) => ({ q: col, r: row - Math.floor(col / 2) });

// ---- board shapes: each returns a list of {q, r, tag?}. The view centres whatever comes out. ----
export function shapeHexagon(R) {
  const out = [];
  for (let q = -R; q <= R; q++) for (let r = Math.max(-R, -q - R); r <= Math.min(R, -q + R); r++) out.push({ q, r });
  return out;
}

export function shapeRect(cols, rows) {
  const out = [];
  for (let col = 0; col < cols; col++) for (let row = 0; row < rows; row++) out.push(fromOffset(col, row));
  return out;
}

// ASCII mask: one string per row, one char per column; '.' or ' ' = no cell, any other char = a cell whose
// character is kept as `tag` (level data uses tags for rocks, vines, frozen stacks...).
export function shapeFromMask(rows) {
  const out = [];
  rows.forEach((line, row) => {
    for (let col = 0; col < line.length; col++) {
      const ch = line[col];
      if (ch === '.' || ch === ' ') continue;
      out.push({ ...fromOffset(col, row), tag: ch });
    }
  });
  return out;
}
