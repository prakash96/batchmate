const { contextBridge, ipcRenderer } =  require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  executeHttp: (config) => ipcRenderer.invoke("execute-http", config),
  parseCurl: (curl) => ipcRenderer.invoke("parse-curl", curl),
  openFile: () => ipcRenderer.invoke("open-file")

});
