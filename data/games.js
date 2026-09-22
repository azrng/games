(function attachGameCatalog(windowObject) {
    const catalog = [
        {
            slug: "2048",
            title: "2048",
            path: "src/2048/index.html",
            icon: "img/game.svg",
            desc: "经典数字合成玩法，支持撤销和最高分记录。",
            readme: null,
            meta: null
        },
        {
            slug: "gomoku-advanced",
            title: "五子棋",
            path: "src/gomoku-advanced/index.html",
            mobilePath: "src/gomoku-advanced/mobile.html",
            icon: "img/game.svg",
            desc: "基于 worker 的高阶 AI 五子棋版本，PC 端保留提示能力。",
            readme: null,
            meta: null
        },
        {
            slug: "tetris",
            title: "俄罗斯方块",
            path: "src/tetris/index.html",
            icon: "img/game.svg",
            desc: "现有编译产物游戏，已纳入统一目录清单管理。",
            readme: null,
            meta: null
        },
        {
            slug: "maze",
            title: "迷宫冒险",
            path: "src/maze/index.html",
            icon: "img/game.svg",
            desc: "递归回溯生成迷宫的桌面端专用挑战，关卡会逐步扩张。",
            readme: "src/maze/readme.md",
            meta: null
        },
        {
            slug: "color-challenge",
            title: "色觉挑战",
            path: "src/color-challenge/index.html",
            mobilePath: "src/color-challenge/index.html",
            icon: "img/game.svg",
            desc: "纯移动端色觉辨识挑战，找出唯一不同色并冲击最高分。",
            readme: null,
            meta: null
        },
        {
            slug: "sliding-puzzle",
            title: "数字华容道",
            path: "src/sliding-puzzle/index.html",
            mobilePath: "src/sliding-puzzle/index.html",
            icon: "img/game.svg",
            desc: "移动端数字滑块拼图，支持 3×3、4×4、5×5 和历史最优记录。",
            readme: null,
            meta: null
        },
        {
            slug: "hidden-cats",
            title: "找猫咪",
            path: "src/hidden-cats/index.html",
            mobilePath: "src/hidden-cats/index.html",
            icon: "img/game.svg",
            desc: "在程序生成的素描画中找出隐藏的所有猫咪，关卡逐步升级。",
            readme: null,
            meta: null
        },
        {
            slug: "yibihua",
            title: "一笔画",
            path: "src/yibihua/index.html",
            mobilePath: "src/yibihua/index.html",
            icon: "img/game.svg",
            desc: "经典欧拉路径挑战，一笔画完所有边不重复，50 关闯关递进。",
            readme: null,
            meta: null
        },
        {
            slug: "animal-flip-chess",
            title: "动物翻翻棋",
            path: "src/animal-flip-chess/index.html",
            mobilePath: "src/animal-flip-chess/index.html",
            icon: "img/game.svg",
            desc: "双人对战翻翻棋，翻牌收集动物棋子，大吃小，鼠吃象。",
            readme: null,
            meta: null
        },
        {
            slug: "pipes",
            title: "转管道",
            path: "src/pipes/index.html",
            mobilePath: "src/pipes/index.html",
            icon: "img/game.svg",
            desc: "点击旋转管道，把水源接通到每个端点，生成树关卡必有解。",
            readme: null,
            meta: null
        },
        {
            slug: "lights-out",
            title: "点灯",
            path: "src/lights-out/index.html",
            mobilePath: "src/lights-out/index.html",
            icon: "img/game.svg",
            desc: "点一盏灯翻转十字相邻，把整块灯板全部点亮，关卡必有解。",
            readme: null,
            meta: null
        },
        {
            slug: "minesweeper",
            title: "扫雷",
            path: "src/minesweeper/index.html",
            mobilePath: "src/minesweeper/index.html",
            icon: "img/game.svg",
            desc: "经典扫雷轻量版，首点必安全，长按插旗，三档难度记录用时。",
            readme: null,
            meta: null
        },
        {
            slug: "typing-cannon",
            title: "单词大炮",
            path: "src/typing-cannon/index.html",
            mobilePath: "src/typing-cannon/index.html",
            icon: "img/game.svg",
            desc: "打字击碎掉落的单词，12 个主题关卡摘星，还有无尽模式与字母练习。",
            readme: null,
            meta: null
        },
        {
            slug: "math-hero",
            title: "数学小勇士",
            path: "src/math-hero/index.html",
            mobilePath: "src/math-hero/index.html",
            icon: "img/game.svg",
            desc: "心算答案炮轰怪兽守护城堡，12 关口算递进，支持读题与每日挑战。",
            readme: null,
            meta: null
        },
        {
            slug: "zh-poem",
            title: "点字成诗",
            path: "src/zh-poem/index.html",
            mobilePath: "src/zh-poem/index.html",
            icon: "img/game.svg",
            desc: "词语古诗缺一字，点中天上掉落的正确字牌，连击越高分越高。",
            readme: null,
            meta: null
        }
    ];

    windowObject.GAME_CATALOG = Object.freeze(catalog);
})(window);
