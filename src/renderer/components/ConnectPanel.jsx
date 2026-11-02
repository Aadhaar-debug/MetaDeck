import React, { useEffect, useRef, useState } from 'react'

const api = window.metadeck

export default function ConnectPanel({ connection, setConnection, push }) {
  const [cfg, setCfg] = useState(null)
  const [serverRunning, setServerRunning] = useState(false)
  const [log, setLog] = useState('')
  const [busy, setBusy] = useState(false)
  const [stats, setStats] = useState(null)
  const logRef = useRef(null)

  useEffect(() => {
    api.getSettings().then(setCfg)
    api.serverStatus().then((s) => setServerRunning(s.running))
    const offLog = api.onServerLog((line) => setLog((l) => (l + line).slice(-20000)))
    const offExit = api.onServerExit(() => setServerRunning(false))
    return () => {
      offLog()
      offExit()
    }
  }, [])

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [log])

  // Load the dashboard stats whenever we become connected.
  useEffect(() => {
    if (connection.connected) refreshStats()
  }, [connection.connected])

  function set(k, v) {
    const next = { ...cfg, [k]: v }
    setCfg(next)
    api.saveSettings(next)
  }

  async function refreshStats() {
    try {
      const s = await api.rpc('core.module_stats')
      setStats(s)
    } catch {
      /* ignore */
    }
  }

  async function startServer() {
    setBusy(true)
    try {
      setLog('')
      await api.startServer(cfg)
      setServerRunning(true)
      push({ kind: 'info', text: 'Starting local Metasploit RPC server…' })
    } catch (e) {
      push({ kind: 'error', text: e.message })
    } finally {
      setBusy(false)
    }
  }

  async function stopServer() {
    await api.stopServer()
    setServerRunning(false)
  }

  async function connect() {
    setBusy(true)
    try {
      const res = await api.connect({
        host: cfg.host,
        port: cfg.port,
        ssl: cfg.ssl,
        user: cfg.user,
        pass: cfg.pass
      })
      setConnection({ connected: true, version: res.version })
      push({ kind: 'success', text: 'Connected to Metasploit RPC' })
    } catch (e) {
      push({ kind: 'error', text: 'Connect failed: ' + e.message })
    } finally {
      setBusy(false)
    }
  }

  async function disconnect() {
    await api.disconnect()
    setConnection({ connected: false, version: null })
    setStats(null)
  }

  // Beginner one-click: start the local server, wait for it to listen, connect.
  async function startAndConnect() {
    setBusy(true)
    try {
      setLog('')
      if (!serverRunning) {
        await api.startServer(cfg)
        setServerRunning(true)
      }
      push({ kind: 'info', text: 'Waiting for the server to come online…' })
      await waitAndConnect()
    } catch (e) {
      push({ kind: 'error', text: e.message })
    } finally {
      setBusy(false)
    }
  }

  async function waitAndConnect() {
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 1500))
      try {
        const res = await api.connect({
          host: cfg.host,
          port: cfg.port,
          ssl: cfg.ssl,
          user: cfg.user,
          pass: cfg.pass
        })
        setConnection({ connected: true, version: res.version })
        push({ kind: 'success', text: 'Connected to Metasploit RPC' })
        return
      } catch {
        /* server not up yet, retry */
      }
    }
    push({ kind: 'error', text: 'Server did not come online in time. Check the server log below.' })
  }

  if (!cfg) return <div className="loading">Loading settings…</div>

  return (
    <div className="connect">
      {connection.connected && (
        <div className="dashboard">
          <Tile label="Status" value="Connected" accent="green" />
          <Tile label="Metasploit" value={connection.version?.version || '—'} />
          <Tile label="Ruby" value={connection.version?.ruby || '—'} />
          <Tile label="Exploits" value={num(stats?.exploits)} />
          <Tile label="Auxiliary" value={num(stats?.auxiliary)} />
          <Tile label="Payloads" value={num(stats?.payloads)} />
          <Tile label="Post" value={num(stats?.post)} />
          <Tile label="Encoders" value={num(stats?.encoders)} />
        </div>
      )}

      <div className="cards">
        <section className="card">
          <h2>1 · Local Metasploit Server</h2>
          <p className="hint">
            MetaDeck can launch the Metasploit RPC service for you — no terminal needed.
            Point it at your Metasploit folder, then press <b>Start &amp; Connect</b>.
          </p>

          <Field label="Metasploit framework folder">
            <input value={cfg.frameworkPath} onChange={(e) => set('frameworkPath', e.target.value)} />
          </Field>
          <Field label="Ruby interpreter">
            <input value={cfg.rubyBin} onChange={(e) => set('rubyBin', e.target.value)} />
          </Field>

          <div className="row">
            <label className="check">
              <input
                type="checkbox"
                checked={cfg.useDatabase}
                onChange={(e) => set('useDatabase', e.target.checked)}
              />
              Use database (requires PostgreSQL)
            </label>
          </div>

          <div className="btn-row">
            <button className="btn primary" disabled={busy} onClick={startAndConnect}>
              ⚡ Start &amp; Connect
            </button>
            <button className="btn" disabled={busy || serverRunning} onClick={startServer}>
              ▶ Start server
            </button>
            <button className="btn danger" disabled={!serverRunning} onClick={stopServer}>
              ■ Stop server
            </button>
            <span className={`srv ${serverRunning ? 'on' : 'off'}`}>
              {serverRunning ? 'server running' : 'server stopped'}
            </span>
          </div>

          <div className="logbox" ref={logRef}>
            <pre>{log || 'Server log will appear here…'}</pre>
          </div>
        </section>

        <section className="card">
          <h2>2 · Connection Details</h2>
          <p className="hint">
            These are the credentials MetaDeck uses to log in to the RPC server. The defaults
            match the local server above — change them only to connect to a remote Metasploit.
          </p>

          <div className="grid2">
            <Field label="Host / IP">
              <input value={cfg.host} onChange={(e) => set('host', e.target.value)} placeholder="127.0.0.1" />
            </Field>
            <Field label="Port">
              <input
                type="number"
                value={cfg.port}
                onChange={(e) => set('port', Number(e.target.value))}
                placeholder="55553"
              />
            </Field>
            <Field label="Username">
              <input value={cfg.user} onChange={(e) => set('user', e.target.value)} />
            </Field>
            <Field label="Password">
              <input
                type="password"
                value={cfg.pass}
                onChange={(e) => set('pass', e.target.value)}
              />
            </Field>
          </div>

          <div className="row">
            <label className="check">
              <input type="checkbox" checked={cfg.ssl} onChange={(e) => set('ssl', e.target.checked)} />
              Use SSL (enable for remote servers started without <code>-S</code>)
            </label>
          </div>

          <div className="btn-row">
            {!connection.connected ? (
              <button className="btn primary" disabled={busy} onClick={connect}>
                🔌 Connect
              </button>
            ) : (
              <button className="btn danger" onClick={disconnect}>
                Disconnect
              </button>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
    </label>
  )
}

function Tile({ label, value, accent }) {
  return (
    <div className={`tile ${accent || ''}`}>
      <div className="tile-value">{value ?? '—'}</div>
      <div className="tile-label">{label}</div>
    </div>
  )
}

const num = (v) => (v == null ? '—' : String(v))
