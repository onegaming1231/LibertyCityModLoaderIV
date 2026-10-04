import React, { useState } from 'react';
import { Layers, Trash2, ExternalLink, Power, ArrowUp, ArrowDown, Pencil } from 'lucide-react';
import { useApp } from '../App';
import { call, L, ModRow } from '../api';
import { Btn, Modal, Pill } from '../ui';

export const ModDetail: React.FC<{ mod: ModRow; onClose: () => void }> = ({ mod, onClose }) => {
  const { run, refresh, ask, mods } = useApp();
  const [name, setName] = useState(mod.name);
  const idx = mods.findIndex((m) => m.name === mod.name);
  async function uninstall() {
    const a = mod.found
      ? await ask("'" + mod.name + "' wasn't installed by this app.\n\nUninstalling deletes its " + mod.files + " file(s) for good. There's no original to put back.\n\nTip: untick it instead to just turn it off.\n\nDelete it?", 'Uninstall', ['Yes', 'No'])
      : await ask("Uninstall '" + mod.name + "'?\n\nIts files leave the game, and anything it replaced is put back.", 'Uninstall', ['Yes', 'No']);
    if (a !== 'Yes') return;
    await run(() => call('uninstall', mod.name), 'Removing ' + mod.name + '...'); await refresh(); onClose();
  }
  async function move(d: number) { await run(() => call('moveMod', mod.name, d < 0 ? idx - 1 : idx + 2)); await refresh(); }
  async function rename() { if (name.trim() && name !== mod.name) { await run(() => call('renameMod', mod.name, name)); await refresh(); onClose(); } }
  return (
    <Modal title={mod.name} sub={(mod.on ? 'On' : 'Off') + '  -  installed ' + (mod.date || '?') + (mod.version ? '  -  version ' + mod.version : '')} icon={<Layers className="w-5 h-5" />} onClose={onClose} width="max-w-3xl"
      footer={<>
        {mod.url && <Btn icon={<ExternalLink className="w-4 h-4" />} onClick={() => L.shell.external(mod.url)}>Mod Page</Btn>}
        <Btn icon={<ArrowUp className="w-4 h-4" />} disabled={idx <= 0} onClick={() => move(-1)}>Move Up</Btn>
        <Btn icon={<ArrowDown className="w-4 h-4" />} disabled={idx >= mods.length - 1} onClick={() => move(1)}>Move Down</Btn>
        <Btn kind="danger" icon={<Trash2 className="w-4 h-4" />} onClick={uninstall}>Uninstall</Btn>
        <Btn kind="primary" icon={<Power className="w-4 h-4" />} onClick={async () => { await run(() => call('setModOn', mod.name, !mod.on)); await refresh(); }}>{mod.on ? 'Turn Off' : 'Turn On'}</Btn>
      </>}>
      <div className="p-5 space-y-4">
        {mod.thumb && <img src={mod.thumb} className="w-full max-h-48 object-cover rounded-lg border border-[#363a44]" />}
        <div className="flex flex-wrap gap-2">
          {mod.update && <Pill className="bg-emerald-500/15 text-emerald-300 border-emerald-500/40">Update: {mod.update}</Pill>}
          {mod.missing > 0 && <Pill className="bg-amber-500/15 text-amber-300 border-amber-500/40">{mod.missing} file(s) missing - reinstall it</Pill>}
          {mod.replaced > 0 && <Pill className="bg-zinc-700/40 text-zinc-300 border-zinc-600">{mod.replaced} game file(s) kept safe</Pill>}
          <Pill className="bg-zinc-700/40 text-zinc-300 border-zinc-600">Place in list: {idx + 1} of {mods.length}</Pill>
        </div>
        <div className="flex gap-2 items-center">
          <input value={name} onChange={(e) => setName(e.target.value)} className="flex-1 bg-[#111214] border border-[#363a44] rounded-lg px-3 py-2 text-[14px] outline-none focus:border-[#6ca4d8]" />
          <Btn icon={<Pencil className="w-4 h-4" />} disabled={!name.trim() || name === mod.name} onClick={rename}>Rename</Btn>
        </div>
        <div>
          <div className="text-[12px] font-bold uppercase tracking-wider text-zinc-400 font-barlow-condensed mb-2">Its files ({mod.fileList.length})</div>
          <div className="max-h-72 overflow-y-auto rounded-lg border border-[#2d3038] bg-[#111214] divide-y divide-[#22252b]">
            {mod.fileList.map((f) => <div key={f} className="px-3 py-1.5 text-[12.5px] font-mono text-zinc-300 break-all">{f}</div>)}
          </div>
        </div>
      </div>
    </Modal>
  );
};
