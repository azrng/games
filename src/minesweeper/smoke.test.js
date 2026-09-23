const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = __dirname;

function read(file) {
    return fs.readFileSync(path.join(root, file), 'utf8');
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

    [
        'mines-text',
        'timer-text',
        'grid',
        'restart-btn',
        'mode-btn',
        'result-modal',
        'result-eyebrow',
        'result-title',
        'result-time',
        'result-best',
        'result-wins',
        'again-btn'
    ].forEach(createElement);

    const diffEasy = createElement('diff-easy');
    diffEasy.dataset.diff = 'easy';
    const diffMedium = createElement('diff-medium');
    diffMedium.dataset.diff = 'medium';
    const diffHard = createElement('diff-hard');
    diffHard.dataset.diff = 'hard';

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
            confirm() {
                return true;
            },
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
        Date,
        setTimeout() {
            return 1;
        },
        clearTimeout() {},
        setInterval() {
            return 1;
        },
        clearInterval() {}
    };
    context.window.window = context.window;
    context.window.document = document;

    vm.runInNewContext(read('script.js'), context);
    return { api: context.window.Minesweeper, storage };
}

function testFilesAndCatalogExist() {
    const html = read('index.html');
    assert(html.includes("../../js/game-back.js"), 'page should mount the shared back button script');
    const css = read('style.css');
    const script = read('script.js');
    const catalog = fs.readFileSync(path.join(root, '..', '..', 'data', 'games.js'), 'utf8');

    assert(html.includes('viewport-fit=cover'), 'mobile page should use viewport-fit=cover');
    assert(html.includes('user-scalable=no'), 'mobile page should disable viewport scaling');
    assert(html.includes('id="grid"'), 'page should render a mine grid host');
    assert(html.includes('id="mode-btn"'), 'page should include dig/flag mode switch');
    assert(css.includes('display: grid'), 'grid should use CSS Grid');
    assert(css.includes('overflow-x: auto'), 'dense boards should scroll horizontally instead of shrinking cells');
    assert(css.includes('position: sticky'), 'header should stay visible while the board scrolls');
    assert(script.includes('CELL_MIN_PX'), 'cells should keep a minimum touch target size');
    assert(script.includes('placeMines'), 'mines should be placed after first tap');
    assert(script.includes('pointerdown'), 'long press flagging should use pointer events');
    assert(catalog.includes('slug: "minesweeper"'), 'catalog should register minesweeper');
    assert(catalog.includes('mobilePath: "src/minesweeper/index.html"'), 'catalog should route mobile to minesweeper');
}

function testNeighbors() {
    const { api } = runScriptWithContext();

    assert.strictEqual(api.neighborsOf(0, 9, 9).length, 3, 'corner cell should have 3 neighbours');
    assert.strictEqual(api.neighborsOf(4, 9, 9).length, 5, 'edge cell should have 5 neighbours');
    assert.strictEqual(api.neighborsOf(40, 9, 9).length, 8, 'center cell should have 8 neighbours');
}

function testFirstClickSafety() {
    const { api } = runScriptWithContext();

    for (let trial = 0; trial < 20; trial += 1) {
        const safeIndex = 40;
        const mines = api.placeMines(9, 9, 10, safeIndex, Math.random);
        assert.strictEqual(mines.size, 10, 'should place the configured mine count');
        assert(!mines.has(safeIndex), 'first click cell must never be a mine');
        for (const neighbor of api.neighborsOf(safeIndex, 9, 9)) {
            assert(!mines.has(neighbor), 'first click neighbourhood must be mine free');
        }
    }
}

function testCountsAndFlood() {
    const { api } = runScriptWithContext();

    /* 3×3 固定雷区：仅左上角一颗雷 */
    const mines = new Set([0]);
    const counts = api.computeCounts(mines, 3, 3);
    /* vm 内创建的数组与测试进程的 Array 原型不同，需转为本地数组再比较 */
    assert.deepStrictEqual(Array.from(counts), [-1, 1, 0, 1, 1, 0, 0, 0, 0], 'counts should reflect adjacency');

    const revealed = new Array(9).fill(false);
    const flagged = new Array(9).fill(false);
    const opened = api.floodReveal(8, mines, counts, revealed, flagged, 3, 3);
    assert.strictEqual(opened.length, 8, 'flood from far corner should open every safe cell');
    assert(!revealed[0], 'mine cell must stay hidden');
}

function testFloodRespectsFlags() {
    const { api } = runScriptWithContext();

    const mines = new Set([0]);
    const counts = api.computeCounts(mines, 3, 3);
    const revealed = new Array(9).fill(false);
    const flagged = new Array(9).fill(false);
    flagged[4] = true;
    const opened = api.floodReveal(8, mines, counts, revealed, flagged, 3, 3);
    assert(!revealed[4], 'flagged cell should not be auto revealed');
    assert.strictEqual(opened.length, 7, 'flood should skip flagged cells');
}

function testTimeFormatAndRecords() {
    const { api, storage } = runScriptWithContext();

    assert.strictEqual(api.formatTime(0), '0:00');
    assert.strictEqual(api.formatTime(65), '1:05');
    assert.strictEqual(api.formatTime(600), '10:00');

    api.saveBest('easy', 90);
    api.saveBest('easy', 45);
    api.saveBest('easy', 120);
    assert.strictEqual(storage.get('minesweeper-best-easy'), '45', 'best time should keep the minimum');

    api.addWin('easy');
    api.addWin('easy');
    assert.strictEqual(storage.get('minesweeper-wins-easy'), '2', 'wins should accumulate');
}

testFilesAndCatalogExist();
testNeighbors();
testFirstClickSafety();
testCountsAndFlood();
testFloodRespectsFlags();
testTimeFormatAndRecords();

console.log('minesweeper smoke test passed');
