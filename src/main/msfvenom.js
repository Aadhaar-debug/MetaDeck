import { spawn } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'
import path from 'node:path'

/**
 * Generates a standalone payload FILE with msfvenom (ships with the Metasploit
 * framework). Unlike running a module over RPC — which only executes it — this
 * writes a real, transferable artifact (.exe, .elf, .macho, .py, raw, …) to disk.
 *
 * Runs:  bundle exec ruby ./msfvenom -p <payload> KEY=VALUE... -f <format>
 *          [-a <arch>] [--platform <platform>] [-e <encoder>] [-i <iters>]
 *          [-b <badchars>] [-x <template>] -o <outFile>
 *
 * Authorized use only — the same scope as the rest of MetaDeck.
 */
export class PayloadBuilder {
  constructor(onLog) {
    this.onLog = onLog || (() => {})
    this.proc = null
  }

  get running() {
    return !!this.proc
  }

  build(cfg) {
    return new Promise((resolve, reject) => {
      if (this.proc) return reject(new Error('A payload build is already in progress'))

      const frameworkPath = cfg.frameworkPath
      if (!frameworkPath || !existsSync(path.join(frameworkPath, 'msfvenom'))) {
        return reject(new Error('msfvenom not found in the configured framework path: ' + frameworkPath))
      }
      if (!cfg.payload) return reject(new Error('No payload selected'))
      if (!cfg.outFile) return reject(new Error('No output file chosen'))

      const rubyBin = cfg.rubyBin || 'ruby'
      const rubyDir = path.dirname(rubyBin)

      const args = buildMsfvenomArgs(cfg)

      const env = {
        ...process.env,
        PATH: `${rubyDir}:${process.env.PATH}`,
        BUNDLE_GEMFILE: path.join(frameworkPath, 'Gemfile')
      }

      this.onLog(`$ msfvenom ${redact(args.slice(2))}\n`)
      const bundleBin = path.join(rubyDir, 'bundle')
      const proc = spawn(existsSync(bundleBin) ? bundleBin : 'bundle', args, {
        cwd: frameworkPath,
        env
      })
      this.proc = proc

      proc.stdout.on('data', (d) => this.onLog(d.toString()))
      proc.stderr.on('data', (d) => this.onLog(d.toString()))
      proc.on('error', (err) => {
        this.proc = null
        reject(new Error('Failed to start msfvenom: ' + err.message))
      })
      proc.on('exit', (code) => {
        this.proc = null
        if (code === 0 && existsSync(cfg.outFile)) {
          const size = statSync(cfg.outFile).size
          this.onLog(`\n[✓ built ${cfg.outFile} — ${size} bytes]\n`)
          resolve({ ok: true, outFile: cfg.outFile, size })
        } else {
          reject(new Error(`msfvenom exited with code ${code} — see the build log for details`))
        }
      })
    })
  }

  cancel() {
    if (this.proc) {
      this.proc.kill('SIGTERM')
      this.proc = null
      return true
    }
    return false
  }
}

// Keep the first arg (payload name) readable; everything else is shown as-is.
const redact = (args) => args.join(' ')

/**
 * Pure builder for the `bundle exec ruby ./msfvenom ...` argument list.
 * Exported so it can be unit-tested without spawning a process.
 */
export function buildMsfvenomArgs(cfg) {
  const args = ['exec', 'ruby', './msfvenom', '-p', cfg.payload]

  // payload options arrive as { LHOST: '1.2.3.4', LPORT: '4444', ... }
  for (const [k, v] of Object.entries(cfg.options || {})) {
    if (v !== undefined && v !== '') args.push(`${k}=${v}`)
  }

  // 'apk' is produced by the android payload's own generator via a bare -o,
  // with no -f transform. Passing `-f apk` fails.
  if (cfg.format !== 'apk') {
    args.push('-f', cfg.format || 'raw')
  }
  if (cfg.arch) args.push('-a', cfg.arch)
  if (cfg.platform) args.push('--platform', cfg.platform)
  if (cfg.encoder) args.push('-e', cfg.encoder)
  if (cfg.iterations) args.push('-i', String(cfg.iterations))
  if (cfg.badchars) args.push('-b', cfg.badchars)
  if (cfg.template) args.push('-x', cfg.template)
  if (cfg.keepTemplateBehavior) args.push('-k')
  args.push('-o', cfg.outFile)
  return args
}
