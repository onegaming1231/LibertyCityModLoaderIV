import React from 'react';
import { Layers, Download, Globe, Archive, Settings, HardDrive, CheckCircle2, AlertCircle } from 'lucide-react';
import { useApp } from '../App';

export type Page = 'my-mods' | 'install' | 'get-mods' | 'archives' | 'settings';

export const Sidebar: React.FC = () => {
  const { page, setPage, mods, plan, game, ess } = useApp();
  const on = mods.filter((m) => m.on).length;
  const items: { id: Page; label: string; sub: string; icon: any; badge?: string; badgeCls?: string }[] = [
    { id: 'get-mods', label: 'Get Mods', sub: 'Mod sites and downloads', icon: Globe },
    { id: 'install', label: 'Install', sub: 'Drop a zip, rar, 7z or oiv', icon: Download, badge: plan ? 'ready' : undefined, badgeCls: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' },
    { id: 'my-mods', label: 'My Mods', sub: 'On / off and order', icon: Layers, badge: mods.length ? String(on) : undefined, badgeCls: 'bg-[#6ca4d8]/20 text-[#8cbbe6] border border-[#6ca4d8]/40' },
    { id: 'archives', label: 'Archives', sub: 'Look inside .img and .rpf', icon: Archive },
    { id: 'settings', label: 'Settings', sub: 'Essentials and look', icon: Settings },
  ];
  const short = game.length > 30 ? '...' + game.slice(-28) : game;
  return (
    <aside className="w-64 shrink-0 bg-[#1b1d21]/93 backdrop-blur-md border-r border-[#363a44] flex flex-col justify-between select-none">
      <nav className="p-3 space-y-1.5 overflow-y-auto">
        <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 px-3 pt-1 pb-2 font-barlow-condensed">Menu</div>
        {items.map((it) => {
          const Icon = it.icon, act = page === it.id;
          return (
            <button key={it.id} onClick={() => setPage(it.id)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-left transition-colors ${act ? 'bg-[#6ca4d8]/20 text-white border border-[#6ca4d8]/50' : 'text-zinc-300 hover:text-white hover:bg-zinc-800/60 border border-transparent'}`}>
              <div className="flex items-center gap-3 min-w-0">
                <Icon className={`w-5 h-5 shrink-0 ${act ? 'text-[#6ca4d8]' : 'text-zinc-400'}`} />
                <div className="min-w-0">
                  <div className="text-[15px] font-semibold leading-tight">{it.label}</div>
                  <div className="text-[12px] text-zinc-500 leading-tight mt-0.5 truncate">{it.sub}</div>
                </div>
              </div>
              {it.badge && <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full ${it.badgeCls}`}>{it.badge}</span>}
            </button>
          );
        })}
      </nav>
      <div className="p-3 border-t border-[#363a44]/80 bg-[#16171a]/90 space-y-2">
        <div className="flex items-center justify-between text-[12px]">
          <span className="text-zinc-400 flex items-center gap-1.5"><HardDrive className="w-3.5 h-3.5" />GTA IV folder</span>
          {game ? <span className="flex items-center gap-1 text-emerald-400 font-semibold"><CheckCircle2 className="w-3.5 h-3.5" />Found</span>
            : <button onClick={() => setPage('settings')} className="flex items-center gap-1 text-amber-300 font-semibold"><AlertCircle className="w-3.5 h-3.5" />Set it up</button>}
        </div>
        <div className="text-[11px] font-mono text-zinc-400 bg-zinc-900/80 px-2 py-1.5 rounded border border-zinc-800 truncate" title={game}>{short || 'Not set'}</div>
        <div className="flex items-center justify-between text-[12px] pt-0.5">
          <span className="text-zinc-500">Fusion Fix</span>
          {ess?.fusionFix ? <span className="text-emerald-400 font-semibold">Installed{ess.fusionFixVersion ? ' ' + ess.fusionFixVersion : ''}</span> : <span className="text-red-400 font-semibold">{game ? 'Missing' : '-'}</span>}
        </div>
      </div>
    </aside>
  );
};
