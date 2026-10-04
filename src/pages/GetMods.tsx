import React, { useEffect, useRef, useState } from 'react';
import { Globe, ArrowLeft, ArrowRight, RotateCw, Home, X, ExternalLink, ChevronRight } from 'lucide-react';
import { useApp } from '../App';
import { L } from '../api';
import { Btn, Card, PageTitle } from '../ui';

const SITES = [
  { name: 'LibertyCity', desc: 'The biggest GTA 4 library: cars, skins, scripts, maps.', url: 'https://libertycity.net/files/gta-4/' },
  { name: 'Nexus Mods', desc: 'Quality mods and fixes. Log in once, then use Manual Download or Mod Manager Download.', url: 'https://www.nexusmods.com/games/gta4' },
  { name: 'GTAinside', desc: 'Huge collection of cars, weapons and skins.', url: 'https://www.gtainside.com/gta4/' },
  { name: 'ModDB', desc: 'Big total conversions and overhauls.', url: 'https://www.moddb.com/games/grand-theft-auto-iv/mods' },
  { name: 'GTAForums', desc: 'Scripts and plugins, straight from the modders.', url: 'https://gtaforums.com/forum/326-scripts-plugins/' },
  { name: 'LCPDFR', desc: 'Police mods, cars and scripts for GTA IV.', url: 'https://www.lcpdfr.com/downloads/gta4mods/' },
  { name: "Gillian's Guide", desc: 'Step-by-step setup guide and trusted mod list.', url: 'https://gillian-guide.github.io/companion-mods/' },
];
const STEPS = ['Pick a site below, or paste any link in the bar above', "Find a mod and click the site's Download button", 'Check where the files go, then press Install'];

export const GetMods: React.FC = () => {
  const { browserUrl, handleLink, game, status } = useApp();
  const [url, setUrl] = useState<string | null>(null);
  const [addr, setAddr] = useState('');
  const [nav, setNav] = useState({ back: false, fwd: false, loading: false });
  const wv = useRef<any>(null);

  useEffect(() => { if (browserUrl) { setUrl(browserUrl.url); setAddr(browserUrl.url); if (wv.current) try { wv.current.loadURL(browserUrl.url); } catch (e) { /* */ } } }, [browserUrl]);
  useEffect(() => {
    const w = wv.current; if (!w) return;
    const upd = () => { try { setAddr(w.getURL()); setNav({ back: w.canGoBack(), fwd: w.canGoForward(), loading: w.isLoading() }); } catch (e) { /* */ } };
    const ev = ['did-navigate', 'did-navigate-in-page', 'did-start-loading', 'did-stop-loading'];
    ev.forEach((x) => w.addEventListener(x, upd));
    return () => ev.forEach((x) => w.removeEventListener(x, upd));
  }, [url !== null]);

  const open = (u: string) => { if (!game) { status('Pick your GTA IV folder first.', 'red'); return; } setUrl(u); setAddr(u); if (wv.current) try { wv.current.loadURL(u); } catch (e) { /* */ } };
  const go = () => { const u = addr.trim(); if (!u) return; handleLink(/^[a-z]+:\/\//i.test(u) ? u : 'https://' + u); };

  return (
    <div className="h-full flex flex-col">
      <div className="shrink-0 bg-[#1b1d21]/95 border-b border-[#363a44] px-4 py-2.5 flex items-center gap-2">
        <Btn small kind="ghost" icon={<Home className="w-4 h-4" />} onClick={() => setUrl(null)} title="Mod sites" />
        <Btn small kind="ghost" icon={<ArrowLeft className="w-4 h-4" />} disabled={!url || !nav.back} onClick={() => wv.current?.goBack()} />
        <Btn small kind="ghost" icon={<ArrowRight className="w-4 h-4" />} disabled={!url || !nav.fwd} onClick={() => wv.current?.goForward()} />
        <Btn small kind="ghost" icon={<RotateCw className={`w-4 h-4 ${nav.loading ? 'animate-spin' : ''}`} />} disabled={!url} onClick={() => wv.current?.reload()} />
        <input value={addr} onChange={(e) => setAddr(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') go(); }} placeholder="Paste any website, a mod download link, or a Nexus link..."
          className="flex-1 min-w-0 bg-[#111214] border border-[#363a44] rounded-lg px-3 py-1.5 text-[13.5px] text-zinc-100 outline-none focus:border-[#6ca4d8]" />
        <Btn small kind="primary" onClick={go}>Go</Btn>
        {url && <Btn small icon={<ExternalLink className="w-3.5 h-3.5" />} onClick={() => L.shell.external(addr)}>Open Outside</Btn>}
        {url && <Btn small icon={<X className="w-3.5 h-3.5" />} onClick={() => { setUrl(null); status('Browser closed.', 'dim'); }}>Close</Btn>}
      </div>
      {url !== null && (
        // @ts-ignore - Electron's built-in browser tag
        <webview ref={wv} src={url} partition="persist:mods" allowpopups="true" style={{ flex: 1, width: '100%', background: '#fff' }} />
      )}
      {url === null && (
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-[1400px] mx-auto p-5 space-y-4">
            <PageTitle icon={<Globe className="w-6 h-6" />} title="Get Mods" sub="Pick a site, press its Download button. The mod lands in Install. Any website works." />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {STEPS.map((s, i) => (
                <Card key={i} className="px-4 py-3.5 flex items-center gap-3">
                  <span className="w-8 h-8 rounded-full bg-[#6ca4d8]/20 text-[#8cbbe6] border border-[#6ca4d8]/40 flex items-center justify-center font-bebas text-xl shrink-0">{i + 1}</span>
                  <span className="text-[14px] text-zinc-200 font-semibold leading-snug">{s}</span>
                </Card>
              ))}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {SITES.map((s) => (
                <button key={s.name} onClick={() => open(s.url)} className="text-left group">
                  <Card className="p-5 h-full border-l-4 border-l-[#6ca4d8] group-hover:bg-[#262a32]/95 transition-colors">
                    <div className="flex items-center justify-between"><span className="text-[20px] font-bold text-white">{s.name}</span><ChevronRight className="w-5 h-5 text-zinc-500 group-hover:text-[#6ca4d8]" /></div>
                    <p className="text-[13.5px] text-zinc-400 mt-1.5 leading-snug">{s.desc}</p>
                    <p className="text-[12px] text-zinc-600 mt-2 font-mono truncate">{s.url}</p>
                  </Card>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
