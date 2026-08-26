#!/usr/bin/env node
// Standalone OpenAI-compatible proxy that translates Chat Completions requests
// into OpenCode session/prompt API calls.
import { createServer } from 'node:http'
import { readFileSync, writeFileSync, existsSync, mkdirSync, openSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'

const args = process.argv.slice(2)
function argValue(name, fallback) {
  const i = args.indexOf(name)
  return i >= 0 && args[i+1] ? Number(args[i+1]) : fallback
}
function argString(name, fallback) {
  const i = args.indexOf(name)
  return i >= 0 && args[i+1] ? args[i+1] : fallback
}
const proxyPort = argValue('--port', 4097)
const opencodePort = argValue('--opencode-port', 4096)
const timeoutMs = argValue('--timeout', 60000)
const host = argString('--host', '127.0.0.1')
const authToken = argString('--token', '')

const sessionPool = new Map()
const sessionLastUsed = new Map()
const MAX_SESSIONS = 20
const MAX_BODY_SIZE = 10 * 1024 * 1024

function dshHome() {
  return process.env.DSH_HOME || join(homedir(), '.dsh')
}
function pidPath() { return join(dshHome(), 'cache', 'opencode-bridge.pid') }
function logPath() { return join(dshHome(), 'cache', 'opencode-bridge.log') }
function isRunning(pid) {
  try { process.kill(pid, 0); return true } catch { return false }
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

async function ensureOpenCodeServer(port) {
  // Health first: a native Windows server may already be running without our pid file.
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`)
    if (res.ok) return true
  } catch {}

  // Start OpenCode as a native Windows process via cmd.exe. This avoids the
  // WSL agent-execution issue observed when spawning the .exe directly.
  const userDir = findWindowsUserDir()
  const winUser = userDir.replace('/mnt/c/', 'C:\\').replaceAll('/', '\\')
  const log = join(userDir, '.dsh-opencode-bridge.log')
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

async function getOrCreateSession(opencodePort, modelRef) {
  if (modelRef && sessionPool.has(modelRef)) {
    sessionLastUsed.set(modelRef, Date.now())
    return sessionPool.get(modelRef)
  }
  // Evict the least-recently-used session when the pool is full.
  if (sessionPool.size >= MAX_SESSIONS) {
    let oldestKey = null
    let oldestTime = Infinity
    for (const [key, time] of sessionLastUsed) {
      if (time < oldestTime) {
        oldestTime = time
        oldestKey = key
      }
    }
    if (oldestKey) {
      sessionPool.delete(oldestKey)
      sessionLastUsed.delete(oldestKey)
    }
  }
  const base = `http://127.0.0.1:${opencodePort}`
  const created = await awaitFetch(`${base}/api/session`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}),
  })
  if (created.status !== 200 || !created.data?.data?.id) {
    throw new Error(`failed to create OpenCode session: ${JSON.stringify(created.data)}`)
  }
  const sessionId = created.data.data.id
  if (modelRef) {
    const idx = modelRef.indexOf('/')
    if (idx > 0) {
      await awaitFetch(`${base}/api/session/${sessionId}/model`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: { providerID: modelRef.slice(0, idx), id: modelRef.slice(idx + 1) } }),
      })
    }
  }
  if (modelRef) {
    sessionPool.set(modelRef, sessionId)
    sessionLastUsed.set(modelRef, Date.now())
  }
  return sessionId
}

async function opencodeAsk(opencodePort, prompt, modelRef) {
  const base = `http://127.0.0.1:${opencodePort}`
  const sessionId = await getOrCreateSession(opencodePort, modelRef)
  console.error(`[proxy] session=${sessionId} model=${modelRef} prompt=${JSON.stringify(prompt).slice(0,100)}`)
  const sent = await awaitFetch(`${base}/api/session/${sessionId}/prompt`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: { text: prompt } }),
  })
  if (sent.status !== 200) throw new Error(`failed to send prompt: ${JSON.stringify(sent.data)}`)
  const userId = sent.data?.data?.id
  const userTime = sent.data?.data?.timeCreated ?? Date.now()
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const msgs = await awaitFetch(`${base}/api/session/${sessionId}/message?limit=30`)
    const list = msgs.data?.data ?? []
    const assistant = list.find(m =>
      m.type === 'assistant' &&
      m.finish &&
      (m.time?.created ?? 0) >= (userTime - 1000)
    )
    if (assistant) {
      const text = (assistant.content ?? []).filter(c => c.type === 'text').map(c => c.text).join('\n')
      if (text) { console.error(`[proxy] assistant found`); return text }
    }
    await new Promise(r => setTimeout(r, 1000))
  }
  throw new Error('timed out waiting for OpenCode assistant response')
}

function buildPrompt(messages, tools) {
  const parts = (messages || []).map(m => {
    const role = m.role || 'user'
    let content = ''
    if (typeof m.content === 'string') content = m.content
    else if (Array.isArray(m.content)) content = m.content.map(c => c.type === 'text' ? c.text : '').filter(Boolean).join('\n')
    return `${role}: ${content}`
  })
  if (Array.isArray(tools) && tools.length > 0) {
    const toolList = tools.map(t => {
      const name = t.function?.name || t.name || 'unknown'
      const desc = t.function?.description || t.description || ''
      return `- ${name}: ${desc}`
    }).join('\n')
    parts.push(`Available tools:\n${toolList}`)
  }
  return parts.join('\n\n')
}

function corsHeaders() {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type',
  }
}

const server = createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders())
    res.end()
    return
  }
  if (authToken && req.headers.authorization !== `Bearer ${authToken}`) {
    res.writeHead(401, { 'content-type': 'application/json', ...corsHeaders() })
    res.end(JSON.stringify({ error: 'unauthorized' }))
    return
  }
  const url = new URL(req.url, `http://127.0.0.1:${proxyPort}`)
  const started = Date.now()
  console.error(`[proxy] ${req.method} ${url.pathname}`)
  res.on('finish', () => {
    console.error(`[proxy] ${req.method} ${url.pathname} -> ${res.statusCode} (${Date.now() - started}ms)`)
  })
  if (req.method === 'GET' && url.pathname === '/health') {
    res.writeHead(200, { 'content-type': 'application/json', ...corsHeaders() })
    res.end(JSON.stringify({ ok: true }))
    return
  }
  if (req.method === 'GET' && url.pathname === '/v1/models') {
    try {
      if (!(await ensureOpenCodeServer(opencodePort))) throw new Error('cannot start OpenCode server')
      const modelsRes = await awaitFetch(`http://127.0.0.1:${opencodePort}/api/model`)
      const items = modelsRes.data?.data ?? []
      const data = items.map(m => ({
        id: `${m.providerID}/${m.id}`,
        object: 'model',
        owned_by: m.providerID || 'opencode',
      }))
      res.writeHead(200, { 'content-type': 'application/json', ...corsHeaders() })
      res.end(JSON.stringify({ object: 'list', data }))
    } catch (error) {
      res.writeHead(502, { 'content-type': 'application/json', ...corsHeaders() })
      res.end(JSON.stringify({ error: { message: String(error?.message || error) } }))
    }
    return
  }
  if (req.method === 'POST' && url.pathname === '/v1/chat/completions') {
    let body = ''
    for await (const chunk of req) {
      body += chunk
      if (body.length > MAX_BODY_SIZE) {
        res.writeHead(413, { 'content-type': 'application/json', ...corsHeaders() })
        res.end(JSON.stringify({ error: 'payload too large' }))
        return
      }
    }
    let payload
    try { payload = JSON.parse(body || '{}') } catch {
      res.writeHead(400, { 'content-type': 'application/json', ...corsHeaders() })
      res.end(JSON.stringify({ error: { message: 'invalid JSON' } }))
      return
    }
    const model = payload.model || 'opencode/x-preview-f-free'
    const messages = payload.messages || []
    const stream = payload.stream === true
    const prompt = buildPrompt(messages, payload.tools)
    try {
      if (!(await ensureOpenCodeServer(opencodePort))) throw new Error('cannot start OpenCode server')
      const text = await opencodeAsk(opencodePort, prompt, model)
      if (stream) {
        res.writeHead(200, {
          'content-type': 'text/event-stream',
          ...corsHeaders(),
          'cache-control': 'no-cache',
          connection: 'keep-alive',
        })
        const id = `chatcmpl-${Date.now()}`
        const created = Math.floor(Date.now() / 1000)
        // Emit the text in small deltas so streaming clients see incremental output.
        const pieces = text.match(/.{1,8}/gs) || [text]
        for (const piece of pieces) {
          const chunk = {
            id, object: 'chat.completion.chunk', created, model,
            choices: [{ index: 0, delta: { content: piece }, finish_reason: null }],
          }
          res.write(`data: ${JSON.stringify(chunk)}\n\n`)
          await new Promise(r => setTimeout(r, 10))
        }
        const done = {
          id, object: 'chat.completion.chunk', created, model,
          choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
        }
        res.write(`data: ${JSON.stringify(done)}\n\n`)
        res.write('data: [DONE]\n\n')
        res.end()
      } else {
        const result = {
          id: `chatcmpl-${Date.now()}`, object: 'chat.completion',
          created: Math.floor(Date.now() / 1000), model,
          choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
        }
        res.writeHead(200, { 'content-type': 'application/json', ...corsHeaders() })
        res.end(JSON.stringify(result))
      }
    } catch (error) {
      res.writeHead(502, { 'content-type': 'application/json', ...corsHeaders() })
      res.end(JSON.stringify({ error: { message: String(error?.message || error) } }))
    }
    return
  }
  res.writeHead(404, { 'content-type': 'application/json', ...corsHeaders() })
  res.end(JSON.stringify({ error: { message: 'not found' } }))
})

server.listen(proxyPort, host, () => {
  console.log(`proxy listening on http://127.0.0.1:${proxyPort}/v1`)
  console.log(`opencode server port: ${opencodePort}`)
})
