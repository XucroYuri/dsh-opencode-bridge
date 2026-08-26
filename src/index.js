// Minimal DSH Cordis command wrapper around the Python CLI.
import { spawnSync } from 'node:child_process'

export const name = 'dsh-opencode-bridge'
export const description = 'Experimental bridge to OpenCode as a model provider'

export function apply(ctx) {
  const args = ctx.get('cmdlineArgs')?.get() ?? []
  if (args[0] !== 'opencode-bridge' && args[0] !== 'bridge') return

  const result = spawnSync('dsh-opencode-bridge', args.slice(1), {
    stdio: 'inherit',
    shell: false,
  })

  const exit = ctx.get('appExit')
  if (exit) exit(result.status ?? 1)
}
