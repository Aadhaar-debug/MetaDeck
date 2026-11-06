import React, { useMemo, useState } from 'react'
import OptionForm from './OptionForm.jsx'
import { MODULE_CATEGORIES } from '../../shared/payloads.js'

const TYPES = ['all', 'exploit', 'auxiliary', 'post', 'payload', 'encoder', 'nop']

export default function ModuleBrowser({ connected, rpc, push }) {
  const [type, setType] = useState('all')
  const [category, setCategory] = useState('all')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)

  const [selected, setSelected] = useState(null) // {type, refname, name}
  const [info, setInfo] = useState(null)
  const [options, setOptions] = useState({})
  const [values, setValues] = useState({})

  const [payloads, setPayloads] = useState([])
  const [payload, setPayload] = useState('')
  const [payloadOptions, setPayloadOptions] = useState({})
  const [payloadValues, setPayloadValues] = useState({})

  const [running, setRunning] = useState(false)
  const [runResult, setRunResult] = useState(null)

  // Filter the current results by the selected target category.
  const displayed = useMemo(() => {
    const cat = MODULE_CATEGORIES.find((c) => c.id === category) || MODULE_CATEGORIES[0]
    return results.filter((m) => cat.match(m.fullname || m.refname || m.name || ''))
  }, [results, category])

  if (!connected) return <Empty />

  async function search() {
    setSearching(true)
    try {
      const res = await rpc('module.search', [query || ''])
      let list = Array.isArray(res) ? res : []
      if (type !== 'all') list = list.filter((m) => m.type === type)
      setResults(list.slice(0, 500))
      if (list.length === 0) push({ kind: 'info', text: 'No modules matched that search.' })
    } finally {
      setSearching(false)
    }
  }

  async function select(m) {
    const refname = m.fullname || m.refname || m.name
    setSelected({ type: m.type, refname, name: m.name })
    setInfo(null)
    setOptions({})
    setValues({})
    setPayloads([])
    setPayload('')
    setPayloadOptions({})
    setPayloadValues({})
    setRunResult(null)

    try {
      const [i, o] = await Promise.all([
        rpc('module.info', [m.type, refname]),
        rpc('module.options', [m.type, refname])
      ])
      setInfo(i)
      setOptions(o || {})
      if (m.type === 'exploit') {
        const cp = await rpc('module.compatible_payloads', [refname])
        setPayloads((cp && cp.payloads) || [])
      }
    } catch {
      /* errors surfaced by rpc() */
    }
  }

  async function choosePayload(name) {
    setPayload(name)
    setPayloadOptions({})
    setPayloadValues({})
    if (!name) return
    try {
      const o = await rpc('module.options', ['payload', name])
      setPayloadOptions(o || {})
    } catch {
      /* ignore */
    }
  }

  async function run() {
    if (!selected) return
    setRunning(true)
    setRunResult(null)
    try {
      const opts = { ...cleaned(options, values) }
      if (selected.type === 'exploit' && payload) {
        opts.PAYLOAD = payload
        Object.assign(opts, cleaned(payloadOptions, payloadValues))
      }
      const res = await rpc('module.execute', [selected.type, selected.refname, opts])
      setRunResult(res)
      if (res && (res.job_id != null || res.uuid)) {
        push({
          kind: 'success',
          text: `Launched — job ${res.job_id ?? '?'}${res.uuid ? ' (' + res.uuid + ')' : ''}`
        })
      } else {
        push({ kind: 'info', text: 'Module executed. See result below.' })
      }
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="modbrowser">
      <div className="mod-left">
        <div className="cat-bar">
          {MODULE_CATEGORIES.map((c) => (
            <button
              key={c.id}
              className={`cat-chip ${category === c.id ? 'active' : ''}`}
              onClick={() => setCategory(c.id)}
            >
              {c.label}
            </button>
          ))}
        </div>
        <div className="search-bar">
          <select value={type} onChange={(e) => setType(e.target.value)}>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <input
            placeholder="Search modules (e.g. eternalblue, smb, ssh_login)…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && search()}
          />
          <button className="btn primary" disabled={searching} onClick={search}>
            {searching ? '…' : 'Search'}
          </button>
        </div>
        <div className="results">
          {displayed.map((m, i) => {
            const refname = m.fullname || m.refname || m.name
            const active = selected && selected.refname === refname
            return (
              <button
                key={refname + i}
                className={`result ${active ? 'active' : ''}`}
                onClick={() => select(m)}
              >
                <span className={`tag tag-${m.type}`}>{m.type}</span>
                <span className="result-name">{m.name || refname}</span>
                <span className="result-ref">{refname}</span>
                {m.rank_str && <span className="rank">{m.rank_str}</span>}
              </button>
            )
          })}
          {results.length === 0 && <div className="results-empty">Search to list modules.</div>}
          {results.length > 0 && displayed.length === 0 && (
            <div className="results-empty">No results in this category — try “All”.</div>
          )}
        </div>
      </div>

      <div className="mod-right">
        {!selected && <div className="pick-hint">Select a module to configure and run it.</div>}
        {selected && (
          <div className="mod-detail">
            <div className="mod-head">
              <span className={`tag tag-${selected.type}`}>{selected.type}</span>
              <h3>{info?.name || selected.name}</h3>
            </div>
            <code className="mod-ref">{selected.refname}</code>
            {info?.description && <p className="mod-desc">{clip(info.description)}</p>}

            <OptionForm options={options} values={values} setValue={(k, v) => setV(setValues, k, v)} />

            {selected.type === 'exploit' && (
              <div className="payload-pick">
                <h4>Payload</h4>
                <select value={payload} onChange={(e) => choosePayload(e.target.value)}>
                  <option value="">— choose a payload —</option>
                  {payloads.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
                {payload && (
                  <OptionForm
                    title="Payload options"
                    options={payloadOptions}
                    values={payloadValues}
                    setValue={(k, v) => setV(setPayloadValues, k, v)}
                  />
                )}
              </div>
            )}

            <div className="btn-row run-row">
              <button className="btn primary big" disabled={running} onClick={run}>
                {running ? 'Running…' : '🚀 Run module'}
              </button>
            </div>

            {runResult && (
              <div className="run-result">
                <h4>Result</h4>
                <pre>{JSON.stringify(runResult, null, 2)}</pre>
                <p className="hint">
                  If this opened a session, check the <b>Sessions</b> tab. Background jobs appear in
                  the <b>Console</b> via <code>jobs</code>.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function setV(setter, k, v) {
  setter((prev) => ({ ...prev, [k]: v }))
}

// Build the opts object Metasploit expects — only include set/required values.
function cleaned(options, values) {
  const out = {}
  for (const name of Object.keys(options || {})) {
    const v = values[name]
    if (v !== undefined && v !== '') out[name] = v
  }
  return out
}

const clip = (s) => (s && s.length > 600 ? s.slice(0, 600) + '…' : s)

function Empty() {
  return (
    <div className="empty-state">
      <div className="empty-emoji">🧩</div>
      <h3>Not connected</h3>
      <p>Connect to a Metasploit server on the Connection tab to browse modules.</p>
    </div>
  )
}
