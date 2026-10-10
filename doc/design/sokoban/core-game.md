---
doc_id: DES-SK001
doc_type: design
module: sokoban
status: approved
last_updated: 2026-10-10
related:
  - doc/requirements/sokoban/core-game.md
---

# 推箱子 · 技术设计（DES-SK001）

## 需求追溯

实现 REQ-SK001 全部验收标准；无契约文档（关卡文本格式为行业公共标准，写入 levels.js 文件头注释）。

## 数据来源与署名

- 关卡集：David W. Skinner《Microban》精选 60 关（1-60，社区惯例免费使用、需保留作者署名）。
- `src/sokoban/levels.js` 为数据产物：文件头注明来源、许可惯例与筛选条件（"Microban levels 1-60 by David W. Skinner, 经社区惯例许可使用，署名保留"），实现时从镜像抓取原文后人工复核格式。

## 技术设计

**文件结构**：`src/sokoban/` 五件套（多一个 `levels.js` 数据文件；DOM 棋盘对齐 `src/lights-out/` 惯例）。

**levels.js**：`window.SOKOBAN_LEVELS = ["关1文本", "关2文本", ...]`（标准 Sokoban 文本，`-` 补齐外圈留白行内空格可省略为空格）。

**script.js 架构**：
- IIFE + 首行 `// @ts-check` + 全中文注释；常量：`SLUG = "sokoban"`、存档键 `sokoban-unlocked-level` / `sokoban-current-level` / `sokoban-best-<level>`（最少步）。
- 解析（纯函数，挂 `window.Sokoban` 导出）：
  - `parseLevel(text)`：按行解析为 `{ width, height, walls:Set, goals:Set, boxes:Set, player:{x,y} }`（键为 `y*100+x` 整数键）；校验 `boxes.size === goals.size >= 1` 且恰 1 人，非法抛错（smoke 断言 60 关全过）。
  - `tryMove(level, player, dir)`：返回 `{ moved, pushed, player, boxes }` 新状态（不可变风格）——目标格为墙或"箱后是墙/箱"则 `moved: false`；推动时同步改箱坐标。
  - `isSolved(boxes, goals)`：boxes 全部位于 goals。
  - `applyMove / undoMove`：主状态持历史栈（存 player 与被推箱坐标差量），undo 精确还原。
- 渲染：CSS Grid，格子五态 class（墙/地板/目标/箱/人 + 箱在目标合体态）；墙用深色块、目标点用标记环、箱子圆角方块、人用圆头图标形。
- 输入：`keydown`（Arrow/WASD）+ 棋盘滑动手势（阈值 24px，`touchstart/touchend` 判定）+ 操作栏十字方向按钮（`pointerdown` 触发一步，长按连走非必须）。

**关卡三档**：1-20 入门 / 21-40 进阶 / 41-60 挑战，仅影响选关分组与胶囊文案。

## 界面原型

```text
┌──────────────────────────────────────┐
│ SOKOBAN                 入门 · 第 3 关│
│              推 箱 子                 │
├──────────────────────────────────────┤
│  [步数 24] [推数 7] [本关最少 18]     │
│  ┌──────────────────────┐            │
│  │ ██████████           │            │
│  │ █  .  $  @  █        │            │  ← 墙/目标/箱/人
│  │ █  $     .  █        │            │
│  │ ██████████           │            │
│  └──────────────────────┘            │
│         [↑]                          │
│      [←][↓][→]   ← 屏幕方向键        │
│  [撤销] [重开] [选关]                │
└──────────────────────────────────────┘
过关弹窗：本关步数/推数 + (新纪录！) + [下一关][重打]；
选关弹窗：三档分组网格，未解锁置灰；页脚一行"关卡：Microban © David W. Skinner"。
异常态：存储不可用时纪录显示"-"仍可玩。
```

## 交互与异常

- 无效移动（撞墙/推不动）轻微晃动反馈，不计数。
- 撤销栈无上限（关卡移动数有限）；重开清栈清计数。
- 滑动手势与方向键共用同一 `move(dir)` 入口；`touch-action: none` 仅作用于棋盘。
- 存储读写 try/catch 静默降级。
