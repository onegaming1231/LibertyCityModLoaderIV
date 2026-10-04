import React, { useEffect, useRef, useState } from 'react';
import { Image as ImageIcon, Save, Replace } from 'lucide-react';
import { useApp } from '../App';
import { call, L } from '../api';
import { Btn, Modal } from '../ui';
import { bgraToCanvas, canvasPngBase64, loadImage, toBgra } from '../imageOps';

// see the pictures inside a .wtd, save them, replace one (texture layout from SparkIV by Aru and ahmed605, GPL v3)
export const Textures: React.FC<{ tex: any; onClose: (r: any) => void }> = ({ tex, onClose }) => {
  const { run, status, ask } = useApp();
  const [i, setI] = useState(0);
  const [changed, setChanged] = useState<Set<number>>(new Set());
  const box = useRef<HTMLDivElement>(null);
  const shown = useRef<HTMLCanvasElement | null>(null);
  async function show(k: number, px?: any) {
    try {
      const p = px || (await call('texturePixels', tex.id, k));
      const c = bgraToCanvas(new Uint8Array(p.bgra), p.width, p.height);
      const big = Math.max(p.width, p.height), scale = big < 384 ? Math.floor(384 / big) : 1;
      c.style.width = Math.round(p.width * scale) + 'px'; c.style.maxWidth = '100%'; c.style.maxHeight = '100%'; c.style.objectFit = 'contain';
      c.style.imageRendering = scale > 1 ? 'pixelated' : 'auto';
      shown.current = c;
      if (box.current) { box.current.innerHTML = ''; box.current.appendChild(c); }
    } catch (e: any) { if (box.current) box.current.innerHTML = '<div class="text-zinc-500 text-sm">Can\'t show this picture.</div>'; }
  }
  useEffect(() => { show(i); /* eslint-disable-next-line */ }, [i]);
  const t = tex.textures[i];
  async function save() {
    const p = await L.dialog.save({ title: 'Save picture', defaultPath: t.name.replace(/[\\/:*?"<>|]/g, '_') + '.png', filters: [{ name: 'PNG picture', extensions: ['png'] }] });
    if (!p || !shown.current) return;
    await L.file.writePng(p, canvasPngBase64(shown.current)); status('Saved ' + p.split(/[\\/]/).pop() + '.', 'green');
  }
  async function replace() {
    const f = await L.dialog.open({ title: 'Pick the new picture for ' + t.name, filters: [{ name: 'Pictures', extensions: ['png', 'jpg', 'jpeg', 'bmp', 'gif', 'webp'] }] }); if (!f) return;
    try {
      const img = await loadImage(await L.file.read(f));
      const levels = await call<{ w: number; h: number }[]>('textureLevels', tex.id, i);
      const px = await run(() => call('replaceTexture', tex.id, i, levels.map((l) => ({ w: l.w, h: l.h, bgra: toBgra(img, l.w, l.h) }))), 'Packing the new picture...');
      if (!px) return;
      setChanged(new Set([...changed, i])); await show(i, px);
      status("Replaced '" + t.name + "' (" + t.width + ' x ' + t.height + '). Press Use Changes when you are done.', 'green');
    } catch (e: any) { await ask("Couldn't use that picture:\n\n" + e.message, 'Replace Picture', ['OK']); }
  }
  async function done() {
    let savePath: string | null = null;
    if (tex.file) { savePath = await L.dialog.save({ title: 'Save the changed texture file', defaultPath: tex.file, filters: [{ name: 'Texture files', extensions: ['wtd'] }] }); if (!savePath) return; }
    const r = await run(() => call('finishTextures', tex.id, savePath)); onClose(r);
  }
  const close = () => { call('closeTextures', tex.id).catch(() => {}); onClose(null); };
  return (
    <Modal title={'Textures  -  ' + tex.title} sub="Pick a picture to see it. Replace Picture uses your image (png, jpg, bmp). It's resized to the same size by itself." icon={<ImageIcon className="w-5 h-5" />} onClose={close} width="max-w-6xl"
      footer={<>
        <Btn icon={<Save className="w-4 h-4" />} onClick={save}>Save Picture...</Btn>
        <Btn icon={<Replace className="w-4 h-4" />} onClick={replace}>Replace Picture...</Btn>
        <span className="flex-1" />
        <Btn onClick={close}>Close</Btn>
        <Btn kind="primary" disabled={!changed.size} onClick={done}>Use Changes</Btn>
      </>}>
      <div className="flex h-[62vh]">
        <div className="w-[380px] shrink-0 overflow-y-auto border-r border-[#2d3038]">
          {tex.textures.map((x: any) => (
            <button key={x.index} onClick={() => setI(x.index)} className={`w-full text-left px-4 py-2 border-b border-[#24272d] grid grid-cols-[1fr_90px_74px] gap-2 text-[13px] ${i === x.index ? 'bg-[#6ca4d8]/20' : 'hover:bg-white/[0.04]'}`}>
              <span className={`truncate ${changed.has(x.index) ? 'text-emerald-300 font-semibold' : 'text-zinc-100'}`}>{x.name}</span><span className="text-zinc-400">{x.width} x {x.height}</span><span className="text-zinc-500">{x.type}</span>
            </button>
          ))}
        </div>
        <div ref={box} className="flex-1 flex items-center justify-center p-4" style={{ background: 'repeating-conic-gradient(#23252a 0% 25%, #1a1c20 0% 50%) 50% / 22px 22px' }} />
      </div>
    </Modal>
  );
};
