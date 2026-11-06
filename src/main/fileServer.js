import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Serves a single chosen file over HTTP so an authorized target on the local
 * network can download it. Hosts exactly one file at /<basename>; any other
 * path 404s. Authorized testing use only.
 */
export class FileServerManager {
  constructor(onHit) {
    this.onHit = onHit || (() => {})
    this.server = null
    this.running = false
    this.info = null
  }

  /**
   * @param {string} filePath  absolute path of the file to serve
   * @param {number} port      TCP port (0 = ephemeral, used by tests)
   * @param {string} host      bind address (default 0.0.0.0 = all interfaces)
   * @returns {Promise<{fileName:string, port:number, host:string}>}
   */
  start(filePath, port = 0, host = '0.0.0.0') {
    return new Promise((resolve, reject) => {
      if (!filePath || !fs.existsSync(filePath)) {
        return reject(new Error('File to host does not exist: ' + filePath))
      }
      const fileName = path.basename(filePath)

      const server = http.createServer((req, res) => {
        const reqName = decodeURIComponent((req.url || '/').replace(/^\//, '').split('?')[0])
        if (reqName !== fileName) {
          res.writeHead(404, { 'Content-Type': 'text/plain' })
          res.end('Not found')
          return
        }
        if (!fs.existsSync(filePath)) {
          res.writeHead(410, { 'Content-Type': 'text/plain' })
          res.end('Gone')
          return
        }
        const size = fs.statSync(filePath).size
        this.onHit({ ip: req.socket.remoteAddress, at: Date.now(), file: fileName })
        res.writeHead(200, {
          'Content-Type': 'application/octet-stream',
          'Content-Length': size,
          'Content-Disposition': `attachment; filename="${fileName}"`
        })
        fs.createReadStream(filePath).pipe(res)
      })

      server.on('error', (err) => {
        this.server = null
        this.running = false
        reject(err)
      })

      server.listen(port, host, () => {
        this.server = server
        this.running = true
        const actualPort = server.address().port
        this.info = { fileName, port: actualPort, host }
        resolve({ fileName, port: actualPort, host })
      })
    })
  }

  status() {
    return { running: this.running, info: this.info }
  }

  stop() {
    if (!this.server) return false
    this.server.close()
    this.server = null
    this.running = false
    this.info = null
    return true
  }
}
