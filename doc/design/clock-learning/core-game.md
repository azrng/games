---
doc_id: DES-CL001
doc_type: design
module: clock-learning
status: approved
last_updated: 2026-10-10
related:
  - doc/requirements/clock-learning/core-game.md
---

# 时钟认知 · 核心玩法设计（DES-CL001）

## 需求追溯

- 关联 REQ-CL001，覆盖其全部「本次覆盖」范围（12 关三档位、认/拨混合题型、拖拽+微调拨针、星级与存档、关卡选择与重开）。
- 无裁剪项；「本次不覆盖」内容（音效、24 小时制、错题本等）未实现。
- 档位表、容差表、星级规则直接取自 REQ-CL001「关键业务对象」，落地以 `src/clock-learning/script.js` 为准。

## 技术设计

### 模块职责与数据流

```text
questionSeed(level, i) ─▶ generateQuestion(level, seed) ─▶ state.question
   认时间题：angleFromTime ─▶ SVG 指针 rotate ─▶ 点选选项 ─▶ settleAnswer
   拨时间题：初始错开位 ─▶ 拖拽(atan2)/微调按钮 ─▶ dialHourAngle/dialMinuteAngle
        └▶ 确定 ─▶ validateDialAngles（容差表） ─▶ settleAnswer
settleAnswer ─▶ 首答计数 ─▶ 8 题完成 ─▶ starRating ─▶ saveStars/saveUnlockedLevel ─▶ 结算 overlay
```

- `script.js`：IIFE + `'use strict'`，逻辑与纯函数同文件，`window.ClockApi` 暴露纯函数供 smoke 测试（vm 沙箱 + Map 桩 localStorage）。
- `index.html`：静态骨架含 SVG 钟面（表盘圆、刻度/数字空组、时针/分针组、中心圆点）；`style.css` 自包含 `--ck-*` 主题。

### 纯函数 API（window.ClockApi）

| 函数 | 说明 |
| --- | --- |
| `angleFromTime(hour12, minute)` | 时刻 → `{ hourAngle, minuteAngle }`；12 点按 0°，时针叠加分钟偏移（每分钟 0.5°） |
| `timeFromAngles(hourAngle, minuteAngle)` | 角度 → 时刻，就近取整；分针角先吸附最近 5 分钟刻度（30°），时针角扣除分钟偏移后取整小时，0 位返回 12 |
| `generateQuestion(level, seed)` | 返回 `{ type, hour, minute, options }`；题型由种子奇偶决定，干扰项同档位合法时间、Fisher-Yates 洗牌 |
| `validateDial(hour, minute, target, level)` | 时刻口径拨针校验，内部委托 `validateDialAngles` |
| `validateDialAngles(hourAngle, minuteAngle, target, level)` | 角度口径校验（确认按钮实际路径），容差按档位表，跨 0° 取最短弧 |
| `starRating(correct, total)` | 全对 3 星、≥75% 2 星、其余 1 星 |
| `levelConfig(level)` / `levelCount()` | 档位、分钟值域、时针范围；共 12 关 |
| `questionSeed(level, index)` | `BASE_SEED + level*4099 + index*101`（两系数为奇数，种子奇偶随题号交替） |
| `formatTime / wrap360 / angleDiff / createSeededRandom` | 标签格式化、角度归一化、最短弧差、mulberry32 种子随机 |
| `loadUnlockedLevel / saveUnlockedLevel / loadStars / saveStars` | 存档；unlocked 只增不减、stars 保留最大值；try/catch + 内存对象兜底 |

### 关键技术决策

1. **题型组织采用「关卡内混合」而非顶部按钮切换**：种子奇偶随题号交替（`questionSeed` 两个乘数均为奇数），每关认/拨天然各 4 题；切换题型无需跨模式保持题目进度的额外状态，实现与测试最简（REQ-CL001 已确认记录）。
2. **指针旋转用 SVG `transform="rotate(a 100 100)"` 属性而非 CSS transform**：围绕钟心旋转不依赖 `transform-origin`/`transform-box` 兼容性，且 `setAttribute` 在测试桩中易于模拟。
3. **拖拽选针规则**：`pointerdown` 时按触点相对钟心半径判断——<34% 抓时针（时针短、靠近轴心），否则取与两针当前角度的最短弧差更近者（角距相同优先分针）；`atan2(dx, -dy)` 以 12 点方向为 0°。钟面 `touch-action: none` 防止拖拽时页面滚动，配合 `setPointerCapture`（不支持时静默降级到 window 级 move 监听）。
4. **容差校验走原始角度**：拨题状态保存连续角度（拖拽不平滑吸附，保持儿童操作的直观反馈），「确定」时用 `validateDialAngles` 按档位容差判定，容差真实生效；`validateDial` 时刻口径委托同一实现供测试。整点档分针容差规格未约定，取 ±15°（五分钟步进下等价于必须指在 12 点）。
5. **拨题初始位置强制错开答案**：时针 +1 小时（≥30° 差）、分针 +30 分钟（180° 差），均超出全部档位容差，不可能开局即命中。
6. **干扰项同档位合法**：候选时间从当前关的时针范围与分钟值域中抽取，Set 去重保证 4 选项互异；tier 3 值域排除 0/30，避免与前八关重复。
7. **存档兜底**：所有 localStorage 读写包 try/catch，失败落到模块内内存对象；`loadUnlockedLevel` 收敛到 `[1, 12]`。

### 界面原型

认时间题（主界面 · 默认态）与拨时间题（同布局切换态）：

```text
┌──────────────────────────────┐        ┌──────────────────────────────┐
│ [返回]  CLOCK LEARNING        │        │ [返回]  CLOCK LEARNING        │
│         时钟认知    〔第 3 关〕│        │         时钟认知    〔第 3 关〕│
│ ┌───────────┐ ┌───────────┐ │        │ ┌───────────┐ ┌───────────┐ │
│ │题目  3 / 8│ │首答正确 2 题│ │        │ │题目  4 / 8│ │首答正确 2 题│ │
│ └───────────┘ └───────────┘ │        │ └───────────┘ └───────────┘ │
│           〔认时间〕          │        │           〔拨时间〕          │
│   仔细看钟面，现在是几点？      │        │      请拨出 3:30             │
│         ┌─────────┐          │        │         ┌─────────┐          │
│         │ SVG 钟面 │          │        │         │ SVG 钟面 │          │
│         │(指针就位)│          │        │         │(可拖拽)  │          │
│         └─────────┘          │        │         └─────────┘          │
│                              │        │  ┌───────────┬───────────┐  │
│   ┌─────────┐  ┌─────────┐  │        │  │时针 −1 ＋1 │分针 −5 ＋5 │  │
│   │  3:00   │  │  4:00   │  │        │  └───────────┴───────────┘  │
│   ├─────────┤  ├─────────┤  │        │       〔确定〕                │
│   │  5:00   │  │  9:00   │  │        │  拖动指针或用按钮微调…        │
│   └─────────┘  └─────────┘  │        │                              │
│   答对 → ✅+⭐动效 / 答错 →    │        │                              │
│   选项抖动 +「再试一次」        │        │                              │
│  〔重开本关〕  〔关卡选择〕      │        │  〔重开本关〕〔关卡选择〕     │
└──────────────────────────────┘        └──────────────────────────────┘
```

结算弹窗（overlay，主要状态：星级 / 首答正确数 / 下一关可见性）：

```text
┌──────────────────────────────┐
│  （半透明遮罩 + 底部弹卡）       │
│  ┌──────────────────────────┐ │
│  │       LEVEL CLEAR         │ │
│  │       闯关成功！            │ │
│  │        ★ ★ ☆              │ │   ← starRating(6, 8) = 2 星
│  │  ┌────────────────────┐  │ │
│  │  │ 首答正确     6 / 8   │  │ │
│  │  └────────────────────┘  │ │
│  │ 〔再玩一次〕  〔下一关〕     │ │   ← 第 12 关完成时隐藏「下一关」
│  └──────────────────────────┘ │
└──────────────────────────────┘
```

状态说明：无 loading 态（纯静态同步渲染）；错误态仅两种轻反馈——认时间答错选项抖动、拨时间答错面板抖动，均不锁死流程；关卡选择弹窗中未解锁关卡置灰（「未解锁」文案）。

### 交互与异常

#### 操作流程

1. 加载 → `buildClockFace()` 生成 60 根刻度与 12 个数字 → `startLevel(loadUnlockedLevel())`。
2. 每题按 `questionSeed(level, 题号)` 生成；认时间摆指针 + 渲染 4 选项，拨时间初始化错开位并显示微调面板。
3. 认时间：点选项 → 对/错反馈 → 答对 950ms 后自动进入下一题。
4. 拨时间：拖拽（pointerdown/move/up，角度连续更新）或微调按钮（±30° 步进）→ 「确定」→ 容差校验 → 同上反馈。
5. 第 8 题答对 → 结算弹窗（星级、存档、解锁）；弹窗按钮或底部「重开本关 / 关卡选择」继续。

#### 边界表

| 场景 | 处理 |
| --- | --- |
| localStorage 不可用 / 取值非法 | try/catch + 内存兜底；非法读值回落默认（解锁 1 关、0 星） |
| 拨题初始位 = 答案 | 不可能出现：初始位强制时针 +1 小时、分针 +30 分钟（超出全部容差） |
| 拖拽中 pointercancel / 指针丢失 | `dragHand` 清空，保留当前角度，可改用微调按钮 |
| `setPointerCapture` 不支持 | 静默降级，window 级 pointermove/up 仍可拖拽 |
| 第 12 关完成 | `saveUnlockedLevel` 收敛到 12，结算弹窗隐藏「下一关」 |
| 答题中途重开 / 换关 | `startLevel` 重置题号、首答计数与弹窗状态 |
| 分钟角落在刻度边界（如 345°） | `timeFromAngles` 按 5 分钟刻度就近吸附：偏后区间归入下一整点（11:55 侧 → 12:00），精确值不变 |

#### 验证方式

1. smoke 测试（`node src/clock-learning/smoke.test.js`，node + vm + assert，localStorage 用 Map 桩）：
   - 场景 A（文件与目录约定）：viewport/标题/脚本顺序/返回脚本、`--ck-` 前缀、`touch-action: none`、返回按钮避让样式、`games.js` 目录注册断言。
   - 场景 B（角度往返）：整点/半点/五分钟全样本（12×20）往返一致 + 12→0、11:55 精确保留、55 分区间偏后归 12:00 边界。
   - 场景 C（出题与校验）：12 关 × 8 题值域、选项互异含正确项、干扰项同档位、同种子可复现、认/拨各 4 题；`validateDial`/`validateDialAngles` 三档容差边界与跨 0° 最短弧。
   - 场景 D（星级与存档）：星级边界 8/7/6/5/0、档位递进、unlocked 只增不减、stars 保留最大值、全新进度默认值。
2. 浏览器手工 smoke：认/拨题型交替、拖拽跟手且页面不滚动、微调按钮步进正确、✅+星星动效、关卡选择/重开/结算弹窗流转、390px 视口布局与返回按钮避让。
