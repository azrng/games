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
        'level-text',
        'steps-text',
        'min-steps-text',
        'best-text',
        'grid',
        'restart-btn',
        'levels-btn',
        'win-modal',
        'result-stars',
        'result-steps',
        'result-min',
        'result-best',
        'replay-btn',
        'next-btn',
        'level-modal',
        'level-grid',
        'close-levels-btn'
    ].forEach(createElement);

    const document = {
        createElement(tag) {
            return createElement(`${tag}-${elements.size}`);
        },
        createElementNS(_ns, tag) {
            return createElement(`svg-${tag}-${elements.size}`);
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
    return { api: context.window.Pipes, storage };
}

function testFilesAndCatalogExist() {
    const html = read('index.html');
    const css = read('style.css');
    const script = read('script.js');
    const catalog = fs.readFileSync(path.join(root, '..', 'data', 'games.js'), 'utf8');

    assert(html.includes('viewport-fit=cover'), 'mobile page should use viewport-fit=cover');
    assert(html.includes('user-scalable=no'), 'mobile page should disable viewport scaling');
    assert(html.includes('id="grid"'), 'page should render a pipe grid host');
    assert(css.includes('display: grid'), 'grid should use CSS Grid');
    assert(script.includes('generateTree'), 'game should generate spanning tree levels');
    assert(catalog.includes('slug: "pipes"'), 'catalog should register pipes');
    assert(catalog.includes('mobilePath: "pipes/index.html"'), 'catalog should route mobile to pipes');
}

function testRotateMask() {
    const { api } = runScriptWithContext();

    assert.strictEqual(api.rotateMask(1), 2, 'up should rotate to right');
    assert.strictEqual(api.rotateMask(2), 4, 'right should rotate to down');
    assert.strictEqual(api.rotateMask(8), 1, 'left should rotate to up');
    assert.strictEqual(api.rotateMask(5, 2), 5, 'straight pipe has period 2');
    assert.strictEqual(api.rotateMask(15, 1), 15, 'cross pipe is rotation invariant');
    assert.strictEqual(api.rotateMask(3, 4), 3, 'four rotations return original mask');
}

function testGeneratedTreeIsSolvedAndConnected() {
    const { api } = runScriptWithContext();

    for (let size = 3; size <= 7; size += 1) {
        const random = api.createSeededRandom(1234 + size);
        const tree = api.generateTree(size, random);
        const total = size * size;
        let edgeEnds = 0;

        for (let index = 0; index < total; index += 1) {
            assert(tree.masks[index] > 0, 'every cell should carry at least one connection');
            for (const dir of api.DIRS) {
                if ((tree.masks[index] & dir.bit) === 0) continue;
                edgeEnds += 1;
                const cx = index % size;
                const cy = Math.floor(index / size);
                const nx = cx + dir.dx;
                const ny = cy + dir.dy;
                assert(nx >= 0 && ny >= 0 && nx < size && ny < size, 'connections must stay inside board');
                assert((tree.masks[ny * size + nx] & dir.opposite) !== 0, 'connections must be mutual');
            }
        }

        assert.strictEqual(edgeEnds, (total - 1) * 2, 'spanning tree should have exactly n-1 edges');
        assert(api.isSolved(tree.masks, size), 'generated tree should already satisfy win condition');
        assert.strictEqual(api.computeConnected(tree.masks, size, tree.source).size, total, 'all cells reachable from source');
    }
}

function testScrambleIsSolvable() {
    const { api } = runScriptWithContext();

    for (let level = 1; level <= 12; level += 1) {
        const size = api.levelConfig(level).size;
        const random = api.createSeededRandom(api.levelSeed(level));
        const tree = api.generateTree(size, random);
        const cells = api.scrambleBoard(tree.masks, size, random);

        assert(!api.isSolved(cells, size), 'scrambled board should not start solved');
        const minSteps = api.minimalStepsForBoard(cells, tree.masks);
        assert(minSteps >= 1, 'scrambled board should need at least one rotation');

        const restored = cells.map((mask, index) => api.rotateMask(mask, api.minimalCellSteps(mask, tree.masks[index])));
        assert(api.isSolved(restored, size), 'applying minimal rotations should solve the board');
    }
}

function testStarRating() {
    const { api } = runScriptWithContext();

    assert.strictEqual(api.starRating(10, 10), 3);
    assert.strictEqual(api.starRating(16, 10), 2);
    assert.strictEqual(api.starRating(17, 10), 1);
}

function testStoragePrefixAndRecords() {
    const { api, storage } = runScriptWithContext();

    api.saveBest(3, 25);
    api.saveBest(3, 18);
    api.saveBest(3, 40);
    assert.strictEqual(storage.get('pipes-best-3'), '18', 'best steps should keep the minimum');
    assert.strictEqual(api.loadBest(3), 18);

    api.saveUnlockedLevel(5);
    api.saveUnlockedLevel(2);
    assert.strictEqual(storage.get('pipes-unlocked-level'), '5', 'unlock level should never regress');
}

testFilesAndCatalogExist();
testRotateMask();
testGeneratedTreeIsSolvedAndConnected();
testScrambleIsSolvable();
testStarRating();
testStoragePrefixAndRecords();

console.log('pipes smoke test passed');
