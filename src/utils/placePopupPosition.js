export function placePopupPosition(clientBox, view) {
  const margin = 8;
  const estW = 260;
  const estH = 160;

  let x = clientBox.maxX + margin;
  let y = clientBox.minY;

  if (x + estW > view.width) {
    x = Math.max(margin, clientBox.minX - estW - margin);
  }
  if (y + estH > view.height) {
    y = Math.max(margin, view.height - estH - margin);
  }
  if (y < margin) y = margin;

  return { x, y };
}
