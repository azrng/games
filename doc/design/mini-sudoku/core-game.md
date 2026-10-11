---
doc_id: DES-SD001
doc_type: design
module: mini-sudoku
status: approved
last_updated: 2026-10-10
related:
  - doc/requirements/mini-sudoku/core-game.md
---

# 儿童数独 · 核心玩法设计（DES-SD001）

## 需求追溯

- 关联 REQ-SD001，覆盖其全部「本次覆盖」范围（12 关两档棋盘、种子唯一解生成、纯点击填写、冲突软校验、星级与存档、关卡选择/重开/清空）。
- 无裁剪项；「本次不覆盖」内容（键盘输入、音效、答案提示等）未实现。
- 档位表、生成规则、星级规则直接取自 REQ-SD001「关键业务对象」，落地以 `src/mini-sudoku/script.js` 为准。

## 技术设计

### 模块职责与数据流

```text
levelSeed(level) ─▶ generatePuzzle(level, seed) ─▶ { givens, solution, size }
   ├─ generateFullSolution（回溯 + MRV + 种子随机候选）─▶ 完整解
   └─ 挖洞：随机顺序逐格置 0 ─▶ countSolutions(limit 2) === 1 ? 保留 : 回填该格
点空格 ─▶ selectedIndex 选中高亮 ─▶ 点图案盘 ─▶ candidatesFor 判定
   ├─ 候选含该值：填入（可覆盖）
   └─ 候选不含：填入 + mistakes+1 + 红闪（软校验，不阻止）
每次变更 ─▶ conflictCells 实时高亮 ─▶ 填满且无冲突 ─▶ starRating ─▶ saveStars/saveUnlockedLevel ─▶ 过关 overlay
```

- `script.js`：IIFE + `'use strict'`，逻辑与纯函数同文件，`window.SudokuApi` 暴露纯函数供 smoke 测试（vm 沙箱 + Map 桩 localStorage）。
- `index.html`：静态骨架（棋盘容器、图案盘容器、两个 overlay 弹窗），棋盘与图案盘由 JS 按关卡尺寸重建；`style.css` 自包含 `--sd-*` 主题。

### 纯函数 API（window.SudokuApi）

| 函数 | 说明 |
| --- | --- |
| `levelConfig(level)` | `{ size, boxRows, boxCols, blanks }`；1-6 关 4×4（2×2 宫）、7-12 关 6×6（2 行 3 列宫），挖空数查内置表 `LEVEL_BLANKS` |
| `levelCount()` | 12 关 |
| `generatePuzzle(level, seed)` | 返回 `{ givens, solution, size, boxRows, boxCols }`；givens 为 `{ index, value }` 数组；整轮挖洞未达目标数时用派生种子（seed + attempt×7919）重试，最多 16 轮 |
| `generateFullSolution(size, boxRows, boxCols, random)` | 回溯生成完整解：每步 MRV 选候选最少空格，取值顺序 Fisher-Yates 打乱 |
| `countSolutions(grid, size, boxRows, boxCols, limit)` | 解数计数：入口先整体查一次给定冲突（冲突盘直接 0 解），随后 MRV 回溯，数到 limit 剪枝 |
| `conflictCells(grid, size, boxRows, boxCols)` | 行/列/宫分组扫描，值出现 ≥2 次的格子全部标记，返回升序索引数组；0 为空格不参与 |
| `candidatesFor(grid, size, boxRows, boxCols, index)` | 单格候选值（剔除同行/列/宫已出现值），同时服务生成、解数与填错判定 |
| `validateGrid(grid, size, boxRows, boxCols)` | 完整解校验：长度、值域、无冲突 |
| `starRating(mistakes)` | 0 次 3 星、≤3 次 2 星、其余 1 星 |
| `boxIndexOf(index, size, boxRows, boxCols)` | 格子所在宫编号（先行后列） |
| `EMOJIS` | `{ 4: 动物 ×4, 6: 水果 ×6 }` |
| `createSeededRandom / shuffleValues / levelSeed` | mulberry32 种子随机、Fisher-Yates 洗牌、关卡种子（BASE_SEED + level×6271） |
| `loadUnlockedLevel / saveUnlockedLevel / loadStars / saveStars` | 存档；unlocked 只增不减、stars 保留最大值；try/catch + 内存对象兜底 |

### 关键技术决策

1. **生成走「回溯完整解 + 逐格挖洞验唯一」而非先挖后补**：完整解天然合法，挖洞每步用 `countSolutions(limit 2)` 保证唯一解，不唯一回填该格继续尝试其余格子（贪心挖洞 + 单格回退）；极小概率一轮挖不满目标数时，用派生种子整轮重来，保证 `givens.length === 总格数 - blanks` 恒成立。
2. **MRV（最少候选优先）保证 6×6 性能**：完整解生成与解数计数都在每步挑选候选最少的空格展开，候选为 0 立即回溯、唯一候选直接落子；实测 24 次生成（12 关 × 2 种子，含 6×6 挖 14 空）约 130ms，远低于 20 秒上限。
3. **`countSolutions` 入口先查给定冲突**：只靠回溯填空无法发现「盘已满但给定互冲」的伪解（此时会误计 1 解）；入口调用一次 `conflictCells` 直接判 0，语义正确且成本可忽略。
4. **填错判定复用 `candidatesFor`**：填入前取该格候选，目标值不在候选中即与同行/列/宫重复 → 计一次填错并红闪；软校验不阻止填写，玩家可继续覆盖；同值重复填入视为无操作不计数。
5. **冲突高亮全部标红**：按 REQ 语义，重复组内所有格子（含先填的那个）都标冲突，`conflictCells` 返回集合后一次性刷到 DOM，修正后自动消除。
6. **宫分隔线用单元格边框**：棋盘为无间隙 CSS Grid，`box-right/box-bottom` 类在每宫末列/末行画 3px 粗线，末行末列改画 0 宽收边；无需额外伪元素，尺寸随 `grid-template-columns` 自适应。
7. **存档兜底**：所有 localStorage 读写包 try/catch，失败落到模块内内存对象；`loadUnlockedLevel` 收敛到 `[1, 12]`。

### 界面原型

主界面（4×4 填写中：空格 A 选中、一处列冲突标红）：

```text
┌──────────────────────────────┐
│ [返回]  MINI SUDOKU           │
│         儿童数独    〔第 2 关〕 │
│  ┌───────────┐ ┌───────────┐ │
│  │ 填错     1 │ │剩余空格  5 │ │
│  └───────────┘ └───────────┘ │
│        ┌──────────────┐      │
│        │ 🐱 │ 🐶 ┃ 🐰 │      │   ← 提示格浅灰底
│        │────┼────┼────│      │
│        │ 🦊 │ ▢  ┃ 🐱 │      │   ← 选中格黄底绿框
│        │════╪════╪════│      │   ← 宫分隔粗线
│        │ 🐰 │ 🐱!┃ 🐶 │      │   ← 🐱 与首列 🐱 列冲突，红底红框
│        │────┼────┼────│      │
│        │ 🐶 │ 🐰 ┃ 🦊 │      │
│        └──────────────┘      │
│    这个图案重复啦，再想想！      │   ← 软校验文案（红）
│   ┌──────┐ ┌──────┐          │
│   │  🐱  │ │  🐶  │ …        │   ← 底部图案盘（点选填入）
│   └──────┘ └──────┘          │
│ 〔清空重来〕〔重开本关〕〔关卡选择〕│
└──────────────────────────────┘
```

过关 overlay（星星逐颗弹出）与关卡选择弹窗：

```text
┌──────────────────────────────┐    ┌──────────────────────────────┐
│  （半透明遮罩 + 底部弹卡）        │    │  （半透明遮罩 + 底部弹卡）        │
│  ┌────────────────────────┐  │    │  ┌────────────────────────┐  │
│  │      LEVEL CLEAR        │  │    │  │        Levels           │  │
│  │       拼好啦！            │  │    │  │       选择关卡           │  │
│  │      ★ ★ ☆（弹出动画）    │  │    │  │  ┌────┐ ┌────┐ ┌────┐  │  │
│  │  ┌────────────────────┐ │  │    │  │ │ 1  │ │ 2  │ │ 3  │  │  │
│  │  │ 填错次数      0 次    │ │  │    │  │ │★★☆│ │ ☆☆☆│ │未解锁│  │  │
│  │  └────────────────────┘ │  │    │  │  └────┘ └────┘ └────┘  │  │
│  │ 〔再玩一次〕  〔下一关〕    │  │    │  │ …（未解锁置灰，当前关高亮）  │  │
│  └────────────────────────┘  │    │  │      〔返回游戏〕          │  │
│  第 12 关完成时隐藏「下一关」      │    │  └────────────────────────┘  │
└──────────────────────────────┘    └──────────────────────────────┘
```

状态说明：无 loading 态（生成同步完成，实测毫秒级）；错误态仅有冲突红闪 + 文案提示（软校验，不锁死）；过关后棋盘绿色波浪庆祝动画，随后弹结算。

### 交互与异常

#### 操作流程

1. 加载 → `startLevel(loadUnlockedLevel())`：按关卡种子生成棋盘，渲染格子（含宫分隔线）与图案盘。
2. 点空格 → 选中高亮（再点一次取消）；点提示格 → 文案提示不选中。
3. 点图案盘 → 填入选中格；若与同行/列/宫重复：填错 +1、目标格红闪、冲突组持续标红；填满且无冲突 → 620ms 后弹过关结算（星级动画、存档、解锁）。
4. 「清空重来」清掉全部玩家填入并归零填错；「重开本关」按同一种子重建同一布局；「关卡选择」弹窗内点已解锁关卡直达。

#### 边界表

| 场景 | 处理 |
| --- | --- |
| localStorage 不可用 / 取值非法 | try/catch + 内存兜底；非法读值回落默认（解锁 1 关、0 星） |
| 未选中空格点图案盘 | 提示「先点一个空格，再选图案吧！」，不计填错 |
| 点提示格 / 对提示格填图案 | 提示「提示格不能修改哦。」 |
| 填入与盘面同值 | 视为无操作，不重复计数 |
| 填入重复图案 | 软校验：计入填错 + 红闪 + 持续冲突标红，不阻止继续填写 |
| 第 12 关完成 | `saveUnlockedLevel` 收敛到 12，结算弹窗隐藏「下一关」 |
| 过关瞬间点格子/图案盘 | `locked` 状态拦截全部棋盘交互 |
| 一轮挖洞未达目标数 | 派生种子整轮重来（最多 16 轮），givens 数量恒等于目标 |

#### 验证方式

1. smoke 测试（`node src/mini-sudoku/smoke.test.js`，node + vm + assert，localStorage 用 Map 桩）：
   - 场景 A（文件与目录约定）：viewport/标题/脚本顺序/返回脚本、`--sd-` 前缀、返回按钮避让样式、`games.js` 目录注册断言。
   - 场景 B（唯一解生成）：12 关 × 2 种子，givens 全部来自 solution、提示盘 `countSolutions === 1`、solution 通过 `validateGrid`、同种子可复现、总耗时 < 20 秒。
   - 场景 C（求解与校验）：手工完整解通过、冲突盘 0 解、不完整盘不通过、空盘解数按上限剪枝、`boxIndexOf` 宫编号。
   - 场景 D（冲突判定）：4×4 与 6×6 的行/列/宫冲突样例冲突格集合正确、无冲突返回空、生成的完整解无冲突。
   - 场景 E（档位与存档）：4×4→6×6 档位与宫形、挖空数端点与档位内单调不减、图案表数量与互异、星级边界、unlocked 只增不减、stars 保留最大值、全新进度默认值。
2. 浏览器手工 smoke：点选与填入流转、冲突红闪与实时高亮、过关星星动画、关卡选择/重开/清空、390px 视口布局与返回按钮避让。
