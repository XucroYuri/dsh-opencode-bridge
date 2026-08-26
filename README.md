# dsh-opencode-bridge

![CI](https://github.com/XucroYuri/dsh-opencode-bridge/actions/workflows/ci.yml/badge.svg) ![License](https://img.shields.io/github/license/XucroYuri/dsh-opencode-bridge)

Experimental bridge to use OpenCode as a model provider from DeepSeek Harness.

> Status: Experimental

## Features

- Manage OpenCode headless server lifecycle
- Ask OpenCode via HTTP API
- Create session / switch model / send prompt
- Experimental status command
- Native Cordis command plugin

## Requirements

- DeepSeek Harness (DSH) 0.1.1+
- OpenCode CLI (optional, for sync/catalog/bridge features)
- Node.js 22+
- Python 3.12+ (only for fallback CLI tests)

## Installation

Add the plugin to your DSH profile:

```bash
cd ~/.dsh/profiles/tools
npm install @xucroyuri/dsh-opencode-bridge
```

Then add to `cordis.patch.yml`:

```yaml
- insert:
    - id: opencode-bridge
      name: '@xucroyuri/dsh-opencode-bridge'
```

## Usage

```bash
dsh --profile tools opencode-bridge status
dsh --profile tools opencode-bridge serve --port 4096
dsh --profile tools opencode-bridge ask "hello" --model deepseek/deepseek-v4-pro
```

## Development

```bash
node --check src/index.js
PYTHONPATH=src python3 -m unittest discover -s tests -p 'test_*.py' -v
```

## Related Plugins

- [dsh-opencode-sync](https://github.com/XucroYuri/dsh-opencode-sync)
- [dsh-provider-catalog](https://github.com/XucroYuri/dsh-provider-catalog)
- [dsh-model-manager](https://github.com/XucroYuri/dsh-model-manager)
- [dsh-llm-oauth-ui](https://github.com/XucroYuri/dsh-llm-oauth-ui)
- [dsh-opencode-bridge](https://github.com/XucroYuri/dsh-opencode-bridge)

## Documentation

- [CHANGELOG.md](CHANGELOG.md)
- [CONTRIBUTING.md](CONTRIBUTING.md)
- [SECURITY.md](SECURITY.md)
- [AUTHORS.md](AUTHORS.md)
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)

## Testing

```bash
npm test
npm run smoke
npm run pack:check
```

## Configuration

| Option | Default | Description |
|---|---|---|
| `--host` | `127.0.0.1` | Bind address |
| `--port` | `4097` | Proxy port |
| `--opencode-port` | `4096` | OpenCode server port |
| `--timeout` | `60000` | OpenCode response timeout (ms) |
| `--token` | empty | Bearer token for API auth |
| `DSH_HOME` | `~/.dsh` | DSH home directory |

## Roadmap

- Publish to npm
- Integrate with DSH main Web UI
- Full tool-call protocol support
- More provider discovery sources

## Examples

See [examples/](examples/) for runnable demos.

## Support

If you find this project useful, consider [sponsoring](https://github.com/sponsors/XucroYuri).

## License

MIT
