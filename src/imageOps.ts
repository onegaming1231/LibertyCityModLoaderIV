// Picture work done with the window's canvas (the engine has no picture tools of its own).
function blobUrl(bytes: Uint8Array) { return URL.createObjectURL(new Blob([bytes as any])); }
export function loadImage(bytes: Uint8Array): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image(); const u = blobUrl(bytes);
    img.onload = () => { URL.revokeObjectURL(u); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(u); reject(new Error("Can't open that file as a picture. Try a .png or .jpg.")); };
    img.src = u;
  });
}
const b64 = (s: string) => s.substring(s.indexOf(',') + 1);
function b64ToBytes(s: string) { const bin = atob(s); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; }
// 192 x 108 picture for My Mods (cropped to fill)
export async function thumb(bytes: Uint8Array): Promise<Uint8Array> {
  const img = await loadImage(bytes);
  const w = 192, h = 108, c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d')!; g.imageSmoothingQuality = 'high';
  const sc = Math.max(w / img.width, h / img.height), dw = img.width * sc, dh = img.height * sc;
  g.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
  return b64ToBytes(b64(c.toDataURL('image/png')));
}
// B G R A pixels -> canvas
export function bgraToCanvas(bgra: Uint8Array, w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d')!; const d = g.createImageData(w, h);
  for (let i = 0; i < w * h; i++) { d.data[i * 4] = bgra[i * 4 + 2]; d.data[i * 4 + 1] = bgra[i * 4 + 1]; d.data[i * 4 + 2] = bgra[i * 4]; d.data[i * 4 + 3] = bgra[i * 4 + 3]; }
  g.putImageData(d, 0, 0); return c;
}
export function canvasPngBase64(c: HTMLCanvasElement) { return b64(c.toDataURL('image/png')); }
// a picture resized to w x h, as B G R A (for replacing a texture, every size level)
export function toBgra(img: HTMLImageElement, w: number, h: number): Uint8Array {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true })!; g.imageSmoothingQuality = 'high'; g.clearRect(0, 0, w, h);
  g.drawImage(img, 0, 0, w, h);
  const d = g.getImageData(0, 0, w, h).data; const out = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) { out[i * 4] = d[i * 4 + 2]; out[i * 4 + 1] = d[i * 4 + 1]; out[i * 4 + 2] = d[i * 4]; out[i * 4 + 3] = d[i * 4 + 3]; }
  return out;
}
