import React, { useEffect, useMemo, useState } from 'react'

const api = window.metadeck
const asList = (r) => (Array.isArray(r) ? r : (r && Array.isArray(r.modules) ? r.modules : []))

/**
 * Starts and manages exploit/multi/handler jobs so incoming connections from a
 * payload turn into sessions. Authorized testing only.
 */
export default function Listeners({ connected, rpc, push }) {
  const [payloads, setPayloads] = useState([])
  const [ips, setIps] = useState([])
  const [payload, setPayload] = useState('windows/x64/meterpreter/reverse_tcp')
  const [query, setQuery] = useState('')
  const [lhost, setLhost] = useState('0.0.0.0')
  const [lport, setLport] = useState('4444')
  const [starting, setStarting] = useState(false)
  const [jobs, setJobs] = useState([])

  useEffect(() => {
    api.localIPs().then((r) => setIps(r || [])).catch(() => {})
  }, [])

  useEffect(() => {
    if (!connected) return
    rpc('module.payloads').then((r) => setPayloads(asList(r))).catch(() => {})
    refreshJobs()
    const t = setInterval(refreshJobs, 4000)
    return () => clearInterval(t)
  }, [connected])

  const payloadMatches = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = q ? payloads.filter((p) => p.toLowerCase().includes(q)) : payloads
    return list.slice(0, 200)
  }, [query, payloads])

  async function refreshJobs() {
    try {
      const list = await rpc('job.list')
      const ids = list && typeof list === 'object' ? Object.keys(list) : []
      const detailed = await Promise.all(
        ids.map(async (id) => {
          try {
            const info = await rpc('job.info', [id])
            return { id, name: list[id], info }
          } catch {
            return { id, name: list[id], info: null }
          }
        })
      )
      setJobs(detailed)
    } catch {
      /* ignore */
    }
  }

  async function startListener() {
    if (!payload) return push({ kind: 'error', text: 'Choose a payload for the handler.' })
    if (!lport) return push({ kind: 'error', text: 'Enter a port to listen on.' })
    setStarting(true)
    try {
      const opts = {
        PAYLOAD: payload,
        LHOST: lhost || '0.0.0.0',
        LPORT: String(lport),
        ExitOnSession: false
      }
      const res = await rpc('module.execute', ['exploit', 'multi/handler', opts])
      if (res && res.job_id != null) {
        push({ kind: 'success', text: `Listener started on ${lhost}:${lport} (job ${res.job_id})` })
        refreshJobs()
      } else {
        push({ kind: 'info', text: 'Handler executed — check running listeners below.' })
        refreshJobs()
      }
    } catch (e) {
      push({ kind: 'error', text: 'Could not start listener: ' + e.message })
    } finally {
      setStarting(false)
    }
  }

  async function stopJob(id) {
    try {
      await rpc('job.stop', [String(id)])
      push({ kind: 'info', text: `Stopped job ${id}` })
      refreshJobs()
    } catch (e) {
      push({ kind: 'error', text: e.message })
    }
  }

  if (!connected)
    return (
      <div className="empty-state">
        <div className="empty-emoji">📡</div>
        <h3>Not connected</h3>
        <p>Connect to a Metasploit server to start a listener.</p>
      </div>
    )

  return (
    <div className="listeners">
      <section className="card">
        <h2>Start a listener (handler)</h2>
        <p className="hint">
          A listener catches the connection from a payload and opens a session. Use the same
          payload, LHOST and LPORT you built the payload with.
        </p>

        {ips.length > 0 && (
          <div className="ip-strip">
            <span className="ip-label">This machine on the LAN:</span>
            {ips.map((n) => (
              <button
                key={n.address}
                className="chip"
                title="Use as LHOST"
                onClick={() => setLhost(n.address)}
              >
                {n.address} <span className="ip-iface">({n.iface})</span>
              </button>
            ))}
          </div>
        )}

        <label className="field">
          <span className="field-label">Payload (must match the built payload)</span>
          <input
            placeholder="Filter payloads…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select
            size="6"
            value={payload}
            onChange={(e) => setPayload(e.target.value)}
            style={{ marginTop: 8 }}
          >
            {payloadMatches.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <span className="field-label" style={{ marginTop: 6 }}>Selected: {payload || '—'}</span>
        </label>

        <div className="grid2">
          <label className="field">
            <span className="field-label">LHOST (listen address)</span>
            <input value={lhost} onChange={(e) => setLhost(e.target.value)} placeholder="0.0.0.0" />
          </label>
          <label className="field">
            <span className="field-label">LPORT (custom port)</span>
            <input
              type="number"
              value={lport}
              onChange={(e) => setLport(e.target.value)}
              placeholder="4444"
            />
          </label>
        </div>

        <div className="btn-row">
          <button className="btn primary big" disabled={starting} onClick={startListener}>
            {starting ? 'Starting…' : '📡 Start listener'}
          </button>
        </div>
      </section>

      <section className="card">
        <div className="sessions-bar">
          <h2 style={{ margin: 0 }}>Running listeners &amp; jobs</h2>
          <button className="btn" style={{ marginLeft: 'auto' }} onClick={refreshJobs}>
            ⟳ Refresh
          </button>
        </div>
        {jobs.length === 0 ? (
          <p className="hint">No jobs running. Start a listener above.</p>
        ) : (
          <div className="job-list">
            {jobs.map((j) => (
              <div key={j.id} className="job-row">
                <span className="job-id">#{j.id}</span>
                <div className="job-main">
                  <div className="job-name">{j.name}</div>
                  {j.info && j.info.datastore && (
                    <div className="job-sub">
                      {fmtDatastore(j.info.datastore)}
                    </div>
                  )}
                </div>
                <button className="btn danger" onClick={() => stopJob(j.id)}>
                  Stop
                </button>
              </div>
            ))}
          </div>
        )}
        <p className="hint">
          When a target connects, the new session appears on the <b>Sessions</b> tab.
        </p>
      </section>
    </div>
  )
}

function fmtDatastore(ds) {
  const parts = []
  if (ds.PAYLOAD) parts.push(ds.PAYLOAD)
  if (ds.LHOST) parts.push('LHOST=' + ds.LHOST)
  if (ds.LPORT) parts.push('LPORT=' + ds.LPORT)
  return parts.join('  ·  ')
}
