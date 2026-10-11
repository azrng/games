// @ts-check
(function setupMath24(windowObject, documentObject) {
    'use strict';

    const SLUG = 'math-24';
    const TARGET = frac(24, 1);
    const TIER_META = {
        easy: { label: '入门档', min: 1, max: 10, hardOnly: false },
        normal: { label: '进阶档', min: 1, max: 13, hardOnly: false },
        hard: { label: '大师档', min: 1, max: 13, hardOnly: true }
    };
    const TIER_ORDER = ['easy', 'normal', 'hard'];
    const GENERATE_BUDGET = 400;
    const memoryFallback = {};

    /* ---------- 分数模块：全程精确有理数，杜绝浮点误差 ---------- */

    function gcd(a, b) {
        while (b !== 0) {
            const t = a % b;
            a = b;
            b = t;
        }
        return a;
    }

    /** 构造并约分；分母为 0 返回 null，负分母归一到分子 */
    function frac(n, d) {
        if (d === 0) return null;
        if (d < 0) {
            n = -n;
            d = -d;
        }
        const g = gcd(Math.abs(n), d) || 1;
        return { n: n / g, d: d / g };
    }

    const fAdd = (a, b) => frac(a.n * b.d + b.n * a.d, a.d * b.d);
    const fSub = (a, b) => frac(a.n * b.d - b.n * a.d, a.d * b.d);
    const fMul = (a, b) => frac(a.n * b.n, a.d * b.d);
    const fDiv = (a, b) => (b.n === 0 ? null : frac(a.n * b.d, a.d * b.n));
    const fEq = (a, b) => a.n === b.n && a.d === b.d;
    const fIsInt = (a) => a.d === 1;

    /** 分数的展示形式：整数直接显示，分数用 a/b */
    function fracToStr(f) {
        return f.d === 1 ? String(f.n) : f.n + '/' + f.d;
    }

    /* ---------- 求解器：两两归约搜索，去重后给出全部本质不同解法 ---------- */

    const OPERATIONS = [
        { op: 'add', apply: fAdd, symbol: '+', commutative: true },
        { op: 'sub', apply: fSub, symbol: '−', commutative: false },
        { op: 'mul', apply: fMul, symbol: '×', commutative: true },
        { op: 'div', apply: fDiv, symbol: '÷', commutative: false }
    ];

    /**
     * 求解 24 点。cards 为分数数组（长度 4）。
     * 返回 [{ expr, usedFrac }]：去重后的解法，usedFrac 表示该解法路径
     * 出现过非整数中间值（大师档难度依据）；排序为整数值路径优先、短表达式优先。
     * 去重键 = 按值规范化的表达式树串：叶子记牌值，交换律节点的两棵子树按字典序
     * 排序后序列化。重复牌的不同下标来源会得到同一棵树（只留一条），而本质不同
     * 的表达式树键必然不同（不会被误合并漏解）。
     */
    function solve24(cards) {
        const items = cards.map((value) => ({
            value,
            expr: fracToStr(value),
            key: fracToStr(value),
            usedFrac: !fIsInt(value)
        }));
        const found = [];
        const seen = new Set();

        function search(list) {
            if (list.length === 1) {
                const last = list[0];
                if (!fEq(last.value, TARGET)) return;
                if (seen.has(last.key)) return;
                seen.add(last.key);
                found.push({ expr: last.expr, usedFrac: last.usedFrac });
                return;
            }
            for (let i = 0; i < list.length; i += 1) {
                for (let j = i + 1; j < list.length; j += 1) {
                    const rest = [];
                    for (let k = 0; k < list.length; k += 1) {
                        if (k !== i && k !== j) rest.push(list[k]);
                    }
                    for (const operation of OPERATIONS) {
                        // 先按"定义方向"试 a∘b；不可交换的运算再补试 b∘a
                        const orders = operation.commutative
                            ? [[list[i], list[j]]]
                            : [[list[i], list[j]], [list[j], list[i]]];
                        for (const pair of orders) {
                            const value = operation.apply(pair[0].value, pair[1].value);
                            if (!value) continue;
                            const expr = wrapExpr(pair[0], pair[1], operation.symbol);
                            search(rest.concat([{
                                value,
                                expr,
                                key: treeKey(pair[0], pair[1], operation),
                                usedFrac: pair[0].usedFrac || pair[1].usedFrac || !fIsInt(value)
                            }]));
                        }
                    }
                }
            }
        }

        search(items);
        found.sort((a, b) => {
            if (a.usedFrac !== b.usedFrac) return a.usedFrac ? 1 : -1;
            return a.expr.length - b.expr.length;
        });
        return found;
    }

    /** 规范化子树键：交换律节点两子树按字典序排序，保证 a+b 与 b+a 同键 */
    function treeKey(a, b, operation) {
        if (operation.commutative && a.key > b.key) {
            return '(' + b.key + operation.symbol + a.key + ')';
        }
        return '(' + a.key + operation.symbol + b.key + ')';
    }

    /** 复合表达式一律加括号，保证字符串无歧义 */
    function wrapExpr(a, b, symbol) {
        return '(' + a.expr + symbol + b.expr + ')';
    }

    /* ---------- 出题：验证必有解，大师档要求全部解法都含分数中间值 ---------- */

    function generatePuzzle(tier, random) {
        const meta = TIER_META[tier] || TIER_META.normal;
        const rand = typeof random === 'function' ? random : Math.random;
        let fallback = null;
        for (let attempt = 0; attempt < GENERATE_BUDGET; attempt += 1) {
            const cards = [];
            for (let i = 0; i < 4; i += 1) {
                cards.push(frac(meta.min + Math.floor(rand() * (meta.max - meta.min + 1)), 1));
            }
            const solutions = solve24(cards);
            if (solutions.length === 0) continue;
            if (!meta.hardOnly) {
                return { tier, cards, solutions };
            }
            if (solutions.every((solution) => solution.usedFrac)) {
                return { tier, cards, solutions };
            }
            // 预算耗尽前的最优兜底：存在含分数中间值解法的题
            if (solutions.some((solution) => solution.usedFrac)) fallback = { tier, cards, solutions };
        }
        if (fallback) return fallback;
        // 极端兜底（概率近乎为零）：退回经典题 3 3 8 8
        return { tier, cards: [frac(3, 1), frac(3, 1), frac(8, 1), frac(8, 1)], solutions: solve24([frac(3, 1), frac(3, 1), frac(8, 1), frac(8, 1)]) };
    }

    /* ---------- 存档：try/catch + 内存兜底 ---------- */

    function bestTimeKey(tier) {
        return 'math24-best-time-' + tier;
    }

    function streakKey(tier) {
        return 'math24-streak-' + tier;
    }

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

    function readBestTime(tier) {
        const parsed = Number.parseFloat(safeGetItem(bestTimeKey(tier)) || '');
        return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    }

    function writeBestTime(tier, seconds) {
        const current = readBestTime(tier);
        if (current !== null && current <= seconds) return false;
        safeSetItem(bestTimeKey(tier), String(seconds));
        return true;
    }

    function readStreak(tier) {
        try {
            const raw = JSON.parse(safeGetItem(streakKey(tier)) || '{}');
            return {
                last: Number.isFinite(raw.last) && raw.last >= 0 ? raw.last : 0,
                best: Number.isFinite(raw.best) && raw.best >= 0 ? raw.best : 0
            };
        } catch (_) {
            return { last: 0, best: 0 };
        }
    }

    function writeStreak(tier, streak) {
        safeSetItem(streakKey(tier), JSON.stringify(streak));
    }

    /* ---------- 页面状态与交互 ---------- */

    const state = {
        tier: 'normal',
        initialCards: [],
        cards: [],
        selectedIndex: -1,
        pendingOp: null,
        undoStack: [],
        timerStart: 0,
        timerId: 0,
        elapsed: 0,
        finished: false
    };

    const elements = {
        tierText: documentObject.getElementById('tier-text'),
        streakNowText: documentObject.getElementById('streak-now-text'),
        timerText: documentObject.getElementById('timer-text'),
        bestTimeText: documentObject.getElementById('best-time-text'),
        streakBestText: documentObject.getElementById('streak-best-text'),
        banner: documentObject.getElementById('banner'),
        cardRow: documentObject.getElementById('card-row'),
        opRow: documentObject.getElementById('op-row'),
        undoBtn: documentObject.getElementById('undo-btn'),
        resetBtn: documentObject.getElementById('reset-btn'),
        skipBtn: documentObject.getElementById('skip-btn'),
        tierBtn: documentObject.getElementById('tier-btn'),
        solutionsModal: documentObject.getElementById('solutions-modal'),
        solutionsTitle: documentObject.getElementById('solutions-title'),
        solutionsList: documentObject.getElementById('solutions-list'),
        nextBtn: documentObject.getElementById('next-btn'),
        tierModal: documentObject.getElementById('tier-modal'),
        tierList: documentObject.getElementById('tier-list'),
        closeTierBtn: documentObject.getElementById('close-tier-btn')
    };

    function formatSeconds(seconds) {
        return seconds.toFixed(1) + 's';
    }

    function renderScoreboard() {
        const streak = readStreak(state.tier);
        elements.tierText.textContent = TIER_META[state.tier].label;
        elements.streakNowText.textContent = String(streak.last);
        elements.streakBestText.textContent = String(streak.best);
        const best = readBestTime(state.tier);
        elements.bestTimeText.textContent = best === null ? '--' : formatSeconds(best);
    }

    function renderCards() {
        elements.cardRow.replaceChildren();
        state.cards.forEach((card, index) => {
            const button = documentObject.createElement('button');
            button.type = 'button';
            button.className = 'number-card';
            if (index === state.selectedIndex) button.className += ' is-selected';
            if (state.finished && state.cards.length === 1) button.className += ' is-final';

            const value = documentObject.createElement('span');
            value.className = 'card-value';
            value.textContent = fracToStr(card.value);

            const expr = documentObject.createElement('span');
            expr.className = 'card-expr';
            expr.textContent = card.expr;
            expr.title = card.expr;

            button.appendChild(value);
            button.appendChild(expr);
            button.addEventListener('click', () => onCardClick(index));
            elements.cardRow.appendChild(button);
        });
    }

    function renderOps() {
        Array.prototype.forEach.call(elements.opRow.querySelectorAll('.op-btn'), (button) => {
            const isActive = button.getAttribute('data-op') === state.pendingOp;
            button.className = 'op-btn' + (isActive ? ' is-selected' : '');
        });
    }

    function showBanner(text, tone) {
        elements.banner.hidden = false;
        elements.banner.textContent = text;
        elements.banner.className = 'banner is-' + tone;
    }

    function hideBanner() {
        elements.banner.hidden = true;
    }

    function startTimer() {
        if (state.timerId || state.finished) return;
        state.timerStart = Date.now() - state.elapsed;
        state.timerId = windowObject.setInterval(() => {
            state.elapsed = (Date.now() - state.timerStart) / 1000;
            elements.timerText.textContent = formatSeconds(state.elapsed);
        }, 100);
    }

    function stopTimer() {
        if (state.timerId) {
            windowObject.clearInterval(state.timerId);
            state.timerId = 0;
        }
    }

    /** 点卡：未选运算符时为选中/换选；已选运算符时作为第二个数触发合成；再点自己一律视为取消选中 */
    function onCardClick(index) {
        if (state.finished) return;
        startTimer();
        if (state.selectedIndex === -1 || state.pendingOp === null) {
            state.selectedIndex = state.selectedIndex === index ? -1 : index;
            state.pendingOp = null;
            renderCards();
            renderOps();
            return;
        }
        // 已选运算符时再点同一张卡也视为取消选中：若放行到 mergeCards(A, A)，
        // 合并结果会写入该下标后又被同下标 splice 删除，牌面凭空少一张
        if (index === state.selectedIndex) {
            state.selectedIndex = -1;
            state.pendingOp = null;
            renderCards();
            renderOps();
            return;
        }
        mergeCards(state.selectedIndex, index, state.pendingOp);
    }

    function onOpClick(operation) {
        if (state.finished || state.selectedIndex === -1) return;
        state.pendingOp = state.pendingOp === operation ? null : operation;
        renderOps();
    }

    /** 合成：新卡落在先点的位置，后点的卡移除；除零抖动提示 */
    function mergeCards(firstIndex, secondIndex, operationName) {
        const first = state.cards[firstIndex];
        const second = state.cards[secondIndex];
        const operation = OPERATIONS.find((item) => item.op === operationName);
        if (!operation) return;
        const value = operation.apply(first.value, second.value);
        if (!value) {
            shakeCard(secondIndex);
            showBanner('不能除以 0', 'wrong');
            return;
        }
        hideBanner();
        state.undoStack.push(state.cards.map((card) => ({ value: card.value, expr: card.expr })));
        const expr = '(' + first.expr + operation.symbol + second.expr + ')';
        state.cards[firstIndex] = { value, expr };
        state.cards.splice(secondIndex, 1);
        state.selectedIndex = -1;
        state.pendingOp = null;
        renderCards();
        renderOps();
        if (state.cards.length === 1) {
            if (fEq(state.cards[0].value, TARGET)) {
                finishSuccess();
            } else {
                showBanner('结果不等于 24，可撤销重试', 'wrong');
            }
        }
    }

    function shakeCard(index) {
        const buttons = elements.cardRow.querySelectorAll('.number-card');
        const target = buttons[index];
        if (!target) return;
        target.classList.add('is-shake');
        windowObject.setTimeout(() => target.classList.remove('is-shake'), 320);
    }

    /** 答对：连击 +1、停表、最快纪录按档入档 */
    function finishSuccess() {
        state.finished = true;
        stopTimer();
        renderCards();
        const streak = readStreak(state.tier);
        const last = streak.last + 1;
        const best = Math.max(streak.best, last);
        writeStreak(state.tier, { last, best });
        const seconds = Math.max(0.1, Math.round(state.elapsed * 10) / 10);
        const isRecord = writeBestTime(state.tier, seconds);
        renderScoreboard();
        elements.timerText.textContent = formatSeconds(seconds);
        showBanner((isRecord ? '新纪录！' : '') + '算出 24！连击 ' + last, 'success');
    }

    function undo() {
        if (state.finished || state.undoStack.length === 0) return;
        state.cards = state.undoStack.pop();
        state.selectedIndex = -1;
        state.pendingOp = null;
        hideBanner();
        renderCards();
        renderOps();
    }

    /** 跳过：连击清零并展示被跳过题的解法；先载入下一题再把解法弹窗盖在上面 */
    function skip(showSolutions) {
        /* 已算出 24 后误点跳过：不清连击也不换题，仅展示本题解法 */
        if (state.finished) {
            if (showSolutions) openSolutions(state.initialCards, '本题解法');
            return;
        }
        stopTimer();
        const streak = readStreak(state.tier);
        writeStreak(state.tier, { last: 0, best: streak.best });
        renderScoreboard();
        const skippedCards = state.initialCards;
        nextPuzzle();
        if (showSolutions) openSolutions(skippedCards, '上一题解法');
    }

    function openSolutions(cards, title) {
        const solutions = solve24(cards).slice(0, 8);
        elements.solutionsTitle.textContent = title;
        elements.solutionsList.replaceChildren();
        solutions.forEach((solution) => {
            const item = documentObject.createElement('p');
            item.className = 'solution-item';
            item.textContent = solution.expr + ' = 24';
            if (solution.usedFrac) {
                const tag = documentObject.createElement('span');
                tag.textContent = '分数技巧';
                item.appendChild(tag);
            }
            elements.solutionsList.appendChild(item);
        });
        elements.solutionsModal.hidden = false;
    }

    /** 两组牌是否为同一多重集（值与张数完全一致） */
    function sameCards(a, b) {
        if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
        const keyOf = (cards) => cards.map((value) => fracToStr(value)).sort().join(',');
        return keyOf(a) === keyOf(b);
    }

    function nextPuzzle() {
        let puzzle = generatePuzzle(state.tier);
        /* 相邻两题不重复：连续撞同牌组时重抽一次（概率极低，一次足够且不会死循环） */
        if (sameCards(puzzle.cards, state.initialCards)) {
            puzzle = generatePuzzle(state.tier);
        }
        state.initialCards = puzzle.cards;
        state.cards = puzzle.cards.map((value) => ({ value, expr: fracToStr(value) }));
        state.selectedIndex = -1;
        state.pendingOp = null;
        state.undoStack = [];
        state.finished = false;
        state.elapsed = 0;
        stopTimer();
        elements.timerText.textContent = formatSeconds(0);
        hideBanner();
        elements.solutionsModal.hidden = true;
        renderCards();
        renderOps();
        renderScoreboard();
    }

    function switchTier(tier) {
        if (!TIER_META[tier]) return;
        state.tier = tier;
        elements.tierModal.hidden = true;
        nextPuzzle();
    }

    function bindEvents() {
        Array.prototype.forEach.call(elements.opRow.querySelectorAll('.op-btn'), (button) => {
            button.addEventListener('click', () => onOpClick(button.getAttribute('data-op')));
        });
        elements.undoBtn.addEventListener('click', undo);
        elements.resetBtn.addEventListener('click', () => {
            if (state.finished) return;
            state.cards = state.initialCards.map((value) => ({ value, expr: fracToStr(value) }));
            state.selectedIndex = -1;
            state.pendingOp = null;
            state.undoStack = [];
            hideBanner();
            renderCards();
            renderOps();
        });
        elements.skipBtn.addEventListener('click', () => skip(true));
        elements.tierBtn.addEventListener('click', () => {
            elements.tierModal.hidden = false;
        });
        elements.nextBtn.addEventListener('click', nextPuzzle);
        elements.closeTierBtn.addEventListener('click', () => {
            elements.tierModal.hidden = true;
        });
        Array.prototype.forEach.call(elements.tierList.querySelectorAll('.tier-item'), (button) => {
            button.addEventListener('click', () => switchTier(button.getAttribute('data-tier')));
        });
        // PC 键盘增强：数字序号选卡、加减乘除选运算符、退格撤销
        windowObject.addEventListener('keydown', (event) => {
            if (!elements.solutionsModal.hidden || !elements.tierModal.hidden) return;
            const opByKey = { '+': 'add', '-': 'sub', '*': 'mul', '/': 'div' };
            if (event.key >= '1' && event.key <= '4') {
                const index = Number.parseInt(event.key, 10) - 1;
                if (index < state.cards.length) onCardClick(index);
            } else if (opByKey[event.key]) {
                onOpClick(opByKey[event.key]);
            } else if (event.key === 'Backspace') {
                event.preventDefault();
                undo();
            }
        });
    }

    windowObject.Math24 = {
        frac,
        fAdd,
        fSub,
        fMul,
        fDiv,
        fEq,
        fIsInt,
        solve24,
        generatePuzzle,
        readBestTime,
        writeBestTime,
        readStreak,
        writeStreak
    };

    bindEvents();
    nextPuzzle();
})(window, document);
