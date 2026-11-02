import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'

/**
 * Starts and stops a local Metasploit RPC daemon (msfrpcd) from a framework
 * checkout, so the user can run everything with a button instead of a terminal.
 *
 * It launches:  bundle exec ruby ./msfrpcd -U <user> -P <pass> -p <port> -S -f -n
 *   -S  disable SSL on the RPC socket (simplest for localhost)
 *   -f  run in the foreground (so we can manage the process + stream logs)
 *   -n  run without a database (no PostgreSQL required for the core workflow)
 */
export class ServerManager {
  constructor(onLog, onExit) {
    this.proc = null
    this.onLog = onLog || (() => {})
    this.onExit = onExit || (() => {})
  }

  get running() {
    return !!this.proc
  }

  /**
   * @param {object} cfg
   * @param {string} cfg.frameworkPath  path to the metasploit-framework checkout
   * @param {string} cfg.rubyBin        path to the ruby binary to use
   * @param {number} cfg.port
   * @param {string} cfg.user
   * @param {string} cfg.pass
   * @param {boolean} cfg.ssl
   * @param {boolean} cfg.useDatabase
   */
  start(cfg) {
    if (this.proc) throw new Error('Server already running')

    const frameworkPath = cfg.frameworkPath
    if (!frameworkPath || !existsSync(path.join(frameworkPath, 'msfrpcd'))) {
      throw new Error('msfrpcd not found in the configured framework path: ' + frameworkPath)
    }
    const rubyBin = cfg.rubyBin || 'ruby'
    const rubyDir = path.dirname(rubyBin)

    const args = ['exec', 'ruby', './msfrpcd',
      '-U', cfg.user,
      '-P', cfg.pass,
      '-a', '127.0.0.1',
      '-p', String(cfg.port),
      '-f']
    if (!cfg.ssl) args.push('-S')        // -S disables SSL
    if (!cfg.useDatabase) args.push('-n') // -n disables the database

    const env = {
      ...process.env,
      PATH: `${rubyDir}:${process.env.PATH}`,
      BUNDLE_GEMFILE: path.join(frameworkPath, 'Gemfile')
    }

    this.onLog(`$ bundle ${args.join(' ')}\n`)
    const bundleBin = path.join(rubyDir, 'bundle')
    const proc = spawn(existsSync(bundleBin) ? bundleBin : 'bundle', args, {
      cwd: frameworkPath,
      env
    })
    this.proc = proc

    proc.stdout.on('data', (d) => this.onLog(d.toString()))
    proc.stderr.on('data', (d) => this.onLog(d.toString()))
    proc.on('exit', (code, signal) => {
      this.onLog(`\n[msfrpcd exited code=${code} signal=${signal}]\n`)
      this.proc = null
      this.onExit(code, signal)
    })
    proc.on('error', (err) => {
      this.onLog(`\n[failed to start msfrpcd: ${err.message}]\n`)
      this.proc = null
      this.onExit(-1, null)
    })
    return true
  }

  stop() {
    if (!this.proc) return false
    this.proc.kill('SIGTERM')
    return true
  }
}
