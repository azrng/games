---
rule_id: frontend-agents
version: 1.81.0
last_updated: 2026-09-22
dependencies: [agents-root]
---

# 前端规则

## 适用范围

- 作用域：前端实现、页面、组件、路由、状态、样式与前端测试
- 触发场景：涉及页面、布局、组件、交互、样式、前端 smoke test 时阅读

### 常见任务入口
- 新增页面或布局：先看页面 / 组件规则与目录约定
- 改表单、筛选、交互：先看状态管理、请求规则与校验约定
- 改样式、组件展示：先看样式规则与设计系统约束
- 补前端回归：先看 `提交前最小回归` 与测试规则

---

## 技术栈

### 前端
- HTML5 语义化标签
- Bootstrap 5（唯一 CSS 框架，通过 CDN 引入）
- Bootstrap Icons（唯一图标库，尺寸统一 18-24px，通过 CDN 引入）
- Chart.js（唯一图表库，通过 CDN 引入）
- 原生 JavaScript（ES6+，禁止引入 React/Vue/jQuery 等框架）
- 数据持久化：localStorage / sessionStorage

### 依赖引入方式
- 所有第三方库统一通过 CDN 引入（Bootstrap CSS/JS、Bootstrap Icons、Chart.js）
- 禁止使用 npm/yarn/pnpm 等包管理器
- 引入未列出的第三方库需要确认

### 默认端口
| 类型 | 说明 |
|------|------|
| 静态页面 | 通过本地 HTTP 服务器访问（如 VS Code Live Server、`python -m http.server 3000`），默认端口 3000 |

### 设计系统
#### 设计系统基线与定制
- `design-system.yaml` 中的颜色、主题、字体、风格关键词默认是内置基线，按产品品牌定制后才是本项目的规范
- `meta.status` 为「基线待定制」时，首次界面任务前必须先完成定制，并把 `meta.status` 改为「已定制」：
  - 已有产品资料（VI / 品牌色 / 设计稿）：按资料更新 token 与主题策略
  - 仓库已有样式实现：从现有代码反向提炼产品 token 回填 `design-system.yaml`，不强行套用基线值
  - 资料缺失：先向用户询问品牌色、明暗主题、密度等偏好，禁止把基线色默认当作产品主色
- `meta.status` 为「已定制」后，`use-ai-rule` 重新生成会保留本地 `design-system.yaml` 不覆盖；定制后忘记改状态，下次生成会被基线覆盖
- `meta.tech_stack` 与界面子规则声明的技术栈不一致（如规则为 Blazor + BootstrapBlazor 而文件仍是 React + Ant Design 基线）时，该文件视为过期基线：框架专属章节（组件主题映射、状态管理、构建环境变量、前端端口）一律不适用，仅可参考与框架无关的色彩 / 间距 token；先按上述定制流程重建或用 `use-ai-rule` 重新生成正确技术栈的基线再开始界面任务，并把不一致作为待确认项提请用户
- 调整 token 的固定顺序：先改 `design-system.yaml`，再同步文件中声明的实现资源（样式资源 / 主题配置 / 图表主题），最后改界面
- 语义 token 的命名、分层与「token → 实现资源 → 组件」引用管线属于结构契约：可以改值、增删 token，不得另建平行 token 体系或在界面绕过 token 硬编码
- 使用 Bootstrap 5 主题系统，所有视觉规范在 `design-system.yaml` 中定义
- 优先使用 Bootstrap 组件和工具类，禁止 inline style，禁止硬编码颜色/间距/圆角

### 技术选择原则
如果仓库已经有真实实现，以现有代码为准，不要强行重构或替换技术栈。
技术债务与重构判断遵循 `collaboration-AGENTS.md` 的「纠错、回退与重构」。

---

## 主动建议规则
- 发现页面、视图、组件、状态管理或请求逻辑职责混杂，导致文件膨胀、复用困难或测试困难时，应主动提醒并建议最小拆分点
- 发现样式与 `design-system.yaml`、现有主题、组件库或交互模式冲突时，应先说明差异和影响，不直接引入平行视觉体系
- 发现表单校验、权限展示、页面状态、刷新策略或错误处理缺失时，应主动提醒
- 发现可以复用已有页面基座、组件、hook、store、请求封装、schema 或工具函数时，应优先建议复用
- 不确定交互规则、字段含义、视觉 token 或前端数据来源时，应按根 `AGENTS.md` 的查证优先级处理，禁止凭经验补写规则

## 推荐目录结构
若仓库尚未形成稳定结构，可优先参考以下组织方式；若仓库已有实现，以现状为准，不强制迁移。

```text
project-root/
├── index.html               # 登录页 / 入口页
├── dashboard.html           # 仪表盘主页
├── pages/                   # 业务页面
│   ├── user/
│   │   ├── list.html        # 用户列表
│   │   └── detail.html      # 用户详情
│   ├── patient/
│   │   ├── list.html
│   │   └── detail.html
│   └── ...                  # 按业务域拆分
├── components/              # 可复用 HTML 片段（通过 JS 动态加载）
│   ├── layout/
│   │   ├── sidebar.html     # 侧边栏
│   │   ├── header.html      # 顶部栏
│   │   └── footer.html      # 底部栏
│   ├── common/
│   │   ├── modal.html       # 弹窗模板
│   │   └── confirm.html     # 确认框模板
│   └── charts/
│       ├── bar-chart.html   # 柱状图模板
│       └── line-chart.html  # 折线图模板
├── css/
│   ├── custom.css           # 全局自定义样式（唯一自定义 CSS 文件）
│   └── variables.css        # CSS 变量定义（颜色、间距等 token）
├── js/
│   ├── app.js               # 应用入口、全局初始化
│   ├── router.js            # 简易路由 / 页面导航管理
│   ├── store.js             # 基于 localStorage 的数据管理
│   ├── utils.js             # 工具函数
│   ├── components.js        # 通用组件（Toast、Modal、Confirm 等）
│   ├── auth.js              # 登录认证逻辑
│   └── pages/               # 按业务域拆分的页面脚本
│       ├── user.js
│       ├── patient.js
│       └── ...
├── data/
│   ├── mock.js              # Mock 数据（初始数据集）
│   └── constants.js         # 业务常量
├── assets/
│   ├── images/              # 图片资源
│   └── favicon.ico          # 应用图标
├── doc/
│   ├── design/
│   └── requirement.md
├── AGENTS.md
├── CLAUDE.md
├── GEMINI.md
├── GROK.md
├── design-system.yaml
└── TASK.md
```

---

## 开发流程

### 总体阶段划分

所有新功能开发必须严格经历以下两个阶段，阶段之间有明确的门控条件，不满足条件不得进入下一阶段：

```
阶段 0          阶段 1
设计文档   →   页面实现
（用户确认）   （AI Agent）
```

**例外情况**（AI 自动判断，无需走阶段 0）：
- Bug 修复（功能行为不变，只修正错误）
- 已有页面的样式、文案微调
- 单个字段的增删（不涉及新页面或新业务流程）

---

### 阶段 0 — 设计文档（新功能强制前置）

**触发条件**：用户提出新功能需求

**执行方式**：由用户与 AI 对话协作产出，用户最终确认定稿

**产物**：当前业务模块/功能对应的 `doc/design/<module>/<feature>.md`，并关联已确认的 `doc/requirements/<module>/<feature>.md`；跨模块方案另记入 `doc/design/architecture.md`

**文档必须包含以下四个部分**：

| 部分 | 内容要求 |
| --- | --- |
| 需求追溯 | 关联 `REQ-` 编号、明确本次设计覆盖的范围和未覆盖项，不重复粘贴需求正文 |
| 契约引用（如涉及） | 关联已有 `CON-` 及最终事实来源，或关联阶段 0 创建的契约草案；不在设计文档中复制完整字段结构 |
| 技术设计 | 模块职责、数据流向、状态变化、技术决策和依赖边界 |
| 界面原型 | 每个页面的 ASCII 线框图，含关键状态（loading / empty / error） |
| 交互与异常 | 操作流程、状态流转、边界场景、错误处理方式和验证方式 |

**门控规则**：
- 用户明确确认对应的需求文档和设计文档后，才允许进入阶段 1
- AI 在此阶段只输出文档内容，不写任何实现代码

---

### 阶段 1 — 页面实现（AI Agent）

**触发条件**：用户发出「开始开发」指令

**入场要求**：阶段 0 设计文档已由用户确认

**工作内容**：
1. 按设计文档实现 HTML 页面和交互逻辑
2. 数据层使用 localStorage 持久化，初始数据来自 `data/mock.js`
3. 严格遵循 `design-system.yaml` 和 Bootstrap 5 规范
4. 所有 CRUD 操作必须真实生效，刷新页面后数据保留

**产物**：
- 可在浏览器中直接打开运行的完整 HTML 页面
- 数据持久化方案（localStorage）

**门控规则**：
- 用户确认页面符合设计文档预期
- 所有 CRUD 操作经刷新验证数据持久化成功

---

## 使用方式
- 确认当前开发阶段及其入场条件；小改动只读命中的规则段落，不默认通读全文
- `design-system.yaml` 用于处理颜色、间距、圆角、排版、页面状态与组件选择
- 修改页面前先看该页面与相近页面的现有实现，优先复用当前结构，再决定是否新增文件

进行页面开发时：
1. 优先使用 Bootstrap 组件和工具类
3. 图标统一使用 Bootstrap Icons，尺寸 18-24px
4. 数据管理统一使用 `js/store.js`，禁止在页面脚本中直接操作 localStorage
5. 页面组件（Toast、Modal 等）统一使用 `js/components.js` 中的封装

---

## 核心规则
- 先理解，再修改。
- 先复用，再新增。
- 交付必须可直接在浏览器中打开使用，不能只停留在演示层。
- 不允许新增平行配置体系。
- 不做与当前任务无关的重构。
- 不要猜测问题，要实证排查：通过日志、断点、数据等实际证据定位原因，禁止凭猜测修改代码。
- 所有改动都必须可说明、可验证。

## 思考与实现原则
- 先理解业务目标、用户角色、核心流程，再进行设计和开发。
- 优先选择符合当前需求的最优可行方案，兼顾正确性、可维护性与实现成本。
- 尽可能复用现有代码、结构与组件；只有在明确存在复用价值时才新增抽象。
- 严禁过度设计、过度封装和无意义冗余，避免为单次需求引入不必要的层次和复杂度。
- 代码实现应保持清晰、简洁、稳定，优先保证业务正确性、可读性和后续维护性。
- 单个类、页面、组件、页面基类应保持职责单一，避免巨型文件和巨型类。发现文件持续膨胀、单类职责过多、阅读成本明显升高时，必须优先拆分为更小的组件、服务、辅助类或局部模块。禁止编写超大页面基类、超大工具类、超大 Service 类，禁止把多个无关职责长期堆在同一个类中。
- 遇到需求不清、规则冲突或实现复杂度明显升高时，先说明判断与权衡，再继续执行。

## 编码规则
- 所有源码、配置、文档文件统一使用 `UTF-8` 编码。
- 读取或修改含中文文件时，若出现乱码，先判断是终端显示问题还是文件编码损坏；未确认前禁止覆盖原文件。
- 禁止使用可能隐式改变编码的方式直接改写源码文件，如 shell 重定向、`Out-File`、`Set-Content`。
- Windows / PowerShell 下读取中文文件时，必须显式使用 `UTF-8`。
- 如果编写注释（含代码注释、文档注释等），统一使用中文，不使用纯英文注释；必要的英文标识、协议字段名或框架关键字可保留原文；不在注释里泄露密钥、token、连接串或真实生产地址。
- 修改含中文内容后，必须重新读取一次并确认关键中文显示正常。

---

## HTML 规范

### HTML 结构规范
- 使用 HTML5 语义化标签（`<header>`、`<nav>`、`<main>`、`<section>`、`<article>`、`<aside>`、`<footer>`）
- 每个页面必须包含完整的 `<head>` 结构（meta、title、CDN 引入）
- 页面统一使用 UTF-8 编码
- 页面标题格式：`页面名称 - 系统名称`
- 表单元素必须关联 `<label>`，通过 `for` 属性关联 `id`
- 图片必须设置 `alt` 属性
- 禁止使用已废弃的 HTML 标签（`<font>`、`<center>`、`<b>` 等，使用 CSS 替代）

### 页面加载规范
- Bootstrap CSS CDN 放在 `<head>` 中
- Bootstrap JS CDN 放在 `</body>` 前最后加载
- 自定义 CSS（`css/custom.css`）放在 Bootstrap CSS 之后
- 自定义 JS（`js/app.js` 等）放在 Bootstrap JS 之后
- 所有页面统一使用相同的 `<head>` 模板（CDN 版本一致）

### CDN 引入模板
```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>页面名称 - 系统名称</title>
    <!-- Bootstrap 5 CSS -->
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
    <!-- Bootstrap Icons -->
    <link href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css" rel="stylesheet">
    <!-- 自定义样式 -->
    <link href="css/variables.css" rel="stylesheet">
    <link href="css/custom.css" rel="stylesheet">
</head>
<body>
    <!-- 页面内容 -->

    <!-- Bootstrap 5 JS Bundle（含 Popper） -->
    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
    <!-- Chart.js -->
    <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js"></script>
    <!-- 自定义脚本 -->
    <script src="js/utils.js"></script>
    <script src="js/store.js"></script>
    <script src="js/components.js"></script>
    <script src="js/auth.js"></script>
    <script src="js/app.js"></script>
    <!-- 页面脚本 -->
    <script src="js/pages/xxx.js"></script>
</body>
</html>
```

---

## JavaScript 规范

### 编码规范
- 使用 ES6+ 语法（`const`/`let`、箭头函数、模板字符串、解构赋值、`async`/`await`）
- 禁止使用 `var`
- 禁止使用 `eval()`
- 禁止使用 `==` / `!=`，统一使用 `===` / `!==`
- 禁止直接操作 DOM 时拼凑 HTML 字符串（使用 `createElement` 或模板片段）
- 异步操作使用 `async`/`await` + `Promise`，禁止回调地狱
- 事件绑定使用 `addEventListener`，禁止 `onclick` 等 HTML 内联事件属性（Bootstrap 组件自带事件除外）

### 类型纪律（无构建的类型安全）
- 保持 `.js` 文件形态，不引入 TypeScript 编译或任何构建步骤，与本项目「无框架无构建」的定位一致
- 新建 JS 文件首行添加 `// @ts-check`，让编辑器与 CI 能基于 JSDoc 做类型检查
- `js/` 下共享模块（`store.js`、`router.js`、`components.js` 等）的函数必须写 JSDoc 注解：`@param`（含类型与含义）、`@returns`；复杂数据结构用 `@typedef` 定义一次、处处引用
- 页面脚本调用共享模块时以 JSDoc 类型为准，不得凭猜测传参；类型不匹配时先修正注解或调用方
- 可在项目根添加 `jsconfig.json`（`checkJs: true`、`noEmit: true`）统一检查口径，仅用于编辑器 / CI 检查，不产出任何构建物
- 脚本规模超出单文件或简单模块（出现复杂状态流转、多实体关联、需要测试框架）时，应主动提示用户评估迁移到带构建的前端组合（如 React / Vue Profile），而不是在本项目内引入构建或 TypeScript 工具链

### 数据管理规范（localStorage）
- 所有 localStorage 操作统一通过 `js/store.js` 封装
- 数据结构使用 JSON 序列化/反序列化
- 存储键名使用统一前缀 `app_`（如 `app_users`、`app_patients`）
- 数据变更后必须触发相关的 UI 更新
- 删除操作使用软删除（标记 `deleted: true`），保留数据可恢复性
- 每个数据实体必须包含 `id`（UUID 或时间戳）、`createdAt`、`updatedAt` 字段
- 禁止在页面脚本中直接调用 `localStorage.getItem` / `localStorage.setItem`

### 页面导航规范
- 页面跳转统一通过 `js/router.js` 管理
- 使用 `window.location.href` 或 `router.navigate('page.html')` 进行页面跳转
- 侧边菜单点击事件统一处理，记录当前激活状态到 localStorage
- 页面加载时从 localStorage 恢复菜单激活状态

### 组件封装规范
- 通用 UI 组件（Toast、Modal、Confirm）统一封装在 `js/components.js`
- 组件使用工厂函数或类的方式封装，暴露简洁的 API
- 组件状态通过闭包或私有变量管理
- 组件销毁时清理事件监听和 DOM 引用

### 请求/数据交互规范
- 本项目无后端 API，所有数据通过 localStorage 管理
- 模拟异步操作（如保存延迟）使用 `Promise` + `setTimeout`，保持异步一致性
- 数据初始化时从 `data/mock.js` 加载默认数据（仅在 localStorage 为空时）

### 图表规范
- 图表统一使用 Chart.js，通过 `js/components.js` 封装统一配置
- 图表颜色来自 `design-system.yaml` 中的 token 定义
- 图表必须处理 loading、empty、error 三种状态
- 图表实例在页面卸载时必须销毁（`chart.destroy()`）

---

## 样式规范

### CSS 规则
- 优先使用 Bootstrap 工具类（`text-primary`、`bg-light`、`p-3`、`rounded` 等）
- 自定义样式统一写在 `css/custom.css` 中，禁止在 `<style>` 标签内写内联样式
- 颜色、间距、圆角等视觉 token 在 `css/variables.css` 中定义为 CSS 变量
- 禁止使用 `!important`（Bootstrap 覆盖场景除外）
- 禁止硬编码颜色值（如 `#1A90FF`），使用 CSS 变量或 Bootstrap 语义类
- 响应式设计遵循移动优先原则，使用 Bootstrap 断点（`sm`、`md`、`lg`、`xl`、`xxl`）
- 动效使用 CSS transition / animation，保持流畅自然

### CSS 变量命名
```css
:root {
    /* 主品牌色 */
    --app-primary: #1A90FF;
    --app-primary-hover: #0078E0;
    --app-primary-active: #0052CC;
    --app-primary-light: #EEF4FF;

    /* 语义色 */
    --app-success: #10B981;
    --app-warning: #F59E0B;
    --app-error: #EF4444;
    --app-info: #1A90FF;

    /* 中性色 */
    --app-gray-50: #FAFBFC;
    --app-gray-100: #F3F4F6;
    --app-gray-200: #E5E7EB;
    --app-gray-300: #D1D5DB;
    --app-gray-400: #9CA3AF;
    --app-gray-500: #6B7280;
    --app-gray-600: #4B5563;
    --app-gray-700: #374151;
    --app-gray-800: #1F2937;
    --app-gray-900: #111827;

    /* 间距 */
    --app-spacing-xs: 4px;
    --app-spacing-sm: 8px;
    --app-spacing-md: 16px;
    --app-spacing-lg: 24px;
    --app-spacing-xl: 32px;

    /* 圆角 */
    --app-radius-sm: 4px;
    --app-radius-md: 8px;
    --app-radius-lg: 12px;

    /* 阴影 */
    --app-shadow-sm: 0 1px 3px 0 rgba(0,0,0,0.08);
    --app-shadow-md: 0 4px 8px -2px rgba(0,0,0,0.10);
    --app-shadow-lg: 0 10px 15px -3px rgba(0,0,0,0.10);
}
```

---

## 页面状态规范

每个页面/模块必须处理以下状态：

| 状态 | 说明 | 实现方式 |
|------|------|----------|
| loading | 数据加载中 | 骨架屏动画（Bootstrap placeholder 组件）或 spinner |
| empty | 无数据 | 空状态图示 + 简短说明 + 引导操作按钮 |
| error | 请求/操作失败 | 可读的错误原因 + 重试按钮 |
| no-permission | 权限不足 | 明确提示权限不足，不暴露内部细节 |

---

## 组件使用规则

### 通用规则
- 优先复用 `js/components.js` 下已有组件，禁止重复创建
- 只有确实有复用价值时才新增共享组件，避免为单次需求过度抽象
- 除非仓库已在使用，否则不要引入新的组件库或样式体系

### 组件清单
- **Toast**：轻提示，操作结果反馈，自动消失
- **Modal**：弹窗，用于表单、详情查看、确认操作
- **Confirm**：确认对话框，用于危险操作二次确认
- **Pagination**：分页组件
- **Table**：数据表格（支持排序、搜索、分页）
- **SearchBar**：搜索栏
- **FilterBar**：筛选栏
- **StatCard**：数据统计卡片
- **StatusTag**：业务状态标签
- **BarChartCard**：柱状图卡片（Chart.js）
- **LineChartCard**：折线图卡片（Chart.js）
- **PieChartCard**：饼图卡片（Chart.js）

---

## 测试规则

### 提交前最小回归
- 默认执行：页面加载、关键交互与资源引用检查；若仓库已有构建或静态检查脚本，按现有脚本执行
- 页面、表单、导航、交互改动：至少补一次受影响页面的手工 smoke test
- localStorage、图表、组件封装改动：至少补一次真实数据链路或等价验证，确认刷新后状态仍正确
- 仅样式或文案微调：至少确认受影响页面的关键状态、布局与主要交互未回退

### 总体要求
- 影响行为的改动应优先补充或更新测试，而不是只修改实现代码
- 若本次改动未补测试，必须在最终说明中写明原因和风险
- 测试应覆盖真实业务行为，不要只覆盖静态渲染或无意义分支

### 前端测试
- 关键页面至少完成一次手工 smoke test
- localStorage 相关改动需验证刷新后的数据持久化效果
- 图表、弹窗、表单、导航等关键交互应有验证

### 无法执行测试时
- 必须说明未执行的测试类型、原因、潜在影响范围和风险

## Git 与提交流程

### 分支命名
- `feat/<desc>`：新功能
- `fix/<desc>`：缺陷修复
- `refactor/<desc>`：无行为变更的重构
- `chore/<desc>`：工具、依赖、配置调整
- `docs/<desc>`：仅文档变更

### Commit 规范
- 提交信息优先采用 Conventional Commits：
  - `<type>(<scope>): <简短描述>`
- 示例：
  - `feat(auth): add login page with localStorage persistence`
  - `fix(user): correct table pagination reset`
  - `chore(styles): update CSS variables for new color tokens`

### 交付前自查
- 在浏览器中打开页面验证功能正常
- 验证 localStorage 数据持久化（刷新后数据保留）
- 验证所有 CRUD 操作正常工作
- 验证页面在不同断点下的响应式表现
- 验证页面状态（loading、empty、error）正常显示

### 提交触发规则
- 按根 `AGENTS.md` 的「提交触发规则」执行，不在本文件另设提交节奏
- 若本次开发生成了临时文件或缓存，应同步检查并更新 `.gitignore`

---

## 任务管理机制
- 任务记录、状态定义、触发条件与清理规则统一遵循 `collaboration-AGENTS.md` 的「任务管理」，本文件不再重复维护
- 开发过程中及时更新 `TASK.md`；范围变化时同步补充任务说明、验收标准和风险

---
