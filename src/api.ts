// Talking to the app: every action goes to the engine, which does the real file work.
export const L = window.lcml;

export class AppError extends Error { friendly = false; }

export async function call<T = any>(fn: string, ...args: any[]): Promise<T> {
  const r = await L.call(fn, ...args);
  if (!r.ok) { const e = new AppError(r.error || 'Something went wrong.'); e.friendly = !!r.friendly; throw e; }
  return r.value as T;
}

// a local file as a URL the window can show (background videos, pictures, music)
export const fileUrl = (p: string) => 'lcml://local/' + encodeURIComponent(p);
export const baseName = (p: string) => p.split(/[\\/]/).pop() || p;

export type Color = 'dim' | 'green' | 'amber' | 'red' | 'text';
export const colorClass: Record<string, string> = {
  dim: 'text-zinc-400', green: 'text-emerald-400', amber: 'text-amber-300', red: 'text-red-400', text: 'text-zinc-100',
};

export interface ModRow {
  name: string; order: number; on: boolean; date: string; files: number; replaced: number; missing: number; found: boolean;
  version: string; update: string; url: string; nexusId: string; archives: number; thumb: string | null; fileList: string[];
}
export interface PlanRow { Source: string; Dest: string; Kind: string; Note: string }
export interface Plan { id: string; modName: string; rows: PlanRow[]; warning: string; checks: string[]; source: any; temp?: string; file?: string }
export interface Essentials { version: string; complete: boolean; fusionFix: boolean; fusionFixVersion: string; vehicleBudget: string | null; scriptHookDotNet: boolean; dlss: boolean; sevenZip: boolean }

export const KIND_LABEL: Record<string, string> = {
  OVERLOADER: 'Game file', SCRIPT: 'Script', 'GAME FOLDER': 'Plugin', IMG: 'Packed model', ARCHIVE: 'Into archive', CORE: 'Fusion Fix',
  GRAPHICS: 'Graphics', MANUAL: 'Needs you', SKIP: 'Skipped', PREVIEW: 'Preview', 'DATA LINES': 'Adds lines',
};
export const KIND_STYLE: Record<string, string> = {
  OVERLOADER: 'bg-teal-500/15 text-teal-300 border-teal-500/40', SCRIPT: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/40',
  'GAME FOLDER': 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40', IMG: 'bg-blue-500/15 text-blue-300 border-blue-500/40',
  ARCHIVE: 'bg-purple-500/15 text-purple-300 border-purple-500/40', CORE: 'bg-sky-500/15 text-sky-300 border-sky-500/40',
  GRAPHICS: 'bg-orange-500/15 text-orange-300 border-orange-500/40', MANUAL: 'bg-amber-500/15 text-amber-300 border-amber-500/50',
  SKIP: 'bg-zinc-700/40 text-zinc-400 border-zinc-600/40', PREVIEW: 'bg-pink-500/15 text-pink-300 border-pink-500/40',
  'DATA LINES': 'bg-yellow-500/15 text-yellow-200 border-yellow-500/40',
};
