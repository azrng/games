---
doc_id: REQ-INDEX
doc_type: index
module: global
status: approved
last_updated: 2026-09-23
---

# 需求索引与项目级目标

## 项目目标

- 提供开箱即用的网页小游戏合集，覆盖休闲娱乐与轻量教育场景。
- 每个游戏为独立静态页（`src/<game>/`），共享平台首页（`index.html`）导航；无构建、无后端、无外部依赖。
- 教育类游戏在保留儿童用户的同时，逐步支持成人自学场景。

## 模块目录

| 模块 | 说明 | 需求文档 |
| --- | --- | --- |
| typing-cannon | 单词大炮：英文打字射击游戏 | [adult-word-packs.md](typing-cannon/adult-word-packs.md)（成人词包与词义模式） |
| 其余 14 个游戏 | 休闲/益智类，暂无独立需求文档，历史决策见 `doc/devlog/` 与 `doc/design/设计文档.md` | — |

## 公共约束

- 所有游戏遵守 `frontend-AGENTS.md` 与 `design-system.yaml`；中文注释、UTF-8。
- 涉及玩家身份的界面不得硬编码真实姓名。
