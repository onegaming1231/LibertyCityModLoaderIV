import React from 'react';
import { Play, RotateCcw, AlertTriangle } from 'lucide-react';
import { useApp } from '../App';
import { call, L } from '../api';
import { MusicPlayer } from './MusicPlayer';

export const Header: React.FC<{ tagline: string }> = ({ tagline }) => {
  const { mods, game, run, refresh, status, setPage } = useApp();
  const [ts, setTs] = React.useState<any>(null);
  React.useEffect(() => { if (game) call('tsState').then(setTs).catch(() => {}); }, [game, mods]);
  const on = mods.filter((m) => m.on).length;
  const noMods = ts && ts.mode === 'nomods';
  async function toggleNoMods() {
    if (!game) return;
    await run(() => call(noMods ? 'stopTroubleshoot' : 'startNoMods'));
    await refresh(); setTs(await call('tsState').catch(() => null));
  }
  async function launch() {
    const r = await L.launchGame(game);
    status(r.how === 'Steam' ? 'Starting GTA IV through Steam...' : 'Starting GTA IV...', 'green');
  }
  return (
    <header className="relative z-30 shrink-0 bg-[#1b1d21]/95 backdrop-blur-md border-b border-[#363a44] px-5 py-3 select-none">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <img src="./favicon.ico" className="w-10 h-10 rounded border border-[#363a44]" onError={(e) => ((e.currentTarget as HTMLElement).style.display = 'none')} />
          <div className="min-w-0">
            <div className="flex items-baseline gap-2">
              <h1 className="text-[30px] font-bebas tracking-wide text-white leading-none">LIBERTY CITY MOD LOADER IV</h1>
              <span className="text-[12px] font-barlow-condensed font-bold uppercase px-1.5 py-0.5 rounded bg-[#6ca4d8]/20 text-[#8cbbe6] border border-[#6ca4d8]/40">v1.0</span>
            </div>
            <p className="text-[12px] text-zinc-400 italic tracking-wide mt-0.5 truncate">{tagline}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <MusicPlayer />
          {mods.some((m) => m.missing > 0) && (
            <button onClick={() => setPage('my-mods')} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-950/80 border border-amber-600/60 text-amber-200 text-[12px] font-semibold">
              <AlertTriangle className="w-3.5 h-3.5" />Files missing
            </button>
          )}
          <div className="hidden xl:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#111214]/90 border border-[#363a44] text-[12px]">
            <span className="text-zinc-400">Mods on:</span><span className="font-bold text-emerald-400">{on}</span><span className="text-zinc-500">of</span><span className="text-zinc-200">{mods.length}</span>
          </div>
          <button disabled={!game || (ts && ts.mode === 'find')} onClick={toggleNoMods}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold disabled:opacity-40 ${noMods ? 'bg-amber-500 text-black' : 'bg-zinc-800/90 hover:bg-zinc-700 text-zinc-200 border border-zinc-700'}`}>
            <RotateCcw className="w-3.5 h-3.5" />{noMods ? 'Turn My Mods Back On' : 'Play Without Mods'}
          </button>
          <button disabled={!game} onClick={launch} className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[13px] font-bold uppercase tracking-wider font-barlow-condensed bg-[#6ca4d8] hover:bg-[#7db3e4] text-zinc-950 disabled:opacity-40">
            <Play className="w-3.5 h-3.5 fill-current" />Start GTA IV
          </button>
        </div>
      </div>
    </header>
  );
};
