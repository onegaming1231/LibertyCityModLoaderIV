import React, { useEffect, useRef, useState } from 'react';
import { Box, RotateCcw, Save, RefreshCw } from 'lucide-react';
import { useApp } from '../App';
import { L } from '../api';
import { Btn, Modal, Tick } from '../ui';

// 3D look at a GTA IV model: characters (.wdd), cars (.wft) and objects (.wdr).
// Model layout from SparkIV by Aru and ahmed605 (GPL v3). Drawn with plain WebGL.

interface Mesh { pos: Float32Array; nrm: Float32Array; uv: Float32Array; idx: Uint16Array; hasNormal: boolean; texture: string | null; shader: string }
interface Part { name: string; show: boolean; meshes: Mesh[] }
export interface ModelData { title: string; kind: 'car' | 'character' | 'object'; parts: Part[]; textures: Record<string, { width: number; height: number; bgra: Uint8Array }>; missing: string[]; found: string[] }

const PAINTS = ['#c8ccd2', '#16181c', '#a3121b', '#1f4fa8', '#e2b007', '#2e7d32', '#e8e8e8', '#6b4a2b'];
const KIND_NAME = { car: 'Car', character: 'Character', object: 'Object' };

// ---- tiny matrix helpers (column-major, like WebGL wants) ----
type M4 = Float32Array;
const persp = (fov: number, asp: number, n: number, f: number): M4 => { const t = 1 / Math.tan(fov / 2), m = new Float32Array(16); m[0] = t / asp; m[5] = t; m[10] = (f + n) / (n - f); m[11] = -1; m[14] = (2 * f * n) / (n - f); return m; };
const sub = (a: number[], b: number[]) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: number[], b: number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: number[]) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const lookAt = (eye: number[], at: number[], up: number[]): M4 => {
  const z = norm(sub(eye, at)), x = norm(cross(up, z)), y = cross(z, x);
  return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, eye), -dot(y, eye), -dot(z, eye), 1]);
};
const mul = (a: M4, b: M4): M4 => { const o = new Float32Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; };

const VS = `#version 300 es
in vec3 aPos; in vec3 aNrm; in vec2 aUv;
uniform mat4 uMvp;
out vec3 vN; out vec2 vUv; out vec3 vP;
void main() { vN = aNrm; vUv = aUv; vP = aPos; gl_Position = uMvp * vec4(aPos, 1.0); }`;
const FS = `#version 300 es
precision highp float;
in vec3 vN; in vec2 vUv; in vec3 vP;
uniform sampler2D uTex; uniform bool uHasTex; uniform vec4 uColor; uniform bool uHasNormal;
uniform vec3 uLight; uniform vec3 uEye; uniform bool uGlass; uniform float uShine; uniform float uCut;
out vec4 o;
void main() {
  vec4 c = uHasTex ? texture(uTex, vUv).bgra : vec4(1.0);
  c *= uColor;
  if (!uGlass && c.a < uCut) discard;
  vec3 n = uHasNormal ? normalize(vN) : normalize(cross(dFdx(vP), dFdy(vP)));
  vec3 v = normalize(uEye - vP);
  if (dot(n, v) < 0.0) n = -n;
  vec3 l = normalize(uLight);
  float d = max(dot(n, l), 0.0);
  float hemi = 0.5 + 0.5 * n.z;
  vec3 col = c.rgb * (0.30 + 0.25 * hemi + 0.60 * d);
  col += vec3(pow(max(dot(reflect(-l, n), v), 0.0), 40.0)) * uShine;
  o = vec4(col, uGlass ? max(0.28, c.a * 0.6) : 1.0);
}`;

const hex = (h: string) => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
const f32 = (x: any) => (x instanceof Float32Array ? x : new Float32Array(x));
const u16 = (x: any) => (x instanceof Uint16Array ? x : new Uint16Array(x));

export const ModelViewer: React.FC<{ model: ModelData; onClose: () => void }> = ({ model, onClose }) => {
  const { status } = useApp();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [shown, setShown] = useState<boolean[]>(() => model.parts.map((p) => p.show));
  const [paint, setPaint] = useState(PAINTS[0]);
  const [spin, setSpin] = useState(false);
  const [bad, setBad] = useState('');
  const st = useRef<any>({ yaw: 0.95, pitch: 0.3, zoom: 1, pan: [0, 0, 0], shown, paint, spin, draw: () => {} });
  st.current.shown = shown; st.current.paint = paint; st.current.spin = spin;
  useEffect(() => { st.current.req?.(); }, [shown, paint, spin]);

  useEffect(() => {
    const cv = canvas.current!; const s = st.current;
    const gl = cv.getContext('webgl2', { antialias: true, preserveDrawingBuffer: true }) as WebGL2RenderingContext | null;
    if (!gl) { setBad("Your graphics card can't show 3D here."); return; }
    const sh = (t: number, src: string) => { const x = gl.createShader(t)!; gl.shaderSource(x, src); gl.compileShader(x); if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(x) || 'shader'); return x; };
    const prog = gl.createProgram()!;
    try { gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS)); } catch (e: any) { setBad("Couldn't start the 3D view: " + e.message); return; }
    gl.bindAttribLocation(prog, 0, 'aPos'); gl.bindAttribLocation(prog, 1, 'aNrm'); gl.bindAttribLocation(prog, 2, 'aUv');
    gl.linkProgram(prog); gl.useProgram(prog);
    const U: Record<string, WebGLUniformLocation | null> = {};
    for (const n of ['uMvp', 'uTex', 'uHasTex', 'uColor', 'uHasNormal', 'uLight', 'uEye', 'uGlass', 'uShine', 'uCut']) U[n] = gl.getUniformLocation(prog, n);

    // pictures
    const tex = new Map<string, WebGLTexture>();
    for (const [name, t] of Object.entries(model.textures)) {
      const g = gl.createTexture()!; gl.bindTexture(gl.TEXTURE_2D, g);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, t.width, t.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(t.bgra as any));
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
      const ext = gl.getExtension('EXT_texture_filter_anisotropic'); if (ext) gl.texParameterf(gl.TEXTURE_2D, ext.TEXTURE_MAX_ANISOTROPY_EXT, 8);
      tex.set(name.toLowerCase(), g);
    }
    // shapes
    const parts = model.parts.map((p) => p.meshes.map((m) => {
      const vao = gl.createVertexArray()!; gl.bindVertexArray(vao);
      const buf = (i: number, data: Float32Array, n: number) => { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW); gl.enableVertexAttribArray(i); gl.vertexAttribPointer(i, n, gl.FLOAT, false, 0, 0); };
      const pos = f32(m.pos); buf(0, pos, 3); buf(1, f32(m.nrm), 3); buf(2, f32(m.uv), 2);
      const idx = u16(m.idx); const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
      gl.bindVertexArray(null);
      const shd = (m.shader || '').toLowerCase(), tn = (m.texture || '').toLowerCase();
      const glass = /glass/.test(shd) || /glass/.test(tn);
      const isPaint = model.kind === 'car' && /paint/.test(shd) && (!tex.has(tn) || /generic|spec|dirt/.test(tn));
      let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < pos.length; i += 3) for (let k = 0; k < 3; k++) { const v = pos[i + k]; if (v < lo[k]) lo[k] = v; if (v > hi[k]) hi[k] = v; }
      const cut = /alpha|cutout|hair|decal|tree|grass|fence|leaf|cloth_?a/.test(shd) ? 0.35 : -1;
      return { cut, vao, count: idx.length, tex: isPaint ? null : tex.get(tn) || null, hasNormal: m.hasNormal, glass, isPaint, lo, hi };
    }));

    let dragging = 0, lx = 0, ly = 0, raf = 0, alive = true;
    const bounds = () => {
      let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
      parts.forEach((p, i) => { if (!s.shown[i]) return; for (const m of p) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], m.lo[k]); hi[k] = Math.max(hi[k], m.hi[k]); } });
      if (!isFinite(lo[0])) { lo = [-1, -1, -1]; hi = [1, 1, 1]; }
      return { c: [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2], r: Math.max(0.2, Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) / 2) };
    };
    s.fit = () => { const b = bounds(); s.center = b.c; s.radius = b.r; s.pan = [0, 0, 0]; s.zoom = 1; };
    s.fit();
    s.draw = () => {
      const dpr = window.devicePixelRatio || 1, w = Math.max(1, Math.round(cv.clientWidth * dpr)), h = Math.max(1, Math.round(cv.clientHeight * dpr));
      if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
      gl.viewport(0, 0, w, h);
      gl.clearColor(0.10, 0.11, 0.13, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      const fov = 0.75, dist = (s.radius / Math.sin(fov / 2)) * 0.82 * s.zoom;
      const at = [s.center[0] + s.pan[0], s.center[1] + s.pan[1], s.center[2] + s.pan[2]];
      const eye = [at[0] + dist * Math.cos(s.pitch) * Math.cos(s.yaw), at[1] + dist * Math.cos(s.pitch) * Math.sin(s.yaw), at[2] + dist * Math.sin(s.pitch)];
      s.eye = eye; s.at = at; s.dist = dist;
      const mvp = mul(persp(fov, w / h, Math.max(0.01, dist - s.radius * 3), dist + s.radius * 3), lookAt(eye, at, [0, 0, 1]));
      gl.useProgram(prog);
      gl.uniformMatrix4fv(U.uMvp, false, mvp);
      const side = norm(cross(sub(eye, at), [0, 0, 1]));
      gl.uniform3fv(U.uLight, norm([eye[0] - at[0] + side[0] * dist * 0.6, eye[1] - at[1] + side[1] * dist * 0.6, eye[2] - at[2] + dist * 0.8]));
      gl.uniform3fv(U.uEye, eye); gl.uniform1i(U.uTex, 0); gl.activeTexture(gl.TEXTURE0);
      gl.enable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE);
      const pc = hex(s.paint);
      for (const pass of [0, 1]) {
        if (pass === 1) { gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false); } else { gl.disable(gl.BLEND); gl.depthMask(true); }
        parts.forEach((p, i) => {
          if (!s.shown[i]) return;
          for (const m of p) {
            if (m.glass !== (pass === 1)) continue;
            gl.bindVertexArray(m.vao);
            gl.uniform1i(U.uHasTex, m.tex ? 1 : 0); if (m.tex) gl.bindTexture(gl.TEXTURE_2D, m.tex);
            const c = m.isPaint ? pc : m.glass && !m.tex ? [0.55, 0.68, 0.78] : m.tex ? [1, 1, 1] : [0.62, 0.64, 0.68];
            gl.uniform4f(U.uColor, c[0], c[1], c[2], 1);
            gl.uniform1i(U.uHasNormal, m.hasNormal ? 1 : 0); gl.uniform1i(U.uGlass, m.glass ? 1 : 0);
            gl.uniform1f(U.uCut, m.cut); gl.uniform1f(U.uShine, m.isPaint || m.glass ? 0.45 : 0.08);
            gl.drawElements(gl.TRIANGLES, m.count, gl.UNSIGNED_SHORT, 0);
          }
        });
      }
      gl.depthMask(true); gl.bindVertexArray(null);
    };
    // draw only when something changed (or while it spins) - keeps the computer quiet
    let last = 0;
    const frame = (t: number) => { raf = 0; if (!alive) return; if (s.spin) { s.yaw += Math.min(50, last ? t - last : 16) * 0.0006; last = t; s.req(); } else last = 0; s.draw(); };
    s.req = () => { if (!raf && alive) raf = requestAnimationFrame(frame); };
    s.req();
    const ro = new ResizeObserver(() => s.req()); ro.observe(cv);

    const down = (e: MouseEvent) => { dragging = e.button === 2 || e.shiftKey ? 2 : 1; lx = e.clientX; ly = e.clientY; };
    const move = (e: MouseEvent) => {
      if (!dragging) return; const dx = e.clientX - lx, dy = e.clientY - ly; lx = e.clientX; ly = e.clientY;
      s.req();
      if (dragging === 1) { s.yaw -= dx * 0.008; s.pitch = Math.max(-1.5, Math.min(1.5, s.pitch + dy * 0.008)); }
      else {
        const f = norm(sub(s.at, s.eye)), r = norm(cross(f, [0, 0, 1])), u = cross(r, f), k = (s.dist / cv.clientHeight) * 0.8;
        for (let i = 0; i < 3; i++) s.pan[i] += -r[i] * dx * k + u[i] * dy * k;
      }
    };
    const up = () => { dragging = 0; };
    const wheel = (e: WheelEvent) => { e.preventDefault(); s.zoom = Math.max(0.05, Math.min(8, s.zoom * Math.exp(e.deltaY * 0.0012))); s.req(); };
    const ctx = (e: Event) => e.preventDefault();
    cv.addEventListener('mousedown', down); window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
    cv.addEventListener('wheel', wheel, { passive: false }); cv.addEventListener('contextmenu', ctx);
    return () => {
      alive = false; cancelAnimationFrame(raf); ro.disconnect();
      cv.removeEventListener('mousedown', down); window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up);
      cv.removeEventListener('wheel', wheel); cv.removeEventListener('contextmenu', ctx);
      (gl.getExtension('WEBGL_lose_context') as any)?.loseContext();
    };
  }, [model]);

  function toggle(i: number) { const n = shown.slice(); n[i] = !n[i]; setShown(n); st.current.shown = n; st.current.fit?.(); }
  async function savePic() {
    const cv = canvas.current; if (!cv) return;
    const p = await L.dialog.save({ title: 'Save picture', defaultPath: model.title.replace(/\.[^.]+$/, '') + '.png', filters: [{ name: 'PNG picture', extensions: ['png'] }] }); if (!p) return;
    st.current.draw(); await L.file.writePng(p, cv.toDataURL('image/png').split(',')[1]); status('Saved ' + p.split(/[\\/]/).pop() + '.', 'green');
  }
  const tris = model.parts.reduce((a, p, i) => a + (shown[i] ? p.meshes.reduce((b, m) => b + m.idx.length / 3, 0) : 0), 0);
  const missing = model.missing.length;

  return (
    <Modal title={'3D View  -  ' + model.title} sub="Drag to turn it.  Right-drag to move it.  Scroll to zoom." icon={<Box className="w-5 h-5" />} onClose={onClose} width="max-w-6xl"
      footer={<>
        <span className="text-[12.5px] text-zinc-500 mr-auto">
          {KIND_NAME[model.kind]}  -  {Math.round(tris).toLocaleString()} triangles{missing ? '  -  ' + missing + " picture(s) not found, shown gray" + (model.kind === 'car' ? ' (pick your GTA IV folder to get the shared car pictures)' : '') : ''}
        </span>
        <Btn icon={<RotateCcw className="w-4 h-4" />} onClick={() => { st.current.yaw = 0.95; st.current.pitch = 0.3; st.current.fit?.(); st.current.req?.(); }}>Reset View</Btn>
        <Btn icon={<RefreshCw className="w-4 h-4" />} kind={spin ? 'primary' : undefined} onClick={() => setSpin(!spin)}>Spin</Btn>
        <Btn icon={<Save className="w-4 h-4" />} onClick={savePic}>Save Picture...</Btn>
        <Btn onClick={onClose}>Close</Btn>
      </>}>
      <div className="flex h-[64vh]">
        {(model.parts.length > 1 || model.kind === 'car') && (
          <div className="w-[230px] shrink-0 overflow-y-auto border-r border-[#2d3038] p-3 space-y-4">
            {model.kind === 'car' && (
              <div>
                <div className="text-[12px] font-bold uppercase tracking-wider text-zinc-400 font-barlow-condensed mb-2">Paint color</div>
                <div className="flex flex-wrap gap-2">
                  {PAINTS.map((c) => <button key={c} title={c} onClick={() => setPaint(c)} className={`w-7 h-7 rounded-full border-2 ${paint === c ? 'border-white' : 'border-zinc-700'}`} style={{ background: c }} />)}
                  <input type="color" value={paint} onChange={(e) => setPaint(e.target.value)} className="w-7 h-7 rounded-full bg-transparent cursor-pointer" title="Any color" />
                </div>
              </div>
            )}
            {model.parts.length > 1 && (
              <div>
                <div className="text-[12px] font-bold uppercase tracking-wider text-zinc-400 font-barlow-condensed mb-2">Parts</div>
                {model.parts.map((p, i) => (
                  <div key={i} className="flex items-center gap-2 py-1 text-[13px] text-zinc-200 cursor-pointer" onClick={() => toggle(i)}>
                    <Tick on={shown[i]} /><span className="truncate">{p.name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="flex-1 relative bg-[#1a1c21]">
          <canvas ref={canvas} className="absolute inset-0 w-full h-full cursor-grab active:cursor-grabbing" />
          {bad && <div className="absolute inset-0 flex items-center justify-center text-zinc-400 text-sm">{bad}</div>}
        </div>
      </div>
    </Modal>
  );
};
