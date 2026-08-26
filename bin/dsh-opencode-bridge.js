#!/usr/bin/env node
// Standalone CLI for dsh-opencode-bridge.
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const args = process.argv.slice(2)
const command = args[0] || 'help'

if (command === 'proxy') {
  const portIdx = args.indexOf('--port')
  const port = portIdx >= 0 && args[portIdx+1] ? args[portIdx+1] : '4097'
  const ocIdx = args.indexOf('--opencode-port')
  const ocPort = ocIdx >= 0 && args[ocIdx+1] ? args[ocIdx+1] : '4096'
  const script = fileURLToPath(new URL('../src/proxy-server.js', import.meta.url))
  const timeoutIdx = args.indexOf('--timeout')
  const timeoutArgs = timeoutIdx >= 0 && args[timeoutIdx+1] ? ['--timeout', args[timeoutIdx+1]] : []
  const hostIdx = args.indexOf('--host')
  const hostArgs = hostIdx >= 0 && args[hostIdx+1] ? ['--host', args[hostIdx+1]] : []
  const child = spawn(process.execPath, [script, '--port', port, '--opencode-port', ocPort, ...timeoutArgs, ...hostArgs], {
    stdio: 'inherit',
  })
  child.on('exit', (code) => process.exit(code ?? 0))
} else if (command === 'status') {
  console.log('dsh-opencode-bridge standalone CLI')
  console.log('Use `dsh --profile tools opencode-bridge status` for full status.')
  console.log('Or run: dsh-opencode-bridge proxy --port 4097 --opencode-port 4096')
} else {
  console.log(`Usage: dsh-opencode-bridge <proxy|status>`)
  console.log('')
  console.log('Commands:')
  console.log('  proxy    Start OpenAI-compatible proxy')
  console.log('  status   Show basic status')
}
