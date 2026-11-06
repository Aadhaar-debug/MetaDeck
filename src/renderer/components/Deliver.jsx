import React, { useEffect, useState } from 'react'

const api = window.metadeck

/**
 * Hosts a chosen file over HTTP on the local network so an authorized target
 * machine can download it. Shows the reachable URLs and a live download log.
 */
export default function Deliver() {
  const [filePath, setFilePath] = useState('')
  const [port, setPort] = useState('8000')
  const [status, setStatus] = useState({ running: false, info: null })
  const [result, setResult] = useState(null)
  const [ips, setIps] = useState([])
  const [hits, setHits] = useState([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api.localIPs().then(setIps)
    api.fileServerStatus().then(setStatus)
    const off = api.onFileServerHit((hit) => setHits((h) => [hit, ...h].slice(0, 50)))
    return off
  }, [])

  async function choose() {
    const p = await api.openFileDialog()
    if (p) setFilePath(p)
  }

  async function start() {
    if (!filePath) return
    setBusy(true)
    try {
      const res = await api.startFileServer(filePath, Number(port))
      setResult(res)
      setStatus({ running: true, info: res })
      setHits([])
    } catch (e) {
      setResult({ error: e.message })
    } finally {
      setBusy(false)
    }
  }

  async function stop() {
    await api.stopFileServer()
    setStatus({ running: false, info: null })
    setResult(null)
  }

  const fileName = result?.fileName || (filePath ? filePath.split('/').pop() : '')
  const urls = ips.map((ip) => `http://${ip.address}:${port}/${encodeURIComponent(fileName)}`)

  return (
    <div className="deliver">
      <section className="card">
        <h2>Host a file on your network</h2>
        <p className="hint">
          Serve a built payload (or any file) over HTTP so a target on the same network can download
          it — e.g. with a browser, <code>curl</code> or <code>wget</code>. Authorized testing only.
        </p>

        <label className="field">
          <span className="field-label">File to host</span>
          <div className="out-row">
            <input readOnly value={filePath} placeholder="Choose a file…" />
            <button className="btn" onClick={choose}>Choose…</button>
          </div>
        </label>

        <label className="field" style={{ maxWidth: 220 }}>
          <span className="field-label">Port</span>
          <input type="number" value={port} onChange={(e) => setPort(e.target.value)} placeholder="8000" />
        </label>

        <div className="btn-row">
          {!status.running ? (
            <button className="btn primary big" disabled={busy || !filePath} onClick={start}>
              🌐 Host on local network
            </button>
          ) : (
            <button className="btn danger" onClick={stop}>■ Stop hosting</button>
          )}
          <span className={`srv ${status.running ? 'on' : 'off'}`}>
            {status.running ? 'server running' : 'server stopped'}
          </span>
        </div>

        {result?.error && <p className="hint warn">{result.error}</p>}
      </section>

      {status.running && (
        <section className="card">
          <h2>Download links</h2>
          <p className="hint">Open one of these on the target (pick the IP on the same network):</p>
          <div className="url-list">
            {urls.length === 0 && (
              <div className="url-row">
                <code>http://127.0.0.1:{port}/{fileName}</code>
                <button className="btn" onClick={() => copy(`http://127.0.0.1:${port}/${fileName}`)}>Copy</button>
              </div>
            )}
            {ips.map((ip) => {
              const u = `http://${ip.address}:${port}/${encodeURIComponent(fileName)}`
              return (
                <div key={ip.address} className="url-row">
                  <div>
                    <code>{u}</code>
                    <span className="iface"> ({ip.iface})</span>
                  </div>
                  <button className="btn" onClick={() => copy(u)}>Copy</button>
                </div>
              )
            })}
          </div>

          <h4 style={{ marginTop: 18 }}>Downloads ({hits.length})</h4>
          {hits.length === 0 ? (
            <p className="hint">No downloads yet. Waiting for the target to fetch the file…</p>
          ) : (
            <div className="hit-list">
              {hits.map((h, i) => (
                <div key={i} className="hit-row">
                  <span className="hit-ip">{h.ip}</span>
                  <span className="hit-time">{new Date(h.at).toLocaleTimeString()}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  )
}

function copy(text) {
  try {
    navigator.clipboard.writeText(text)
  } catch {
    /* ignore */
  }
}
