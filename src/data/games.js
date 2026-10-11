(function attachGameCatalog(windowObject) {
    const catalog = [
        {
            slug: "2048",
            title: "2048",
            path: "src/2048/index.html",
            icon: "src/img/game.svg",
            desc: "经典数字合成玩法，支持撤销和最高分记录。",
            readme: null,
            meta: { age: "all", device: "all" }
        },
        {
            slug: "gomoku-advanced",
            title: "五子棋",
            path: "src/gomoku-advanced/index.html",
            mobilePath: "src/gomoku-advanced/mobile.html",
            icon: "src/img/game.svg",
            desc: "基于 worker 的高阶 AI 五子棋版本，PC 端保留提示能力。",
            readme: null,
            meta: { age: "all", device: "all" }
        },
        {
            slug: "tetris",
            title: "俄罗斯方块",
            path: "src/tetris/index.html",
            icon: "src/img/game.svg",
            desc: "原生实现的现代俄罗斯方块：SRS 旋转、暂存、落点投影与 T-spin 计分。",
            readme: null,
            meta: { age: "all", device: "desktop" }
        },
        {
            slug: "maze",
            title: "迷宫冒险",
            path: "src/maze/index.html",
            icon: "src/img/game.svg",
            desc: "回溯法生成迷宫的双端挑战，终点取路径最远格，关卡逐步扩张。",
            readme: "src/maze/readme.md",
            meta: { age: "all", device: "all" }
        },
        {
            slug: "color-challenge",
            title: "色觉挑战",
            path: "src/color-challenge/index.html",
            mobilePath: "src/color-challenge/index.html",
            icon: "src/img/game.svg",
            desc: "色觉辨识挑战，找出唯一不同色并冲击最高分。",
            readme: null,
            meta: { age: "all", device: "all" }
        },
        {
            slug: "sliding-puzzle",
            title: "数字华容道",
            path: "src/sliding-puzzle/index.html",
            mobilePath: "src/sliding-puzzle/index.html",
            icon: "src/img/game.svg",
            desc: "数字滑块拼图，支持 3×3、4×4、5×5 和历史最优记录。",
            readme: null,
            meta: { age: "all", device: "all" }
        },
        {
            slug: "hidden-cats",
            title: "找猫咪",
            path: "src/hidden-cats/index.html",
            mobilePath: "src/hidden-cats/index.html",
            icon: "src/img/game.svg",
            desc: "在程序生成的素描画中找出隐藏的所有猫咪，关卡逐步升级。",
            readme: null,
            meta: { age: "kids", device: "all" }
        },
        {
            slug: "yibihua",
            title: "一笔画",
            path: "src/yibihua/index.html",
            mobilePath: "src/yibihua/index.html",
            icon: "src/img/game.svg",
            desc: "经典欧拉路径挑战，一笔画完所有边不重复，50 关闯关递进。",
            readme: null,
            meta: { age: "all", device: "all" }
        },
        {
            slug: "animal-flip-chess",
            title: "动物翻翻棋",
            path: "src/animal-flip-chess/index.html",
            mobilePath: "src/animal-flip-chess/index.html",
            icon: "src/img/game.svg",
            desc: "人机对战暗棋：翻牌或移动动物棋子，大吃小、鼠吃象、同级同归于尽。",
            readme: null,
            meta: { age: "kids", device: "all" }
        },
        {
            slug: "pipes",
            title: "转管道",
            path: "src/pipes/index.html",
            mobilePath: "src/pipes/index.html",
            icon: "src/img/game.svg",
            desc: "点击旋转管道，把水源接通到每个端点，生成树关卡必有解。",
            readme: null,
            meta: { age: "all", device: "all" }
        },
        {
            slug: "lights-out",
            title: "点灯",
            path: "src/lights-out/index.html",
            mobilePath: "src/lights-out/index.html",
            icon: "src/img/game.svg",
            desc: "点一盏灯翻转十字相邻，把整块灯板全部点亮，关卡必有解。",
            readme: null,
            meta: { age: "all", device: "all" }
        },
        {
            slug: "minesweeper",
            title: "扫雷",
            path: "src/minesweeper/index.html",
            mobilePath: "src/minesweeper/index.html",
            icon: "src/img/game.svg",
            desc: "经典扫雷轻量版，首点必安全，右键或长按插旗，三档难度记录用时。",
            readme: null,
            meta: { age: "all", device: "all" }
        },
        {
            slug: "typing-cannon",
            title: "单词大炮",
            path: "src/typing-cannon/index.html",
            mobilePath: "src/typing-cannon/index.html",
            icon: "src/img/game.svg",
            desc: "打字击碎掉落的单词，12 个主题关卡摘星，还有无尽模式与字母练习。",
            readme: null,
            meta: { age: "adult", device: "all" }
        },
        {
            slug: "math-hero",
            title: "数学小勇士",
            path: "src/math-hero/index.html",
            mobilePath: "src/math-hero/index.html",
            icon: "src/img/game.svg",
            desc: "心算答案炮轰怪兽守护城堡，12 关口算递进，支持读题与每日挑战。",
            readme: null,
            meta: { age: "kids", device: "all" }
        },
        {
            slug: "zh-poem",
            title: "点字成诗",
            path: "src/zh-poem/index.html",
            mobilePath: "src/zh-poem/index.html",
            icon: "src/img/game.svg",
            desc: "词语古诗缺一字，点中天上掉落的正确字牌，连击越高分越高。",
            readme: null,
            meta: { age: "kids", device: "all" }
        },
        {
            slug: "pinyin-typing",
            title: "拼音打字乐园",
            path: "src/pinyin-typing/index.html",
            mobilePath: "src/pinyin-typing/index.html",
            icon: "src/img/game.svg",
            desc: "看汉字打拼音的儿童打字启蒙：5-8 岁三档难度，键位高亮、零失败、贴纸激励。",
            readme: null,
            meta: { age: "kids", device: "all" }
        },
        {
            slug: "tangram",
            title: "七巧板",
            path: "src/tangram/index.html",
            mobilePath: "src/tangram/index.html",
            icon: "src/img/game.svg",
            desc: "点选七块板块填满剪影，从彩色提示到纯剪影，12 关空间想象闯关。",
            readme: null,
            meta: { age: "all", device: "all" }
        },
        {
            slug: "clock-learning",
            title: "时钟认知",
            path: "src/clock-learning/index.html",
            mobilePath: "src/clock-learning/index.html",
            icon: "src/img/game.svg",
            desc: "拨动时针分针读时间、按题拨时间，整点、半点到五分钟渐进练习。",
            readme: null,
            meta: { age: "kids", device: "all" }
        },
        {
            slug: "shopping-cashier",
            title: "购物小掌柜",
            path: "src/shopping-cashier/index.html",
            mobilePath: "src/shopping-cashier/index.html",
            icon: "src/img/game.svg",
            desc: "点面额凑钱付款、多付了算算商家该退多少，从零食到家电的购物数学启蒙。",
            readme: null,
            meta: { age: "kids", device: "all" }
        },
        {
            slug: "pattern-quest",
            title: "图案找规律",
            path: "src/pattern-quest/index.html",
            mobilePath: "src/pattern-quest/index.html",
            icon: "src/img/game.svg",
            desc: "找出图形与颜色序列的规律，从备选里挑出下一张卡片。",
            readme: null,
            meta: { age: "kids", device: "all" }
        },
        {
            slug: "code-robot",
            title: "编程小机器人",
            path: "src/code-robot/index.html",
            mobilePath: "src/code-robot/index.html",
            icon: "src/img/game.svg",
            desc: "编排方向指令让小机器人走到终点，集宝石避墙壁，12 关编程启蒙。",
            readme: null,
            meta: { age: "kids", device: "all" }
        },
        {
            slug: "balance-scale",
            title: "天平称重",
            path: "src/balance-scale/index.html",
            mobilePath: "src/balance-scale/index.html",
            icon: "src/img/game.svg",
            desc: "看天平算等量代换，推理 1 个水果等于几个柠檬，12 关递进。",
            readme: null,
            meta: { age: "kids", device: "all" }
        },
        {
            slug: "water-pour",
            title: "倒水谜题",
            path: "src/water-pour/index.html",
            mobilePath: "src/water-pour/index.html",
            icon: "src/img/game.svg",
            desc: "用没有刻度的杯子量出目标水量，经典倒水谜题，BFS 保底有解。",
            readme: null,
            meta: { age: "all", device: "all" }
        },
        {
            slug: "hanzi-parts",
            title: "汉字拼字",
            path: "src/hanzi-parts/index.html",
            mobilePath: "src/hanzi-parts/index.html",
            icon: "src/img/game.svg",
            desc: "点选部件拼出汉字，日加月是明，部件组合识字启蒙题库。",
            readme: null,
            meta: { age: "kids", device: "all" }
        },
        {
            slug: "mini-sudoku",
            title: "儿童数独",
            path: "src/mini-sudoku/index.html",
            mobilePath: "src/mini-sudoku/index.html",
            icon: "src/img/game.svg",
            desc: "动物图案 4×4 与 6×6 数独，行列宫不重复，唯一解生成。",
            readme: null,
            meta: { age: "kids", device: "all" }
        },
        {
            slug: "memory-match",
            title: "记忆翻牌",
            path: "src/memory-match/index.html",
            mobilePath: "src/memory-match/index.html",
            icon: "src/img/game.svg",
            desc: "翻两张找同款的记忆配对挑战，卡阵逐关变大，主题图案轮换。",
            readme: null,
            meta: { age: "kids", device: "all" }
        },
        {
            slug: "snake",
            title: "贪吃蛇",
            path: "src/snake/index.html",
            mobilePath: "src/snake/index.html",
            icon: "src/img/game.svg",
            desc: "经典贪吃蛇：方向键或滑动转向吃果变长，逐渐提速冲击最高分。",
            readme: null,
            meta: { age: "all", device: "all" }
        },
        {
            slug: "breakout",
            title: "打砖块",
            path: "src/breakout/index.html",
            mobilePath: "src/breakout/index.html",
            icon: "src/img/game.svg",
            desc: "经典打砖块：控板反弹击碎砖阵，六关递进，反弹角随击点变化。",
            readme: null,
            meta: { age: "all", device: "all" }
        },
        {
            slug: "math-24",
            title: "24 点",
            path: "src/math-24/index.html",
            mobilePath: "src/math-24/index.html",
            icon: "src/img/game.svg",
            desc: "四张牌算出 24：两两合并触屏友好，分数精确求解保证必有解。",
            readme: null,
            meta: { age: "all", device: "all" }
        },
        {
            slug: "nonogram",
            title: "数织",
            path: "src/nonogram/index.html",
            mobilePath: "src/nonogram/index.html",
            icon: "src/img/game.svg",
            desc: "数织像素绘：按行列数字推理填格，唯一解生成，完成显现底图。",
            readme: null,
            meta: { age: "all", device: "all" }
        },
        {
            slug: "sokoban",
            title: "推箱子",
            path: "src/sokoban/index.html",
            mobilePath: "src/sokoban/index.html",
            icon: "src/img/game.svg",
            desc: "推箱子：Microban 60 关递进，推箱到目标点，支持撤销与最少步纪录。",
            readme: null,
            meta: { age: "all", device: "all" }
        },
        {
            slug: "idiom-guess",
            title: "猜成语",
            path: "src/idiom-guess/index.html",
            mobilePath: "src/idiom-guess/index.html",
            icon: "src/img/game.svg",
            desc: "汉兜式猜成语：九次机会按字色推理四字成语，附拼音释义出处。",
            readme: null,
            meta: { age: "all", device: "all" }
        }
    ];

    windowObject.GAME_CATALOG = Object.freeze(catalog);
})(window);
