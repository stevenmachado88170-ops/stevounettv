const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('ov',{close:()=>ipcRenderer.send('close-app'),home:()=>ipcRenderer.send('ov-home'),hover:()=>ipcRenderer.send('ov-hover'),leave:()=>ipcRenderer.send('ov-leave')});
