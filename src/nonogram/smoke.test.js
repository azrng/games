const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = __dirname;

function read(file) {
    return fs.readFileSync(path.join(root, file), 'utf8');
}

/* ---------- DOM/localStorage 最小桩 ---------- */

function createElement(tag) {
    const element = {
        tag,
        id: '',
        textContent: '',
        title: '',
        hidden: false,
        disabled: false,
        className: '',
        dataset: {},
        style: { setProperty() {} },
        children: [],
        handlers: {},
        classList: {
            add() {},
            remove() {},
            toggle() {}
        },
        addEventListener(name, handler) {
            element.handlers[name] = handler;
        },
        appendChild(child) {
            element.children.push(child);
            return child;
        },
        replaceChildren(...children) {
            element.children = children;
        },
        setAttribute(name) {
            element.attributes = element.attributes || {};
            return element.attributes[name];
        },
        removeAttribute() {}
    };
    return element;
}

function buildContext() {
    const storage = new Map();
    const elements = new Map();

    function getElementById(id) {
        if (!elements.has(id)) {
            const el = createElement('div');
            el.id = id;
            elements.set(id, el);
        }
        return elements.get(id);
    }

    const context = {
        window: {
            localStorage: {
                getItem: (key) => (storage.has(key) ? storage.get(key) : null),
                setItem: (key, value) => { storage.set(key, String(value)); },
                removeItem: (key) => { storage.delete(key); }
            },
            setInterval: () => 1,
            clearInterval: () => {},
            setTimeout: () => 1,
            clearTimeout: () => {},
            addEventListener() {}
        },
        document: {
            getElementById,
            createElement,
            addEventListener() {}
        },
        console,
        Math,
        Date,
        Number,
        String,
        JSON,
        Array,
        Object
    };
    context.window.window = context.window;
    vm.createContext(context);
    vm.runInNewContext(read('script.js'), context, { filename: 'script.js' });
    return { context, storage };
}

function json(value) {
    return JSON.stringify(value);
}

function testFilesAndCatalogExist() {
    const html = read('index.html');
    assert.ok(html.includes('../js/game-back.js'), 'index.html 应引入共享返回按钮');
    assert.ok(html.includes('viewport-fit=cover'), 'index.html 应含 viewport-fit=cover');
    assert.ok(html.includes('user-scalable=no'), 'index.html 应禁止缩放');
    const games = read('../data/games.js');
    assert.ok(games.includes('slug: "nonogram"'), 'games.js 应注册 nonogram');
    const app = read('../js/app.js');
    assert.ok(app.includes('"nonogram"'), 'app.js gameMeta 应含 nonogram');
    const css = read('style.css');
    assert.ok(css.includes('touch-action: manipulation'), 'style.css 应含触控优化样式');
}

function testLevelSizeMapping() {
    const { context } = buildContext();
    const NG = context.window.Nonogram;
    assert.strictEqual(NG.levelSize(1), 5, '第 1 关应为 5×5');
    assert.strictEqual(NG.levelSize(8), 5, '第 8 关应为 5×5');
    assert.strictEqual(NG.levelSize(9), 10, '第 9 关应为 10×10');
    assert.strictEqual(NG.levelSize(20), 10, '第 20 关应为 10×10');
    assert.strictEqual(NG.levelSize(21), 15, '第 21 关应为 15×15');
}

function testComputeClues() {
    const { context } = buildContext();
    const NG = context.window.Nonogram;
    assert.strictEqual(json(NG.computeClues([0, 1, 1, 0, 1])), json([2, 1]), '提示应为 [2,1]');
    assert.strictEqual(json(NG.computeClues([0, 0, 0])), json([0]), '空行提示应为 [0]');
    assert.strictEqual(json(NG.computeClues([1, 1, 1, 1, 1])), json([5]), '满行提示应为 [5]');
    assert.strictEqual(json(NG.computeClues([1, 0, 1, 0, 1])), json([1, 1, 1]), '提示应为 [1,1,1]');
}

function testSolveLine() {
    const { context } = buildContext();
    const NG = context.window.Nonogram;
    // 3 格线放 3：全部必填
    const full = NG.solveLine([3], [-1, -1, -1]);
    assert.strictEqual(json(full.fill), json([0, 1, 2]), '整线块应全填');
    // 5 格线放 [2]，已知中格为填：两种摆法交集无新必填，但尾部 3、4 格必空
    const mid = NG.solveLine([2], [-1, 1, -1, -1, -1]);
    assert.strictEqual(json(mid.fill), json([]), '两种摆法交集应无新必填');
    assert.strictEqual(json(mid.empty), json([3, 4]), '尾部剩余格应必空');
    // 矛盾：块长超过可用空间
    assert.strictEqual(NG.solveLine([3], [0, -1, -1]), null, '无合法摆放应返回 null');
    // 空提示：全部必空
    const blank = NG.solveLine([0], [-1, -1, -1]);
    assert.strictEqual(json(blank.empty), json([0, 1, 2]), '空提示应全标空');
}

function testGeneratedLevelsAreUniqueAndDeterministic() {
    const { context } = buildContext();
    const NG = context.window.Nonogram;
    for (let level = 1; level <= 10; level += 1) {
        const data = NG.generateLevel(level);
        assert.strictEqual(NG.solveUnique(data.solution), 'solved', '第 ' + level + ' 关底图应唯一解');
        // 提示组与底图自洽
        data.clues.rows.forEach((clue, r) => {
            assert.strictEqual(json(NG.computeClues(data.solution[r])), json(clue), '行提示应与底图一致');
        });
        for (let c = 0; c < data.size; c += 1) {
            const column = data.solution.map((row) => row[c]);
            assert.strictEqual(json(NG.computeClues(column)), json(data.clues.cols[c]), '列提示应与底图一致');
        }
    }
    // 同关两次生成完全一致（确定性）
    const a = NG.generateLevel(3);
    const b = NG.generateLevel(3);
    assert.strictEqual(json(a.solution), json(b.solution), '同关布局应可复现');
    assert.strictEqual(json(a.clues), json(b.clues), '同关提示应可复现');
}

function testCheckWin() {
    const { context } = buildContext();
    const NG = context.window.Nonogram;
    const data = NG.generateLevel(2);
    const size = data.size;
    // 按底图填充应判胜
    const winCells = data.solution.map((row) => row.map((v) => (v === 1 ? 1 : 0)));
    assert.strictEqual(NG.checkWin(winCells, data.clues), true, '按底图填充应判胜');
    // 全空应判负（题面必有非空行列）
    const emptyCells = Array.from({ length: size }, () => new Array(size).fill(0));
    assert.strictEqual(NG.checkWin(emptyCells, data.clues), false, '全空不应判胜');
    // 锁定格（提示揭示）同样计入填格
    const lockedCells = data.solution.map((row) => row.map((v) => (v === 1 ? 3 : 0)));
    assert.strictEqual(NG.checkWin(lockedCells, data.clues), true, '锁定填格应等价判胜');
}

function testStarFor() {
    const { context } = buildContext();
    const NG = context.window.Nonogram;
    assert.strictEqual(NG.starFor(1, 30000, 0), 3, '5×5 达标零提示应 3 星');
    assert.strictEqual(NG.starFor(1, 30001, 0), 2, '5×5 超时零提示应 2 星');
    assert.strictEqual(NG.starFor(1, 10000, 1), 1, '用过提示应 1 星');
    assert.strictEqual(NG.starFor(9, 150000, 0), 3, '10×10 达标零提示应 3 星');
    assert.strictEqual(NG.starFor(9, 150001, 0), 2, '10×10 超时零提示应 2 星');
    assert.strictEqual(NG.starFor(21, 420000, 0), 3, '15×15 达标零提示应 3 星');
}

function testPersistence() {
    const { context, storage } = buildContext();
    const NG = context.window.Nonogram;
    assert.strictEqual(NG.readUnlocked(), 1, '无存档解锁关应为 1');
    assert.strictEqual(NG.readBestMs(1), null, '无存档最快时间应为 null');
    assert.ok(NG.writeBestMs(1, 45000), '首次写入最快应成功');
    assert.strictEqual(NG.readBestMs(1), 45000, '读回应一致');
    assert.ok(!NG.writeBestMs(1, 60000), '更慢不应覆盖');
    assert.ok(NG.writeBestMs(1, 30000), '更快应覆盖');
    assert.strictEqual(storage.get('nonogram-best-1'), '30000', '存储键应为 nonogram-best-1');
    NG.writeStars(1, 2);
    NG.writeStars(1, 1);
    assert.strictEqual(NG.readStars(1), 2, '星级只增不减');
}

testFilesAndCatalogExist();
testLevelSizeMapping();
testComputeClues();
testSolveLine();
testGeneratedLevelsAreUniqueAndDeterministic();
testCheckWin();
testStarFor();
testPersistence();

/* 生成性能粗测：最大规格出题耗时应可忽略 */
const started = Date.now();
buildContext().context.window.Nonogram.generateLevel(21);
console.log('15×15 第 21 关生成耗时 ' + (Date.now() - started) + 'ms');
console.log('nonogram smoke test passed');
