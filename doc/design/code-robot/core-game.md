---
doc_id: DES-CR001
doc_type: design
module: code-robot
status: approved
last_updated: 2026-10-10
related:
  - doc/requirements/code-robot/core-game.md
---

# 编程小机器人 · 核心玩法（DES-CR001）

## 需求追溯

- 关联 REQ-CR001，覆盖其全部「本次覆盖」范围；「本次不覆盖」项（音效、关卡编辑器、拖拽排序）未实现。
- 落地文件：`src/code-robot/{index.html, style.css, script.js, smoke.test.js}`；目录注册已存在于 `src/data/games.js`（slug `code-robot`，mobilePath 与 path 同值）。

## 技术设计

### 模块职责与数据流

```text
LEVELS（字符画关卡数据） ──▶ parseLevel() ──▶ 纯数据 {size,walls,start,facing,goal,gems,par}
                              │                    │
                              ▼                    ▼
                    renderBoard() 渲染格子    createRunState()/stepRobot() 纯单步
                              │                    │
                              ▼                    ▼
                    robot-sprite CSS 位移   simulateProgram() 整段模拟（smoke 测试）
                              ▲                    ▲
                              │                    │
                    runProgram() 400ms 步进循环 ──┘（UI 复用同一 stepRobot，零重复逻辑）
```

- `script.js` 为 IIFE + 'use strict'，风格对齐 `src/lights-out/script.js`；纯函数与常量挂 `window.RobotApi`（levelCount / getLevel / parseLevel / cellIndex / turnLeft / turnRight / createRunState / stepRobot / simulateProgram / starRating / maxProgramLength / 存档函数）。
- 坐标系：`row` 自上而下、`col` 自左而右；朝向 `U/R/D/L` 按顺时针排列，左右转取相邻项（`(i±1) mod 4`），格子下标 `row*size+col`。
- 朝向与指令语义：`F` 沿朝向前进一格，`L/R` 原地转向；前进目标越界或为墙 → 崩溃；落到宝石格记录收集；到达终点且 `collected.length === gems.length` → 过关并提前终止程序。
- `simulateProgram(level, program)` 接受关卡序号，内部 `parseLevel`；程序统一转大写并按 `maxProgramLength = par + 4` 截断；`crashAt` 为崩溃指令序号（1 起），0 表示未崩溃。
- 存档沿用模板模式：`safeGetItem/safeSetItem` 包 try/catch，异常降级到内存对象；`saveUnlockedLevel` 只增不减并钳制到 1-12，`saveStars` 只保留最大值（0-3）。

### 技术决策

1. **UI 与测试共用 stepRobot 单步纯函数**：`runProgram()` 的 400ms 步进循环与 `simulateProgram()` 走同一套逻辑，避免两份实现漂移；测试对纯函数断言即等价于对运行行为断言。
2. **宝石收集只对宝石格生效**：`stepRobot` 中 `parsed.gems.includes(index)` 判定后才记录收集，普通格子不进 `collected`（开发中实测修正：初版把所有走过的格子都计入导致误判）。
3. **机器人动画用双层结构**：外层 `.robot-sprite` 承担 `translate(col*100%, row*100%)`（百分比相对自身尺寸，天然对齐格子），transition 400ms；内层 `.robot-heading` 承担朝向箭头 `rotate`，机器人 emoji 始终直立不翻转，儿童观感更好。
4. **棋盘不用 gap**：网格 `grid-template-columns/rows: repeat(n, minmax(0,1fr))` 且无 gap，格子内用 3px padding 制造视觉间距，保证机器人百分比位移与格子严格对齐。
5. **关卡为手工数据而非种子生成**：12 关各自带 `referenceProgram`，par 即参考解法步数；全部关卡在 smoke 测试中用参考解法回归验证（开发过程中实际修出并修正了 3 处关卡数据错误：L4 终点列偏移、L6 转向过早撞墙、L7 宝石坐标与棋盘尺寸）。
6. **每关起始朝向即关卡的一部分**：`facing` 随关卡定义，机器人图层用顶部小箭头旋转直观表达，避免 🤖 emoji 倒转。

## 界面原型

编辑态（运行前，第 5 关 6×6）：

```text
┌────────────────────────────────────────────┐
│ Code Robot                    ┌──────────┐ │
│ 编程小机器人                   │ 第 5 关  │ │
│ ┌─────────┬─────────┬────────┐          │ │
│ │指令 0/16│ Par 12  │ 最佳 -- │  状态栏  │ │
│ └─────────┴─────────┴────────┘          │ │
│ ┌──────────────────────────────┐         │ │
│ │ 🤖→ ┌───┬───┬───┬───┬───┬───┐ │         │ │
│ │     │ . │ . │🧱│🧱│ . │ . │ │  棋盘    │ │
│ │     ├───┼───┼───┼───┼───┼───┤ │         │ │
│ │     │ . │ . │🧱│🧱│ . │ . │ │         │ │
│ │     ├───┼───┼───┼───┼───┼───┤ │         │ │
│ │     │🤖│ . │🧱│🧱│ . │🏁│ │         │ │
│ │     └───┴───┴───┴───┴───┴───┘ │         │ │
│ └──────────────────────────────┘         │ │
│   点击下方指令块编排程序，然后点「运行」…   │ │
│ 程序序列 [⬆️][⬆️][↰]  （点小卡删除）        │ │
│ ┌────────┐ ┌────────┐ ┌────────┐         │ │
│ │ ⬆️前进 │ │ ↰左转  │ │ ↱右转  │  指令块  │ │
│ └────────┘ └────────┘ └────────┘         │ │
│ [▶ 运行] [清空程序]                         │ │
│ [演示]   [重开本关] [关卡选择]               │ │
└────────────────────────────────────────────┘
```

主要状态：

```text
运行中：当前执行小卡橙色高亮；「运行/指令块」禁用，「■ 停止」出现；
        机器人逐步移动、箭头旋转，宝石收集后缩小淡出。
失败态：机器人变 💥 + 棋盘抖动（is-crash），状态栏提示「第 N 条指令撞到了墙」；
        程序保留，停止后可继续编辑。
过关态：全屏弹窗 ┌──────────────────┐
                │ Level Clear       │
                │ 任务完成！         │
                │ ★★★              │
                │ 指令12 Par12 宝石2 │
                │ [再玩一次][下一关] │
                └──────────────────┘
        第 12 关过关后「下一关」变「选择关卡」。
关卡选择：4 列网格，未解锁显示 🔒 禁用，已解锁显示星级 title，当前关高亮。
```

## 交互与异常

### 操作流程

1. 页面加载 → 读取 `code-robot-unlocked-level` → `startLevel(min(unlocked, 12))`：渲染棋盘、重置程序序列与 HUD。
2. 点指令块（⬆️/↰/↱）→ `appendCommand` 追加小卡并刷新「指令数 n/上限」；点小卡 → `removeCommand` 删除该条。
3. 点「运行」→ 机器人从起点瞬间归位 → 逐步执行：高亮当前小卡 → `stepRobot` 单步 → 400ms 后下一步；胜利则 400ms 后弹过关框（存星级、解锁下一关）。
4. 点「停止」→ `finishRun` 立即中断（runToken 失效防止悬挂回调），程序保留可再编辑。
5. 点「演示」→ 载入本关 referenceProgram 并自动运行；点「重开本关」→ 重新渲染当前关（程序清空）；点「关卡选择」→ 弹窗选择已解锁关卡。

### 边界表

| 场景 | 处理 |
| --- | --- |
| 程序为空点「运行」 | 按钮禁用（disabled），无法触发 |
| 追加超过 par+4 条 | 拒绝追加，状态栏提示「程序最长 N 条指令」 |
| 撞墙 / 出界 | 💥 冒烟 + 棋盘抖动，提示第几条指令出错，程序终止 |
| 宝石未集齐到终点 | 不判过关；执行到程序末尾时按是否停在终点给出不同提示 |
| 运行中乱点 | 指令块/清空/演示/重开/关卡/小卡全部禁用或守卫，仅「停止」可用 |
| 换关 / 重开时正在运行 | runToken 递增使步进回调自失效，定时器清理 |
| localStorage 不可用 | 降级内存存档，单次会话内功能不受影响 |
| 解锁值越界（历史脏数据） | 读取时钳制到 1-12 |

### 验证方式

1. `node src/code-robot/smoke.test.js`（node 原生 assert + vm 沙箱 + Map 桩 localStorage，已通过）：
   - 文件与目录约定：viewport-fit=cover、user-scalable=no、`../js/game-back.js`、`games.js` 中 slug/mobilePath 注册。
   - 12 关 × 参考解法：恰好 par 步通关、宝石集齐、不崩溃；棋盘尺寸/墙/宝石梯度符合规格。
   - 边界：撞墙 crashAt、出界 crashAt、宝石未集齐不算过关、20 条程序按上限截断、过关即提前结束、stepRobot 转向环与崩溃不动。
   - 星级与存档：par/par+1/par+2/par+3 星级边界；unlocked 只增不减并钳制；stars 保留最大值。
2. 浏览器手工 smoke：编辑/运行/停止/失败/过关/关卡选择全流程，375px 视口布局与触控目标尺寸。
