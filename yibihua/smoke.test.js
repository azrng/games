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
            innerHTML: '',
            hidden: false,
            dataset: {},
            style: {},
            className: '',
            classList: {
                add() {},
                remove() {},
                toggle() {}
            },
            addEventListener() {},
            querySelectorAll() { return []; },
            querySelector() { return null; },
            setAttribute() {},
            removeAttribute() {}
        };
        elements.set(id, element);
        return element;
    }

    [
        'level-text', 'stars-text', 'steps-text', 'hints-text',
        'board', 'undo-btn', 'hint-btn', 'levels-btn', 'reset-btn',
        'result-modal', 'result-level', 'result-steps', 'result-time',
        'result-hints', 'result-stars', 'next-btn', 'replay-btn',
        'levels-modal', 'levels-grid', 'levels-close-btn'
    ].forEach(createElement);

    function makeSvgEl(tag) {
        const el = createElement(`svg-${tag}-${elements.size}`);
        el.classList = {
            add() {},
            remove() {},
            contains() { return false; }
        };
        el.appendChild = function(child) { this._children = this._children || []; this._children.push(child); };
        el.setAttribute = function() {};
        el.addEventListener = function() {};
        el.dataset = {};
        return el;
    }

    const boardEl = elements.get('board');
    if (boardEl) {
        boardEl.innerHTML = '';
        boardEl.appendChild = function(child) { this._children = []; this._children.push(child); };
        boardEl.querySelectorAll = function() { return []; };
        boardEl.querySelector = function() { return null; };
    }

    const document = {
        createElement(tag) { return createElement(`${tag}-${elements.size}`); },
        createElementNS(ns, tag) { return makeSvgEl(tag); },
        getElementById(id) { return elements.get(id) || null; },
        addEventListener() {}
    };

    const context = {
        window: {
            innerWidth: 390,
            localStorage: {
                getItem(key) { return storage.has(key) ? storage.get(key) : null; },
                setItem(key, value) { storage.set(key, String(value)); },
                removeItem(key) { storage.delete(key); }
            }
        },
        document,
        Math,
        Date,
        JSON,
        setInterval() { return 1; },
        clearInterval() {}
    };
    context.window.window = context.window;
    context.window.document = document;

    vm.runInNewContext(read('script.js'), context);
    return { api: context.window.YibiHua, storage, elements };
}

/* ---- tests ---- */

function testFilesAndCatalogExist() {
    const html = read('index.html');
    const css = read('style.css');
    const script = read('script.js');
    const catalog = fs.readFileSync(path.join(root, '..', 'data', 'games.js'), 'utf8');

    assert(html.includes('viewport-fit=cover'), 'mobile page should use viewport-fit=cover');
    assert(html.includes('user-scalable=no'), 'mobile page should disable viewport scaling');
    assert(html.includes('id="board"'), 'page should have SVG board');
    assert(css.includes('--yd-'), 'css should use --yd- variable prefix');
    assert(script.includes('findEulerPath'), 'script should expose findEulerPath');
    assert(catalog.includes('slug: "yibihua"'), 'catalog should register yibihua');
    assert(catalog.includes('mobilePath: "yibihua/index.html"'), 'catalog should route to yibihua');
}

function testLevelConfig() {
    const { api } = runScriptWithContext();

    assert.strictEqual(api.LEVEL_CONFIG.length, 6);
    assert.strictEqual(api.LEVEL_CONFIG[0].cols, 2);
    assert.strictEqual(api.LEVEL_CONFIG[0].rows, 2);
    assert.strictEqual(api.LEVEL_CONFIG[5].cols, 4);
    assert.strictEqual(api.LEVEL_CONFIG[5].rows, 5);
    assert.strictEqual(api.TOTAL_LEVELS, 50);
}

function testGetConfigForLevel() {
    const { api } = runScriptWithContext();

    const c1 = api.getConfigForLevel(1);
    assert.strictEqual(c1.cols, 2);
    assert.strictEqual(c1.rows, 2);

    const c10 = api.getConfigForLevel(10);
    assert.strictEqual(c10.cols, 2);
    assert.strictEqual(c10.rows, 3);

    const c25 = api.getConfigForLevel(25);
    assert.strictEqual(c25.cols, 3);
    assert.strictEqual(c25.rows, 4);

    const c50 = api.getConfigForLevel(50);
    assert.strictEqual(c50.cols, 4);
    assert.strictEqual(c50.rows, 5);
}

function testLevelGeneration() {
    const { api } = runScriptWithContext();

    for (let lv = 1; lv <= 50; lv++) {
        const level = api.generateLevel(lv);

        assert(level.nodes.length > 0, `level ${lv} should have nodes`);
        assert(level.edges.length > 0, `level ${lv} should have edges`);
        assert(level.eulerPath.length > 0, `level ${lv} should have euler path`);
        assert(level.startNode >= 0, `level ${lv} should have valid start node`);

        const pathEdgeKeys = new Set();
        for (let i = 0; i < level.eulerPath.length - 1; i++) {
            pathEdgeKeys.add(api.edgeKey(level.eulerPath[i], level.eulerPath[i + 1]));
        }
        assert.strictEqual(pathEdgeKeys.size, level.totalEdges,
            `level ${lv} euler path should cover all ${level.totalEdges} edges, got ${pathEdgeKeys.size}`);
    }
}

function testStars() {
    const { api } = runScriptWithContext();

    assert.strictEqual(api.calculateStars(10, 10, 0), 3, 'perfect no hints = 3 stars');
    assert.strictEqual(api.calculateStars(10, 10, 1), 2, 'perfect with hint = 2 stars');
    assert.strictEqual(api.calculateStars(10, 11, 0), 2, 'near perfect no hints = 2 stars (0.91 < 0.95)');
    assert.strictEqual(api.calculateStars(10, 12, 0), 2, '83% efficiency = 2 stars');
    assert.strictEqual(api.calculateStars(10, 12, 1), 2, '83% efficiency 1 hint = 2 stars');
    assert.strictEqual(api.calculateStars(10, 15, 2), 1, 'low efficiency = 1 star');
    assert.strictEqual(api.calculateStars(10, 20, 0), 1, 'very low efficiency = 1 star');
}

function testStorage() {
    const { api, storage } = runScriptWithContext();

    assert.strictEqual(api.getMaxUnlocked(), 1, 'default max unlocked = 1');

    api.saveLevelRecord(3, { stars: 2, steps: 10, hints: 1, seconds: 15 });
    const rec = api.getLevelRecord(3);
    assert.strictEqual(rec.stars, 2);
    assert.strictEqual(rec.steps, 10);
    assert.strictEqual(rec.hints, 1);

    const parsed = JSON.parse(storage.get('yibihua-level-3'));
    assert.strictEqual(parsed.stars, 2);
}

testFilesAndCatalogExist();
testLevelConfig();
testGetConfigForLevel();
testLevelGeneration();
testStars();
testStorage();

console.log('yibihua smoke test passed');
