import os from 'node:os'

/**
 * Pure helper (easy to unit-test): given the object returned by
 * os.networkInterfaces(), return the usable non-internal IPv4 addresses.
 */
export function pickLocalIPv4s(interfaces) {
  const out = []
  for (const [name, addrs] of Object.entries(interfaces || {})) {
    for (const a of addrs || []) {
      const family = a.family === 4 || a.family === 'IPv4'
      if (family && !a.internal) {
        out.push({ iface: name, address: a.address })
      }
    }
  }
  // Prefer common LAN ranges first (192.168.*, 10.*, 172.16-31.*).
  out.sort((x, y) => rank(x.address) - rank(y.address))
  return out
}

function rank(ip) {
  if (ip.startsWith('192.168.')) return 0
  if (ip.startsWith('10.')) return 1
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return 2
  return 5
}

export function getLocalIPs() {
  return pickLocalIPv4s(os.networkInterfaces())
}
