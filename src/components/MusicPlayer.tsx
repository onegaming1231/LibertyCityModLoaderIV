import React, { useEffect, useRef, useState } from 'react';
import { Music2, Play, Pause, SkipForward, SkipBack, Volume2, ChevronDown, FolderOpen, Link2 } from 'lucide-react';
import { L, fileUrl, baseName } from '../api';
import { useApp } from '../App';
import { Btn } from '../ui';

const SOURCES = ['Off', 'My music', 'YouTube Music'] as const;
// Background music: your own music folder, or the YouTube Music app (Plugins > API Server must be on)
export const MusicPlayer: React.FC = () => {
  const { look, saveLook, status } = useApp();
  const ms = look.music;
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState('');
  const [playing, setPlaying] = useState(false);
  const [list, setList] = useState<string[]>([]);
  const [at, setAt] = useState(0);
  const audio = useRef<HTMLAudioElement>(null);
  const setMs = (p: Partial<typeof ms>) => saveLook(Object.assign({}, look, { music: Object.assign({}, ms, p) }));
  const base = 'http://127.0.0.1:' + (ms.port || 26538);
  const ytm = (method: string, p: string, body?: any) => L.music.ytm(base, ms.token, method, p, body);

  // ---- my music
  async function loadList(folder = ms.folder) { const l = (await L.music.list(folder)).sort(() => Math.random() - 0.5); setList(l); setAt(0); return l; }
  function playAt(i: number, l = list) {
    if (!l.length) { setNow('No music found - choose a folder'); return; }
    i = ((i % l.length) + l.length) % l.length; setAt(i);
    const a = audio.current!; a.src = fileUrl(l[i]); a.volume = (ms.volume || 40) / 100; a.play().then(() => setPlaying(true)).catch(() => setNow("Can't play " + baseName(l[i])));
    setNow('♪  ' + baseName(l[i]).replace(/\.[^.]+$/, ''));
  }
  useEffect(() => { if (ms.source === 'My music' && ms.folder) loadList().then((l) => { if (l.length) playAt(0, l); }); /* eslint-disable-next-line */ }, []);
  // ---- YouTube Music: what's playing, every 2.5 seconds
  useEffect(() => {
    if (ms.source !== 'YouTube Music') return;
    if (!ms.token) { setNow('YouTube Music: press Connect'); return; }
    let stop = false;
    const tick = async () => {
      const r = await ytm('GET', '/api/v1/song');
      if (stop) return;
      if (r.code === 401 || r.code === 403) { setNow('YouTube Music: press Connect'); return; }
      if (r.code === -1) { setNow("YouTube Music isn't open"); return; }
      const s = r.data;
      if (s && s.title) { setPlaying(!s.isPaused); setNow((s.isPaused ? 'Paused  -  ' : '♪  ') + s.title + (s.artist ? '  -  ' + s.artist : '')); } else setNow('YouTube Music: nothing playing');
    };
    tick(); const t = setInterval(tick, 2500);
    return () => { stop = true; clearInterval(t); };
    // eslint-disable-next-line
  }, [ms.source, ms.token, ms.port]);

  async function toggle() {
    if (ms.source === 'My music') {
      const a = audio.current!;
      if (!a.src || !list.length) { const l = await loadList(); playAt(0, l); return; }
      if (a.paused) { a.play(); setPlaying(true); } else { a.pause(); setPlaying(false); }
    } else if (ms.source === 'YouTube Music') { await ytm('POST', '/api/v1/toggle-play'); setPlaying(!playing); }
  }
  const next = () => (ms.source === 'My music' ? playAt(at + 1) : ytm('POST', '/api/v1/next'));
  const prev = () => (ms.source === 'My music' ? playAt(at - 1) : ytm('POST', '/api/v1/previous'));
  function volume(v: number) { setMs({ volume: v }); if (audio.current) audio.current.volume = v / 100; if (ms.source === 'YouTube Music') ytm('POST', '/api/v1/volume', { volume: v }); }
  async function setSource(s: typeof SOURCES[number]) {
    if (s !== 'My music' && audio.current) { audio.current.pause(); setPlaying(false); }
    setMs({ source: s });
    if (s === 'Off') setNow('');
    if (s === 'My music') { if (ms.folder) { const l = await loadList(); playAt(0, l); } else setNow('Choose a folder with your music'); }
  }
  async function chooseFolder() {
    const f = await L.dialog.open({ folder: true, title: 'Pick the folder with your music' }); if (!f) return;
    setMs({ folder: f, source: 'My music' }); const l = await loadList(f);
    if (l.length) { playAt(0, l); status('Playing ' + l.length + ' song(s) from your folder.', 'green'); } else setNow('No music files in that folder');
  }
  async function connect() {
    status('Connecting... if YouTube Music asks, click Allow.', 'amber');
    const r = await L.music.ytm(base, '', 'POST', '/auth/LibertyCityModLoaderIV');
    const tok = r.data && (r.data.accessToken || r.data.access_token);
    if (tok) { setMs({ token: tok, source: 'YouTube Music' }); status('Connected to YouTube Music.', 'green'); }
    else status("Couldn't reach YouTube Music. Open it, then Plugins > API Server > Enabled, and try again.", 'red');
  }
  const off = ms.source === 'Off';
  return (
    <div className="relative">
      <audio ref={audio} onEnded={() => playAt(at + 1)} onError={() => list.length > 1 && playAt(at + 1)} />
      <div className="flex items-center gap-1 pl-2.5 pr-1.5 py-1 rounded-lg bg-[#111214]/90 border border-[#363a44]">
        <button onClick={() => setOpen(!open)} className="flex items-center gap-1.5 text-[12px] text-zinc-300 hover:text-white max-w-[210px]" title={now || 'Music'}>
          <Music2 className="w-4 h-4 text-[#6ca4d8] shrink-0" />
          <span className="truncate font-barlow-condensed uppercase tracking-wide text-[13px]">{off ? 'Music' : (now || ms.source)}</span>
          <ChevronDown className="w-3.5 h-3.5 shrink-0" />
        </button>
        <button disabled={off} onClick={prev} className="p-1 text-zinc-300 hover:text-white disabled:opacity-30"><SkipBack className="w-3.5 h-3.5" /></button>
        <button disabled={off} onClick={toggle} className="p-1 text-zinc-100 hover:text-white disabled:opacity-30">{playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}</button>
        <button disabled={off} onClick={next} className="p-1 text-zinc-300 hover:text-white disabled:opacity-30"><SkipForward className="w-3.5 h-3.5" /></button>
      </div>
      {open && (
        <div className="absolute right-0 top-11 z-40 w-[360px] bg-[#1b1d21] border border-[#3d424d] rounded-xl shadow-2xl p-4 space-y-3">
          <div className="flex items-center justify-between"><h4 className="text-xl font-bebas tracking-wide text-white">Music</h4><Btn small onClick={() => setOpen(false)}>Close</Btn></div>
          <div className="flex gap-1.5 bg-[#111214] p-1 rounded-lg border border-[#363a44]">
            {SOURCES.map((s) => <button key={s} onClick={() => setSource(s)} className={`flex-1 px-2 py-1.5 rounded text-[12px] font-bold ${ms.source === s ? 'bg-[#6ca4d8] text-black' : 'text-zinc-300 hover:text-white'}`}>{s}</button>)}
          </div>
          {ms.source === 'My music' && <Btn icon={<FolderOpen className="w-4 h-4" />} onClick={chooseFolder} className="w-full">Choose Music Folder...</Btn>}
          {ms.source === 'YouTube Music' && <Btn icon={<Link2 className="w-4 h-4" />} onClick={connect} className="w-full">{ms.token ? 'Reconnect' : 'Connect'}</Btn>}
          <p className="text-[12px] text-zinc-400 leading-snug">
            {ms.source === 'My music' ? (ms.folder ? 'Folder: ' + ms.folder : 'Pick a folder. mp3, wav, wma, m4a, aac and flac play in random order.')
              : ms.source === 'YouTube Music' ? 'Open the YouTube Music app: Plugins > API Server > Enabled. Then press Connect and click Allow.'
              : 'Music plays quietly while you use the loader.'}
          </p>
          <div className="flex items-center gap-2">
            <Volume2 className="w-4 h-4 text-zinc-400" />
            <input type="range" min={0} max={100} value={ms.volume} disabled={off} onChange={(e) => volume(Number(e.target.value))} className="flex-1 accent-[#6ca4d8]" />
            <span className="text-[12px] text-zinc-400 w-8 text-right">{ms.volume}</span>
          </div>
          <div className="text-[13px] text-zinc-200 bg-[#111214] rounded-lg px-3 py-2 border border-[#2d3038] min-h-[38px]">{now || 'Nothing playing'}</div>
        </div>
      )}
    </div>
  );
};
