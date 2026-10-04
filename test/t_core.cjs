const fs=require('fs'),path=require('path'); const C=require('../electron/engine/core.cjs'), F=require('../electron/engine/formats.cjs');
const G=path.join(__dirname,'game'); fs.rmSync(G,{recursive:true,force:true});
const w=(p,d)=>{p=path.join(G,p.replace(/\\/g,'/'));fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,d);};
C.E.host.status=(t,c)=>console.log('  ['+c+'] '+t);
w('GTAIV.exe','x');
function Mk(names,wd,vals){ const o=F.Wtd.load(F.Wtd.makeTest(names,wd,wd,F.DXT1,1)); names.forEach((n,i)=>{const t=o.textures[i]; o.gfx.fill(vals[i],t.dataOffset,t.dataOffset+t.dataSize);}); return o.save(); }
function Show(p){ p=path.join(G,p); if(!fs.existsSync(p)) return '(none)'; const o=F.Wtd.load(fs.readFileSync(p)); return o.textures.map(t=>t.name+'='+o.gfx[t.dataOffset]).join(', '); }
w('pc\\textures\\hud.wtd',Mk(['radar','weapon','font'],8,[1,2,3]));
w('common\\data\\handling.dat','; handling\nADMIRAL 1500.0 2.0 80 0.0 0.0 -0.1 0.0 5 0.85 0.75 140.0\n%BOAT 1500.0 2.0 80 0.0 0.0 -0.1 0.0 5 0.85 0.75 140.0\n');
w('common\\data\\gta.dat','IDE common:/data/vehicles.ide\nIMG pc:/models/cdimages/vehicles.img\n');
C.setGame(G);
const L=(n,rel,d)=>w('LCModInstaller\\library\\'+n+'\\'+rel,d);
L('HudA','update\\HudA\\pc\\textures\\hud.wtd',Mk(['radar','weapon','font'],8,[10,2,3]));
L('HudB','update\\HudB\\pc\\textures\\hud.wtd',Mk(['radar','weapon','font'],8,[1,20,3]));
L('Coach','update\\Coach\\common\\data\\handling.dat','COACH 7500.0 3.0 80 0.0 0.0 -0.90 0.0 6 0.12 0.3 135.0\n');
L('Coach','update\\Coach\\common\\data\\gta.dat','IMG pc:/models/cdimages/vehicles.img\nIDE common:/data/coach.ide\n');
L('Coach','update\\common\\data\\coach.ide','cars\ncoach, coach\nend\n');
const mods=[{Name:'HudA',Files:['update\\HudA\\pc\\textures\\hud.wtd'],Library:true,Enabled:true},{Name:'HudB',Files:['update\\HudB\\pc\\textures\\hud.wtd'],Library:true,Enabled:true},
 {Name:'Coach',Files:['update\\Coach\\common\\data\\handling.dat','update\\Coach\\common\\data\\gta.dat','update\\common\\data\\coach.ide'],Library:true,Enabled:true}];
C.saveDb(mods); C.syncFiles(C.allModFiles(mods),mods);
console.log('mixed hud:',Show('update/LC Installer Textures/pc/textures/hud.wtd'),'| HudA deployed:',fs.existsSync(path.join(G,'update/HudA/pc/textures/hud.wtd')));
console.log('handling:\n'+fs.readFileSync(path.join(G,'update/common/data/handling.dat'),'latin1'));
console.log('gta.dat:\n'+fs.readFileSync(path.join(G,'update/common/data/gta.dat'),'latin1'));
console.log('coach.ide deployed:',fs.existsSync(path.join(G,'update/common/data/coach.ide')), 'linked:', fs.statSync(path.join(G,'update/common/data/coach.ide')).nlink);
let m2=C.loadDb(); m2[1].Enabled=false; m2[2].Enabled=false; C.saveDb(m2); C.syncFiles([...m2[1].Files,...m2[2].Files],m2);
console.log('after off: mixed:',Show('update/LC Installer Textures/pc/textures/hud.wtd'),'| HudA:',Show('update/HudA/pc/textures/hud.wtd'),'| handling exists:',fs.existsSync(path.join(G,'update/common/data/handling.dat')),'| coach.ide:',fs.existsSync(path.join(G,'update/common/data/coach.ide')));
console.log('deployed.json:',fs.readFileSync(path.join(G,'LCModInstaller/deployed.json'),'utf8'));
