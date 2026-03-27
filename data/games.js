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
            slug: "gomoku",
            title: "五子棋",
            path: "gomoku/index.html",
            icon: "img/game.svg",
            desc: "支持人机与双人对战，可查看最近一局历史记录。",
            readme: "gomoku/readme.md",
            meta: null
        },
        {
            slug: "gomoku-advanced",
            title: "高级五子棋",
            path: "gomoku-advanced/index.html",
            icon: "img/game.svg",
            desc: "基于 worker 的高级 AI 版本，支持提示和调试信息。",
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
            desc: "递归回溯生成迷宫，支持移动端方向键和缩放操作。",
            readme: "maze/readme.md",
            meta: null
        }
    ];

    windowObject.GAME_CATALOG = Object.freeze(catalog);
})(window);
