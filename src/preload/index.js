import { contextBridge, ipcRenderer } from 'electron'

/**
 * Safe, typed bridge between the React UI and the Electron main process.
 * The renderer never touches Node or the network directly — it calls these.
 */
const api = {
  // settings
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (s) => ipcRenderer.invoke('settings:save', s),

  // local msfrpcd server management
  startServer: (cfg) => ipcRenderer.invoke('server:start', cfg),
  stopServer: () => ipcRenderer.invoke('server:stop'),
  serverStatus: () => ipcRenderer.invoke('server:status'),
  onServerLog: (cb) => {
    const h = (_e, line) => cb(line)
    ipcRenderer.on('server:log', h)
    return () => ipcRenderer.removeListener('server:log', h)
  },
  onServerExit: (cb) => {
    const h = (_e, code) => cb(code)
    ipcRenderer.on('server:exit', h)
    return () => ipcRenderer.removeListener('server:exit', h)
  },

  // RPC connection
  connect: (cfg) => ipcRenderer.invoke('rpc:connect', cfg),
  disconnect: () => ipcRenderer.invoke('rpc:disconnect'),
  rpcStatus: () => ipcRenderer.invoke('rpc:status'),

  // generic RPC call used by all panels
  rpc: (method, args = []) => ipcRenderer.invoke('rpc:call', { method, args }),

  openExternal: (url) => ipcRenderer.invoke('open:external', url)
}

contextBridge.exposeInMainWorld('metadeck', api)
