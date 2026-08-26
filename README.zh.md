# dsh-opencode-bridge

![CI](https://github.com/XucroYuri/dsh-opencode-bridge/actions/workflows/ci.yml/badge.svg) ![License](https://img.shields.io/github/license/XucroYuri/dsh-opencode-bridge)

实验性桥接，让 DeepSeek Harness 可以将 OpenCode 作为模型供应商使用。

> 状态：实验性

## 功能特性

- 管理 OpenCode headless server 生命周期
- 通过 HTTP API 向 OpenCode 提问
- 创建会话 / 切换模型 / 发送提示
- 实验性状态命令
- 原生 Cordis 命令插件

## 环境要求

- DeepSeek Harness (DSH) 0.1.1+
- OpenCode CLI（可选，用于 sync/catalog/bridge 功能）
- Node.js 22+
- Python 3.12+（仅用于备用 CLI 测试）

## 安装

将插件添加到 DSH profile：

```bash
cd ~/.dsh/profiles/tools
npm install @xucroyuri/dsh-opencode-bridge
```

然后在 `cordis.patch.yml` 中添加：

```yaml
- insert:
    - id: opencode-bridge
      name: '@xucroyuri/dsh-opencode-bridge'
```

## 使用方法

```bash
dsh --profile tools opencode-bridge status
dsh --profile tools opencode-bridge serve --port 4096
dsh --profile tools opencode-bridge ask "hello" --model deepseek/deepseek-v4-pro
```

## 开发

```bash
node --check src/index.js
PYTHONPATH=src python3 -m unittest discover -s tests -p 'test_*.py' -v
```

## 许可证

MIT


## 相关插件

- [dsh-opencode-sync](https://github.com/XucroYuri/dsh-opencode-sync)
- [dsh-provider-catalog](https://github.com/XucroYuri/dsh-provider-catalog)
- [dsh-model-manager](https://github.com/XucroYuri/dsh-model-manager)
- [dsh-llm-oauth-ui](https://github.com/XucroYuri/dsh-llm-oauth-ui)
- [dsh-opencode-bridge](https://github.com/XucroYuri/dsh-opencode-bridge)
