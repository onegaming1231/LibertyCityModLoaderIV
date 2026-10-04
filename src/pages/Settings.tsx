import React, { useEffect, useState } from 'react';
import { Settings as Gear, HardDrive, ShieldCheck, Download, MousePointerClick, KeyRound, Map, Database, Palette, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import { useApp } from '../App';
import { call, L } from '../api';
import { Btn, PageTitle, Section } from '../ui';

const Row: React.FC<{ ok: boolean | null; text: string; children?: React.ReactNode }> = ({ ok, text, children }) => (
  <div className="flex flex-wrap items-center justify-between gap-3 py-2.5 border-b border-[#2a2d34] last:border-0">
    <div className="flex items-center gap-2.5 text-[14.5px] min-w-0">
      {ok === true ? <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" /> : ok === false ? <XCircle className="w-5 h-5 text-red-400 shrink-0" /> : <AlertCircle className="w-5 h-5 text-amber-300 shrink-0" />}
      <span className={ok === true ? 'text-emerald-300' : ok === false ? 'text-red-300' : 'text-amber-200'}>{text}</span>
    </div>
    <div className="flex flex-wrap gap-2">{children}</div>
  </div>
);
const Help = ['Models, textures and game files  >  update\\<Mod name>\\   (your originals stay untouched)', 'Game data files (.dat, .ide)  >  update\\common\\data\\   (Fusion Fix only reads them there)',
  'Scripts (.cs, .net.dll)  >  scripts\\', 'Plugins (.asi) and helper .dll files  >  the game folder', 'Loose models (.wft .wtd .wdr ...)  >  packed into update\\<Mod name>\\<modname>.img',
  'Files inside game archives (like playerped.rpf)  >  a modded copy in update\\LC Installer Archives\\', 'Two mods changing the same texture file  >  mixed picture by picture in update\\LC Installer Textures\\',
  'Anything replaced is kept safe, and put back when you turn a mod off or uninstall it.'];

export const Settings: React.FC = () => {
  const { game, setGame, ess, run, refresh, status, ask, browse, look, saveLook } = useApp();
  const [settings, setSettings] = useState<any>({});
  const [watching, setWatching] = useState<string | false>(false);
  const [menu, setMenu] = useState(false);
  const [nxm, setNxm] = useState(false);
  const [key, setKey] = useState('');
  const [acc, setAcc] = useState<any>(null);
  const [store, setStore] = useState<any>(null);
  const load = async () => {
    setMenu(await L.reg.menuState()); setNxm(await L.reg.nxmState());
    if (!game) return;
    const s = await call('settings').catch(() => ({})); setSettings(s);
    setStore(await call('storage').catch(() => null));
    setAcc(await call('nexusAccount').catch(() => null));
    if (s.WatchDownloads !== false) setWatching(await L.watch(true));
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [game]);

  async function change() { const p = await L.dialog.open({ folder: true, title: 'Choose the folder that contains GTAIV.exe', defaultPath: game }); if (p) await setGame(p); }
  async function findIt() { const g = await call<string>('findGame').catch(() => ''); if (g) await setGame(g); else status("Couldn't find GTA IV by itself. Press Change and pick the folder with GTAIV.exe.", 'amber'); }
  async function budget() {
    const nw = await call<string>('bumpVehicleBudget');
    const a = await ask("Set Fusion Fix's vehicle budget to " + nw + "?\n\nMore variety in traffic. If engine sounds go missing or a cutscene loads forever, it's too high. Lower it in plugins\\GTAIV.EFLC.FusionFix.ini.", 'Traffic variety', ['Yes', 'No']);
    if (a !== 'Yes') return;
    const ok = await call('setFFIniValue', 'VehicleBudget', nw);
    status(ok ? 'Vehicle budget set to ' + nw + '. Restart the game to see it.' : "Couldn't find VehicleBudget in the Fusion Fix settings.", ok ? 'green' : 'red'); await refresh();
  }
  async function setWatch(on: boolean) { await call('saveSettings', { WatchDownloads: on }); setWatching(await L.watch(on)); }
  async function saveKey() { await run(() => call('setNexusKey', key.trim())); setKey(''); setAcc(await call('nexusAccount').catch(() => null)); }
  async function toggleNxm() {
    if (nxm) await L.reg.nxm(false);
    else { const a = await ask("Nexus 'Mod Manager Download' buttons will open this loader instead of Vortex or Mod Organizer (for every game on Nexus). You can switch back here any time.\n\nContinue?", 'Nexus Mods', ['Yes', 'No']); if (a !== 'Yes') return; await L.reg.nxm(true); }
    const st = await L.reg.nxmState(); setNxm(st);
    status(st ? "Nexus 'Mod Manager Download' buttons now open in Liberty City Mod Loader IV." : 'Stopped handling Nexus download buttons.', st ? 'green' : 'dim');
  }
  async function toggleMenu(on: boolean) { await L.reg.menu(on); setMenu(await L.reg.menuState()); status(on ? "Right-click any mod archive and choose 'Install with Liberty City Mod Loader IV'." : 'Right-click menu entry removed.', on ? 'green' : 'dim'); }
  // ---- look
  const setLook = (p: any) => saveLook(Object.assign({}, look, p));
  async function pickPicture() {
    const f = await L.dialog.open({ title: 'Pick a background picture, GIF or video', filters: [{ name: 'Pictures, GIFs and videos', extensions: ['jpg', 'jpeg', 'png', 'bmp', 'gif', 'webp', 'mp4', 'webm', 'mov', 'm4v'] }] }); if (!f) return;
    const dest = await L.look.import(f); setLook({ image: dest, noDefault: false }); status("Background set. Change 'Darkness' if text is hard to read.", 'green');
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-[1100px] mx-auto p-5 space-y-4 pb-10">
        <PageTitle icon={<Gear className="w-6 h-6" />} title="Settings" sub="Set it once and forget it." />

        <Section icon={<HardDrive className="w-5 h-5" />} title="GTA IV folder" sub="The folder that has GTAIV.exe.">
          <div className="flex flex-wrap gap-2">
            <input readOnly value={game || 'Not found - press Change and pick the folder with GTAIV.exe'} className="flex-1 min-w-[300px] bg-[#111214] border border-[#363a44] rounded-lg px-3 py-2 text-[13.5px] font-mono text-zinc-300" />
            <Btn kind="primary" onClick={change}>Change...</Btn>
            <Btn onClick={findIt}>Find It for Me</Btn>
          </div>
        </Section>

        <Section icon={<ShieldCheck className="w-5 h-5" />} title="Essentials" sub={ess ? 'Game version: ' + (ess.version || 'unknown') + (ess.version ? (ess.complete ? '  (Complete Edition)' : '  (older version)') : '') : 'Pick your game folder first.'}>
          {ess && <div>
            <Row ok={ess.fusionFix} text={ess.fusionFix ? 'Fusion Fix: installed' + (ess.fusionFixVersion ? '  (v' + ess.fusionFixVersion + ')' : '') : 'Fusion Fix: not installed - most mods need it'}>
              <Btn kind="primary" onClick={() => browse('https://github.com/ThirteenAG/GTAIV.EFLC.FusionFix/releases')}>Get Fusion Fix</Btn>
            </Row>
            <div className="flex flex-wrap items-center gap-2 py-2.5 pl-7 border-b border-[#2a2d34]">
              <span className="text-[13px] text-zinc-500 mr-1">Optional:</span>
              <Btn small onClick={() => { browse('https://github.com/Tomasak/GTA-Downgraders/releases/iv-latest'); status("Download the 'Radio.Restoration.Mod' zip, extract it to an empty folder and run IVCERadioRestorer.exe.", 'amber'); }}>Fix Old Radio</Btn>
              <Btn small disabled={ess.vehicleBudget == null} onClick={budget}>Fix Traffic Glitch</Btn>
              <span className="text-[12.5px] text-zinc-400">{ess.vehicleBudget == null ? 'Traffic fix needs Fusion Fix' : ess.vehicleBudget === '0' || ess.vehicleBudget === '' ? 'Traffic: same cars may repeat' : 'Traffic: fixed (budget ' + ess.vehicleBudget + ')'}</span>
            </div>
            <Row ok={ess.scriptHookDotNet ? true : null} text={ess.scriptHookDotNet ? 'ScriptHookDotNet: installed (.cs and .net.dll scripts work)' : "ScriptHookDotNet: not installed - script mods won't run"}>
              <Btn onClick={() => browse('https://www.nexusmods.com/gta4/mods/1217?tab=files')}>Get ScriptHookDotNet</Btn>
            </Row>
            <Row ok={ess.dlss ? true : null} text={ess.dlss ? 'DLSS-IV: installed (settings in DLSS-IV.cfg)' : 'DLSS-IV: not installed - DLSS / FSR sharp picture and more FPS'}>
              <Btn onClick={() => browse('https://www.nexusmods.com/gta4/mods/1430?tab=files')}>Get DLSS-IV</Btn>
            </Row>
          </div>}
        </Section>

        <Section icon={<Download className="w-5 h-5" />} title="Downloads from your normal browser" sub="Chrome, Edge, Firefox...">
          <label className="flex items-center gap-3 text-[14.5px] cursor-pointer"><input type="checkbox" className="w-4 h-4 accent-[#6ca4d8]" checked={settings.WatchDownloads !== false} onChange={(e) => { setSettings({ ...settings, WatchDownloads: e.target.checked }); setWatch(e.target.checked); }} />Pop up when a mod lands in my Downloads folder</label>
          {watching && <p className="text-[12.5px] text-zinc-500 mt-2 pl-7">Watching: {watching}</p>}
        </Section>

        <Section icon={<MousePointerClick className="w-5 h-5" />} title="Right-click install" sub={ess?.sevenZip ? '7-Zip found: .rar and .7z mods open fine.' : 'Install 7-Zip (free, 7-zip.org) to open .rar and .7z mods. .zip and .oiv always work.'}>
          <div className="flex flex-wrap gap-2 items-center">
            <Btn kind={menu ? 'normal' : 'primary'} onClick={() => toggleMenu(true)}>{menu ? "'Install with...' Is On" : "Add 'Install with...' to Right-Click"}</Btn>
            <Btn disabled={!menu} onClick={() => toggleMenu(false)}>Remove It</Btn>
          </div>
        </Section>

        <Section icon={<KeyRound className="w-5 h-5" />} title="Nexus Mods account (optional)" sub="Not needed to download - just log in inside Get Mods. A key adds one-click 'Mod Manager Download', update checks, and direct downloads for Premium.">
          <div className="flex flex-wrap gap-2 items-center">
            <input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="Paste your API key" className="w-[360px] bg-[#111214] border border-[#363a44] rounded-lg px-3 py-2 text-[14px] outline-none focus:border-[#6ca4d8]" />
            <Btn kind="primary" disabled={!key.trim() || !game} onClick={saveKey}>Save Key</Btn>
            <button className="text-[13px] text-[#8cbbe6] hover:underline" onClick={() => L.shell.external('https://www.nexusmods.com/users/myaccount?tab=api')}>Where do I get a key?</button>
          </div>
          <p className={`text-[14px] font-semibold mt-3 ${acc?.connected ? 'text-emerald-400' : acc?.bad ? 'text-red-400' : 'text-zinc-400'}`}>
            {acc?.connected ? 'Connected as ' + acc.name + (acc.premium ? ' (Premium)' : ' (Free)') : acc?.bad ? 'Key not accepted - check it' : acc?.oldKey ? 'Please paste your key again (the new version stores it a new safe way).' : 'No key saved'}
          </p>
          <div className="mt-3"><Btn onClick={toggleNxm}>{nxm ? 'Stop Handling Nexus Download Buttons' : "Handle 'Mod Manager Download' Buttons"}</Btn></div>
        </Section>

        <Section icon={<Map className="w-5 h-5" />} title="Where mods go">
          <ul className="space-y-1.5">{Help.map((h) => <li key={h} className="text-[13.5px] text-zinc-300 font-mono">{h}</li>)}</ul>
        </Section>

        <Section icon={<Database className="w-5 h-5" />} title="Storage" sub="Installed mods are not affected - only the copies kept after downloading.">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-[14.5px] text-zinc-300">Downloaded mod files: {store ? store.downloadsMB + ' MB' : '-'}</span>
            <Btn disabled={!store || !store.downloadsMB} onClick={async () => { await run(() => call('clearDownloads')); setStore(await call('storage')); }}>Clear Downloaded Files</Btn>
            {store && <Btn onClick={() => L.shell.open(store.folder)}>Open Folder</Btn>}
          </div>
        </Section>

        <Section icon={<Palette className="w-5 h-5" />} title="Look" sub="The app plays its own Lola video. Change it with a live or game wallpaper, your own picture, GIF or video, or pick a plain color. Saved on this PC.">
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Btn onClick={() => { browse('https://www.pexels.com/search/videos/night%20city/'); status('Pick a video and press Free download. It becomes your background.', 'amber'); }}>Live Wallpapers...</Btn>
              <Btn onClick={() => { browse('https://moewalls.com/?s=gta'); status('Open a wallpaper and press Download. It becomes your background.', 'amber'); }}>Game Wallpapers...</Btn>
              <Btn onClick={pickPicture}>Picture / Video...</Btn>
              <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-800/90 border border-zinc-700 text-[13px] font-semibold cursor-pointer hover:bg-zinc-700">
                Pick Color <input type="color" value={look.color || '#111214'} onChange={(e) => setLook({ color: e.target.value })} className="w-6 h-6 bg-transparent border-0 p-0 cursor-pointer" />
              </label>
              <Btn disabled={look.noDefault && !look.image} onClick={() => { setLook({ image: '', noDefault: true }); status("Background removed - plain color now. Reset brings the app's video back.", 'dim'); }}>Remove Background</Btn>
              <Btn onClick={() => { setLook({ image: '', noDefault: false, color: '#111214', dim: 50, fit: 'Fill' }); status("Back to the original look (the app's background video).", 'dim'); }}>Reset</Btn>
            </div>
            <div className="flex flex-wrap items-center gap-5">
              <div className="flex items-center gap-2"><span className="text-[14px] text-zinc-300">Darkness</span>
                {[0, 25, 50, 75].map((d) => <button key={d} onClick={() => setLook({ dim: d })} className={`px-2.5 py-1 rounded text-[13px] font-semibold ${look.dim === d ? 'bg-[#6ca4d8] text-black' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'}`}>{d}%</button>)}
              </div>
              <div className="flex items-center gap-2"><span className="text-[14px] text-zinc-300">Fit</span>
                {(['Fill', 'Fit', 'Tile', 'Center'] as const).map((f) => <button key={f} disabled={!look.image} onClick={() => setLook({ fit: f })} className={`px-2.5 py-1 rounded text-[13px] font-semibold disabled:opacity-40 ${look.fit === f ? 'bg-[#6ca4d8] text-black' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'}`}>{f}</button>)}
              </div>
            </div>
            <p className="text-[12.5px] text-zinc-500">A darker background keeps text easy to read.</p>
          </div>
        </Section>
        <p className="text-[12.5px] text-zinc-500 text-center pt-2">Liberty City Mod Loader IV 1.0  -  for GTA IV: The Complete Edition with Fusion Fix  -  made by AnnaEnxo</p>
      </div>
    </div>
  );
};
