---
doc_id: REQ-INDEX
doc_type: index
module: global
status: approved
last_updated: 2026-10-08
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
| pinyin-typing | 拼音打字乐园：儿童汉字打字游戏（5-8 岁三档） | [core-game.md](pinyin-typing/core-game.md)（核心玩法） |
| color-challenge | 色觉挑战：纯移动端色觉辨识小游戏 | [core-game.md](color-challenge/core-game.md)（核心玩法） |
| sliding-puzzle | 数字华容道：三档规格滑块拼图 | [core-game.md](sliding-puzzle/core-game.md)（核心玩法） |
| hidden-cats | 找猫咪：程序生成画面的视觉搜索游戏 | [core-game.md](hidden-cats/core-game.md)（核心玩法） |
| animal-flip-chess | 动物翻翻棋：翻牌博弈对战（人机 AI） | [core-game.md](animal-flip-chess/core-game.md)（核心玩法） |
| game-hub | 平台首页：年龄筛选（REQ-GH001）与设备筛选（REQ-GH002） | [device-filter.md](game-hub/device-filter.md)（设备筛选 Tab；年龄筛选见 [age-filter.md](game-hub/age-filter.md)） |

## 公共约束

- 所有游戏遵守 `frontend-AGENTS.md` 与 `design-system.yaml`；中文注释、UTF-8。
- 涉及玩家身份的界面不得硬编码真实姓名。
