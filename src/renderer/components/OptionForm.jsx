import React from 'react'

/**
 * Renders a Metasploit module's options as friendly form fields.
 * `options` is the map returned by module.options (name -> {type, required, desc, default, enums}).
 */
export default function OptionForm({ options, values, setValue, title }) {
  const names = Object.keys(options || {})
  if (names.length === 0) return <p className="hint">This module has no configurable options.</p>

  // Show required options first — these are the boxes a beginner must fill.
  const required = names.filter((n) => options[n].required)
  const optional = names.filter((n) => !options[n].required)

  return (
    <div className="optform">
      {title && <h4>{title}</h4>}
      {required.length > 0 && (
        <>
          <div className="optform-group-label">Required</div>
          {required.map((n) => (
            <OptRow key={n} name={n} opt={options[n]} value={values[n]} setValue={setValue} />
          ))}
        </>
      )}
      {optional.length > 0 && (
        <details className="optform-optional">
          <summary>Optional settings ({optional.length})</summary>
          {optional.map((n) => (
            <OptRow key={n} name={n} opt={options[n]} value={values[n]} setValue={setValue} />
          ))}
        </details>
      )}
    </div>
  )
}

function OptRow({ name, opt, value, setValue }) {
  const v = value ?? (opt.default != null ? String(opt.default) : '')
  const common = {
    value: v,
    onChange: (e) => setValue(name, e.target.value)
  }

  let control
  if (opt.type === 'bool') {
    control = (
      <input
        type="checkbox"
        checked={v === true || v === 'true' || v === true}
        onChange={(e) => setValue(name, e.target.checked ? 'true' : 'false')}
      />
    )
  } else if (Array.isArray(opt.enums) && opt.enums.length) {
    control = (
      <select {...common}>
        {!opt.required && <option value="">(default)</option>}
        {opt.enums.map((e) => (
          <option key={e} value={e}>
            {e}
          </option>
        ))}
      </select>
    )
  } else if (opt.type === 'port') {
    control = <input type="number" placeholder="e.g. 445" {...common} />
  } else if (opt.type === 'address' || name === 'RHOSTS' || name === 'RHOST') {
    control = <input placeholder="e.g. 192.168.1.10" {...common} />
  } else {
    control = <input placeholder={opt.default != null ? String(opt.default) : ''} {...common} />
  }

  const highlight = ['RHOSTS', 'RHOST', 'RPORT', 'LHOST', 'LPORT'].includes(name)

  return (
    <label className={`optrow ${opt.required ? 'req' : ''} ${highlight ? 'key' : ''}`}>
      <span className="optrow-name">
        {name}
        {opt.required && <span className="star">*</span>}
      </span>
      <span className="optrow-control">{control}</span>
      {opt.desc && <span className="optrow-desc">{opt.desc}</span>}
    </label>
  )
}
