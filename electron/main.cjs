const {app,BrowserWindow,ipcMain,Menu,Tray,nativeImage,Notification,screen,shell,safeStorage} = require('electron');
const fs=require('node:fs'), path=require('node:path'), {execFile}=require('node:child_process');
const {Guard,defaults,validate}=require('./guard.cjs');
const {discover,request}=require('./api.cjs');
const protection=require('./protection.cjs');
const {ConnectionMeter}=require('./classifier.cjs');
const smoke=process.argv.includes('--smoke');
if(smoke)app.setPath('userData',path.join(app.getPath('temp'),'clash-traffic-guard-smoke'));
else app.setPath('userData',path.join(app.getPath('appData'),'Clash Traffic Guard'));
app.setName('Clash Traffic Guard');
app.setAppUserModelId('ClashTrafficGuard.Desktop');
if(!app.requestSingleInstanceLock())app.quit();
else boot();
function boot() {
  let ball,settings,tray,guard,config,target,cancel,retry,watchdog,busy=false,quitting=false,drag,generation=0;
  let status={connected:false,level:'offline',up:0,down:0,total:0,minute:0,hour:0,today:0,message:'正在连接 Mihomo…'}, logs=[],recovery=null,verified=false;
  const dir=app.getPath('userData');fs.mkdirSync(dir,{recursive:true});
  const file=n=>path.join(dir,n+'.json');
  function read(n,fallback) {try{return JSON.parse(fs.readFileSync(file(n),'utf8'));}catch{return fallback;}}
  function write(n,v) {const f=file(n);fs.writeFileSync(f+'.tmp',JSON.stringify(v));fs.renameSync(f+'.tmp',f);}
  function log(message) { logs.unshift({time:new Date().toLocaleTimeString('zh-CN'),message});logs=logs.slice(0,60);write('events',logs);publish(); }
  function persistConfig() {const c={...config};if(c.secret){if(!safeStorage.isEncryptionAvailable())throw Error('Windows 密钥加密不可用');c.secretEncrypted=safeStorage.encryptString(c.secret).toString('base64');}delete c.secret;write('settings',c);}
  function publicState() {return {...status,config:{...config,secret:''},hasSecret:!!config.secret,endpoint:target?.endpoint || '',source:target?.source || '',blocked:!!recovery,verified,busy,logs};}
  function publish() {for(const w of [ball,settings])if(w&&!w.isDestroyed())w.webContents.send('state',publicState());}
  function notify(message) {
    if(config.sound)shell.beep();
    if(config.notification&&Notification.isSupported()){const n=new Notification({title:'Clash 流量保护',body:message});n.on('click',openSettings);n.show();}
  }
  function connect() {
    if(quitting)return;
    cancel?.();clearTimeout(retry);target=discover(config);guard.reset();
    const token=++generation,meter=new ConnectionMeter();let proxies={},refresh=0;
    status.connected=false;status.level='offline';status.message='正在连接 Mihomo…';publish();
    const poll=async()=> {try {
      if(token!==generation||quitting)return;
      if(Date.now()-refresh>30000){proxies=(await api('/proxies')).proxies;refresh=Date.now();}
      const snapshot=await api('/connections');
      if(token!==generation||quitting)return;
      const split=meter.sample(snapshot,proxies);
      const first=!status.connected;
      if(!split.valid)guard.reset();
      const next=guard.sample(split.proxy.up,split.proxy.down,Date.now(),split.proxyBytes);
      status={...status,...next,split,connected:true,message:recovery ? verified ? '阻断配置已确认 · 请恢复后继续使用' : '阻断尚未确认 · 请查看运行记录' : config.autoBlock ? 'PROXY 监控 · 自动阻断已开启' : 'PROXY 监控 · 仅报警'};
      if(first)log('已连接 Mihomo · '+target.source);
      if(!recovery&&next.alarm){log(next.reason);notify(next.reason);}
      if(!recovery&&next.trip)void blockTraffic(next.reason);
      publish();retry=setTimeout(poll,1000);
    } catch(e) {
      if(token!==generation||quitting)return;
      const was=status.connected;guard.reset();verified=false;
      status={...status,connected:false,level:'offline',up:0,down:0,total:0,seconds:0,message:e.message+'；3 秒后重连'};
      if(was)log('流量接口断开：'+e.message);
      publish();retry=setTimeout(connect,3000);
    }};
    void poll();
  }
  function api(route,method,body) {return request(target,route,method,body);}
  async function blockTraffic(reason) {
    if(busy||recovery)return;
    busy=true;publish();
    try {
      await protection.block(api,original=> {recovery={...original,endpoint:target.endpoint};write('recovery',recovery);});
      verified=true;
      log('已阻断：GLOBAL → REJECT，现有连接已关闭。'+reason);notify('已触发流量保护，经过 Clash 的新连接已被拒绝。');
      if(config.quitClash) {
        // The API block remains latched even if Service Mode keeps the core alive.
        for(const name of ['clash-verge.exe','verge-mihomo.exe','mihomo.exe','clash-meta.exe','clash.exe']) {
          await new Promise(resolve=>execFile('taskkill.exe',['/IM',name,'/F'],{windowsHide:true,timeout:5000},()=>resolve()));
        }
        let version=null;try{version=await api('/version');}catch{}
        log(version ? '退出后内核仍可访问（可能为服务模式）；继续维持 API 阻断。' : '已发送退出命令，内核接口不可达；这不代表整机断网。');
      }
    } catch(e) {verified=false;log('阻断未完成：'+e.message);notify('阻断未完成，请检查保护面板。'+e.message);}
    finally {busy=false;publish();}
  }
  async function maintain() {
    if(!recovery||busy||!status.connected)return;
    if(target.endpoint!==recovery.endpoint)return;
    busy=true;
    try {
      const c=await api('/configs'),g=await api('/proxies/GLOBAL');
      if(c.mode!=='global'||g.now!=='REJECT'){await protection.enforce(api);log('发现 Clash 配置变化，已重新应用保护阻断。');}
      verified=true;
    } catch(e) {verified=false;status.message='无法确认阻断状态：'+e.message;}
    finally{busy=false;publish();}
  }
  function windowOptions(extra) {return {...extra,icon:icon(),webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}};}
  function secure(w) {w.webContents.setWindowOpenHandler(()=>({action:'deny'}));w.webContents.on('will-navigate',e=>e.preventDefault());}
  function icon() {
    const size=32,b=Buffer.alloc(size*size*4);
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){const i=(y*size+x)*4,inside=(x-16)**2+(y-16)**2<210;b[i]=130;b[i+1]=211;b[i+2]=47;b[i+3]=inside?255:0;}
    return nativeImage.createFromBitmap(b,{width:size,height:size});
  }
  function menu() {return Menu.buildFromTemplate([{label:'打开流量保护面板',click:openSettings},{label:'重新连接内核',click:connect},{type:'separator'},{label:recovery?'退出小球（保留阻断）':'退出小球',click:()=>app.quit()}]);}
  function clamp(x,y) {const a=screen.getDisplayNearestPoint({x:Math.round(x),y:Math.round(y)}).workArea;return {x:Math.max(a.x,Math.min(Math.round(x),a.x+a.width-80)),y:Math.max(a.y,Math.min(Math.round(y),a.y+a.height-80)),a};}
  function openSettings() {
    if(settings&&!settings.isDestroyed()){settings.show();settings.focus();return;}
    settings=new BrowserWindow(windowOptions({width:920,height:820,minWidth:800,minHeight:650,backgroundColor:'#101722',title:'Clash Traffic Guard · 流量保护',autoHideMenuBar:true,show:false}));
    secure(settings);settings.loadFile(path.join(__dirname,'../ui/index.html'));
    settings.once('ready-to-show',()=>settings.show());settings.on('closed',()=>settings=null);
  }
  app.on('second-instance',()=>openSettings());
  app.on('window-all-closed',()=>{});
  app.on('before-quit',()=>{quitting=true;cancel?.();clearTimeout(retry);clearInterval(watchdog);if(guard)write('usage',guard.persist());});
  app.whenReady().then(async()=> {
    const saved=read('settings',defaults);
    try {if(saved.secretEncrypted)saved.secret=safeStorage.decryptString(Buffer.from(saved.secretEncrypted,'base64'));config=validate({...defaults,...saved});}catch{config={...defaults};}
    if(smoke)config={...defaults};
    recovery=read('recovery',null);logs=read('events',[]);
    guard=new Guard(config,read('usage',{}));
    status.today=guard.today;
    ball=new BrowserWindow(windowOptions({width:80,height:80,frame:false,transparent:true,alwaysOnTop:true,resizable:false,skipTaskbar:true,hasShadow:false,show:false}));
    ball.setAlwaysOnTop(true,'screen-saver');
    const pos=read('position',{x:screen.getPrimaryDisplay().workArea.width-96,y:180});const p=clamp(pos.x,pos.y);ball.setPosition(p.x,p.y);
    secure(ball);
    tray=new Tray(icon());tray.setToolTip('Clash Traffic Guard · 双击悬浮球打开设置');tray.on('click',openSettings);tray.on('right-click',()=>tray.popUpContextMenu(menu()));
    ipcMain.handle('get-state',()=>publicState());
    ipcMain.handle('save',async(_e,patch)=> {
      if(busy||recovery)throw Error('请先恢复当前保护状态再修改设置');
      const next=validate({...patch,secret:patch.secret || config.secret});
      app.setLoginItemSettings({openAtLogin:next.startup,path:process.execPath,args:app.isPackaged?[]:[app.getAppPath()]});
      config=next;persistConfig();guard.config=config;connect();log('设置已保存');return publicState();
    });
    ipcMain.handle('action',async(_e,name)=> {
      if(name==='settings')openSettings();
      else if(name==='menu')menu().popup({window:ball});
      else if(name==='reconnect')connect();
      else if(name==='test'){notify('测试报警：通知与提示音已触发。');log('已测试报警（未改变 Clash）');}
      else if(name==='block')await blockTraffic('手动紧急阻断');
      else if(name==='restore') {
        if(busy)throw Error('正在执行保护操作，请稍候');
        if(!recovery)throw Error('当前没有需要恢复的阻断');
        if(target.endpoint!==recovery.endpoint)throw Error('当前接口与被阻断接口不一致');
        busy=true;publish();
        try {await protection.restore(api,recovery);recovery=null;verified=false;write('recovery',null);guard.reset();log('原 Clash 模式和 GLOBAL 选择已恢复。');}finally{busy=false;publish();}
      }
      else if(name==='quit')app.quit();
      return publicState();
    });
    ipcMain.on('drag',(_e,phase)=> {
      if(phase==='start'){drag={cursor:screen.getCursorScreenPoint(),pos:ball.getPosition()};}
      else if(phase==='move'&&drag){const now=screen.getCursorScreenPoint(),p=clamp(drag.pos[0]+now.x-drag.cursor.x,drag.pos[1]+now.y-drag.cursor.y);ball.setPosition(p.x,p.y);}
      else if(phase==='end'&&drag){drag=null;let [x,y]=ball.getPosition();const p=clamp(x,y);x=p.x;y=p.y;if(x-p.a.x<32)x=p.a.x;if(p.a.x+p.a.width-x-80<32)x=p.a.x+p.a.width-80;ball.setPosition(x,y);write('position',{x,y});}
    });
    screen.on('display-metrics-changed',()=>{const [x,y]=ball.getPosition(),p=clamp(x,y);ball.setPosition(p.x,p.y);});
    await ball.loadFile(path.join(__dirname,'../ui/ball.html'));ball.show();
    connect();watchdog=setInterval(maintain,3000);
    setInterval(()=>{write('usage',guard.persist());},15000).unref();
    if(!fs.existsSync(file('settings')))openSettings();
    if(smoke) {
      openSettings();
      setTimeout(async()=> {
        const output=path.join(app.getAppPath(),'artifacts');fs.mkdirSync(output,{recursive:true});
        try {
          const result={connected:status.connected,endpoint:target.endpoint,message:status.message,ball:await ball.webContents.executeJavaScript('document.body.innerText'),panel:await settings.webContents.executeJavaScript('document.body.innerText')};
          fs.writeFileSync(path.join(output,'smoke.json'),JSON.stringify(result,null,2));
          fs.writeFileSync(path.join(output,'panel.png'),(await settings.webContents.capturePage()).toPNG());
          fs.writeFileSync(path.join(output,'ball.png'),(await ball.webContents.capturePage()).toPNG());
        } catch(e) {fs.writeFileSync(path.join(output,'smoke-error.txt'),String(e));}
        app.quit();
      },6500);
    }
  });
}
