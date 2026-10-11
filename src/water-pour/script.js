(function setupWaterPour(windowObject, documentObject) {
    'use strict';

    const SLUG = 'water-pour';
    const UNLOCK_KEY = 'water-pour-unlocked-level';
    const STARS_KEY_PREFIX = 'water-pour-stars-';
    const BEST_KEY_PREFIX = 'water-pour-best-';
    const HINTS_PER_LEVEL = 3;
    /* 水位过渡动画时长，过关弹窗等它播完再出现 */
    const WATER_ANIM_MS = 460;
    const HINT_VISIBLE_MS = 2200;
    const memoryFallback = {};

    /* 15 个手工关卡：caps 为各杯容量（L），target 为要量出的目标（L）。
       全部经 BFS 预校验有解，smoke 测试兜底再验一遍 */
    const LEVELS = [
        { caps: [5, 3], target: 4 },
        { caps: [7, 4], target: 5 },
        { caps: [8, 5, 3], target: 4 },
        { caps: [10, 7, 4], target: 5 },
        { caps: [9, 4], target: 6 },
        { caps: [11, 6], target: 8 },
        { caps: [12, 8, 5], target: 6 },
        { caps: [5, 3], target: 1 },
        { caps: [9, 5, 4], target: 6 },
        { caps: [10, 6, 5], target: 8 },
        { caps: [14, 9, 5], target: 7 },
        { caps: [16, 11, 7], target: 8 },
        { caps: [13, 7, 4], target: 6 },
        { caps: [15, 10, 6], target: 9 },
        { caps: [18, 10, 7], target: 9 }
    ];

    const state = {
        level: 1,
        caps: [],
        target: 0,
        cups: [],
        steps: 0,
        minSteps: 0,
        history: [],
        selected: -1,
        hintsLeft: HINTS_PER_LEVEL,
        hintTimer: 0,
        winTimer: 0,
        locked: false,
        cupViews: []
    };

    const elements = {
        levelText: documentObject.getElementById('level-text'),
        stepsText: documentObject.getElementById('steps-text'),
        minStepsText: documentObject.getElementById('min-steps-text'),
        bestText: documentObject.getElementById('best-text'),
        goalText: documentObject.getElementById('goal-text'),
        cups: documentObject.getElementById('cups'),
        statusText: documentObject.getElementById('status-text'),
        fillBtn: documentObject.getElementById('fill-btn'),
        emptyBtn: documentObject.getElementById('empty-btn'),
        undoBtn: documentObject.getElementById('undo-btn'),
        hintBtn: documentObject.getElementById('hint-btn'),
        hintCount: documentObject.getElementById('hint-count'),
        restartBtn: documentObject.getElementById('restart-btn'),
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

    /* ---------- 存档兜底：localStorage 不可用时退回内存 ---------- */

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

    /* ---------- 纯函数：关卡配置与状态运算（不碰 DOM，供测试复用） ---------- */

    function levelCount() {
        return LEVELS.length;
    }

    /* 取关卡配置，容量数组返回副本，避免调用方意外改到关卡表 */
    function levelConfig(level) {
        const definition = LEVELS[level - 1];
        if (!definition) {
            throw new Error(`关卡不存在：${level}`);
        }
        return { caps: definition.caps.slice(), target: definition.target };
    }

    /* 每关从全 0 状态开局 */
    function createInitialState(caps) {
        return caps.map(() => 0);
    }

    /* 任一杯水量恰好等于目标即过关（超过不算） */
    function isSolved(state, target) {
        return state.some((amount) => amount === target);
    }

    /* 把 from 杯倒进 to 杯：一直倒到目标满或源空为止。
       同杯、下标越界、源空、目标已满时原样返回原状态 */
    function pour(state, caps, from, to) {
        if (from === to) return state;
        if (from < 0 || to < 0 || from >= caps.length || to >= caps.length) return state;
        if (state[from] <= 0) return state;
        const room = caps[to] - state[to];
        if (room <= 0) return state;
        const moved = Math.min(state[from], room);
        const next = state.slice();
        next[from] -= moved;
        next[to] += moved;
        return next;
    }

    /* 装满第 i 杯；越界原样返回 */
    function fill(state, caps, i) {
        if (i < 0 || i >= caps.length) return state;
        const next = state.slice();
        next[i] = caps[i];
        return next;
    }

    /* 倒光第 i 杯；越界原样返回 */
    function empty(state, caps, i) {
        if (i < 0 || i >= caps.length) return state;
        const next = state.slice();
        next[i] = 0;
        return next;
    }

    /* 按动作对象（fill/empty/pour）作用到状态上 */
    function applyAction(state, caps, action) {
        if (!action) return state;
        if (action.type === 'fill') return fill(state, caps, action.from);
        if (action.type === 'empty') return empty(state, caps, action.from);
        return pour(state, caps, action.from, action.to);
    }

    /* 当前状态的全部可行动作：装满未满杯 / 倒光非空杯 / 有水杯倒向未满杯 */
    function actionsOf(state, caps) {
        const actions = [];
        for (let i = 0; i < caps.length; i += 1) {
            if (state[i] < caps[i]) actions.push({ type: 'fill', from: i, to: -1 });
            if (state[i] > 0) actions.push({ type: 'empty', from: i, to: -1 });
            for (let j = 0; j < caps.length; j += 1) {
                if (i !== j && state[i] > 0 && state[j] < caps[j]) {
                    actions.push({ type: 'pour', from: i, to: j });
                }
            }
        }
        return actions;
    }

    /* BFS：从 startState 出发找任一杯恰好等于 target 的最少步数。
       返回 { minMoves, nextAction }，nextAction 是最优路径的第一个动作，无解返回 null */
    function bfsSolveFrom(startState, caps, target) {
        if (isSolved(startState, target)) {
            return { minMoves: 0, nextAction: null };
        }
        let frontier = [{ state: startState, first: null }];
        const visited = new Set([startState.join(',')]);
        let depth = 0;
        while (frontier.length > 0) {
            depth += 1;
            const nextFrontier = [];
            for (const node of frontier) {
                for (const action of actionsOf(node.state, caps)) {
                    const next = applyAction(node.state, caps, action);
                    const key = next.join(',');
                    if (visited.has(key)) continue;
                    visited.add(key);
                    const first = node.first || action;
                    if (isSolved(next, target)) {
                        return { minMoves: depth, nextAction: first };
                    }
                    nextFrontier.push({ state: next, first });
                }
            }
            frontier = nextFrontier;
        }
        return null;
    }

    /* 从全 0 初始状态求解，即每关开局的最优步数 */
    function bfsSolve(caps, target) {
        return bfsSolveFrom(createInitialState(caps), caps, target);
    }

    /* 星级：不超过最优步数 3 星，不超过最优 + 3 为 2 星，通关 1 星 */
    function starRating(moves, optimal) {
        if (moves <= optimal) return 3;
        if (moves <= optimal + 3) return 2;
        return 1;
    }

    /* ---------- 存档读写：解锁只增不减、星级与最少步数保留最优 ---------- */

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

    function loadBest(level) {
        const parsed = Number.parseInt(safeGetItem(BEST_KEY_PREFIX + level) || '', 10);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
    }

    /* 最少步数只保留历史最好成绩（0 表示还没通关过） */
    function saveBest(level, steps) {
        const previous = loadBest(level);
        const next = previous > 0 ? Math.min(previous, steps) : steps;
        safeSetItem(BEST_KEY_PREFIX + level, String(next));
        return next;
    }

    /* ---------- UI 状态渲染 ---------- */

    function setStatus(message) {
        elements.statusText.textContent = message;
    }

    function updateHud() {
        const best = loadBest(state.level);
        elements.levelText.textContent = `第 ${state.level} 关`;
        elements.stepsText.textContent = String(state.steps);
        elements.minStepsText.textContent = String(state.minSteps);
        elements.bestText.textContent = best > 0 ? String(best) : '--';
        elements.hintCount.textContent = `(${state.hintsLeft})`;
        elements.hintBtn.disabled = state.locked || state.hintsLeft <= 0;
    }

    function updateControls() {
        const hasSelection = state.selected >= 0;
        elements.fillBtn.disabled = state.locked || !hasSelection;
        elements.emptyBtn.disabled = state.locked || !hasSelection;
        elements.undoBtn.disabled = state.locked || state.history.length === 0;
    }

    function updateCupsView() {
        state.caps.forEach((cap, index) => {
            const view = state.cupViews[index];
            const amount = state.cups[index];
            view.water.style.height = `${(amount / cap) * 100}%`;
            view.amount.textContent = `${amount}L`;
            view.button.setAttribute('aria-label', `杯子 ${index + 1}：容量 ${cap}L，当前 ${amount}L`);
            view.button.classList.toggle('is-selected', state.selected === index);
            /* 恰好量出目标的杯子亮金边，直观呼应横幅目标 */
            view.button.classList.toggle('is-goal', state.target > 0 && amount === state.target);
        });
    }

    function renderCups() {
        const fragment = documentObject.createDocumentFragment();
        const cupViews = [];

        state.caps.forEach((cap, index) => {
            const button = documentObject.createElement('button');
            button.type = 'button';
            button.className = 'cup';
            button.dataset.index = String(index);
            button.addEventListener('click', () => handleCupTap(index));

            const capLabel = documentObject.createElement('span');
            capLabel.className = 'cup-cap';
            capLabel.textContent = `${cap}L`;

            const body = documentObject.createElement('span');
            body.className = 'cup-body';

            const water = documentObject.createElement('span');
            water.className = 'cup-water';
            body.appendChild(water);

            const amount = documentObject.createElement('span');
            amount.className = 'cup-amount';

            button.appendChild(capLabel);
            button.appendChild(body);
            button.appendChild(amount);

            cupViews.push({ button, water, amount });
            fragment.appendChild(button);
        });

        elements.cups.replaceChildren(fragment);
        state.cupViews = cupViews;
        updateCupsView();
    }

    function clearHintHighlight() {
        if (state.hintTimer) {
            clearTimeout(state.hintTimer);
            state.hintTimer = 0;
        }
        state.cupViews.forEach((view) => view.button.classList.remove('is-hint'));
        elements.fillBtn.classList.remove('is-hint');
        elements.emptyBtn.classList.remove('is-hint');
    }

    function renderStars(container, stars) {
        const nodes = [];
        for (let index = 0; index < 3; index += 1) {
            const span = documentObject.createElement('span');
            span.textContent = '★';
            if (index >= stars) {
                span.className = 'star-off';
            } else {
                /* 拿到的星星逐颗弹入，错开延迟做出动画节奏 */
                span.style.animationDelay = `${index * 140}ms`;
            }
            nodes.push(span);
        }
        container.replaceChildren(...nodes);
    }

    /* ---------- 交互动作 ---------- */

    function describeAction(action) {
        if (action.type === 'pour') return `杯子 ${action.from + 1} 倒进了杯子 ${action.to + 1}。`;
        if (action.type === 'fill') return `杯子 ${action.from + 1} 装满了。`;
        return `杯子 ${action.from + 1} 倒光了。`;
    }

    function describeInvalid(action) {
        if (action.type === 'pour') {
            if (state.cups[action.from] <= 0) return `杯子 ${action.from + 1} 是空的，倒不出水。`;
            return `杯子 ${action.to + 1} 已经满了，装不下了。`;
        }
        return '这个操作现在不可用。';
    }

    /* 统一的动作入口：无效动作不消耗步数，有效动作推入撤销栈 */
    function performAction(action) {
        const next = applyAction(state.cups, state.caps, action);
        state.selected = -1;
        if (next === state.cups) {
            updateCupsView();
            updateControls();
            setStatus(describeInvalid(action));
            return;
        }
        state.history.push({ cups: state.cups, steps: state.steps });
        state.cups = next;
        state.steps += 1;
        updateCupsView();
        updateHud();
        updateControls();
        if (isSolved(state.cups, state.target)) {
            state.locked = true;
            updateHud();
            updateControls();
            setStatus(`正好量出 ${state.target}L，目标达成！`);
            state.winTimer = setTimeout(() => {
                state.winTimer = 0;
                showWinModal();
            }, WATER_ANIM_MS + 120);
            return;
        }
        setStatus(describeAction(action));
    }

    function handleCupTap(index) {
        if (state.locked) return;
        clearHintHighlight();
        if (state.selected === -1) {
            state.selected = index;
            updateCupsView();
            updateControls();
            setStatus(`已选中杯子 ${index + 1}，再点另一个杯子倒水，或用「装满 / 倒光」。`);
            return;
        }
        if (state.selected === index) {
            state.selected = -1;
            updateCupsView();
            updateControls();
            setStatus('已取消选中。');
            return;
        }
        performAction({ type: 'pour', from: state.selected, to: index });
    }

    function undo() {
        if (state.locked || state.history.length === 0) return;
        clearHintHighlight();
        const snapshot = state.history.pop();
        state.cups = snapshot.cups;
        state.steps = snapshot.steps;
        state.selected = -1;
        updateCupsView();
        updateHud();
        updateControls();
        setStatus('已撤销上一步，步数也一并退回。');
    }

    /* 提示：从当前局面 BFS 出最优下一步，并高亮对应的杯子 / 按钮 */
    function handleHint() {
        if (state.locked || state.hintsLeft <= 0) return;
        /* 上一条提示还在展示时不叠加消耗次数 */
        if (state.hintTimer) return;
        const result = bfsSolveFrom(state.cups, state.caps, state.target);
        if (!result || !result.nextAction) {
            setStatus('当前局面没有可给的建议，换条路试试。');
            return;
        }
        state.hintsLeft -= 1;
        clearHintHighlight();
        const action = result.nextAction;
        if (action.type === 'pour') {
            state.cupViews[action.from].button.classList.add('is-hint');
            state.cupViews[action.to].button.classList.add('is-hint');
            setStatus(`提示：把杯子 ${action.from + 1} 倒进杯子 ${action.to + 1}。`);
        } else if (action.type === 'fill') {
            state.cupViews[action.from].button.classList.add('is-hint');
            elements.fillBtn.classList.add('is-hint');
            setStatus(`提示：先选杯子 ${action.from + 1}，再点「装满」。`);
        } else {
            state.cupViews[action.from].button.classList.add('is-hint');
            elements.emptyBtn.classList.add('is-hint');
            setStatus(`提示：先选杯子 ${action.from + 1}，再点「倒光」。`);
        }
        updateHud();
        state.hintTimer = setTimeout(() => {
            state.hintTimer = 0;
            clearHintHighlight();
        }, HINT_VISIBLE_MS);
    }

    function showWinModal() {
        const stars = starRating(state.steps, state.minSteps);
        const best = saveBest(state.level, state.steps);
        saveStars(state.level, stars);
        saveUnlockedLevel(state.level + 1);
        renderStars(elements.resultStars, stars);
        elements.resultStars.setAttribute('aria-label', `${stars} 星`);
        elements.resultSteps.textContent = String(state.steps);
        elements.resultMin.textContent = String(state.minSteps);
        elements.resultBest.textContent = String(best);
        elements.nextBtn.textContent = state.level < levelCount() ? '下一关' : '选择关卡';
        elements.winModal.hidden = false;
        updateHud();
    }

    function startLevel(level) {
        const target = Math.min(Math.max(1, level), levelCount());
        const config = levelConfig(target);
        clearHintHighlight();
        if (state.winTimer) {
            clearTimeout(state.winTimer);
            state.winTimer = 0;
        }
        state.level = target;
        state.caps = config.caps;
        state.target = config.target;
        state.cups = createInitialState(config.caps);
        state.steps = 0;
        /* 最优步数按全 0 开局真实 BFS 求得，而非手工硬编码 */
        state.minSteps = bfsSolve(config.caps, config.target).minMoves;
        state.history = [];
        state.selected = -1;
        state.hintsLeft = HINTS_PER_LEVEL;
        state.locked = false;

        elements.winModal.hidden = true;
        elements.goalText.textContent = `量出 ${config.target}L`;
        renderCups();
        updateHud();
        updateControls();
        setStatus('点一个杯子选中它，再点另一个杯子倒水；也可以先选中再用「装满 / 倒光」。');
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

    elements.fillBtn.addEventListener('click', () => {
        if (state.selected >= 0) performAction({ type: 'fill', from: state.selected, to: -1 });
    });
    elements.emptyBtn.addEventListener('click', () => {
        if (state.selected >= 0) performAction({ type: 'empty', from: state.selected, to: -1 });
    });
    elements.undoBtn.addEventListener('click', undo);
    elements.hintBtn.addEventListener('click', handleHint);
    elements.restartBtn.addEventListener('click', () => startLevel(state.level));
    elements.levelsBtn.addEventListener('click', () => {
        renderLevelGrid();
        elements.levelModal.hidden = false;
    });
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
    elements.closeLevelsBtn.addEventListener('click', () => {
        elements.levelModal.hidden = true;
    });

    windowObject.WaterApi = {
        SLUG,
        HINTS_PER_LEVEL,
        LEVELS,
        levelCount,
        levelConfig,
        createInitialState,
        isSolved,
        pour,
        fill,
        empty,
        applyAction,
        actionsOf,
        bfsSolve,
        bfsSolveFrom,
        starRating,
        loadUnlockedLevel,
        saveUnlockedLevel,
        loadStars,
        saveStars,
        loadBest,
        saveBest
    };

    /* 从已解锁的最新一关继续，新玩家默认第 1 关 */
    startLevel(loadUnlockedLevel());
})(window, document);
