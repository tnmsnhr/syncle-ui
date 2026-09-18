export function bboxOf(pts) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}

/** Visual center of a lasso (bounding-box midpoint). */
export function centroidOf(pts) {
  const box = bboxOf(pts);
  return {
    x: box.minX + box.w / 2,
    y: box.minY + box.h / 2,
  };
}
