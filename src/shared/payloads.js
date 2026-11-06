// Shared, framework-agnostic payload helpers used by the main process, the
// renderer, and the unit tests. No Electron or Node-only imports here.

// Curated msfvenom output formats (all verified valid via `msfvenom --list
// formats`), grouped for the UI. 'apk' is intentionally NOT here — it is
// injected only for android payloads and handled specially (no -f flag).
export const PAYLOAD_FORMATS = {
  'Executable files': [
    { id: 'exe', label: 'Windows .exe', ext: '.exe' },
    { id: 'exe-service', label: 'Windows service .exe', ext: '.exe' },
    { id: 'dll', label: 'Windows .dll', ext: '.dll' },
    { id: 'msi', label: 'Windows installer .msi', ext: '.msi' },
    { id: 'elf', label: 'Linux ELF', ext: '' },
    { id: 'elf-so', label: 'Linux shared object .so', ext: '.so' },
    { id: 'macho', label: 'macOS Mach-O', ext: '' },
    { id: 'jar', label: 'Java .jar', ext: '.jar' },
    { id: 'war', label: 'Java .war', ext: '.war' }
  ],
  'Script files': [
    { id: 'psh', label: 'PowerShell .ps1', ext: '.ps1' },
    { id: 'python', label: 'Python .py', ext: '.py' },
    { id: 'bash', label: 'Bash .sh', ext: '.sh' },
    { id: 'vba', label: 'VBA macro', ext: '.vba' },
    { id: 'asp', label: 'ASP', ext: '.asp' },
    { id: 'aspx', label: 'ASPX', ext: '.aspx' },
    { id: 'hta-psh', label: 'HTA (PowerShell)', ext: '.hta' }
  ],
  'Raw / shellcode': [
    { id: 'raw', label: 'Raw bytes', ext: '.bin' },
    { id: 'c', label: 'C array', ext: '.c' },
    { id: 'csharp', label: 'C# array', ext: '.cs' },
    { id: 'hex', label: 'Hex', ext: '.txt' },
    { id: 'base64', label: 'Base64', ext: '.txt' }
  ]
}

// module.<type> list RPC calls return { modules: [...] }; tolerate a bare array.
export const asList = (r) =>
  Array.isArray(r) ? r : r && Array.isArray(r.modules) ? r.modules : []

// Pick a compatible output format from the payload's platform so builds do not
// fail on a format/platform mismatch.
export function defaultFormatFor(name) {
  if (!name) return 'raw'
  if (name.startsWith('android/')) return 'apk'
  if (name.startsWith('windows/')) return 'exe'
  if (name.startsWith('linux/') || name.startsWith('bsd/') || name.startsWith('solaris/')) return 'elf'
  if (name.startsWith('osx/') || name.startsWith('apple_ios/') || name.includes('/osx/')) return 'macho'
  if (name.startsWith('java/')) return 'jar'
  if (name.startsWith('python/')) return 'python'
  if (name.startsWith('php/')) return 'raw'
  if (name.startsWith('cmd/')) return 'raw'
  return 'raw'
}

// The file extension for a format id (handles the special 'apk').
export function extForFormat(formatId) {
  if (formatId === 'apk') return '.apk'
  for (const group of Object.values(PAYLOAD_FORMATS)) {
    const f = group.find((x) => x.id === formatId)
    if (f) return f.ext
  }
  return ''
}

// Module-browser categories: label + a predicate on a module fullname so the
// user can jump straight to the kind of target they are attacking.
export const MODULE_CATEGORIES = [
  { id: 'all', label: 'All', match: () => true },
  { id: 'windows', label: 'Windows', match: (n) => n.includes('/windows/') },
  { id: 'linux', label: 'Linux', match: (n) => n.includes('/linux/') },
  { id: 'unix', label: 'Unix', match: (n) => n.includes('/unix/') },
  { id: 'osx', label: 'macOS', match: (n) => n.includes('/osx/') || n.includes('/apple_ios/') },
  { id: 'android', label: 'Android', match: (n) => n.includes('/android/') },
  { id: 'web', label: 'Web / HTTP', match: (n) => n.includes('/http/') || n.includes('/webapp/') || n.includes('/http') },
  { id: 'multi', label: 'Multi / Cross-platform', match: (n) => n.includes('/multi/') },
  { id: 'network', label: 'Network / SCADA', match: (n) => n.includes('/scada/') || n.includes('/misc/') || n.includes('/snmp/') }
]
