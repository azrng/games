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
    /* 星级 3 星起步每失误减一星：累计第 4 次（0 星后再错）触发本次回第 1 关 */
    const RUN_RESET_MISTAKES = 4;
    /* 同一单找零答错 2 次后亮出正确答案，兜底不卡关 */
    const MAX_CHANGE_ATTEMPTS = 2;
    const CUSTOMERS = ['🧒', '👧', '👦', '👵', '🧑', '👴'];
    const memoryFallback = {};

    /* 商品池：emoji 大图标 + 名称 + 量词 + 常见单价区间（整数元）+ 档位。
       小件为日用零食文具；大件为家电数码（单价贴近入门/特价档）。
       订单按「单价 × 数量」落进关卡总价值域，大金额不再靠单件虚高定价 */
    const ITEM_POOL = [
        { emoji: '🍭', name: '棒棒糖', unit: '支', minPrice: 1, maxPrice: 5, tier: 'small' },
        { emoji: '✏️', name: '铅笔', unit: '支', minPrice: 1, maxPrice: 6, tier: 'small' },
        { emoji: '🎈', name: '气球', unit: '个', minPrice: 2, maxPrice: 8, tier: 'small' },
        { emoji: '🍪', name: '饼干', unit: '盒', minPrice: 2, maxPrice: 8, tier: 'small' },
        { emoji: '🥕', name: '胡萝卜', unit: '根', minPrice: 2, maxPrice: 6, tier: 'small' },
        { emoji: '🍎', name: '苹果', unit: '个', minPrice: 2, maxPrice: 8, tier: 'small' },
        { emoji: '🥛', name: '牛奶', unit: '盒', minPrice: 3, maxPrice: 8, tier: 'small' },
        { emoji: '🍌', name: '香蕉', unit: '根', minPrice: 3, maxPrice: 9, tier: 'small' },
        { emoji: '🍞', name: '面包', unit: '个', minPrice: 3, maxPrice: 10, tier: 'small' },
        { emoji: '🍦', name: '冰淇淋', unit: '个', minPrice: 3, maxPrice: 10, tier: 'small' },
        { emoji: '🌽', name: '玉米', unit: '根', minPrice: 3, maxPrice: 8, tier: 'small' },
        { emoji: '📓', name: '笔记本', unit: '本', minPrice: 3, maxPrice: 10, tier: 'small' },
        { emoji: '🧃', name: '果汁', unit: '盒', minPrice: 4, maxPrice: 10, tier: 'small' },
        { emoji: '🥚', name: '鸡蛋', unit: '个', minPrice: 4, maxPrice: 10, tier: 'small' },
        { emoji: '🖍️', name: '蜡笔', unit: '盒', minPrice: 5, maxPrice: 12, tier: 'small' },
        { emoji: '🧦', name: '袜子', unit: '双', minPrice: 5, maxPrice: 15, tier: 'small' },
        { emoji: '🎱', name: '玩具球', unit: '个', minPrice: 5, maxPrice: 15, tier: 'small' },
        { emoji: '🃏', name: '卡牌', unit: '张', minPrice: 6, maxPrice: 15, tier: 'small' },
        { emoji: '🍇', name: '葡萄', unit: '串', minPrice: 6, maxPrice: 18, tier: 'small' },
        { emoji: '🪀', name: '悠悠球', unit: '个', minPrice: 8, maxPrice: 20, tier: 'small' },
        { emoji: '🍉', name: '西瓜', unit: '个', minPrice: 8, maxPrice: 25, tier: 'small' },
        { emoji: '🧩', name: '拼图', unit: '盒', minPrice: 10, maxPrice: 30, tier: 'small' },
        { emoji: '🚗', name: '玩具车', unit: '辆', minPrice: 10, maxPrice: 40, tier: 'small' },
        { emoji: '🎁', name: '礼物盒', unit: '个', minPrice: 12, maxPrice: 45, tier: 'small' },
        { emoji: '🧢', name: '帽子', unit: '顶', minPrice: 15, maxPrice: 40, tier: 'small' },
        { emoji: '🪁', name: '风筝', unit: '只', minPrice: 15, maxPrice: 35, tier: 'small' },
        { emoji: '📚', name: '故事书', unit: '本', minPrice: 15, maxPrice: 45, tier: 'small' },
        { emoji: '🧸', name: '玩偶熊', unit: '只', minPrice: 15, maxPrice: 50, tier: 'small' },
        { emoji: '⚽', name: '足球', unit: '个', minPrice: 20, maxPrice: 60, tier: 'small' },
        { emoji: '🎨', name: '画板', unit: '套', minPrice: 20, maxPrice: 60, tier: 'small' },
        { emoji: '🏀', name: '篮球', unit: '个', minPrice: 25, maxPrice: 70, tier: 'small' },
        { emoji: '🤖', name: '机器人', unit: '个', minPrice: 35, maxPrice: 80, tier: 'small' },
        { emoji: '🎹', name: '玩具琴', unit: '台', minPrice: 40, maxPrice: 90, tier: 'small' },
        { emoji: '🎒', name: '书包', unit: '个', minPrice: 30, maxPrice: 90, tier: 'small' },
        { emoji: '🌬️', name: '电风扇', unit: '台', minPrice: 60, maxPrice: 140, tier: 'big' },
        { emoji: '🎧', name: '耳机', unit: '副', minPrice: 80, maxPrice: 250, tier: 'big' },
        { emoji: '🍚', name: '电饭煲', unit: '台', minPrice: 120, maxPrice: 260, tier: 'big' },
        { emoji: '⌚', name: '电话手表', unit: '块', minPrice: 120, maxPrice: 300, tier: 'big' },
        { emoji: '💾', name: '内存条', unit: '条', minPrice: 150, maxPrice: 280, tier: 'big' },
        { emoji: '🛴', name: '滑板车', unit: '辆', minPrice: 150, maxPrice: 300, tier: 'big' },
        { emoji: '🎮', name: '游戏机', unit: '台', minPrice: 280, maxPrice: 500, tier: 'big' },
        { emoji: '📺', name: '电视', unit: '台', minPrice: 300, maxPrice: 500, tier: 'big' },
        { emoji: '🎛️', name: '显卡', unit: '块', minPrice: 300, maxPrice: 500, tier: 'big' },
        { emoji: '🧊', name: '冰箱', unit: '台', minPrice: 330, maxPrice: 500, tier: 'big' },
        { emoji: '🧺', name: '洗衣机', unit: '台', minPrice: 350, maxPrice: 500, tier: 'big' },
        { emoji: '❄️', name: '空调', unit: '台', minPrice: 350, maxPrice: 500, tier: 'big' }
    ];

    const state = {
        level: 1,
        orderIndex: 0,
        order: null,
        selected: [],
        levelMistakes: 0,
        locked: false,
        phase: 'pay',           /* 'pay' 点钞付款 | 'change' 找零输入 */
        changeAnswer: 0,        /* 本单应退金额（多付部分） */
        changeAttempts: 0,      /* 本单找零答错次数 */
        changeRevealed: false,  /* 是否已亮出正确答案 */
        runReset: false         /* 结算弹窗是否为「回第 1 关」流程 */
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
        goodsUnit: documentObject.getElementById('goods-unit'),
        goodsPrice: documentObject.getElementById('goods-price'),
        changeLine: documentObject.getElementById('change-line'),
        paidText: documentObject.getElementById('paid-text'),
        trayChips: documentObject.getElementById('tray-chips'),
        feedbackText: documentObject.getElementById('feedback-text'),
        moneyGrid: documentObject.getElementById('money-grid'),
        changePanel: documentObject.getElementById('change-panel'),
        changeInput: documentObject.getElementById('change-input'),
        changeBtn: documentObject.getElementById('change-btn'),
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

    /* 关卡档位：凑整关（付正好）在前，找零关（付多了算找零）在后；
       总价随关卡通升，大金额由「单价 × 数量」与家电数码大件承担 */
    function levelConfig(level) {
        if (level <= 3) {
            const floorByLevel = [0, 1, 2, 4];
            return { mode: 'exact', totalMin: floorByLevel[level], totalMax: 10, qtyMin: 1, qtyMax: 2, tier: 'small' };
        }
        if (level <= 6) {
            const floorByLevel = [0, 0, 0, 0, 6, 8, 10];
            return { mode: 'exact', totalMin: floorByLevel[level], totalMax: 30, qtyMin: 1, qtyMax: 5, tier: 'small' };
        }
        if (level <= 8) {
            const floorByLevel = [0, 0, 0, 0, 0, 0, 0, 10, 15];
            return { mode: 'change', totalMin: floorByLevel[level], totalMax: 50, qtyMin: 1, qtyMax: 6, tier: 'small' };
        }
        if (level <= 10) {
            const floorByLevel = [0, 0, 0, 0, 0, 0, 0, 0, 0, 20, 30];
            return { mode: 'change', totalMin: floorByLevel[level], totalMax: 99, qtyMin: 1, qtyMax: 10, tier: 'small' };
        }
        if (level === 11) {
            return { mode: 'change', totalMin: 100, totalMax: 300, qtyMin: 1, qtyMax: 3, tier: 'big' };
        }
        return { mode: 'change', totalMin: 300, totalMax: 500, qtyMin: 1, qtyMax: 2, tier: 'big' };
    }

    /* 面额全关常开：1/5/10/20/50/100 元任意关卡都可点 */
    function denominations() {
        return ALL_DENOMINATIONS;
    }

    /* 枚举商品在关卡总价值域内可行的「数量 × 单价区间」组合 */
    function unitPriceCombos(item, config) {
        const combos = [];
        for (let qty = config.qtyMin; qty <= config.qtyMax; qty += 1) {
            const low = Math.max(item.minPrice, Math.ceil(config.totalMin / qty));
            const high = Math.min(item.maxPrice, Math.floor(config.totalMax / qty));
            if (low <= high) {
                combos.push({ qty, low, high });
            }
        }
        return combos;
    }

    /* 大件取整十单价更贴近真实标价、找零更好算，区间内无整十数时回退任意整数 */
    function pickUnitPrice(combo, tier, random) {
        if (tier === 'big') {
            const low10 = Math.ceil(combo.low / 10) * 10;
            const high10 = Math.floor(combo.high / 10) * 10;
            if (low10 <= high10) {
                return low10 + 10 * Math.floor(random() * ((high10 - low10) / 10 + 1));
            }
        }
        return combo.low + Math.floor(random() * (combo.high - combo.low + 1));
    }

    /* 生成订单：商品、数量、单价、顾客都由种子决定，同种子完全可复现 */
    function generateOrder(level, seed) {
        const config = levelConfig(level);
        const random = createSeededRandom((seed >>> 0) || orderSeed(level, 0));
        const pool = ITEM_POOL.filter((item) => item.tier === config.tier);
        const candidates = pool.filter((item) => unitPriceCombos(item, config).length > 0);
        const list = candidates.length > 0 ? candidates : pool;
        const item = list[Math.floor(random() * list.length)];
        const combos = unitPriceCombos(item, config);
        const customer = CUSTOMERS[Math.floor(random() * CUSTOMERS.length)];
        if (combos.length === 0) {
            /* 防御分支：整档无可行组合时按 1 件、值域下限出题 */
            return {
                item: { emoji: item.emoji, name: item.name, unit: item.unit },
                unitPrice: config.totalMin,
                qty: 1,
                price: config.totalMin,
                customer
            };
        }
        const combo = combos[Math.floor(random() * combos.length)];
        const unitPrice = pickUnitPrice(combo, config.tier, random);
        return {
            item: { emoji: item.emoji, name: item.name, unit: item.unit },
            unitPrice,
            qty: combo.qty,
            price: unitPrice * combo.qty,
            customer
        };
    }

    function computeChange(paid, price) {
        return paid - price;
    }

    /* 付款阶段目标恒为价签总价，找零在独立阶段处理 */
    function orderDue(order) {
        return order.price;
    }

    function sumPayment(selected) {
        return selected.reduce((sum, value) => sum + value, 0);
    }

    /* 付账判定：exact 恰好 / over 多了 / short 还差，diff 恒为正的差额数值。
       找零关 over 不算错，由调用方转入找零阶段 */
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

    /* 找零输入判定：空/负数/非整数视为无效输入不计失误，多退少退给方向提示 */
    function checkChangeInput(raw, expected) {
        const text = String(raw === undefined || raw === null ? '' : raw).trim();
        if (text === '') {
            return 'invalid';
        }
        const value = Number(text);
        if (!Number.isInteger(value) || value < 0) {
            return 'invalid';
        }
        if (value === expected) {
            return 'correct';
        }
        return value > expected ? 'more' : 'less';
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

    /* 星级只看本关累计失误次数：3 星起步，每失误减一星，最低 0 星 */
    function starRating(mistakes) {
        return Math.max(0, 3 - mistakes);
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
        if (state.phase === 'change') {
            return '算算商家该退你多少钱？';
        }
        return levelConfig(state.level).mode === 'change' ? '点面额付钱，付多了就要算找零啦' : '点面额把钱凑到和价签一样';
    }

    /* 每次换关重建面额按钮：6 种面额全关常开 */
    function renderMoneyButtons() {
        const fragment = documentObject.createDocumentFragment();
        for (const value of ALL_DENOMINATIONS) {
            const button = documentObject.createElement('button');
            button.type = 'button';
            button.className = value === 1 ? 'money-btn coin' : `money-btn note-${value}`;
            button.textContent = `${value}元`;
            button.setAttribute('aria-label', `放入一张${value}元`);
            button.addEventListener('click', () => addNote(value));
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
        if (order.qty > 1) {
            elements.goodsUnit.hidden = false;
            elements.goodsUnit.textContent = `单价 ${order.unitPrice} 元 × ${order.qty} ${order.item.unit}`;
        } else {
            elements.goodsUnit.hidden = true;
            elements.goodsUnit.textContent = '';
        }
        if (config.mode === 'change') {
            elements.changeLine.hidden = false;
            elements.changeLine.textContent = `价签 ${order.price} 元；付多了商家会找零`;
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
        if (state.locked || state.phase === 'change') return;
        state.selected.push(value);
        setFeedback(defaultPrompt(), '');
        updateTrayView();
    }

    function removeNote(value) {
        if (state.locked || state.phase === 'change') return;
        const index = state.selected.lastIndexOf(value);
        if (index < 0) return;
        state.selected.splice(index, 1);
        setFeedback(defaultPrompt(), '');
        updateTrayView();
    }

    function resetChangePanel() {
        elements.changePanel.hidden = true;
        elements.changeInput.value = '';
        elements.changeInput.disabled = false;
        elements.changeBtn.textContent = '确认找零';
    }

    /* 多付后进入找零阶段：隐藏面额区与「付账」，切换为输入面板 */
    function enterChangePhase(answer) {
        state.phase = 'change';
        state.changeAnswer = answer;
        state.changeAttempts = 0;
        state.changeRevealed = false;
        elements.moneyGrid.hidden = true;
        elements.payBtn.hidden = true;
        resetChangePanel();
        elements.changePanel.hidden = false;
        setFeedback(defaultPrompt(), '');
        if (typeof elements.changeInput.focus === 'function') {
            elements.changeInput.focus();
        }
    }

    /* 清空付款可退出找零阶段重新付钱，不计失误 */
    function exitChangePhase() {
        state.phase = 'pay';
        state.changeAnswer = 0;
        state.changeAttempts = 0;
        state.changeRevealed = false;
        resetChangePanel();
        elements.moneyGrid.hidden = false;
        elements.payBtn.hidden = false;
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
        state.phase = 'pay';
        state.changeAnswer = 0;
        state.changeAttempts = 0;
        state.changeRevealed = false;
        elements.moneyGrid.hidden = false;
        elements.payBtn.hidden = false;
        resetChangePanel();
        updateOrderView();
        updateTrayView();
        updateProgressView();
    }

    function startLevel(level) {
        const safeLevel = Math.min(Math.max(level, 1), LEVEL_TOTAL);
        state.level = safeLevel;
        state.levelMistakes = 0;
        state.runReset = false;
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

    /* 失误统一入口：返回是否触发了回第 1 关 */
    function registerMistake() {
        state.levelMistakes += 1;
        updateProgressView();
        if (state.levelMistakes >= RUN_RESET_MISTAKES) {
            triggerRunReset();
            return true;
        }
        return false;
    }

    /* 温和回退：解锁与星星存档不动，只把本次游戏送回第 1 关 */
    function triggerRunReset() {
        state.locked = true;
        state.runReset = true;
        elements.resultStars.hidden = true;
        elements.resultTitle.textContent = '失误太多啦';
        elements.resultDetail.textContent = `本关失误 ${state.levelMistakes} 次，别灰心，从第 1 关重新出发吧！`;
        elements.nextBtn.textContent = '回到第 1 关';
        elements.replayBtn.hidden = true;
        elements.resultModal.hidden = false;
    }

    function handleOrderSuccess(message) {
        state.locked = true;
        setFeedback(message, 'good');
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
        if (state.locked || state.phase !== 'pay') return;
        if (state.selected.length === 0) {
            setFeedback('先点下面的面额放点钱吧', 'warn');
            return;
        }
        const outcome = evaluatePayment(state.selected, orderDue(state.order));
        if (outcome.result === 'exact') {
            handleOrderSuccess('刚刚好，一分不差！');
            return;
        }
        if (outcome.result === 'over' && levelConfig(state.level).mode === 'change') {
            /* 找零关多付是合法策略：转入找零输入，不算失误 */
            enterChangePhase(computeChange(outcome.total, state.order.price));
            return;
        }
        if (registerMistake()) return;
        const word = outcome.result === 'over' ? '多了' : '还差';
        setFeedback(`${word} ${outcome.diff} 元，调整一下再试试！`, 'warn');
    }

    function submitChange() {
        if (state.locked || state.phase !== 'change') return;
        const outcome = checkChangeInput(elements.changeInput.value, state.changeAnswer);
        if (outcome === 'invalid') {
            setFeedback('先输入一个数字吧', 'warn');
            return;
        }
        if (outcome === 'correct') {
            handleOrderSuccess('找零正确，找得真棒！');
            return;
        }
        state.changeAttempts += 1;
        if (registerMistake()) return;
        if (state.changeAttempts >= MAX_CHANGE_ATTEMPTS) {
            /* 兜底不卡关：亮出正确答案并锁定输入，点「好的」通过 */
            state.changeRevealed = true;
            elements.changeInput.value = String(state.changeAnswer);
            elements.changeInput.disabled = true;
            elements.changeBtn.textContent = '好的';
            setFeedback(`应该退 ${state.changeAnswer} 元，记住啦！`, 'warn');
            return;
        }
        setFeedback(outcome === 'more' ? '退多了，再算算！' : '退少了，再算算！', 'warn');
    }

    elements.clearBtn.addEventListener('click', () => {
        if (state.locked) return;
        const wasChangePhase = state.phase === 'change';
        clearTray();
        if (wasChangePhase) {
            exitChangePhase();
        }
        setFeedback(defaultPrompt(), '');
    });
    elements.payBtn.addEventListener('click', submitPayment);
    elements.changeBtn.addEventListener('click', () => {
        if (state.changeRevealed) {
            handleOrderSuccess('记住啦，下次自己算！');
            return;
        }
        submitChange();
    });
    elements.changeInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            submitChange();
        }
    });
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
        if (state.runReset) {
            state.runReset = false;
            startLevel(1);
            return;
        }
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
        RUN_RESET_MISTAKES,
        MAX_CHANGE_ATTEMPTS,
        ITEM_POOL,
        createSeededRandom,
        levelSeed,
        orderSeed,
        levelCount,
        levelConfig,
        denominations,
        unitPriceCombos,
        generateOrder,
        orderDue,
        computeChange,
        evaluatePayment,
        checkChangeInput,
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
