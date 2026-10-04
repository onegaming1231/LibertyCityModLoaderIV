import React, { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { useApp } from '../App';
import { call } from '../api';
import { Btn, Modal, Tick } from '../ui';

export const CleanUp: React.FC<{ items: any[]; onClose: (r: any) => void }> = ({ items, onClose }) => {
  const { run, status } = useApp();
  const [on, setOn] = useState<boolean[]>(items.map((x) => !!x.Tick));
  async function go() {
    const picked = items.filter((_, i) => on[i]);
    if (!picked.length) { status('Nothing was cleaned.', 'dim'); onClose(null); return; }
    const r = await run(() => call('cleanLeftovers', picked), 'Cleaning...');
    onClose(r);
  }
  return (
    <Modal title="Leftovers found" sub="Files left behind by mods you removed. Ticked items are cleaned. Files go to the Recycle Bin." icon={<Sparkles className="w-5 h-5" />} onClose={() => onClose(null)} width="max-w-4xl"
      footer={<><Btn onClick={() => onClose(null)}>Close</Btn><Btn kind="primary" onClick={go}>Clean Ticked</Btn></>}>
      <div className="p-5 space-y-2">
        {items.map((it, i) => (
          <div key={i} onClick={() => setOn(on.map((v, j) => (j === i ? !v : v)))} className="cursor-pointer rounded-lg bg-[#24262c] hover:bg-[#2c2f36] border border-[#33363f] px-4 py-3 flex gap-4">
            <div className="pt-1"><Tick on={on[i]} /></div>
            <div className="min-w-0">
              <div className={`text-[15px] font-semibold ${on[i] ? 'text-white' : 'text-zinc-400'}`}>{it.Title}  <span className="text-zinc-500 font-normal">({it.Files.length} file{it.Files.length !== 1 ? 's' : ''})</span></div>
              <div className="text-[13px] text-zinc-400 mt-1 leading-snug">{it.Why}</div>
              <div className="text-[12px] text-zinc-500 mt-1 truncate">{it.Files.slice(0, 3).join('    ')}{it.Files.length > 3 ? '    +' + (it.Files.length - 3) + ' more' : ''}</div>
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
};
