// Native DSH Cordis plugin for the experimental OpenCode bridge.
// Provides lifecycle commands and an OpenAI-compatible proxy so DSH's
// llm-pi-ai can use OpenCode as a provider without a custom LlmAdapter.
import { readFileSync, writeFileSync, unlinkSync, existsSync, mkdirSync, openSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn, spawnSync } from 'node:child_process'

export const name = 'dsh-opencode-bridge'
export const description = 'Experimental bridge to OpenCode as a model provider'

function dshHome() {
  return process.env.DSH_HOME || join(homedir(), '.dsh')
}

function pidPath() {
  return join(dshHome(), 'cache', 'opencode-bridge.pid')
}

function proxyPidPath() {
  return join(dshHome(), 'cache', 'opencode-bridge-proxy.pid')
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

function findWindowsUserDir() {
  const root = '/mnt/c/Users'
  try {
    for (const name of readdirSync(root)) {
      const base = join(root, name)
      if (existsSync(join(base, '.config/opencode')) || existsSync(join(base, 'AppData'))) return base
    }
  } catch {}
  return '/mnt/c/Users'
}

async function ensureServer(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`)
    if (res.ok) return true
  } catch {}

  const userDir = findWindowsUserDir()
  const winUser = userDir.replace('/mnt/c/', 'C:\\').replaceAll('/', '\\')
  const cmd = `cd /d ${winUser} && start /b opencode serve --hostname 127.0.0.1 --port ${port} > ${winUser}\\.dsh-opencode-bridge.log 2>&1`
  try {
    spawn('cmd.exe', ['/c', cmd], { cwd: userDir, detached: true, stdio: 'ignore' }).unref()
  } catch {}

  const deadline = Date.now() + 8000
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/health`)
      if (res.ok) return true
    } catch {}
    await new Promise(r => setTimeout(r, 300))
  }
  return false
}

async function awaitFetch(url, options) {
  const res = await fetch(url, options)
  const text = await res.text()
  let data = null
  try { data = text ? JSON.parse(text) : null } catch { data = text }
  return { status: res.status, data }
}

async function opencodeAsk(opencodePort, prompt, modelRef) {
  const base = `http://127.0.0.1:${opencodePort}`
  const created = await awaitFetch(`${base}/api/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({}),
  })
  if (created.status !== 200 || !created.data?.data?.id) {
    throw new Error(`failed to create OpenCode session: ${JSON.stringify(created.data)}`)
  }
  const sessionId = created.data.data.id

  if (modelRef) {
    const idx = modelRef.indexOf('/')
    if (idx > 0) {
      const providerID = modelRef.slice(0, idx)
      const id = modelRef.slice(idx + 1)
      await awaitFetch(`${base}/api/session/${sessionId}/model`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: { providerID, id } }),
      })
    }
  }

  const sent = await awaitFetch(`${base}/api/session/${sessionId}/prompt`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: { text: prompt } }),
  })
  if (sent.status !== 200) {
    throw new Error(`failed to send prompt: ${JSON.stringify(sent.data)}`)
  }
  const userId = sent.data?.data?.id
  const userTime = sent.data?.data?.timeCreated ?? Date.now()

  const deadline = Date.now() + 60000
  while (Date.now() < deadline) {
    const msgs = await awaitFetch(`${base}/api/session/${sessionId}/message?limit=30`)
    const list = msgs.data?.data ?? []
    const assistant = list.find(m =>
      m.type === 'assistant' &&
      m.finish &&
      (m.time?.created ?? 0) >= (userTime - 1000)
    )
    if (assistant) {
      const text = (assistant.content ?? [])
        .filter(c => c.type === 'text')
        .map(c => c.text)
        .join('\n')
      if (text) return text
    }
    await new Promise(r => setTimeout(r, 1000))
  }
  throw new Error('timed out waiting for OpenCode assistant response')
}

function buildPrompt(messages) {
  return (messages || [])
    .map(m => {
      const role = m.role || 'user'
      let content = ''
      if (typeof m.content === 'string') content = m.content
      else if (Array.isArray(m.content)) {
        content = m.content.map(c => c.type === 'text' ? c.text : '').filter(Boolean).join('\n')
      }
      return `${role}: ${content}`
    })
    .join('\n\n')
}

function startProxy(proxyPort, opencodePort) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${proxyPort}`)
    if (req.method === 'POST' && url.pathname === '/v1/chat/completions') {
      let body = ''
      for await (const chunk of req) body += chunk
      let payload
      try {
        payload = JSON.parse(body || '{}')
      } catch {
        res.writeHead(400, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: { message: 'invalid JSON' } }))
        return
      }

      const model = payload.model || 'opencode/x-preview-f-free'
      const messages = payload.messages || []
      const stream = payload.stream === true
      const prompt = buildPrompt(messages)

      try {
        if (!(await ensureServer(opencodePort))) throw new Error('cannot start OpenCode server')
        const text = await opencodeAsk(opencodePort, prompt, model)

        if (stream) {
          res.writeHead(200, {
            'content-type': 'text/event-stream',
            'cache-control': 'no-cache',
            connection: 'keep-alive',
          })
          const chunk = {
            id: `chatcmpl-${Date.now()}`,
            object: 'chat.completion.chunk',
            created: Math.floor(Date.now() / 1000),
            model,
            choices: [{ index: 0, delta: { role: 'assistant', content: text }, finish_reason: 'stop' }],
          }
          res.write(`data: ${JSON.stringify(chunk)}\n\n`)
          res.write('data: [DONE]\n\n')
          res.end()
        } else {
          const result = {
            id: `chatcmpl-${Date.now()}`,
            object: 'chat.completion',
            created: Math.floor(Date.now() / 1000),
            model,
            choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
          }
          res.writeHead(200, { 'content-type': 'application/json' })
          res.end(JSON.stringify(result))
        }
      } catch (error) {
        res.writeHead(502, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: { message: String(error?.message || error) } }))
      }
      return
    }

    res.writeHead(404, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ error: { message: 'not found' } }))
  })

  return new Promise((resolve) => {
    server.listen(proxyPort, '127.0.0.1', () => {
      const p = proxyPidPath()
      mkdirSync(join(p, '..'), { recursive: true })
      writeFileSync(p, String(process.pid), 'utf8')
      resolve(server)
    })
  })
}

export async function apply(ctx) {
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
        if (Number.isInteger(pid) && isRunning(pid)) console.log(`bridge: running (pid ${pid})`)
        else console.log('bridge: pid file exists but process not running')
      } else {
        console.log('bridge: not running')
      }
      const pp = proxyPidPath()
      if (existsSync(pp)) {
        const pid = Number(readFileSync(pp, 'utf8').trim())
        if (Number.isInteger(pid) && isRunning(pid)) console.log(`proxy: running (pid ${pid})`)
        else console.log('proxy: pid file exists but process not running')
      } else {
        console.log('proxy: not running')
      }
      finish(0); return
    }

    if (command === 'serve') {
      const portIdx = args.indexOf('--port')
      const port = portIdx >= 0 && args[portIdx+1] ? Number(args[portIdx+1]) : 4096
      if (await ensureServer(port)) {
        console.log(`bridge is running on port ${port}`)
        finish(0); return
      }
      console.error('bridge failed to start')
      finish(1); return
    }

    if (command === 'proxy') {
      const portIdx = args.indexOf('--port')
      const proxyPort = portIdx >= 0 && args[portIdx+1] ? Number(args[portIdx+1]) : 4097
      const ocIdx = args.indexOf('--opencode-port')
      const opencodePort = ocIdx >= 0 && args[ocIdx+1] ? Number(args[ocIdx+1]) : 4096
      const script = fileURLToPath(new URL('./proxy-server.js', import.meta.url))
      const pp = proxyPidPath()
      mkdirSync(join(pp, '..'), { recursive: true })
      const log = openSync(logPath(), 'a')
      const timeoutIdx = args.indexOf('--timeout')
      const timeoutArgs = timeoutIdx >= 0 && args[timeoutIdx+1] ? ['--timeout', args[timeoutIdx+1]] : []
      const hostIdx = args.indexOf('--host')
      const hostArgs = hostIdx >= 0 && args[hostIdx+1] ? ['--host', args[hostIdx+1]] : []
      const child = spawn(process.execPath, [script, '--port', String(proxyPort), '--opencode-port', String(opencodePort), ...timeoutArgs, ...hostArgs], {
        detached: true,
        stdio: ['ignore', log, log],
      })
      child.unref()
      writeFileSync(pp, String(child.pid), 'utf8')
      console.log(`proxy started (pid ${child.pid}, port ${proxyPort})`)
      console.log(`log: ${logPath()}`)
      finish(0); return
    }

    if (command === 'stop') {
      const p = pidPath()
      if (existsSync(p)) {
        const pid = Number(readFileSync(p, 'utf8').trim())
        try { process.kill(-pid, 'SIGTERM') } catch { try { process.kill(pid, 'SIGTERM') } catch {} }
        unlinkSync(p)
      }
      const pp = proxyPidPath()
      if (existsSync(pp)) {
        const pid = Number(readFileSync(pp, 'utf8').trim())
        try { process.kill(pid, 'SIGTERM') } catch {}
        unlinkSync(pp)
      }
      console.log('bridge stopped')
      finish(0); return
    }

    if (command === 'ask') {
      const prompt = args[2]
      if (!prompt) {
        console.error('Usage: dsh --profile tools opencode-bridge ask "<prompt>" [--model provider/model] [--port PORT]')
        finish(2); return
      }
      const portIdx = args.indexOf('--port')
      const port = portIdx >= 0 && args[portIdx+1] ? Number(args[portIdx+1]) : 4096
      const modelIdx = args.indexOf('--model')
      const model = modelIdx >= 0 && args[modelIdx+1] ? args[modelIdx+1] : undefined
      try {
        if (!(await ensureServer(port))) throw new Error('cannot start OpenCode server')
        const text = await opencodeAsk(port, prompt, model)
        console.log(text)
        finish(0)
      } catch (error) {
        console.error('bridge ask failed:', error?.message || error)
        finish(1)
      }
      return
    }

    if (command === 'config') {
      const portIdx = args.indexOf('--port')
      const port = portIdx >= 0 && args[portIdx+1] ? Number(args[portIdx+1]) : 4097
      console.log('# Add this to llm-pi-ai.providers to use the OpenCode proxy:')
      console.log('opencode-bridge:')
      console.log('  apiKeyEnv: OPENCODE_API_KEY')
      console.log(`  baseURL: http://127.0.0.1:${port}/v1`)
      console.log('  api: openai-completions')
      console.log('  models:')
      console.log('    - id: deepseek/deepseek-v4-pro')
      console.log('    - id: opencode/x-preview-f-free')
      finish(0); return
    }

    console.error(`Unknown command: ${command}`)
    finish(2)
  } catch (error) {
    console.error('dsh-opencode-bridge failed:', error)
    finish(1)
  }
}
