---
doc_id: DES-GH001
doc_type: design
module: game-hub
status: approved
last_updated: 2026-10-08
related:
  - doc/requirements/game-hub/age-filter.md
  - doc/contracts/game-hub/age-filter.md
---

# 游戏平台首页 · 年龄筛选 Tab（DES-GH001）

## 需求追溯

- 关联 REQ-GH001，覆盖其全部「本次覆盖」范围。
- 未覆盖项（来自 REQ「本次不覆盖」）：卡片适龄徽章、更细分龄档、筛选状态持久化。

## 契约引用

- CON-GH001（阶段 0 草案）：`GAME_CATALOG` 条目 `meta.age` 字段结构与兜底规则。阶段 1 落地后以 `src/data/games.js` 为最终事实来源。

## 技术设计

### 模块职责与数据流

```text
data/games.js          js/app.js                        index.html / css
GAME_CATALOG  ──▶  normalizeAge() 兜底 ──▶ buildTabs() 计数 ──▶ Tab 条
              ──▶  filterGames(当前Tab) ──▶ render() 重建卡片 ──▶ .hub-grid
```

- `src/data/games.js`：仅按 CON-GH001 给 16 个条目补 `meta: { age: ... }`，其余字段不动。
- `index.html`：`.hub-header` 与 `.hub-grid` 之间新增 `<div class="hub-tabs" role="tablist" aria-label="按年龄筛选游戏">` 容器，由 JS 填充；无游戏目录时该容器保持为空（不渲染任何 Tab）。
- `src/js/app.js`：
  - 新增单一 UI 状态 `currentAge = "all"`（`"all" | "kids" | "adult"`），不持久化。
  - `normalizeAge(game)`：按契约兜底读取 `meta.age`，非法值返回 `"all"`。
  - `renderTabs()`：按「全部 / 儿童 / 成人」固定顺序生成按钮；计数对当前目录数据实时统计（全部=总数；儿童=kids+all；成人=adult+all）；选中态写 `aria-selected`。
  - `filterGames(age)`：`all` → 全量；`kids` → `kids || all`；`adult` → `adult || all`。
  - `render()` 改为接收过滤结果；无结果时渲染 `.hub-empty` 空态提示（当前目录下三个 Tab 都不为空，空态属防御性兜底）。
  - Tab 点击通过 `addEventListener` 更新 `currentAge` 并重渲染 Tab 态与列表；`createCard()` 与 `getGamePath()` 不变。
- `src/css/custom.css`：新增 `.hub-tabs`（居中换行的按钮组）、`.hub-tab`（胶囊按钮，未选中用 `--app-panel-muted` 底 + `--app-border` 描边）、`.hub-tab[aria-selected="true"]`（`--app-primary` 底白字）、`.hub-tab-count`（弱化数字）、`.hub-empty`（空态文案，`--app-text-muted`）。全部使用既有 CSS 变量，不新增硬编码色值；移动端沿用 640px 断点微调内边距，Tab 允许换行。

### 技术决策

1. **筛选语义用包含而非精确匹配**：全龄游戏在儿童/成人 Tab 都可见，避免「筛完只剩孤款」和全龄游戏被互相隐藏（REQ 验收标准 2/3 的来源）。
2. **年龄分类放 `games.js` 数据层而非 `app.js` 的 `gameMeta` 展示映射**：适龄是目录内容属性；`meta` 字段本就是预留的数据扩展位，展示层的 icon/tag 映射保持原样，两层职责不混。
3. **Tab 状态不持久化**：筛选是临时浏览视图而非用户数据，刷新回默认「全部」更符合「默认看全量」预期（REQ 已列为不覆盖项）。
4. **沿用本页无 Bootstrap 的现状**：首页现有实现为纯 `variables.css` + `custom.css`，按「仓库已有实现以现状为准」，Tab 用原生按钮 + 既有 token 实现，不为本页单独引入 CDN 框架。
5. **计数实时推导**：Tab 上的数量从 `GAME_CATALOG` 统计，未来增删游戏不需改文案。

## 界面原型

默认态（全部）：

```text
┌──────────────────────────────────────────────────────┐
│                     [icon]  游戏平台                  │
│                  选择一款游戏开始游玩                  │
│                                                      │
│              ┌────────┐ ┌────────┐ ┌────────┐        │
│              │ 全部 16 │ │ 儿童 15 │ │ 成人 11 │       │
│              └────────┘ └────────┘ └────────┘        │
│                    （胶囊 Tab，选中高亮）              │
│                                                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐            │
│  │   🎲     │  │   ♟️     │  │   🧩     │            │
│  │  2048    │  │  五子棋   │  │ 俄罗斯方块 │            │
│  │ 经典数字… │  │ 基于 w…  │  │ 现有编译… │            │
│  │ [休闲]   │  │ [策略]   │  │ [经典]   │            │
│  └──────────┘  └──────────┘  └──────────┘            │
│  …（15 张卡片，同现有布局）                            │
└──────────────────────────────────────────────────────┘
```

「儿童」Tab 选中态（隐藏单词大炮，其余布局不变）：

```text
│   ┌────────┐ ╔════════╗ ┌────────┐                         │
│   │ 全部 16 │ ║ 儿童 15 ║ │ 成人 11 │    ← 选中项主色底白字  │
│   └────────┘ ╚════════╝ └────────┘                         │
│   卡片区：15 张（无「单词大炮」）                             │
```

空态（防御性兜底，当前数据不可达）：

```text
│   ┌────────┐ ┌────────┐ ┌────────┐                         │
│   │ 全部 15 │ │ 儿童  0 │ │ 成人 11 │                         │
│   └────────┘ └────────┘ └────────┘                         │
│                                                            │
│              该分类下暂无游戏，看看其他分类吧                  │
└────────────────────────────────────────────────────────────┘
```

状态说明：无 loading 态（静态数据同步渲染）；empty 态见上图；error 态沿用现状（目录缺失时整页不渲染列表，Tab 区随之留空，无新增错误分支）。

## 交互与异常

### 操作流程

1. 页面加载 → `renderTabs()` 渲染三个 Tab（「全部」默认 `aria-selected="true"`）→ `render()` 渲染全量卡片。
2. 点击任意 Tab → 更新 `currentAge` → `renderTabs()` 刷新选中态与计数 → `render()` 重建卡片。同步执行，无过渡状态。
3. 键盘：Tab 为原生 `<button>`，聚焦后回车/空格即切换；`role="tablist"/"tab"` 供读屏识别。

### 边界与异常处理

| 场景 | 处理 |
| --- | --- |
| `meta` 为 `null` / 缺 `age` / 非法值 | `normalizeAge()` 返回 `"all"`，三 Tab 均可见（契约兜底规则） |
| 目录为空或加载失败 | 维持现有 early-return：不渲染 Tab 也不渲染卡片，无 JS 报错 |
| 某分类计数为 0 | 列表区渲染空态文案，Tab 数量照实显示 0 |
| 窗口缩放 / 移动端 | Tab 组允许换行，不横向溢出；卡片样式不变 |

### 验证方式

1. 新增 `src/js/app.smoke.test.js`（node + vm + assert，沿用 `src/typing-cannon/smoke.test.js` 的桩模式）：加载真实 `src/data/games.js` 与 `src/js/app.js`，模拟点击三个 Tab，断言各 Tab 渲染卡片数与 REQ 验收标准一致（16/15/11）、儿童 Tab 不含 `typing-cannon`、成人 Tab 不含 4 款 kids 游戏；再构造非法 `meta.age` 条目断言兜底为可见。
2. 手工 smoke：本地 HTTP 打开首页，核对默认态、两个筛选态、键盘切换与移动端断点下的 Tab 布局。
