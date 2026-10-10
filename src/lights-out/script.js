(function setupLightsOut(windowObject, documentObject) {
    'use strict';

    const SLUG = 'lights-out';
    const UNLOCK_KEY = 'lights-out-unlocked-level';
    const CURRENT_KEY = 'lights-out-current-level';
    const BEST_KEY_PREFIX = 'lights-out-best-';
    const BASE_SEED = 20260727;
    const HINTS_PER_LEVEL = 3;
    const memoryFallback = {};

    const state = {
        level: 1,
        size: 3,
        board: [],
        cellButtons: [],
        steps: 0,
        minSteps: 0,
        hintsLeft: HINTS_PER_LEVEL,
        hintTimer: 0,
        hintIndex: -1,
        locked: false
    };

    const elements = {
        levelText: documentObject.getElementById('level-text'),
        stepsText: documentObject.getElementById('steps-text'),
        minStepsText: documentObject.getElementById('min-steps-text'),
        bestText: documentObject.getElementById('best-text'),
        grid: documentObject.getElementById('grid'),
        restartBtn: documentObject.getElementById('restart-btn'),
        hintBtn: documentObject.getElementById('hint-btn'),
        hintCount: documentObject.getElementById('hint-count'),
        levelsBtn: documentObject.getElementById('levels-btn'),
        winModal: documentObject.getElementById('win-modal'),
        resultStars: documentObject.getElementById('result-stars'),
        resultSteps: documentObject.getElementById('result-steps'),
        resultMin: documentObject.getElementById('result-min'),
        resultBest: documentObject.getElementById('result-best'),
        replayBtn: documentObject.getElementById('replay-btn'),
        nextBtn: documentObject.getElementById('next-btn'),
        levelModal: documentObject.getElementById('level-modal'),
        levelGrid: documentObject.getElementById('level-grid'),
        closeLevelsBtn: documentObject.getElementById('close-levels-btn')
    };

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

    function getStorageNumber(key, fallback) {
        const parsed = Number.parseInt(safeGetItem(key) || '', 10);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
    }

    /* mulberry32 种子随机数，保证同关卡布局可复现 */
    function createSeededRandom(seed) {
        let a = seed >>> 0;
        return function random() {
            a += 0x6D2B79F5;
            let t = a;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    function levelConfig(level) {
        const size = level <= 4 ? 3 : level <= 9 ? 4 : 5;
        const presses = Math.min(size * size - 1, 2 + level);
        return { size, presses };
    }

    function levelSeed(level) {
        return (BASE_SEED + level * 6271) >>> 0;
    }

    /* 按下一盏灯：翻转自身与上下左右相邻灯，返回新数组 */
    function toggleAt(board, size, index) {
        const next = board.slice();
        const cx = index % size;
        const cy = Math.floor(index / size);
        const flip = (x, y) => {
            if (x < 0 || y < 0 || x >= size || y >= size) return;
            const i = y * size + x;
            next[i] = !next[i];
        };
        flip(cx, cy);
        flip(cx, cy - 1);
        flip(cx + 1, cy);
        flip(cx, cy + 1);
        flip(cx - 1, cy);
        return next;
    }

    function isAllLit(board) {
        return board.every(Boolean);
    }

    /* 从全亮状态反向按压 K 个互不重复的格子生成关卡，天然必有解 */
    function generateLevel(size, presses, random) {
        const total = size * size;
        let scrambleSet = [];
        let board = [];
        for (let attempt = 0; attempt < 9; attempt += 1) {
            const indices = [];
            for (let i = 0; i < total; i += 1) indices.push(i);
            for (let i = total - 1; i > 0; i -= 1) {
                const j = Math.floor(random() * (i + 1));
                const tmp = indices[i];
                indices[i] = indices[j];
                indices[j] = tmp;
            }
            scrambleSet = indices.slice(0, presses).sort((a, b) => a - b);
            board = new Array(total).fill(true);
            for (const index of scrambleSet) {
                board = toggleAt(board, size, index);
            }
            /* 5×5 灯板存在静默按压组合，极小概率打乱后仍为全亮，此时重新抽取 */
            if (!isAllLit(board)) {
                return { board, scrambleSet };
            }
        }
        /* 兜底：连续抽中静默组合时追加一次未按过的按压，保证局面未解且解集合同步 */
        let extra = 0;
        const used = new Set(scrambleSet);
        while (used.has(extra)) extra += 1;
        board = toggleAt(board, size, extra);
        scrambleSet = scrambleSet.concat(extra).sort((a, b) => a - b);
        return { board, scrambleSet };
    }

    /* 统计位掩码中 1 的个数，用于比较按压方案所需步数 */
    function popcount(mask) {
        let count = 0;
        while (mask) {
            mask &= mask - 1;
            count += 1;
        }
        return count;
    }

    const pressMatrixCache = new Map();

    /* 构造 n×n 棋盘的按压影响矩阵：rows[k] 是按压格 k 时被翻转格子的位掩码，按尺寸缓存复用 */
    function buildPressMatrix(size) {
        const cached = pressMatrixCache.get(size);
        if (cached) return cached;
        const total = size * size;
        const rows = new Array(total).fill(0);
        for (let index = 0; index < total; index += 1) {
            const cx = index % size;
            const cy = Math.floor(index / size);
            const flip = (x, y) => {
                if (x < 0 || y < 0 || x >= size || y >= size) return;
                rows[index] |= 1 << (y * size + x);
            };
            flip(cx, cy);
            flip(cx, cy - 1);
            flip(cx + 1, cy);
            flip(cx, cy + 1);
            flip(cx - 1, cy);
        }
        pressMatrixCache.set(size, rows);
        return rows;
    }

    /* GF(2) 高斯消元：求 影响矩阵 · x = target 的特解与核空间基（均为位掩码）。
       先化为行最简形：主元变量取所在行常数项、自由变量置 0 得特解；
       每个自由列对应一个核基，主元变量按主元行内自由列系数回代；出现 0 = 1 矛盾行则无解返回 null */
    function solveGf2(matrix, target) {
        const total = matrix.length;
        const rows = matrix.slice();
        const rhs = new Array(total).fill(0);
        for (let index = 0; index < total; index += 1) {
            rhs[index] = (target >>> index) & 1;
        }
        const pivotCols = [];
        let rank = 0;
        for (let col = 0; col < total; col += 1) {
            let pivot = -1;
            for (let r = rank; r < total; r += 1) {
                if ((rows[r] >>> col) & 1) {
                    pivot = r;
                    break;
                }
            }
            if (pivot < 0) continue;
            const tmpRow = rows[rank];
            rows[rank] = rows[pivot];
            rows[pivot] = tmpRow;
            const tmpRhs = rhs[rank];
            rhs[rank] = rhs[pivot];
            rhs[pivot] = tmpRhs;
            for (let r = 0; r < total; r += 1) {
                if (r !== rank && ((rows[r] >>> col) & 1)) {
                    rows[r] ^= rows[rank];
                    rhs[r] ^= rhs[rank];
                }
            }
            pivotCols.push(col);
            rank += 1;
        }
        for (let r = rank; r < total; r += 1) {
            if (rhs[r] === 1) return null;
        }
        let solution = 0;
        for (let r = 0; r < rank; r += 1) {
            if (rhs[r] === 1) solution |= 1 << pivotCols[r];
        }
        const kernel = [];
        let pivotCursor = 0;
        for (let col = 0; col < total; col += 1) {
            if (pivotCursor < rank && pivotCols[pivotCursor] === col) {
                pivotCursor += 1;
                continue;
            }
            let basis = 1 << col;
            for (let r = 0; r < rank; r += 1) {
                if ((rows[r] >>> col) & 1) basis |= 1 << pivotCols[r];
            }
            kernel.push(basis);
        }
        return { solution, kernel };
    }

    /* 纯函数求解：返回把 board 变为全亮的最小按按压集合（下标数组）。
       先解 A·x = 暗格掩码得特解，再枚举核空间 2^k 个组合，取汉明重量最小的解 */
    function solveBoard(board, size) {
        const total = size * size;
        let target = 0;
        for (let index = 0; index < total; index += 1) {
            if (!board[index]) target |= 1 << index;
        }
        const solved = solveGf2(buildPressMatrix(size), target);
        if (!solved) return [];
        let bestMask = solved.solution;
        let bestWeight = popcount(bestMask);
        const combos = 1 << solved.kernel.length;
        for (let combo = 1; combo < combos; combo += 1) {
            let candidate = solved.solution;
            for (let k = 0; k < solved.kernel.length; k += 1) {
                if ((combo >>> k) & 1) candidate ^= solved.kernel[k];
            }
            const weight = popcount(candidate);
            if (weight < bestWeight) {
                bestWeight = weight;
                bestMask = candidate;
            }
        }
        const presses = [];
        for (let index = 0; index < total; index += 1) {
            if ((bestMask >>> index) & 1) presses.push(index);
        }
        return presses;
    }

    function starRating(steps, minSteps) {
        if (steps <= minSteps) return 3;
        if (steps <= Math.ceil(minSteps * 1.6)) return 2;
        return 1;
    }

    function loadBest(level) {
        const parsed = Number.parseInt(safeGetItem(BEST_KEY_PREFIX + level) || '', 10);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
    }

    function saveBest(level, steps) {
        const previous = loadBest(level);
        const next = previous > 0 ? Math.min(previous, steps) : steps;
        safeSetItem(BEST_KEY_PREFIX + level, String(next));
        return next;
    }

    function loadUnlockedLevel() {
        return getStorageNumber(UNLOCK_KEY, 1);
    }

    function saveUnlockedLevel(level) {
        if (level > loadUnlockedLevel()) {
            safeSetItem(UNLOCK_KEY, String(level));
        }
    }

    function loadCurrentLevel() {
        return Math.min(getStorageNumber(CURRENT_KEY, 1), loadUnlockedLevel());
    }

    function saveCurrentLevel(level) {
        safeSetItem(CURRENT_KEY, String(level));
    }

    function updateHeader() {
        const best = loadBest(state.level);
        elements.levelText.textContent = `第 ${state.level} 关`;
        elements.stepsText.textContent = String(state.steps);
        elements.minStepsText.textContent = String(state.minSteps);
        elements.bestText.textContent = best > 0 ? String(best) : '--';
        elements.hintCount.textContent = `(${state.hintsLeft})`;
        elements.hintBtn.disabled = state.hintsLeft <= 0 || state.locked;
    }

    function updateBoardView() {
        for (let index = 0; index < state.cellButtons.length; index += 1) {
            const button = state.cellButtons[index];
            if (state.board[index]) {
                button.classList.add('is-lit');
                button.setAttribute('aria-pressed', 'true');
            } else {
                button.classList.remove('is-lit');
                button.setAttribute('aria-pressed', 'false');
            }
        }
    }

    function clearHintHighlight() {
        if (state.hintTimer) {
            clearTimeout(state.hintTimer);
            state.hintTimer = 0;
        }
        if (state.hintIndex >= 0 && state.cellButtons[state.hintIndex]) {
            state.cellButtons[state.hintIndex].classList.remove('is-hint');
        }
        state.hintIndex = -1;
    }

    /* 提示所需按压 = 对当前亮灯局面直接求最小解，玩家偏离打乱路线后提示依然正确且最优 */
    function neededPresses() {
        return solveBoard(state.board, state.size);
    }

    function renderStars(container, stars) {
        const nodes = [];
        for (let index = 0; index < 3; index += 1) {
            const span = documentObject.createElement('span');
            span.textContent = '★';
            if (index >= stars) {
                span.className = 'star-off';
            }
            nodes.push(span);
        }
        container.replaceChildren(...nodes);
    }

    function showWinModal() {
        const stars = starRating(state.steps, state.minSteps);
        const best = saveBest(state.level, state.steps);
        saveUnlockedLevel(state.level + 1);
        renderStars(elements.resultStars, stars);
        elements.resultStars.setAttribute('aria-label', `${stars} 星`);
        elements.resultSteps.textContent = String(state.steps);
        elements.resultMin.textContent = String(state.minSteps);
        elements.resultBest.textContent = String(best);
        elements.winModal.hidden = false;
        updateHeader();
    }

    function handleCellTap(index) {
        if (state.locked) return;
        clearHintHighlight();
        state.board = toggleAt(state.board, state.size, index);
        state.steps += 1;
        updateBoardView();
        updateHeader();
        if (isAllLit(state.board)) {
            state.locked = true;
            elements.grid.classList.add('is-solved');
            updateHeader();
            setTimeout(showWinModal, 620);
        }
    }

    function handleHint() {
        if (state.locked || state.hintsLeft <= 0) return;
        if (state.hintIndex >= 0) return;
        const needed = neededPresses();
        if (needed.length === 0) return;
        const index = needed[Math.floor(Math.random() * needed.length)];
        state.hintsLeft -= 1;
        state.hintIndex = index;
        state.cellButtons[index].classList.add('is-hint');
        state.hintTimer = setTimeout(() => {
            clearHintHighlight();
        }, 2000);
        updateHeader();
    }

    function renderBoard() {
        const total = state.size * state.size;
        const fragment = documentObject.createDocumentFragment();
        const buttons = [];

        elements.grid.classList.remove('is-solved');
        elements.grid.style.gridTemplateColumns = `repeat(${state.size}, minmax(0, 1fr))`;
        elements.grid.setAttribute('aria-label', `第 ${state.level} 关，${state.size} 乘 ${state.size} 灯板`);

        for (let index = 0; index < total; index += 1) {
            const button = documentObject.createElement('button');
            button.type = 'button';
            button.className = 'light-cell';
            button.dataset.index = String(index);
            button.setAttribute('aria-label', `灯 ${index + 1}`);
            button.addEventListener('click', () => handleCellTap(index));
            buttons.push(button);
            fragment.appendChild(button);
        }

        elements.grid.replaceChildren(fragment);
        state.cellButtons = buttons;
        updateBoardView();
    }

    function startLevel(level) {
        const config = levelConfig(level);
        const random = createSeededRandom(levelSeed(level));
        const generated = generateLevel(config.size, config.presses, random);

        clearHintHighlight();
        state.level = level;
        state.size = config.size;
        state.board = generated.board;
        state.steps = 0;
        /* 最少步数按初始局面真实求最优，而非生成时的打乱按压数 */
        state.minSteps = solveBoard(generated.board, config.size).length;
        state.hintsLeft = HINTS_PER_LEVEL;
        state.locked = false;

        elements.winModal.hidden = true;
        saveCurrentLevel(level);
        renderBoard();
        updateHeader();
    }

    function renderLevelPicker() {
        const unlocked = loadUnlockedLevel();
        const fragment = documentObject.createDocumentFragment();
        for (let level = 1; level <= unlocked; level += 1) {
            const button = documentObject.createElement('button');
            button.type = 'button';
            button.className = 'level-item';
            button.textContent = String(level);
            if (level === state.level) {
                button.classList.add('is-current');
            }
            button.addEventListener('click', () => {
                elements.levelModal.hidden = true;
                startLevel(level);
            });
            fragment.appendChild(button);
        }
        elements.levelGrid.replaceChildren(fragment);
    }

    elements.restartBtn.addEventListener('click', () => startLevel(state.level));
    elements.replayBtn.addEventListener('click', () => startLevel(state.level));
    elements.nextBtn.addEventListener('click', () => startLevel(state.level + 1));
    elements.hintBtn.addEventListener('click', handleHint);
    elements.levelsBtn.addEventListener('click', () => {
        renderLevelPicker();
        elements.levelModal.hidden = false;
    });
    elements.closeLevelsBtn.addEventListener('click', () => {
        elements.levelModal.hidden = true;
    });

    windowObject.LightsOut = {
        SLUG,
        HINTS_PER_LEVEL,
        createSeededRandom,
        levelConfig,
        levelSeed,
        toggleAt,
        isAllLit,
        generateLevel,
        buildPressMatrix,
        solveGf2,
        solveBoard,
        starRating,
        loadBest,
        saveBest,
        loadUnlockedLevel,
        saveUnlockedLevel
    };

    startLevel(loadCurrentLevel());
})(window, document);
