// @ts-check
(function setupBreakout(windowObject, documentObject) {
    'use strict';

    /* ---------- 常量配置 ---------- */
    const SLUG = 'breakout';
    const UNLOCK_KEY = 'breakout-unlocked-level';
    const BEST_KEY = 'breakout-best';
    const BASE_SEED = 20261010;
    const TOTAL_LEVELS = 6;
    const INITIAL_LIVES = 3;
    const SCORE_PER_BRICK = 10;

    /* 逻辑画布 480×640：全部游戏逻辑基于逻辑坐标，渲染时按容器宽度整体缩放 */
    const BOARD_WIDTH = 480;
    const BOARD_HEIGHT = 640;

    /* 砖阵几何：格距 = 砖宽 + 缝隙；10 列砖阵左右各留 12px 边距 */
    const BRICK_WIDTH = 42;
    const BRICK_HEIGHT = 22;
    const BRICK_GAP = 4;
    const BRICK_CELL_W = BRICK_WIDTH + BRICK_GAP;
    const BRICK_CELL_H = BRICK_HEIGHT + BRICK_GAP;
    const GRID_LEFT = 12;
    const GRID_TOP = 64;
    const SLICE_LENGTH = BRICK_HEIGHT / 2; // 分片步进上限取砖厚一半，杜绝高速穿透

    const BALL_RADIUS = 7;
    const PADDLE_WIDTH = 76;
    const PADDLE_HEIGHT = 14;
    const PADDLE_Y = 592;     // 挡板顶边 y（逻辑坐标）
    const PADDLE_SPEED = 460; // 方向键控板速度（px/s）

    /* 球速：基础值随关卡上浮 6%/关，随存活时间缓增，封顶 560px/s */
    const BASE_SPEED = 320;
    const LEVEL_SPEED_FACTOR = 0.06;
    const SPEED_RAMP = 8; // 每存活 1 秒增加的球速（px/s）
    const MAX_SPEED = 560;

    /* 砖块按行取色：蓝色系由浅到深，与平台主色呼应 */
    const BRICK_ROW_COLORS = ['#8db9ff', '#77aaff', '#6199fd', '#4b8bf9', '#3780f4', '#2563eb', '#1d4ed8'];
    const COLORS = {
        boardBase: '#0d1530',
        paddle: '#60a5fa',
        ball: '#f8fafc',
        hint: 'rgba(234, 240, 255, 0.88)'
    };

    const memoryFallback = {};

    const state = {
        phase: 'idle', // idle | ready(球贴板待发) | running | paused | over
        level: 1,
        layout: null, // { rows, cols, bricks }
        score: 0,
        lives: INITIAL_LIVES,
        best: 0,
        recordBase: 0, // 本局开始时的最高分，用于结算时判断是否破纪录
        ball: { x: BOARD_WIDTH / 2, y: PADDLE_Y - BALL_RADIUS - 1, vx: 0, vy: 0 },
        paddleX: BOARD_WIDTH / 2,
        aliveTime: 0, // 球本次存活秒数，驱动球速缓增
        keysHeld: { left: false, right: false },
        modal: '', // '' | 'clear' | 'win' | 'lose' | 'levels'：弹窗打开时冻结对局输入
        storageAvailable: true,
        lastFrameTime: 0
    };

    const elements = {
        levelText: documentObject.getElementById('level-text'),
        scoreText: documentObject.getElementById('score-text'),
        leftText: documentObject.getElementById('left-text'),
        livesText: documentObject.getElementById('lives-text'),
        board: documentObject.getElementById('board'),
        startBtn: documentObject.getElementById('start-btn'),
        restartBtn: documentObject.getElementById('restart-btn'),
        levelsBtn: documentObject.getElementById('levels-btn'),
        resultModal: documentObject.getElementById('result-modal'),
        resultEyebrow: documentObject.getElementById('result-eyebrow'),
        resultTitle: documentObject.getElementById('result-title'),
        recordBadge: documentObject.getElementById('record-badge'),
        resultScore: documentObject.getElementById('result-score'),
        resultBest: documentObject.getElementById('result-best'),
        resultLevel: documentObject.getElementById('result-level'),
        resultLevelsBtn: documentObject.getElementById('result-levels-btn'),
        resultPrimaryBtn: documentObject.getElementById('result-primary-btn'),
        levelModal: documentObject.getElementById('level-modal'),
        levelGrid: documentObject.getElementById('level-grid'),
        closeLevelsBtn: documentObject.getElementById('close-levels-btn')
    };

    const context2d = elements.board.getContext('2d');

    /* ---------- 存档：try/catch + 内存兜底 ---------- */

    function safeGetItem(key) {
        try {
            return windowObject.localStorage.getItem(key);
        } catch (_) {
            return Object.prototype.hasOwnProperty.call(memoryFallback, key) ? memoryFallback[key] : null;
        }
    }

    function safeSetItem(key, value) {
        try {
            windowObject.localStorage.setItem(key, value);
        } catch (_) {
            memoryFallback[key] = value;
        }
    }

    /* 探测本地存储是否真正可用（隐私模式等场景），不可用时最高分卡片显示为 — */
    function detectStorageAvailable() {
        try {
            const probeKey = `${SLUG}-storage-probe`;
            windowObject.localStorage.setItem(probeKey, '1');
            windowObject.localStorage.removeItem(probeKey);
            return true;
        } catch (_) {
            return false;
        }
    }

    /* 解锁进度：1 起的整数，只增不减；无存档或坏数据兜底为 1 */
    function readUnlocked() {
        const parsed = Number.parseInt(safeGetItem(UNLOCK_KEY) || '', 10);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
    }

    function writeUnlocked(level) {
        const next = Math.max(readUnlocked(), level);
        safeSetItem(UNLOCK_KEY, String(next));
        return next;
    }

    /* 历史最高总分：无存档或坏数据兜底为 0 */
    function readBest() {
        const parsed = Number.parseInt(safeGetItem(BEST_KEY) || '', 10);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
    }

    /* 写入最高分：只增不减，返回写入后的最高分 */
    function writeBest(score) {
        const next = Math.max(readBest(), score);
        safeSetItem(BEST_KEY, String(next));
        return next;
    }

    /* ---------- 纯函数（挂 window.Breakout 供 smoke 测试断言） ---------- */

    /* mulberry32 种子随机数，保证同关卡布局可复现 */
    function mulberry32(seed) {
        let a = seed >>> 0;
        return function random() {
            a += 0x6D2B79F5;
            let t = a;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    function levelSeed(level, seedBase) {
        const base = Number.isFinite(seedBase) ? seedBase : BASE_SEED;
        return (base + level * 6271) >>> 0;
    }

    /* 确定性生成砖阵：行数 min(3+level, 7)、固定 10 列、密度 0.55+level×0.06；
       第 2 行起隔行强制留一条空道，避免砖阵封死出现打不到的死角 */
    function generateLayout(level, seedBase) {
        const rows = Math.min(3 + level, 7);
        const cols = 10;
        const density = 0.55 + level * 0.06;
        const random = mulberry32(levelSeed(level, seedBase));
        const bricks = [];
        for (let row = 0; row < rows; row += 1) {
            const cells = new Array(cols).fill(false);
            /* 奇数行（第 2、4、6 行）按种子随机选一列留空 */
            const laneCol = row >= 1 && row % 2 === 1 ? Math.floor(random() * cols) : -1;
            for (let col = 0; col < cols; col += 1) {
                if (col === laneCol) continue;
                cells[col] = random() < density;
            }
            bricks.push(cells);
        }
        return { rows, cols, bricks };
    }

    /* 挡板反弹角：offset ∈ [-1,1]（命中点相对挡板中心的偏移比例）→ 出射速度方向角（弧度）。
       采用 canvas 坐标（y 向下）：-90° 为竖直向上；offset 从 -1 到 1 线性映射到 -150°~-30°，
       即出射方向与水平方向的夹角恒在 [30°,150°] 区间内，垂直分量绝对值 ≥ sin(30°) = 0.5，
       天然杜绝水平死循环 */
    function reflectAngle(offset) {
        const clamped = Math.max(-1, Math.min(1, Number(offset) || 0));
        return (clamped * 60 - 90) * Math.PI / 180;
    }

    /* 球（圆）与砖（矩形）相交检测：取砖上离球心最近的点，距离 ≤ 半径即命中 */
    function hitsBrick(x, y, brickX, brickY) {
        const nearestX = Math.max(brickX, Math.min(x, brickX + BRICK_WIDTH));
        const nearestY = Math.max(brickY, Math.min(y, brickY + BRICK_HEIGHT));
        const dx = x - nearestX;
        const dy = y - nearestY;
        return dx * dx + dy * dy <= BALL_RADIUS * BALL_RADIUS;
    }

    /* 位移分片推进球：每片位移 ≤ 砖厚一半，高速也不穿透。
       入参 state: { x, y, vx, vy, dt, paddleX, paddleWidth?, bricks }，不修改入参；
       返回 { x, y, vx, vy, bricks, brickHit, paddleHit, bottom }：
       - brickHit: { row, col, axis } | null，axis 为本次应反转的速度轴（'x' | 'y'），
         按进入前位置判定：进入前球整体在砖左右侧之外 → 横向撞入反 x，否则纵向撞入反 y
       - paddleHit: 是否触碰挡板（仅球下行时判定防粘连），命中后按 reflectAngle 出射
       - bottom: 球是否落出底边（含半径完全越出） */
    function stepBall(state) {
        const bricks = state.bricks.map((row) => row.slice());
        const paddleWidth = Number.isFinite(state.paddleWidth) ? state.paddleWidth : PADDLE_WIDTH;
        const paddleHalf = paddleWidth / 2;
        let x = state.x;
        let y = state.y;
        let vx = state.vx;
        let vy = state.vy;
        const distance = Math.hypot(vx, vy) * state.dt;
        const slices = Math.max(1, Math.ceil(distance / SLICE_LENGTH));
        const stepDt = state.dt / slices;
        let brickHit = null;
        let paddleHit = false;
        let bottom = false;

        for (let slice = 0; slice < slices && !bottom; slice += 1) {
            const prevX = x;
            const prevY = y;
            x += vx * stepDt;
            y += vy * stepDt;

            /* 左右墙与顶墙反弹 */
            if (x - BALL_RADIUS < 0) {
                x = BALL_RADIUS;
                vx = Math.abs(vx);
            } else if (x + BALL_RADIUS > BOARD_WIDTH) {
                x = BOARD_WIDTH - BALL_RADIUS;
                vx = -Math.abs(vx);
            }
            if (y - BALL_RADIUS < 0) {
                y = BALL_RADIUS;
                vy = Math.abs(vy);
            }

            /* 撞砖：本片只处理第一块命中，相邻砖留给后续分片，避免一次反弹多块的方向歧义 */
            const colMin = Math.max(0, Math.floor((x - BALL_RADIUS - GRID_LEFT) / BRICK_CELL_W));
            const colMax = Math.min(bricks.length > 0 ? bricks[0].length - 1 : -1,
                Math.floor((x + BALL_RADIUS - GRID_LEFT) / BRICK_CELL_W));
            const rowMin = Math.max(0, Math.floor((y - BALL_RADIUS - GRID_TOP) / BRICK_CELL_H));
            const rowMax = Math.min(bricks.length - 1, Math.floor((y + BALL_RADIUS - GRID_TOP) / BRICK_CELL_H));
            for (let row = rowMin; row <= rowMax && !brickHit; row += 1) {
                for (let col = colMin; col <= colMax; col += 1) {
                    if (!bricks[row] || !bricks[row][col]) continue;
                    const brickX = GRID_LEFT + col * BRICK_CELL_W;
                    const brickY = GRID_TOP + row * BRICK_CELL_H;
                    if (!hitsBrick(x, y, brickX, brickY)) continue;
                    bricks[row][col] = false;
                    /* 轴判定用进入前位置：进入前在砖左右侧之外 → 横向撞入反 x，否则反 y */
                    const enteredFromSide = prevX < brickX - BALL_RADIUS || prevX > brickX + BRICK_WIDTH + BALL_RADIUS;
                    if (enteredFromSide) {
                        vx = vx > 0 ? -Math.abs(vx) : Math.abs(vx);
                        brickHit = { row, col, axis: 'x' };
                    } else {
                        vy = vy > 0 ? -Math.abs(vy) : Math.abs(vy);
                        brickHit = { row, col, axis: 'y' };
                    }
                    break;
                }
            }

            /* 挡板：仅球下行时判定；命中后按命中偏移映射出射角，并把球抬回板顶防粘连 */
            if (vy > 0
                && y + BALL_RADIUS >= PADDLE_Y && y - BALL_RADIUS <= PADDLE_Y + PADDLE_HEIGHT
                && x >= state.paddleX - paddleHalf - BALL_RADIUS && x <= state.paddleX + paddleHalf + BALL_RADIUS) {
                const angle = reflectAngle((x - state.paddleX) / paddleHalf);
                const speed = Math.hypot(vx, vy);
                vx = Math.cos(angle) * speed;
                vy = Math.sin(angle) * speed;
                y = PADDLE_Y - BALL_RADIUS;
                paddleHit = true;
            }

            /* 落底：球整体越出底边 */
            if (y - BALL_RADIUS > BOARD_HEIGHT) {
                bottom = true;
            }
        }

        return { x, y, vx, vy, bricks, brickHit, paddleHit, bottom };
    }

    /* ---------- 派生计算 ---------- */

    function baseSpeed(level) {
        return BASE_SPEED * (1 + LEVEL_SPEED_FACTOR * (level - 1));
    }

    function countBricks(bricks) {
        let total = 0;
        for (const row of bricks) {
            for (const cell of row) {
                if (cell) total += 1;
            }
        }
        return total;
    }

    /* ---------- 渲染 ---------- */

    /* 渲染缩放：canvas 物理像素 = 逻辑尺寸 × 容器缩放比 × dpr，
       绘制前统一 setTransform，游戏逻辑始终使用 480×640 逻辑坐标 */
    let renderScale = 1;

    function resizeCanvas() {
        const clientWidth = elements.board.clientWidth;
        const fitScale = clientWidth > 0 ? clientWidth / BOARD_WIDTH : 1;
        const dpr = windowObject.devicePixelRatio || 1;
        renderScale = fitScale * dpr;
        elements.board.width = Math.round(BOARD_WIDTH * renderScale);
        elements.board.height = Math.round(BOARD_HEIGHT * renderScale);
        drawGame();
    }

    /* 手绘圆角矩形路径，避免依赖兼容性较差的 ctx.roundRect API */
    function traceRoundRect(ctx, x, y, width, height, radius) {
        const r = Math.max(0, Math.min(radius, width / 2, height / 2));
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + width, y, x + width, y + height, r);
        ctx.arcTo(x + width, y + height, x, y + height, r);
        ctx.arcTo(x, y + height, x, y, r);
        ctx.arcTo(x, y, x + width, y, r);
        ctx.closePath();
    }

    function drawGame() {
        const ctx = context2d;
        ctx.setTransform(renderScale, 0, 0, renderScale, 0, 0);
        ctx.fillStyle = COLORS.boardBase;
        ctx.fillRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);

        /* 砖阵：按行取色 */
        if (state.layout) {
            for (let row = 0; row < state.layout.rows; row += 1) {
                const color = BRICK_ROW_COLORS[row % BRICK_ROW_COLORS.length];
                for (let col = 0; col < state.layout.cols; col += 1) {
                    if (!state.layout.bricks[row][col]) continue;
                    ctx.fillStyle = color;
                    traceRoundRect(
                        ctx,
                        GRID_LEFT + col * BRICK_CELL_W,
                        GRID_TOP + row * BRICK_CELL_H,
                        BRICK_WIDTH,
                        BRICK_HEIGHT,
                        6
                    );
                    ctx.fill();
                }
            }
        }

        /* 挡板 */
        ctx.fillStyle = COLORS.paddle;
        traceRoundRect(ctx, state.paddleX - PADDLE_WIDTH / 2, PADDLE_Y, PADDLE_WIDTH, PADDLE_HEIGHT, 7);
        ctx.fill();

        /* 球 */
        ctx.fillStyle = COLORS.ball;
        ctx.beginPath();
        ctx.arc(state.ball.x, state.ball.y, BALL_RADIUS, 0, Math.PI * 2);
        ctx.fill();

        drawBoardHint();
    }

    /* 待机 / 待发 / 暂停时在棋盘中央给操作提示 */
    function drawBoardHint() {
        let text = '';
        if (state.phase === 'idle') text = '点「开始」或按空格开局';
        else if (state.phase === 'ready') text = '点击 / 空格发射小球';
        else if (state.phase === 'paused') text = '已暂停 — 空格继续';
        if (!text) return;
        const ctx = context2d;
        ctx.fillStyle = COLORS.hint;
        ctx.font = 'bold 20px "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, BOARD_WIDTH / 2, BOARD_HEIGHT / 2 + 40);
    }

    /* ---------- 界面同步 ---------- */

    function updateHud() {
        elements.levelText.textContent = `第 ${state.level}/${TOTAL_LEVELS} 关`;
        elements.scoreText.textContent = String(state.score);
        elements.leftText.textContent = state.layout ? String(countBricks(state.layout.bricks)) : '0';
        elements.livesText.textContent = '●'.repeat(state.lives)
            + '○'.repeat(Math.max(0, INITIAL_LIVES - state.lives));
    }

    function syncButtons() {
        elements.startBtn.textContent = state.phase === 'running' ? '暂停'
            : state.phase === 'paused' ? '继续'
            : state.phase === 'ready' ? '发射'
            : state.phase === 'over' ? '重开'
            : '开始';
        elements.restartBtn.disabled = state.phase === 'idle';
    }

    /* ---------- 对局流程 ---------- */

    /* 球重置贴板待发（ready 态） */
    function resetBall() {
        state.ball.x = state.paddleX;
        state.ball.y = PADDLE_Y - BALL_RADIUS - 1;
        state.ball.vx = 0;
        state.ball.vy = 0;
        state.aliveTime = 0;
        state.phase = 'ready';
    }

    /* 开一层：keepProgress 为真时保留总分与命（过关推进），否则全新一局 */
    function startLevel(level, keepProgress) {
        state.level = level;
        state.layout = generateLayout(level, BASE_SEED);
        if (!keepProgress) {
            state.score = 0;
            state.lives = INITIAL_LIVES;
            state.recordBase = readBest();
        }
        state.paddleX = BOARD_WIDTH / 2;
        state.modal = '';
        elements.resultModal.hidden = true;
        elements.levelModal.hidden = true;
        resetBall();
        updateHud();
        syncButtons();
        drawGame();
    }

    /* 待发态发射：以本关基础速度、带少量随机偏角出射（±18° 内），避免开局轨迹完全竖直 */
    function launchBall() {
        if (state.phase !== 'ready') return;
        const speed = baseSpeed(state.level);
        const angle = reflectAngle(Math.random() * 0.6 - 0.3);
        state.ball.vx = Math.cos(angle) * speed;
        state.ball.vy = Math.sin(angle) * speed;
        state.aliveTime = 0;
        state.phase = 'running';
        syncButtons();
    }

    function pauseGame() {
        if (state.phase !== 'running') return;
        state.phase = 'paused';
        syncButtons();
    }

    function resumeGame() {
        if (state.phase !== 'paused') return;
        state.phase = 'running';
        syncButtons();
    }

    /* 空格 / 开始按钮：idle 开局、ready 发射、running 暂停、paused 继续、over 重开 */
    function primaryAction() {
        if (state.modal) return;
        if (state.phase === 'idle') startLevel(Math.min(readUnlocked(), TOTAL_LEVELS), false);
        else if (state.phase === 'ready') launchBall();
        else if (state.phase === 'running') pauseGame();
        else if (state.phase === 'paused') resumeGame();
        else startLevel(state.level, false);
    }

    /* 球落底：扣 1 命；还有命则球重置贴板待发，命尽进入失败结算 */
    function handleBallLoss() {
        state.lives = Math.max(0, state.lives - 1);
        updateHud();
        if (state.lives <= 0) {
            endRun();
        } else {
            resetBall();
            syncButtons();
        }
    }

    /* 命尽失败：结算弹窗展示总分 + 最高分 + 破纪录标识 */
    function endRun() {
        state.phase = 'over';
        state.best = writeBest(state.score);
        updateHud();
        syncButtons();
        showResultModal('lose');
    }

    /* 砖清空过关：解锁下一关并持久化；末关通关走庆祝结算 */
    function handleLevelClear() {
        writeUnlocked(Math.min(state.level + 1, TOTAL_LEVELS));
        state.phase = 'over';
        updateHud();
        syncButtons();
        showResultModal(state.level >= TOTAL_LEVELS ? 'win' : 'clear');
    }

    /* 三种结算共用一个弹窗容器：过关（下一关）/ 通关（庆祝+总分）/ 失败（总分+最高分+破纪录） */
    function showResultModal(kind) {
        state.modal = kind;
        const isRecord = state.score > state.recordBase && state.score > 0;
        if (kind === 'clear') {
            elements.resultEyebrow.textContent = 'Level Clear';
            elements.resultTitle.textContent = `第 ${state.level} 关过关！`;
            elements.resultPrimaryBtn.textContent = '下一关';
        } else if (kind === 'win') {
            elements.resultEyebrow.textContent = 'You Win';
            elements.resultTitle.textContent = '🎉 通关！六层砖阵全清！';
            elements.resultPrimaryBtn.textContent = '再玩一次';
        } else {
            elements.resultEyebrow.textContent = 'Game Over';
            elements.resultTitle.textContent = '命尽收场';
            elements.resultPrimaryBtn.textContent = '再来一次';
        }
        elements.recordBadge.hidden = !isRecord;
        elements.recordBadge.textContent = `破纪录！新纪录 ${state.score} 分`;
        elements.resultScore.textContent = String(state.score);
        elements.resultBest.textContent = String(state.best);
        elements.resultLevel.textContent = String(state.level);
        elements.resultModal.hidden = false;
    }

    /* 结算弹窗主按钮：过关进下一关（保留总分与命），通关从第 1 关再来，失败重打本关 */
    function handleResultPrimary() {
        if (state.modal === 'clear') startLevel(state.level + 1, true);
        else if (state.modal === 'win') startLevel(1, false);
        else startLevel(state.level, false);
    }

    /* ---------- 球推进 ---------- */

    function updateBall(delta) {
        /* 球速随存活时间缓增，封顶 MAX_SPEED；按目标速率归一化速度向量 */
        state.aliveTime += delta;
        const targetSpeed = Math.min(MAX_SPEED, baseSpeed(state.level) + SPEED_RAMP * state.aliveTime);
        const currentSpeed = Math.hypot(state.ball.vx, state.ball.vy) || 1;
        const factor = targetSpeed / currentSpeed;
        state.ball.vx *= factor;
        state.ball.vy *= factor;

        const result = stepBall({
            x: state.ball.x,
            y: state.ball.y,
            vx: state.ball.vx,
            vy: state.ball.vy,
            dt: delta,
            paddleX: state.paddleX,
            paddleWidth: PADDLE_WIDTH,
            bricks: state.layout.bricks
        });
        state.ball.x = result.x;
        state.ball.y = result.y;
        state.ball.vx = result.vx;
        state.ball.vy = result.vy;
        state.layout.bricks = result.bricks;

        if (result.brickHit) {
            state.score += SCORE_PER_BRICK * state.level;
            /* 最高分实时持久化，中途退出不丢 */
            if (state.score > state.best) {
                state.best = writeBest(state.score);
            }
            if (countBricks(state.layout.bricks) === 0) {
                handleLevelClear();
                return;
            }
            updateHud();
        }
        if (result.bottom) {
            handleBallLoss();
        }
    }

    /* ---------- 输入 ---------- */

    /* 屏幕横坐标 → 逻辑横坐标：按 canvas 实际显示宽度换算（考虑 CSS 等比缩放） */
    function toLogicX(clientX) {
        const rect = elements.board.getBoundingClientRect();
        if (!rect || rect.width <= 0) return state.paddleX;
        return (clientX - rect.left) / rect.width * BOARD_WIDTH;
    }

    function setPaddleCenter(x) {
        const half = PADDLE_WIDTH / 2;
        state.paddleX = Math.max(half, Math.min(BOARD_WIDTH - half, x));
    }

    function handlePointerMove(clientX) {
        if (state.modal) return;
        if (state.phase !== 'running' && state.phase !== 'ready' && state.phase !== 'paused') return;
        setPaddleCenter(toLogicX(clientX));
    }

    /* 方向键按住持续移动（每帧按耗时推进并钳制边界） */
    function movePaddleByKeys(delta) {
        let offset = 0;
        if (state.keysHeld.left) offset -= PADDLE_SPEED * delta;
        if (state.keysHeld.right) offset += PADDLE_SPEED * delta;
        if (offset !== 0) setPaddleCenter(state.paddleX + offset);
    }

    function handleKeyDown(event) {
        if (event.key === ' ' || event.code === 'Space') {
            event.preventDefault();
            if (!event.repeat) primaryAction(); // 忽略长按空格的自动重复
            return;
        }
        if (event.key === 'ArrowLeft') {
            event.preventDefault(); // 阻止方向键滚动页面
            state.keysHeld.left = true;
        } else if (event.key === 'ArrowRight') {
            event.preventDefault();
            state.keysHeld.right = true;
        }
    }

    function handleKeyUp(event) {
        if (event.key === 'ArrowLeft') state.keysHeld.left = false;
        else if (event.key === 'ArrowRight') state.keysHeld.right = false;
    }

    elements.board.addEventListener('mousemove', (event) => handlePointerMove(event.clientX));
    elements.board.addEventListener('click', () => {
        if (state.modal) return;
        if (state.phase === 'ready') launchBall();
        else if (state.phase === 'running') pauseGame();
        else if (state.phase === 'paused') resumeGame();
    });
    /* 触屏拖动控板：跟手映射；touchmove 阻断默认滚动，touchstart 不阻断以保留点击发射 */
    elements.board.addEventListener('touchstart', (event) => {
        handlePointerMove(event.touches[0].clientX);
    }, { passive: true });
    elements.board.addEventListener('touchmove', (event) => {
        event.preventDefault();
        handlePointerMove(event.touches[0].clientX);
    }, { passive: false });
    documentObject.addEventListener('keydown', handleKeyDown);
    documentObject.addEventListener('keyup', handleKeyUp);
    windowObject.addEventListener('resize', resizeCanvas);

    /* ---------- 选关弹窗：1-6 关网格，未解锁的置灰不可点 ---------- */

    function renderLevelPicker() {
        const unlocked = Math.min(readUnlocked(), TOTAL_LEVELS);
        const fragment = documentObject.createDocumentFragment();
        for (let level = 1; level <= TOTAL_LEVELS; level += 1) {
            const button = documentObject.createElement('button');
            button.type = 'button';
            button.className = 'level-item';
            button.textContent = String(level);
            if (level === state.level) button.classList.add('is-current');
            if (level > unlocked) {
                button.classList.add('is-locked');
                button.disabled = true;
            } else {
                button.addEventListener('click', () => {
                    startLevel(level, false);
                });
            }
            fragment.appendChild(button);
        }
        elements.levelGrid.replaceChildren(fragment);
    }

    elements.startBtn.addEventListener('click', primaryAction);
    elements.restartBtn.addEventListener('click', () => startLevel(state.level, false));
    elements.levelsBtn.addEventListener('click', () => {
        renderLevelPicker();
        state.modal = 'levels';
        elements.levelModal.hidden = false;
    });
    elements.closeLevelsBtn.addEventListener('click', () => {
        state.modal = '';
        elements.levelModal.hidden = true;
    });
    elements.resultLevelsBtn.addEventListener('click', () => {
        elements.resultModal.hidden = true;
        renderLevelPicker();
        state.modal = 'levels';
        elements.levelModal.hidden = false;
    });
    elements.resultPrimaryBtn.addEventListener('click', handleResultPrimary);

    /* ---------- 主循环：requestAnimationFrame + dt 驱动 ---------- */

    function frame(now) {
        windowObject.requestAnimationFrame(frame);
        const delta = Math.min(0.05, Math.max(0, (now - state.lastFrameTime) / 1000));
        state.lastFrameTime = now;
        if (state.modal) {
            drawGame();
            return;
        }
        if (state.phase === 'running') {
            movePaddleByKeys(delta);
            updateBall(delta);
        } else if (state.phase === 'ready') {
            movePaddleByKeys(delta);
            /* 待发态：球贴着挡板顶随板移动 */
            state.ball.x = state.paddleX;
            state.ball.y = PADDLE_Y - BALL_RADIUS - 1;
        }
        drawGame();
    }

    /* ---------- 初始化 ---------- */

    function init() {
        state.storageAvailable = detectStorageAvailable();
        state.best = readBest();
        state.level = Math.min(readUnlocked(), TOTAL_LEVELS);
        updateHud();
        syncButtons();
        resizeCanvas();
        windowObject.requestAnimationFrame(frame);
    }

    windowObject.Breakout = {
        generateLayout,
        reflectAngle,
        stepBall,
        readUnlocked,
        writeUnlocked,
        readBest,
        writeBest,
        countBricks,
        startLevel,
        handleBallLoss,
        state
    };

    init();
})(window, document);
