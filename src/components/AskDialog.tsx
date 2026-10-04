import React, { useEffect } from 'react';
import { HelpCircle } from 'lucide-react';
import { Btn } from '../ui';

export interface AskReq { message: string; title: string; buttons: string[]; resolve: (v: string) => void }
// the app's question box (same look as the rest of the app)
export const AskDialog: React.FC<{ req: AskReq; onDone: (v: string) => void }> = ({ req, onDone }) => {
  const cancel = req.buttons.includes('Cancel') ? 'Cancel' : req.buttons.includes('No') ? 'No' : req.buttons[req.buttons.length - 1];
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onDone(cancel); if (e.key === 'Enter') onDone(req.buttons[0]); };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [req, onDone, cancel]);
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-6 bg-black/70 backdrop-blur-sm">
      <div className="bg-[#1b1d21] border border-[#3d424d] rounded-xl shadow-2xl w-full max-w-xl overflow-hidden">
        <div className="px-5 pt-5 pb-4 flex gap-4">
          <div className="p-2 h-fit rounded-lg bg-[#6ca4d8]/15 text-[#6ca4d8] border border-[#6ca4d8]/30"><HelpCircle className="w-5 h-5" /></div>
          <div className="min-w-0 flex-1">
            <h3 className="text-[22px] font-bebas tracking-wide text-white leading-tight">{req.title}</h3>
            <div className="mt-2 text-[14px] text-zinc-300 whitespace-pre-wrap leading-relaxed max-h-[55vh] overflow-y-auto pr-1">{req.message}</div>
          </div>
        </div>
        <div className="px-5 py-3.5 bg-[#16181b] border-t border-[#2d3038] flex flex-wrap justify-end gap-2">
          {req.buttons.slice().reverse().map((b, i) => (
            <Btn key={b} kind={b === req.buttons[0] ? 'primary' : 'normal'} onClick={() => onDone(b)} autoFocus={b === req.buttons[0]} className="outline-none focus-visible:ring-2 focus-visible:ring-white/50">{b}</Btn>
          ))}
        </div>
      </div>
    </div>
  );
};
