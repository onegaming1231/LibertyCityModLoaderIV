/// <reference types="vite/client" />
declare module '*.jpg' { const src: string; export default src; }
declare module '*.png' { const src: string; export default src; }
declare module '*.mp4' { const src: string; export default src; }

type Off = () => void;
interface LcmlBridge {
  isApp: boolean;
  pathOf: (f: File) => string;
  call: (fn: string, ...args: any[]) => Promise<{ ok: boolean; value?: any; error?: string; friendly?: boolean }>;
  onStatus: (cb: (text: string, color: string) => void) => Off;
  onHost: (cb: (id: number, kind: string, args: any) => void) => Off;
  hostReply: (id: number, value: any) => void;
  onOpenArg: (cb: (arg: string) => void) => Off;
  onDownloaded: (cb: (d: { path: string; title: string }) => void) => Off;
  onDownloadLanded: (cb: (p: string) => void) => Off;
  onLiveWallpaper: (cb: (p: string) => void) => Off;
  look: { get: () => Promise<any>; set: (o: any) => Promise<boolean>; import: (f: string) => Promise<string> };
  dialog: { open: (o?: any) => Promise<any>; save: (o?: any) => Promise<string | null> };
  shell: { external: (u: string) => Promise<any>; open: (p: string) => Promise<any>; show: (p: string) => Promise<any> };
  file: { writePng: (p: string, b64: string) => Promise<boolean>; read: (p: string) => Promise<Uint8Array>; exists: (p: string) => Promise<boolean> };
  info: () => Promise<{ version: string; platform: string; exe: string; packaged: boolean; arg: string }>;
  launchGame: (dir: string) => Promise<{ ok: boolean; how: string }>;
  reg: { menu: (on: boolean) => Promise<boolean>; menuState: () => Promise<boolean>; nxm: (on: boolean) => Promise<boolean>; nxmState: () => Promise<boolean> };
  watch: (on: boolean) => Promise<string | false>;
  music: { list: (folder: string) => Promise<string[]>; ytm: (base: string, token: string, method: string, p: string, body?: any) => Promise<{ code: number; data: any }> };
}
interface Window { lcml: LcmlBridge }
