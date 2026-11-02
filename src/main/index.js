import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { existsSync } from 'node:fs'
import { MsfRpcClient } from './msfrpc.js'
import { ServerManager } from './serverManager.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

let mainWindow = null
let client = null
let server = null

// ---- settings persistence ------------------------------------------------
const settingsPath = () => path.join(app.getPath('userData'), 'metadeck-settings.json')

function detectDefaults() {
  const home = os.homedir()
  const fwCandidates = [
    path.join(home, 'metasploit-framework'),
    '/opt/metasploit-framework',
    '/usr/local/share/metasploit-framework'
  ]
  const rubyCandidates = [
    '/opt/homebrew/opt/ruby@3.3/bin/ruby',
    '/opt/homebrew/opt/ruby/bin/ruby',
    '/usr/local/opt/ruby@3.3/bin/ruby',
    '/usr/bin/ruby'
  ]
  return {
    host: '127.0.0.1',
    port: 55553,
    ssl: false,
    user: 'msf',
    pass: 'metadeck',
    useDatabase: false,
    frameworkPath: fwCandidates.find(existsSync) || fwCandidates[0],
    rubyBin: rubyCandidates.find(existsSync) || rubyCandidates[0]
  }
}

function loadSettings() {
  try {
    const raw = fs.readFileSync(settingsPath(), 'utf8')
    return { ...detectDefaults(), ...JSON.parse(raw) }
  } catch {
    return detectDefaults()
  }
}

function saveSettings(s) {
  try {
    fs.mkdirSync(path.dirname(settingsPath()), { recursive: true })
    fs.writeFileSync(settingsPath(), JSON.stringify(s, null, 2))
  } catch (e) {
    // non-fatal
  }
}

// ---- window ---------------------------------------------------------------
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#0d1117',
    title: 'MetaDeck',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function sendToRenderer(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload)
}

// ---- IPC: settings --------------------------------------------------------
ipcMain.handle('settings:get', () => loadSettings())
ipcMain.handle('settings:save', (_e, s) => {
  saveSettings(s)
  return true
})

// ---- IPC: local server (msfrpcd) -----------------------------------------
ipcMain.handle('server:start', (_e, cfg) => {
  if (!server) {
    server = new ServerManager(
      (line) => sendToRenderer('server:log', line),
      (code) => sendToRenderer('server:exit', code)
    )
  }
  server.start(cfg)
  return true
})
ipcMain.handle('server:stop', () => (server ? server.stop() : false))
ipcMain.handle('server:status', () => ({ running: !!(server && server.running) }))

// ---- IPC: RPC connection --------------------------------------------------
ipcMain.handle('rpc:connect', async (_e, { host, port, ssl, user, pass }) => {
  client = new MsfRpcClient({ host, port, ssl })
  await client.login(user, pass)
  const version = await client.call('core.version')
  return { connected: true, version }
})

ipcMain.handle('rpc:disconnect', async () => {
  if (client) await client.logout().catch(() => {})
  client = null
  return { connected: false }
})

ipcMain.handle('rpc:status', () => ({ connected: !!(client && client.connected) }))

// Generic RPC passthrough used by every UI panel.
ipcMain.handle('rpc:call', async (_e, { method, args }) => {
  if (!client || !client.connected) throw new Error('Not connected to Metasploit')
  return client.call(method, ...(args || []))
})

ipcMain.handle('open:external', (_e, url) => shell.openExternal(url))

// ---- lifecycle ------------------------------------------------------------
app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (server) server.stop()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  if (server) server.stop()
})
