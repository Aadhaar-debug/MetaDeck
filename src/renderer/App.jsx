import React, { useEffect, useState, useCallback } from 'react'
import Sidebar from './components/Sidebar.jsx'
import ConnectPanel from './components/ConnectPanel.jsx'
import ModuleBrowser from './components/ModuleBrowser.jsx'
import PayloadBuilder from './components/PayloadBuilder.jsx'
import SessionsDashboard from './components/SessionsDashboard.jsx'
import ConsolePanel from './components/ConsolePanel.jsx'
import Toasts, { useToasts } from './components/Toasts.jsx'

const api = window.metadeck

export default function App() {
  const [tab, setTab] = useState('connect')
  const [connection, setConnection] = useState({ connected: false, version: null })
  const { toasts, push } = useToasts()

  // On launch, reflect any existing connection (e.g. after a reload).
  useEffect(() => {
    api.rpcStatus().then((s) => setConnection((c) => ({ ...c, connected: s.connected })))
  }, [])

  const rpc = useCallback(
    async (method, args = []) => {
      try {
        return await api.rpc(method, args)
      } catch (e) {
        push({ kind: 'error', text: e.message })
        throw e
      }
    },
    [push]
  )

  return (
    <div className="app">
      <Sidebar tab={tab} setTab={setTab} connection={connection} />
      <main className="main">
        <div className="topbar">
          <div className="topbar-title">
            {TABS[tab] || 'MetaDeck'}
          </div>
          <div className={`conn-pill ${connection.connected ? 'on' : 'off'}`}>
            <span className="dot" />
            {connection.connected
              ? `Connected · Metasploit ${connection.version?.version || ''}`
              : 'Not connected'}
          </div>
        </div>

        <div className="panel-area">
          {tab === 'connect' && (
            <ConnectPanel
              connection={connection}
              setConnection={setConnection}
              push={push}
            />
          )}
          {tab === 'modules' && (
            <ModuleBrowser connected={connection.connected} rpc={rpc} push={push} />
          )}
          {tab === 'payloads' && (
            <PayloadBuilder connected={connection.connected} rpc={rpc} push={push} />
          )}
          {tab === 'sessions' && (
            <SessionsDashboard connected={connection.connected} rpc={rpc} push={push} />
          )}
          {tab === 'console' && (
            <ConsolePanel connected={connection.connected} rpc={rpc} push={push} />
          )}
        </div>
      </main>
      <Toasts toasts={toasts} />
    </div>
  )
}

const TABS = {
  connect: 'Connection & Server',
  modules: 'Module Browser',
  payloads: 'Payload Builder',
  sessions: 'Sessions',
  console: 'Console'
}
