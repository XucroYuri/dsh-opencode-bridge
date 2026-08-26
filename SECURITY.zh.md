# 安全

## 报告漏洞

如果发现安全问题，请通过 GitHub 私有安全通告或直接联系维护者。

## 密钥处理

- 永远不要提交真实的 API Key 或 OAuth Token。
- DSH 插件必须通过 `ctx.credentials` 存储密钥，而不是写入 `settings.yaml`。
- 保持 `~/.dsh/.credentials.yaml` 权限为 `0600`。
