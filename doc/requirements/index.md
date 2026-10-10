---
doc_id: REQ-INDEX
doc_type: index
module: global
status: approved
last_updated: 2026-10-09
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
| color-challenge | 色觉挑战：色觉辨识小游戏（双端） | [core-game.md](color-challenge/core-game.md)（核心玩法） |
| sliding-puzzle | 数字华容道：三档规格滑块拼图 | [core-game.md](sliding-puzzle/core-game.md)（核心玩法） |
| hidden-cats | 找猫咪：程序生成画面的视觉搜索游戏 | [core-game.md](hidden-cats/core-game.md)（核心玩法） |
| animal-flip-chess | 动物翻翻棋：翻牌博弈对战（人机 AI） | [core-game.md](animal-flip-chess/core-game.md)（核心玩法） |
| tangram | 七巧板：剪影填板空间想象闯关 | [core-game.md](tangram/core-game.md)（核心玩法） |
| clock-learning | 时钟认知：读时间与拨时间启蒙 | [core-game.md](clock-learning/core-game.md)（核心玩法） |
| shopping-cashier | 购物小掌柜：凑钱付账与找零启蒙 | [core-game.md](shopping-cashier/core-game.md)（核心玩法） |
| pattern-quest | 图案找规律：序列规律推理 | [core-game.md](pattern-quest/core-game.md)（核心玩法） |
| code-robot | 编程小机器人：指令序列编程启蒙 | [core-game.md](code-robot/core-game.md)（核心玩法） |
| balance-scale | 天平称重：等量代换推理 | [core-game.md](balance-scale/core-game.md)（核心玩法） |
| water-pour | 倒水谜题：量水目标状态搜索 | [core-game.md](water-pour/core-game.md)（核心玩法） |
| hanzi-parts | 汉字拼字：部件组合识字启蒙 | [core-game.md](hanzi-parts/core-game.md)（核心玩法） |
| mini-sudoku | 儿童数独：4×4/6×6 图案数独 | [core-game.md](mini-sudoku/core-game.md)（核心玩法） |
| memory-match | 记忆翻牌：配对记忆训练 | [core-game.md](memory-match/core-game.md)（核心玩法） |
| snake | 贪吃蛇：经典滑手势动作休闲（双端） | [core-game.md](snake/core-game.md)（核心玩法） |
| breakout | 打砖块：反弹击砖关卡闯关（双端） | [core-game.md](breakout/core-game.md)（核心玩法） |
| math-24 | 24 点：分数精确求解的四则凑 24（双端） | [core-game.md](math-24/core-game.md)（核心玩法） |
| nonogram | 数织：行列提示唯一解像素还原（双端） | [core-game.md](nonogram/core-game.md)（核心玩法） |
| sokoban | 推箱子：Microban 关卡推箱规划（双端） | [core-game.md](sokoban/core-game.md)（核心玩法） |
| idiom-guess | 猜成语：四字着色反馈成语推理（双端） | [core-game.md](idiom-guess/core-game.md)（核心玩法） |
| game-hub | 平台首页：年龄筛选（REQ-GH001）与设备筛选（REQ-GH002） | [device-filter.md](game-hub/device-filter.md)（设备筛选 Tab；年龄筛选见 [age-filter.md](game-hub/age-filter.md)） |

## 公共约束

- 所有游戏遵守 `frontend-AGENTS.md` 与 `design-system.yaml`；中文注释、UTF-8。
- 涉及玩家身份的界面不得硬编码真实姓名。
