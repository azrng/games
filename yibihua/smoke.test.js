const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = __dirname;

function read(file) {
    return fs.readFileSync(path.join(root, file), 'utf8');
}

function runScriptWithContext(initialStorage = {}) {
    const storage = new Map(Object.entries(initialStorage));
    const elements = new Map();

    function createClassList() {
        const classes = new Set();
        return {
            add(...names) { names.forEach((name) => classes.add(name)); },
            remove(...names) { names.forEach((name) => classes.delete(name)); },
            contains(name) { return classes.has(name); }
        };
    }

    function matchesSelector(element, selector) {
        const classMatch = selector.match(/^\.([a-z0-9-]+)(?:\[data-key="([^"]+)"\])?$/i);
        if (classMatch) {
            const [, className, key] = classMatch;
            return element.classList.contains(className) &&
                (key === undefined || element.dataset.key === key);
        }
        return false;
    }

    function collectMatches(element, selector, result) {
        if (matchesSelector(element, selector)) result.push(element);
        for (const child of element.children) collectMatches(child, selector, result);
    }

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
            listeners: {},
            classList: createClassList(),
            addEventListener(type, handler) {
                if (!this.listeners[type]) this.listeners[type] = [];
                this.listeners[type].push(handler);
            },
            removeEventListener(type, handler) {
                this.listeners[type] = (this.listeners[type] || [])
                    .filter((item) => item !== handler);
            },
            dispatch(type, target = this) {
                for (const handler of this.listeners[type] || []) handler({ target });
            },
            querySelectorAll(selector) {
                const result = [];
                collectMatches(this, selector, result);
                return result;
            },
            querySelector(selector) { return this.querySelectorAll(selector)[0] || null; },
            setAttribute(name, value) { this[name] = String(value); },
            removeAttribute(name) { delete this[name]; },
            appendChild(child) {
                child.parentNode = this;
                this.children.push(child);
                return child;
            },
            focus() {},
            closest(selector) {
                let cur = this;
                while (cur) {
                    if (matchesSelector(cur, selector)) return cur;
                    cur = cur.parentNode;
                }
                return null;
            }
        };
        Object.defineProperty(element, 'innerHTML', {
            get() { return this._innerHTML || ''; },
            set(value) {
                this._innerHTML = String(value);
                if (value === '') this.children = [];
            }
        });
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
        el.dataset = {};
        return el;
    }

    const boardEl = elements.get('board');
    if (boardEl) {
        boardEl.innerHTML = '';
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
        clearInterval() {},
        setTimeout(fn) { fn(); return 1; }
    };
    context.window.window = context.window;
    context.window.document = document;

    vm.runInNewContext(read('script.js'), context);
    return { api: context.window.YibiHua, storage, elements };
}

function clickNode(elements, nodeId) {
    const hit = elements.get('board').querySelectorAll('.node-hit')
        .find((node) => node.dataset.id === String(nodeId));
    assert(hit, `node ${nodeId} hit area should exist`);
    hit.dispatch('click');
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

function testHintKeepsCurrentValidPath() {
    const { elements } = runScriptWithContext({ 'yibihua-max-unlocked': '6' });

    clickNode(elements, 4);
    elements.get('hint-btn').dispatch('click');
    clickNode(elements, 5);

    const continuedEdge = elements.get('board').querySelector('.edge-line[data-key="4-5"]');
    assert(continuedEdge.classList.contains('is-drawn'),
        'hint should not reset a valid player path away from current node');
    assert.strictEqual(elements.get('steps-text').textContent, '2',
        'continuing after hint should count the next valid step');
}

function testLevelsModalDoesNotAccumulateClickHandlers() {
    const { elements } = runScriptWithContext();

    elements.get('levels-btn').dispatch('click');
    elements.get('levels-close-btn').dispatch('click');
    elements.get('levels-btn').dispatch('click');
    elements.get('levels-close-btn').dispatch('click');
    elements.get('levels-btn').dispatch('click');

    const clickHandlers = elements.get('levels-grid').listeners.click || [];
    assert.strictEqual(clickHandlers.length, 1,
        'levels grid should keep a single click handler after repeated opens');
}

testFilesAndCatalogExist();
testLevelConfig();
testGetConfigForLevel();
testLevelGeneration();
testStars();
testStorage();
testHintKeepsCurrentValidPath();
testLevelsModalDoesNotAccumulateClickHandlers();

console.log('yibihua smoke test passed');
