(function setupShoppingCashier(windowObject, documentObject) {
    'use strict';

    const SLUG = 'shopping-cashier';
    const UNLOCK_KEY = 'shopping-cashier-unlocked-level';
    const STARS_KEY_PREFIX = 'shopping-cashier-stars-';
    const BASE_SEED = 20261010;
    const LEVEL_TOTAL = 12;
    const ORDERS_PER_LEVEL = 5;
    const ORDER_SEED_STEP = 7919;
    const ALL_DENOMINATIONS = [1, 5, 10, 20, 50, 100];
    const CUSTOMERS = ['🧒', '👧', '👦', '👵', '🧑', '👴'];
    const memoryFallback = {};

    /* 商品池：emoji 大图标 + 名称 + 常见单价区间（整数元），生成价格时与关卡值域取交集 */
    const ITEM_POOL = [
        { emoji: '🍭', name: '棒棒糖', minPrice: 1, maxPrice: 5 },
        { emoji: '✏️', name: '铅笔', minPrice: 1, maxPrice: 6 },
        { emoji: '🎈', name: '气球', minPrice: 2, maxPrice: 8 },
        { emoji: '🍪', name: '饼干', minPrice: 2, maxPrice: 8 },
        { emoji: '🥕', name: '胡萝卜', minPrice: 2, maxPrice: 6 },
        { emoji: '🍎', name: '苹果', minPrice: 2, maxPrice: 8 },
        { emoji: '🥛', name: '牛奶', minPrice: 3, maxPrice: 8 },
        { emoji: '🍌', name: '香蕉', minPrice: 3, maxPrice: 9 },
        { emoji: '🍞', name: '面包', minPrice: 3, maxPrice: 10 },
        { emoji: '🍦', name: '冰淇淋', minPrice: 3, maxPrice: 10 },
        { emoji: '🌽', name: '玉米', minPrice: 3, maxPrice: 8 },
        { emoji: '📓', name: '笔记本', minPrice: 3, maxPrice: 10 },
        { emoji: '🧃', name: '果汁', minPrice: 4, maxPrice: 10 },
        { emoji: '🥚', name: '鸡蛋', minPrice: 4, maxPrice: 10 },
        { emoji: '🖍️', name: '蜡笔', minPrice: 5, maxPrice: 12 },
        { emoji: '🧦', name: '袜子', minPrice: 5, maxPrice: 15 },
        { emoji: '🎱', name: '玩具球', minPrice: 5, maxPrice: 15 },
        { emoji: '🃏', name: '卡牌', minPrice: 6, maxPrice: 15 },
        { emoji: '🍇', name: '葡萄', minPrice: 6, maxPrice: 18 },
        { emoji: '🪀', name: '悠悠球', minPrice: 8, maxPrice: 20 },
        { emoji: '🍉', name: '西瓜', minPrice: 8, maxPrice: 25 },
        { emoji: '🧩', name: '拼图', minPrice: 10, maxPrice: 30 },
        { emoji: '🚗', name: '玩具车', minPrice: 10, maxPrice: 40 },
        { emoji: '🎁', name: '礼物盒', minPrice: 12, maxPrice: 45 },
        { emoji: '🧢', name: '帽子', minPrice: 15, maxPrice: 40 },
        { emoji: '🪁', name: '风筝', minPrice: 15, maxPrice: 35 },
        { emoji: '📚', name: '故事书', minPrice: 15, maxPrice: 45 },
        { emoji: '🧸', name: '玩偶熊', minPrice: 15, maxPrice: 50 },
        { emoji: '⚽', name: '足球', minPrice: 20, maxPrice: 60 },
        { emoji: '🎨', name: '画板', minPrice: 20, maxPrice: 60 },
        { emoji: '🏀', name: '篮球', minPrice: 25, maxPrice: 70 },
        { emoji: '🤖', name: '机器人', minPrice: 35, maxPrice: 80 },
        { emoji: '🎹', name: '玩具琴', minPrice: 40, maxPrice: 90 },
        { emoji: '🎒', name: '书包', minPrice: 30, maxPrice: 90 }
    ];

    const state = {
        level: 1,
        orderIndex: 0,
        order: null,
        selected: [],
        levelMistakes: 0,
        locked: false
    };

    const elements = {
        counterCard: documentObject.getElementById('counter-card'),
        levelText: documentObject.getElementById('level-text'),
        progressDots: documentObject.getElementById('progress-dots'),
        mistakeText: documentObject.getElementById('mistake-text'),
        customerAvatar: documentObject.getElementById('customer-avatar'),
        orderLine: documentObject.getElementById('order-line'),
        goodsEmoji: documentObject.getElementById('goods-emoji'),
        goodsName: documentObject.getElementById('goods-name'),
        goodsPrice: documentObject.getElementById('goods-price'),
        changeLine: documentObject.getElementById('change-line'),
        paidText: documentObject.getElementById('paid-text'),
        trayChips: documentObject.getElementById('tray-chips'),
        feedbackText: documentObject.getElementById('feedback-text'),
        moneyGrid: documentObject.getElementById('money-grid'),
        clearBtn: documentObject.getElementById('clear-btn'),
        payBtn: documentObject.getElementById('pay-btn'),
        restartBtn: documentObject.getElementById('restart-btn'),
        levelsBtn: documentObject.getElementById('levels-btn'),
        resultModal: documentObject.getElementById('result-modal'),
        resultTitle: documentObject.getElementById('result-title'),
        resultStars: documentObject.getElementById('result-stars'),
        resultDetail: documentObject.getElementById('result-detail'),
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

    /* mulberry32 种子随机数，保证同种子订单完全可复现 */
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

    function levelSeed(level) {
        return (BASE_SEED + level * 6271) >>> 0;
    }

    function orderSeed(level, orderIndex) {
        return (levelSeed(level) + orderIndex * ORDER_SEED_STEP) >>> 0;
    }

    function levelCount() {
        return LEVEL_TOTAL;
    }

    /* 关卡档位：凑整档价格随关卡通升、面额逐步放开；找零档顾客付固定整钱 */
    function levelConfig(level) {
        if (level <= 4) {
            return { mode: 'exact', priceMin: level, priceMax: 10, denominations: [1, 5] };
        }
        if (level <= 8) {
            return { mode: 'exact', priceMin: 6 + (level - 5) * 4, priceMax: 50, denominations: [1, 5, 10, 20, 50] };
        }
        if (level <= 10) {
            return { mode: 'change', priceMin: 3, priceMax: 20, paid: 50, denominations: [1, 5, 10, 20] };
        }
        return {
            mode: 'change',
            priceMin: level === 11 ? 21 : 30,
            /* 上限取 99 而非 100，保证找零 Z = 100 - price 恒 ≥ 1 元 */
            priceMax: 99,
            paid: 100,
            denominations: [1, 5, 10, 20, 50]
        };
    }

    function denominations(level) {
        return levelConfig(level).denominations;
    }

    /* 本单玩家要凑出的目标金额：凑整档为价格本身，找零档为找零 Z = Y - X */
    function orderDue(order) {
        return order.paid ? computeChange(order.paid, order.price) : order.price;
    }

    /* 贪心拆分金额：返回 [{value, count}]（面额降序），无法精确表示时返回 null */
    function greedyBreakdown(amount, openDenominations) {
        const sorted = openDenominations.slice().sort((a, b) => b - a);
        let rest = amount;
        const breakdown = [];
        for (const value of sorted) {
            if (rest <= 0) break;
            const count = Math.floor(rest / value);
            if (count > 0) {
                breakdown.push({ value, count });
                rest -= count * value;
            }
        }
        return rest === 0 ? breakdown : null;
    }

    /* 生成订单：商品、价格、顾客都由种子决定，同种子完全可复现。
       找零档 1 元恒开放，任意整数元找零必可组合，无需因可表示性重抽 */
    function generateOrder(level, seed) {
        const config = levelConfig(level);
        const random = createSeededRandom((seed >>> 0) || orderSeed(level, 0));
        const candidates = ITEM_POOL.filter((item) => (
            Math.min(item.maxPrice, config.priceMax) >= Math.max(item.minPrice, config.priceMin)
        ));
        const pool = candidates.length > 0 ? candidates : ITEM_POOL;
        const item = pool[Math.floor(random() * pool.length)];
        let low = Math.max(item.minPrice, config.priceMin);
        let high = Math.min(item.maxPrice, config.priceMax);
        if (low > high) {
            low = config.priceMin;
            high = config.priceMax;
        }
        const price = low + Math.floor(random() * (high - low + 1));
        const order = {
            item: { emoji: item.emoji, name: item.name },
            price,
            customer: CUSTOMERS[Math.floor(random() * CUSTOMERS.length)]
        };
        if (config.mode === 'change') {
            order.paid = config.paid;
        }
        return order;
    }

    function computeChange(paid, price) {
        return paid - price;
    }

    function sumPayment(selected) {
        return selected.reduce((sum, value) => sum + value, 0);
    }

    /* 付账判定：exact 恰好 / over 多了 / short 还差，diff 恒为正的差额数值 */
    function evaluatePayment(selected, due) {
        const total = sumPayment(selected);
        if (total === due) {
            return { result: 'exact', diff: 0, total };
        }
        if (total > due) {
            return { result: 'over', diff: total - due, total };
        }
        return { result: 'short', diff: due - total, total };
    }

    /* 付款台面额张数汇总：按面额从大到小排列 */
    function coinCountSummary(selected) {
        const counts = new Map();
        for (const value of selected) {
            counts.set(value, (counts.get(value) || 0) + 1);
        }
        return Array.from(counts.entries())
            .map((entry) => ({ value: entry[0], count: entry[1] }))
            .sort((a, b) => b.value - a.value);
    }

    /* 星级只看本关累计失误次数：0 次 ★★★，≤2 次 ★★，其余 ★ */
    function starRating(mistakes) {
        if (mistakes === 0) return 3;
        if (mistakes <= 2) return 2;
        return 1;
    }

    function loadUnlockedLevel() {
        return Math.min(getStorageNumber(UNLOCK_KEY, 1), LEVEL_TOTAL);
    }

    function saveUnlockedLevel(level) {
        if (level > loadUnlockedLevel()) {
            safeSetItem(UNLOCK_KEY, String(level));
        }
    }

    function loadStars(level) {
        const parsed = Number.parseInt(safeGetItem(STARS_KEY_PREFIX + level) || '', 10);
        return parsed >= 1 && parsed <= 3 ? parsed : 0;
    }

    function saveStars(level, stars) {
        const next = Math.max(loadStars(level), stars);
        safeSetItem(STARS_KEY_PREFIX + level, String(next));
        return next;
    }

    /* ---------- 以下为页面渲染与交互 ---------- */

    function setFeedback(text, tone) {
        elements.feedbackText.textContent = text;
        elements.feedbackText.className = tone === 'warn' ? 'feedback is-warn' : tone === 'good' ? 'feedback is-good' : 'feedback';
    }

    function defaultPrompt() {
        return levelConfig(state.level).mode === 'change' ? '心算找零，凑出要找的钱' : '点面额把钱凑到和价签一样';
    }

    /* 每次换关重建面额按钮：本关未开放的面额置灰禁用 */
    function renderMoneyButtons() {
        const open = denominations(state.level);
        const fragment = documentObject.createDocumentFragment();
        for (const value of ALL_DENOMINATIONS) {
            const button = documentObject.createElement('button');
            button.type = 'button';
            button.className = value === 1 ? 'money-btn coin' : `money-btn note-${value}`;
            button.textContent = `${value}元`;
            if (open.includes(value)) {
                button.setAttribute('aria-label', `放入一张${value}元`);
                button.addEventListener('click', () => addNote(value));
            } else {
                button.disabled = true;
                button.setAttribute('aria-label', `${value}元（本关未开放）`);
            }
            fragment.appendChild(button);
        }
        elements.moneyGrid.replaceChildren(fragment);
    }

    function updateTrayView() {
        const total = sumPayment(state.selected);
        elements.paidText.textContent = `已付 ${total} 元`;
        const summary = coinCountSummary(state.selected);
        const fragment = documentObject.createDocumentFragment();
        if (summary.length === 0) {
            const empty = documentObject.createElement('span');
            empty.className = 'tray-empty';
            empty.textContent = '还没放钱，点下面的面额试一试';
            fragment.appendChild(empty);
        }
        for (const entry of summary) {
            const chip = documentObject.createElement('button');
            chip.type = 'button';
            chip.className = 'tray-chip';
            chip.textContent = `${entry.value}元 × ${entry.count}`;
            chip.setAttribute('aria-label', `撤回一张${entry.value}元`);
            chip.addEventListener('click', () => removeNote(entry.value));
            fragment.appendChild(chip);
        }
        elements.trayChips.replaceChildren(fragment);
    }

    function updateOrderView() {
        const order = state.order;
        const config = levelConfig(state.level);
        elements.customerAvatar.textContent = order.customer;
        elements.orderLine.textContent = `我想买「${order.item.name}」`;
        elements.goodsEmoji.textContent = order.item.emoji;
        elements.goodsName.textContent = order.item.name;
        elements.goodsPrice.textContent = `${order.price}元`;
        if (config.mode === 'change') {
            elements.changeLine.hidden = false;
            elements.changeLine.textContent = `应收 ${order.price} 元，顾客付了 ${order.paid} 元，请找零`;
        } else {
            elements.changeLine.hidden = true;
        }
        setFeedback(defaultPrompt(), '');
    }

    function updateProgressView() {
        elements.levelText.textContent = `第 ${state.level} 关`;
        elements.mistakeText.textContent = `失误 ${state.levelMistakes} 次`;
        const fragment = documentObject.createDocumentFragment();
        for (let index = 0; index < ORDERS_PER_LEVEL; index += 1) {
            const dot = documentObject.createElement('span');
            dot.className = index < state.orderIndex ? 'progress-dot is-done' : 'progress-dot';
            fragment.appendChild(dot);
        }
        elements.progressDots.replaceChildren(fragment);
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

    function renderLevelPicker() {
        const unlocked = loadUnlockedLevel();
        const fragment = documentObject.createDocumentFragment();
        for (let level = 1; level <= unlocked; level += 1) {
            const button = documentObject.createElement('button');
            button.type = 'button';
            button.className = loadStars(level) > 0 ? 'level-item is-cleared' : 'level-item';
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

    function addNote(value) {
        if (state.locked) return;
        if (!denominations(state.level).includes(value)) return;
        state.selected.push(value);
        setFeedback(defaultPrompt(), '');
        updateTrayView();
    }

    function removeNote(value) {
        if (state.locked) return;
        const index = state.selected.lastIndexOf(value);
        if (index < 0) return;
        state.selected.splice(index, 1);
        setFeedback(defaultPrompt(), '');
        updateTrayView();
    }

    function clearTray() {
        state.selected = [];
        updateTrayView();
    }

    function loadOrder(orderIndex) {
        state.orderIndex = orderIndex;
        state.order = generateOrder(state.level, orderSeed(state.level, orderIndex));
        state.selected = [];
        state.locked = false;
        updateOrderView();
        updateTrayView();
        updateProgressView();
    }

    function startLevel(level) {
        const safeLevel = Math.min(Math.max(level, 1), LEVEL_TOTAL);
        state.level = safeLevel;
        state.levelMistakes = 0;
        elements.resultModal.hidden = true;
        renderMoneyButtons();
        loadOrder(0);
    }

    function showOrderSuccess() {
        elements.resultTitle.textContent = '算对了！';
        elements.resultStars.hidden = true;
        elements.resultDetail.textContent = `已完成 ${state.orderIndex + 1} / ${ORDERS_PER_LEVEL} 单，继续保持！`;
        elements.nextBtn.textContent = '下一单';
        elements.replayBtn.hidden = true;
        elements.resultModal.hidden = false;
    }

    function finishLevel() {
        const stars = starRating(state.levelMistakes);
        saveStars(state.level, stars);
        saveUnlockedLevel(state.level + 1);
        renderStars(elements.resultStars, stars);
        elements.resultStars.hidden = false;
        elements.resultTitle.textContent = state.level >= LEVEL_TOTAL ? '全部通关，你是金牌小掌柜！' : `第 ${state.level} 关完成！`;
        elements.resultDetail.textContent = `本关失误 ${state.levelMistakes} 次`;
        elements.nextBtn.textContent = state.level >= LEVEL_TOTAL ? '从头再玩' : '下一关';
        elements.replayBtn.hidden = false;
        elements.resultModal.hidden = false;
    }

    function handleExact() {
        state.locked = true;
        setFeedback('刚刚好，找得真棒！', 'good');
        elements.counterCard.classList.add('is-success');
        setTimeout(() => {
            elements.counterCard.classList.remove('is-success');
            if (state.orderIndex + 1 >= ORDERS_PER_LEVEL) {
                finishLevel();
            } else {
                showOrderSuccess();
            }
        }, 750);
    }

    function submitPayment() {
        if (state.locked) return;
        if (state.selected.length === 0) {
            setFeedback('先点下面的面额放点钱吧', 'warn');
            return;
        }
        const outcome = evaluatePayment(state.selected, orderDue(state.order));
        if (outcome.result === 'exact') {
            handleExact();
            return;
        }
        state.levelMistakes += 1;
        updateProgressView();
        const word = outcome.result === 'over' ? '多了' : '还差';
        setFeedback(`${word} ${outcome.diff} 元，调整一下再试试！`, 'warn');
    }

    elements.clearBtn.addEventListener('click', () => {
        if (state.locked) return;
        clearTray();
        setFeedback(defaultPrompt(), '');
    });
    elements.payBtn.addEventListener('click', submitPayment);
    elements.restartBtn.addEventListener('click', () => startLevel(state.level));
    elements.levelsBtn.addEventListener('click', () => {
        renderLevelPicker();
        elements.levelModal.hidden = false;
    });
    elements.closeLevelsBtn.addEventListener('click', () => {
        elements.levelModal.hidden = true;
    });
    elements.replayBtn.addEventListener('click', () => {
        elements.resultModal.hidden = true;
        startLevel(state.level);
    });
    elements.nextBtn.addEventListener('click', () => {
        elements.resultModal.hidden = true;
        if (state.orderIndex + 1 < ORDERS_PER_LEVEL) {
            loadOrder(state.orderIndex + 1);
            return;
        }
        startLevel(state.level >= LEVEL_TOTAL ? 1 : state.level + 1);
    });

    windowObject.CashierApi = {
        SLUG,
        LEVEL_TOTAL,
        ORDERS_PER_LEVEL,
        ALL_DENOMINATIONS,
        ITEM_POOL,
        createSeededRandom,
        levelSeed,
        orderSeed,
        levelCount,
        levelConfig,
        denominations,
        generateOrder,
        orderDue,
        computeChange,
        evaluatePayment,
        coinCountSummary,
        greedyBreakdown,
        starRating,
        loadUnlockedLevel,
        saveUnlockedLevel,
        loadStars,
        saveStars
    };

    startLevel(loadUnlockedLevel());
})(window, document);
