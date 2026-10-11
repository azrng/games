(function setupMiniSudoku(windowObject, documentObject) {
    'use strict';

    const SLUG = 'mini-sudoku';
    const UNLOCK_KEY = 'mini-sudoku-unlocked-level';
    const STARS_KEY_PREFIX = 'mini-sudoku-stars-';
    const BASE_SEED = 20261010;
    const LEVEL_COUNT = 12;
    /* 每关挖空数内置表：1-6 关 4×4（4→8），7-12 关 6×6（6→14），各自档位内单调不减 */
    const LEVEL_BLANKS = [4, 5, 6, 7, 7, 8, 6, 8, 9, 11, 12, 14];
    /* 单轮挖洞没挖到目标数时，换派生种子整轮重来的最大尝试次数 */
    const GENERATE_ATTEMPTS = 16;
    /* 4×4 用 4 种动物、6×6 用 6 种水果，图案数量与棋盘阶数一致 */
    const EMOJIS = {
        4: ['🐱', '🐶', '🐰', '🦊'],
        6: ['🍓', '🍋', '🍇', '🍉', '🍑', '🥝']
    };
    const memoryFallback = {};

    const state = {
        level: 1,
        size: 4,
        boxRows: 2,
        boxCols: 2,
        board: [],
        solution: [],
        givenFlags: [],
        selectedIndex: -1,
        mistakes: 0,
        locked: false,
        cellButtons: []
    };

    const elements = {
        levelText: documentObject.getElementById('level-text'),
        mistakesText: documentObject.getElementById('mistakes-text'),
        emptyText: documentObject.getElementById('empty-text'),
        grid: documentObject.getElementById('grid'),
        palette: documentObject.getElementById('palette'),
        feedbackText: documentObject.getElementById('feedback-text'),
        clearBtn: documentObject.getElementById('clear-btn'),
        restartBtn: documentObject.getElementById('restart-btn'),
        levelsBtn: documentObject.getElementById('levels-btn'),
        winModal: documentObject.getElementById('win-modal'),
        resultStars: documentObject.getElementById('result-stars'),
        resultMistakes: documentObject.getElementById('result-mistakes'),
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

    /* mulberry32 种子随机数，保证同种子关卡布局可复现 */
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

    /* Fisher-Yates 洗牌：候选与挖洞顺序随机化，用于完整解生成与挖洞选格 */
    function shuffleValues(list, random) {
        const values = list.slice();
        for (let i = values.length - 1; i > 0; i -= 1) {
            const j = Math.floor(random() * (i + 1));
            const tmp = values[i];
            values[i] = values[j];
            values[j] = tmp;
        }
        return values;
    }

    function levelCount() {
        return LEVEL_COUNT;
    }

    /* 关卡配置：1-6 关 4×4（2×2 宫）、7-12 关 6×6（2 行 3 列宫），挖空数查内置表 */
    function levelConfig(level) {
        const safeLevel = Math.min(Math.max(1, level), LEVEL_COUNT);
        const size = safeLevel <= 6 ? 4 : 6;
        return {
            size,
            boxRows: 2,
            boxCols: size === 4 ? 2 : 3,
            blanks: LEVEL_BLANKS[safeLevel - 1]
        };
    }

    function levelSeed(level) {
        return (BASE_SEED + level * 6271) >>> 0;
    }

    /* 格子所在宫编号：宫按先行后列排列（4×4 为 2×2 四宫，6×6 为 2 行 3 列六宫） */
    function boxIndexOf(index, size, boxRows, boxCols) {
        const row = Math.floor(index / size);
        const col = index % size;
        return Math.floor(row / boxRows) * (size / boxCols) + Math.floor(col / boxCols);
    }

    /* 某格候选值：剔除同行、同列、同宫已出现的值（0 表示空格，不占值） */
    function candidatesFor(grid, size, boxRows, boxCols, index) {
        const row = Math.floor(index / size);
        const col = index % size;
        const box = boxIndexOf(index, size, boxRows, boxCols);
        const used = new Array(size + 1).fill(false);
        for (let i = 0; i < grid.length; i += 1) {
            const value = grid[i];
            if (!value || i === index) continue;
            if (Math.floor(i / size) === row || i % size === col || boxIndexOf(i, size, boxRows, boxCols) === box) {
                used[value] = true;
            }
        }
        const candidates = [];
        for (let value = 1; value <= size; value += 1) {
            if (!used[value]) candidates.push(value);
        }
        return candidates;
    }

    /* 回溯生成完整解：每步选候选最少的空格（MRV），取值顺序由种子随机打乱 */
    function generateFullSolution(size, boxRows, boxCols, random) {
        const total = size * size;
        const grid = new Array(total).fill(0);

        function fill() {
            let target = -1;
            let options = null;
            for (let index = 0; index < total; index += 1) {
                if (grid[index] !== 0) continue;
                const candidates = candidatesFor(grid, size, boxRows, boxCols, index);
                if (candidates.length === 0) return false;
                if (options === null || candidates.length < options.length) {
                    target = index;
                    options = candidates;
                    if (candidates.length === 1) break;
                }
            }
            if (target === -1) return true;
            for (const value of shuffleValues(options, random)) {
                grid[target] = value;
                if (fill()) return true;
                grid[target] = 0;
            }
            return false;
        }

        fill();
        return grid;
    }

    /* 解数计数：MRV 选格回溯，数到 limit 即剪枝返回（默认上限 2）。
       给定值自带冲突的盘无解，入口先整体校验一次 */
    function countSolutions(grid, size, boxRows, boxCols, limit = 2) {
        const safeLimit = limit > 0 ? limit : 2;
        if (conflictCells(grid, size, boxRows, boxCols).length > 0) return 0;
        const total = size * size;
        const work = grid.slice();
        let count = 0;

        function search() {
            let target = -1;
            let options = null;
            for (let index = 0; index < total; index += 1) {
                if (work[index] !== 0) continue;
                const candidates = candidatesFor(work, size, boxRows, boxCols, index);
                if (candidates.length === 0) return false;
                if (options === null || candidates.length < options.length) {
                    target = index;
                    options = candidates;
                    if (candidates.length === 1) break;
                }
            }
            if (target === -1) {
                count += 1;
                return count >= safeLimit;
            }
            for (const value of options) {
                work[target] = value;
                const stop = search();
                work[target] = 0;
                if (stop) return true;
            }
            return false;
        }

        search();
        return count;
    }

    /* 冲突格集合：同行/列/宫中出现 ≥2 个相同值时，这些格全部标记（0 为空格不参与） */
    function conflictCells(grid, size, boxRows, boxCols) {
        const marked = new Set();

        function markGroup(indices) {
            const firstSeen = new Array(size + 1).fill(-1);
            for (const index of indices) {
                const value = grid[index];
                if (!value) continue;
                if (firstSeen[value] === -1) {
                    firstSeen[value] = index;
                } else {
                    marked.add(firstSeen[value]);
                    marked.add(index);
                }
            }
        }

        for (let row = 0; row < size; row += 1) {
            const indices = [];
            for (let col = 0; col < size; col += 1) indices.push(row * size + col);
            markGroup(indices);
        }
        for (let col = 0; col < size; col += 1) {
            const indices = [];
            for (let row = 0; row < size; row += 1) indices.push(row * size + col);
            markGroup(indices);
        }
        const boxCount = (size / boxRows) * (size / boxCols);
        const boxGroups = [];
        for (let box = 0; box < boxCount; box += 1) boxGroups.push([]);
        for (let index = 0; index < grid.length; index += 1) {
            boxGroups[boxIndexOf(index, size, boxRows, boxCols)].push(index);
        }
        for (const indices of boxGroups) markGroup(indices);

        return Array.from(marked).sort((a, b) => a - b);
    }

    /* 校验完整解：格数正确、全部填满且值合法、无任何冲突 */
    function validateGrid(grid, size, boxRows, boxCols) {
        const total = size * size;
        if (!Array.isArray(grid) || grid.length !== total) return false;
        for (let index = 0; index < total; index += 1) {
            const value = grid[index];
            if (!Number.isInteger(value) || value < 1 || value > size) return false;
        }
        return conflictCells(grid, size, boxRows, boxCols).length === 0;
    }

    /* 生成关卡：回溯完整解 → 随机顺序挖洞 → 逐格用解数计数器（上限 2）保证唯一解，
       不唯一则回填该格继续尝试其余格子；一轮没挖到目标数则换派生种子整轮重来 */
    function generatePuzzle(level, seed) {
        const config = levelConfig(level);
        const total = config.size * config.size;
        let last = null;
        for (let attempt = 0; attempt < GENERATE_ATTEMPTS; attempt += 1) {
            const random = createSeededRandom((seed + attempt * 7919) >>> 0);
            const solution = generateFullSolution(config.size, config.boxRows, config.boxCols, random);
            const indices = [];
            for (let index = 0; index < total; index += 1) indices.push(index);
            const order = shuffleValues(indices, random);
            const puzzle = solution.slice();
            let removed = 0;
            for (const index of order) {
                if (removed >= config.blanks) break;
                const backup = puzzle[index];
                puzzle[index] = 0;
                if (countSolutions(puzzle, config.size, config.boxRows, config.boxCols, 2) === 1) {
                    removed += 1;
                } else {
                    puzzle[index] = backup;
                }
            }
            const givens = [];
            for (let index = 0; index < total; index += 1) {
                if (puzzle[index] !== 0) givens.push({ index, value: puzzle[index] });
            }
            last = { givens, solution, size: config.size, boxRows: config.boxRows, boxCols: config.boxCols };
            if (removed === config.blanks) return last;
        }
        return last;
    }

    /* 星级按填错次数：零失误 3 星，≤3 次 2 星，其余 1 星 */
    function starRating(mistakes) {
        if (mistakes <= 0) return 3;
        if (mistakes <= 3) return 2;
        return 1;
    }

    function loadUnlockedLevel() {
        const parsed = Number.parseInt(safeGetItem(UNLOCK_KEY) || '', 10);
        return Number.isFinite(parsed) && parsed >= 1 ? Math.min(parsed, LEVEL_COUNT) : 1;
    }

    function saveUnlockedLevel(level) {
        if (level > loadUnlockedLevel()) {
            safeSetItem(UNLOCK_KEY, String(level));
        }
    }

    function loadStars(level) {
        const parsed = Number.parseInt(safeGetItem(STARS_KEY_PREFIX + level) || '', 10);
        return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
    }

    function saveStars(level, stars) {
        if (stars > loadStars(level)) {
            safeSetItem(STARS_KEY_PREFIX + level, String(stars));
        }
    }

    /* ---------- 以下为页面交互 ---------- */

    function updateHeader() {
        let emptyCount = 0;
        for (let index = 0; index < state.board.length; index += 1) {
            if (!state.board[index]) emptyCount += 1;
        }
        elements.levelText.textContent = `第 ${state.level} 关`;
        elements.mistakesText.textContent = String(state.mistakes);
        elements.emptyText.textContent = String(emptyCount);
    }

    function updateBoardView() {
        const emojis = EMOJIS[state.size] || EMOJIS[4];
        const conflicts = new Set(conflictCells(state.board, state.size, state.boxRows, state.boxCols));
        const size = state.size;
        for (let index = 0; index < state.cellButtons.length; index += 1) {
            const button = state.cellButtons[index];
            const value = state.board[index];
            const row = Math.floor(index / size);
            const col = index % size;
            const emoji = value ? emojis[value - 1] : '';
            button.textContent = emoji;
            button.classList.toggle('is-given', state.givenFlags[index]);
            button.classList.toggle('is-filled', value > 0 && !state.givenFlags[index]);
            button.classList.toggle('is-selected', index === state.selectedIndex);
            button.classList.toggle('is-conflict', conflicts.has(index));
            button.setAttribute(
                'aria-label',
                `第 ${row + 1} 行第 ${col + 1} 列${emoji ? `，${emoji}` : '，空格'}`
            );
        }
    }

    function renderBoard() {
        const total = state.size * state.size;
        elements.grid.style.gridTemplateColumns = `repeat(${state.size}, minmax(0, 1fr))`;
        elements.grid.setAttribute('aria-label', `第 ${state.level} 关，${state.size} 乘 ${state.size} 数独棋盘`);
        elements.grid.classList.toggle('is-4', state.size === 4);
        elements.grid.classList.toggle('is-6', state.size === 6);

        const fragment = documentObject.createDocumentFragment();
        const buttons = [];
        for (let index = 0; index < total; index += 1) {
            const button = documentObject.createElement('button');
            button.type = 'button';
            button.className = 'sudoku-cell';
            button.dataset.index = String(index);
            const row = Math.floor(index / state.size);
            const col = index % state.size;
            /* 最后一行/列不画粗线，宫分隔线画在每宫末行/末列 */
            if (col === state.size - 1) {
                button.classList.add('edge-right');
            } else if ((col + 1) % state.boxCols === 0) {
                button.classList.add('box-right');
            }
            if (row === state.size - 1) {
                button.classList.add('edge-bottom');
            } else if ((row + 1) % state.boxRows === 0) {
                button.classList.add('box-bottom');
            }
            button.setAttribute('aria-label', `第 ${row + 1} 行第 ${col + 1} 列`);
            button.addEventListener('click', () => handleCellTap(index));
            buttons.push(button);
            fragment.appendChild(button);
        }

        elements.grid.replaceChildren(fragment);
        state.cellButtons = buttons;
        updateBoardView();
    }

    function renderPalette() {
        const emojis = EMOJIS[state.size] || EMOJIS[4];
        const fragment = documentObject.createDocumentFragment();
        for (let value = 1; value <= emojis.length; value += 1) {
            const button = documentObject.createElement('button');
            button.type = 'button';
            button.className = 'palette-btn';
            button.textContent = emojis[value - 1];
            button.setAttribute('aria-label', `填入 ${emojis[value - 1]}`);
            button.addEventListener('click', () => handlePalettePick(value));
            fragment.appendChild(button);
        }
        elements.palette.replaceChildren(fragment);
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

    function playStarAnimation() {
        elements.resultStars.classList.remove('is-show');
        /* 强制回流，保证连续过关时星星动画都能重新播放 */
        void elements.resultStars.offsetWidth;
        elements.resultStars.classList.add('is-show');
    }

    function isBoardComplete() {
        for (let index = 0; index < state.board.length; index += 1) {
            if (!state.board[index]) return false;
        }
        return conflictCells(state.board, state.size, state.boxRows, state.boxCols).length === 0;
    }

    function finishLevel() {
        state.locked = true;
        state.selectedIndex = -1;
        elements.grid.classList.add('is-solved');
        elements.feedbackText.textContent = '';
        updateBoardView();
        setTimeout(showWinModal, 620);
    }

    function showWinModal() {
        const stars = starRating(state.mistakes);
        saveStars(state.level, stars);
        saveUnlockedLevel(Math.min(state.level + 1, levelCount()));
        renderStars(elements.resultStars, stars);
        elements.resultStars.setAttribute('aria-label', `${stars} 星`);
        elements.resultMistakes.textContent = `${state.mistakes} 次`;
        elements.nextBtn.hidden = state.level >= levelCount();
        elements.winModal.hidden = false;
        playStarAnimation();
        updateHeader();
    }

    function handleCellTap(index) {
        if (state.locked) return;
        if (state.givenFlags[index]) {
            elements.feedbackText.textContent = '提示格不能修改哦。';
            elements.feedbackText.classList.add('is-warn');
            return;
        }
        /* 再点一次已选中的空格取消选中 */
        state.selectedIndex = state.selectedIndex === index ? -1 : index;
        updateBoardView();
    }

    function handlePalettePick(value) {
        if (state.locked) return;
        if (state.selectedIndex < 0) {
            elements.feedbackText.textContent = '先点一个空格，再选图案吧！';
            elements.feedbackText.classList.add('is-warn');
            return;
        }
        const index = state.selectedIndex;
        if (state.givenFlags[index]) {
            elements.feedbackText.textContent = '提示格不能修改哦。';
            elements.feedbackText.classList.add('is-warn');
            return;
        }
        if (state.board[index] === value) return;

        /* 软校验：填入前用候选值判定是否与同行/列/宫重复，重复则计一次填错并红闪，不阻止填写 */
        const candidates = candidatesFor(state.board, state.size, state.boxRows, state.boxCols, index);
        state.board[index] = value;
        if (!candidates.includes(value)) {
            state.mistakes += 1;
            elements.feedbackText.textContent = '这个图案重复啦，再想想！';
            elements.feedbackText.classList.add('is-warn');
            const button = state.cellButtons[index];
            button.classList.remove('is-wrong');
            void button.offsetWidth;
            button.classList.add('is-wrong');
            setTimeout(() => button.classList.remove('is-wrong'), 480);
        } else {
            elements.feedbackText.textContent = '';
            elements.feedbackText.classList.remove('is-warn');
        }
        updateHeader();
        updateBoardView();
        if (isBoardComplete()) {
            finishLevel();
        }
    }

    /* 清空重来：仅清掉玩家填入的格子，提示格与星级、填错计数一并重置 */
    function handleClear() {
        if (state.locked) return;
        for (let index = 0; index < state.board.length; index += 1) {
            if (!state.givenFlags[index]) state.board[index] = 0;
        }
        state.mistakes = 0;
        state.selectedIndex = -1;
        elements.feedbackText.textContent = '';
        elements.feedbackText.classList.remove('is-warn');
        updateHeader();
        updateBoardView();
    }

    function startLevel(level) {
        const config = levelConfig(level);
        const puzzle = generatePuzzle(level, levelSeed(level));
        state.level = Math.min(Math.max(1, level), levelCount());
        state.size = config.size;
        state.boxRows = config.boxRows;
        state.boxCols = config.boxCols;
        state.solution = puzzle.solution;
        state.board = new Array(config.size * config.size).fill(0);
        state.givenFlags = new Array(config.size * config.size).fill(false);
        for (const given of puzzle.givens) {
            state.board[given.index] = given.value;
            state.givenFlags[given.index] = true;
        }
        state.selectedIndex = -1;
        state.mistakes = 0;
        state.locked = false;
        elements.winModal.hidden = true;
        elements.levelModal.hidden = true;
        elements.grid.classList.remove('is-solved');
        elements.feedbackText.textContent = '';
        elements.feedbackText.classList.remove('is-warn');
        renderBoard();
        renderPalette();
        updateHeader();
    }

    function renderLevelPicker() {
        const unlocked = loadUnlockedLevel();
        const fragment = documentObject.createDocumentFragment();
        for (let level = 1; level <= levelCount(); level += 1) {
            const button = documentObject.createElement('button');
            button.type = 'button';
            button.className = 'level-item';
            const name = documentObject.createElement('strong');
            name.textContent = String(level);
            const stars = documentObject.createElement('span');
            if (level > unlocked) {
                button.disabled = true;
                button.classList.add('is-locked');
                stars.textContent = '未解锁';
            } else {
                const earned = loadStars(level);
                stars.textContent = earned > 0 ? '★'.repeat(earned) + '☆'.repeat(3 - earned) : '☆☆☆';
            }
            if (level === state.level) {
                button.classList.add('is-current');
            }
            button.addEventListener('click', () => {
                elements.levelModal.hidden = true;
                startLevel(level);
            });
            button.appendChild(name);
            button.appendChild(stars);
            fragment.appendChild(button);
        }
        elements.levelGrid.replaceChildren(fragment);
    }

    elements.clearBtn.addEventListener('click', handleClear);
    elements.restartBtn.addEventListener('click', () => startLevel(state.level));
    elements.replayBtn.addEventListener('click', () => startLevel(state.level));
    elements.nextBtn.addEventListener('click', () => startLevel(state.level + 1));
    elements.levelsBtn.addEventListener('click', () => {
        renderLevelPicker();
        elements.levelModal.hidden = false;
    });
    elements.closeLevelsBtn.addEventListener('click', () => {
        elements.levelModal.hidden = true;
    });

    windowObject.SudokuApi = {
        SLUG,
        LEVEL_COUNT,
        LEVEL_BLANKS,
        EMOJIS,
        createSeededRandom,
        shuffleValues,
        levelCount,
        levelConfig,
        levelSeed,
        boxIndexOf,
        candidatesFor,
        generateFullSolution,
        generatePuzzle,
        countSolutions,
        conflictCells,
        validateGrid,
        starRating,
        loadUnlockedLevel,
        saveUnlockedLevel,
        loadStars,
        saveStars
    };

    startLevel(loadUnlockedLevel());
})(window, document);
