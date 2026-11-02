import React, { useEffect, useMemo, useRef, useState } from 'react'
import OptionForm from './OptionForm.jsx'

const api = window.metadeck

export default function PayloadBuilder({ connected, rpc, push }) {
  const [allPayloads, setAllPayloads] = useState([])
  const [encoders, setEncoders] = useState([])
  const [formats, setFormats] = useState({})
  const [query, setQuery] = useState('')

  const [payload, setPayload] = useState('')
  const [options, setOptions] = useState({})
  const [values, setValues] = useState({})

  const [format, setFormat] = useState('exe')
  const [encoder, setEncoder] = useState('')
  const [iterations, setIterations] = useState('')
  const [badchars, setBadchars] = useState('')
  const [outFile, setOutFile] = useState('')

  const [building, setBuilding] = useState(false)
  const [result, setResult] = useState(null)
  const [log, setLog] = useState('')
  const logRef = useRef(null)

  useEffect(() => {
    api.payloadFormats().then(setFormats)
    const off = api.onPayloadLog((line) => setLog((l) => (l + line).slice(-16000)))
    return off
  }, [])

  useEffect(() => {
    if (!connected) return
    rpc('module.payloads').then((r) => setAllPayloads(Array.isArray(r) ? r : [])).catch(() => {})
    rpc('module.encoders').then((r) => setEncoders(Array.isArray(r) ? r : [])).catch(() => {})
  }, [connected])

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [log])

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = q ? allPayloads.filter((p) => p.toLowerCase().includes(q)) : allPayloads
    return list.slice(0, 300)
  }, [query, allPayloads])

  const formatExt = useMemo(() => {
    for (const group of Object.values(formats)) {
      const f = group.find((x) => x.id === format)
      if (f) return f.ext
    }
    return ''
  }, [formats, format])

  if (!connected)
    return (
      <div className="empty-state">
        <div className="empty-emoji">📦</div>
        <h3>Not connected</h3>
        <p>Connect to a Metasploit server to load payloads and build files.</p>
      </div>
    )

  async function selectPayload(name) {
    setPayload(name)
    setOptions({})
    setValues({})
    setResult(null)
    if (!name) return
    try {
      const o = await rpc('module.options', ['payload', name])
      setOptions(o || {})
    } catch {
      /* surfaced by rpc */
    }
    // suggest a default output filename
    suggestName(name, format)
  }

  function suggestName(name, fmt) {
    const base = (name || 'payload').replace(/[\/\\]/g, '_')
    const ext = extFor(fmt)
    setDefaultOut(base + ext)
  }
  const [defaultOut, setDefaultOut] = useState('payload.bin')
  function extFor(fmt) {
    for (const group of Object.values(formats)) {
      const f = group.find((x) => x.id === fmt)
      if (f) return f.ext
    }
    return ''
  }

  async function chooseOutput() {
    const name = defaultOut || (payload ? payload.replace(/[\/\\]/g, '_') + formatExt : 'payload' + formatExt)
    const chosen = await api.payloadSaveDialog(name)
    if (chosen) setOutFile(chosen)
  }

  async function build() {
    if (!payload) return push({ kind: 'error', text: 'Choose a payload first.' })
    if (!outFile) return push({ kind: 'error', text: 'Choose where to save the file first.' })
    setBuilding(true)
    setResult(null)
    setLog('')
    try {
      const opts = {}
      for (const n of Object.keys(options)) {
        const v = values[n]
        if (v !== undefined && v !== '') opts[n] = v
      }
      const res = await api.buildPayload({
        payload,
        options: opts,
        format,
        encoder: encoder || undefined,
        iterations: iterations || undefined,
        badchars: badchars || undefined,
        outFile
      })
      setResult(res)
      push({ kind: 'success', text: `Built ${res.outFile.split('/').pop()} (${res.size} bytes)` })
    } catch (e) {
      push({ kind: 'error', text: e.message })
    } finally {
      setBuilding(false)
    }
  }

  return (
    <div className="payloads">
      <div className="pb-left">
        <div className="search-bar">
          <input
            placeholder="Search payloads (e.g. windows meterpreter reverse_tcp)…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="results">
          {matches.map((p) => (
            <button
              key={p}
              className={`result ${payload === p ? 'active' : ''}`}
              onClick={() => selectPayload(p)}
            >
              <span className="tag tag-payload">payload</span>
              <span className="result-ref" style={{ gridColumn: 2 }}>{p}</span>
            </button>
          ))}
          {matches.length === 0 && <div className="results-empty">No payloads match.</div>}
        </div>
      </div>

      <div className="pb-right">
        {!payload ? (
          <div className="pick-hint">Pick a payload on the left to configure and build it into a file.</div>
        ) : (
          <div className="mod-detail">
            <div className="mod-head">
              <span className="tag tag-payload">payload</span>
              <h3>{payload}</h3>
            </div>

            <OptionForm options={options} values={values} setValue={(k, v) => setValues((p) => ({ ...p, [k]: v }))} />

            <div className="pb-grid">
              <label className="field">
                <span className="field-label">Output format</span>
                <select
                  value={format}
                  onChange={(e) => {
                    setFormat(e.target.value)
                    if (payload) suggestName(payload, e.target.value)
                  }}
                >
                  {Object.entries(formats).map(([group, items]) => (
                    <optgroup key={group} label={group}>
                      {items.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>

              <label className="field">
                <span className="field-label">Encoder (optional)</span>
                <select value={encoder} onChange={(e) => setEncoder(e.target.value)}>
                  <option value="">none</option>
                  {encoders.map((en) => (
                    <option key={en} value={en}>
                      {en}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span className="field-label">Encoder iterations (optional)</span>
                <input
                  type="number"
                  min="0"
                  placeholder="e.g. 3"
                  value={iterations}
                  onChange={(e) => setIterations(e.target.value)}
                />
              </label>

              <label className="field">
                <span className="field-label">Bad characters (optional)</span>
                <input
                  placeholder="e.g. \\x00\\x0a"
                  value={badchars}
                  onChange={(e) => setBadchars(e.target.value)}
                />
              </label>
            </div>

            <label className="field">
              <span className="field-label">Save to</span>
              <div className="out-row">
                <input readOnly value={outFile} placeholder="Choose a destination file…" />
                <button className="btn" onClick={chooseOutput}>
                  Choose…
                </button>
              </div>
            </label>

            <div className="btn-row run-row">
              <button className="btn primary big" disabled={building} onClick={build}>
                {building ? 'Building…' : '📦 Build payload file'}
              </button>
            </div>

            {result && (
              <div className="run-result">
                <h4>✓ Built</h4>
                <p className="built-path">{result.outFile}</p>
                <p className="hint">{result.size} bytes</p>
                <div className="btn-row">
                  <button className="btn" onClick={() => api.revealPath(result.outFile)}>
                    Reveal in Finder
                  </button>
                </div>
              </div>
            )}

            <div className="logbox" ref={logRef} style={{ marginTop: 16 }}>
              <pre>{log || 'Build output will appear here…'}</pre>
            </div>

            <p className="hint warn">
              ⚠️ Generated payloads are for authorized testing only. Only deploy them on systems you
              own or have explicit written permission to test.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
