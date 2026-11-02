import React, { useEffect, useRef, useState } from 'react'

export default function SessionsDashboard({ connected, rpc, push }) {
  const [sessions, setSessions] = useState({})
  const [auto, setAuto] = useState(true)
  const [active, setActive] = useState(null)

  useEffect(() => {
    if (!connected) return
    refresh()
    if (!auto) return
    const t = setInterval(refresh, 4000)
    return () => clearInterval(t)
  }, [connected, auto])

  async function refresh() {
    try {
      const res = await rpc('session.list')
      setSessions(res || {})
    } catch {
      /* ignore */
    }
  }

  async function stop(id) {
    try {
      await rpc('session.stop', [String(id)])
      push({ kind: 'info', text: `Stopped session ${id}` })
      refresh()
      if (active === id) setActive(null)
    } catch {
      /* ignore */
    }
  }

  if (!connected)
    return (
      <div className="empty-state">
        <div className="empty-emoji">🖥️</div>
        <h3>Not connected</h3>
        <p>Connect to a Metasploit server to see live sessions.</p>
      </div>
    )

  const ids = Object.keys(sessions)

  return (
    <div className="sessions">
      <div className="sessions-bar">
        <button className="btn" onClick={refresh}>
          ⟳ Refresh
        </button>
        <label className="check">
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
          Auto-refresh
        </label>
        <span className="count">{ids.length} active session{ids.length === 1 ? '' : 's'}</span>
      </div>

      {ids.length === 0 ? (
        <div className="sessions-empty">
          No active sessions yet. Run an exploit from the <b>Modules</b> tab to open one.
        </div>
      ) : (
        <div className="session-grid">
          {ids.map((id) => {
            const s = sessions[id]
            return (
              <div key={id} className="session-card">
                <div className="session-top">
                  <span className="session-id">#{id}</span>
                  <span className={`tag tag-${s.type}`}>{s.type}</span>
                </div>
                <div className="session-row">
                  <b>Target</b>
                  <span>{s.session_host || s.tunnel_peer || '—'}</span>
                </div>
                <div className="session-row">
                  <b>Via</b>
                  <span title={s.via_exploit}>{short(s.via_exploit)}</span>
                </div>
                <div className="session-row">
                  <b>Platform</b>
                  <span>{s.platform || s.arch || '—'}</span>
                </div>
                {s.info && (
                  <div className="session-row">
                    <b>Info</b>
                    <span>{short(s.info)}</span>
                  </div>
                )}
                <div className="btn-row">
                  <button className="btn primary" onClick={() => setActive(id)}>
                    ⌨ Interact
                  </button>
                  <button className="btn danger" onClick={() => stop(id)}>
                    Kill
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {active != null && sessions[active] && (
        <InteractModal
          id={active}
          session={sessions[active]}
          rpc={rpc}
          onClose={() => setActive(null)}
        />
      )}
    </div>
  )
}

function InteractModal({ id, session, rpc, onClose }) {
  const [out, setOut] = useState('')
  const [cmd, setCmd] = useState('')
  const outRef = useRef(null)
  const isMeterpreter = session.type === 'meterpreter'

  useEffect(() => {
    const t = setInterval(read, 1200)
    return () => clearInterval(t)
  }, [id])

  useEffect(() => {
    if (outRef.current) outRef.current.scrollTop = outRef.current.scrollHeight
  }, [out])

  async function read() {
    try {
      const res = isMeterpreter
        ? await rpc('session.meterpreter_read', [String(id)])
        : await rpc('session.shell_read', [String(id)])
      const data = res && (res.data || res.result)
      if (data) setOut((o) => (o + data).slice(-40000))
    } catch {
      /* ignore */
    }
  }

  async function send() {
    if (!cmd.trim()) return
    const line = cmd
    setCmd('')
    setOut((o) => o + '\n> ' + line + '\n')
    try {
      if (isMeterpreter) {
        await rpc('session.meterpreter_run_single', [String(id), line])
      } else {
        await rpc('session.shell_write', [String(id), line + '\n'])
      }
      setTimeout(read, 600)
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>
            Session #{id} <span className={`tag tag-${session.type}`}>{session.type}</span>
          </h3>
          <button className="btn ghost" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="terminal" ref={outRef}>
          <pre>{out || 'Type a command below and press Enter.'}</pre>
        </div>
        <div className="terminal-input">
          <input
            autoFocus
            value={cmd}
            placeholder={isMeterpreter ? 'meterpreter command (e.g. sysinfo)' : 'shell command (e.g. whoami)'}
            onChange={(e) => setCmd(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send()}
          />
          <button className="btn primary" onClick={send}>
            Send
          </button>
        </div>
      </div>
    </div>
  )
}

const short = (s) => (s && s.length > 42 ? s.slice(0, 42) + '…' : s || '—')
