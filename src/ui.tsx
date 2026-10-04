import React from 'react';
import { X } from 'lucide-react';

type BtnKind = 'primary' | 'normal' | 'danger' | 'ghost' | 'amber' | 'green';
const BTN: Record<BtnKind, string> = {
  primary: 'bg-[#6ca4d8] hover:bg-[#7db3e4] text-zinc-950 font-bold',
  normal: 'bg-zinc-800/90 hover:bg-zinc-700 text-zinc-200 border border-zinc-700',
  danger: 'bg-red-950/80 hover:bg-red-900 text-red-200 border border-red-700/70',
  ghost: 'text-zinc-300 hover:text-white hover:bg-zinc-800/70',
  amber: 'bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold',
  green: 'bg-emerald-600 hover:bg-emerald-500 text-white font-bold',
};
export const Btn: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { kind?: BtnKind; icon?: React.ReactNode; small?: boolean }> =
  ({ kind = 'normal', icon, small, className = '', children, ...rest }) => (
    <button {...rest}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg ${small ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-2 text-[13px]'} font-semibold tracking-wide transition-colors disabled:opacity-45 disabled:cursor-not-allowed whitespace-nowrap ${BTN[kind]} ${className}`}>
      {icon}{children}
    </button>
  );

export const Card: React.FC<{ className?: string; children: React.ReactNode }> = ({ className = '', children }) => (
  <div className={`bg-[#1b1d21]/92 backdrop-blur-md border border-[#363a44] rounded-xl shadow-xl ${className}`}>{children}</div>
);

export const PageTitle: React.FC<{ icon: React.ReactNode; title: string; sub: string; right?: React.ReactNode }> = ({ icon, title, sub, right }) => (
  <Card className="p-5 flex flex-wrap items-center justify-between gap-4">
    <div className="min-w-0">
      <div className="flex items-center gap-2.5 text-[#6ca4d8]">{icon}<h2 className="text-[26px] leading-none font-bebas tracking-wide text-white">{title}</h2></div>
      <p className="text-[13px] text-zinc-400 mt-2 leading-snug">{sub}</p>
    </div>
    {right && <div className="flex flex-wrap items-center gap-2">{right}</div>}
  </Card>
);

export const Modal: React.FC<{ title: string; sub?: string; icon?: React.ReactNode; onClose: () => void; width?: string; footer?: React.ReactNode; children: React.ReactNode }> =
  ({ title, sub, icon, onClose, width = 'max-w-3xl', footer, children }) => (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-5 bg-black/75 backdrop-blur-sm" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`bg-[#1b1d21] border border-[#363a44] rounded-xl shadow-2xl w-full ${width} max-h-[88vh] flex flex-col overflow-hidden`}>
        <div className="px-5 py-4 border-b border-[#363a44] flex items-start justify-between gap-4 bg-[#22242a]">
          <div className="flex items-start gap-3 min-w-0">
            {icon && <div className="p-2 rounded-lg bg-[#6ca4d8]/15 text-[#6ca4d8] border border-[#6ca4d8]/30 shrink-0">{icon}</div>}
            <div className="min-w-0">
              <h3 className="text-[22px] leading-tight font-bebas tracking-wide text-white">{title}</h3>
              {sub && <p className="text-[13px] text-zinc-400 mt-1 leading-snug">{sub}</p>}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 shrink-0"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
        {footer && <div className="px-5 py-3.5 border-t border-[#363a44] bg-[#1f2126] flex flex-wrap items-center justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );

export const Tick: React.FC<{ on: boolean; onClick?: (e: React.MouseEvent) => void; title?: string }> = ({ on, onClick, title }) => (
  <button title={title} onClick={onClick}
    className={`w-5 h-5 rounded-[5px] border flex items-center justify-center shrink-0 transition-colors ${on ? 'bg-[#6ca4d8] border-[#6ca4d8] text-zinc-950' : 'bg-zinc-900 border-zinc-600 hover:border-zinc-400'}`}>
    {on && <svg viewBox="0 0 16 16" className="w-3.5 h-3.5"><path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>}
  </button>
);

export const Pill: React.FC<{ className?: string; children: React.ReactNode }> = ({ className = '', children }) => (
  <span className={`inline-flex items-center text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded border font-barlow-condensed whitespace-nowrap ${className}`}>{children}</span>
);

export const Section: React.FC<{ icon?: React.ReactNode; title: string; sub?: string; right?: React.ReactNode; children: React.ReactNode }> = ({ icon, title, sub, right, children }) => (
  <Card className="p-5">
    <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
      <div>
        <div className="flex items-center gap-2 text-[#6ca4d8]">{icon}<h3 className="text-[17px] font-bold text-white">{title}</h3></div>
        {sub && <p className="text-[13px] text-zinc-400 mt-1.5 leading-snug">{sub}</p>}
      </div>
      {right}
    </div>
    {children}
  </Card>
);
