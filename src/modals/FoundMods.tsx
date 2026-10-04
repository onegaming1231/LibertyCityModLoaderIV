import React, { useState } from 'react';
import { FolderSearch, Trash2 } from 'lucide-react';
import { useApp } from '../App';
import { call } from '../api';
import { Btn, Modal, Tick, Pill } from '../ui';

const PILL: Record<string, string> = { Mod: 'bg-sky-600/30 text-sky-200 border-sky-500/50', 'Loose files': 'bg-zinc-600/30 text-zinc-200 border-zinc-500/50', Script: 'bg-emerald-700/30 text-emerald-200 border-emerald-500/50',
  Plugin: 'bg-violet-700/30 text-violet-200 border-violet-500/50', 'Script loader': 'bg-emerald-700/30 text-emerald-200 border-emerald-500/50', Graphics: 'bg-orange-700/30 text-orange-200 border-orange-500/50' };
export const FoundMods: React.FC<{ found: any[]; onClose: (changed: boolean) => void }> = ({ found, onClose }) => {
  const { run, ask } = useApp();
  const [on, setOn] = useState<boolean[]>(found.map(() => true));
  const [gone, setGone] = useState<boolean[]>(found.map(() => false));
  const [changed, setChanged] = useState(false);
  const left = found.map((_, i) => i).filter((i) => !gone[i]);
  async function clear(idx: number[]) {
    idx = idx.filter((i) => !gone[i]); if (!idx.length) return;
    const n = idx.reduce((s, i) => s + found[i].Files.length, 0);
    const what = idx.length === 1 ? "'" + found[idx[0]].Label + "'" : 'these ' + idx.length + ' items';
    if ((await ask('Clear ' + what + ' from your game folder?\n\n' + n + ' file(s) go to the Recycle Bin. You can restore them from there.', 'Clear', ['Yes', 'No'])) !== 'Yes') return;
    await run(() => call('clearFound', idx.flatMap((i) => found[i].Files)));
    setGone(gone.map((g, i) => g || idx.includes(i))); setChanged(true);
  }
  async function add() {
    const picked = left.filter((i) => on[i]).map((i) => found[i]);
    if (picked.length) await run(() => call('addFoundMods', picked), 'Adding them to My Mods...');
    onClose(true);
  }
  return (
    <Modal title="Found in your game folder" sub="Put there by hand or by another tool. Tick the ones to manage here. Nothing is moved or deleted now." icon={<FolderSearch className="w-5 h-5" />} onClose={() => onClose(changed)} width="max-w-4xl"
      footer={<>
        <span className="mr-auto text-[13px] text-zinc-400">{left.length ? left.filter((i) => on[i]).length + ' of ' + left.length + ' ticked' : 'All cleared'}</span>
        <Btn onClick={() => setOn(on.map(() => true))}>Tick All</Btn>
        <Btn onClick={() => setOn(on.map(() => false))}>Untick All</Btn>
        <Btn kind="danger" onClick={() => clear(left)}>Clear All</Btn>
        <Btn onClick={() => onClose(changed)}>Cancel</Btn>
        <Btn kind="primary" onClick={add} disabled={!left.some((i) => on[i])}>Add to My Mods</Btn>
      </>}>
      <div className="p-5 space-y-2">
        {found.map((f, i) => gone[i] ? null : (
          <div key={i} onClick={() => setOn(on.map((v, j) => (j === i ? !v : v)))} className="cursor-pointer rounded-lg bg-[#24262c] hover:bg-[#2c2f36] border border-[#33363f] px-4 py-3 flex items-center gap-4">
            <Tick on={on[i]} />
            <div className="min-w-0 flex-1">
              <div className={`text-[15px] font-semibold truncate ${on[i] ? 'text-white' : 'text-zinc-500'}`}>{f.Label}</div>
              <div className="text-[12px] text-zinc-500 truncate mt-0.5">{f.Files.slice(0, 3).join('    ')}{f.Files.length > 3 ? '    +' + (f.Files.length - 3) + ' more' : ''}</div>
            </div>
            <Btn small kind="danger" icon={<Trash2 className="w-3.5 h-3.5" />} onClick={(e) => { e.stopPropagation(); clear([i]); }}>Clear</Btn>
            <Pill className={PILL[f.Type] || PILL.Mod}>{f.Type}</Pill>
            <span className="text-[13px] text-zinc-400 w-16 text-right">{f.Files.length} file{f.Files.length !== 1 ? 's' : ''}</span>
          </div>
        ))}
      </div>
    </Modal>
  );
};
