import React from 'react';
import { Loader2 } from 'lucide-react';
import { colorClass } from '../api';

export const StatusBar: React.FC<{ text: string; color: string; busy: boolean }> = ({ text, color, busy }) => (
  <footer className="relative z-20 h-9 shrink-0 bg-[#0d0e10]/95 border-t border-[#2a2d34] px-4 flex items-center gap-2 text-[13px]">
    {busy && <Loader2 className="w-4 h-4 animate-spin text-[#6ca4d8] shrink-0" />}
    <span className={`truncate ${colorClass[color] || 'text-zinc-200'}`} title={text}>{text}</span>
  </footer>
);
