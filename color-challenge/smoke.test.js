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
    const listeners = {};
    const elements = new Map();

    function createElement(id) {
        const element = {
            id,
            textContent: '',
            hidden: false,
            dataset: {},
            style: {},
            className: '',
            classList: {
                add() {},
                remove() {},
                toggle() {}
            },
            addEventListener(type, handler) {
                listeners[`${id}:${type}`] = handler;
            },
            appendChild() {},
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
        'round-text',
        'score-text',
        'best-score',
        'best-rounds',
        'timer-text',
        'grid',
        'result-modal',
        'result-score',
        'result-rounds',
        'result-best-score',
        'result-best-rounds',
        'restart-btn'
    ].forEach(createElement);

    const document = {
        createElement(tag) {
            return createElement(`${tag}-${elements.size}`);
        },
        getElementById(id) {
            return elements.get(id) || null;
        },
        addEventListener() {}
    };

    const context = {
        window: {
            innerWidth: 390,
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
        setInterval() {
            return 1;
        },
        clearInterval() {}
    };
    context.window.window = context.window;
    context.window.document = document;

    vm.runInNewContext(read('script.js'), context);
    return { api: context.window.ColorChallenge, storage };
}

function testFilesAndCatalogExist() {
    const html = read('index.html');
    const css = read('style.css');
    const script = read('script.js');
    const catalog = fs.readFileSync(path.join(root, '..', 'data', 'games.js'), 'utf8');

    assert(html.includes('viewport-fit=cover'), 'mobile page should use viewport-fit=cover');
    assert(html.includes('user-scalable=no'), 'mobile page should disable viewport scaling');
    assert(html.includes('id="grid"'), 'page should render a color grid host');
    assert(css.includes('display: grid'), 'grid should use CSS Grid');
    assert(!script.includes('<canvas'), 'game should not depend on Canvas');
    assert(catalog.includes('slug: "color-challenge"'), 'catalog should register color challenge');
    assert(catalog.includes('mobilePath: "color-challenge/index.html"'), 'catalog should route mobile to color challenge');
}

function testRoundConfigAndColorDelta() {
    const { api } = runScriptWithContext();

    assert.strictEqual(api.getGridSize(1), 2);
    assert.strictEqual(api.getGridSize(6), 3);
    assert.strictEqual(api.getGridSize(11), 4);
    assert.strictEqual(api.getGridSize(21), 5);
    assert.strictEqual(api.getGridSize(31), 6);
    assert(api.getColorDelta(1) > api.getColorDelta(31), 'color delta should shrink as rounds increase');
    assert(api.getColorDelta(80) >= api.MIN_COLOR_DELTA, 'color delta should keep a visible lower bound');
}

function testStoragePrefixAndRecords() {
    const { api, storage } = runScriptWithContext();
    api.saveRecords({ score: 7, rounds: 8 });

    assert.strictEqual(storage.get('color-challenge-high-score'), '7');
    assert.strictEqual(storage.get('color-challenge-best-rounds'), '8');
    const records = api.loadRecords();
    assert.strictEqual(records.highScore, 7);
    assert.strictEqual(records.bestRounds, 8);
}

testFilesAndCatalogExist();
testRoundConfigAndColorDelta();
testStoragePrefixAndRecords();

console.log('color challenge smoke test passed');
