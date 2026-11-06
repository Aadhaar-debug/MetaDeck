import http from 'node:http'
import https from 'node:https'
import { Packr, Unpackr } from 'msgpackr'

// Metasploit's RPC packs strings (and map keys) as msgpack `bin`, so decode
// maps as JS Map to preserve those binary keys, then normalize() converts them
// to a clean string-keyed object. Encode plain structures for requests.
const packr = new Packr({ useRecords: false })
const unpackr = new Unpackr({ mapsAsObjects: false, useRecords: false, int64AsNumber: true })
const encode = (v) => packr.pack(v)
const decode = (buf) => unpackr.unpack(buf)

/**
 * Minimal MessagePack-RPC client for the Metasploit RPC daemon (msfrpcd).
 *
 * Protocol (same one Armitage / Metasploit Pro use):
 *   - POST the MessagePack-encoded array [method, token, ...args] to http(s)://host:port/api/
 *   - Content-Type: binary/message-pack
 *   - auth.login(user, pass) returns { result: 'success', token: '<token>' }
 *   - Authenticated calls pass the token as the first argument after the method name.
 *   - Errors come back as { error: true, error_message: '...' }.
 */
export class MsfRpcClient {
  constructor({ host = '127.0.0.1', port = 55553, ssl = false } = {}) {
    this.host = host
    this.port = Number(port)
    this.ssl = ssl
    this.token = null
  }

  get connected() {
    return !!this.token
  }

  _request(payload) {
    return new Promise((resolve, reject) => {
      const body = Buffer.from(encode(payload))
      const lib = this.ssl ? https : http
      const req = lib.request(
        {
          host: this.host,
          port: this.port,
          path: '/api/',
          method: 'POST',
          headers: {
            'Content-Type': 'binary/message-pack',
            'Content-Length': body.length
          },
          rejectUnauthorized: false,
          timeout: 30000
        },
        (res) => {
          const chunks = []
          res.on('data', (c) => chunks.push(c))
          res.on('end', () => {
            try {
              resolve(normalize(decode(Buffer.concat(chunks))))
            } catch (e) {
              reject(new Error('Failed to decode RPC response: ' + e.message))
            }
          })
        }
      )
      req.on('timeout', () => req.destroy(new Error('RPC request timed out')))
      req.on('error', reject)
      req.write(body)
      req.end()
    })
  }

  async login(user, pass) {
    const res = await this._request(['auth.login', user, pass])
    if (res && res.result === 'success' && res.token) {
      this.token = res.token
      return res
    }
    throw new Error(res?.error_message || 'Authentication failed — check username/password')
  }

  async logout() {
    if (!this.token) return
    try {
      await this._request(['auth.logout', this.token, this.token])
    } finally {
      this.token = null
    }
  }

  async call(method, ...args) {
    if (!this.token) throw new Error('Not connected to a Metasploit RPC server')
    const res = await this._request([method, this.token, ...args])
    if (res && res.error) {
      throw new Error(res.error_message || res.error_string || 'RPC error from Metasploit')
    }
    return res
  }
}

/**
 * Metasploit packs some values as msgpack binary (Uint8Array). Convert those to
 * UTF-8 strings recursively so the UI gets clean text. Response payloads are
 * text-heavy (module info, options, console output, session lists).
 */
export function normalize(value) {
  if (value instanceof Uint8Array) {
    return Buffer.from(value).toString('utf8')
  }
  if (Array.isArray(value)) {
    return value.map(normalize)
  }
  if (value instanceof Map) {
    const out = {}
    for (const [k, v] of value.entries()) {
      const key = k instanceof Uint8Array ? Buffer.from(k).toString('utf8') : String(k)
      out[key] = normalize(v)
    }
    return out
  }
  if (value && typeof value === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(value)) {
      out[k] = normalize(v)
    }
    return out
  }
  return value
}
