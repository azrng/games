// @ts-check
(function setupSokoban(windowObject, documentObject) {
    'use strict';

    const SLUG = 'sokoban';
    const UNLOCK_KEY = 'sokoban-unlocked-level';
    const CURRENT_KEY = 'sokoban-current-level';
    const BEST_KEY_PREFIX = 'sokoban-best-';
    const TIER_GROUPS = [
        { name: '入门', from: 1, to: 20 },
        { name: '进阶', from: 21, to: 40 },
        { name: '挑战', from: 41, to: 60 }
    ];
    const DIRS = {
        up: { dx: 0, dy: -1 },
        down: { dx: 0, dy: 1 },
        left: { dx: -1, dy: 0 },
        right: { dx: 1, dy: 0 }
    };
    const memoryFallback = {};

    /* ---------- 关卡解析：标准 Sokoban 文本 → 结构化关卡 ---------- */

    function keyOf(x, y) {
        return y * 100 + x;
    }

    /** 解析失败抛错（非法关卡不允许进入游戏，smoke 保证入库关卡全部合法） */
    function parseLevel(text) {
        const lines = text.replace(/\r/g, '').split('\n');
        const height = lines.length;
        let width = 0;
        lines.forEach((line) => {
            width = Math.max(width, line.length);
        });
        const walls = new Set();
        const goals = new Set();
        const boxes = new Set();
        let player = null;
        lines.forEach((line, y) => {
            for (let x = 0; x < line.length; x += 1) {
                const key = keyOf(x, y);
                const ch = line[x];
                if (ch === '#') {
                    walls.add(key);
                } else if (ch === '@') {
                    player = { x, y };
                } else if (ch === '+') {
                    player = { x, y };
                    goals.add(key);
                } else if (ch === '$') {
                    boxes.add(key);
                } else if (ch === '*') {
                    boxes.add(key);
                    goals.add(key);
                } else if (ch === '.') {
                    goals.add(key);
                }
            }
        });
        if (!player) throw new Error('关卡缺少玩家起点');
        if (boxes.size === 0) throw new Error('关卡缺少箱子');
        if (boxes.size !== goals.size) throw new Error('箱子数与目标点数不一致');
        return { width, height, walls, goals, boxes, player };
    }

    /* ---------- 走法：不可变风格的状态转移，便于撤销与测试 ---------- */

    function createState(level) {
        return {
            level,
            player: { x: level.player.x, y: level.player.y },
            boxes: new Set(level.boxes),
            moves: 0,
            pushes: 0,
            history: []
        };
    }

    /**
     * 应用一步移动。返回 { moved, pushed, game }：撞墙、推两连箱、推箱入墙均 moved: false 且原样返回。
     * 历史栈只存差量（玩家旧位与被推箱起止键），undo 精确还原。
     */
    function applyMove(game, dirName) {
        const dir = DIRS[dirName];
        if (!dir) return { moved: false, pushed: false, game };
        const nx = game.player.x + dir.dx;
        const ny = game.player.y + dir.dy;
        const nextKey = keyOf(nx, ny);
        if (game.level.walls.has(nextKey)) return { moved: false, pushed: false, game };
        let boxes = game.boxes;
        let pushed = false;
        let boxFrom = null;
        let boxTo = null;
        if (game.boxes.has(nextKey)) {
            boxTo = keyOf(nx + dir.dx, ny + dir.dy);
            if (game.level.walls.has(boxTo) || game.boxes.has(boxTo)) {
                return { moved: false, pushed: false, game };
            }
            pushed = true;
            boxFrom = nextKey;
            boxes = new Set(game.boxes);
            boxes.delete(nextKey);
            boxes.add(boxTo);
        }
        return {
            moved: true,
            pushed,
            game: {
                level: game.level,
                player: { x: nx, y: ny },
                boxes,
                moves: game.moves + 1,
                pushes: game.pushes + (pushed ? 1 : 0),
                history: game.history.concat([{ player: game.player, boxFrom, boxTo }])
            }
        };
    }

    /** 撤销一步：栈空返回 moved: false */
    function undoMove(game) {
        if (game.history.length === 0) return { moved: false, game };
        const last = game.history[game.history.length - 1];
        const boxes = new Set(game.boxes);
        if (last.boxFrom !== null) {
            boxes.delete(last.boxTo);
            boxes.add(last.boxFrom);
        }
        return {
            moved: true,
            game: {
                level: game.level,
                player: { x: last.player.x, y: last.player.y },
                boxes,
                moves: game.moves - 1,
                pushes: game.pushes - (last.boxFrom !== null ? 1 : 0),
                history: game.history.slice(0, -1)
            }
        };
    }

    function isSolved(game) {
        const boxes = game.boxes;
        for (const goal of game.level.goals) {
            if (!boxes.has(goal)) return false;
        }
        return true;
    }

    /**
     * 静态死角检测：不在目标点上的箱子，若上下有一侧是墙、左右也有一侧是墙
     * （两个正交方向都被堵），就永远推不动了。返回死箱 key 数组，空数组表示局面还活着。
     * 只做墙角判定，不覆盖多箱互相冻结的复杂死锁（易误报且少见）。
     */
    function findDeadBoxes(game) {
        const walls = game.level.walls;
        const goals = game.level.goals;
        const dead = [];
        for (const key of game.boxes) {
            if (goals.has(key)) continue;
            const x = key % 100;
            const y = Math.floor(key / 100);
            const blockedV = walls.has(keyOf(x, y - 1)) || walls.has(keyOf(x, y + 1));
            const blockedH = walls.has(keyOf(x - 1, y)) || walls.has(keyOf(x + 1, y));
            if (blockedV && blockedH) dead.push(key);
        }
        return dead;
    }

    function tierOfLevel(level) {
        const group = TIER_GROUPS.find((item) => level >= item.from && level <= item.to);
        return group ? group.name : '挑战';
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

    /** 关卡总数（levels.js 未加载时返回 0，loadLevel 自带防护） */
    function levelCount() {
        return Array.isArray(windowObject.SOKOBAN_LEVELS) ? windowObject.SOKOBAN_LEVELS.length : 0;
    }

    function readUnlocked() {
        /* 解锁进度按关卡总数封顶：通关末关后存档为 length+1，篡改/异常存档也不应越界 */
        return Math.min(getStorageNumber(UNLOCK_KEY, 1), Math.max(levelCount(), 1));
    }

    function readBestMoves(level) {
        return getStorageNumber(BEST_KEY_PREFIX + level, 0);
    }

    function writeBestMoves(level, moves) {
        const current = readBestMoves(level);
        if (current > 0 && current <= moves) return false;
        safeSetItem(BEST_KEY_PREFIX + level, String(moves));
        return true;
    }

    /* ---------- 页面状态 ---------- */

    const state = {
        level: 1,
        game: null,
        cellButtons: [],
        touchStart: null,
        swipeHandled: false
    };

    const elements = {
        levelText: documentObject.getElementById('level-text'),
        movesText: documentObject.getElementById('moves-text'),
        pushesText: documentObject.getElementById('pushes-text'),
        bestText: documentObject.getElementById('best-text'),
        board: documentObject.getElementById('board'),
        deadlockHint: documentObject.getElementById('deadlock-hint'),
        undoBtn: documentObject.getElementById('undo-btn'),
        restartBtn: documentObject.getElementById('restart-btn'),
        levelsBtn: documentObject.getElementById('levels-btn'),
        winModal: documentObject.getElementById('win-modal'),
        winTitle: documentObject.getElementById('win-title'),
        resultMoves: documentObject.getElementById('result-moves'),
        resultPushes: documentObject.getElementById('result-pushes'),
        resultBest: documentObject.getElementById('result-best'),
        replayBtn: documentObject.getElementById('replay-btn'),
        nextBtn: documentObject.getElementById('next-btn'),
        levelModal: documentObject.getElementById('level-modal'),
        levelGroups: documentObject.getElementById('level-groups'),
        closeLevelsBtn: documentObject.getElementById('close-levels-btn')
    };

    function renderBoard() {
        const level = state.game.level;
        elements.board.style.setProperty('--sk-cols', String(level.width));
        elements.board.style.setProperty('--sk-rows', String(level.height));
        elements.board.replaceChildren();
        state.cellButtons = [];
        for (let y = 0; y < level.height; y += 1) {
            for (let x = 0; x < level.width; x += 1) {
                const cell = documentObject.createElement('div');
                cell.className = 'soko-cell';
                elements.board.appendChild(cell);
                state.cellButtons.push(cell);
            }
        }
        refreshCells();
    }

    function refreshCells() {
        const level = state.game.level;
        const boxOnGoal = [];
        /* 死角检测随每次棋盘刷新（移动/撤销/重开）统一驱动，死箱标红、提示条自动显隐 */
        const deadBoxes = new Set(findDeadBoxes(state.game));
        state.cellButtons.forEach((cell, index) => {
            const x = index % level.width;
            const y = Math.floor(index / level.width);
            const key = keyOf(x, y);
            const classes = ['soko-cell'];
            if (level.walls.has(key)) classes.push('is-wall');
            if (level.goals.has(key)) classes.push('is-goal');
            if (state.game.boxes.has(key)) {
                classes.push('is-box');
                if (level.goals.has(key)) boxOnGoal.push(true);
                if (deadBoxes.has(key)) classes.push('is-dead');
            }
            if (state.game.player.x === x && state.game.player.y === y) classes.push('is-player');
            cell.className = classes.join(' ');
        });
        elements.deadlockHint.hidden = deadBoxes.size === 0 || isSolved(state.game);
    }

    function refreshScore() {
        elements.movesText.textContent = String(state.game.moves);
        elements.pushesText.textContent = String(state.game.pushes);
    }

    function move(dirName) {
        const result = applyMove(state.game, dirName);
        if (!result.moved) return;
        state.game = result.game;
        refreshCells();
        refreshScore();
        if (isSolved(state.game)) finishLevel();
    }

    function undo() {
        const result = undoMove(state.game);
        if (!result.moved) return;
        state.game = result.game;
        refreshCells();
        refreshScore();
    }

    function finishLevel() {
        const isRecord = writeBestMoves(state.level, state.game.moves);
        const unlocked = readUnlocked();
        if (state.level >= unlocked) {
            safeSetItem(UNLOCK_KEY, String(state.level + 1));
        }
        elements.winTitle.textContent = isRecord ? '新纪录！全部归位！' : '全部归位！';
        elements.resultMoves.textContent = String(state.game.moves);
        elements.resultPushes.textContent = String(state.game.pushes);
        const best = readBestMoves(state.level);
        elements.resultBest.textContent = best > 0 ? String(best) : '--';
        /* 末关通关后没有下一关：隐藏"下一关"按钮，避免点击越界早退、弹窗卡住 */
        elements.nextBtn.hidden = levelCount() > 0 && state.level >= levelCount();
        elements.winModal.hidden = false;
    }

    function loadLevel(level) {
        if (!windowObject.SOKOBAN_LEVELS || level > windowObject.SOKOBAN_LEVELS.length) return;
        state.level = level;
        state.game = createState(parseLevel(windowObject.SOKOBAN_LEVELS[level - 1]));
        safeSetItem(CURRENT_KEY, String(level));
        elements.levelText.textContent = tierOfLevel(level) + ' · 第 ' + level + ' 关';
        const best = readBestMoves(level);
        elements.bestText.textContent = best > 0 ? String(best) : '--';
        elements.winModal.hidden = true;
        renderBoard();
        refreshScore();
    }

    function openLevelModal() {
        elements.levelGroups.replaceChildren();
        const unlocked = readUnlocked();
        TIER_GROUPS.forEach((group) => {
            const title = documentObject.createElement('p');
            title.className = 'level-group-title';
            title.textContent = group.name + '（' + group.from + '-' + group.to + '）';
            elements.levelGroups.appendChild(title);
            const grid = documentObject.createElement('div');
            grid.className = 'level-grid';
            for (let level = group.from; level <= group.to; level += 1) {
                const button = documentObject.createElement('button');
                button.type = 'button';
                button.textContent = String(level);
                button.className = 'level-item' + (level === state.level ? ' is-current' : '');
                button.disabled = level > Math.max(unlocked, state.level);
                button.addEventListener('click', () => {
                    elements.levelModal.hidden = true;
                    loadLevel(level);
                });
                grid.appendChild(button);
            }
            elements.levelGroups.appendChild(grid);
        });
        elements.levelModal.hidden = false;
    }

    function bindEvents() {
        elements.undoBtn.addEventListener('click', undo);
        elements.restartBtn.addEventListener('click', () => loadLevel(state.level));
        elements.levelsBtn.addEventListener('click', openLevelModal);
        elements.replayBtn.addEventListener('click', () => loadLevel(state.level));
        elements.nextBtn.addEventListener('click', () => loadLevel(state.level + 1));
        elements.closeLevelsBtn.addEventListener('click', () => {
            elements.levelModal.hidden = true;
        });
        ['up', 'down', 'left', 'right'].forEach((dirName) => {
            const button = documentObject.getElementById('dpad-' + dirName);
            if (button) button.addEventListener('click', () => move(dirName));
        });
        windowObject.addEventListener('keydown', (event) => {
            if (!elements.winModal.hidden || !elements.levelModal.hidden) return;
            const keyMap = {
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
            const dirName = keyMap[event.key];
            if (dirName) {
                event.preventDefault();
                move(dirName);
            } else if (event.key === 'Backspace' || event.key === 'z' || event.key === 'Z') {
                event.preventDefault();
                undo();
            }
        });
        // 棋盘滑动转向：位移阈值 24px，一次触摸只触发一步
        elements.board.addEventListener('touchstart', (event) => {
            const touch = event.touches && event.touches[0];
            if (!touch) return;
            state.touchStart = { x: touch.clientX, y: touch.clientY };
            state.swipeHandled = false;
        });
        elements.board.addEventListener('touchend', (event) => {
            if (!state.touchStart || state.swipeHandled) {
                state.touchStart = null;
                return;
            }
            const touch = (event.changedTouches && event.changedTouches[0]) || null;
            if (!touch) return;
            const dx = touch.clientX - state.touchStart.x;
            const dy = touch.clientY - state.touchStart.y;
            state.touchStart = null;
            if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
            state.swipeHandled = true;
            move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
        });
    }

    windowObject.Sokoban = {
        parseLevel,
        createState,
        applyMove,
        undoMove,
        isSolved,
        findDeadBoxes,
        tierOfLevel,
        readUnlocked,
        readBestMoves,
        writeBestMoves
    };

    bindEvents();
    /* 起始关三重钳制：当前关存档、解锁进度、关卡总数，损坏存档（如 999）回落到末关而非空白盘 */
    loadLevel(Math.min(
        Math.max(getStorageNumber(CURRENT_KEY, 1), 1),
        Math.max(readUnlocked(), 1),
        Math.max(levelCount(), 1)
    ));
})(window, document);
