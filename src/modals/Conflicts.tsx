import React from 'react';
import { ShieldAlert, ShieldCheck } from 'lucide-react';
import { Modal, Btn } from '../ui';

const C: Record<string, string> = { amber: 'text-amber-300', red: 'text-red-400', green: 'text-emerald-400' };
export const Conflicts: React.FC<{ rows: any[]; onClose: () => void }> = ({ rows, onClose }) => {
  const problems = rows.filter((r) => r.problem).length;
  return (
    <Modal title="Conflict check" sub={problems ? problems + ' problem(s) found. The mod lower in My Mods wins a file both mods change.' : 'Clean record. No conflicts found.'} icon={problems ? <ShieldAlert className="w-5 h-5" /> : <ShieldCheck className="w-5 h-5" />} onClose={onClose} width="max-w-5xl" footer={<Btn kind="primary" onClick={onClose}>Close</Btn>}>
      <div className="p-5">
        {!rows.length && <div className="text-center text-emerald-400 py-8 text-[15px]">No conflicts found. Your mods get along.</div>}
        <div className="space-y-2">
          {rows.map((r, i) => (
            <div key={i} className="rounded-lg border border-[#2d3038] bg-[#111214] px-4 py-3">
              <div className="flex flex-wrap items-baseline gap-3"><span className={`text-[13px] font-bold uppercase font-barlow-condensed tracking-wide ${C[r.color] || ''}`}>{r.result}</span><span className="text-[14px] text-zinc-100 font-mono break-all">{r.what}</span></div>
              <div className="text-[12.5px] text-zinc-400 mt-1 break-all">{r.where}</div>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
};
