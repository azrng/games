# AGENTS.md — 纯 HTML 静态页面项目规范

## 目标
职责划分如下：
- `AGENTS.md` / `CLAUDE.md` / `GEMINI.md`：各 AI Agent 统一工作规则、任务管理机制、交付要求，内容保持同步
- `design-system.yaml`：设计 token 与 UI 规范
- `TASK.md`：具体任务内容与任务进度

---

## 注意事项
1. 你需要理解用户提出的需求的业务逻辑然后再做设计和开发
2. 你需要根据设计的功能需求设计多级的菜单，管理员默认有所有菜单权限
3. 功能模块必须有完整可操作的功能页面
4. 所有的功能至少要确保能够完成基本的流程操作，功能的按钮必须都是可以交互的，界面的内容尽量多填充一些信息
5. 整体系统需要有一个登录页面，并要有默认应用图标，登录页面，登录系统左上角应该有应用图标和应用名称。
6. 系统涉及时能够有一些酷炫的动效，需要符合医疗行业的审美要求，界面简洁大方，操作流程清晰易懂。
7. 系统内所有涉及变更、新增、删除等业务逻辑，必须能够真实生效的，而不是假的交互，数据使用 localStorage 持久化，确保浏览器刷新页面后能看到生效后的内容
8. 由于此系统的功能模块较多，实现的时候先把系统的框架搭起来，然后按照一个一个子模块的方式来实现，而不是一下子实现全部功能

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
- 使用 Bootstrap 5 主题系统，所有视觉规范在 `design-system.yaml` 中定义
- 优先使用 Bootstrap 组件和工具类，禁止 inline style，禁止硬编码颜色/间距/圆角

如果仓库已经有真实实现，以现有代码为准，不要强行重构或替换技术栈。

---

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
│   ├── devlog/
│   ├── design/
│   └── requirement.md
├── AGENTS.md
├── CLAUDE.md
├── GEMINI.md
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

**产物**：`doc/design/设计文档.md`（全项目一份，新功能以新章节追加，不新建文件）

**文档必须包含以下四个部分**：

| 部分 | 内容要求 |
|------|----------|
| 架构设计 | 页面结构、数据流向、涉及的组件和交互说明 |
| 功能需求 | 页面列表、功能点明细、业务规则、权限矩阵 |
| 界面原型 | 每个页面的 ASCII 线框图，含关键状态（loading / empty / error） |
| 交互说明 | 操作流程、状态流转、边界场景、错误处理方式 |

**门控规则**：
- 用户明确确认设计文档后，才允许进入阶段 1
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
每个 AI Agent 在开始修改前都必须：
1. 先阅读本文档，理解核心规则和流程
2. 确认当前处于哪个开发阶段，检查该阶段的入场条件是否满足
3. 再阅读 `design-system.yaml`
4. 再阅读相关页面和现有实现
5. 优先复用当前结构，再决定是否新增文件

进行页面开发时：
1. `design-system.yaml` 是颜色、间距、圆角、排版、页面状态、组件使用规则的参考依据
2. 优先使用 Bootstrap 组件和工具类
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
- 所有改动都必须可说明、可验证。

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
- 每次修改完后都必须提交代码
- 若本次开发生成了临时文件或缓存，应同步检查并更新 `.gitignore`

---

## 任务管理机制
`TASK.md` 是唯一任务记录文件，用于记录具体任务内容，不负责承载规则解释。

### 任务状态
- `TODO`：未开始
- `DOING`：进行中
- `BLOCKED`：被阻塞
- `REVIEW`：已完成开发，等待确认
- `DONE`：已完成

### 执行规则
1. 开始工作前，先查看 `TASK.md` 是否已有对应任务
2. 如果已有任务，优先更新原任务，不重复新建
3. 如果没有任务，在 `TASK.md` 中新增最小任务记录
4. 开始执行时，将任务状态更新为 `DOING`
5. 若任务无法继续，更新为 `BLOCKED` 并写明原因
6. 开发完成但仍需确认时，更新为 `REVIEW`
7. 验证完成并确认交付后，更新为 `DONE`

### 每个任务至少包含
- 任务 ID
- 任务名称
- 任务目标
- 任务状态
- 最近更新时间

### AI Agent 要求
- 开始任务前先同步任务状态
- 开发过程中及时更新 `TASK.md`
- 范围变化时同步补充
- 每次开发完成后，都需在 `doc/devlog/` 下新增一份本次开发简短说明的 Markdown 记录

---

## 设计系统文件规范
`design-system.yaml` 是唯一设计系统文件，包含：
- 品牌与产品风格意图
- 语义化颜色 token
- 排版 token
- 间距、圆角、阴影 token
- 布局与断点规则
- Bootstrap 主题配置映射
- 页面状态规范
- 组件使用规则
- 明确的 `do / dont` 规则

---

## 文档更新要求
以下内容发生变化时，必须同步更新相关文档：
- CDN 版本或引入方式
- CSS 变量定义
- 数据结构（localStorage 键名、实体字段）
- 页面结构或导航路径
- 对外使用方式

优先更新已有文档，不新增重复说明。
每次开发完成后，必须在 `doc/devlog/` 下补充一份简短开发记录，作为本次工作的可追踪说明。

### 文档目录约定
- `doc/requirement.md`：用户编写的需求文档，AI 不应将设计说明或开发过程记录写入此文件
- `doc/design/设计文档.md`：项目设计文档，全项目一份。包含架构设计、功能需求、界面原型（ASCII）、交互说明。由用户与 AI 协作产出，用户确认后作为开发的唯一需求基准。AI 可在文件中追加新功能章节，不删除已有内容，不新建平行文件
- `doc/devlog/`：每次开发完成后的简短开发日志

### devlog 要求
- 文件目录：`doc/devlog/`
- 文件格式：Markdown
- 文件命名建议：`YYYY-MM-DD-任务简述.md`
- 内容保持简短，至少包含：
  - 本次目标
  - 核心改动
  - 修改文件
  - 校验情况
  - 风险或遗留项

---

## 交付收口规范
- 当用户请求"开始开发"而非"只出方案"时，AI Agent 在实现完成后应默认继续做交付收口，而不是停在代码编写阶段
- 交付收口至少应按实际情况依次检查：
  1. 浏览器打开页面验证
  2. 功能交互验证（CRUD 操作）
  3. localStorage 数据持久化验证（刷新后数据保留）
  4. 响应式布局验证
  5. 文档、`TASK.md`、`doc/devlog/`、忽略文件更新
- 若某项验证未执行，最终输出必须明确说明未执行项、原因、影响范围和建议下一步

---

## 常见禁止事项
- 禁止使用 React、Vue、Angular、jQuery 等前端框架
- 禁止使用 Tailwind CSS、Sass 等非 Bootstrap 样式方案
- 禁止使用 Bootstrap Icons 以外的图标库（如 Font Awesome、Material Icons）
- 禁止使用 Chart.js 以外的图表库（如 ECharts、D3.js）
- 禁止使用 npm/yarn/pnpm 等包管理器
- 禁止使用 inline style（`style="..."` 属性）
- 禁止硬编码颜色值（如 `#1A90FF`）、间距值
- 禁止在页面脚本中直接操作 localStorage，统一通过 `js/store.js`
- 禁止使用 `var` 声明变量
- 禁止使用 `==` / `!=` 进行比较
- 禁止使用 HTML 内联事件属性（`onclick` 等）
- 禁止在 `<style>` 标签中写页面样式，统一使用 `css/custom.css`
- 禁止引入未列出的第三方库
- 禁止使用 `eval()`、`document.write()`
- 禁止不做软删除直接从 localStorage 物理删除业务数据
- 禁止页面缺少 loading、empty、error 状态处理

---

## 交付输出要求
最终输出优先使用中文，并至少说明：
- 本次改了什么
- 核心实现方式
- 修改了哪些文件
- 已执行和未执行的校验
- 当前任务状态
- 风险、阻塞或假设
- 是否已更新 `doc/devlog/`

---

文件结束。
