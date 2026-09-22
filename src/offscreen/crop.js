/** Screenshot crop helpers for offscreen document. */

const polygonBounds = (polyCss) => {
  const xs = polyCss.map((p) => p.x);
  const ys = polyCss.map((p) => p.y);
  const left = Math.floor(Math.min(...xs));
  const top = Math.floor(Math.min(...ys));
  const right = Math.ceil(Math.max(...xs));
  const bottom = Math.ceil(Math.max(...ys));
  return {
    left,
    top,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
  };
};

export async function cropPolygonDataUrl(dataUrl, polygonCss, dpr, withPreview) {
  const blob = await (await fetch(dataUrl)).blob();
  const bitmap = await createImageBitmap(blob);

  const polyDev = polygonCss.map((p) => ({ x: p.x * dpr, y: p.y * dpr }));
  const boundsCss = polygonBounds(polygonCss);
  const boundsDev = {
    left: boundsCss.left * dpr,
    top: boundsCss.top * dpr,
    width: Math.max(1, Math.round(boundsCss.width * dpr)),
    height: Math.max(1, Math.round(boundsCss.height * dpr)),
  };

  const canvas = new OffscreenCanvas(boundsDev.width, boundsDev.height);
  const ctx = canvas.getContext("2d");

  ctx.beginPath();
  polyDev.forEach((p, i) => {
    const lx = p.x - boundsDev.left;
    const ly = p.y - boundsDev.top;
    if (i === 0) ctx.moveTo(lx, ly);
    else ctx.lineTo(lx, ly);
  });
  ctx.closePath();
  ctx.clip();

  ctx.drawImage(
    bitmap,
    boundsDev.left,
    boundsDev.top,
    boundsDev.width,
    boundsDev.height,
    0,
    0,
    boundsDev.width,
    boundsDev.height,
  );

  const width = boundsDev.width;
  const height = boundsDev.height;
  if (!withPreview) return { width, height };

  const previewBlob = await canvas.convertToBlob({ type: "image/png" });
  const reader = new FileReader();
  const dataUrlOut = await new Promise((res, rej) => {
    reader.onerror = rej;
    reader.onload = () => res(reader.result);
    reader.readAsDataURL(previewBlob);
  });

  return { width, height, dataUrl: dataUrlOut };
}

export async function cropRectDataUrl(
  dataUrl,
  rectCss,
  dpr,
  maxWidth,
  quality,
) {
  const blob = await (await fetch(dataUrl)).blob();
  const bitmap = await createImageBitmap(blob);

  const sx = Math.max(0, Math.floor(rectCss.left * dpr));
  const sy = Math.max(0, Math.floor(rectCss.top * dpr));
  const sw = Math.max(
    1,
    Math.min(bitmap.width - sx, Math.ceil(rectCss.width * dpr)),
  );
  const sh = Math.max(
    1,
    Math.min(bitmap.height - sy, Math.ceil(rectCss.height * dpr)),
  );

  let dw = sw;
  let dh = sh;
  if (dw > maxWidth) {
    const scale = maxWidth / dw;
    dw = maxWidth;
    dh = Math.max(1, Math.round(sh * scale));
  }

  const canvas = new OffscreenCanvas(dw, dh);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, dw, dh);

  const outBlob = await canvas.convertToBlob({
    type: "image/jpeg",
    quality,
  });
  const buffer = await outBlob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }

  return {
    ok: true,
    cropImageBase64: btoa(binary),
    width: dw,
    height: dh,
    mimeType: "image/jpeg",
  };
}
