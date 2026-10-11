---
doc_id: DES-INDEX
doc_type: index
module: global
status: approved
last_updated: 2026-10-11
---

# 设计索引

| 模块 | 功能 | 状态 | 文档 | 关联需求 |
| --- | --- | --- | --- | --- |
| typing-cannon | 成人词包与词义模式 | approved | [adult-word-packs.md](typing-cannon/adult-word-packs.md) | REQ-TC001 |
| typing-cannon | 错词本（复习局 + 毕业机制） | approved | [review-book.md](typing-cannon/review-book.md) | REQ-TC002 |
| typing-cannon | 听写模式 | approved | [dictation-mode.md](typing-cannon/dictation-mode.md) | REQ-TC003 |
| pinyin-typing | 拼音打字乐园核心玩法（5-8 岁三档） | approved | [core-game.md](pinyin-typing/core-game.md) | REQ-PT001 |
| game-hub | 首页年龄筛选 Tab | approved | [age-filter.md](game-hub/age-filter.md) | REQ-GH001 |
| game-hub | 首页设备筛选 Tab | approved | [device-filter.md](game-hub/device-filter.md) | REQ-GH002 |
| game-hub | 游戏页首次进入玩法提示条与「?」入口 | approved | [first-play-tip.md](game-hub/first-play-tip.md) | REQ-GH003 |
| tangram | 七巧板核心玩法 | approved | [core-game.md](tangram/core-game.md) | REQ-TG001 |
| clock-learning | 时钟认知核心玩法 | approved | [core-game.md](clock-learning/core-game.md) | REQ-CL001 |
| shopping-cashier | 购物小掌柜核心玩法 | approved | [core-game.md](shopping-cashier/core-game.md) | REQ-SP001 |
| pattern-quest | 图案找规律核心玩法 | approved | [core-game.md](pattern-quest/core-game.md) | REQ-PQ001 |
| code-robot | 编程小机器人核心玩法 | approved | [core-game.md](code-robot/core-game.md) | REQ-CR001 |
| balance-scale | 天平称重核心玩法 | approved | [core-game.md](balance-scale/core-game.md) | REQ-BS001 |
| water-pour | 倒水谜题核心玩法 | approved | [core-game.md](water-pour/core-game.md) | REQ-WP001 |
| hanzi-parts | 汉字拼字核心玩法 | approved | [core-game.md](hanzi-parts/core-game.md) | REQ-HZ001 |
| mini-sudoku | 儿童数独核心玩法 | approved | [core-game.md](mini-sudoku/core-game.md) | REQ-SD001 |
| memory-match | 记忆翻牌核心玩法 | approved | [core-game.md](memory-match/core-game.md) | REQ-MM001 |
| snake | 贪吃蛇核心玩法 | approved | [core-game.md](snake/core-game.md) | REQ-SN001 |
| breakout | 打砖块核心玩法 | approved | [core-game.md](breakout/core-game.md) | REQ-BK001 |
| math-24 | 24 点核心玩法 | approved | [core-game.md](math-24/core-game.md) | REQ-MT001 |
| nonogram | 数织核心玩法 | approved | [core-game.md](nonogram/core-game.md) | REQ-NG001 |
| sokoban | 推箱子核心玩法 | approved | [core-game.md](sokoban/core-game.md) | REQ-SK001 |
| idiom-guess | 猜成语核心玩法 | approved | [core-game.md](idiom-guess/core-game.md) | REQ-IG001 |

## 跨模块

- `architecture.md`：暂无（跨模块公共实现目前仅有游戏页共享脚本：`game-back.js` 返回按钮、`game-tip.js` 首次玩法提示，后者设计见 [game-hub/first-play-tip.md](game-hub/first-play-tip.md)）。
- `设计文档.md`：旧版兼容入口，仅含历史内容，不追加新章节。
