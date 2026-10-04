// Makes the ready-to-run app folder from an official Electron zip (no installer, nothing packed or hidden):
//   node scripts/package.cjs <electron-zip> <out-folder> [win|linux]
// The app's own files go into resources/app.asar; the program gets the app's name, icon and version 1.0.
const fs = require('fs'), path = require('path'), cp = require('child_process');
const root = path.join(__dirname, '..');
const [zip, out, plat = 'win'] = process.argv.slice(2);
if (!zip || !out) { console.log('usage: node scripts/package.cjs <electron-zip> <out-folder> [win|linux]'); process.exit(1); }
const NAME = 'Liberty City Mod Loader IV';
fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });

// 1. Electron itself (unzipped as it ships)
const F = require(path.join(root, 'electron', 'engine', 'formats.cjs'));
F.zip.extract(zip, out);
fs.rmSync(path.join(out, 'resources', 'default_app.asar'), { force: true });
// only the English language pack (the app is in English)
const loc = path.join(out, 'locales'); if (fs.existsSync(loc)) for (const n of fs.readdirSync(loc)) if (!/^en-US\./.test(n)) fs.rmSync(path.join(loc, n));

// 2. the app: package.json + electron/ + dist/ -> resources/app.asar
const stage = path.join(root, 'build', 'app'); fs.rmSync(stage, { recursive: true, force: true }); fs.mkdirSync(stage, { recursive: true });
const copyDir = (a, b) => { fs.mkdirSync(b, { recursive: true }); for (const n of fs.readdirSync(a)) { const s = path.join(a, n), d = path.join(b, n); if (fs.statSync(s).isDirectory()) copyDir(s, d); else fs.copyFileSync(s, d); } };
copyDir(path.join(root, 'electron'), path.join(stage, 'electron'));
copyDir(path.join(root, 'dist'), path.join(stage, 'dist'));
fs.writeFileSync(path.join(stage, 'package.json'), JSON.stringify({ name: 'liberty-city-mod-loader-iv', productName: NAME, version: '1.0.0', description: 'Mod manager for GTA IV: The Complete Edition', author: 'AnnaEnxo', license: 'GPL-3.0', main: 'electron/main.cjs' }, null, 2));
const asar = require(path.join(root, 'node_modules', '@electron', 'asar'));

(async () => {
  await asar.createPackage(stage, path.join(out, 'resources', 'app.asar'));
  // 3. the program file: name, icon, version info
  if (plat === 'win') {
    const exe = path.join(out, NAME + '.exe');
    fs.renameSync(path.join(out, 'electron.exe'), exe);
    const ResEdit = require(path.join(root, 'node_modules', 'resedit'));
    const PE = require(path.join(root, 'node_modules', 'pe-library'));
    const data = fs.readFileSync(exe);
    const ex = PE.NtExecutable.from(data, { ignoreCert: true });
    const res = PE.NtExecutableResource.from(ex);
    const ico = ResEdit.Data.IconFile.from(fs.readFileSync(path.join(root, 'public', 'favicon.ico')));
    const groups = ResEdit.Resource.IconGroupEntry.fromEntries(res.entries);
    const gid = groups.length ? groups[0].id : 1, lang = groups.length ? groups[0].lang : 1033;
    ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries, gid, lang, ico.icons.map(i => i.data));
    const vi = ResEdit.Resource.VersionInfo.fromEntries(res.entries)[0];
    vi.setFileVersion(1, 0, 0, 0, 1033); vi.setProductVersion(1, 0, 0, 0, 1033);
    vi.setStringValues({ lang: 1033, codepage: 1200 }, {
      CompanyName: 'AnnaEnxo', ProductName: NAME, FileDescription: NAME, ProductVersion: '1.0', FileVersion: '1.0.0.0',
      OriginalFilename: NAME + '.exe', InternalName: 'LibertyCityModLoaderIV', LegalCopyright: 'GPL v3 - AnnaEnxo',
    });
    vi.outputToResourceEntries(res.entries);
    res.outputResource(ex);
    fs.writeFileSync(exe, Buffer.from(ex.generate()));
    console.log('exe ready:', exe);
  } else {
    fs.renameSync(path.join(out, 'electron'), path.join(out, 'liberty-city-mod-loader-iv'));
  }
  // 4. safer defaults for the program (it can't be used to run other scripts)
  try {
    const fuses = require(path.join(root, 'node_modules', '@electron', 'fuses'));
    const bin = plat === 'win' ? path.join(out, NAME + '.exe') : path.join(out, 'liberty-city-mod-loader-iv');
    await fuses.flipFuses(bin, { version: fuses.FuseVersion.V1, [fuses.FuseV1Options.RunAsNode]: false, [fuses.FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [fuses.FuseV1Options.EnableNodeCliInspectArguments]: false, [fuses.FuseV1Options.OnlyLoadAppFromAsar]: true });
    console.log('fuses set');
  } catch (e) { console.log('fuses skipped:', e.message); }
  console.log('done:', out);
})();
