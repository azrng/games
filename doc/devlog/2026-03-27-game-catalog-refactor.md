# 本次目标

统一游戏入口清单、首页结构和 localStorage 规范，降低后续新增游戏时的维护成本。

# 核心改动

- 新增 `data/games.js` 作为统一游戏清单，首页菜单和 iframe 不再写死
- 新增 `js/store.js` 和 `js/app.js`，将首页逻辑拆出内联脚本
- 新增 `css/variables.css` 和 `css/custom.css`，将首页样式拆出内联样式
- 2048 与五子棋接入统一存储层，并迁移旧 localStorage 键
- 俄罗斯方块编译产物的存储键更新为统一前缀
- 更新 `README.md`，补充目录结构、接入步骤和编码约定

# 修改文件

- `index.html`
- `css/variables.css`
- `css/custom.css`
- `data/games.js`
- `js/store.js`
- `js/app.js`
- `2048/index.html`
- `2048/script.js`
- `gomoku/index.html`
- `gomoku/script.js`
- `tetris/app-1.0.1.js`
- `README.md`
- `TASK.md`

# 校验情况

- 已执行 `node --check js/app.js`
- 已执行 `node --check js/store.js`
- 已执行 `node --check data/games.js`
- 已执行 `node --check 2048/script.js`
- 已执行 `node --check gomoku/script.js`
- 已通过脚本确认本次检查过的核心文件为 UTF-8
- 未执行浏览器人工联调与远端部署验证

# 风险或遗留项

- `tetris` 仍是历史编译产物，仅做了存储键常量替换，未做源码级重构
- `maze` 仍保留内联样式和脚本，本次只处理首页拆分
- 五子棋页面引用的音频资源目录当前仓库内未见，本次未新增资源文件
