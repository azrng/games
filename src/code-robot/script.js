(function setupCodeRobot(windowObject, documentObject) {
    'use strict';

    const SLUG = 'code-robot';
    const UNLOCK_KEY = 'code-robot-unlocked-level';
    const STARS_KEY_PREFIX = 'code-robot-stars-';
    const STEP_MS = 400;
    const CRASH_MS = 700;
    /* 程序长度上限 = par + 4，给孩子们留一点试错空间 */
    const EXTRA_PROGRAM_SLOTS = 4;

    /* 朝向按顺时针排列：U 上 / R 右 / D 下 / L 左，左右转取相邻项即可 */
    const FACING_ORDER = ['U', 'R', 'D', 'L'];
    const FACING_DELTA = {
        U: { row: -1, col: 0 },
        R: { row: 0, col: 1 },
        D: { row: 1, col: 0 },
        L: { row: 0, col: -1 }
    };
    const COMMAND_LABEL = { F: '⬆️', L: '↰', R: '↱' };
    const COMMAND_NAME = { F: '前进', L: '左转', R: '右转' };
    /* 顶部小箭头的旋转角度，用来直观展示机器人朝向 */
    const ARROW_ANGLE = { U: 0, R: 90, D: 180, L: 270 };

    const memoryFallback = {};

    /* 12 个手工关卡（已全部用参考解法验证）：
       grid 字符画：# 墙 / . 空地 / S 起点 / G 终点 / * 宝石；
       referenceProgram 是与 par 步数完全一致的 BFS 最优参考解法（三星门槛=最优步数），
       供 smoke 测试与「演示」按钮使用。
       难度递进：1-3 直线与转弯（无墙无宝石）、4-6 加墙绕行、7-9 加宝石收集、10-12 大棋盘复杂路径 */
    const LEVELS = [
        {
            facing: 'R',
            par: 4,
            grid: [
                '.....',
                '.....',
                'S...G',
                '.....',
                '.....'
            ],
            referenceProgram: ['F', 'F', 'F', 'F']
        },
        {
            facing: 'U',
            par: 9,
            grid: [
                '....G',
                '.....',
                '.....',
                '.....',
                'S....'
            ],
            referenceProgram: ['F', 'F', 'F', 'F', 'R', 'F', 'F', 'F', 'F']
        },
        {
            facing: 'R',
            par: 5,
            grid: [
                'S....',
                '.....',
                '.....',
                '.....',
                'G....'
            ],
            referenceProgram: ['R', 'F', 'F', 'F', 'F']
        },
        {
            facing: 'D',
            par: 6,
            grid: [
                '.....',
                'S.#..',
                '....G',
                '..#..',
                '..#..'
            ],
            referenceProgram: ['F', 'L', 'F', 'F', 'F', 'F']
        },
        {
            facing: 'D',
            par: 11,
            grid: [
                '......',
                '..##..',
                'S.##.G',
                '..##..',
                '......',
                '......'
            ],
            referenceProgram: ['F', 'F', 'L', 'F', 'F', 'F', 'F', 'F', 'L', 'F', 'F']
        },
        {
            facing: 'R',
            par: 13,
            grid: [
                'S..#..',
                '...#..',
                '...#..',
                '...#.G',
                '......',
                '......'
            ],
            referenceProgram: ['F', 'F', 'R', 'F', 'F', 'F', 'F', 'L', 'F', 'F', 'F', 'L', 'F']
        },
        {
            facing: 'D',
            par: 12,
            grid: [
                'S.....',
                '..#...',
                '....G.',
                '....*.',
                '*.....',
                '.##...'
            ],
            referenceProgram: ['F', 'F', 'F', 'F', 'L', 'F', 'F', 'F', 'F', 'L', 'F', 'F']
        },
        {
            facing: 'R',
            par: 12,
            grid: [
                'S...*.',
                '.##...',
                '.#....',
                '....*.',
                '..#...',
                '.....G'
            ],
            referenceProgram: ['F', 'F', 'F', 'F', 'R', 'F', 'F', 'F', 'F', 'F', 'L', 'F']
        },
        {
            facing: 'D',
            par: 14,
            grid: [
                'S......',
                '..###..',
                '.......',
                '......*',
                '...#...',
                '.#...#.',
                '......G'
            ],
            referenceProgram: ['F', 'F', 'F', 'L', 'F', 'F', 'F', 'F', 'F', 'F', 'R', 'F', 'F', 'F']
        },
        {
            facing: 'U',
            par: 15,
            grid: [
                '.......',
                '..###..',
                '#..###.',
                '*..*...',
                '.###..#',
                '.#....#',
                'S..#*.G'
            ],
            referenceProgram: ['F', 'F', 'F', 'R', 'F', 'F', 'F', 'F', 'R', 'F', 'F', 'F', 'L', 'F', 'F']
        },
        {
            facing: 'D',
            par: 20,
            grid: [
                'S#####G',
                '.#####.',
                '.#...#.',
                '.#...#*',
                '.#...#.',
                '.#####.',
                '*..*...'
            ],
            referenceProgram: [
                'F', 'F', 'F', 'F', 'F', 'F',
                'L',
                'F', 'F', 'F', 'F', 'F', 'F',
                'L',
                'F', 'F', 'F', 'F', 'F', 'F'
            ]
        },
        {
            facing: 'U',
            par: 19,
            grid: [
                '...*..G',
                '....#..',
                '...#...',
                '..#..#.',
                '..*..*.',
                '#.#....',
                '......S'
            ],
            referenceProgram: [
                'F', 'F', 'L',
                'F', 'F', 'F', 'F', 'F',
                'R',
                'F', 'F', 'F', 'F',
                'R',
                'F', 'F', 'F', 'F', 'F'
            ]
        }
    ];

    const state = {
        level: 1,
        parsed: null,
        program: [],
        running: false,
        runToken: 0,
        stepTimer: 0,
        crashTimer: 0,
        highlightIndex: -1,
        chipButtons: [],
        cellDivs: [],
        cellFaces: [],
        sprite: null,
        heading: null,
        robotEmoji: null
    };

    const elements = {
        levelText: documentObject.getElementById('level-text'),
        programCount: documentObject.getElementById('program-count'),
        parText: documentObject.getElementById('par-text'),
        bestText: documentObject.getElementById('best-text'),
        grid: documentObject.getElementById('grid'),
        statusText: documentObject.getElementById('status-text'),
        programStrip: documentObject.getElementById('program-strip'),
        programHint: documentObject.getElementById('program-hint'),
        forwardBtn: documentObject.getElementById('btn-forward'),
        leftBtn: documentObject.getElementById('btn-left'),
        rightBtn: documentObject.getElementById('btn-right'),
        runBtn: documentObject.getElementById('run-btn'),
        stopBtn: documentObject.getElementById('stop-btn'),
        clearBtn: documentObject.getElementById('clear-btn'),
        demoBtn: documentObject.getElementById('demo-btn'),
        restartBtn: documentObject.getElementById('restart-btn'),
        levelsBtn: documentObject.getElementById('levels-btn'),
        winModal: documentObject.getElementById('win-modal'),
        resultStars: documentObject.getElementById('result-stars'),
        resultSteps: documentObject.getElementById('result-steps'),
        resultPar: documentObject.getElementById('result-par'),
        resultGems: documentObject.getElementById('result-gems'),
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

    function levelCount() {
        return LEVELS.length;
    }

    /* 取关卡原始定义（含字符画网格与参考解法），越界直接抛错，避免静默错误 */
    function getLevel(level) {
        const definition = LEVELS[level - 1];
        if (!definition) {
            throw new Error(`关卡不存在：${level}`);
        }
        return definition;
    }

    function cellIndex(size, row, col) {
        return row * size + col;
    }

    /* 解析内置关卡数据为纯数据结构，供模拟器与渲染共同使用 */
    function parseLevel(level) {
        const definition = getLevel(level);
        const size = definition.grid.length;
        let start = null;
        let goal = null;
        const walls = [];
        const gems = [];

        definition.grid.forEach((rowText, row) => {
            if (rowText.length !== size) {
                throw new Error(`关卡 ${level} 第 ${row + 1} 行长度与棋盘尺寸不一致`);
            }
            Array.from(rowText).forEach((ch, col) => {
                if (ch === '#') {
                    walls.push(cellIndex(size, row, col));
                } else if (ch === 'S') {
                    start = { row, col };
                } else if (ch === 'G') {
                    goal = { row, col };
                } else if (ch === '*') {
                    gems.push(cellIndex(size, row, col));
                }
            });
        });

        if (!start || !goal) {
            throw new Error(`关卡 ${level} 缺少起点或终点`);
        }
        return {
            level,
            size,
            facing: definition.facing,
            par: definition.par,
            start,
            goal,
            walls,
            gems
        };
    }

    function maxProgramLength(level) {
        return getLevel(level).par + EXTRA_PROGRAM_SLOTS;
    }

    function turnLeft(facing) {
        return FACING_ORDER[(FACING_ORDER.indexOf(facing) + 3) % 4];
    }

    function turnRight(facing) {
        return FACING_ORDER[(FACING_ORDER.indexOf(facing) + 1) % 4];
    }

    /* 建立一次运行的初始状态：位置在起点、朝向为关卡默认、宝石未收集 */
    function createRunState(parsed) {
        return {
            row: parsed.start.row,
            col: parsed.start.col,
            facing: parsed.facing,
            collected: [],
            steps: 0
        };
    }

    /* 纯函数单步执行：不碰 DOM，返回新状态与结果标记（crashed / win / gemIndex） */
    function stepRobot(parsed, runState, command) {
        const cmd = String(command).toUpperCase();
        if (cmd === 'L' || cmd === 'R') {
            const facing = cmd === 'L' ? turnLeft(runState.facing) : turnRight(runState.facing);
            return {
                crashed: false,
                win: false,
                gemIndex: null,
                state: Object.assign({}, runState, { facing, steps: runState.steps + 1 })
            };
        }
        if (cmd !== 'F') {
            throw new Error(`未知指令：${command}`);
        }

        const delta = FACING_DELTA[runState.facing];
        const row = runState.row + delta.row;
        const col = runState.col + delta.col;
        const size = parsed.size;
        if (row < 0 || col < 0 || row >= size || col >= size) {
            return { crashed: true, reason: 'bounds', win: false, gemIndex: null, state: runState };
        }
        if (parsed.walls.includes(cellIndex(size, row, col))) {
            return { crashed: true, reason: 'wall', win: false, gemIndex: null, state: runState };
        }

        const index = cellIndex(size, row, col);
        /* 只有宝石格才记录收集；重复经过已收集的宝石不重复计数 */
        const collected = parsed.gems.includes(index) && !runState.collected.includes(index)
            ? runState.collected.concat(index)
            : runState.collected;
        const gemIndex = collected.length === runState.collected.length ? null : index;
        const win = row === parsed.goal.row && col === parsed.goal.col && collected.length === parsed.gems.length;
        return {
            crashed: false,
            win,
            gemIndex,
            state: Object.assign({}, runState, { row, col, collected, steps: runState.steps + 1 })
        };
    }

    /* 纯函数整段模拟：程序超长按 maxProgramLength 截断；crashAt 为撞墙/出界指令的序号（1 起），0 表示未撞击 */
    function simulateProgram(level, program) {
        const parsed = typeof level === 'number' ? parseLevel(level) : level;
        const limit = maxProgramLength(parsed.level);
        const commands = (program || []).map((item) => String(item).toUpperCase()).slice(0, limit);
        let runState = createRunState(parsed);

        for (let i = 0; i < commands.length; i += 1) {
            const outcome = stepRobot(parsed, runState, commands[i]);
            if (outcome.crashed) {
                return {
                    ok: false,
                    steps: runState.steps,
                    gemsCollected: runState.collected.length,
                    crashAt: runState.steps + 1,
                    crashReason: outcome.reason
                };
            }
            runState = outcome.state;
            if (outcome.win) {
                return {
                    ok: true,
                    steps: runState.steps,
                    gemsCollected: runState.collected.length,
                    crashAt: 0
                };
            }
        }
        return {
            ok: false,
            steps: runState.steps,
            gemsCollected: runState.collected.length,
            crashAt: 0
        };
    }

    /* 星级：不超过 par 三星，不超过 par+2 两星，其余过关一星 */
    function starRating(steps, par) {
        if (steps <= par) return 3;
        if (steps <= par + 2) return 2;
        return 1;
    }

    function loadUnlockedLevel() {
        return Math.min(getStorageNumber(UNLOCK_KEY, 1), levelCount());
    }

    function saveUnlockedLevel(level) {
        const capped = Math.min(Math.max(1, level), levelCount());
        if (capped > loadUnlockedLevel()) {
            safeSetItem(UNLOCK_KEY, String(capped));
        }
    }

    function loadStars(level) {
        const parsed = Number.parseInt(safeGetItem(STARS_KEY_PREFIX + level) || '', 10);
        return Number.isFinite(parsed) && parsed >= 0 && parsed <= 3 ? parsed : 0;
    }

    /* 星级只保留历史最好成绩 */
    function saveStars(level, stars) {
        const capped = Math.min(Math.max(0, stars), 3);
        if (capped > loadStars(level)) {
            safeSetItem(STARS_KEY_PREFIX + level, String(capped));
        }
    }

    function setStatus(message) {
        elements.statusText.textContent = message;
    }

    function updateHud() {
        const stars = loadStars(state.level);
        elements.levelText.textContent = `第 ${state.level} 关`;
        elements.parText.textContent = String(state.parsed.par);
        elements.programCount.textContent = `${state.program.length}/${maxProgramLength(state.level)}`;
        elements.bestText.textContent = stars > 0 ? '★'.repeat(stars) : '--';
    }

    /* 渲染棋盘：格子 + 机器人图层，格子内容只由关卡数据决定 */
    function renderBoard() {
        const parsed = state.parsed;
        const size = parsed.size;
        const wallSet = new Set(parsed.walls);
        const gemSet = new Set(parsed.gems);
        const fragment = documentObject.createDocumentFragment();
        const cellDivs = [];
        const cellFaces = [];

        elements.grid.classList.remove('is-crash');
        elements.grid.style.gridTemplateColumns = `repeat(${size}, minmax(0, 1fr))`;
        elements.grid.style.gridTemplateRows = `repeat(${size}, minmax(0, 1fr))`;
        elements.grid.setAttribute('aria-label', `第 ${state.level} 关，${size} 乘 ${size} 机器人棋盘`);

        for (let index = 0; index < size * size; index += 1) {
            const cell = documentObject.createElement('div');
            const face = documentObject.createElement('span');
            face.className = 'cell-face';
            if (wallSet.has(index)) {
                cell.className = 'robot-cell is-wall';
                face.textContent = '🧱';
            } else if (index === cellIndex(size, parsed.goal.row, parsed.goal.col)) {
                cell.className = 'robot-cell is-goal';
                face.textContent = '🏁';
            } else if (gemSet.has(index)) {
                cell.className = 'robot-cell is-gem';
                face.textContent = '💎';
            } else {
                cell.className = 'robot-cell';
            }
            cell.appendChild(face);
            cellDivs.push(cell);
            cellFaces.push(face);
            fragment.appendChild(cell);
        }

        /* 机器人图层覆盖在网格上，用百分比位移对齐格子 */
        const layer = documentObject.createElement('div');
        layer.className = 'robot-layer';
        const sprite = documentObject.createElement('div');
        sprite.className = 'robot-sprite';
        const emoji = documentObject.createElement('div');
        emoji.className = 'robot-emoji';
        emoji.textContent = '🤖';
        const heading = documentObject.createElement('div');
        heading.className = 'robot-heading';
        sprite.appendChild(emoji);
        sprite.appendChild(heading);
        sprite.style.width = `calc(100% / ${size})`;
        layer.appendChild(sprite);
        fragment.appendChild(layer);

        elements.grid.replaceChildren(fragment);
        state.cellDivs = cellDivs;
        state.cellFaces = cellFaces;
        state.sprite = sprite;
        state.heading = heading;
        state.robotEmoji = emoji;
        placeSprite(parsed.start.row, parsed.start.col, parsed.facing, true);
    }

    /* 移动/旋转机器人：transition 负责补间，instant 用于重置位置瞬间归位 */
    function placeSprite(row, col, facing, instant) {
        if (!state.sprite) return;
        if (instant) {
            state.sprite.classList.add('is-instant');
        }
        state.sprite.style.transform = `translate(${col * 100}%, ${row * 100}%)`;
        state.heading.style.transform = `rotate(${ARROW_ANGLE[facing]}deg)`;
        if (instant) {
            setTimeout(() => {
                state.sprite.classList.remove('is-instant');
            }, 30);
        }
    }

    function renderProgramStrip() {
        const fragment = documentObject.createDocumentFragment();
        const chips = [];

        state.program.forEach((cmd, index) => {
            const chip = documentObject.createElement('button');
            chip.type = 'button';
            chip.className = 'cmd-chip';
            chip.textContent = COMMAND_LABEL[cmd];
            chip.disabled = state.running;
            chip.setAttribute('aria-label', `第 ${index + 1} 条：${COMMAND_NAME[cmd]}，点击删除`);
            chip.addEventListener('click', () => removeCommand(index));
            chips.push(chip);
            fragment.appendChild(chip);
        });

        elements.programStrip.replaceChildren(fragment);
        elements.programHint.hidden = state.program.length > 0;
        state.chipButtons = chips;
        state.highlightIndex = -1;
    }

    function highlightChip(index) {
        if (state.highlightIndex >= 0 && state.chipButtons[state.highlightIndex]) {
            state.chipButtons[state.highlightIndex].classList.remove('is-active');
        }
        state.highlightIndex = index;
        if (index >= 0 && state.chipButtons[index]) {
            state.chipButtons[index].classList.add('is-active');
        }
    }

    function appendCommand(cmd) {
        if (state.running) return;
        const limit = maxProgramLength(state.level);
        if (state.program.length >= limit) {
            setStatus(`程序最长 ${limit} 条指令，先点小卡删掉一条吧。`);
            return;
        }
        state.program.push(cmd);
        renderProgramStrip();
        updateControls();
        updateHud();
        setStatus(`已添加「${COMMAND_NAME[cmd]}」，继续编排或点「运行」。`);
    }

    function removeCommand(index) {
        if (state.running) return;
        state.program.splice(index, 1);
        renderProgramStrip();
        updateControls();
        updateHud();
    }

    function clearProgram() {
        if (state.running) return;
        state.program = [];
        renderProgramStrip();
        updateControls();
        updateHud();
        setStatus('程序已清空，重新编排一条路线吧。');
    }

    function updateControls() {
        const running = state.running;
        elements.runBtn.disabled = running || state.program.length === 0;
        elements.stopBtn.hidden = !running;
        elements.forwardBtn.disabled = running;
        elements.leftBtn.disabled = running;
        elements.rightBtn.disabled = running;
        elements.clearBtn.disabled = running;
        elements.demoBtn.disabled = running;
        elements.restartBtn.disabled = running;
        elements.levelsBtn.disabled = running;
    }

    function crashAnimation() {
        if (state.crashTimer) {
            clearTimeout(state.crashTimer);
        }
        state.robotEmoji.textContent = '💥';
        elements.grid.classList.add('is-crash');
        state.crashTimer = setTimeout(() => {
            state.robotEmoji.textContent = '🤖';
            elements.grid.classList.remove('is-crash');
            state.crashTimer = 0;
        }, CRASH_MS);
    }

    function finishRun(message) {
        state.running = false;
        state.runToken += 1;
        if (state.stepTimer) {
            clearTimeout(state.stepTimer);
            state.stepTimer = 0;
        }
        elements.grid.classList.remove('is-running');
        highlightChip(-1);
        /* 运行结束后指令小卡恢复可点选，方便修改程序 */
        renderProgramStrip();
        updateControls();
        setStatus(message);
    }

    function winLevel(steps) {
        const stars = starRating(steps, state.parsed.par);
        saveStars(state.level, stars);
        saveUnlockedLevel(state.level + 1);
        renderStars(elements.resultStars, stars);
        elements.resultStars.setAttribute('aria-label', `${stars} 星`);
        elements.resultSteps.textContent = String(steps);
        elements.resultPar.textContent = String(state.parsed.par);
        elements.resultGems.textContent = String(state.parsed.gems.length);
        elements.nextBtn.textContent = state.level < levelCount() ? '下一关' : '选择关卡';
        elements.winModal.hidden = false;
        updateHud();
        setStatus('过关啦！宝石全部收集，机器人顺利到站。');
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

    /* 逐条执行程序：每步约 400ms，撞墙/出界冒烟中断，集齐宝石到达终点即过关 */
    function runProgram() {
        if (state.running || state.program.length === 0) return;
        const parsed = state.parsed;
        let run = createRunState(parsed);
        state.running = true;
        const token = state.runToken + 1;
        state.runToken = token;

        updateControls();
        placeSprite(run.row, run.col, run.facing, true);
        elements.grid.classList.add('is-running');
        setStatus('机器人开始执行程序……');

        const stepLoop = () => {
            if (token !== state.runToken) return;
            if (index >= state.program.length) {
                const onGoal = run.row === parsed.goal.row && run.col === parsed.goal.col;
                finishRun(onGoal
                    ? '宝石还没集齐！先去捡完所有宝石，再回到终点。'
                    : '程序执行完了，机器人还没到终点，补几条指令再试试。');
                return;
            }
            highlightChip(index);
            const outcome = stepRobot(parsed, run, state.program[index]);
            if (outcome.crashed) {
                crashAnimation();
                const where = outcome.reason === 'bounds' ? '冲出了棋盘' : '撞到了墙';
                finishRun(`💥 机器人${where}！第 ${run.steps + 1} 条指令出了问题，改一改再来。`);
                return;
            }
            run = outcome.state;
            placeSprite(run.row, run.col, run.facing, false);
            if (outcome.gemIndex !== null) {
                takeGem(outcome.gemIndex);
            }
            if (outcome.win) {
                setTimeout(() => {
                    if (token === state.runToken) {
                        state.running = false;
                        state.runToken += 1;
                        elements.grid.classList.remove('is-running');
                        highlightChip(-1);
                        renderProgramStrip();
                        updateControls();
                        winLevel(run.steps);
                    }
                }, STEP_MS);
                return;
            }
            index += 1;
            state.stepTimer = setTimeout(stepLoop, STEP_MS);
        };

        let index = 0;
        state.stepTimer = setTimeout(stepLoop, STEP_MS * 0.6);
    }

    function takeGem(index) {
        const face = state.cellFaces[index];
        const cell = state.cellDivs[index];
        if (face) {
            face.textContent = '';
        }
        if (cell) {
            cell.classList.add('is-taken');
        }
        setStatus('捡到一颗宝石，继续前进！');
    }

    function stopProgram() {
        if (!state.running) return;
        finishRun('已停止。程序还可以修改，想好了再点「运行」。');
    }

    function startLevel(level) {
        const target = Math.min(Math.max(1, level), levelCount());
        state.runToken += 1;
        if (state.stepTimer) {
            clearTimeout(state.stepTimer);
            state.stepTimer = 0;
        }
        state.running = false;
        state.level = target;
        state.parsed = parseLevel(target);
        state.program = [];

        elements.winModal.hidden = true;
        renderBoard();
        renderProgramStrip();
        updateHud();
        updateControls();
        setStatus('点击下方指令块编排程序，然后点「运行」看机器人执行。');
    }

    function renderLevelGrid() {
        const unlocked = loadUnlockedLevel();
        const fragment = documentObject.createDocumentFragment();

        for (let level = 1; level <= levelCount(); level += 1) {
            const button = documentObject.createElement('button');
            button.type = 'button';
            button.className = 'level-item';
            if (level > unlocked) {
                button.disabled = true;
                button.textContent = '🔒';
                button.setAttribute('aria-label', `第 ${level} 关，暂未解锁`);
            } else {
                const stars = loadStars(level);
                button.textContent = String(level);
                button.title = stars > 0 ? `最佳 ${stars} 星` : '尚未获得星级';
                if (level === state.level) {
                    button.classList.add('is-current');
                }
                button.setAttribute('aria-label', `第 ${level} 关${stars > 0 ? `，最佳 ${stars} 星` : ''}`);
                button.addEventListener('click', () => {
                    elements.levelModal.hidden = true;
                    startLevel(level);
                });
            }
            fragment.appendChild(button);
        }
        elements.levelGrid.replaceChildren(fragment);
    }

    /* 演示：载入本关参考解法并自动运行，给孩子打样 */
    function playDemo() {
        if (state.running) return;
        state.program = getLevel(state.level).referenceProgram.slice();
        renderProgramStrip();
        updateControls();
        updateHud();
        runProgram();
    }

    elements.forwardBtn.addEventListener('click', () => appendCommand('F'));
    elements.leftBtn.addEventListener('click', () => appendCommand('L'));
    elements.rightBtn.addEventListener('click', () => appendCommand('R'));
    elements.runBtn.addEventListener('click', runProgram);
    elements.stopBtn.addEventListener('click', stopProgram);
    elements.clearBtn.addEventListener('click', clearProgram);
    elements.demoBtn.addEventListener('click', playDemo);
    elements.restartBtn.addEventListener('click', () => startLevel(state.level));
    elements.replayBtn.addEventListener('click', () => startLevel(state.level));
    elements.nextBtn.addEventListener('click', () => {
        if (state.level < levelCount()) {
            startLevel(state.level + 1);
        } else {
            elements.winModal.hidden = true;
            renderLevelGrid();
            elements.levelModal.hidden = false;
        }
    });
    elements.levelsBtn.addEventListener('click', () => {
        renderLevelGrid();
        elements.levelModal.hidden = false;
    });
    elements.closeLevelsBtn.addEventListener('click', () => {
        elements.levelModal.hidden = true;
    });

    windowObject.RobotApi = {
        SLUG,
        STEP_MS,
        EXTRA_PROGRAM_SLOTS,
        COMMAND_LABEL,
        COMMAND_NAME,
        levelCount,
        getLevel,
        parseLevel,
        cellIndex,
        turnLeft,
        turnRight,
        createRunState,
        stepRobot,
        simulateProgram,
        starRating,
        maxProgramLength,
        loadUnlockedLevel,
        saveUnlockedLevel,
        loadStars,
        saveStars
    };

    /* 从已解锁的最新一关继续，新玩家默认第 1 关 */
    startLevel(loadUnlockedLevel());
})(window, document);
