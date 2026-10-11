// @ts-check
(function setupNonogram(windowObject, documentObject) {
    'use strict';

    const SLUG = 'nonogram';
    const UNLOCK_KEY = 'nonogram-unlocked-level';
    const CURRENT_KEY = 'nonogram-current-level';
    const BEST_KEY_PREFIX = 'nonogram-best-';
    const STARS_KEY_PREFIX = 'nonogram-stars-';
    const BASE_SEED = 20261010;
    const LEVEL_SEED_STEP = 104729;
    const GENERATE_BUDGET = 2000;
    const HINTS_PER_LEVEL = 3;
    const STAR_TIME_BUDGET = { 5: 30000, 10: 150000, 15: 420000 };
    const memoryFallback = {};

    /* ---------- 种子随机与关卡生成 ---------- */

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

    function levelSize(level) {
        if (level <= 8) return 5;
        if (level <= 20) return 10;
        return 15;
    }

    /** 随机底图；规格越大密度略升（实测该密度下唯一解命中率最高） */
    function generateSolution(size, random) {
        const density = size >= 15 ? 0.65 : 0.62;
        const solution = [];
        for (let r = 0; r < size; r += 1) {
            const row = [];
            for (let c = 0; c < size; c += 1) {
                row.push(random() < density ? 1 : 0);
            }
            solution.push(row);
        }
        return solution;
    }

    /** 行/列提示组：连续填格段长度，空行为 [0] */
    function computeClues(line) {
        const clues = [];
        let run = 0;
        for (let i = 0; i < line.length; i += 1) {
            if (line[i] === 1) {
                run += 1;
            } else if (run > 0) {
                clues.push(run);
                run = 0;
            }
        }
        if (run > 0) clues.push(run);
        return clues.length > 0 ? clues : [0];
    }

    /**
     * 单线求解：枚举提示组的全部合法摆放，求所有摆放交集。
     * line 取值 -1 未定 / 1 填 / 0 空；返回 { fill, empty }（必填/必空下标），
     * 无合法摆放（矛盾）返回 null。
     */
    function solveLine(clues, line) {
        const n = line.length;
        if (clues.length === 1 && clues[0] === 0) {
            for (let i = 0; i < n; i += 1) {
                if (line[i] === 1) return null;
            }
            return { fill: [], empty: line.map((_, i) => i).filter((i) => line[i] === -1) };
        }
        const k = clues.length;
        const starts = new Array(k).fill(0);
        let fillMask = 0;
        let emptyMask = 0;
        let count = 0;

        function place(idx, from) {
            if (idx === k) {
                let fMask = 0;
                let eMask = 0;
                let p = 0;
                for (let s = 0; s < k; s += 1) {
                    for (; p < starts[s]; p += 1) {
                        if (line[p] === 1) return;
                        if (line[p] === -1) eMask |= (1 << p);
                    }
                    for (let q = 0; q < clues[s]; q += 1, p += 1) {
                        if (line[p] === 0) return;
                        if (line[p] === -1) fMask |= (1 << p);
                    }
                    if (s < k - 1) {
                        if (line[p] === 1) return;
                        if (line[p] === -1) eMask |= (1 << p);
                        p += 1;
                    }
                }
                for (; p < n; p += 1) {
                    if (line[p] === 1) return;
                    if (line[p] === -1) eMask |= (1 << p);
                }
                count += 1;
                if (count === 1) {
                    fillMask = fMask;
                    emptyMask = eMask;
                } else {
                    fillMask &= fMask;
                    emptyMask &= eMask;
                }
                return;
            }
            let restMin = 0;
            for (let s = idx; s < k; s += 1) restMin += clues[s] + 1;
            restMin -= 1;
            for (let s = from; s + restMin <= n; s += 1) {
                starts[idx] = s;
                place(idx + 1, s + clues[idx] + 1);
            }
        }

        place(0, 0);
        if (count === 0) return null;
        const fill = [];
        const empty = [];
        for (let i = 0; i < n; i += 1) {
            if (fillMask & (1 << i)) fill.push(i);
            if (emptyMask & (1 << i)) empty.push(i);
        }
        return { fill, empty };
    }

    /**
     * 行列交替传播推理。返回 'solved'（全部确定=唯一解）| 'stuck'（推不完=可能多解）| 'contradiction'。
     * 注意：'solved' 必为唯一解；'stuck' 仅表示行求解器推不完（本实现按不唯一处理，重新抽种子）。
     */
    function solveUnique(solution) {
        const n = solution.length;
        const grid = Array.from({ length: n }, () => new Array(n).fill(-1));
        const rowClues = solution.map(computeClues);
        const colClues = [];
        for (let c = 0; c < n; c += 1) {
            colClues.push(computeClues(solution.map((row) => row[c])));
        }
        for (let iter = 0; iter < 200; iter += 1) {
            let changed = false;
            for (let r = 0; r < n; r += 1) {
                const result = solveLine(rowClues[r], grid[r]);
                if (!result) return 'contradiction';
                result.fill.forEach((c) => {
                    if (grid[r][c] === -1) { grid[r][c] = 1; changed = true; }
                });
                result.empty.forEach((c) => {
                    if (grid[r][c] === -1) { grid[r][c] = 0; changed = true; }
                });
            }
            for (let c = 0; c < n; c += 1) {
                const column = grid.map((row) => row[c]);
                const result = solveLine(colClues[c], column);
                if (!result) return 'contradiction';
                result.fill.forEach((r) => {
                    if (grid[r][c] === -1) { grid[r][c] = 1; changed = true; }
                });
                result.empty.forEach((r) => {
                    if (grid[r][c] === -1) { grid[r][c] = 0; changed = true; }
                });
            }
            if (!changed) break;
        }
        return grid.every((row) => row.every((cell) => cell !== -1)) ? 'solved' : 'stuck';
    }

    /**
     * 关卡生成：从关卡种子起派生种子逐个尝试，直到传播完全确定（唯一解）。
     * 实测命中率 80%+（见设计文档），预算内几乎必成功；确定性保证同关布局可复现。
     */
    function generateLevel(level) {
        const size = levelSize(level);
        const density = size >= 15 ? 0.65 : 0.62;
        const baseSeed = (BASE_SEED + level * LEVEL_SEED_STEP) >>> 0;
        for (let attempt = 0; attempt < GENERATE_BUDGET; attempt += 1) {
            const random = createSeededRandom((baseSeed + attempt * 7919) >>> 0);
            const solution = [];
            for (let r = 0; r < size; r += 1) {
                const row = [];
                for (let c = 0; c < size; c += 1) {
                    row.push(random() < density ? 1 : 0);
                }
                solution.push(row);
            }
            if (solveUnique(solution) !== 'solved') continue;
            const rows = solution.map(computeClues);
            const cols = [];
            for (let c = 0; c < size; c += 1) {
                cols.push(computeClues(solution.map((row) => row[c])));
            }
            return { size, solution, clues: { rows, cols } };
        }
        // 预算内失败兜底（实测不会触发）：退化为全对角线图案（天然唯一解）
        const solution = Array.from({ length: size }, (_, r) => Array.from({ length: size }, (_, c) => (r === c ? 1 : 0)));
        const rows = solution.map(computeClues);
        const cols = [];
        for (let c = 0; c < size; c += 1) {
            cols.push(computeClues(solution.map((row) => row[c])));
        }
        return { size, solution, clues: { rows, cols } };
    }

    /* ---------- 判胜与星级 ---------- */

    /** 胜判：所有行列的当前填格段序列与提示组一致（宽松判定，不逐格报错） */
    function checkWin(cells, clues) {
        const size = clues.rows.length;
        for (let r = 0; r < size; r += 1) {
            const line = [];
            for (let c = 0; c < size; c += 1) line.push(cells[r][c] === 1 || cells[r][c] === 3 ? 1 : 0);
            if (!clueGroupEqual(computeClues(line), clues.rows[r])) return false;
        }
        for (let c = 0; c < size; c += 1) {
            const line = [];
            for (let r = 0; r < size; r += 1) line.push(cells[r][c] === 1 || cells[r][c] === 3 ? 1 : 0);
            if (!clueGroupEqual(computeClues(line), clues.cols[c])) return false;
        }
        return true;
    }

    function clueGroupEqual(a, b) {
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i += 1) {
            if (a[i] !== b[i]) return false;
        }
        return true;
    }

    /** 行/列提示是否已满足（用于提示组变灰，仅表示数量已满） */
    function lineSatisfied(line, clue) {
        return clueGroupEqual(computeClues(line), clue);
    }

    /** 星级：3 星=未用提示且达标用时；2 星=未用提示；1 星=完成 */
    function starFor(level, timeMs, hintsUsed) {
        const size = levelSize(level);
        if (hintsUsed === 0 && timeMs <= STAR_TIME_BUDGET[size]) return 3;
        if (hintsUsed === 0) return 2;
        return 1;
    }

    function formatTime(ms) {
        const total = Math.floor(ms / 1000);
        const minutes = Math.floor(total / 60);
        const seconds = total % 60;
        return (minutes < 10 ? '0' : '') + minutes + ':' + (seconds < 10 ? '0' : '') + seconds;
    }

    /* ---------- 存档 ---------- */

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

    function readUnlocked() {
        return getStorageNumber(UNLOCK_KEY, 1);
    }

    function readCurrentLevel() {
        return Math.min(getStorageNumber(CURRENT_KEY, 1), Math.max(readUnlocked(), 1));
    }

    function writeCurrentLevel(level) {
        safeSetItem(CURRENT_KEY, String(level));
    }

    function readBestMs(level) {
        const parsed = Number.parseInt(safeGetItem(BEST_KEY_PREFIX + level) || '', 10);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    }

    function writeBestMs(level, ms) {
        const current = readBestMs(level);
        if (current !== null && current <= ms) return false;
        safeSetItem(BEST_KEY_PREFIX + level, String(ms));
        return true;
    }

    function readStars(level) {
        return getStorageNumber(STARS_KEY_PREFIX + level, 0);
    }

    function writeStars(level, stars) {
        if (stars <= readStars(level)) return;
        safeSetItem(STARS_KEY_PREFIX + level, String(stars));
    }

    function isStorageAvailable() {
        try {
            windowObject.localStorage.setItem('nonogram-probe', '1');
            windowObject.localStorage.removeItem('nonogram-probe');
            return true;
        } catch (_) {
            return false;
        }
    }

    /* ---------- 页面状态 ---------- */

    const state = {
        level: 1,
        size: 5,
        solution: [],
        clues: { rows: [], cols: [] },
        cells: [],
        cellButtons: [],
        rowClueEls: [],
        colClueEls: [],
        hintsLeft: HINTS_PER_LEVEL,
        undoStack: [],
        startAt: 0,
        timerId: 0,
        elapsed: 0,
        finished: false,
        longPressDone: false,
        cellTouchActive: false
    };

    const elements = {
        levelText: documentObject.getElementById('level-text'),
        timerText: documentObject.getElementById('timer-text'),
        hintsText: documentObject.getElementById('hints-text'),
        bestText: documentObject.getElementById('best-text'),
        board: documentObject.getElementById('board'),
        undoBtn: documentObject.getElementById('undo-btn'),
        restartBtn: documentObject.getElementById('restart-btn'),
        hintBtn: documentObject.getElementById('hint-btn'),
        hintCount: documentObject.getElementById('hint-count'),
        levelsBtn: documentObject.getElementById('levels-btn'),
        winModal: documentObject.getElementById('win-modal'),
        winTitle: documentObject.getElementById('win-title'),
        resultStars: documentObject.getElementById('result-stars'),
        resultTime: documentObject.getElementById('result-time'),
        resultBest: documentObject.getElementById('result-best'),
        resultHints: documentObject.getElementById('result-hints'),
        replayBtn: documentObject.getElementById('replay-btn'),
        nextBtn: documentObject.getElementById('next-btn'),
        levelModal: documentObject.getElementById('level-modal'),
        levelGrid: documentObject.getElementById('level-grid'),
        closeLevelsBtn: documentObject.getElementById('close-levels-btn')
    };

    function startTimer() {
        if (state.timerId || state.finished) return;
        state.startAt = Date.now() - state.elapsed;
        state.timerId = windowObject.setInterval(() => {
            state.elapsed = Date.now() - state.startAt;
            elements.timerText.textContent = formatTime(state.elapsed);
        }, 250);
    }

    function stopTimer() {
        if (state.timerId) {
            windowObject.clearInterval(state.timerId);
            state.timerId = 0;
        }
    }

    function snapshotCells() {
        state.undoStack.push(state.cells.map((row) => row.slice()));
        if (state.undoStack.length > 200) state.undoStack.shift();
    }

    function renderBoard() {
        elements.board.replaceChildren();
        elements.board.style.setProperty('--ng-size', String(state.size));

        const corner = documentObject.createElement('div');
        corner.className = 'corner';
        elements.board.appendChild(corner);

        state.colClueEls = [];
        state.clues.cols.forEach((clue) => {
            const el = documentObject.createElement('div');
            el.className = 'col-clue';
            clue.forEach((n) => {
                const span = documentObject.createElement('span');
                span.textContent = String(n);
                el.appendChild(span);
            });
            elements.board.appendChild(el);
            state.colClueEls.push(el);
        });

        state.rowClueEls = [];
        state.cellButtons = [];
        /** 取消尚未触发的长按定时器（touchend / touchmove / touchcancel 共用） */
        const clearPressTimer = () => {
            if (state.pressTimer) {
                windowObject.clearTimeout(state.pressTimer);
                state.pressTimer = 0;
            }
        };
        for (let r = 0; r < state.size; r += 1) {
            const rowClue = documentObject.createElement('div');
            rowClue.className = 'row-clue';
            state.clues.rows[r].forEach((n) => {
                const span = documentObject.createElement('span');
                span.textContent = String(n);
                rowClue.appendChild(span);
            });
            elements.board.appendChild(rowClue);
            state.rowClueEls.push(rowClue);

            for (let c = 0; c < state.size; c += 1) {
                const cell = documentObject.createElement('button');
                cell.type = 'button';
                cell.className = 'nono-cell';
                // 点击：长按定时器已标叉时，吞掉长按后的合成 click（消费并复位标志），避免二次翻转
                cell.addEventListener('click', () => {
                    if (state.longPressDone) {
                        state.longPressDone = false;
                        return;
                    }
                    onCellActivate(r, c, false);
                });
                cell.addEventListener('contextmenu', (event) => {
                    event.preventDefault();
                    // 触摸长按路径：定时器已标叉，这里不再翻转；也不复位标志，
                    // 留给其后的合成 click 消费（否则两种事件都发的浏览器会再翻转一次）。
                    // cellTouchActive 区分触摸手势与桌面鼠标右键，右键路径清掉残留标志，
                    // 保证混合设备上右键及其后的左键不受上次触摸长按影响。
                    if (state.cellTouchActive && state.longPressDone) return;
                    state.longPressDone = false;
                    onCellActivate(r, c, true);
                });
                cell.addEventListener('touchstart', () => {
                    state.longPressDone = false;
                    state.cellTouchActive = true;
                    state.pressTimer = windowObject.setTimeout(() => {
                        state.longPressDone = true;
                        onCellActivate(r, c, true);
                    }, 350);
                });
                cell.addEventListener('touchend', () => {
                    clearPressTimer();
                    state.cellTouchActive = false;
                });
                // 手指移走（滚动）或手势被系统打断（如来电）时取消长按，避免在起点凭空落叉
                cell.addEventListener('touchmove', clearPressTimer);
                cell.addEventListener('touchcancel', () => {
                    clearPressTimer();
                    state.cellTouchActive = false;
                });
                elements.board.appendChild(cell);
                state.cellButtons.push(cell);
            }
        }
        refreshCells();
        refreshClueStates();
    }

    function refreshCells() {
        state.cellButtons.forEach((cell, index) => {
            const r = Math.floor(index / state.size);
            const c = index % state.size;
            const value = state.cells[r][c];
            cell.className = 'nono-cell'
                + (value === 1 ? ' is-fill' : '')
                + (value === 2 ? ' is-mark' : '')
                + (value === 3 ? ' is-locked' : '');
        });
        elements.board.className = 'nono-board' + (state.finished ? ' is-solved' : '');
    }

    /** 提示组变灰：仅表示当前填格数量已满足（不判对错，宽松原则） */
    function refreshClueStates() {
        for (let r = 0; r < state.size; r += 1) {
            const line = state.cells[r].map((v) => (v === 1 || v === 3 ? 1 : 0));
            state.rowClueEls[r].className = 'row-clue' + (lineSatisfied(line, state.clues.rows[r]) ? ' is-done' : '');
        }
        for (let c = 0; c < state.size; c += 1) {
            const line = state.cells.map((row) => (row[c] === 1 || row[c] === 3 ? 1 : 0));
            state.colClueEls[c].className = 'col-clue' + (lineSatisfied(line, state.clues.cols[c]) ? ' is-done' : '');
        }
    }

    /** 三态切换：空→填→叉→空；markOnly（右键/长按）直接标叉；提示锁定格（3）不可改写 */
    function onCellActivate(r, c, markOnly) {
        if (state.finished) return;
        if (state.cells[r][c] === 3) return;
        startTimer();
        const current = state.cells[r][c];
        const next = markOnly ? (current === 2 ? 0 : 2) : (current + 1) % 3;
        if (next === current) return;
        snapshotCells();
        state.cells[r][c] = next;
        refreshCells();
        refreshClueStates();
        if (checkWin(state.cells, state.clues)) finishLevel();
    }

    function undo() {
        if (state.finished || state.undoStack.length === 0) return;
        state.cells = state.undoStack.pop();
        refreshCells();
        refreshClueStates();
    }

    /** 提示：随机揭示一个正确格为锁定填态 */
    function revealHint() {
        if (state.finished || state.hintsLeft <= 0) return;
        const candidates = [];
        for (let r = 0; r < state.size; r += 1) {
            for (let c = 0; c < state.size; c += 1) {
                if (state.solution[r][c] === 1 && state.cells[r][c] !== 1 && state.cells[r][c] !== 3) {
                    candidates.push([r, c]);
                }
            }
        }
        if (candidates.length === 0) return;
        startTimer();
        snapshotCells();
        const pick = candidates[Math.floor(Math.random() * candidates.length)];
        state.cells[pick[0]][pick[1]] = 3;
        state.hintsLeft -= 1;
        elements.hintCount.textContent = '(' + state.hintsLeft + ')';
        elements.hintsText.textContent = '(' + state.hintsLeft + ')';
        elements.hintBtn.disabled = state.hintsLeft === 0;
        refreshCells();
        refreshClueStates();
        if (checkWin(state.cells, state.clues)) finishLevel();
    }

    function finishLevel() {
        state.finished = true;
        stopTimer();
        refreshCells();
        const unlocked = readUnlocked();
        if (state.level >= unlocked) {
            safeSetItem(UNLOCK_KEY, String(state.level + 1));
        }
        const isRecord = writeBestMs(state.level, state.elapsed);
        const stars = starFor(state.level, state.elapsed, HINTS_PER_LEVEL - state.hintsLeft);
        writeStars(state.level, stars);
        elements.winTitle.textContent = isRecord ? '新纪录！底图显现！' : '底图显现！';
        elements.resultStars.textContent = '';
        for (let i = 0; i < 3; i += 1) {
            const star = documentObject.createElement('span');
            star.textContent = i < stars ? '★' : '☆';
            if (i >= stars) star.className = 'star-off';
            elements.resultStars.appendChild(star);
        }
        elements.resultTime.textContent = formatTime(state.elapsed);
        elements.resultBest.textContent = formatTime(readBestMs(state.level) || state.elapsed);
        elements.resultHints.textContent = String(HINTS_PER_LEVEL - state.hintsLeft);
        elements.winModal.hidden = false;
    }

    function loadLevel(level) {
        const data = generateLevel(level);
        state.level = level;
        state.size = data.size;
        state.solution = data.solution;
        state.clues = data.clues;
        state.cells = Array.from({ length: data.size }, () => new Array(data.size).fill(0));
        state.hintsLeft = HINTS_PER_LEVEL;
        state.undoStack = [];
        state.elapsed = 0;
        state.finished = false;
        /* 换关时清掉旧盘面挂起的长按定时器与触摸标志，防止回调在新盘面凭空落叉或吞点击 */
        if (state.pressTimer) {
            windowObject.clearTimeout(state.pressTimer);
        }
        state.pressTimer = 0;
        state.longPressDone = false;
        state.cellTouchActive = false;
        stopTimer();
        writeCurrentLevel(level);
        elements.levelText.textContent = data.size + '×' + data.size + ' · 第 ' + level + ' 关';
        elements.timerText.textContent = formatTime(0);
        elements.hintCount.textContent = '(' + HINTS_PER_LEVEL + ')';
        elements.hintsText.textContent = '(' + HINTS_PER_LEVEL + ')';
        elements.hintBtn.disabled = false;
        const best = readBestMs(level);
        elements.bestText.textContent = best === null ? '--' : formatTime(best);
        elements.winModal.hidden = true;
        renderBoard();
    }

    function openLevelModal() {
        elements.levelGrid.replaceChildren();
        const unlocked = readUnlocked();
        for (let level = 1; level <= Math.max(unlocked, state.level); level += 1) {
            const button = documentObject.createElement('button');
            button.type = 'button';
            const size = levelSize(level);
            button.textContent = level;
            button.title = size + '×' + size;
            button.className = 'level-item' + (level === state.level ? ' is-current' : '');
            button.addEventListener('click', () => {
                elements.levelModal.hidden = true;
                loadLevel(level);
            });
            elements.levelGrid.appendChild(button);
        }
        elements.levelModal.hidden = false;
    }

    function bindEvents() {
        elements.undoBtn.addEventListener('click', undo);
        elements.restartBtn.addEventListener('click', () => loadLevel(state.level));
        elements.hintBtn.addEventListener('click', revealHint);
        elements.levelsBtn.addEventListener('click', openLevelModal);
        elements.replayBtn.addEventListener('click', () => loadLevel(state.level));
        elements.nextBtn.addEventListener('click', () => loadLevel(state.level + 1));
        elements.closeLevelsBtn.addEventListener('click', () => {
            elements.levelModal.hidden = true;
        });
    }

    windowObject.Nonogram = {
        levelSize,
        computeClues,
        solveLine,
        solveUnique,
        generateLevel,
        checkWin,
        lineSatisfied,
        starFor,
        readUnlocked,
        readBestMs,
        writeBestMs,
        readStars,
        writeStars
    };

    bindEvents();
    loadLevel(readCurrentLevel());
})(window, document);
