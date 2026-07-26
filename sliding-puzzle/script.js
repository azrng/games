(function setupSlidingPuzzle(windowObject, documentObject) {
    'use strict';

    const SLUG = 'sliding-puzzle';
    const SIZE_CONFIGS = {
        3: { label: '3×3 入门', shuffleMoves: 24 },
        4: { label: '4×4 经典', shuffleMoves: 90 },
        5: { label: '5×5 挑战', shuffleMoves: 170 }
    };

    const state = {
        size: 4,
        board: [],
        steps: 0,
        seconds: 0,
        started: false,
        solved: false,
        history: [],
        timerId: 0,
        touchStart: null,
        lastMove: null, // 最近一次移动的 {tile, dx, dy}，供滑动动画使用，渲染后清空
        lastSteps: 0    // 用于步数变化时的跳动提醒
    };

    const elements = {
        sizeLabel: documentObject.getElementById('size-label'),
        stepsText: documentObject.getElementById('steps-text'),
        timerText: documentObject.getElementById('timer-text'),
        bestSteps: documentObject.getElementById('best-steps'),
        bestTime: documentObject.getElementById('best-time'),
        board: documentObject.getElementById('board'),
        sizePanel: documentObject.getElementById('size-panel'),
        resultModal: documentObject.getElementById('result-modal'),
        resultSize: documentObject.getElementById('result-size'),
        resultSteps: documentObject.getElementById('result-steps'),
        resultTime: documentObject.getElementById('result-time'),
        resultBestSteps: documentObject.getElementById('result-best-steps'),
        resultBestTime: documentObject.getElementById('result-best-time'),
        undoBtn: documentObject.getElementById('undo-btn'),
        shuffleBtn: documentObject.getElementById('shuffle-btn'),
        resetBtn: documentObject.getElementById('reset-btn'),
        sizeBtn: documentObject.getElementById('size-btn'),
        playAgainBtn: documentObject.getElementById('play-again-btn'),
        changeSizeBtn: documentObject.getElementById('change-size-btn'),
        confetti: documentObject.getElementById('confetti')
    };

    function createSolvedBoard(size) {
        const total = size * size;
        return Array.from({ length: total }, (_, index) => (index + 1) % total);
    }

    function isSolved(board) {
        for (let index = 0; index < board.length - 1; index += 1) {
            if (board[index] !== index + 1) {
                return false;
            }
        }
        return board[board.length - 1] === 0;
    }

    function getRow(index, size) {
        return Math.floor(index / size);
    }

    function getCol(index, size) {
        return index % size;
    }

    function areAdjacent(firstIndex, secondIndex, size) {
        const rowDiff = Math.abs(getRow(firstIndex, size) - getRow(secondIndex, size));
        const colDiff = Math.abs(getCol(firstIndex, size) - getCol(secondIndex, size));
        return rowDiff + colDiff === 1;
    }

    function canMove(board, tile, size) {
        const tileIndex = board.indexOf(tile);
        const emptyIndex = board.indexOf(0);
        return tileIndex >= 0 && areAdjacent(tileIndex, emptyIndex, size);
    }

    function moveTile(board, tile, size) {
        if (!canMove(board, tile, size)) {
            return board.slice();
        }

        const nextBoard = board.slice();
        const tileIndex = nextBoard.indexOf(tile);
        const emptyIndex = nextBoard.indexOf(0);
        nextBoard[emptyIndex] = tile;
        nextBoard[tileIndex] = 0;
        return nextBoard;
    }

    function countInversions(board) {
        const values = board.filter((value) => value !== 0);
        let inversions = 0;

        for (let i = 0; i < values.length; i += 1) {
            for (let j = i + 1; j < values.length; j += 1) {
                if (values[i] > values[j]) {
                    inversions += 1;
                }
            }
        }

        return inversions;
    }

    function isSolvable(board, size) {
        const inversions = countInversions(board);

        if (size % 2 === 1) {
            return inversions % 2 === 0;
        }

        const emptyRowFromBottom = size - getRow(board.indexOf(0), size);
        return (emptyRowFromBottom % 2 === 0) !== (inversions % 2 === 0);
    }

    function getMovableTiles(board, size, previousTile) {
        const emptyIndex = board.indexOf(0);
        const candidates = [];
        const row = getRow(emptyIndex, size);
        const col = getCol(emptyIndex, size);
        const offsets = [
            [-1, 0],
            [1, 0],
            [0, -1],
            [0, 1]
        ];

        offsets.forEach(([rowOffset, colOffset]) => {
            const nextRow = row + rowOffset;
            const nextCol = col + colOffset;
            if (nextRow < 0 || nextRow >= size || nextCol < 0 || nextCol >= size) {
                return;
            }

            const tile = board[nextRow * size + nextCol];
            if (tile !== previousTile) {
                candidates.push(tile);
            }
        });

        return candidates;
    }

    function shuffleBoard(size, moves) {
        let board = createSolvedBoard(size);
        let previousTile = -1;

        for (let step = 0; step < moves; step += 1) {
            const candidates = getMovableTiles(board, size, previousTile);
            const tile = candidates[Math.floor(Math.random() * candidates.length)];
            board = moveTile(board, tile, size);
            previousTile = tile;
        }

        if (isSolved(board)) {
            return shuffleBoard(size, moves + 1);
        }

        return board;
    }

    function formatTime(seconds) {
        const minutes = Math.floor(seconds / 60);
        const rest = seconds % 60;
        return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
    }

    function recordKey(size, field) {
        return `${SLUG}-${size}-${field}`;
    }

    function getStorageNumber(key) {
        const value = windowObject.localStorage.getItem(key);
        const parsed = Number.parseInt(value || '0', 10);
        return Number.isFinite(parsed) ? parsed : 0;
    }

    function loadRecord(size) {
        return {
            bestSteps: getStorageNumber(recordKey(size, 'best-steps')),
            bestTime: getStorageNumber(recordKey(size, 'best-time'))
        };
    }

    function saveRecord(size, result) {
        const current = loadRecord(size);
        const nextSteps = current.bestSteps === 0 ? result.steps : Math.min(current.bestSteps, result.steps);
        const nextTime = current.bestTime === 0 ? result.seconds : Math.min(current.bestTime, result.seconds);
        windowObject.localStorage.setItem(recordKey(size, 'best-steps'), String(nextSteps));
        windowObject.localStorage.setItem(recordKey(size, 'best-time'), String(nextTime));
        return { bestSteps: nextSteps, bestTime: nextTime };
    }

    function renderRecords() {
        const record = loadRecord(state.size);
        elements.bestSteps.textContent = record.bestSteps ? String(record.bestSteps) : '--';
        elements.bestTime.textContent = record.bestTime ? formatTime(record.bestTime) : '--';
    }

    function updateStats() {
        elements.sizeLabel.textContent = `${state.size}×${state.size}`;
        if (state.lastSteps !== state.steps) {
            // 重挂 bump 类让步数跳动动画重放
            elements.stepsText.classList.remove('bump');
            void elements.stepsText.offsetWidth;
            elements.stepsText.classList.add('bump');
            state.lastSteps = state.steps;
        }
        elements.stepsText.textContent = String(state.steps);
        elements.timerText.textContent = formatTime(state.seconds);
        elements.undoBtn.disabled = state.history.length === 0 || state.solved;
        renderRecords();
    }

    function renderBoard() {
        const fragment = documentObject.createDocumentFragment ? documentObject.createDocumentFragment() : null;
        const children = [];
        elements.board.style.gridTemplateColumns = `repeat(${state.size}, minmax(0, 1fr))`;

        state.board.forEach((tile, index) => {
            const cell = documentObject.createElement(tile === 0 ? 'div' : 'button');
            cell.className = tile === 0 ? 'empty-tile' : 'tile';

            if (tile !== 0) {
                cell.type = 'button';
                cell.textContent = String(tile);
                cell.dataset.tile = String(tile);
                cell.setAttribute('aria-label', `移动 ${tile}`);
                // 通关波浪动画按格序错峰
                cell.style.setProperty('--cell-index', String(index));
                // 已归位的方块给绿色反馈
                if (tile === index + 1) {
                    cell.classList.add('placed');
                }
                // 每步全量重建 DOM，新节点没有过渡可言；用 keyframes 从
                // 上一格的偏移滑入，方向由 moveByTile 记录的 lastMove 提供
                if (state.lastMove && state.lastMove.tile === tile) {
                    cell.classList.add('sliding');
                    cell.style.setProperty('--slide-x', String(state.lastMove.dx));
                    cell.style.setProperty('--slide-y', String(state.lastMove.dy));
                }
                cell.addEventListener('click', () => moveByTile(tile));
                cell.addEventListener('touchstart', (event) => handleTouchStart(event, tile), { passive: true });
                cell.addEventListener('touchend', (event) => handleTouchEnd(event, tile), { passive: false });
            }

            children.push(cell);
            if (fragment) {
                fragment.appendChild(cell);
            }
        });
        state.lastMove = null;

        if (fragment) {
            elements.board.replaceChildren(fragment);
        } else {
            elements.board.replaceChildren(...children);
        }
    }

    function startTimerIfNeeded() {
        if (state.started || state.solved) {
            return;
        }

        state.started = true;
        state.timerId = setInterval(() => {
            state.seconds += 1;
            updateStats();
        }, 1000);
    }

    function stopTimer() {
        if (state.timerId) {
            clearInterval(state.timerId);
            state.timerId = 0;
        }
    }

    function prefersReducedMotion() {
        return typeof windowObject.matchMedia === 'function'
            && windowObject.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }

    // 通关彩带：颜色取自 :root 调色板（primary/warning/danger/绿）
    function launchConfetti() {
        if (!elements.confetti || prefersReducedMotion()) {
            return;
        }
        const colors = ['#2957c8', '#f59e0b', '#dc3545', '#10b981', '#6b8ff0'];
        const pieces = [];
        for (let i = 0; i < 30; i += 1) {
            const x = (Math.random() * 100).toFixed(1);
            const delay = (Math.random() * 0.6).toFixed(2);
            const duration = (1.6 + Math.random() * 1.4).toFixed(2);
            const rotation = Math.round(360 + Math.random() * 540);
            pieces.push(`<span style="--x:${x}%;--delay:${delay}s;--dur:${duration}s;--rot:${rotation}deg;--clr:${colors[i % colors.length]}"></span>`);
        }
        elements.confetti.innerHTML = pieces.join('');
        elements.confetti.hidden = false;
    }

    function clearConfetti() {
        if (!elements.confetti) {
            return;
        }
        elements.confetti.hidden = true;
        elements.confetti.innerHTML = '';
    }

    function showResult() {
        state.solved = true;
        stopTimer();
        // 通关波浪：全部方块按格序脉冲一遍
        elements.board.classList.add('solved');
        launchConfetti();
        const record = saveRecord(state.size, { steps: state.steps, seconds: state.seconds });
        elements.resultSize.textContent = `${state.size}×${state.size}`;
        elements.resultSteps.textContent = String(state.steps);
        elements.resultTime.textContent = formatTime(state.seconds);
        elements.resultBestSteps.textContent = record.bestSteps ? String(record.bestSteps) : '--';
        elements.resultBestTime.textContent = record.bestTime ? formatTime(record.bestTime) : '--';
        elements.resultModal.hidden = false;
        updateStats();
    }

    function moveByTile(tile, options = {}) {
        if (state.solved || !canMove(state.board, tile, state.size)) {
            return false;
        }

        const previousBoard = state.board.slice();
        state.board = moveTile(state.board, tile, state.size);

        // 记录该方块从旧格到新格的方向（撤销时同样成立），供滑入动画使用
        const fromIndex = previousBoard.indexOf(tile);
        const toIndex = state.board.indexOf(tile);
        state.lastMove = {
            tile,
            dx: getCol(fromIndex, state.size) - getCol(toIndex, state.size),
            dy: getRow(fromIndex, state.size) - getRow(toIndex, state.size)
        };

        if (!options.isUndo) {
            state.history.push(previousBoard);
            state.steps += 1;
            startTimerIfNeeded();
        }

        renderBoard();
        updateStats();

        if (!options.skipWinCheck && isSolved(state.board)) {
            showResult();
        }

        return true;
    }

    function undo() {
        if (!state.history.length || state.solved) {
            return;
        }

        state.board = state.history.pop();
        state.steps = Math.max(0, state.steps - 1);
        renderBoard();
        updateStats();
    }

    function newGame(size = state.size) {
        const config = SIZE_CONFIGS[size] || SIZE_CONFIGS[4];
        state.size = size;
        state.board = shuffleBoard(size, config.shuffleMoves);
        state.steps = 0;
        state.seconds = 0;
        state.started = false;
        state.solved = false;
        state.history = [];
        state.touchStart = null;
        state.lastMove = null;
        state.lastSteps = 0;
        stopTimer();
        elements.board.classList.remove('solved');
        clearConfetti();
        elements.resultModal.hidden = true;
        elements.sizePanel.hidden = true;
        renderBoard();
        updateStats();
    }

    function showSizePanel() {
        elements.sizePanel.hidden = false;
    }

    function resetToSizePanel() {
        if (state.steps > 0 && !windowObject.confirm('确定要重置当前棋盘吗？')) {
            return;
        }
        stopTimer();
        state.started = false;
        state.solved = false;
        state.steps = 0;
        state.seconds = 0;
        state.history = [];
        elements.resultModal.hidden = true;
        showSizePanel();
        updateStats();
    }

    function handleTouchStart(event, tile) {
        const touch = event.changedTouches ? event.changedTouches[0] : null;
        if (!touch) {
            return;
        }
        state.touchStart = { x: touch.clientX, y: touch.clientY, tile };
    }

    function handleTouchEnd(event, tile) {
        if (!state.touchStart || state.touchStart.tile !== tile) {
            return;
        }

        const touch = event.changedTouches ? event.changedTouches[0] : null;
        if (!touch) {
            return;
        }

        const dx = touch.clientX - state.touchStart.x;
        const dy = touch.clientY - state.touchStart.y;
        state.touchStart = null;

        if (Math.max(Math.abs(dx), Math.abs(dy)) < 18) {
            return;
        }

        event.preventDefault();
        moveByTile(tile);
    }

    documentObject.querySelectorAll('.size-card').forEach((button) => {
        button.addEventListener('click', () => {
            const size = Number.parseInt(button.dataset.size || '4', 10);
            newGame(size);
        });
    });

    elements.sizeBtn.addEventListener('click', showSizePanel);
    elements.shuffleBtn.addEventListener('click', () => newGame(state.size));
    elements.undoBtn.addEventListener('click', undo);
    elements.resetBtn.addEventListener('click', resetToSizePanel);
    elements.playAgainBtn.addEventListener('click', () => newGame(state.size));
    elements.changeSizeBtn.addEventListener('click', () => {
        elements.resultModal.hidden = true;
        showSizePanel();
    });

    windowObject.SlidingPuzzle = {
        SLUG,
        SIZE_CONFIGS,
        createSolvedBoard,
        isSolved,
        isSolvable,
        canMove,
        moveTile,
        shuffleBoard,
        loadRecord,
        saveRecord,
        formatTime
    };

    showSizePanel();
    state.board = createSolvedBoard(state.size);
    renderBoard();
    updateStats();
})(window, document);
