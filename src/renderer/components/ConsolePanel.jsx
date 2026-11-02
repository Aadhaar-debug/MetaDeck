import React, { useEffect, useRef, useState } from 'react'

/**
 * A live msfconsole, driven by the console.* RPC group:
 *   console.create -> { id }
 *   console.write(id, data)
 *   console.read(id) -> { data, prompt, busy }
 *   console.destroy(id)
 */
export default function ConsolePanel({ connected, rpc }) {
  const [consoleId, setConsoleId] = useState(null)
  const [out, setOut] = useState('')
  const [prompt, setPrompt] = useState('msf6 > ')
  const [cmd, setCmd] = useState('')
  const [history, setHistory] = useState([])
  const [hIdx, setHIdx] = useState(-1)
  const outRef = useRef(null)
  const idRef = useRef(null)

  useEffect(() => {
    if (!connected) return
    let alive = true
    ;(async () => {
      try {
        const res = await rpc('console.create')
        if (!alive) return
        const id = res.id
        setConsoleId(id)
        idRef.current = id
      } catch {
        /* ignore */
      }
    })()
    return () => {
      alive = false
      if (idRef.current != null) rpc('console.destroy', [String(idRef.current)]).catch(() => {})
    }
  }, [connected])

  useEffect(() => {
    if (consoleId == null) return
    const t = setInterval(poll, 1000)
    return () => clearInterval(t)
  }, [consoleId])

  useEffect(() => {
    if (outRef.current) outRef.current.scrollTop = outRef.current.scrollHeight
  }, [out])

  async function poll() {
    if (idRef.current == null) return
    try {
      const res = await rpc('console.read', [String(idRef.current)])
      if (res) {
        if (res.data) setOut((o) => (o + res.data).slice(-80000))
        if (res.prompt) setPrompt(stripAnsi(res.prompt))
      }
    } catch {
      /* ignore */
    }
  }

  async function send() {
    if (idRef.current == null) return
    const line = cmd
    setOut((o) => o + prompt + line + '\n')
    setHistory((h) => [line, ...h].slice(0, 100))
    setHIdx(-1)
    setCmd('')
    try {
      await rpc('console.write', [String(idRef.current), line + '\n'])
      setTimeout(poll, 400)
    } catch {
      /* ignore */
    }
  }

  function onKey(e) {
    if (e.key === 'Enter') return send()
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      const i = Math.min(hIdx + 1, history.length - 1)
      if (history[i] != null) {
        setHIdx(i)
        setCmd(history[i])
      }
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      const i = Math.max(hIdx - 1, -1)
      setHIdx(i)
      setCmd(i === -1 ? '' : history[i])
    }
  }

  if (!connected)
    return (
      <div className="empty-state">
        <div className="empty-emoji">⌨️</div>
        <h3>Not connected</h3>
        <p>Connect to a Metasploit server to open a console.</p>
      </div>
    )

  return (
    <div className="console-panel">
      <div className="quickbar">
        <span className="quickbar-label">Quick commands:</span>
        {['version', 'help', 'jobs', 'sessions -l', 'hosts', 'services'].map((q) => (
          <button key={q} className="chip" onClick={() => { setCmd(q); setTimeout(send, 0) }}>
            {q}
          </button>
        ))}
      </div>
      <div className="terminal full" ref={outRef}>
        <pre>{out || (consoleId == null ? 'Opening console…' : 'Console ready.')}</pre>
      </div>
      <div className="terminal-input">
        <span className="prompt">{prompt}</span>
        <input
          autoFocus
          value={cmd}
          onChange={(e) => setCmd(e.target.value)}
          onKeyDown={onKey}
          placeholder="Type an msfconsole command and press Enter"
        />
        <button className="btn primary" onClick={send}>
          Run
        </button>
      </div>
    </div>
  )
}

// Strip ANSI color codes Metasploit includes in the prompt.
const stripAnsi = (s) => s.replace(/\u001b\[[0-9;]*m/g, '')
