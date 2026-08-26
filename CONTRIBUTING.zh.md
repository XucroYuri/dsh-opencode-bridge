# 贡献指南

感谢你对本项目的关注！

## 开发

```bash
node --check src/index.js
PYTHONPATH=src python3 -m unittest discover -s tests -p 'test_*.py' -v
```

## Pull Request

- 保持变更聚焦。
- 为新行为添加测试。
- 如果用户可见行为变化，请更新 README.md 和 README.zh.md。
- 推送前运行所有检查。

## 许可证

MIT
