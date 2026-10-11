const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = __dirname;

function read(file) {
    return fs.readFileSync(path.join(root, file), 'utf8');
}

/* script.js 启动时会 getElementById 的全部节点，桩需提前注册 */
const ELEMENT_IDS = [
    'counter-card',
    'level-text',
    'progress-dots',
    'mistake-text',
    'customer-avatar',
    'order-line',
    'goods-emoji',
    'goods-name',
    'goods-unit',
    'goods-price',
    'change-line',
    'paid-text',
    'tray-chips',
    'feedback-text',
    'money-grid',
    'change-panel',
    'change-input',
    'change-btn',
    'clear-btn',
    'pay-btn',
    'restart-btn',
    'levels-btn',
    'result-modal',
    'result-title',
    'result-stars',
    'result-detail',
    'replay-btn',
    'next-btn',
    'level-modal',
    'level-grid',
    'close-levels-btn'
];

/* vm 沙箱里创建的数组/对象原型与宿主不同，先经 JSON 落回宿主领域再 deepStrictEqual */
function toHost(value) {
    return JSON.parse(JSON.stringify(value));
}

function runScriptWithContext() {
    const storage = new Map();
    const elements = new Map();

    function createElement(id) {
        const element = {
            id,
            textContent: '',
            value: '',
            hidden: false,
            disabled: false,
            dataset: {},
            style: {},
            className: '',
            children: [],
            classList: {
                add() {},
                remove() {},
                toggle() {}
            },
            addEventListener() {},
            focus() {},
            appendChild(child) {
                this.children.push(child);
            },
            replaceChildren(...children) {
                this.children = children;
            },
            setAttribute(name, value) {
                this[name] = value;
            },
            removeAttribute(name) {
                delete this[name];
            }
        };
        elements.set(id, element);
        return element;
    }

    ELEMENT_IDS.forEach(createElement);

    const document = {
        createElement(tag) {
            return createElement(`${tag}-${elements.size}`);
        },
        createDocumentFragment() {
            return { children: [], appendChild(child) { this.children.push(child); } };
        },
        getElementById(id) {
            return elements.get(id) || null;
        },
        addEventListener() {}
    };

    const context = {
        window: {
            localStorage: {
                getItem(key) {
                    return storage.has(key) ? storage.get(key) : null;
                },
                setItem(key, value) {
                    storage.set(key, String(value));
                }
            }
        },
        document,
        Math,
        setTimeout() {
            return 1;
        },
        clearTimeout() {}
    };
    context.window.window = context.window;
    context.window.document = document;

    vm.runInNewContext(read('script.js'), context);
    return { api: context.window.CashierApi, storage };
}

function testFilesAndCatalogExist() {
    const html = read('index.html');
    const css = read('style.css');
    const script = read('script.js');
    const catalog = fs.readFileSync(path.join(root, '..', 'data', 'games.js'), 'utf8');

    assert(html.includes('viewport-fit=cover'), 'mobile page should use viewport-fit=cover');
    assert(html.includes('user-scalable=no'), 'mobile page should disable viewport scaling');
    assert(html.includes('购物小掌柜 - 游戏平台'), 'page title should match the platform convention');
    assert(html.includes('<script src="script.js"></script>'), 'page should mount the game script');
    assert(html.includes('../js/game-back.js'), 'page should mount the shared back button script');
    assert(
        html.indexOf('<script src="script.js"></script>') < html.indexOf('../js/game-back.js'),
        'back button script should load after the game script'
    );
    assert(html.includes('../js/game-tip.js'), 'page should mount the shared first-time tip script');
    assert(html.includes('id="change-input"'), 'change step should provide a numeric input');
    assert(html.includes('inputmode="numeric"'), 'change input should trigger the numeric keyboard');
    assert(html.includes('id="change-btn"'), 'change step should provide a confirm button');

    assert(css.includes('--sc-'), 'css should use self-contained --sc- variables');
    assert(css.includes('.change-panel'), 'css should style the change input panel');
    assert(
        css.includes('padding-top: calc(max(16px, env(safe-area-inset-top)) + 44px)'),
        'header area should avoid the floating back button (>= 56px)'
    );

    assert(!/\bvar\b/.test(script), 'script should not use var declarations');
    assert(!/[^=!<>]==[^=]/.test(script), 'script should not use loose equality');
    assert(!script.includes('eval('), 'script should not use eval');
    assert(!script.includes('alert(') && !script.includes('confirm('), 'script should not use blocking dialogs');

    assert(catalog.includes('slug: "shopping-cashier"'), 'catalog should register shopping-cashier');
    assert(catalog.includes('mobilePath: "src/shopping-cashier/index.html"'), 'catalog should route mobile to shopping-cashier');
}

function testApiSurface() {
    const { api } = runScriptWithContext();

    [
        'levelConfig',
        'denominations',
        'levelCount',
        'unitPriceCombos',
        'generateOrder',
        'orderDue',
        'computeChange',
        'evaluatePayment',
        'checkChangeInput',
        'coinCountSummary',
        'greedyBreakdown',
        'starRating',
        'loadUnlockedLevel',
        'saveUnlockedLevel',
        'loadStars',
        'saveStars'
    ].forEach((name) => {
        assert.strictEqual(typeof api[name], 'function', `api should expose ${name}`);
    });

    assert.strictEqual(api.SLUG, 'shopping-cashier', 'api slug should match the registered game');
    assert.strictEqual(api.levelCount(), 12, 'game should have 12 levels');
    assert.strictEqual(api.ORDERS_PER_LEVEL, 5, 'each level should have 5 orders');
    assert.strictEqual(api.RUN_RESET_MISTAKES, 4, 'the 4th mistake should send the run back to level 1');
    assert.strictEqual(api.MAX_CHANGE_ATTEMPTS, 2, 'change answers should reveal the solution after two mistakes');
    assert(Array.isArray(api.ITEM_POOL) && api.ITEM_POOL.length >= 24, 'item pool should have at least 24 goods');
    assert(
        api.ITEM_POOL.filter((item) => item.tier === 'big').length >= 6,
        'big-ticket pool should have at least 6 appliance goods'
    );
    assert(api.ITEM_POOL.every((item) => item.unit), 'every good should carry a measure word');
    assert.deepStrictEqual(toHost(api.ALL_DENOMINATIONS), [1, 5, 10, 20, 50, 100], 'all six RMB denominations should exist');
}

function testGenerateOrder() {
    const { api } = runScriptWithContext();

    for (let level = 1; level <= 12; level += 1) {
        const config = api.levelConfig(level);
        assert.deepStrictEqual(toHost(api.denominations(level)), [1, 5, 10, 20, 50, 100], 'all denominations should stay open at every level');

        for (const seed of [1, 20261010, 987654321]) {
            const order = api.generateOrder(level, seed);
            const replay = api.generateOrder(level, seed);

            assert.deepStrictEqual(order, replay, `level ${level} seed ${seed} should reproduce the same order`);
            assert(order.item && typeof order.item.emoji === 'string' && order.item.name, 'order should carry an emoji item');
            assert(order.item.unit, 'order item should carry a measure word');
            assert(Number.isInteger(order.unitPrice) && order.unitPrice > 0, `level ${level} unit price should be a positive integer`);
            assert(
                Number.isInteger(order.qty) && order.qty >= config.qtyMin && order.qty <= config.qtyMax,
                `level ${level} qty ${order.qty} should stay inside [${config.qtyMin}, ${config.qtyMax}]`
            );
            assert.strictEqual(order.price, order.unitPrice * order.qty, 'tag price should equal unit price times qty');
            assert(
                order.price >= config.totalMin && order.price <= config.totalMax,
                `level ${level} total ${order.price} should stay inside [${config.totalMin}, ${config.totalMax}]`
            );
            assert.strictEqual(order.paid, undefined, 'orders should not predefine the paid amount');

            const poolItem = api.ITEM_POOL.find((entry) => entry.name === order.item.name);
            assert(poolItem && poolItem.tier === config.tier, `level ${level} should pick goods from the ${config.tier} tier`);

            if (config.tier === 'big') {
                assert(
                    order.unitPrice % 10 === 0 || poolItem.minPrice === poolItem.maxPrice,
                    `level ${level} big-ticket unit prices should prefer multiples of ten`
                );
            }
        }
    }

    const combos = toHost(api.unitPriceCombos(
        { minPrice: 3, maxPrice: 6 },
        { totalMin: 10, totalMax: 30, qtyMin: 1, qtyMax: 5 }
    ));
    assert.deepStrictEqual(
        combos,
        [
            { qty: 2, low: 5, high: 6 },
            { qty: 3, low: 4, high: 6 },
            { qty: 4, low: 3, high: 6 },
            { qty: 5, low: 3, high: 6 }
        ],
        'combos should only keep quantities that can land inside the total range'
    );
}

function testEvaluateAndChange() {
    const { api } = runScriptWithContext();

    const exact = api.evaluatePayment([5, 1], 6);
    assert.strictEqual(exact.result, 'exact', 'equal total should be exact');
    assert.strictEqual(exact.diff, 0, 'exact payment diff should be zero');

    const over = api.evaluatePayment([10, 5], 12);
    assert.strictEqual(over.result, 'over', 'overpaying should be over');
    assert.strictEqual(over.diff, 3, 'over diff should be the surplus');

    const short = api.evaluatePayment([5], 8);
    assert.strictEqual(short.result, 'short', 'underpaying should be short');
    assert.strictEqual(short.diff, 3, 'short diff should be the missing amount');

    assert.strictEqual(api.computeChange(50, 32), 18, 'change of 50 for 32 should be 18');
    assert.strictEqual(api.computeChange(100, 100), 0, 'change of 100 for 100 should be 0');

    assert.strictEqual(api.orderDue({ price: 12 }), 12, 'payment due should always be the tag price');
    assert.strictEqual(api.orderDue({ price: 48, unitPrice: 6, qty: 8 }), 48, 'payment due should ignore qty breakdown');

    assert.strictEqual(api.checkChangeInput('14', 14), 'correct', 'the exact change should pass');
    assert.strictEqual(api.checkChangeInput('20', 14), 'more', 'over-refunding should hint more');
    assert.strictEqual(api.checkChangeInput('7', 14), 'less', 'under-refunding should hint less');
    assert.strictEqual(api.checkChangeInput('', 14), 'invalid', 'empty input should be invalid without a mistake');
    assert.strictEqual(api.checkChangeInput('abc', 14), 'invalid', 'non-numeric input should be invalid');
    assert.strictEqual(api.checkChangeInput('-3', 14), 'invalid', 'negative input should be invalid');
    assert.strictEqual(api.checkChangeInput('1.5', 14), 'invalid', 'decimal input should be invalid');

    assert.deepStrictEqual(
        toHost(api.coinCountSummary([1, 5, 5, 1])),
        [{ value: 5, count: 2 }, { value: 1, count: 2 }],
        'coin summary should count by denomination in descending order'
    );
    assert.deepStrictEqual(toHost(api.coinCountSummary([])), [], 'empty tray should summarize to an empty list');

    const parts = toHost(api.greedyBreakdown(38, [1, 5, 10, 20]));
    assert.deepStrictEqual(
        parts,
        [{ value: 20, count: 1 }, { value: 10, count: 1 }, { value: 5, count: 1 }, { value: 1, count: 3 }],
        'greedy breakdown should use open denominations from large to small'
    );
    assert.strictEqual(api.greedyBreakdown(3, [5, 10]), null, 'amounts below the smallest note should be unpayable');
}

function testStarRatingAndLevelConfig() {
    const { api } = runScriptWithContext();

    assert.strictEqual(api.starRating(0), 3, 'zero mistakes should earn three stars');
    assert.strictEqual(api.starRating(1), 2, 'one mistake should earn two stars');
    assert.strictEqual(api.starRating(2), 1, 'two mistakes should earn one star');
    assert.strictEqual(api.starRating(3), 0, 'three mistakes should earn zero stars but still pass');
    assert.strictEqual(api.starRating(9), 0, 'more mistakes should never go below zero stars');

    assert.strictEqual(api.levelConfig(1).mode, 'exact', 'level 1 should be exact payment');
    assert.strictEqual(api.levelConfig(6).mode, 'exact', 'level 6 should still be exact payment');
    assert.strictEqual(api.levelConfig(1).totalMax, 10, 'levels 1-3 should cap totals at 10');
    assert.strictEqual(api.levelConfig(4).totalMax, 30, 'levels 4-6 should cap totals at 30');
    assert.strictEqual(api.levelConfig(6).tier, 'small', 'levels 1-6 should use small goods');

    assert.strictEqual(api.levelConfig(7).mode, 'change', 'level 7 should start change mode');
    assert.strictEqual(api.levelConfig(8).totalMax, 50, 'levels 7-8 should cap totals at 50');
    assert.strictEqual(api.levelConfig(9).qtyMax, 10, 'levels 9-10 should allow buying up to ten pieces');
    assert.strictEqual(api.levelConfig(10).totalMax, 99, 'levels 9-10 should cap totals at 99');

    assert.strictEqual(api.levelConfig(11).mode, 'change', 'level 11 should be change mode');
    assert.strictEqual(api.levelConfig(11).tier, 'big', 'level 11 should use appliance goods');
    assert.strictEqual(api.levelConfig(11).totalMin, 100, 'level 11 totals should start at 100');
    assert.strictEqual(api.levelConfig(12).tier, 'big', 'level 12 should use appliance goods');
    assert.strictEqual(api.levelConfig(12).totalMax, 500, 'level 12 should cap totals at 500');

    assert(
        api.levelConfig(2).totalMin > api.levelConfig(1).totalMin,
        'exact tier total floors should ramp up inside levels 1-3'
    );
    assert(
        api.levelConfig(6).totalMin > api.levelConfig(5).totalMin,
        'exact tier total floors should ramp up inside levels 4-6'
    );
    assert(
        api.levelConfig(10).totalMin > api.levelConfig(9).totalMin,
        'change tier total floors should ramp up inside levels 9-10'
    );
}

function testStorageRecords() {
    const { api, storage } = runScriptWithContext();

    assert.strictEqual(api.loadUnlockedLevel(), 1, 'fresh save should start at level 1');

    api.saveUnlockedLevel(4);
    api.saveUnlockedLevel(3);
    assert.strictEqual(storage.get('shopping-cashier-unlocked-level'), '4', 'unlocked level should never regress');
    assert.strictEqual(api.loadUnlockedLevel(), 4, 'unlocked level should read back');

    assert.strictEqual(api.loadStars(2), 0, 'levels without stars should read zero');
    api.saveStars(2, 2);
    assert.strictEqual(storage.get('shopping-cashier-stars-2'), '2', 'stars should persist under the slug prefix');
    api.saveStars(2, 3);
    api.saveStars(2, 1);
    assert.strictEqual(storage.get('shopping-cashier-stars-2'), '3', 'stars should keep the historical maximum');
    assert.strictEqual(api.loadStars(2), 3, 'stars should read back the maximum');
}

testFilesAndCatalogExist();
testApiSurface();
testGenerateOrder();
testEvaluateAndChange();
testStarRatingAndLevelConfig();
testStorageRecords();

console.log('shopping cashier smoke test passed');
