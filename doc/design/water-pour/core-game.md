---
doc_id: DES-WP001
doc_type: design
module: water-pour
status: approved
last_updated: 2026-10-10
related:
  - doc/requirements/water-pour/core-game.md
---

# 倒水谜题 · 核心玩法（DES-WP001）

## 需求追溯

- 关联 REQ-WP001，覆盖其全部「本次覆盖」范围，无未覆盖项。
- 实现基准沿用同批新游戏编程小机器人（DES-CR001 所落的目录结构与 vm 沙箱测试模式），并参照模板游戏点灯的 IIFE + 纯函数挂 `window.<Api>` 写法。

## 技术设计

### 模块职责与数据流

```text
LEVELS 关卡表            script.js 纯函数层                        UI 层
caps/target ──▶ levelConfig() ──▶ bfsSolve() 求最优步数 ──▶ 状态栏 / 目标横幅
                     │
玩家动作 ──▶ pour()/fill()/empty() 返回新状态 ──▶ updateCupsView() 水位动画
                     │                                   │
                     └──▶ isSolved() ──▶ 过关 ──▶ starRating() + 存档 ──▶ 过关 overlay
```

- `src/water-pour/script.js`（IIFE + `'use strict'`）分两层：
  - **纯函数层**（不碰 DOM，全部挂 `window.WaterApi` 供测试）：`levelConfig/levelCount/createInitialState/isSolved/pour/fill/empty/applyAction/actionsOf/bfsSolve/bfsSolveFrom/starRating` 与存档读写 `loadUnlockedLevel/saveUnlockedLevel/loadStars/saveStars/loadBest/saveBest`。
  - **UI 层**：`state` 单一可变对象（level/caps/target/cups/steps/minSteps/history/selected/hintsLeft/locked），`renderCups/updateCupsView/updateHud/updateControls` 渲染，`performAction` 统一动作入口。
- `src/water-pour/style.css`：自包含，`:root` 全部 `--wp-` 前缀；水色清新主题（浅蓝渐变底 + 白卡片 + 蓝水位条）。
- 关卡数据：15 个 `{ caps, target }` 手工内置（表见 REQ-WP001）；`levelConfig` 返回容量副本，防止外部污染关卡表。

### 技术决策

1. **BFS 逐层展开 + 首动作回传**：`bfsSolveFrom(startState, caps, target)` 从任意局面出发按层 BFS，节点携带「从起点出发的第一个动作」，命中目标层即返回 `{ minMoves, nextAction }`；`bfsSolve(caps, target)` 是它在全 0 状态的特例（开局最优步数）。无访问集外状态爆炸风险（单关状态空间 ≤ 19×11×8 = 1672）。
2. **提示复用同一 BFS**：提示 = `bfsSolveFrom(当前局面)`，不缓存路径——玩家乱走几步后提示依然正确且最优；由「任意局面先倒光全部杯子即回到全 0」可知目标恒可达，`null` 分支仅防御。
3. **无效动作显式区分**：`pour` 在同杯 / 源空 / 目标满 / 越界时返回**原状态引用**，`performAction` 据此判断「未发生变化」→ 不推撤销栈、不计步数、只给文案；有效动作才推 `{ cups, steps }` 快照进撤销栈，撤销时状态与步数一并回退（REQ「撤销不惩罚」）。
4. **星级边界对齐编程小机器人**：`≤最优 3 星、≤最优+3 2 星、通关 1 星`；`starRating(moves, optimal)` 为纯函数，测试覆盖 +0/+1/+3/+4 四个边界。
5. **存档防脏写**：`saveUnlockedLevel` 收敛 1~15 且只增不减；`saveStars` 保留最大；`saveBest` 保留最小；读取端 `Number.parseInt` + 范围校验，非法回默认值；localStorage 全程 try/catch，异常退内存 `memoryFallback`（沿用点灯模板兜底模式）。
6. **杯子用 `<button>` 而非 div**：天然获得键盘焦点与回车触发，触控目标 ≥ 84px 宽；水位条是杯身内绝对定位的 `span`，高度按 `水量/容量` 百分比过渡（`transition: height 440ms`）。

### 过关与提示的时序

- 过关：动作生效 → `state.locked = true`（输入全禁用）→ 等 `WATER_ANIM_MS + 120ms` 水位动画播完 → `showWinModal()`（评星 → 存档 → overlay 弹出）。`startLevel` 会取消未触发的 win 定时器，避免重开后弹窗误现。
- 提示：高亮维持 `HINT_VISIBLE_MS = 2200ms` 后自动清除；展示期间再点提示不消耗次数；换关 / 撤销 / 点杯子均先清高亮。

## 界面原型

主界面（2 杯关，杯 1 已选中）：

```text
┌────────────────────────────────────────┐
│ Water Pour                        ┌───────┐
│ 倒水谜题                          │ 第 1 关 │
│ ┌────────┐ ┌────────┐ ┌────────┐  └───────┘
│ │步数 0  │ │最少步 6│ │本关最佳--│
│ └────────┘ └────────┘ └────────┘  │
│         🎯 目标  量出 4L           │
│ ┌──────────────────────────────┐   │
│ │      5L            3L        │   │
│ │    ┌──────┐    ┌────┐        │   │
│ │    │░░░░░░│    │    │        │   │ ← 杯口容量
│ │    │░░水░░│    │    │        │   │
│ │    └──────┘    └────┘        │   │ ← 杯 1 高亮选中
│ │      2L            0L        │   │ ← 杯底当前量
│ └──────────────────────────────┘   │
│   点一个杯子选中它，再点另一个…      │
│ ┌──────────────┐ ┌──────────────┐  │
│ │ 🚰 装满（可用）│ │ 🫗 倒光（可用）│  │ ← 选中后启用
│ └──────────────┘ └──────────────┘  │
│ ┌────────┐ ┌─────────┐ ┌─────────┐ │
│ │ 撤销   │ │ 提示 (3) │ │ 重开本关 │ │
│ └────────┘ └─────────┘ └─────────┘ │
│ ┌────────────────────────────────┐ │
│ │            关卡选择             │ │
│ └────────────────────────────────┘ │
└────────────────────────────────────────┘
```

过关 overlay（星星逐颗弹入）与提示态：

```text
┌─ 过关弹窗 ──────────────────┐   提示态（金色脉冲圈）：
│ Level Clear                 │   ┌────┐      ┌────┐
│ 量出来啦！                   │   │ 5L │ ★★   │ 3L │ ★★  ← 源/目标杯同闪
│ ★ ★ ★   ← 弹入动画          │   └────┘      └────┘
│ 本关步数 6 │ 最少步 6 │ 最佳 6│   「提示：把杯子 1 倒进杯子 2。」
│ [再玩一次]  [下一关]         │   装满/倒光提示时改为高亮对应按钮 + 目标杯
└─────────────────────────────┘
```

状态说明：无 loading（纯本地同步计算）；error 态仅防御性存在（BFS 无解 / 存档损坏均静默兜底，正常玩不到）。

## 交互与异常

### 操作流程

1. 载入 → `startLevel(loadUnlockedLevel())`：求本关最优步数、渲染空杯、更新 HUD。
2. 点杯 A → 选中（高亮 + 状态文案）；再点 A 取消；点杯 B → `performAction({type:'pour', from:A, to:B})`。
3. 「装满 / 倒光」仅在选中杯时启用，作用于选中杯；动作后取消选中。
4. 每次动作后检查 `isSolved` → 过关走锁定 + 延时弹窗时序；否则更新水位动画与状态文案。
5. 撤销 / 提示 / 重开 / 关卡选择按各自规则执行（见技术决策 3 与时序说明）；按钮禁用态由 `updateControls` 统一维护。

### 边界与异常处理

| 场景 | 处理 |
| --- | --- |
| 同杯倒水 / 源杯空 / 目标杯满 | 返回原状态：不计步、不进撤销栈，文案说明原因 |
| 撤销栈为空 | 撤销按钮置灰；过关锁定时全部输入禁用（重开 / 关卡选择在 modal 后不可达，键盘误触也被 `startLevel` 的定时器取消兜住） |
| 提示次数用尽 / 提示展示中 | 按钮置灰 / 不叠加消耗 |
| 非法关次（越界 / 非数） | `startLevel` 收敛 1~15；`levelConfig` 抛错防御 |
| localStorage 不可用 / 值损坏 | try/catch 退内存；读取校验非法回默认，不崩溃 |
| 最后一关通关 | 「下一关」按钮文案变「选择关卡」，点击打开关卡弹窗 |
| 窗口 ≤360px | 杯距收窄、页边距减为 10px，杯宽 `clamp` 下限 84px 保证可点 |

### 验证方式

1. `node src/water-pour/smoke.test.js`（node + vm + assert，localStorage 用 Map 桩，DOM 用通用桩对象），已实现并跑通：
   - 场景 A（文件与目录约定）：viewport / 返回脚本 / 标题 / 杯子区与动作按钮 id / `--wp-` 前缀 / `window.WaterApi` / 目录注册 `slug` 与 `mobilePath`。
   - 场景 B（15 关有解性）：每关 `bfsSolve` 有解、`nextAction` 类型与下标合法且作用于初始状态有真实变化；沿提示链走到过关步数 === minMoves；开局 HUD「最少步」与 BFS 一致。
   - 场景 C（暴力对拍）：测试内独立重写动作规则，枚举全部水量组合用松弛法求最短路，5 个 2 杯关 + 1 个 3 杯关最小步数与 BFS 一致，无解组合（`[4,6]→5`）双方一致判 null。
   - 场景 D（纯函数边界）：pour 同杯 / 源空 / 目标满 / 越界原样返回、正常倒入转移 `min(源量, 余量)`；fill/empty 及越界；isSolved 恰等 vs 超过。
   - 场景 E（星级与存档）：星级 +0/+1/+3/+4 边界；unlocked 只增不减且封顶 15；stars 保留最大；best 保留最小；默认值兜底。
2. 浏览器人工 smoke（关键链路）：选杯倒水动画、装满 / 倒光、撤销步数回退、提示高亮与次数递减、过关评星与解锁、关卡弹窗锁头。
