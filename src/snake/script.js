// @ts-check
(function setupSnake(windowObject, documentObject) {
    'use strict';

    /* ---------- 常量配置 ---------- */
    const SLUG = 'snake';
    const BEST_KEY = 'snake-best';
    const GRID_WIDTH = 20;
    const GRID_HEIGHT = 20;
    const BASE_INTERVAL = 150; // 初始移动间隔（毫秒）
    const SPEED_STEP = 8; // 每次提速缩短的毫秒数
    const MIN_INTERVAL = 70; // 移动间隔下限
    const SPEED_UP_FOODS = 4; // 每吃 4 个食物提速一次
    const MAX_QUEUED = 2; // 方向缓冲队列最多缓存 2 个待生效方向
    const SWIPE_THRESHOLD = 24; // 触屏滑动判定阈值（像素）
    const SCORE_PER_FOOD = 10; // 每个食物的得分
    const MAX_CATCH_UP = 3; // 单帧最多补走的步数，防掉帧后追帧卡死
    const INITIAL_SNAKE = [
        { x: 8, y: 10 },
        { x: 7, y: 10 },
        { x: 6, y: 10 }
    ];

    /* 方向 → 坐标增量 */
    const DIRECTION_VECTORS = {
        up: { x: 0, y: -1 },
        down: { x: 0, y: 1 },
        left: { x: -1, y: 0 },
        right: { x: 1, y: 0 }
    };

    /* 键盘键位 → 方向（方向键 + WASD，含大写） */
    const KEY_DIRECTIONS = {
        ArrowUp: 'up',
        ArrowDown: 'down',
        ArrowLeft: 'left',
        ArrowRight: 'right',
        w: 'up',
        s: 'down',
        a: 'left',
        d: 'right',
        W: 'up',
        S: 'down',
        A: 'left',
        D: 'right'
    };

    /* 绘制配色：蛇头高亮、蛇身两档绿色交替、食物用对比橙色 */
    const COLORS = {
        boardBase: '#0c1a11',
        boardAlt: '#122315',
        head: '#86efac',
        bodyA: '#22c55e',
        bodyB: '#1aa34e',
        food: '#fb923c',
        eye: '#0c2a16'
    };

    const memoryFallback = {};

    const state = {
        phase: 'idle', // idle | running | paused | over
        snake: [],
        direction: 'right',
        directionQueue: [],
        food: null,
        score: 0,
        best: 0,
        recordBase: 0, // 本局开始前的最高分，用于结算时判断是否破纪录
        foodsEaten: 0,
        interval: BASE_INTERVAL,
        accumulator: 0,
        lastFrameTime: 0,
        touchStartX: 0,
        touchStartY: 0,
        storageAvailable: true
    };

    const elements = {
        bestPillText: documentObject.getElementById('best-pill-text'),
        scoreText: documentObject.getElementById('score-text'),
        lengthText: documentObject.getElementById('length-text'),
        bestText: documentObject.getElementById('best-text'),
        board: documentObject.getElementById('board'),
        boardOverlay: documentObject.getElementById('board-overlay'),
        boardOverlayText: documentObject.getElementById('board-overlay-text'),
        startBtn: documentObject.getElementById('start-btn'),
        pauseBtn: documentObject.getElementById('pause-btn'),
        restartBtn: documentObject.getElementById('restart-btn'),
        overModal: documentObject.getElementById('over-modal'),
        overTitle: documentObject.getElementById('over-title'),
        recordBadge: documentObject.getElementById('record-badge'),
        resultScore: documentObject.getElementById('result-score'),
        resultLength: documentObject.getElementById('result-length'),
        resultBest: documentObject.getElementById('result-best'),
        replayBtn: documentObject.getElementById('replay-btn')
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

    /* 读取最高分：无存档或数据损坏时兜底为 0 */
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

    /* ---------- 纯函数（挂到 window.Snake 供 smoke 测试断言） ---------- */

    /* 判断两个方向是否互为 180° 反向 */
    function isOppositeDirection(a, b) {
        const vectorA = DIRECTION_VECTORS[a];
        const vectorB = DIRECTION_VECTORS[b];
        return vectorA.x + vectorB.x === 0 && vectorA.y + vectorB.y === 0;
    }

    /* 从缓冲队列取下一个合法方向：跳过与当前相同或反向的项，
       返回首个合法方向与未消费的剩余队列（非法项留待后续步进再跳过）；
       队列中没有合法项时保持原方向并清空队列 */
    function nextDirection(current, queued) {
        for (let index = 0; index < queued.length; index += 1) {
            const candidate = queued[index];
            if (candidate === current || isOppositeDirection(current, candidate)) continue;
            return { direction: candidate, remaining: queued.slice(index + 1) };
        }
        return { direction: current, remaining: [] };
    }

    /* 单步推进蛇：头部按方向走一格入列。
       撞墙（新头越出棋盘）或撞身返回 dead: true；
       新头碰到食物返回 ate: true 且尾部不出列（蛇变长）；
       撞身判定排除尾格——未吃到食物时尾部本步会让出，蛇头可进入原尾格 */
    function stepSnake(snake, direction, food) {
        const head = snake[0];
        const vector = DIRECTION_VECTORS[direction];
        const nextHead = { x: head.x + vector.x, y: head.y + vector.y };

        if (nextHead.x < 0 || nextHead.y < 0 || nextHead.x >= GRID_WIDTH || nextHead.y >= GRID_HEIGHT) {
            return { snake, ate: false, dead: true };
        }

        const ate = food !== null && food !== undefined && nextHead.x === food.x && nextHead.y === food.y;
        /* 吃食时尾部不出列，撞身需检查全身；否则尾格会让出，检查时排除尾格 */
        const bodyToCheck = ate ? snake : snake.slice(0, snake.length - 1);
        const hitBody = bodyToCheck.some((cell) => cell.x === nextHead.x && cell.y === nextHead.y);
        if (hitBody) {
            return { snake, ate: false, dead: true };
        }

        return { snake: [nextHead].concat(bodyToCheck), ate, dead: false };
    }

    /* 在棋盘空格里随机生成食物坐标；蛇占满棋盘时返回 null（视为通关） */
    function spawnFood(snake, width, height, random) {
        const occupied = new Set(snake.map((cell) => cell.y * width + cell.x));
        const freeCells = [];
        for (let y = 0; y < height; y += 1) {
            for (let x = 0; x < width; x += 1) {
                if (!occupied.has(y * width + x)) freeCells.push({ x, y });
            }
        }
        if (freeCells.length === 0) return null;
        /* Math.min 兜底 random() 恰好返回 1 的边界，避免下标越界 */
        const pick = freeCells[Math.min(freeCells.length - 1, Math.floor(random() * freeCells.length))];
        return { x: pick.x, y: pick.y };
    }

    /* ---------- 渲染 ---------- */

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

    function drawSnakeCell(cell, cellSize, color) {
        context2d.fillStyle = color;
        traceRoundRect(
            context2d,
            cell.x * cellSize + 1,
            cell.y * cellSize + 1,
            cellSize - 2,
            cellSize - 2,
            cellSize * 0.32
        );
        context2d.fill();
    }

    /* 蛇头按当前方向点两只眼睛，提升辨识度 */
    function drawSnakeEyes(head, cellSize, direction) {
        const vector = DIRECTION_VECTORS[direction];
        const centerX = head.x * cellSize + cellSize / 2;
        const centerY = head.y * cellSize + cellSize / 2;
        const forwardOffset = cellSize * 0.18;
        const sideOffset = cellSize * 0.16;
        const sideX = vector.x === 0 ? sideOffset : 0;
        const sideY = vector.y === 0 ? sideOffset : 0;
        context2d.fillStyle = COLORS.eye;
        for (const sign of [-1, 1]) {
            context2d.beginPath();
            context2d.arc(
                centerX + vector.x * forwardOffset + sideX * sign,
                centerY + vector.y * forwardOffset + sideY * sign,
                Math.max(1.5, cellSize * 0.08),
                0,
                Math.PI * 2
            );
            context2d.fill();
        }
    }

    function drawGame() {
        const boardSize = elements.board.width;
        const cellSize = boardSize / GRID_WIDTH;

        /* 底色 + 交替色棋盘格 */
        context2d.fillStyle = COLORS.boardBase;
        context2d.fillRect(0, 0, boardSize, boardSize);
        context2d.fillStyle = COLORS.boardAlt;
        for (let y = 0; y < GRID_HEIGHT; y += 1) {
            for (let x = 0; x < GRID_WIDTH; x += 1) {
                if ((x + y) % 2 === 0) {
                    context2d.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
                }
            }
        }

        /* 食物：醒目的橙色圆点 */
        if (state.food) {
            context2d.fillStyle = COLORS.food;
            context2d.beginPath();
            context2d.arc(
                state.food.x * cellSize + cellSize / 2,
                state.food.y * cellSize + cellSize / 2,
                cellSize * 0.34,
                0,
                Math.PI * 2
            );
            context2d.fill();
        }

        /* 蛇身：蛇头高亮，蛇身两档绿色交替 */
        for (let index = state.snake.length - 1; index >= 0; index -= 1) {
            const cell = state.snake[index];
            if (index === 0) {
                drawSnakeCell(cell, cellSize, COLORS.head);
            } else {
                drawSnakeCell(cell, cellSize, index % 2 === 0 ? COLORS.bodyA : COLORS.bodyB);
            }
        }
        if (state.snake.length > 0) {
            drawSnakeEyes(state.snake[0], cellSize, state.direction);
        }
    }

    /* ---------- 界面同步 ---------- */

    function updateHud() {
        elements.scoreText.textContent = String(state.score);
        elements.lengthText.textContent = String(state.snake.length);
        elements.bestText.textContent = state.storageAvailable ? String(state.best) : '—';
        elements.bestPillText.textContent = state.storageAvailable ? `最佳 ${state.best}` : '最佳 —';
    }

    /* 同步棋盘遮罩：待机提示开始、暂停提示已暂停，其余状态隐藏 */
    function syncOverlay() {
        if (state.phase === 'idle') {
            elements.boardOverlay.hidden = false;
            elements.boardOverlayText.textContent = '点开始或按空格';
        } else if (state.phase === 'paused') {
            elements.boardOverlay.hidden = false;
            elements.boardOverlayText.textContent = '已暂停';
        } else {
            elements.boardOverlay.hidden = true;
        }
    }

    function syncButtons() {
        elements.startBtn.disabled = state.phase !== 'idle' && state.phase !== 'over';
        elements.pauseBtn.disabled = state.phase !== 'running' && state.phase !== 'paused';
        elements.pauseBtn.textContent = state.phase === 'paused' ? '继续' : '暂停';
        elements.restartBtn.disabled = state.phase === 'idle';
    }

    /* ---------- 对局流程 ---------- */

    /* 重置一局的对局数据（不含最高分） */
    function resetRun() {
        state.snake = INITIAL_SNAKE.map((cell) => ({ x: cell.x, y: cell.y }));
        state.direction = 'right';
        state.directionQueue = [];
        state.score = 0;
        state.foodsEaten = 0;
        state.interval = BASE_INTERVAL;
        state.accumulator = 0;
        state.food = spawnFood(state.snake, GRID_WIDTH, GRID_HEIGHT, Math.random);
    }

    function startGame() {
        resetRun();
        state.best = readBest();
        state.recordBase = state.best;
        state.phase = 'running';
        elements.overModal.hidden = true;
        updateHud();
        syncOverlay();
        syncButtons();
    }

    function pauseGame() {
        if (state.phase !== 'running') return;
        state.phase = 'paused';
        state.accumulator = 0;
        syncOverlay();
        syncButtons();
    }

    function resumeGame() {
        if (state.phase !== 'paused') return;
        state.phase = 'running';
        syncOverlay();
        syncButtons();
    }

    /* 空格键与按钮共用：按当前状态决定开始 / 暂停 / 继续 / 重开 */
    function toggleStartPause() {
        if (state.phase === 'running') {
            pauseGame();
        } else if (state.phase === 'paused') {
            resumeGame();
        } else {
            startGame();
        }
    }

    function endGame(victory) {
        state.phase = 'over';
        if (state.score > state.best) {
            state.best = state.score;
            writeBest(state.best);
        }
        const isRecord = state.score > state.recordBase;
        elements.overTitle.textContent = victory ? '通关！蛇占满了棋盘' : '游戏结束';
        elements.recordBadge.hidden = !isRecord;
        elements.recordBadge.textContent = `破纪录！新纪录 ${state.score} 分`;
        elements.resultScore.textContent = String(state.score);
        elements.resultLength.textContent = String(state.snake.length);
        elements.resultBest.textContent = String(state.best);
        elements.overModal.hidden = false;
        updateHud();
        syncOverlay();
        syncButtons();
    }

    /* 推进一格：先消化方向缓冲，再移动蛇、处理吃食 / 提速 / 结束 */
    function advanceStep() {
        const chosen = nextDirection(state.direction, state.directionQueue);
        state.direction = chosen.direction;
        state.directionQueue = chosen.remaining;

        const result = stepSnake(state.snake, state.direction, state.food);
        state.snake = result.snake;
        if (result.dead) {
            endGame(false);
            return;
        }
        if (result.ate) {
            state.score += SCORE_PER_FOOD;
            state.foodsEaten += 1;
            /* 每吃 4 个食物提速一档，间隔有下限 */
            if (state.foodsEaten % SPEED_UP_FOODS === 0) {
                state.interval = Math.max(MIN_INTERVAL, state.interval - SPEED_STEP);
            }
            /* 最高分实时持久化，中途退出也不丢 */
            if (state.score > state.best) {
                state.best = state.score;
                writeBest(state.best);
            }
            state.food = spawnFood(state.snake, GRID_WIDTH, GRID_HEIGHT, Math.random);
            if (!state.food) {
                endGame(true); // 蛇占满棋盘，按通关结算
                return;
            }
        }
        updateHud();
    }

    /* ---------- 主循环：requestAnimationFrame + 时间累积驱动步进（掉帧安全） ---------- */

    function frame(now) {
        windowObject.requestAnimationFrame(frame);
        const delta = Math.max(0, now - state.lastFrameTime);
        state.lastFrameTime = now;
        if (state.phase !== 'running') {
            state.accumulator = 0;
            return;
        }
        state.accumulator += delta;
        let stepped = 0;
        while (state.accumulator >= state.interval && stepped < MAX_CATCH_UP) {
            state.accumulator -= state.interval;
            stepped += 1;
            advanceStep();
            if (state.phase !== 'running') break; // 本步结束对局后立即停止补步
        }
        /* 补步达到上限后丢弃剩余欠账，避免长时间掉帧后一次性追帧 */
        if (state.accumulator > state.interval) {
            state.accumulator = 0;
        }
        drawGame();
    }

    /* ---------- 输入 ---------- */

    /* 方向进入缓冲队列：与最后意图（队尾或当前方向）相同或相反的输入直接丢弃，最多缓存 2 个 */
    function enqueueDirection(direction) {
        if (state.phase !== 'running') return;
        const lastIntent = state.directionQueue.length > 0
            ? state.directionQueue[state.directionQueue.length - 1]
            : state.direction;
        if (direction === lastIntent || isOppositeDirection(lastIntent, direction)) return;
        if (state.directionQueue.length >= MAX_QUEUED) return;
        state.directionQueue.push(direction);
    }

    function handleKeyDown(event) {
        if (event.key === ' ' || event.code === 'Space') {
            event.preventDefault();
            if (!event.repeat) toggleStartPause(); // 忽略长按空格的自动重复，避免暂停/继续来回抖动
            return;
        }
        const direction = KEY_DIRECTIONS[event.key];
        if (!direction) return;
        event.preventDefault(); // 阻止方向键滚动页面
        enqueueDirection(direction);
    }

    function handleTouchStart(event) {
        const touch = event.changedTouches[0];
        state.touchStartX = touch.clientX;
        state.touchStartY = touch.clientY;
    }

    /* 棋盘上滑动转向：取 touchend 相对 touchstart 的位移向量，超过阈值判定方向 */
    function handleTouchEnd(event) {
        const touch = event.changedTouches[0];
        const deltaX = touch.clientX - state.touchStartX;
        const deltaY = touch.clientY - state.touchStartY;
        if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < SWIPE_THRESHOLD) return;
        const direction = Math.abs(deltaX) > Math.abs(deltaY)
            ? (deltaX > 0 ? 'right' : 'left')
            : (deltaY > 0 ? 'down' : 'up');
        enqueueDirection(direction);
    }

    /* ---------- 事件绑定与初始化 ---------- */

    elements.startBtn.addEventListener('click', () => {
        if (state.phase === 'idle' || state.phase === 'over') startGame();
    });
    elements.pauseBtn.addEventListener('click', () => {
        if (state.phase === 'running') pauseGame();
        else if (state.phase === 'paused') resumeGame();
    });
    elements.restartBtn.addEventListener('click', startGame);
    elements.replayBtn.addEventListener('click', startGame);
    elements.boardOverlay.addEventListener('click', () => {
        if (state.phase === 'idle') startGame();
    });
    elements.board.addEventListener('touchstart', handleTouchStart, { passive: true });
    elements.board.addEventListener('touchend', handleTouchEnd, { passive: true });
    documentObject.addEventListener('keydown', handleKeyDown);

    function init() {
        state.storageAvailable = detectStorageAvailable();
        state.best = readBest();
        resetRun();
        updateHud();
        syncOverlay();
        syncButtons();
        drawGame();
        windowObject.requestAnimationFrame(frame);
    }

    windowObject.Snake = {
        nextDirection,
        stepSnake,
        spawnFood,
        readBest,
        writeBest
    };

    init();
})(window, document);
