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
    'goods-price',
    'change-line',
    'paid-text',
    'tray-chips',
    'feedback-text',
    'money-grid',
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

    assert(css.includes('--sc-'), 'css should use self-contained --sc- variables');
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
        'generateOrder',
        'orderDue',
        'computeChange',
        'evaluatePayment',
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
    assert(Array.isArray(api.ITEM_POOL) && api.ITEM_POOL.length >= 24, 'item pool should have at least 24 goods');
    assert.deepStrictEqual(toHost(api.ALL_DENOMINATIONS), [1, 5, 10, 20, 50, 100], 'all six RMB denominations should exist');
}

function testGenerateOrder() {
    const { api } = runScriptWithContext();

    for (let level = 1; level <= 12; level += 1) {
        const config = api.levelConfig(level);
        assert.deepStrictEqual(toHost(api.denominations(level)), toHost(config.denominations), 'denominations should mirror levelConfig');

        for (const seed of [1, 20261010, 987654321]) {
            const order = api.generateOrder(level, seed);
            const replay = api.generateOrder(level, seed);

            assert.deepStrictEqual(order, replay, `level ${level} seed ${seed} should reproduce the same order`);
            assert(order.item && typeof order.item.emoji === 'string' && order.item.name, 'order should carry an emoji item');
            assert(Number.isInteger(order.price), `level ${level} price should be an integer`);
            assert(
                order.price >= config.priceMin && order.price <= config.priceMax,
                `level ${level} price ${order.price} should stay inside [${config.priceMin}, ${config.priceMax}]`
            );

            if (config.mode === 'change') {
                assert.strictEqual(order.paid, config.paid, `level ${level} customer should pay the fixed round note`);
                assert(order.paid > order.price, `level ${level} customer should overpay so the change is positive`);
                const change = api.computeChange(order.paid, order.price);
                assert(change >= 1, `level ${level} change should be at least 1 yuan`);
                const breakdown = api.greedyBreakdown(change, api.denominations(level));
                assert(breakdown !== null, `level ${level} change ${change} should be payable with open denominations`);
                const reassembled = breakdown.reduce((sum, part) => sum + part.value * part.count, 0);
                assert.strictEqual(reassembled, change, `level ${level} greedy breakdown should reassemble the change`);
            } else {
                assert.strictEqual(order.paid, undefined, `level ${level} exact mode should not carry a paid note`);
            }
        }
    }
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

    assert.deepStrictEqual(
        toHost(api.coinCountSummary([1, 5, 5, 1])),
        [{ value: 5, count: 2 }, { value: 1, count: 2 }],
        'coin summary should count by denomination in descending order'
    );
    assert.deepStrictEqual(toHost(api.coinCountSummary([])), [], 'empty tray should summarize to an empty list');

    assert.strictEqual(api.orderDue({ price: 12 }), 12, 'exact order due should be the price');
    assert.strictEqual(api.orderDue({ price: 12, paid: 50 }), 38, 'change order due should be the change amount');

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
    assert.strictEqual(api.starRating(2), 2, 'two mistakes should earn two stars');
    assert.strictEqual(api.starRating(3), 1, 'three mistakes should earn one star');
    assert.strictEqual(api.starRating(9), 1, 'many mistakes should still earn one star');

    assert.strictEqual(api.levelConfig(1).mode, 'exact', 'level 1 should be exact payment');
    assert.strictEqual(api.levelConfig(4).priceMax, 10, 'levels 1-4 should cap prices at 10');
    assert.deepStrictEqual(toHost(api.denominations(1)), [1, 5], 'levels 1-4 should only open 1 and 5');

    assert.strictEqual(api.levelConfig(5).priceMax, 50, 'levels 5-8 should cap prices at 50');
    assert.deepStrictEqual(toHost(api.denominations(5)), [1, 5, 10, 20, 50], 'levels 5-8 should open notes up to 50');
    assert.strictEqual(api.levelConfig(8).mode, 'exact', 'level 8 should still be exact payment');

    assert.strictEqual(api.levelConfig(9).mode, 'change', 'level 9 should start change mode');
    assert.strictEqual(api.levelConfig(9).paid, 50, 'levels 9-10 customer should pay 50');
    assert.strictEqual(api.levelConfig(10).priceMax, 20, 'levels 9-10 should cap prices at 20');
    assert.deepStrictEqual(toHost(api.denominations(9)), [1, 5, 10, 20], 'levels 9-10 should open notes up to 20');

    assert.strictEqual(api.levelConfig(11).paid, 100, 'levels 11-12 customer should pay 100');
    assert.strictEqual(api.levelConfig(12).mode, 'change', 'level 12 should be change mode');
    assert.strictEqual(api.levelConfig(12).priceMax, 99, 'levels 11-12 should cap prices at 99 to keep change positive');
    assert.deepStrictEqual(toHost(api.denominations(11)), [1, 5, 10, 20, 50], 'levels 11-12 should open notes up to 50');

    assert(
        api.levelConfig(2).priceMin > api.levelConfig(1).priceMin,
        'exact tier prices should ramp up inside levels 1-4'
    );
    assert(
        api.levelConfig(6).priceMin > api.levelConfig(5).priceMin,
        'exact tier prices should ramp up inside levels 5-8'
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
