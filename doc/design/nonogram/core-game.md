---
doc_id: DES-NG001
doc_type: design
module: nonogram
status: approved
last_updated: 2026-10-10
related:
  - doc/requirements/nonogram/core-game.md
---

# 数织 · 技术设计（DES-NG001）

## 需求追溯

实现 REQ-NG001 全部验收标准；无契约文档。

## 技术设计

**文件结构**：`src/nonogram/` 四件套（DOM 棋盘，对齐 `src/lights-out/` 惯例：种子生成 + 必有解门控同构复用）。

**script.js 架构**：
- IIFE + 首行 `// @ts-check` + 全中文注释；常量：`SLUG = "nonogram"`、存档键 `nonogram-unlocked-level` / `nonogram-current-level` / `nonogram-best-<level>` / `nonogram-stars-<level>`、规格映射 `level ≤ 8 → 5、≤ 20 → 10、其余 → 15`。
- 生成与求解（纯函数，挂 `window.Nonogram` 导出）：
  - `mulberry32(seed)`：随机源（对齐 lights-out 写法）；`levelSeed(level) = (BASE_SEED + level * 7919) >>> 0`。
  - `generateSolution(size, rand)`：随机底图，密度 0.62 起；棋盘连通性无硬性要求。
  - `computeClues(solution)`：按行/列算连续段长度数组（空行/列为 `[0]`）。
  - `lineSolve(clues, size)`：单行/列 DP 推理——对一条线由提示算出"必填格/必空格"集合；迭代对所有行列传播直到稳定。
  - `solveUnique(clues)`：`lineSolve` 传播后全部格确定且与底图一致 → 唯一解；矛盾 → 无解；有未定格 → 不唯一。
  - `generateLevel(level)`：从 `levelSeed(level)` 起派生种子逐个尝试 `generateSolution + solveUnique`，2000 次预算内未过则密度 -0.02 重试（密度下限 0.5）；返回 `{ size, solution, clues }`，同关确定性可复现。
- 游戏状态：`cells`（格四态数组）、`lockedCount`（提示锁定数）、`undoStack`（操作快照，上限 200）、`hintsLeft`（3）、计时器。
- 判胜：每次操作后逐行/列重算当前填格段序列与提示组比对，全满足即胜（与底图一致性由唯一解保证）。
- 提示：随机取"当前非填态且底图为真"的格置为锁定填态，`hintsLeft--`；触发判胜检查。
- 渲染：CSS Grid；行提示列 + 列提示行 + 中央格阵三块；提示组满足时整组 `done` 类变灰；叉态显示淡色 ×。

## 界面原型

```text
┌────────────────────────────────────────┐
│ NONOGRAM                10×10 · 第 9 关 │
│                数 织                   │
├────────────────────────────────────────┤
│ [用时 01:23] [提示×3] [最快 00:58]      │
│      │ 2 │ 1 1 │ 3 │ …  ← 列提示行      │
│  ┌───┼───┬─────┬───┬───┐               │
│  │ 3 │ ■ │ ■ │   │   │               │
│  │1 1│   │ ■ │ × │   │               │  ← 行提示列 + 格阵
│  │ 2 │   │   │   │   │               │
│  └───┴───┴─────┴───┴───┘               │
│  点按三态：空→填→叉；右键/长按直接标叉    │
│  [撤销] [重开] [提示] [选关]            │
└────────────────────────────────────────┘
完成弹窗：显现底图（彩色像素画）+ 星级 + 用时 + (最快纪录！) + [下一关][重玩]；
待机态：直接进对局；异常态：存储不可用时纪录显示"-"仍可玩。
```

## 交互与异常

- 棋盘右键 `contextmenu` preventDefault；移动端长按 350ms 标叉（`touchstart/touchend` 计时，触发后抑制随后的点按切换）。
- 15×15 在 360px 宽下格子约 20px，允许横向滚动棋盘容器而非缩放过小。
- 撤销含提示操作；重开恢复初始（提示次数重置为 3，本关已用提示不影响重开）。
- 存储读写 try/catch 静默降级。
