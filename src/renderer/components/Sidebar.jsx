import React from 'react'

const ITEMS = [
  { id: 'connect', label: 'Connection', icon: '🔌', always: true },
  { id: 'modules', label: 'Modules', icon: '🧩' },
  { id: 'payloads', label: 'Payloads', icon: '📦' },
  { id: 'sessions', label: 'Sessions', icon: '🖥️' },
  { id: 'console', label: 'Console', icon: '⌨️' }
]

export default function Sidebar({ tab, setTab, connection }) {
  return (
    <nav className="sidebar">
      <div className="brand">
        <div className="brand-mark">M</div>
        <div className="brand-text">
          <div className="brand-name">MetaDeck</div>
          <div className="brand-sub">Metasploit Control</div>
        </div>
      </div>
      <ul className="nav">
        {ITEMS.map((it) => {
          const locked = !it.always && !connection.connected
          return (
            <li key={it.id}>
              <button
                className={`nav-item ${tab === it.id ? 'active' : ''} ${locked ? 'locked' : ''}`}
                onClick={() => !locked && setTab(it.id)}
                title={locked ? 'Connect to a server first' : it.label}
              >
                <span className="nav-icon">{it.icon}</span>
                <span>{it.label}</span>
                {locked && <span className="lock">🔒</span>}
              </button>
            </li>
          )
        })}
      </ul>
      <div className="sidebar-foot">
        <div className={`status ${connection.connected ? 'on' : 'off'}`}>
          <span className="dot" />
          {connection.connected ? 'Online' : 'Offline'}
        </div>
      </div>
    </nav>
  )
}
