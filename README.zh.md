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


## 文档

- [CHANGELOG.md](CHANGELOG.md)
- [CONTRIBUTING.zh.md](CONTRIBUTING.zh.md)
- [SECURITY.zh.md](SECURITY.zh.md)
- [AUTHORS.md](AUTHORS.md)
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)


## 测试

```bash
npm test
npm run smoke
npm run pack:check
```


## 配置

| 参数 | 默认值 | 说明 |
|---|---|---|
| `--host` | `127.0.0.1` | 绑定地址 |
| `--port` | `4097` | Proxy 端口 |
| `--opencode-port` | `4096` | OpenCode server 端口 |
| `--timeout` | `60000` | OpenCode 响应超时（毫秒） |
| `--token` | 空 | API Bearer Token |
| `DSH_HOME` | `~/.dsh` | DSH 主目录 |


## 路线图

- 发布到 npm
- 集成 DSH 主 Web UI
- 完整 tool-call 协议支持
- 更多模型发现来源
