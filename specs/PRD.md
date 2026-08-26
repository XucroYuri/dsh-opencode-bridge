# dsh-opencode-bridge PRD

## Problem Statement

部分模型服务商只有 OpenCode 支持，或者用户希望直接复用 OpenCode 的登录态。
需要一个可选的 bridge，把 OpenCode 作为 DSH 的模型 Provider。

## Goals

- 将 OpenCode 注册为 DSH 的一个或多个 provider route。
- 支持流式输出和工具调用。
- 复用 OpenCode 已保存的凭据。
- 明确标注 experimental。

## Non-Goals

- 不替代 DSH 原生 pi-ai 直连。
- 不保证完整 session/replay fidelity。
