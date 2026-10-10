(function setupMinesweeper(windowObject, documentObject) {
    'use strict';

    const SLUG = 'minesweeper';
    const DIFF_KEY = 'minesweeper-difficulty';
    const BEST_KEY_PREFIX = 'minesweeper-best-';
    const WINS_KEY_PREFIX = 'minesweeper-wins-';
    const LONG_PRESS_MS = 350;
    /* 无猜生成重试上限：超过后回退最后一次布雷，本局允许猜测 */
    const NO_GUESS_MAX_ATTEMPTS = 60;
    /* 单格触控目标下限：小屏上高列数棋盘改为横向滚动而不是无限压缩格子 */
    const CELL_MIN_PX = 32;
    const GRID_GAP_PX = 3;
    const GRID_PADDING_PX = 8;
    const memoryFallback = {};

    /* 竖屏比例的三档难度：cols 为列数，rows 为行数 */
    const DIFFICULTIES = {
        easy: { label: '初级', cols: 9, rows: 9, mines: 10 },
        medium: { label: '中级', cols: 10, rows: 13, mines: 22 },
        hard: { label: '高级', cols: 12, rows: 16, mines: 40 }
    };

    const state = {
        difficulty: 'easy',
        cols: 9,
        rows: 9,
        mineCount: 10,
        mines: new Set(),
        counts: [],
        revealed: [],
        flagged: [],
        cellButtons: [],
        started: false,
        finished: false,
        /* 本局是否为无猜盘面生成失败的回退局（仅内存标记，不提示玩家） */
        allowGuess: false,
        flagMode: false,
        flagsPlaced: 0,
        revealedCount: 0,
        startedAt: 0,
        elapsedSeconds: 0,
        timerId: 0,
        pressTimer: 0,
        suppressClick: false,
        longPressFired: false
    };

    const elements = {
        minesText: documentObject.getElementById('mines-text'),
        timerText: documentObject.getElementById('timer-text'),
        grid: documentObject.getElementById('grid'),
        restartBtn: documentObject.getElementById('restart-btn'),
        modeBtn: documentObject.getElementById('mode-btn'),
        diffButtons: [
            documentObject.getElementById('diff-easy'),
            documentObject.getElementById('diff-medium'),
            documentObject.getElementById('diff-hard')
        ],
        resultModal: documentObject.getElementById('result-modal'),
        resultEyebrow: documentObject.getElementById('result-eyebrow'),
        resultTitle: documentObject.getElementById('result-title'),
        resultTime: documentObject.getElementById('result-time'),
        resultBest: documentObject.getElementById('result-best'),
        resultWins: documentObject.getElementById('result-wins'),
        result3BV: documentObject.getElementById('result-3bv'),
        resultEff: documentObject.getElementById('result-eff'),
        againBtn: documentObject.getElementById('again-btn')
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

    function neighborsOf(index, rows, cols) {
        const cx = index % cols;
        const cy = Math.floor(index / cols);
        const result = [];
        for (let dy = -1; dy <= 1; dy += 1) {
            for (let dx = -1; dx <= 1; dx += 1) {
                if (dx === 0 && dy === 0) continue;
                const nx = cx + dx;
                const ny = cy + dy;
                if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
                result.push(ny * cols + nx);
            }
        }
        return result;
    }

    /* 首点后布雷：排除首点及其八邻域，保证首点安全且必开出一片 */
    function placeMines(rows, cols, mineCount, safeIndex, random) {
        const total = rows * cols;
        const excluded = new Set([safeIndex, ...neighborsOf(safeIndex, rows, cols)]);
        const candidates = [];
        for (let index = 0; index < total; index += 1) {
            if (!excluded.has(index)) candidates.push(index);
        }
        for (let i = candidates.length - 1; i > 0; i -= 1) {
            const j = Math.floor(random() * (i + 1));
            const tmp = candidates[i];
            candidates[i] = candidates[j];
            candidates[j] = tmp;
        }
        return new Set(candidates.slice(0, Math.min(mineCount, candidates.length)));
    }

    function computeCounts(mines, rows, cols) {
        const total = rows * cols;
        const counts = new Array(total).fill(0);
        for (let index = 0; index < total; index += 1) {
            if (mines.has(index)) {
                counts[index] = -1;
                continue;
            }
            let count = 0;
            for (const neighbor of neighborsOf(index, rows, cols)) {
                if (mines.has(neighbor)) count += 1;
            }
            counts[index] = count;
        }
        return counts;
    }

    /* 迭代洪泛翻开：空白格自动展开周围 */
    function floodReveal(start, mines, counts, revealed, flagged, rows, cols) {
        const opened = [];
        const stack = [start];
        while (stack.length > 0) {
            const index = stack.pop();
            if (revealed[index] || flagged[index] || mines.has(index)) continue;
            revealed[index] = true;
            opened.push(index);
            if (counts[index] === 0) {
                for (const neighbor of neighborsOf(index, rows, cols)) {
                    if (!revealed[neighbor] && !flagged[neighbor]) stack.push(neighbor);
                }
            }
        }
        return opened;
    }

    /* 3BV：盘面最少必要开格数。标准算法：空白（数字 0）洪泛连通块每块计 1；
       不与任何空白区相邻的数字格需单独点开，每格计 1。 */
    function compute3BV(mines, rows, cols) {
        const counts = computeCounts(mines, rows, cols);
        const total = rows * cols;
        const visited = new Array(total).fill(false);
        let bv = 0;

        for (let index = 0; index < total; index += 1) {
            if (mines.has(index) || counts[index] !== 0 || visited[index]) continue;
            bv += 1;
            const stack = [index];
            visited[index] = true;
            while (stack.length > 0) {
                const current = stack.pop();
                for (const neighbor of neighborsOf(current, rows, cols)) {
                    if (visited[neighbor] || mines.has(neighbor) || counts[neighbor] !== 0) continue;
                    visited[neighbor] = true;
                    stack.push(neighbor);
                }
            }
        }

        for (let index = 0; index < total; index += 1) {
            if (mines.has(index) || counts[index] === 0) continue;
            const adjacentToZero = neighborsOf(index, rows, cols).some((neighbor) => (
                !mines.has(neighbor) && counts[neighbor] === 0
            ));
            if (!adjacentToZero) bv += 1;
        }
        return bv;
    }

    /* 逻辑求解器：从首开局面出发，仅凭数字约束推理能否开完所有安全格（无需猜点）。
       规则两级：
       (a) 单格约束——数字格剩余雷数为 0 则未知邻域全安全；未知邻域数等于剩余雷数则全标雷；
       (b) 子集化简——A 的未知邻域是 B 的真子集时，差集的雷数 = B 剩余雷数 - A 剩余雷数。
       另用全局剩余雷数收尾（终局常用）。推理停滞且仍有安全格未开即为不可解。 */
    function isSolvableByLogic(mines, counts, rows, cols, openedIndices) {
        const total = rows * cols;
        const revealed = new Array(total).fill(false);
        const knownMines = new Array(total).fill(false);
        let revealedCount = 0;

        /* 翻开一格；空白格按洪泛规则连带翻开周围 */
        function solverReveal(startIndex) {
            const stack = [startIndex];
            while (stack.length > 0) {
                const index = stack.pop();
                if (revealed[index] || knownMines[index]) continue;
                revealed[index] = true;
                revealedCount += 1;
                if (counts[index] === 0) {
                    for (const neighbor of neighborsOf(index, rows, cols)) stack.push(neighbor);
                }
            }
        }

        for (const index of openedIndices) solverReveal(index);
        const targetCount = total - mines.size;

        while (revealedCount < targetCount) {
            let progress = false;

            /* 收集边界数字格：未知邻域与剩余雷数 */
            const frontier = [];
            for (let index = 0; index < total; index += 1) {
                if (!revealed[index] || counts[index] <= 0) continue;
                const unknown = [];
                let knownMineCount = 0;
                for (const neighbor of neighborsOf(index, rows, cols)) {
                    if (knownMines[neighbor]) knownMineCount += 1;
                    else if (!revealed[neighbor]) unknown.push(neighbor);
                }
                frontier.push({ unknown, remaining: counts[index] - knownMineCount });
            }

            function markSafe(index) {
                if (revealed[index] || knownMines[index]) return;
                solverReveal(index);
                progress = true;
            }

            function markMine(index) {
                if (revealed[index] || knownMines[index]) return;
                knownMines[index] = true;
                progress = true;
            }

            /* 规则 a：单格约束推理 */
            for (const cell of frontier) {
                if (cell.remaining === 0) {
                    for (const index of cell.unknown) markSafe(index);
                } else if (cell.unknown.length > 0 && cell.unknown.length === cell.remaining) {
                    for (const index of cell.unknown) markMine(index);
                }
            }

            /* 规则 b：子集化简 */
            if (!progress) {
                for (let i = 0; i < frontier.length && !progress; i += 1) {
                    for (let j = 0; j < frontier.length && !progress; j += 1) {
                        if (i === j) continue;
                        const a = frontier[i];
                        const b = frontier[j];
                        if (a.unknown.length === 0 || a.unknown.length >= b.unknown.length) continue;
                        let isSubset = true;
                        for (const index of a.unknown) {
                            if (!b.unknown.includes(index)) {
                                isSubset = false;
                                break;
                            }
                        }
                        if (!isSubset) continue;
                        const diff = b.unknown.filter((index) => !a.unknown.includes(index));
                        const diffMines = b.remaining - a.remaining;
                        if (diffMines === 0) {
                            for (const index of diff) markSafe(index);
                        } else if (diffMines === diff.length) {
                            for (const index of diff) markMine(index);
                        }
                    }
                }
            }

            /* 全局剩余雷数收尾：剩余未开格全部必为雷或全部安全 */
            if (!progress) {
                let knownMineTotal = 0;
                let unknownTotal = 0;
                for (let index = 0; index < total; index += 1) {
                    if (knownMines[index]) knownMineTotal += 1;
                    else if (!revealed[index]) unknownTotal += 1;
                }
                const remainingMines = mines.size - knownMineTotal;
                if (unknownTotal > 0 && remainingMines === 0) {
                    for (let index = 0; index < total; index += 1) {
                        if (!revealed[index]) markSafe(index);
                    }
                } else if (unknownTotal > 0 && unknownTotal === remainingMines) {
                    for (let index = 0; index < total; index += 1) {
                        if (!revealed[index]) markMine(index);
                    }
                }
            }

            if (!progress) return false;
        }
        return true;
    }

    /* 无猜布雷：重铺直到首开局面可全程推理；超限回退最后一次盘面（solvable=false 由调用方标记允许猜测） */
    function generateNoGuessBoard(rows, cols, mineCount, safeIndex, random) {
        let mines = null;
        let counts = null;
        let solvable = false;
        for (let attempt = 0; attempt < NO_GUESS_MAX_ATTEMPTS; attempt += 1) {
            mines = placeMines(rows, cols, mineCount, safeIndex, random);
            counts = computeCounts(mines, rows, cols);
            const revealed = new Array(rows * cols).fill(false);
            const flagged = new Array(rows * cols).fill(false);
            const opened = floodReveal(safeIndex, mines, counts, revealed, flagged, rows, cols);
            if (isSolvableByLogic(mines, counts, rows, cols, opened)) {
                solvable = true;
                break;
            }
        }
        return { mines, counts, solvable };
    }

    function formatTime(totalSeconds) {
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${minutes}:${String(seconds).padStart(2, '0')}`;
    }

    function loadBest(difficulty) {
        const parsed = Number.parseInt(safeGetItem(BEST_KEY_PREFIX + difficulty) || '', 10);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
    }

    function saveBest(difficulty, seconds) {
        const previous = loadBest(difficulty);
        const next = previous > 0 ? Math.min(previous, seconds) : seconds;
        safeSetItem(BEST_KEY_PREFIX + difficulty, String(next));
        return next;
    }

    function loadWins(difficulty) {
        const parsed = Number.parseInt(safeGetItem(WINS_KEY_PREFIX + difficulty) || '', 10);
        return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
    }

    function addWin(difficulty) {
        const next = loadWins(difficulty) + 1;
        safeSetItem(WINS_KEY_PREFIX + difficulty, String(next));
        return next;
    }

    function updateHeader() {
        elements.minesText.textContent = String(state.mineCount - state.flagsPlaced);
        elements.timerText.textContent = formatTime(state.elapsedSeconds);
    }

    function stopTimer() {
        if (state.timerId) {
            clearInterval(state.timerId);
            state.timerId = 0;
        }
    }

    function startTimer() {
        stopTimer();
        state.startedAt = Date.now();
        state.elapsedSeconds = 0;
        state.timerId = setInterval(() => {
            state.elapsedSeconds = Math.floor((Date.now() - state.startedAt) / 1000);
            updateHeader();
        }, 1000);
    }

    function cellView(index) {
        const button = state.cellButtons[index];
        button.className = 'mine-cell';
        button.textContent = '';
        delete button.dataset.n;

        if (state.revealed[index]) {
            button.classList.add('is-revealed');
            const count = state.counts[index];
            if (count > 0) {
                button.textContent = String(count);
                button.dataset.n = String(count);
            }
        } else if (state.flagged[index]) {
            button.classList.add('is-flagged');
            button.textContent = '🚩';
        }
    }

    function refreshCells(indices) {
        for (const index of indices) {
            cellView(index);
        }
    }

    function revealAllMines(boomIndex) {
        const total = state.rows * state.cols;
        for (let index = 0; index < total; index += 1) {
            const button = state.cellButtons[index];
            if (state.mines.has(index)) {
                if (state.flagged[index]) continue;
                button.className = 'mine-cell is-revealed is-mine';
                button.textContent = '💣';
                if (index === boomIndex) {
                    button.classList.add('is-boom');
                }
            } else if (state.flagged[index]) {
                button.className = 'mine-cell is-wrong-flag';
                button.textContent = '❌';
            }
        }
    }

    function showResult(won) {
        const best = won ? saveBest(state.difficulty, state.elapsedSeconds) : loadBest(state.difficulty);
        const wins = won ? addWin(state.difficulty) : loadWins(state.difficulty);
        elements.resultEyebrow.textContent = won ? 'Cleared' : 'Boom';
        elements.resultTitle.textContent = won ? '扫雷成功！' : '踩到地雷了';
        elements.resultTime.textContent = formatTime(state.elapsedSeconds);
        elements.resultBest.textContent = best > 0 ? formatTime(best) : '--';
        elements.resultWins.textContent = String(wins);
        if (won) {
            /* 3BV 效率 = 3BV / 分钟，保留 1 位小数；失败局不展示，保持占位符 */
            const bv = compute3BV(state.mines, state.rows, state.cols);
            const minutes = state.elapsedSeconds / 60;
            elements.result3BV.textContent = String(bv);
            elements.resultEff.textContent = minutes > 0 ? (bv / minutes).toFixed(1) : '--';
        } else {
            elements.result3BV.textContent = '--';
            elements.resultEff.textContent = '--';
        }
        elements.resultModal.hidden = false;
    }

    function finishGame(won, boomIndex) {
        state.finished = true;
        stopTimer();
        /* 用真实耗时结算，且至少记 1 秒，避免最短用时被存成 0 后当作无记录 */
        state.elapsedSeconds = Math.max(1, Math.floor((Date.now() - state.startedAt) / 1000));
        updateHeader();
        if (won) {
            /* 胜利时为剩余雷自动插旗 */
            for (const index of state.mines) {
                if (!state.flagged[index]) {
                    state.flagged[index] = true;
                    state.flagsPlaced += 1;
                    cellView(index);
                }
            }
        } else {
            revealAllMines(boomIndex);
        }
        updateHeader();
        setTimeout(() => showResult(won), won ? 500 : 800);
    }

    function checkWin() {
        const total = state.rows * state.cols;
        if (state.revealedCount >= total - state.mines.size) {
            finishGame(true, -1);
        }
    }

    function revealAt(index) {
        if (state.finished || state.revealed[index] || state.flagged[index]) return;

        if (!state.started) {
            /* 首点后才布雷，保证首点安全；无猜模式下重试生成可全程推理的盘面，只动布雷阶段 */
            const board = generateNoGuessBoard(state.rows, state.cols, state.mineCount, index, Math.random);
            state.mines = board.mines;
            state.counts = board.counts;
            state.allowGuess = !board.solvable;
            state.started = true;
            startTimer();
        }

        if (state.mines.has(index)) {
            state.revealed[index] = true;
            finishGame(false, index);
            return;
        }

        const opened = floodReveal(index, state.mines, state.counts, state.revealed, state.flagged, state.rows, state.cols);
        state.revealedCount += opened.length;
        refreshCells(opened);
        checkWin();
    }

    function toggleFlag(index) {
        /* 未开局时不允许盲插旗，先翻开首格 */
        if (!state.started || state.finished || state.revealed[index]) return;
        state.flagged[index] = !state.flagged[index];
        state.flagsPlaced += state.flagged[index] ? 1 : -1;
        cellView(index);
        updateHeader();
    }

    /* 快捷开：已翻开数字周围旗数吻合时，翻开其余未插旗邻格 */
    function chordAt(index) {
        if (state.finished || !state.revealed[index]) return;
        const count = state.counts[index];
        if (count <= 0) return;
        const neighbors = neighborsOf(index, state.rows, state.cols);
        const flaggedCount = neighbors.filter((n) => state.flagged[n]).length;
        if (flaggedCount !== count) return;
        for (const neighbor of neighbors) {
            if (state.finished) break;
            if (!state.flagged[neighbor] && !state.revealed[neighbor]) {
                revealAt(neighbor);
            }
        }
    }

    function handleCellTap(index) {
        if (state.finished) return;
        if (state.revealed[index]) {
            chordAt(index);
            return;
        }
        /* 未开局时无论什么模式都视为翻开首格 */
        if (state.flagMode && state.started) {
            toggleFlag(index);
            return;
        }
        revealAt(index);
    }

    function handleLongPress(index) {
        if (state.finished || state.revealed[index]) return;
        toggleFlag(index);
    }

    function bindCellEvents(button, index) {
        button.addEventListener('click', () => {
            if (state.suppressClick) {
                state.suppressClick = false;
                return;
            }
            handleCellTap(index);
        });
        button.addEventListener('pointerdown', () => {
            /* 新的按压开始时清理上一次手势的残留状态，避免吞掉本次点击 */
            state.suppressClick = false;
            state.longPressFired = false;
            if (state.pressTimer) clearTimeout(state.pressTimer);
            state.pressTimer = setTimeout(() => {
                state.pressTimer = 0;
                state.longPressFired = true;
                state.suppressClick = true;
                handleLongPress(index);
            }, LONG_PRESS_MS);
        });
        const cancelPress = () => {
            if (state.pressTimer) {
                clearTimeout(state.pressTimer);
                state.pressTimer = 0;
            }
        };
        button.addEventListener('pointerup', cancelPress);
        button.addEventListener('pointerleave', cancelPress);
        button.addEventListener('pointercancel', cancelPress);
        button.addEventListener('contextmenu', (event) => {
            /* 桌面右键插旗；长按已触发过的情况下跳过，避免 Android 长按双触发 */
            event.preventDefault();
            cancelPress();
            if (!state.longPressFired) {
                handleLongPress(index);
            }
        });
    }

    function renderBoard() {
        const total = state.rows * state.cols;
        const fragment = documentObject.createDocumentFragment();
        const buttons = [];

        elements.grid.style.gridTemplateColumns = `repeat(${state.cols}, minmax(${CELL_MIN_PX}px, 1fr))`;
        /* 保证每格不低于触控下限；容器放不下时由 board-section 横向滚动 */
        elements.grid.style.minWidth = `${state.cols * CELL_MIN_PX + (state.cols - 1) * GRID_GAP_PX + GRID_PADDING_PX * 2}px`;
        elements.grid.setAttribute('aria-label', `${DIFFICULTIES[state.difficulty].label}雷区，${state.rows} 行 ${state.cols} 列`);

        for (let index = 0; index < total; index += 1) {
            const button = documentObject.createElement('button');
            button.type = 'button';
            button.className = 'mine-cell';
            button.dataset.index = String(index);
            button.setAttribute('aria-label', `格子 ${index + 1}`);
            bindCellEvents(button, index);
            buttons.push(button);
            fragment.appendChild(button);
        }

        elements.grid.replaceChildren(fragment);
        state.cellButtons = buttons;
    }

    function setFlagMode(on) {
        state.flagMode = on;
        elements.modeBtn.textContent = on ? '模式：插旗 🚩' : '模式：挖掘 ⛏️';
        elements.modeBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
        if (on) {
            elements.modeBtn.classList.add('is-flag-mode');
        } else {
            elements.modeBtn.classList.remove('is-flag-mode');
        }
    }

    function updateDifficultyBar() {
        for (const button of elements.diffButtons) {
            if (!button) continue;
            if (button.dataset.diff === state.difficulty) {
                button.classList.add('is-active');
            } else {
                button.classList.remove('is-active');
            }
        }
    }

    function startGame(difficulty) {
        const config = DIFFICULTIES[difficulty] || DIFFICULTIES.easy;
        stopTimer();
        state.difficulty = difficulty;
        state.cols = config.cols;
        state.rows = config.rows;
        state.mineCount = config.mines;
        state.mines = new Set();
        state.counts = [];
        state.revealed = new Array(config.cols * config.rows).fill(false);
        state.flagged = new Array(config.cols * config.rows).fill(false);
        state.started = false;
        state.finished = false;
        state.allowGuess = false;
        state.flagsPlaced = 0;
        state.revealedCount = 0;
        state.elapsedSeconds = 0;
        setFlagMode(false);
        elements.resultModal.hidden = true;
        safeSetItem(DIFF_KEY, difficulty);
        updateDifficultyBar();
        renderBoard();
        updateHeader();
    }

    function requestDifficulty(difficulty) {
        if (difficulty === state.difficulty && !state.finished && !state.started) return;
        if (state.started && !state.finished) {
            const confirmed = typeof windowObject.confirm === 'function'
                ? windowObject.confirm('当前对局尚未结束，切换难度将重新开局，确定吗？')
                : true;
            if (!confirmed) return;
        }
        startGame(difficulty);
    }

    for (const button of elements.diffButtons) {
        if (!button) continue;
        button.addEventListener('click', () => requestDifficulty(button.dataset.diff));
    }
    elements.restartBtn.addEventListener('click', () => startGame(state.difficulty));
    elements.againBtn.addEventListener('click', () => startGame(state.difficulty));
    elements.modeBtn.addEventListener('click', () => setFlagMode(!state.flagMode));

    windowObject.Minesweeper = {
        SLUG,
        DIFFICULTIES,
        LONG_PRESS_MS,
        neighborsOf,
        placeMines,
        computeCounts,
        floodReveal,
        compute3BV,
        isSolvableByLogic,
        generateNoGuessBoard,
        NO_GUESS_MAX_ATTEMPTS,
        formatTime,
        loadBest,
        saveBest,
        loadWins,
        addWin
    };

    const savedDifficulty = safeGetItem(DIFF_KEY);
    startGame(DIFFICULTIES[savedDifficulty] ? savedDifficulty : 'easy');
})(window, document);
