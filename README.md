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

## License

MIT
