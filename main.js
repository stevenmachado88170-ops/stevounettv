const {app,BrowserWindow,ipcMain,session,screen,globalShortcut}=require('electron');
const {spawn,execFile,execFileSync}=require('child_process');
const fs=require('fs'),path=require('path'),os=require('os');
const {pathToFileURL}=require('url');
app.commandLine.appendSwitch('autoplay-policy','no-user-gesture-required');
if(!app.requestSingleInstanceLock())app.exit(0); // une seule instance : relancer Salon ramène la fenêtre au premier plan
app.on('second-instance',()=>{ // retour au launcher sans fermer l'appli en cours (ex. musique en arrière-plan)
  if(win&&!win.isDestroyed()){hideOverlay();if(scKey){try{globalShortcut.unregister(scKey)}catch{}}win.show();win.setFullScreen(true);win.focus()}
});
// ——— Compatibilité distributions : chemins XDG, navigateur, extinction, affichage ———
// Chemins de données XDG (fonctionne sur Debian, Fedora, Arch, openSUSE, NixOS, Guix, Flatpak, Snap…)
const xdgData=()=>{
  const h=os.homedir(),home=process.env.XDG_DATA_HOME||path.join(h,'.local/share');
  const dd=(process.env.XDG_DATA_DIRS||'/usr/local/share:/usr/share').split(':').filter(Boolean);
  let user='';try{user=os.userInfo().username}catch{}
  return [...new Set([home,...dd,'/usr/local/share','/usr/share','/var/lib/flatpak/exports/share',path.join(h,'.local/share/flatpak/exports/share'),
    '/var/lib/snapd/desktop',path.join(h,'.nix-profile/share'),'/run/current-system/sw/share',user?`/etc/profiles/per-user/${user}/share`:'',path.join(h,'.guix-profile/share')].filter(Boolean))];
};
const which=n=>{for(const d of (process.env.PATH||'').split(':')){if(!d)continue;try{fs.accessSync(path.join(d,n),fs.constants.X_OK);return path.join(d,n)}catch{}}return ''};
// Navigateur plein écran : premier trouvé (Firefox, Chromium, Chrome, Brave, Vivaldi, Edge, Epiphany, puis Flatpak)
function defaultBrowser(){
  const L=[['firefox','--kiosk --new-instance'],['firefox-esr','--kiosk --new-instance'],['librewolf','--kiosk --new-instance'],['chromium','--kiosk'],['chromium-browser','--kiosk'],
    ['google-chrome-stable','--kiosk'],['google-chrome','--kiosk'],['brave-browser','--kiosk'],['brave','--kiosk'],['vivaldi','--kiosk'],['microsoft-edge-stable','--kiosk'],['epiphany','--application-mode']];
  for(const [b,a] of L)if(which(b))return `${b} ${a}`;
  if(which('flatpak')){
    try{const o=execFileSync('flatpak',['list','--app','--columns=application'],{timeout:3000}).toString();
      if(/org\.mozilla\.firefox/.test(o))return 'flatpak run org.mozilla.firefox --kiosk --new-instance';
      if(/org\.chromium\.Chromium/.test(o))return 'flatpak run org.chromium.Chromium --kiosk';
      if(/com\.google\.Chrome/.test(o))return 'flatpak run com.google.Chrome --kiosk'}catch{}
  }
  return 'firefox --kiosk --new-instance';
}
// Extinction / redémarrage : systemd, puis elogind, puis commandes classiques (OpenRC, runit, s6…)
function powerAction(a){
  const T={poweroff:[['systemctl','poweroff'],['loginctl','poweroff'],['poweroff'],['/usr/sbin/poweroff'],['/sbin/poweroff'],['shutdown','-h','now']],
    reboot:[['systemctl','reboot'],['loginctl','reboot'],['reboot'],['/usr/sbin/reboot'],['/sbin/reboot'],['shutdown','-r','now']]}[a];
  if(!T)return;
  const next=i=>{if(i>=T.length)return;execFile(T[i][0],T[i].slice(1),{timeout:8000},err=>{if(err)next(i+1)})};
  next(0);
}
// Affichage : XWayland (X11) si disponible, car la croix flottante et le raccourci global en ont besoin ; Wayland pur sinon.
// SALON_OZONE=wayland|x11 pour forcer un mode.
const OZ=process.env.SALON_OZONE||(process.env.DISPLAY?'x11':(process.env.WAYLAND_DISPLAY?'wayland':'x11'));
app.commandLine.appendSwitch('ozone-platform',OZ);
// ——— fin compatibilité ———
let win,cfg;
const cfgFile=()=>path.join(app.getPath('userData'),'config.json');
function loadCfg(){
  const f=cfgFile();
  if(!fs.existsSync(f)){fs.mkdirSync(path.dirname(f),{recursive:true});fs.copyFileSync(path.join(__dirname,'config.default.json'),f)}
  const c=JSON.parse(fs.readFileSync(f,'utf8'));
  if(!(c.navigateur&&c.navigateur.cmd))c.navigateur={cmd:defaultBrowser()};
  return c;
}
function create(){
  win=new BrowserWindow({fullscreen:true,kiosk:true,frame:false,autoHideMenuBar:true,backgroundColor:'#2c2f3c',
    webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true}});
  win.loadFile('index.html');
  win.webContents.on('before-input-event',(e,i)=>{
    if(i.type!=='keyDown')return;
    if(i.control&&i.key.toLowerCase()==='q')app.quit();                      // Ctrl+Q : quitter
    const home=i.key==='Escape'||i.key==='BrowserHome';                       // Échap / Home : retour au launcher
    if(home&&!win.webContents.getURL().startsWith('file:'))win.loadFile('index.html');
  });
}
const local=e=>e.senderFrame&&e.senderFrame.url.startsWith('file:'); // seule la page locale a accès à la config
// Lance une appli définie dans config.json (par son id : jamais de commande venue de la page)
// ——— Applications en cours : suivi, croix flottante, retour à l'accueil ———
let child=null,ov=null,ovCtl=null,scKey='';
const running=[]; // applis lancées depuis Salon : {c,name,id}
function sendRunning(){if(win&&!win.isDestroyed())win.webContents.send('running',running.map(r=>({id:r.id,name:r.name})))}
// Croix de fermeture : fenêtre fixe dans le coin haut droit. Petite zone (10 px par défaut) qui capte la souris ;
// au survol elle s'agrandit pour afficher « accueil » et « fermer », puis se réduit après quelques secondes.
function showOverlay(){
  if(ov&&!ov.isDestroyed()){ov.showInactive();if(ovCtl)ovCtl.grace();return}
  const d=screen.getPrimaryDisplay().bounds,FW=176,FH=100;
  const Z=Math.min(60,Math.max(6,+((cfg.fermeture||{}).zone)||10));
  const at=(w,h)=>({x:d.x+d.width-w,y:d.y,width:w,height:h});
  ov=new BrowserWindow({...at(FW,FH),transparent:true,frame:false,focusable:false,skipTaskbar:true,hasShadow:false,alwaysOnTop:true,show:false,
    webPreferences:{preload:path.join(__dirname,'overlay-preload.js'),contextIsolation:true}});
  ov.setAlwaysOnTop(true,'screen-saver');ov.setVisibleOnAllWorkspaces(true);
  ov.loadFile('overlay.html');
  let mode='full',timer=null;
  const set=md=>{if(!ov||ov.isDestroyed())return;mode=md;ov.setBounds(md==='full'?at(FW,FH):at(Z,Z));ov.webContents.executeJavaScript(`document.body.className='${md}'`).catch(()=>{})};
  ovCtl={enter(){clearTimeout(timer);if(mode!=='full')set('full')},
    leave(){clearTimeout(timer);timer=setTimeout(()=>set('mini'),1200)},
    grace(){clearTimeout(timer);if(mode!=='full')set('full');timer=setTimeout(()=>set('mini'),4000)},
    stop(){clearTimeout(timer)}};
  ov.once('ready-to-show',()=>{if(ov&&!ov.isDestroyed()){ov.showInactive();ovCtl.grace()}});
}
function hideOverlay(){if(ovCtl)ovCtl.stop();ovCtl=null;if(ov&&!ov.isDestroyed())ov.destroy();ov=null}
function regClose(){
  scKey=(cfg.fermeture&&typeof cfg.fermeture.raccourci==='string')?cfg.fermeture.raccourci:'Escape';
  if(scKey){try{globalShortcut.register(scKey,closeApp)}catch{}}
}
function unregClose(){if(scKey){try{globalShortcut.unregister(scKey)}catch{}}}
function closeApp(){ // ferme l'appli au premier plan (la dernière lancée)
  const r=running[running.length-1];if(!r)return;const c=r.c;
  try{process.kill(-c.pid,'SIGTERM')}catch{try{c.kill('SIGTERM')}catch{}}
  setTimeout(()=>{if(running.includes(r)){try{process.kill(-c.pid,'SIGKILL')}catch{try{c.kill('SIGKILL')}catch{}}}},4000);
}
function goHome(){ // retour au launcher : les applis continuent en arrière-plan (musique, etc.)
  unregClose();if(ov&&!ov.isDestroyed())ov.hide();
  if(win&&!win.isDestroyed()){win.show();win.setFullScreen(true);win.focus();sendRunning()}
}
function resumeApp(){ // le launcher se cache et l'appli en arrière-plan réapparaît
  if(!running.length||!win||win.isDestroyed())return;
  win.hide();showOverlay();unregClose();regClose();sendRunning();
}
function runApp(cmd,args,name,id){
  if(id&&running.some(r=>r.id===id)){resumeApp();return}
  win.hide();
  const c=spawn(cmd,args,{stdio:'ignore',detached:true});
  const r={c,name:name||cmd,id:id||''};running.push(r);child=c;
  showOverlay();unregClose();regClose();
  const done=()=>{
    const i=running.indexOf(r);if(i<0)return;
    running.splice(i,1);child=running.length?running[running.length-1].c:null;
    if(!running.length){hideOverlay();unregClose()}
    if(win&&!win.isDestroyed()){
      if(!running.length&&!win.isVisible()){win.show();win.setFullScreen(true);win.focus()}
      sendRunning();
    }
  };
  c.on('error',done);c.on('exit',done);sendRunning();
}
ipcMain.on('ov-hover',e=>{if(ov&&ovCtl&&e.sender===ov.webContents)ovCtl.enter()});
ipcMain.on('ov-leave',e=>{if(ov&&ovCtl&&e.sender===ov.webContents)ovCtl.leave()});
ipcMain.on('ov-home',e=>{if(ov&&!ov.isDestroyed()&&e.sender===ov.webContents)goHome()});
ipcMain.on('close-app',e=>{if(ov&&!ov.isDestroyed()&&e.sender===ov.webContents)closeApp()});
ipcMain.on('resume',e=>{if(local(e))resumeApp()});
ipcMain.on('launch',(e,id)=>{
  if(!local(e))return;
  const a=(cfg.apps||[]).find(x=>x.id===id);
  if(!a)return;
  if(a.url){ // webapp : ouverte dans le navigateur configuré
    let u='';try{const x=new URL(a.url);if(/^https?:$/.test(x.protocol))u=x.href}catch{}
    if(!u)return;
    const p=((cfg.navigateur&&cfg.navigateur.cmd)||defaultBrowser()).trim().split(/\s+/);
    runApp(p[0],[...p.slice(1),u],a.n,a.id);
  }else if(a.cmd)runApp(a.cmd,a.args||[],a.n,a.id);
});
// Cherche le fichier d'icône d'une appli (thèmes hicolor / breeze / Adwaita, Flatpak, pixmaps)
const iconCache=new Map();
let iconDirs=null;
function getIconDirs(){ // dossiers d'icônes existants, thèmes connus d'abord (hicolor, breeze, Adwaita, Papirus…), puis les autres
  if(iconDirs)return iconDirs;iconDirs=[];
  const known=['hicolor','breeze','Adwaita','Papirus','Papirus-Dark','Yaru','gnome','oxygen','elementary','Numix','Mint-Y','Tela','Arc','Qogir'];
  const subs=[...['scalable','512x512','256x256','192x192','128x128','96x96','64x64','48x48'].map(z=>`${z}/apps`),...[512,256,128,96,64,48,32].map(z=>`apps/${z}`),'apps/scalable'];
  const bases=[...xdgData().map(d=>path.join(d,'icons')),path.join(os.homedir(),'.icons')];
  for(const b of bases){let th;try{th=fs.readdirSync(b)}catch{continue}
    const ord=[...known.filter(t=>th.includes(t)),...th.filter(t=>!known.includes(t)).sort()];
    for(const t of ord)for(const sd of subs){const d=path.join(b,t,sd);try{if(fs.statSync(d).isDirectory())iconDirs.push(d)}catch{}}}
  return iconDirs;
}
function findIcon(n){
  if(!n)return '';
  if(iconCache.has(n))return iconCache.get(n);
  let r='';
  if(path.isAbsolute(n)){if(fs.existsSync(n))r=pathToFileURL(n).href}
  else{
    outer:for(const d of getIconDirs())for(const e of ['svg','png']){const p=path.join(d,`${n}.${e}`);if(fs.existsSync(p)){r=pathToFileURL(p).href;break outer}}
    if(!r)for(const d of xdgData())for(const e of ['svg','png']){const p=path.join(d,'pixmaps',`${n}.${e}`);if(fs.existsSync(p)){r=pathToFileURL(p).href;break}}
  }
  iconCache.set(n,r);return r;
}
// Liste les applis installées (fichiers .desktop, y compris Flatpak)
function listApps(){
  const dirs=xdgData().map(d=>path.join(d,'applications'));
  const out=new Map();
  for(const d of dirs){let fl;try{fl=fs.readdirSync(d)}catch{continue}
    for(const f of fl){if(!f.endsWith('.desktop'))continue;
      let t;try{t=fs.readFileSync(path.join(d,f),'utf8')}catch{continue}
      const sec=t.split(/\n\[/)[0];
      const g=k=>{const x=sec.match(new RegExp('^'+k.replace(/[\[\]]/g,'\\$&')+'=(.*)$','m'));return x?x[1].trim():''};
      if(g('Type')!=='Application'||g('NoDisplay')==='true'||g('Hidden')==='true'||!g('Exec'))continue;
      const parts=(g('Exec').match(/"[^"]*"|\S+/g)||[]).map(x=>x.replace(/^"|"$/g,'')).filter(x=>!/^%[a-zA-Z]$/.test(x));
      if(parts.length)out.set(f,{id:f,name:g('Name[fr]')||g('Name')||f,cmd:parts[0],args:parts.slice(1),icon:findIcon(g('Icon'))});
    }}
  return [...out.values()].sort((a,b)=>a.name.localeCompare(b.name,'fr'));
}
// Jeux RetroArch : tirage au hasard dans les playlists (.lpl) + pochettes
let lastGames=[];
const cleanName=s=>s.replace(/[&*\/:`<>?\\|"]/g,'_');
function randomGames(n){
  const h=os.homedir(),xc=process.env.XDG_CONFIG_HOME||path.join(h,'.config'),dirs=[...((cfg.jeux&&cfg.jeux.dossier)?[cfg.jeux.dossier.replace(/^~/,h)]:[]),path.join(xc,'retroarch'),path.join(h,'.config/retroarch'),path.join(h,'.var/app/org.libretro.RetroArch/config/retroarch'),path.join(h,'snap/retroarch/current/.config/retroarch'),path.join(h,'.retroarch')];
  const all=[];let base='';
  for(const d of dirs){
    const pl=path.join(d,'playlists');let fl;try{fl=fs.readdirSync(pl)}catch{continue}
    for(const f of fl){
      if(!f.endsWith('.lpl')||/history|favorites/i.test(f))continue;
      let j;try{j=JSON.parse(fs.readFileSync(path.join(pl,f),'utf8'))}catch{continue}
      const def=j.default_core_path&&j.default_core_path!=='DETECT'?j.default_core_path:'';
      for(const it of j.items||[]){
        const core=it.core_path&&it.core_path!=='DETECT'?it.core_path:def;
        if(it.path&&core)all.push({label:it.label||path.basename(it.path),system:f.replace(/\.lpl$/,''),db:(it.db_name||f).replace(/\.lpl$/,''),path:it.path,core});
      }
    }
    if(all.length){base=d;break}
  }
  for(let i=all.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[all[i],all[j]]=[all[j],all[i]]}
  lastGames=all.slice(0,n).map(g=>{
    const tp=path.join(base,'thumbnails',g.db,'Named_Boxarts',cleanName(g.label)+'.png');
    return {...g,thumb:fs.existsSync(tp)?pathToFileURL(tp).href:''};
  });
  return lastGames.map(({label,system,thumb})=>({label,system,thumb}));
}
ipcMain.handle('games',(e,n)=>local(e)?randomGames(Math.min(Math.max(+n||8,1),24)):[]);
ipcMain.on('play',(e,i)=>{
  if(!local(e))return;
  const g=lastGames[i];if(!g)return;
  const p=((cfg.jeux&&cfg.jeux.cmd)||'retroarch').trim().split(/\s+/);
  runApp(p[0],[...p.slice(1),'-f','-L',g.core,g.path]);
});
// Requêtes HTTP faites côté système (pas de blocage CORS, clé envoyée en en-tête)
ipcMain.handle('http',async(e,url,headers)=>{
  if(!local(e))return {status:0,body:'refusé'};
  try{
    if(!/^https?:\/\//.test(url))return {status:0,body:'adresse invalide'};
    const r=await fetch(url,{headers:headers||{},signal:AbortSignal.timeout(10000)});
    return {status:r.status,body:await r.text()};
  }catch(err){return {status:0,body:String((err.cause&&err.cause.code)||err.message||err)}}
});
// Bande-annonce : ouverte dans le navigateur (YouTube uniquement)
// Profil Firefox dédié aux bandes-annonces : lecture automatique autorisée, pas d'écran de bienvenue
function trailerProfile(){
  const d=path.join(app.getPath('userData'),'firefox-trailer');
  const prefs={'media.autoplay.default':0,'media.autoplay.blocking_policy':0,'media.autoplay.enabled.user-gestures-needed':false,
    'browser.shell.checkDefaultBrowser':false,'browser.aboutwelcome.enabled':false,'browser.startup.homepage_override.mstone':'ignore',
    'datareporting.policy.dataSubmissionEnabled':false,'toolkit.telemetry.reportingpolicy.firstRun':false,
    'full-screen-api.warning.timeout':0,'full-screen-api.approval-required':false,'browser.tabs.warnOnClose':false};
  try{fs.mkdirSync(d,{recursive:true});
    fs.writeFileSync(path.join(d,'user.js'),Object.entries(prefs).map(([k,v])=>`user_pref(${JSON.stringify(k)}, ${JSON.stringify(v)});`).join('\n')+'\n');
    return d}catch{return ''}
}
// Commande de lecture d'une bande-annonce : plein écran (lecteur YouTube seul) et lecture automatique, selon les réglages
function buildTrailer(u){
  if(u.protocol!=='https:'||!/^(www\.)?(youtube\.com|youtu\.be|youtube-nocookie\.com)$/.test(u.hostname))return null;
  const id=u.searchParams.get('v')||(u.pathname.match(/\/embed\/([\w-]{6,20})/)||[])[1]||(u.hostname==='youtu.be'?u.pathname.slice(1):'');
  if(!/^[\w-]{6,20}$/.test(id))return null;
  const t=Object.assign({plein:true,auto:true},cfg.trailer);
  const p=((cfg.navigateur&&cfg.navigateur.cmd)||defaultBrowser()).trim().split(/\s+/),bin=path.basename(p[0]);
  const ff=/^(firefox|firefox-esr|librewolf)$/.test(bin),cr=/chrom|chrome|brave|vivaldi|edge/i.test(bin),extra=[];
  if(t.auto){if(ff){const d=trailerProfile();if(d){if(!/--new-instance|--no-remote/.test(p.join(' ')))extra.push('--new-instance');extra.push('--profile',d)}}else if(cr)extra.push('--autoplay-policy=no-user-gesture-required')}
  if(t.plein&&!/--kiosk|--start-fullscreen|--fullscreen|--app/.test(p.join(' '))){if(ff)extra.push('--kiosk');else if(cr)extra.push('--start-fullscreen')}
  const target=t.plein?`https://www.youtube-nocookie.com/embed/${id}?autoplay=${t.auto?1:0}&rel=0&fs=1&iv_load_policy=3&playsinline=1`
    :`https://www.youtube.com/watch?v=${id}${t.auto?'&autoplay=1':''}`;
  return [p[0],[...p.slice(1),...extra,target]];
}
ipcMain.on('trailer',(e,url)=>{
  if(!local(e))return;
  let u;try{u=new URL(url)}catch{return}
  const r=buildTrailer(u);if(r)runApp(r[0],r[1]);
});
// Ajout d'une appli depuis l'accueil
ipcMain.on('addapp',(e,a)=>{
  if(!local(e)||!a||typeof a!=='object')return;
  const str=v=>typeof v==='string'?v.slice(0,500):'',n=str(a.n);
  if(!n||!str(a.cmd))return;
  cfg.apps=cfg.apps||[];
  cfg.apps.push({id:n.toLowerCase().replace(/\W+/g,'-')+'-'+Math.random().toString(36).slice(2,6),n,s:'',cmd:str(a.cmd),
    args:(Array.isArray(a.args)?a.args:[]).slice(0,30).map(str),app:str(a.app),desktop:str(a.desktop),icon:/^file:\/\//.test(a.icon)?str(a.icon):''});
  fs.writeFileSync(cfgFile(),JSON.stringify(cfg,null,2));
});
// Navigateur de dossiers pour les Réglages (liste uniquement des dossiers)
ipcMain.handle('ls',(e,dir,filter)=>{
  if(!local(e))return null;
  const home=os.homedir(),d=path.resolve(String(dir||home).replace(/^~/,home));
  const isDir=x=>{try{return x.isDirectory()||(x.isSymbolicLink()&&fs.statSync(path.join(d,x.name)).isDirectory())}catch{return false}};
  let dirs=[];try{dirs=fs.readdirSync(d,{withFileTypes:true}).filter(isDir).map(x=>x.name)}catch{}
  dirs.sort((a,b)=>(a[0]==='.')-(b[0]==='.')||a.localeCompare(b,'fr'));
  let files=[];
  if(filter==='img'){try{files=fs.readdirSync(d,{withFileTypes:true}).filter(x=>x.isFile()&&/\.(png|jpe?g|svg|webp|gif|ico)$/i.test(x.name)).map(x=>x.name).sort((a,b)=>a.localeCompare(b,'fr')).slice(0,400)}catch{}}
  return {dir:d,parent:path.dirname(d)===d?null:path.dirname(d),dirs:dirs.slice(0,400),files};
});
// Logo personnalisé : copie de l'image choisie dans le dossier de config
ipcMain.handle('importlogo',(e,p)=>{
  if(!local(e))return '';
  const ext=path.extname(String(p)).toLowerCase();
  if(!['.png','.jpg','.jpeg','.svg','.webp','.gif','.ico'].includes(ext))return '';
  try{
    const st=fs.statSync(p);if(!st.isFile()||st.size>5*1024*1024)return '';
    const dest=path.join(app.getPath('userData'),'logo'+ext);
    fs.copyFileSync(p,dest);
    return pathToFileURL(dest).href+'?v='+Date.now();
  }catch{return ''}
});
// Contrôleur de média : lecteurs MPRIS via playerctl
let lastPlayer='',mediaSel='';
const mediaPlayers=[]; // lecteurs MPRIS détectés (Feishin, Spotify, VLC, navigateur, téléphone via Bluetooth ou KDE Connect…) : {id,name,status}
function mediaPoll(){
  if(!win||win.isDestroyed()||!win.isVisible())return;
  sendRunning();
  if(cfg&&cfg.media===false)return;
  if(!win.webContents.getURL().startsWith('file:'))return;
  execFile('playerctl',['-a','metadata','--format','{{playerInstance}}\t{{playerName}}\t{{status}}\t{{artist}}\t{{title}}\t{{mpris:artUrl}}\t{{position}}\t{{mpris:length}}\t{{volume}}'],{timeout:1500},(err,out)=>{
    let best=null;const players=[];
    if(!err){
      const rows=String(out).trim().split('\n').map(l=>l.split('\t')).filter(r=>r.length>=3&&r[0]);
      rows.forEach(r=>players.push({id:r[0],name:r[1]||r[0],status:r[2]}));
      // choix du lecteur : sélection manuelle (⇄), puis lecteur préféré des réglages, puis celui qui joue
      const want=String(mediaSel||(cfg.lecteur&&cfg.lecteur.pref)||'').toLowerCase();
      let r=want?(rows.find(x=>x[0].toLowerCase()===want)||rows.find(x=>x[0].toLowerCase().includes(want)||(x[1]||'').toLowerCase().includes(want))):null;
      if(!r)r=rows.find(x=>x[2]==='Playing'&&x[4])||rows.find(x=>x[2]==='Paused'&&x[4]);
      if(r){lastPlayer=r[0];best={id:r[0],player:r[1]||r[0],status:r[2],artist:r[3]||'',title:r[4]||'',art:r[5]||'',pos:(+r[6]||0)/1e6,len:(+r[7]||0)/1e6,vol:(r[8]!==undefined&&r[8]!==''&&!isNaN(+r[8]))?+r[8]:null}}
    }
    mediaPlayers.length=0;mediaPlayers.push(...players);
    if(win&&!win.isDestroyed())win.webContents.send('media',{...(best||{}),players});
  });
}
ipcMain.on('mediasrc',(e,id)=>{if(!local(e)||typeof id!=='string')return;if(id===''||mediaPlayers.some(p=>p.id===id)){mediaSel=id;setTimeout(mediaPoll,50)}});
ipcMain.on('lecteur-open',e=>{if(!local(e))return;const l=cfg.lecteur||{};if(l.cmd)runApp(l.cmd,l.args||[],l.n||l.cmd,'lecteur')});
ipcMain.on('media',(e,cmd)=>{
  if(!local(e)||typeof cmd!=='string')return;
  let args=null;
  if(['play-pause','next','previous'].includes(cmd))args=[cmd];
  else if(/^seek:\d+(\.\d+)?$/.test(cmd))args=['position',cmd.slice(5)];            // position absolue en secondes
  else if(/^volume:(0(\.\d+)?|1(\.0+)?)$/.test(cmd))args=['volume',cmd.slice(7)];  // volume absolu de 0 à 1
  if(!args)return;
  execFile('playerctl',lastPlayer?['-p',lastPlayer,...args]:args,{timeout:1500},()=>setTimeout(mediaPoll,args[0]==='volume'?900:400));
});
// Logo personnalisé d'une application : copie de l'image dans le dossier de config
ipcMain.handle('importapplogo',(e,p,id)=>{
  if(!local(e))return '';
  const ext=path.extname(String(p)).toLowerCase();
  if(!['.png','.jpg','.jpeg','.svg','.webp','.gif','.ico'].includes(ext))return '';
  try{
    const st=fs.statSync(p);if(!st.isFile()||st.size>5*1024*1024)return '';
    const dir=path.join(app.getPath('userData'),'logos');fs.mkdirSync(dir,{recursive:true});
    const dest=path.join(dir,(String(id).replace(/[^\w-]/g,'').slice(0,40)||'app')+'-'+Date.now()+ext);
    fs.copyFileSync(p,dest);return pathToFileURL(dest).href;
  }catch{return ''}
});
// Éteindre / redémarrer l'ordinateur (session locale : pas de mot de passe demandé par logind)
ipcMain.on('power',(e,a)=>{
  if(!local(e)||!['poweroff','reboot'].includes(a))return;
  powerAction(a);
});
// Fond d'écran : image choisie (copiée dans le dossier de config) et images d'un dossier
ipcMain.handle('importwall',(e,p)=>{
  if(!local(e))return '';
  const ext=path.extname(String(p)).toLowerCase();
  if(!['.png','.jpg','.jpeg','.webp'].includes(ext))return '';
  try{const st=fs.statSync(p);if(!st.isFile()||st.size>25*1024*1024)return '';
    const dest=path.join(app.getPath('userData'),'wallpaper'+ext);fs.copyFileSync(p,dest);return pathToFileURL(dest).href+'?v='+Date.now()}catch{return ''}
});
ipcMain.handle('wallfiles',(e,dir)=>{
  if(!local(e))return [];
  const d=path.resolve(String(dir||'').replace(/^~/,os.homedir()));
  try{return fs.readdirSync(d,{withFileTypes:true}).filter(x=>x.isFile()&&/\.(jpe?g|png|webp)$/i.test(x.name)).slice(0,300).map(x=>pathToFileURL(path.join(d,x.name)).href)}catch{return []}
});
ipcMain.handle('apps',e=>local(e)?listApps():[]);
ipcMain.on('config',e=>{e.returnValue=local(e)?cfg:{}});
ipcMain.on('save',(e,c)=>{
  if(!local(e)||!c||typeof c!=='object')return;
  const str=v=>typeof v==='string'?v.slice(0,500):'',j=c.jellyfin||{};
  const n={jellyfin:{url:str(j.url),key:str(j.key),tmdb:str(j.tmdb),user:{id:str((j.user||{}).id),name:str((j.user||{}).name)}},
    meteo:{ville:str((c.meteo||{}).ville),style:['compact','minimal','detail','pastille','previsions'].includes((c.meteo||{}).style)?c.meteo.style:'compact'},
    nom:str(c.nom).slice(0,24),
    continuer:(h=>({afficher:h.afficher!==false,nb:Math.min(5,Math.max(1,Math.round(+h.nb)||3))}))(c.continuer||{}),
    vues:(v=>({biblio:v.biblio!==false,recherche:v.recherche!==false,toutvoir:v.toutvoir!==false}))(c.vues||{}),
    jfMigre:true,media:c.media!==false,
    accueil:(h=>({base:['petite','moyenne','grande'].includes(h.base)?h.base:'moyenne',
      ordre:(Array.isArray(h.ordre)?h.ordre:[]).slice(0,60).map(str),
      tailles:Object.fromEntries(Object.entries(h.tailles&&typeof h.tailles==='object'?h.tailles:{}).slice(0,60).map(([k,v])=>[str(k).slice(0,80),['petite','normale','grande','large'].includes(v)?v:'normale']))}))(c.accueil||{}),
    biblio:(b=>({type:b.type==='tv'?'tv':'movie',tri:['trending','popular','top_rated'].includes(b.tri)?b.tri:'trending',cat:['films','series','tmdb'].includes(b.cat)?b.cat:'films'}))(c.biblio||{}),
    navigateur:{cmd:str((c.navigateur||{}).cmd)},
    lecteur:(l=>({pref:str(l.pref).slice(0,60),n:str(l.n).slice(0,60),cmd:str(l.cmd),args:(Array.isArray(l.args)?l.args:[]).slice(0,30).map(str)}))(c.lecteur||{}),
    trailer:(t=>({plein:t.plein!==false,auto:t.auto!==false}))(c.trailer||{}),
    fermeture:{raccourci:str((c.fermeture||{}).raccourci),zone:Math.min(60,Math.max(6,+((c.fermeture||{}).zone)||10))},
    apparence:(a=>({fond:/^#[0-9a-f]{6}$/i.test(a.fond)?a.fond:'#12131a',tuiles:/^#[0-9a-f]{6}$/i.test(a.tuiles)?a.tuiles:'',bouton:/^#[0-9a-f]{6}$/i.test(a.bouton)?a.bouton:'#ff6a2b',panneau:['classique','cinema','affiches','immersif'].includes(a.panneau)?a.panneau:'cinema',fondu:a.fondu!==false,lateral:a.lateral==='large'?'large':'icones',fondEcran:(f=>({source:['aucun','image','dossier','jellyfin','tmdb','bing','nasa','wallhaven'].includes(f.source)?f.source:'aucun',theme:['cinema','paysages','espace','ville','nature'].includes(f.theme)?f.theme:'cinema',intervalle:[0,10,30,60,360].includes(+f.intervalle)?+f.intervalle:30,assombri:Number.isFinite(+f.assombri)?Math.min(.95,Math.max(0,+f.assombri)):.55,image:/^file:\/\//.test(f.image)?str(f.image):'',dossier:str(f.dossier)}))(a.fondEcran||{}),
    vitre:(v=>({alpha:Number.isFinite(+v.alpha)?Math.min(1,Math.max(.2,+v.alpha)):1,flou:Number.isFinite(+v.flou)?Math.min(60,Math.max(0,+v.flou)):0}))(a.vitre||{}),
    iconeReglages:['curseurs','engrenage','points'].includes(a.iconeReglages)?a.iconeReglages:'curseurs',accent:/^#[0-9a-f]{6}$/i.test(a.accent)?a.accent:'#ff6a2b',contour:/^#[0-9a-f]{6}$/i.test(a.contour)?a.contour:'',forme:(f=>({ratio:['libre','carre','rectangle','large','portrait'].includes(f.ratio)?f.ratio:'libre',rayon:Number.isFinite(+f.rayon)?Math.min(4,Math.max(0,+f.rayon)):.9}))(a.forme||{}),horloge:(h=>({heure:h.heure!==false,meteo:h.meteo!==false,taille:['petite','moyenne','grande'].includes(h.taille)?h.taille:'moyenne'}))(a.horloge||{}),logo:(l=>({type:['defaut','initiale','image','aucun'].includes(l.type)?l.type:'defaut',src:/^file:\/\//.test(l.src)?str(l.src):'',taille:['petit','moyen','grand'].includes(l.taille)?l.taille:'moyen',pos:l.pos==='droite'?'droite':'gauche',nom:l.nom!==false}))(a.logo||{}),flou:Math.min(40,Math.max(0,Number.isFinite(+a.flou)?+a.flou:12))}))(c.apparence||{}),
    jeux:{cmd:str((c.jeux||{}).cmd),dossier:str((c.jeux||{}).dossier)},
    carrousel:{tri:['ajouts','tmdb_note','tmdb_pop','tmdb_tend'].includes((c.carrousel||{}).tri)?c.carrousel.tri:'ajouts',hasard:(c.carrousel||{}).hasard!==false,
      libs:(Array.isArray((c.carrousel||{}).libs)?c.carrousel.libs:[]).slice(0,20).map(l=>({id:str(l.id),n:str(l.n)}))},
    apps:(Array.isArray(c.apps)?c.apps:[]).slice(0,30).map(a=>({
      id:str(a.id)||str(a.n).toLowerCase().replace(/\W+/g,'-'),n:str(a.n),s:str(a.s),jf:!!a.jf,url:/^https?:\/\//i.test(a.url)?str(a.url):'',cmd:str(a.cmd),app:str(a.app),desktop:str(a.desktop),icon:/^file:\/\//.test(a.icon)?str(a.icon):'',
      logo:(l=>({type:['auto','image','initiale','aucun'].includes(l.type)?l.type:'auto',src:/^file:\/\//.test(l.src)?str(l.src):''}))(a.logo||{}),
      args:(Array.isArray(a.args)?a.args:[]).slice(0,30).map(str)}))};
  fs.writeFileSync(cfgFile(),JSON.stringify(n,null,2));cfg=n;
});
app.whenReady().then(()=>{
  cfg=loadCfg();
  if(!cfg.jfMigre){ // Jellyfin devient une appli comme les autres (ajoutée une seule fois)
    cfg.apps=cfg.apps||[];
    if(!cfg.apps.some(a=>a.jf))cfg.apps.unshift({id:'jellyfin',n:'Jellyfin',s:'Médiathèque',jf:true,cmd:'',args:[],icon:''});
    cfg.jfMigre=true;try{fs.writeFileSync(cfgFile(),JSON.stringify(cfg,null,2))}catch{}
  }
  const inst=listApps(),sameArgs=(x,a)=>x.args.join(' ')===(a.args||[]).join(' ');
  (cfg.apps||[]).forEach(a=>{if(!a.icon){const f=inst.find(x=>x.cmd===a.cmd&&sameArgs(x,a))||(a.cmd!=='flatpak'&&inst.find(x=>x.cmd===a.cmd));if(f)a.icon=f.icon}});
  // Autorise la page locale à interroger Jellyfin / TMDB (CORS)
  session.defaultSession.webRequest.onHeadersReceived((d,cb)=>{
    const h={...d.responseHeaders};h['Access-Control-Allow-Origin']=['*'];cb({responseHeaders:h});
  });
  create();
});
setInterval(mediaPoll,2000);
app.on('window-all-closed',()=>app.quit());

app.on('will-quit',()=>globalShortcut.unregisterAll());
