(function attachGameCatalog(windowObject) {
    const catalog = [
        {
            slug: "2048",
            title: "2048",
            path: "2048/index.html",
            icon: "img/game.svg",
            desc: "经典数字合成玩法，支持撤销和最高分记录。",
            readme: null,
            meta: null
        },
        {
            slug: "gomoku-advanced",
            title: "五子棋",
            path: "gomoku-advanced/index.html",
            mobilePath: "gomoku-advanced/mobile.html",
            icon: "img/game.svg",
            desc: "基于 worker 的高阶 AI 五子棋版本，PC 端保留提示能力。",
            readme: null,
            meta: null
        },
        {
            slug: "tetris",
            title: "俄罗斯方块",
            path: "tetris/index.html",
            icon: "img/game.svg",
            desc: "现有编译产物游戏，已纳入统一目录清单管理。",
            readme: null,
            meta: null
        },
        {
            slug: "maze",
            title: "迷宫冒险",
            path: "maze/index.html",
            icon: "img/game.svg",
            desc: "递归回溯生成迷宫的桌面端专用挑战，关卡会逐步扩张。",
            readme: "maze/readme.md",
            meta: null
        },
        {
            slug: "color-challenge",
            title: "色觉挑战",
            path: "color-challenge/index.html",
            mobilePath: "color-challenge/index.html",
            icon: "img/game.svg",
            desc: "纯移动端色觉辨识挑战，找出唯一不同色并冲击最高分。",
            readme: null,
            meta: null
        },
        {
            slug: "sliding-puzzle",
            title: "数字华容道",
            path: "sliding-puzzle/index.html",
            mobilePath: "sliding-puzzle/index.html",
            icon: "img/game.svg",
            desc: "移动端数字滑块拼图，支持 3×3、4×4、5×5 和历史最优记录。",
            readme: null,
            meta: null
        }
    ];

    windowObject.GAME_CATALOG = Object.freeze(catalog);
})(window);
