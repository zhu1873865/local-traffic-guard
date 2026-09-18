const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('guard',{
  state:()=>ipcRenderer.invoke('get-state'),
  save:settings=>ipcRenderer.invoke('save',settings),
  action:name=>ipcRenderer.invoke('action',name),
  drag:phase=>ipcRenderer.send('drag',phase),
  subscribe:fn=> {const handler=(_e,state)=>fn(state);ipcRenderer.on('state',handler);return ()=>ipcRenderer.removeListener('state',handler);}
});
