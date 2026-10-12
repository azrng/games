// @ts-check
/* 俄罗斯方块原生重写版（替换 react-tetris 构建产物）。
 * 对标现代 Tetris Guideline：SRS 踢墙旋转、7-bag 随机、暂存（hold）、落点投影（ghost）、
 * T-spin / Back-to-Back / 连击计分、锁定延迟与触屏按键。
 * 纯逻辑封装在 createTetrisCore（不依赖 DOM，供 smoke test 直接驱动），
 * 本文件其余部分为 canvas 渲染与输入。 */

/* ==================== 常量 ==================== */

const TETRIS_COLS = 10;
const TETRIS_ROWS = 20;      // 可见行数
const TETRIS_HIDDEN = 2;     // 顶部隐藏行（出生区）

/* 各方块出生态坐标（y 向下为正）与旋转矩阵边长；其余旋转态由代码生成 */
const TETRIS_SPAWN = {
    I: { size: 4, cells: [[0, 1], [1, 1], [2, 1], [3, 1]] },
    O: { size: 4, cells: [[1, 0], [2, 0], [1, 1], [2, 1]] },
    T: { size: 3, cells: [[1, 0], [0, 1], [1, 1], [2, 1]] },
    J: { size: 3, cells: [[0, 0], [0, 1], [1, 1], [2, 1]] },
    L: { size: 3, cells: [[2, 0], [0, 1], [1, 1], [2, 1]] },
    S: { size: 3, cells: [[1, 0], [2, 0], [0, 1], [1, 1]] },
    Z: { size: 3, cells: [[0, 0], [1, 0], [1, 1], [2, 1]] }
};

/* 预计算 4 个旋转态：顺时针 (x, y) -> (size-1-y, x) */
const TETRIS_ROTATIONS = (() => {
    const table = {};
    for (const type of Object.keys(TETRIS_SPAWN)) {
        const { size, cells } = TETRIS_SPAWN[type];
        const rots = [cells];
        for (let r = 1; r < 4; r++) {
            rots.push(rots[r - 1].map(([x, y]) => [size - 1 - y, x]));
        }
        table[type] = rots;
    }
    return table;
})();

/* SRS 踢墙表（y 向下为正，由标准表翻转 y 得到）。键：起始态>目标态 */
const TETRIS_KICKS_JLSTZ = {
    '0>1': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
    '1>0': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
    '1>2': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
    '2>1': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
    '2>3': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
    '3>2': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
    '3>0': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
    '0>3': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]]
};

const TETRIS_KICKS_I = {
    '0>1': [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
    '1>0': [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
    '1>2': [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
    '2>1': [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
    '2>3': [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
    '3>2': [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
    '3>0': [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
    '0>3': [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]]
};

/* 方块配色（Guideline 惯例色）：用于暂存 / 预告小窗 */
const TETRIS_COLORS = {
    I: '#31c7ef', O: '#f7d308', T: '#ad4d9c',
    S: '#42b642', Z: '#ef2029', J: '#5a65ad', L: '#ef7921'
};

/* 复古掌机 LCD 配色：棋盘内网格与方块用墨绿单色，营造掌机屏幕观感 */
const TETRIS_LCD_INK = '#39482e';

const TETRIS_LOCK_DELAY = 0.5;   // 落地后锁定延迟（秒）
const TETRIS_LOCK_RESETS = 15;   // 锁定延迟最多重置次数
const TETRIS_CLEAR_TIME = 0.22;  // 消行闪烁时长（秒）

/* Guideline 重力曲线：level 对应的每行下落秒数 */
function tetrisGravitySeconds(level) {
    return Math.pow(0.8 - (level - 1) * 0.007, level - 1);
}

/* ==================== 核心逻辑（可独立测试） ==================== */

/**
 * 创建一局俄罗斯方块的纯逻辑实例。
 * @param {() => number} rng 返回 [0,1) 的随机数，测试可注入种子
 */
function createTetrisCore(rng = Math.random) {
    const totalRows = TETRIS_ROWS + TETRIS_HIDDEN;
    const board = Array.from({ length: totalRows }, () => Array(TETRIS_COLS).fill(null));
    const bag = [];
    const queue = [];

    const core = {
        board,
        queue,                   // 后续方块队列（预告区取前 3）
        active: null,            // { type, rot, x, y }
        hold: null,
        canHold: true,
        score: 0, lines: 0, level: 1, combo: -1,
        b2b: false,              // 上一次消行是否为"难消"（Tetris 或 T-spin）
        over: false,
        /* 锁定后由 core 填写本步结算：{ clears, rows, tspin, points } */
        lastLock: null,
        clearingRows: null,      // 消行动画进行中的满行号数组
        clearingT: 0,
        lockTimer: 0,
        lockResets: 0,
        gravityAcc: 0,           // 重力下落累积器（秒）
        lastAction: ''           // 'rotate' | 'move'，供 T-spin 判定
    };

    function refillQueue() {
        while (queue.length < 5) {
            if (!bag.length) {
                for (const t of ['I', 'J', 'L', 'O', 'S', 'T', 'Z']) bag.push(t);
                // 洗牌（Fisher–Yates）
                for (let i = bag.length - 1; i > 0; i--) {
                    const j = Math.floor(rng() * (i + 1));
                    [bag[i], bag[j]] = [bag[j], bag[i]];
                }
            }
            queue.push(bag.shift());
        }
    }

    function collides(type, rot, px, py) {
        for (const [cx, cy] of TETRIS_ROTATIONS[type][rot]) {
            const x = px + cx;
            const y = py + cy;
            if (x < 0 || x >= TETRIS_COLS || y >= totalRows) return true;
            if (y >= 0 && board[y][x]) return true;
        }
        return false;
    }

    function spawn(type) {
        const piece = { type, rot: 0, x: 3, y: 0 };
        if (collides(type, 0, piece.x, piece.y)) {
            core.over = true;
            core.active = piece; // 结束画面仍展示卡死的方块
            return null;
        }
        core.active = piece;
        core.lockTimer = 0;
        core.lockResets = 0;
        core.gravityAcc = 0;
        core.lastAction = '';
        return piece;
    }

    function spawnNext() {
        refillQueue();
        const type = queue.shift();
        refillQueue();
        return spawn(type);
    }

    /** 沿用锁定延迟重置规则：落地状态下成功操作可重置计时（有次数上限） */
    function onSuccessfulMove() {
        if (core.lockResets < TETRIS_LOCK_RESETS) {
            core.lockTimer = 0;
            core.lockResets += 1;
        }
    }

    return {
        core,

        /** 开始新的一局 */
        start() {
            board.forEach((row) => row.fill(null));
            bag.length = 0;
            queue.length = 0;
            core.active = null;
            core.hold = null;
            core.canHold = true;
            core.score = 0; core.lines = 0; core.level = 1; core.combo = -1;
            core.b2b = false; core.over = false;
            core.lastLock = null;
            core.clearingRows = null; core.clearingT = 0;
            spawnNext();
        },

        /** 水平移动，返回是否成功 */
        tryMove(dx) {
            const a = core.active;
            if (!a || core.over || core.clearingRows) return false;
            if (!collides(a.type, a.rot, a.x + dx, a.y)) {
                a.x += dx;
                core.lastAction = 'move';
                onSuccessfulMove();
                return true;
            }
            return false;
        },

        /** 旋转（dir: 1 顺时针 / -1 逆时针），SRS 踢墙，返回是否成功 */
        rotate(dir) {
            const a = core.active;
            if (!a || core.over || core.clearingRows) return false;
            if (a.type === 'O') return true; // O 旋转无变化，视为成功
            const from = a.rot;
            const to = (from + (dir === 1 ? 1 : 3)) % 4;
            const table = a.type === 'I' ? TETRIS_KICKS_I : TETRIS_KICKS_JLSTZ;
            const kicks = table[from + '>' + to];
            for (const [kx, ky] of kicks) {
                if (!collides(a.type, to, a.x + kx, a.y + ky)) {
                    a.rot = to;
                    a.x += kx;
                    a.y += ky;
                    core.lastAction = 'rotate';
                    onSuccessfulMove();
                    return true;
                }
            }
            return false;
        },

        /** 软降一行：成功时 +1 分，返回是否下移 */
        softDrop() {
            const a = core.active;
            if (!a || core.over || core.clearingRows) return false;
            if (!collides(a.type, a.rot, a.x, a.y + 1)) {
                a.y += 1;
                core.lastAction = 'move';
                core.score += 1;
                core.lockTimer = 0;
                core.gravityAcc = 0;
                return true;
            }
            return false;
        },

        /** 落点投影 y（ghost 所在行） */
        ghostY() {
            const a = core.active;
            if (!a) return -1;
            let y = a.y;
            while (!collides(a.type, a.rot, a.x, y + 1)) y += 1;
            return y;
        },

        /** 硬降：直接落到投影位置并锁定，返回下降格数 */
        hardDrop() {
            const a = core.active;
            if (!a || core.over || core.clearingRows) return 0;
            const target = this.ghostY();
            const dist = target - a.y;
            core.score += dist * 2;
            a.y = target;
            this.lockPiece();
            return dist;
        },

        /** 暂存 / 换回：每块锁定前只能用一次 */
        doHold() {
            const a = core.active;
            if (!a || core.over || core.clearingRows || !core.canHold) return false;
            const prev = core.hold;
            core.hold = a.type;
            core.canHold = false;
            if (prev) spawn(prev);
            else spawnNext();
            return true;
        },

        /** T-spin 判定（3 角规则）：锁定时若最后动作是旋转且 T 块四角占用 ≥3 */
        detectTSpin() {
            const a = core.active;
            if (!a || a.type !== 'T' || core.lastAction !== 'rotate') return null;
            const occupied = (x, y) => x < 0 || x >= TETRIS_COLS || y >= totalRows
                || (y >= 0 && !!board[y][x]);
            // T 中心位于 (x+1, y+1)，四角按 [左上, 右上, 左下, 右下]
            const corners = [
                occupied(a.x, a.y), occupied(a.x + 2, a.y),
                occupied(a.x, a.y + 2), occupied(a.x + 2, a.y + 2)
            ];
            const filled = corners.filter(Boolean).length;
            if (filled < 3) return null;
            // 尖端朝向的两个侧角：rot0 朝上取上两角，顺时针依次转
            const tipCorners = [[0, 1], [1, 3], [2, 3], [0, 2]][a.rot];
            const frontBoth = corners[tipCorners[0]] && corners[tipCorners[1]];
            return frontBoth ? 'full' : 'mini';
        },

        /** 锁定当前方块：写入棋盘 → 结算消行/得分 → 进入消行动画或直接发牌 */
        lockPiece() {
            const a = core.active;
            if (!a) return;
            const tspin = this.detectTSpin();
            for (const [cx, cy] of TETRIS_ROTATIONS[a.type][a.rot]) {
                const y = a.y + cy;
                if (y >= 0) board[y][a.x + cx] = a.type;
            }
            core.active = null;
            core.canHold = true; // 新块解锁暂存

            // 满行检测（含隐藏行）
            const rows = [];
            for (let y = 0; y < totalRows; y++) {
                if (board[y].every(Boolean)) rows.push(y);
            }
            const clears = rows.length;

            // 计分：基础分 × 等级，难消（Tetris / T-spin 消行）吃 Back-to-Back 加成
            let base = 0;
            if (tspin === 'full') base = [400, 800, 1200, 1600][clears];
            else if (tspin === 'mini') base = [100, 200, 400][clears];
            else base = [0, 100, 300, 500, 800][clears];
            const difficult = clears === 4 || (tspin !== null && clears > 0);
            if (base > 0 && difficult && core.b2b) base *= 1.5;
            core.b2b = clears === 0 ? core.b2b : difficult;
            let points = base * core.level;

            if (clears > 0) {
                core.combo += 1;
                if (core.combo >= 1) points += 50 * core.combo * core.level;
            } else {
                core.combo = -1;
            }
            core.score += points;
            core.lines += clears;
            core.level = 1 + Math.floor(core.lines / 10);

            core.lastLock = { clears, rows, tspin, points };

            if (clears > 0) {
                core.clearingRows = rows;
                core.clearingT = 0;
            } else {
                spawnNext();
            }
        },

        /** 推进时间：消行动画 + 重力下落 + 锁定延迟。dt 单位秒 */
        advance(dt) {
            if (core.over) return;
            if (core.clearingRows) {
                core.clearingT += dt;
                if (core.clearingT >= TETRIS_CLEAR_TIME) {
                    // 从大到小删行，行号不受前面删行影响
                    const rowsDesc = core.clearingRows.slice().sort((x, y) => y - x);
                    for (const y of rowsDesc) {
                        board.splice(y, 1);
                        board.unshift(Array(TETRIS_COLS).fill(null));
                    }
                    core.clearingRows = null;
                    spawnNext();
                }
                return;
            }
            const a = core.active;
            if (!a) return;

            if (collides(a.type, a.rot, a.x, a.y + 1)) {
                // 已落地：推进锁定延迟，耗尽即锁
                core.lockTimer += dt;
                if (core.lockTimer >= TETRIS_LOCK_DELAY) this.lockPiece();
                return;
            }
            // 悬空：按重力节奏自由下落（独立累积器，与锁定延迟无关）
            core.gravityAcc += dt;
            const gravity = tetrisGravitySeconds(core.level);
            while (core.gravityAcc >= gravity && !collides(a.type, a.rot, a.x, a.y + 1)) {
                core.gravityAcc -= gravity;
                a.y += 1;
                core.lastAction = 'move';
            }
            if (collides(a.type, a.rot, a.x, a.y + 1)) core.gravityAcc = 0;
        }
    };
}

/* ==================== 页面 UI ==================== */

function initTetrisPage() {
    const boardCanvas = document.getElementById('board-canvas');
    const holdCanvas = document.getElementById('hold-canvas');
    const nextCanvas = document.getElementById('next-canvas');
    const overlay = document.getElementById('overlay');
    const overlayTitle = document.getElementById('overlay-title');
    const overlayDesc = document.getElementById('overlay-desc');
    const overlayBtn = document.getElementById('overlay-btn');
    const scoreText = document.getElementById('score-text');
    const levelText = document.getElementById('level-text');
    const linesText = document.getElementById('lines-text');
    const bestText = document.getElementById('best-text');
    const musicBtn = document.getElementById('music-btn');
    const holdBtn = document.getElementById('hold-btn');
    const lcdMusic = document.getElementById('lcd-music');
    const lcdPause = document.getElementById('lcd-pause');

    const CELL = 30;
    const dpr = window.devicePixelRatio || 1;
    const bctx = boardCanvas.getContext('2d');
    const hctx = holdCanvas.getContext('2d');
    const nctx = nextCanvas.getContext('2d');

    let game = null;
    let state = 'menu'; // menu | playing | paused | over
    /* 菜单状态下用演示实例渲染预告区，未开局也能看到下一个方块（对齐掌机版观感） */
    const demoGame = createTetrisCore();
    demoGame.start();
    let best = 0;
    let musicOn = false;
    let music = null;

    /* 触屏设备的浮层文案改为触控话术（桌面保持键盘话术） */
    const IS_TOUCH = window.matchMedia('(hover: none) and (pointer: coarse)').matches;

    /* DAS/ARR：按住方向键先延迟后连发 */
    const DAS = 0.17;
    const ARR = 0.04;
    const held = { left: false, right: false, soft: false };
    let heldDir = 0;          // -1 左 / 1 右（后按覆盖先按）
    let dasTimer = 0;
    let arrTimer = 0;
    let softTimer = 0;

    try {
        best = Number(localStorage.getItem('app_tetris_best_v1')) || 0;
    } catch (error) {
        best = 0; // 隐私模式等存储不可用时最高分不持久化
    }
    bestText.textContent = padDigits(best, 6);
    // 菜单态即显示初始数值（掌机版开机即亮数码管）
    scoreText.textContent = padDigits(0, 6);
    levelText.textContent = padDigits(1, 2);
    linesText.textContent = padDigits(0, 3);

    /* 画布高分屏适配 */
    function setupCanvas(canvas, ctx, w, h) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    setupCanvas(boardCanvas, bctx, TETRIS_COLS * CELL, TETRIS_ROWS * CELL);
    setupCanvas(holdCanvas, hctx, 128, 128);
    setupCanvas(nextCanvas, nctx, 128, 128);

    /* 复古掌机画法：方块 = 外描边方框 + 中心实心小方块（「回」字格），color 缺省用 LCD 墨绿 */
    function drawCell(ctx, px, py, size, type, alpha = 1, color = '') {
        const ink = color || TETRIS_LCD_INK;
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = ink;
        ctx.lineWidth = Math.max(2, size * 0.11);
        ctx.strokeRect(px + 1.5, py + 1.5, size - 3, size - 3);
        const inner = Math.max(3, size * 0.34);
        ctx.fillStyle = ink;
        ctx.fillRect(px + (size - inner) / 2, py + (size - inner) / 2, inner, inner);
        ctx.globalAlpha = 1;
    }

    function drawMini(ctx, type, cx, cy) {
        const cells = TETRIS_ROTATIONS[type][0];
        const size = 32; /* 与状态列幽灵格（32px）同尺寸，块与格对齐 */
        const xs = cells.map((c) => c[0]);
        const ys = cells.map((c) => c[1]);
        const minX = Math.min(...xs), maxX = Math.max(...xs);
        const minY = Math.min(...ys), maxY = Math.max(...ys);
        const w = (maxX - minX + 1) * size;
        const h = (maxY - minY + 1) * size;
        for (const [x, y] of cells) {
            drawCell(ctx, cx - w / 2 + (x - minX) * size, cy - h / 2 + (y - minY) * size, size, type);
        }
    }

    function render() {
        const W = TETRIS_COLS * CELL;
        const H = TETRIS_ROWS * CELL;
        bctx.clearRect(0, 0, W, H);
        // 空格网格由 CSS 回字纹理背景提供，画布不再重复绘制网格线

        if (!game) {
            // 菜单状态：棋盘留空，仅展示预告队列
            nctx.clearRect(0, 0, 128, 128);
            if (demoGame.core.queue[0]) drawMini(nctx, demoGame.core.queue[0], 64, 64);
            return;
        }
        const { core } = game;

        // 已固定的方块（跳过隐藏行）
        for (let y = TETRIS_HIDDEN; y < TETRIS_ROWS + TETRIS_HIDDEN; y++) {
            for (let x = 0; x < TETRIS_COLS; x++) {
                const type = core.board[y][x];
                if (type) drawCell(bctx, x * CELL, (y - TETRIS_HIDDEN) * CELL, CELL, type, 1, TETRIS_LCD_INK);
            }
        }

        // 消行闪烁
        if (core.clearingRows) {
            const k = 1 - core.clearingT / TETRIS_CLEAR_TIME;
            bctx.globalAlpha = 0.85 * k;
            bctx.fillStyle = '#ffffff';
            for (const y of core.clearingRows) {
                if (y >= TETRIS_HIDDEN) bctx.fillRect(0, (y - TETRIS_HIDDEN) * CELL, W, CELL);
            }
            bctx.globalAlpha = 1;
        }

        const a = core.active;
        if (a && !core.over) {
            // 落点投影
            const gy = game.ghostY();
            for (const [cx, cy] of TETRIS_ROTATIONS[a.type][a.rot]) {
                const y = gy + cy;
                if (y >= TETRIS_HIDDEN) {
                    drawCell(bctx, (a.x + cx) * CELL, (y - TETRIS_HIDDEN) * CELL, CELL, a.type, 0.22, TETRIS_LCD_INK);
                }
            }
            // 当前方块
            for (const [cx, cy] of TETRIS_ROTATIONS[a.type][a.rot]) {
                const y = a.y + cy;
                if (y >= TETRIS_HIDDEN) {
                    drawCell(bctx, (a.x + cx) * CELL, (y - TETRIS_HIDDEN) * CELL, CELL, a.type, 1, TETRIS_LCD_INK);
                }
            }
        }

        // 暂存区
        hctx.clearRect(0, 0, 128, 128);
        if (core.hold) drawMini(hctx, core.hold, 64, 64);
        if (!core.canHold) {
            hctx.globalAlpha = 0.35;
            hctx.fillStyle = 'rgba(47, 61, 38, 0.9)';
            hctx.fillRect(0, 0, 128, 128);
            hctx.globalAlpha = 1;
        }

        // 预告区（掌机版只展示下一个）
        nctx.clearRect(0, 0, 128, 128);
        if (core.queue[0]) drawMini(nctx, core.queue[0], 64, 64);
    }

    /* 数码管数值：前导空白位透出底下的幽灵 8（\u2007 等宽空格） */
    function padDigits(value, width) {
        return String(value).padStart(width, '\u2007');
    }

    function updateHud() {
        if (!game) return;
        scoreText.textContent = padDigits(game.core.score, 6);
        levelText.textContent = padDigits(game.core.level, 2);
        linesText.textContent = padDigits(game.core.lines, 3);
    }

    function saveBest() {
        if (!game) return;
        if (game.core.score > best) {
            best = game.core.score;
            bestText.textContent = padDigits(best, 6);
            try {
                localStorage.setItem('app_tetris_best_v1', String(best));
            } catch (error) {
                /* 存储不可用时仅本次会话生效 */
            }
        }
    }

    function showOverlay(title, desc, btnText) {
        overlayTitle.textContent = title;
        overlayDesc.textContent = desc;
        overlayBtn.textContent = btnText;
        overlay.classList.remove('hidden');
    }

    function startGame() {
        game = createTetrisCore();
        game.start();
        state = 'playing';
        overlay.classList.add('hidden');
        overlay.classList.remove('is-menu');
        updateHud();
        render();
    }

    function togglePause() {
        if (state === 'playing') {
            state = 'paused';
            lcdPause.classList.add('is-on');
            showOverlay('已暂停', IS_TOUCH ? '点击屏幕继续' : '按 P 或点击屏幕继续', '继续');
        } else if (state === 'paused') {
            state = 'playing';
            lcdPause.classList.remove('is-on');
            overlay.classList.add('hidden');
        }
    }

    function endGameIfOver() {
        if (game && game.core.over && state !== 'over') {
            state = 'over';
            saveBest();
            showOverlay('游戏结束', '本局 ' + game.core.score + ' 分 · ' + game.core.lines + ' 行', '再来一局');
        }
    }

    /* 键盘输入（忽略长按 repeat，连发由 DAS 统一驱动） */
    document.addEventListener('keydown', (e) => {
        if (state === 'menu' || state === 'over') {
            // 掌机版习惯：按任意键开局（保留刷新/开发者工具等系统键不拦截）
            if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key !== 'F5' && !e.key.startsWith('F')) {
                if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
                startGame();
            }
            return;
        }
        if (e.code === 'KeyP' || e.code === 'Escape') { e.preventDefault(); togglePause(); return; }
        if (e.code === 'KeyR') { e.preventDefault(); startGame(); return; }
        if (e.code === 'KeyS') { e.preventDefault(); toggleMusic(); return; }
        if (state !== 'playing') return;
        switch (e.code) {
            case 'ArrowLeft': if (!e.repeat) { held.left = true; heldDir = -1; dasTimer = 0; arrTimer = 0; game.tryMove(-1); } e.preventDefault(); break;
            case 'ArrowRight': if (!e.repeat) { held.right = true; heldDir = 1; dasTimer = 0; arrTimer = 0; game.tryMove(1); } e.preventDefault(); break;
            case 'ArrowDown': if (!e.repeat) held.soft = true; e.preventDefault(); break;
            case 'ArrowUp': case 'KeyX': if (!e.repeat) game.rotate(1); e.preventDefault(); break;
            case 'KeyZ': if (!e.repeat) game.rotate(-1); e.preventDefault(); break;
            case 'Space': if (!e.repeat) game.hardDrop(); e.preventDefault(); break;
            case 'KeyC': case 'ShiftLeft': case 'ShiftRight': if (!e.repeat) game.doHold(); e.preventDefault(); break;
            default: break;
        }
    });

    document.addEventListener('keyup', (e) => {
        if (e.code === 'ArrowLeft') { held.left = false; if (heldDir === -1) heldDir = held.right ? 1 : 0; dasTimer = 0; }
        if (e.code === 'ArrowRight') { held.right = false; if (heldDir === 1) heldDir = held.left ? -1 : 0; dasTimer = 0; }
        if (e.code === 'ArrowDown') held.soft = false;
    });

    /* 触屏按键：与键盘同一动作入口；左右/软降支持按住连发 */
    for (const btn of document.querySelectorAll('.touch-pad button')) {
        const act = btn.dataset.act;
        btn.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            if (state === 'menu' || state === 'over') { startGame(); return; }
            if (state !== 'playing') return;
            if (act === 'left') { held.left = true; heldDir = -1; dasTimer = 0; game.tryMove(-1); }
            else if (act === 'right') { held.right = true; heldDir = 1; dasTimer = 0; game.tryMove(1); }
            else if (act === 'soft') { held.soft = true; }
            else if (act === 'rotate-cw') game.rotate(1);
            else if (act === 'hard') game.hardDrop();
            else if (act === 'hold') game.doHold();
        });
        const release = () => {
            if (act === 'left') { held.left = false; if (heldDir === -1) heldDir = 0; dasTimer = 0; }
            if (act === 'right') { held.right = false; if (heldDir === 1) heldDir = 0; dasTimer = 0; }
            if (act === 'soft') held.soft = false;
        };
        btn.addEventListener('pointerup', release);
        btn.addEventListener('pointercancel', release);
        btn.addEventListener('pointerleave', release);
        // 阻止双击缩放与长按菜单
        btn.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    /* 点浮层任意处：菜单/结束开局，暂停中继续（掌机版“按任意键开始”习惯） */
    overlay.addEventListener('pointerdown', () => {
        if (state === 'menu' || state === 'over') startGame();
        else if (state === 'paused') togglePause();
    });

    window.addEventListener('blur', () => {
        if (state === 'playing') togglePause();
    });

    /* 背景音乐：点击音效键或按 S 循环播放（受浏览器自动播放策略约束，首次交互后才可出声） */
    function toggleMusic() {
        if (!music) {
            music = new Audio('music.mp3');
            music.loop = true;
            music.volume = 0.35;
        }
        musicOn = !musicOn;
        if (musicOn) {
            music.play().then(() => {
                musicBtn.setAttribute('aria-pressed', 'true');
                lcdMusic.classList.add('is-on');
            }).catch(() => {
                musicOn = false;
            });
        } else {
            music.pause();
            music.currentTime = 0;
            musicBtn.setAttribute('aria-pressed', 'false');
            lcdMusic.classList.remove('is-on');
        }
    }

    musicBtn.addEventListener('click', (e) => {
        e.currentTarget.blur();
        toggleMusic();
    });

    /* 掌机实体键：暂停 / 重玩 / 暂存。点击后归还焦点，避免空格键误触按钮 */
    document.getElementById('pause-btn').addEventListener('click', (e) => {
        e.currentTarget.blur();
        if (state === 'playing' || state === 'paused') togglePause();
    });

    document.getElementById('restart-btn').addEventListener('click', (e) => {
        e.currentTarget.blur();
        startGame();
    });

    holdBtn.addEventListener('click', (e) => {
        e.currentTarget.blur();
        if (state === 'playing' && game) game.doHold();
    });

    /* LCD 时钟：掌机屏幕右下角显示实时时间 */
    const lcdClock = document.getElementById('lcd-clock');
    function tickClock() {
        const now = new Date();
        lcdClock.textContent = String(now.getHours()).padStart(2, '0')
            + ':' + String(now.getMinutes()).padStart(2, '0');
    }
    tickClock();
    setInterval(tickClock, 1000);

    /* 主循环 */
    let lastT = performance.now();
    function loop(t) {
        const dt = Math.min(0.05, (t - lastT) / 1000);
        lastT = t;
        if (game && state === 'playing') {
            // 消行动画期间不处理输入与重力
            if (game.core.clearingRows) {
                game.advance(dt);
            } else {
                // DAS/ARR 水平连发
                if (heldDir !== 0) {
                    dasTimer += dt;
                    if (dasTimer >= DAS) {
                        arrTimer += dt;
                        while (arrTimer >= ARR) {
                            arrTimer -= ARR;
                            if (!game.tryMove(heldDir)) break;
                        }
                    }
                }
                // 软降连发
                if (held.soft) {
                    softTimer += dt;
                    while (softTimer >= 0.04) {
                        softTimer -= 0.04;
                        if (!game.softDrop()) break;
                    }
                } else {
                    softTimer = 0;
                }
                game.advance(dt);
            }
            updateHud();
            endGameIfOver();
        }
        render();
        requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);

    render();
}

/* ==================== 导出与启动 ==================== */

window.Tetris = {
    createTetrisCore,
    TETRIS_ROTATIONS,
    TETRIS_KICKS_JLSTZ,
    TETRIS_KICKS_I,
    tetrisGravitySeconds,
    constants: {
        COLS: TETRIS_COLS, ROWS: TETRIS_ROWS, HIDDEN: TETRIS_HIDDEN,
        LOCK_DELAY: TETRIS_LOCK_DELAY, CLEAR_TIME: TETRIS_CLEAR_TIME
    }
};

if (typeof document !== 'undefined' && document.getElementById('board-canvas')) {
    initTetrisPage();
}
