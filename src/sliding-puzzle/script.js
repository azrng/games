(function setupSlidingPuzzle(windowObject, documentObject) {
    'use strict';

    const SLUG = 'sliding-puzzle';
    const SIZE_CONFIGS = {
        3: { label: '3×3 入门', shuffleMoves: 24 },
        4: { label: '4×4 经典', shuffleMoves: 90 },
        5: { label: '5×5 挑战', shuffleMoves: 170 }
    };

    // 每局可用提示次数，与平台其他游戏（点灯、五子棋）保持一致
    const HINTS_PER_ROUND = 3;
    // IDA* 预算：节点数与耗时取小者，超出后退化为贪心行列锁定法
    const IDA_NODE_BUDGET = 200000;
    const IDA_TIME_BUDGET_MS = 200;

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
        lastSteps: 0,   // 用于步数变化时的跳动提醒
        hintsLeft: HINTS_PER_ROUND, // 本局剩余提示次数
        usedHint: false,            // 本局是否用过提示（结算星级封顶降一级）
        hintTile: null,             // 当前提示高亮的方块编号，2 秒后自动消退
        hintTimer: 0                // 提示高亮的消退定时器
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
        hintBtn: documentObject.getElementById('hint-btn'),
        hintCount: documentObject.getElementById('hint-count'),
        resultStars: documentObject.getElementById('result-stars'),
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

    // ===================== 提示求解器（纯函数，供 UI 与测试共用） =====================

    // 曼哈顿距离：所有方块到目标格的行列距离之和
    function manhattanDistance(board, size) {
        let total = 0;
        for (let index = 0; index < board.length; index += 1) {
            const tile = board[index];
            if (tile === 0) {
                continue;
            }
            const goal = tile - 1;
            total += Math.abs(getRow(index, size) - getRow(goal, size));
            total += Math.abs(getCol(index, size) - getCol(goal, size));
        }
        return total;
    }

    // 线性冲突：同行（列）中目标也在该行（列）的方块出现相对逆序时，
    // 每移除一个冲突方块额外 +2（贪心移除冲突数最多者），估值仍不低于真实剩余步数
    function linearConflicts(board, size) {
        let conflicts = 0;

        // lineTiles：按当前顺序排列的同行（列）方块目标列号（行号），
        // 统计每个方块与多少方块构成逆序，移除冲突数最大者并计 2 步额外代价
        const resolveLine = (lineTiles) => {
            const remaining = lineTiles.slice();
            while (true) {
                let worst = -1;
                let worstCount = 0;
                for (let i = 0; i < remaining.length; i += 1) {
                    let count = 0;
                    for (let j = 0; j < remaining.length; j += 1) {
                        const inverted = i < j ? remaining[i] > remaining[j] : remaining[j] > remaining[i];
                        if (i !== j && inverted) {
                            count += 1;
                        }
                    }
                    if (count > worstCount) {
                        worstCount = count;
                        worst = i;
                    }
                }
                if (worst < 0) {
                    return;
                }
                remaining.splice(worst, 1);
                conflicts += 2;
            }
        };

        for (let row = 0; row < size; row += 1) {
            const lineTiles = [];
            for (let index = row * size; index < row * size + size; index += 1) {
                const tile = board[index];
                if (tile !== 0 && getRow(tile - 1, size) === row) {
                    lineTiles.push(getCol(tile - 1, size));
                }
            }
            resolveLine(lineTiles);
        }
        for (let col = 0; col < size; col += 1) {
            const lineTiles = [];
            for (let index = col; index < board.length; index += size) {
                const tile = board[index];
                if (tile !== 0 && getCol(tile - 1, size) === col) {
                    lineTiles.push(getRow(tile - 1, size));
                }
            }
            resolveLine(lineTiles);
        }
        return conflicts;
    }

    function heuristic(board, size) {
        return manhattanDistance(board, size) + linearConflicts(board, size);
    }

    const IDA_FOUND = -1;

    // IDA* 深度优先搜索：返回 IDA_FOUND 或本边界内被剪枝节点的最小 f 值。
    // board 会被原地修改（找到解时不回退），调用方必须传入副本
    function idaSearch(board, size, emptyIndex, g, bound, prevEmpty, path, stats, budget) {
        stats.nodes += 1;
        // 每 64 个节点才查一次时钟，降低预算检查开销
        if (stats.nodes > budget.nodeBudget
            || (stats.nodes % 64 === 0 && Date.now() - budget.startTime > budget.timeBudget)) {
            stats.busted = true;
            return Infinity;
        }

        const h = heuristic(board, size);
        if (g + h > bound) {
            return g + h;
        }
        if (h === 0) {
            return IDA_FOUND;
        }

        let minNext = Infinity;
        const row = getRow(emptyIndex, size);
        const col = getCol(emptyIndex, size);
        const offsets = [[-1, 0], [1, 0], [0, -1], [0, 1]];

        for (let i = 0; i < offsets.length; i += 1) {
            const nextRow = row + offsets[i][0];
            const nextCol = col + offsets[i][1];
            if (nextRow < 0 || nextRow >= size || nextCol < 0 || nextCol >= size) {
                continue;
            }
            const nextEmpty = nextRow * size + nextCol;
            if (nextEmpty === prevEmpty) {
                continue; // 不立刻撤销上一步
            }
            if (stats.busted) {
                return Infinity;
            }

            const tile = board[nextEmpty];
            board[nextEmpty] = 0;
            board[emptyIndex] = tile;
            path.push(tile);

            const result = idaSearch(board, size, nextEmpty, g + 1, bound, emptyIndex, path, stats, budget);
            if (result === IDA_FOUND) {
                return IDA_FOUND; // 完整解路径保留在 path 中，不回退
            }
            path.pop();
            board[emptyIndex] = 0;
            board[nextEmpty] = tile;

            if (stats.busted) {
                return Infinity;
            }
            if (result < minNext) {
                minNext = result;
            }
        }
        return minNext;
    }

    // IDA* 求下一步提示：nodeBudget/timeBudget 传 Infinity 表示不限（3×3 完整求解），
    // 超预算返回 null，由调用方退化为贪心策略
    function idaHint(board, size, nodeBudget, timeBudget) {
        const work = board.slice();
        if (isSolved(work)) {
            return null;
        }
        const stats = { nodes: 0, busted: false };
        const budget = { nodeBudget, timeBudget, startTime: Date.now() };
        const path = [];
        let bound = heuristic(work, size);

        while (true) {
            const result = idaSearch(work, size, work.indexOf(0), 0, bound, -1, path, stats, budget);
            if (stats.busted) {
                return null;
            }
            if (result === IDA_FOUND) {
                return makeHintFromTile(board, size, path[0]);
            }
            if (result === Infinity) {
                return null; // 搜索空间耗尽（仅不可解局面会出现）
            }
            bound = result;
        }
    }

    // 由待移动方块推导提示对象：方块当前坐标 + 滑向空格的方向
    function makeHintFromTile(board, size, tile) {
        const tileIndex = board.indexOf(tile);
        const emptyIndex = board.indexOf(0);
        const rowDiff = getRow(emptyIndex, size) - getRow(tileIndex, size);
        const colDiff = getCol(emptyIndex, size) - getCol(tileIndex, size);
        const direction = rowDiff === -1 ? 'up'
            : rowDiff === 1 ? 'down'
                : colDiff === -1 ? 'left' : 'right';
        return { tile, row: getRow(tileIndex, size), col: getCol(tileIndex, size), direction };
    }

    // ===================== 贪心行列锁定法（IDA* 超预算后的退化策略） =====================

    // 锁定顺序：先逐行归位（每行行尾两块必须成对处理），再在最后两行逐列成对归位，
    // 最后 2×2 不进锁定表（旋转收尾）。成对处理是关键：行/列末块单独归位会死锁。
    function greedyLockOrder(size) {
        const order = [];
        for (let row = 0; row <= size - 3; row += 1) {
            for (let col = 0; col <= size - 3; col += 1) {
                order.push(row * size + col);
            }
            order.push(row * size + size - 2);
            order.push(row * size + size - 1);
        }
        for (let col = 0; col <= size - 3; col += 1) {
            order.push((size - 2) * size + col);
            order.push((size - 1) * size + col);
        }
        return order;
    }

    // 当前已按序归位（锁定、不可再移动）的格子列表。
    // 行尾/列对子按"成对单位"锁定：两格同时归位才一起计入，
    // 避免"对子半格已锁、另一半无处安放"的经典口袋死锁
    function greedyLockedCells(board, size) {
        const order = greedyLockOrder(size);
        const locked = [];
        let i = 0;
        while (i < order.length) {
            const cell = order[i];
            const row = getRow(cell, size);
            const col = getCol(cell, size);
            // 对子头部：行尾第一格，或最后两行阶段的列上格
            const isPairHead = (row <= size - 3 && col === size - 2)
                || (row === size - 2 && col <= size - 3);
            if (isPairHead && i + 1 < order.length) {
                if (board[cell] === cell + 1 && board[order[i + 1]] === order[i + 1] + 1) {
                    locked.push(cell, order[i + 1]);
                    i += 2;
                    continue;
                }
                break;
            }
            if (board[cell] !== cell + 1) {
                break;
            }
            locked.push(cell);
            i += 1;
        }
        return locked;
    }

    // 在（关键方块位置 × 空格位置）状态空间上 BFS 推进：锁定格视为墙，
    // 空格每步与相邻非锁定格交换。trackB 传 -1 表示只跟踪单个方块；
    // goalEmpty 传 -1 表示空格落点随意。返回移动路径（仅 path[0] 的方块号
    // 与真实局面一致，贪心只取第一步），无路可达返回 null
    function bfsPlan(board, size, trackA, trackB, goalA, goalB, goalEmpty, locked) {
        const hasB = trackB > 0;
        const startA = board.indexOf(trackA);
        const startB = hasB ? board.indexOf(trackB) : -1;
        const startEmpty = board.indexOf(0);
        const encode = (a, b, empty) => `${a}|${b}|${empty}`;
        const isGoal = (a, b, empty) => a === goalA
            && (!hasB || b === goalB)
            && (goalEmpty < 0 || empty === goalEmpty);

        const queue = [{ a: startA, b: startB, empty: startEmpty, path: [] }];
        const visited = new Set([encode(startA, startB, startEmpty)]);

        while (queue.length > 0) {
            const current = queue.shift();
            if (isGoal(current.a, current.b, current.empty)) {
                return current.path;
            }
            const row = getRow(current.empty, size);
            const col = getCol(current.empty, size);
            const offsets = [[-1, 0], [1, 0], [0, -1], [0, 1]];
            for (let i = 0; i < offsets.length; i += 1) {
                const nextRow = row + offsets[i][0];
                const nextCol = col + offsets[i][1];
                if (nextRow < 0 || nextRow >= size || nextCol < 0 || nextCol >= size) {
                    continue;
                }
                const cell = nextRow * size + nextCol;
                if (locked.has(cell)) {
                    continue; // 锁定格是墙，保证已归位块不被移动
                }
                const nextA = cell === current.a ? current.empty : current.a;
                const nextB = cell === current.b ? current.empty : current.b;
                const key = encode(nextA, nextB, cell);
                if (visited.has(key)) {
                    continue;
                }
                visited.add(key);
                queue.push({
                    a: nextA,
                    b: nextB,
                    empty: cell,
                    path: current.path.concat(board[cell])
                });
            }
        }
        return null;
    }

    // 对子收尾两步的中间状态识别：已处摆位（A、B、空格就位）则推 A；
    // A 已借道归位（空格在 setupA、A 在目标格）则推 B。识别不到返回 null，
    // 交由通用摆位 BFS。单步建议 + 重规划的模式下必须识别这两个中间态，
    // 否则 BFS 会把已挪到目标格的 A 又摆回 setupA，造成两步振荡
    function pairSequenceHint(board, size, plan) {
        if (board[plan.setupA] === plan.aTile && board[plan.setupB] === plan.bTile
            && board[plan.setupEmpty] === 0) {
            return makeHintFromTile(board, size, plan.aTile);
        }
        if (board[plan.setupA] === 0 && board[plan.setupB] === plan.bTile
            && board[plan.setupEmpty] === plan.aTile) {
            return makeHintFromTile(board, size, plan.bTile);
        }
        return null;
    }

    // 最后 2×2 收尾：状态空间极小，直接 BFS 旋转归位
    function greedyLastSquareHint(board, size) {
        const cells = [
            (size - 2) * size + (size - 2),
            (size - 2) * size + (size - 1),
            (size - 1) * size + (size - 2),
            (size - 1) * size + (size - 1)
        ];
        const goalKey = [cells[0] + 1, cells[1] + 1, cells[2] + 1, 0].join(',');
        // 2×2 内四格的相邻关系
        const neighborsOf = [[1, 2], [0, 3], [0, 3], [1, 2]];
        const startSlice = cells.map((cell) => board[cell]);
        const queue = [{ slice: startSlice, path: [] }];
        const seen = new Set([startSlice.join(',')]);

        while (queue.length > 0) {
            const current = queue.shift();
            const key = current.slice.join(',');
            if (key === goalKey) {
                return current.path.length > 0 ? makeHintFromTile(board, size, current.path[0]) : null;
            }
            const emptyPos = current.slice.indexOf(0);
            for (let i = 0; i < neighborsOf[emptyPos].length; i += 1) {
                const other = neighborsOf[emptyPos][i];
                const nextSlice = current.slice.slice();
                nextSlice[emptyPos] = nextSlice[other];
                nextSlice[other] = 0;
                const nextKey = nextSlice.join(',');
                if (seen.has(nextKey)) {
                    continue;
                }
                seen.add(nextKey);
                queue.push({ slice: nextSlice, path: current.path.concat(nextSlice[emptyPos]) });
            }
        }
        return null;
    }

    // 贪心提示：给出下一步建议（合法移动且绝不移动已锁定方块），无解可给时返回 null
    function greedyHint(board, size) {
        if (isSolved(board)) {
            return null;
        }
        const order = greedyLockOrder(size);
        const lockedCells = greedyLockedCells(board, size);
        const locked = new Set(lockedCells);

        if (lockedCells.length < order.length) {
            const cell = order[lockedCells.length];
            const row = getRow(cell, size);
            const col = getCol(cell, size);

            if (row <= size - 3 && col <= size - 3) {
                // 行首单块：直接把目标方块推入目标格
                const path = bfsPlan(board, size, cell + 1, -1, cell, -1, -1, locked);
                if (!path || path.length === 0) {
                    return null;
                }
                return makeHintFromTile(board, size, path[0]);
            }

            if (row <= size - 3) {
                // 行尾对子（无论哪半格未归位都按对子整体处理）：
                // 摆位 A→(r,size-1)、B→(r+1,size-1)、空格→(r,size-2)，
                // 随后 A 左移、B 上移先后归位。对子未成对归位前两格都不锁定，
                // A 即使暂在目标格也可挪出重摆
                const aTile = cell + 1;
                const bTile = cell + 2;
                const setupA = row * size + (size - 1);
                const setupB = (row + 1) * size + (size - 1);
                const setupEmpty = row * size + (size - 2);
                const pairHint = pairSequenceHint(board, size, {
                    aTile,
                    bTile,
                    setupA,
                    setupB,
                    setupEmpty
                });
                if (pairHint) {
                    return pairHint;
                }
                const path = bfsPlan(board, size, aTile, bTile, setupA, setupB, setupEmpty, locked) || [];
                return makeHintFromTile(board, size, path[0]);
            }

            // 列对子（最后两行阶段）：摆位 A→(size-1,c)、B→(size-1,c+1)、
            // 空格→(size-2,c)，随后 A 上移、B 左移先后归位
            const aTile = cell + 1;
            const bTile = cell + 1 + size;
            const setupA = (size - 1) * size + col;
            const setupB = (size - 1) * size + col + 1;
            const setupEmpty = (size - 2) * size + col;
            const pairHint = pairSequenceHint(board, size, {
                aTile,
                bTile,
                setupA,
                setupB,
                setupEmpty
            });
            if (pairHint) {
                return pairHint;
            }
            const path = bfsPlan(board, size, aTile, bTile, setupA, setupB, setupEmpty, locked) || [];
            return makeHintFromTile(board, size, path[0]);
        }

        // 锁定表全部满足，仅剩 2×2 旋转收尾
        return greedyLastSquareHint(board, size);
    }

    // 提示入口：3×3 用 IDA* 完整求解（最优解）；
    // 4×4/5×5 用带预算 IDA*，超预算退化为贪心行列锁定法
    function computeHint(board, size) {
        if (isSolved(board)) {
            return null;
        }
        if (size === 3) {
            return idaHint(board, size, Infinity, Infinity);
        }
        return idaHint(board, size, IDA_NODE_BUDGET, IDA_TIME_BUDGET_MS) || greedyHint(board, size);
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
        elements.hintCount.textContent = `(${state.hintsLeft})`;
        elements.hintBtn.disabled = state.hintsLeft <= 0 || state.solved;
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
                // 提示高亮：建议移动的方块，2 秒后由定时器清除
                if (state.hintTile === tile) {
                    cell.classList.add('hint');
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
        const colors = ['#2957c8', '#f59e0b', '#dc3545', '#148f80', '#6b8ff0'];
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

    // 结算星级：追平或打破个人最佳 3 星，1.5 倍以内 2 星，其余 1 星；
    // 本局用过提示则封顶降一级（3→2、2→1、1 保底）
    function starRating(steps, bestSteps, usedHint) {
        let stars = 3;
        if (bestSteps > 0 && steps > bestSteps) {
            stars = steps <= Math.ceil(bestSteps * 1.5) ? 2 : 1;
        }
        return usedHint ? Math.max(1, stars - 1) : stars;
    }

    // 按星级渲染结算面板的星星（未获得的置灰）
    function renderStars(stars) {
        const nodes = [];
        for (let index = 0; index < 3; index += 1) {
            const span = documentObject.createElement('span');
            span.textContent = '★';
            if (index >= stars) {
                span.className = 'star-off';
            }
            nodes.push(span);
        }
        elements.resultStars.replaceChildren(...nodes);
        elements.resultStars.setAttribute('aria-label', `${stars} 星`);
    }

    function showResult() {
        state.solved = true;
        stopTimer();
        // 通关波浪：全部方块按格序脉冲一遍
        elements.board.classList.add('solved');
        launchConfetti();
        // 星级按保存前的旧纪录评定，再写入新纪录
        const previous = loadRecord(state.size);
        const stars = starRating(state.steps, previous.bestSteps, state.usedHint);
        const record = saveRecord(state.size, { steps: state.steps, seconds: state.seconds });
        renderStars(stars);
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

    // 清除提示高亮与定时器（局面变化时调用，渲染由调用方负责）
    function clearHintHighlight() {
        if (state.hintTimer) {
            clearTimeout(state.hintTimer);
            state.hintTimer = 0;
        }
        state.hintTile = null;
    }

    // 请求一步提示：实时求解当前局面，高亮建议方块 2 秒；
    // 无提示可给时不消耗次数
    function requestHint() {
        if (state.solved || state.hintsLeft <= 0) {
            return;
        }
        const hint = computeHint(state.board, state.size);
        if (!hint) {
            return;
        }
        state.hintsLeft -= 1;
        state.usedHint = true;
        clearHintHighlight();
        state.hintTile = hint.tile;
        renderBoard();
        state.hintTimer = setTimeout(() => {
            state.hintTimer = 0;
            state.hintTile = null;
            renderBoard();
        }, 2000);
        updateStats();
    }

    function undo() {
        if (!state.history.length || state.solved) {
            return;
        }

        state.board = state.history.pop();
        state.steps = Math.max(0, state.steps - 1);
        // 提示次数随局面回退一并重置
        state.hintsLeft = HINTS_PER_ROUND;
        state.usedHint = false;
        clearHintHighlight();
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
        state.hintsLeft = HINTS_PER_ROUND;
        state.usedHint = false;
        clearHintHighlight();
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
        state.hintsLeft = HINTS_PER_ROUND;
        state.usedHint = false;
        clearHintHighlight();
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
    elements.hintBtn.addEventListener('click', requestHint);
    elements.resetBtn.addEventListener('click', resetToSizePanel);
    elements.playAgainBtn.addEventListener('click', () => newGame(state.size));
    elements.changeSizeBtn.addEventListener('click', () => {
        elements.resultModal.hidden = true;
        showSizePanel();
    });

    windowObject.SlidingPuzzle = {
        SLUG,
        SIZE_CONFIGS,
        HINTS_PER_ROUND,
        IDA_NODE_BUDGET,
        IDA_TIME_BUDGET_MS,
        createSolvedBoard,
        isSolved,
        isSolvable,
        canMove,
        moveTile,
        shuffleBoard,
        manhattanDistance,
        linearConflicts,
        idaHint,
        greedyLockOrder,
        greedyLockedCells,
        greedyHint,
        computeHint,
        starRating,
        loadRecord,
        saveRecord,
        formatTime
    };

    showSizePanel();
    state.board = createSolvedBoard(state.size);
    renderBoard();
    updateStats();
})(window, document);
