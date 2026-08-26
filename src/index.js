// Native DSH Cordis plugin for the experimental OpenCode bridge lifecycle.
import { readFileSync, writeFileSync, unlinkSync, existsSync, mkdirSync, openSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { spawn, spawnSync } from 'node:child_process'

export const name = 'dsh-opencode-bridge'
export const description = 'Experimental bridge to OpenCode as a model provider'

function dshHome() {
  return process.env.DSH_HOME || join(homedir(), '.dsh')
}

function pidPath() {
  return join(dshHome(), 'cache', 'opencode-bridge.pid')
}

function logPath() {
  return join(dshHome(), 'cache', 'opencode-bridge.log')
}

function isRunning(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

export function apply(ctx) {
  const args = ctx.get('cmdlineArgs')?.get() ?? []
  if (args[0] !== 'opencode-bridge' && args[0] !== 'bridge') return

  const exit = ctx.get('appExit')
  const finish = (code) => { if (exit) exit(code) }

  try {
    const command = args[1] || 'status'

    if (command === 'status') {
      const proc = spawnSync('opencode', ['--version'], { encoding: 'utf8', timeout: 10000 })
      if (proc.status !== 0) {
        console.error('opencode: not found')
        finish(1); return
      }
      console.log(`opencode: ${proc.stdout.trim()}`)
      const p = pidPath()
      if (existsSync(p)) {
        const pid = Number(readFileSync(p, 'utf8').trim())
        if (Number.isInteger(pid) && isRunning(pid)) {
          console.log(`bridge: running (pid ${pid})`)
        } else {
          console.log('bridge: pid file exists but process not running')
        }
      } else {
        console.log('bridge: not running')
      }
      finish(0); return
    }

    if (command === 'serve') {
      const portIdx = args.indexOf('--port')
      const port = portIdx >= 0 && args[portIdx+1] ? Number(args[portIdx+1]) : 4096
      const p = pidPath()
      if (existsSync(p)) {
        const pid = Number(readFileSync(p, 'utf8').trim())
        if (Number.isInteger(pid) && isRunning(pid)) {
          console.log(`bridge already running (pid ${pid})`)
          finish(0); return
        }
        unlinkSync(p)
      }
      mkdirSync(join(p, '..'), { recursive: true })
      const log = openSync(logPath(), 'a')
      const child = spawn('opencode', ['serve', '--hostname', '127.0.0.1', '--port', String(port)], {
        detached: true,
        stdio: ['ignore', log, log],
      })
      child.unref()
      writeFileSync(p, String(child.pid), 'utf8')
      console.log(`bridge started (pid ${child.pid}, port ${port})`)
      console.log(`log: ${logPath()}`)
      finish(0); return
    }

    if (command === 'stop') {
      const p = pidPath()
      if (!existsSync(p)) {
        console.log('bridge not running')
        finish(0); return
      }
      const pid = Number(readFileSync(p, 'utf8').trim())
      try { process.kill(-pid, 'SIGTERM') } catch { try { process.kill(pid, 'SIGTERM') } catch {} }
      unlinkSync(p)
      console.log('bridge stopped')
      finish(0); return
    }

    if (command === 'config') {
      const portIdx = args.indexOf('--port')
      const port = portIdx >= 0 && args[portIdx+1] ? Number(args[portIdx+1]) : 4096
      console.log('# Experimental: add this to llm-pi-ai.providers if OpenCode exposes')
      console.log('# an OpenAI-compatible endpoint at the bridge port.')
      console.log('opencode-bridge:')
      console.log('  apiKeyEnv: OPENCODE_API_KEY')
      console.log(`  baseURL: http://127.0.0.1:${port}/v1`)
      console.log('  api: openai-completions')
      console.log('  models:')
      console.log('    - id: opencode/glm-5.3')
      finish(0); return
    }

    console.error(`Unknown command: ${command}`)
    finish(2)
  } catch (error) {
    console.error('dsh-opencode-bridge failed:', error)
    finish(1)
  }
}
