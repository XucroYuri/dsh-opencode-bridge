#!/usr/bin/env node
// Standalone OpenAI-compatible proxy that translates Chat Completions requests
// into OpenCode session/prompt API calls.
import { createServer } from 'node:http'
import { readFileSync, writeFileSync, existsSync, mkdirSync, openSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'

const args = process.argv.slice(2)
function argValue(name, fallback) {
  const i = args.indexOf(name)
  return i >= 0 && args[i+1] ? Number(args[i+1]) : fallback
}
const proxyPort = argValue('--port', 4097)
const opencodePort = argValue('--opencode-port', 4096)

function dshHome() {
  return process.env.DSH_HOME || join(homedir(), '.dsh')
}
function pidPath() { return join(dshHome(), 'cache', 'opencode-bridge.pid') }
function logPath() { return join(dshHome(), 'cache', 'opencode-bridge.log') }
function isRunning(pid) {
  try { process.kill(pid, 0); return true } catch { return false }
}

async function ensureOpenCodeServer(port) {
  const p = pidPath()
  if (existsSync(p)) {
    const pid = Number(readFileSync(p, 'utf8').trim())
    if (Number.isInteger(pid) && isRunning(pid)) return true
  }
  mkdirSync(join(p, '..'), { recursive: true })
  const log = openSync(logPath(), 'a')
  const child = spawn('opencode', ['serve', '--hostname', '127.0.0.1', '--port', String(port)], {
    detached: true,
    stdio: ['ignore', log, log],
  })
  child.unref()
  writeFileSync(p, String(child.pid), 'utf8')
  const deadline = Date.now() + 5000
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/health`)
      if (res.ok) return true
    } catch {}
    await new Promise(r => setTimeout(r, 200))
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
  const sent = await awaitFetch(`${base}/api/session/${sessionId}/prompt`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: { text: prompt } }),
  })
  if (sent.status !== 200) throw new Error(`failed to send prompt: ${JSON.stringify(sent.data)}`)
  const userId = sent.data?.data?.id
  const deadline = Date.now() + 60000
  while (Date.now() < deadline) {
    const msgs = await awaitFetch(`${base}/api/session/${sessionId}/message?limit=30`)
    const list = msgs.data?.data ?? []
    const userIdx = list.findIndex(m => m.id === userId)
    const assistant = userIdx >= 0 ? list.slice(userIdx + 1).find(m => m.type === 'assistant' && m.finish) : undefined
    if (assistant) {
      const text = (assistant.content ?? []).filter(c => c.type === 'text').map(c => c.text).join('\n')
      if (text) return text
    }
    await new Promise(r => setTimeout(r, 1000))
  }
  throw new Error('timed out waiting for OpenCode assistant response')
}

function buildPrompt(messages) {
  return (messages || []).map(m => {
    const role = m.role || 'user'
    let content = ''
    if (typeof m.content === 'string') content = m.content
    else if (Array.isArray(m.content)) content = m.content.map(c => c.type === 'text' ? c.text : '').filter(Boolean).join('\n')
    return `${role}: ${content}`
  }).join('\n\n')
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${proxyPort}`)
  if (req.method === 'POST' && url.pathname === '/v1/chat/completions') {
    let body = ''
    for await (const chunk of req) body += chunk
    let payload
    try { payload = JSON.parse(body || '{}') } catch {
      res.writeHead(400, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: { message: 'invalid JSON' } }))
      return
    }
    const model = payload.model || 'opencode/x-preview-f-free'
    const messages = payload.messages || []
    const stream = payload.stream === true
    const prompt = buildPrompt(messages)
    try {
      if (!(await ensureOpenCodeServer(opencodePort))) throw new Error('cannot start OpenCode server')
      const text = await opencodeAsk(opencodePort, prompt, model)
      if (stream) {
        res.writeHead(200, {
          'content-type': 'text/event-stream',
          'cache-control': 'no-cache',
          connection: 'keep-alive',
        })
        const chunk = {
          id: `chatcmpl-${Date.now()}`, object: 'chat.completion.chunk',
          created: Math.floor(Date.now() / 1000), model,
          choices: [{ index: 0, delta: { role: 'assistant', content: text }, finish_reason: 'stop' }],
        }
        res.write(`data: ${JSON.stringify(chunk)}\n\n`)
        res.write('data: [DONE]\n\n')
        res.end()
      } else {
        const result = {
          id: `chatcmpl-${Date.now()}`, object: 'chat.completion',
          created: Math.floor(Date.now() / 1000), model,
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

server.listen(proxyPort, '127.0.0.1', () => {
  console.log(`proxy listening on http://127.0.0.1:${proxyPort}/v1`)
  console.log(`opencode server port: ${opencodePort}`)
})
