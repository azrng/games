---
doc_id: DES-SP001
doc_type: design
module: shopping-cashier
status: approved
last_updated: 2026-10-11
related:
  - doc/requirements/shopping-cashier/core-game.md
---

# 购物小掌柜 · 核心玩法（DES-SP001）

## 需求追溯

- 关联 REQ-SP001，覆盖其全部「本次覆盖」范围（1-8 项），无未覆盖项。
- 「本次不覆盖」项（音效、多语言、后台配置、真实货币素材、家长报表）均不涉及本设计。
- 档位数值、星级与回退规则、存档键名以 REQ-SP001「关键业务对象」为准；本设计补充实现结构、原型与异常处理。

## 技术设计

### 模块职责与数据流

```text
script.js（IIFE + 'use strict'，挂 window.CashierApi）
├─ 纯函数层（node + vm 可直接测试）
│   levelConfig(level) ──▶ { mode, totalMin, totalMax, qtyMin, qtyMax, tier }
│   denominations(level) ──▶ 全部 6 面额（全关常开）
│   unitPriceCombos(item, config) ──▶ [{ qty, lo, hi }] 可行（数量,单价区间）组合
│   generateOrder(level, seed) ──▶ { item:{emoji,name,unit}, unitPrice, qty, price, customer }
│   orderDue(order) ──▶ order.price（付款阶段目标恒为价签总价）
│   evaluatePayment(selected, due) ──▶ { result: 'exact'|'over'|'short', diff, total }
│   checkChangeInput(raw, expected) ──▶ 'correct'|'more'|'less'|'invalid'
│   computeChange(paid, price) / coinCountSummary / greedyBreakdown（保留工具函数）
│   starRating(mistakes) ──▶ max(0, 3 - mistakes)
│   RUN_RESET_MISTAKES = 4（0 星后再失误 → 本次回第 1 关）
│   loadUnlockedLevel/saveUnlockedLevel、loadStars/saveStars ──▶ 存档（只增不减/保留最大）
└─ UI 层
    startLevel ──▶ renderMoneyButtons + loadOrder(0)
    loadOrder ──▶ 重置 phase='pay' / 找零输入 ──▶ updateOrderView / updateTrayView / updateProgressView
    addNote/removeNote/clearTray ──▶ 付款台面额数组（change 阶段拒绝加钱）
    submitPayment ──▶ exact 成功 | change 模式 over 进入找零阶段 | 其余失误提示
    submitChange ──▶ 答对成功 | 错 1 次方向提示 | 错 2 次亮答案确认通过
    registerMistake ──▶ 失误 +1 ──▶ 达 4 次触发 triggerRunReset（弹窗回第 1 关）
    finishLevel ──▶ saveStars + saveUnlockedLevel ──▶ 结算弹窗（星级/下一关）
```

- 结构沿用 `src/lights-out/` 模式：IIFE 传 `window`/`document`、mulberry32 种子随机、`safeGetItem/safeSetItem` 内存兜底、`vm` 沙箱测试。
- 种子：`levelSeed(level) = (BASE_SEED + level * 6271) >>> 0`，`orderSeed = (levelSeed + orderIndex * 7919) >>> 0`，同关同单号跨会话可复现。
- 商品池分两档：日用品小件 34 条 + 家电数码大件 12 条，条目 `{ emoji, name, unit, minPrice, maxPrice, tier }`。
- 存档键：`shopping-cashier-unlocked-level`、`shopping-cashier-stars-<level>`（STARS_KEY_PREFIX `shopping-cashier-stars-`）。

### 技术决策

1. **订单生成走「数量 × 单价」组合枚举**：先按 `tier` 过滤商品档，再对每个商品枚举 `qty ∈ [qtyMin, qtyMax]` 下能落进总价值域的单价区间（`lo = max(商品下限, ⌈totalMin/qty⌉)`、`hi = min(商品上限, ⌊totalMax/qty⌋)`），随机选中一个组合后抽单价。大件档单价取 10 的倍数（整十定价贴近真实标价且找零好算），区间内无整十数时回退任意整数。
2. **找零改为数值输入而非拼面额**：REQ 定的输入框方案保留心算训练且无组合死锁；`checkChangeInput` 做纯函数判定（空/非负整数校验 → correct/more/less），方向提示与「错 2 次亮答案」构成儿童兜底通路，单订单找零失误上限 2 次。
3. **付款阶段目标恒为价签总价**：`orderDue(order) = order.price`；凑整关 `over/short` 均计失误，找零关 `over` 不算错而是进入找零阶段（多付是合法策略），`short` 计失误。
4. **找零阶段的状态机收敛在 `state.phase`**：`'pay' | 'change'`。进入找零阶段隐藏面额区与「付账」按钮、显示输入面板并聚焦；「清空」可退出找零阶段重付（不计失误）；`addNote/removeNote` 在 change 阶段直接拒绝，防止边找零边加钱的状态歧义。
5. **星级与回退**：`starRating = max(0, 3 - mistakes)`；`registerMistake` 内统一检查 `levelMistakes >= 4`，命中即 `triggerRunReset`——弹结算窗、锁定输入、置 `state.runReset`，「回到第 1 关」按钮消费该标记后 `startLevel(1)`，不触碰解锁与星级存档（REQ 温和版语义）。
6. **面额全关常开**：`denominations(level)` 恒返回全部 6 面额，`renderMoneyButtons` 不再产生 `disabled` 按钮，1 元恒为硬币样式。
7. **通关循环不新增路由**：第 12 关结算后「下一关」按钮文案切换为「从头再玩」，复用同一 `next-btn`；进入页面从最高已解锁关开始。

### 样式要点

- 自包含 CSS，`:root` 全部 `--sc-` 前缀；儿童向暖色明亮主题（奶油底 + 橙色主按钮）。
- 1 元为银色圆形硬币（径向渐变 + 内高光），5/10/20/50/100 元为纸币色块（对角渐变 + 白色内描边，紫/蓝/棕/绿/红贴近真实人民币主色但卡通化）；全关常开、无置灰态。
- 找零输入面板：金色虚线框内横排「商家应退 [大号数字输入框] 元 + 确认按钮」；输入框隐藏数字步进箭头，聚焦描边、亮答案态暖底高亮。
- 单价行 `单价 X 元 × N 个` 为灰色小字，数量为 1 时隐藏；触控目标：面额按钮 ≥ 64px 高（硬币 68px 圆）、付款台标签 44px、动作按钮 48-56px、输入框 56px。
- 移动端 `.game-shell` 顶部 padding 追加 44px 避让悬浮返回按钮（合计 ≥ 56px）。

## 界面原型

主界面 · 凑整付款态（第 6 关，数量订单 + 付错一次后的差额反馈）：

```text
┌────────────────────────────────────────┐
│ [返回]  Shopping Cashier               │
│         购物小掌柜            ┌第 6 关┐ │
│  ● ● ○ ○ ○                    失误 1 次 │
│ ┌────────────────────────────────────┐ │
│ │ (🧒) 我想买「玩偶熊」                │ │
│ │  ┌──────┐   ┌────────┐             │ │
│ │  │  🧸  │   │ 24元   │ ◀─ 总价价签 │ │
│ │  └──────┘   └────────┘             │ │
│ │   单价 12 元 × 2 只  ◀─ 灰色小字    │ │
│ └────────────────────────────────────┘ │
│ ┌─ 付款台 ─────────────────已付 15 元─┐ │
│ │   (5元 × 1)  (10元 × 1)  ◀点标签撤回 │ │
│ └────────────────────────────────────┘ │
│        还差 9 元，调整一下再试试！        │
│ ┌──────┐  ┌──────┐  ┌──────┐          │
│ │(1元) │  │ 5元  │  │ 10元 │          │
│ └──────┘  └──────┘  └──────┘          │
│ ┌──────┐  ┌──────┐  ┌──────┐          │
│ │ 20元 │  │ 50元 │  │100元 │ (全可点)  │
│ └──────┘  └──────┘  └────────┘         │
│ ┌──────────── 付账 ────────────┐       │
│ └──────────────────────────────┘       │
│ ┌─ 清空 ─┐   ┌─ 重开 ─┐  ┌─ 关卡 ─┐    │
│ └────────┘   └────────┘  └────────┘    │
└────────────────────────────────────────┘
```

找零阶段（第 10 关，多付 50 元买了 36 元商品后面额区切换为输入面板）：

```text
│ 价签 36 元；付多了商家会找零  ◀─ 题面提示条 │
│ 付款台 已付 50 元（价签 36 元）            │
│        算算商家该退你多少钱？              │
│ ┌─ 商家应退 ──────────────────────────┐ │
│ │      [ 输入框 ]  元   ┌─ 确认找零 ─┐  │ │
│ └────────────────────────────────────┘ │
│ （面额按钮与「付账」隐藏；清空可退回重付）  │
```

找零答错反馈：第 1 次错提示「退多了/退少了，再算算！」（红 + 抖动）；第 2 次错输入框自动填入正确答案并锁定、按钮变「好的」，提示「应该退 X 元，记住啦！」，确认即通过。

结算弹窗（本关第 5 单完成，星级入档；第 4 次失误时同弹窗变为「失误太多啦 / 回到第 1 关」）：

```text
┌──────────────────────────────┐
│         Level Clear          │
│        第 6 关完成！           │
│           ★ ★ ☆             │
│        本关失误 1 次           │
│  ┌─ 再玩一次 ─┐ ┌─ 下一关 ─┐  │
│  └────────────┘ └───────────┘  │
└──────────────────────────────┘
```

状态说明：反馈区三态——默认引导语（灰）、付错警告（红 + 抖动动画）、付对表扬（绿 + 弹跳动画）；单订单成功弹窗隐藏星级区，仅显示「已完成 n/5 单」；关卡选择弹窗列出 1~最高解锁关，已获星关卡金色描边、当前关橙色高亮。

## 交互与异常

### 操作流程

1. 页面加载 → `startLevel(loadUnlockedLevel())` 渲染首单与全部 6 个面额按钮（全可点）。
2. 点面额按钮 → `selected` 追加 → 付款台金额与张数实时刷新；点付款台面额标签撤回一张；「清空」一键清空（含退出找零阶段）。
3. 点「付账」→ `evaluatePayment(selected, price)`：
   - `exact` → 成功反馈 + 750ms 动画 → 中途单弹「算对了（n/5）」，第 5 单弹结算（星级 + 解锁下一关）。
   - 凑整关 `over`/`short` → 失误 +1、提示「多了/还差 N 元」，可调整后再付。
   - 找零关 `over` → 进入找零阶段（应退金额 = total - price）；`short` → 失误 +1 提示。
4. 找零阶段输入 + 确认（或回车）→ `checkChangeInput`：
   - `correct` → 成交，走成功动画。
   - 第 1 次错 → 失误 +1 + 方向提示；第 2 次错 → 失误 +1 + 亮答案锁定输入，点「好的」通过。
   - 非法输入（空/负数/非整数）→ 轻提示不计失误。
5. 每次失误经 `registerMistake`：失误 +1 刷新计数；累计第 4 次 → `triggerRunReset` 弹「失误太多啦」，「回到第 1 关」重开本次游戏（存档不动）。
6. 「关卡」→ 弹窗列出已解锁关卡（含星级标记）；「重开」→ 重置本关（失误清零、回到第 1 单、退出找零阶段）。
7. 键盘可达：全部控件为原生 `<button>`/`<input>`，找零输入框回车等效确认。

### 边界与异常处理

| 场景 | 处理 |
| --- | --- |
| localStorage 读写异常（隐私模式/沙箱） | `safeGetItem/safeSetItem` 退化为内存对象，游戏可玩、不报错 |
| 付款台为空点「付账」 | 轻提示「先点下面的面额放点钱吧」，不计失误 |
| 找零输入为空或非正整数 | 轻提示「先输入一个数字吧」，不计失误 |
| 商品数量组合枚举为空（商品区间与关卡值域无交集） | 过滤后候选为空时回退整档商品池，枚举兜底保证必有解 |
| 大件档单价区间无整十数 | 回退为区间内任意整数 |
| 找零阶段再点面额 | `addNote/removeNote` 拒绝；「清空」退出找零阶段重付 |
| 第 4 次失误 | 立即弹「失误太多啦」锁定输入；解锁与星星存档不重置 |
| 12 关通关后再点「下一关」 | 文案已是「从头再玩」，回到第 1 关 |
| 结算动画期间连点 | `state.locked` 锁定输入，动画结束进入弹窗后统一恢复 |

### 验证方式

1. `node src/shopping-cashier/smoke.test.js`（node 原生 assert + vm 沙箱 + Map 桩 localStorage）：
   - 场景 A：文件与目录约定断言（viewport、脚本引入顺序、`--sc-` 变量、返回脚本、找零输入面板、games.js 注册）。
   - 场景 B：`generateOrder` 12 关 × 多种子——同种子可复现、`price = unitPrice × qty`、总价在档位值域、数量在档位范围、第 11-12 关为大件档。
   - 场景 C：`evaluatePayment` 恰好/多/少与差额、`computeChange`、`checkChangeInput` 四态、`coinCountSummary`、`orderDue`、`unitPriceCombos` 有解。
   - 场景 D：星级边界（0-4 次）、档位递进（模式分界/值域爬坡/全 6 面额）、存档 unlocked 只增不减、stars 保留最大值。
   - 收尾输出 `shopping cashier smoke test passed`。
2. 浏览器 smoke：真实走通「凑整付款 → 付错提示 → 付对 → 下一单」与「找零关多付 → 输入找零 → 答错方向提示 → 答对成交」；390px 视口无横向溢出、返回按钮不遮挡标题。
