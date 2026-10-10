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
        'level-text',
        'steps-text',
        'min-steps-text',
        'best-text',
        'grid',
        'restart-btn',
        'hint-btn',
        'hint-count',
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
    return { api: context.window.LightsOut, storage };
}

function testFilesAndCatalogExist() {
    const html = read('index.html');
    assert(html.includes("../js/game-back.js"), 'page should mount the shared back button script');
    const css = read('style.css');
    const script = read('script.js');
    const catalog = fs.readFileSync(path.join(root, '..', 'data', 'games.js'), 'utf8');

    assert(html.includes('viewport-fit=cover'), 'mobile page should use viewport-fit=cover');
    assert(html.includes('user-scalable=no'), 'mobile page should disable viewport scaling');
    assert(html.includes('id="grid"'), 'page should render a light grid host');
    assert(html.includes('id="hint-btn"'), 'page should include hint control');
    assert(css.includes('display: grid'), 'grid should use CSS Grid');
    assert(script.includes('generateLevel'), 'game should generate levels from reverse presses');
    assert(catalog.includes('slug: "lights-out"'), 'catalog should register lights-out');
    assert(catalog.includes('mobilePath: "src/lights-out/index.html"'), 'catalog should route mobile to lights-out');
}

function testToggleBehaviour() {
    const { api } = runScriptWithContext();
    const size = 3;
    const dark = new Array(size * size).fill(false);

    const once = api.toggleAt(dark, size, 4);
    assert.deepStrictEqual(
        once,
        [false, true, false, true, true, true, false, true, false],
        'pressing the center should flip a plus shape'
    );

    const corner = api.toggleAt(dark, size, 0);
    assert.deepStrictEqual(
        corner,
        [true, true, false, true, false, false, false, false, false],
        'corner press should only flip in-board neighbours'
    );

    const twice = api.toggleAt(once, size, 4);
    assert.deepStrictEqual(twice, dark, 'pressing the same cell twice should be identity');
}

function testGeneratedLevelsAreSolvable() {
    const { api } = runScriptWithContext();

    for (let level = 1; level <= 15; level += 1) {
        const config = api.levelConfig(level);
        const random = api.createSeededRandom(api.levelSeed(level));
        const generated = api.generateLevel(config.size, config.presses, random);

        assert(!api.isAllLit(generated.board), 'generated board should not start solved');
        /* 兜底路径可能追加一次按压，因此允许等于或多一 */
        assert(
            generated.scrambleSet.length === config.presses || generated.scrambleSet.length === config.presses + 1,
            'scramble set size should match config (or +1 via fallback)'
        );
        assert.strictEqual(new Set(generated.scrambleSet).size, generated.scrambleSet.length, 'scramble cells should be distinct');

        let board = generated.board;
        for (const index of generated.scrambleSet) {
            board = api.toggleAt(board, config.size, index);
        }
        assert(api.isAllLit(board), 'pressing the scramble set should light everything');
    }
}

function testLevelProgression() {
    const { api } = runScriptWithContext();

    assert.strictEqual(api.levelConfig(1).size, 3);
    assert.strictEqual(api.levelConfig(5).size, 4);
    assert.strictEqual(api.levelConfig(10).size, 5);
    assert(api.levelConfig(2).presses > api.levelConfig(1).presses, 'presses should grow with level');
    assert(api.levelConfig(30).presses <= 24, 'presses should stay below cell count');
}

function testStarRatingAndRecords() {
    const { api, storage } = runScriptWithContext();

    assert.strictEqual(api.starRating(5, 5), 3);
    assert.strictEqual(api.starRating(8, 5), 2);
    assert.strictEqual(api.starRating(9, 5), 1);

    api.saveBest(2, 12);
    api.saveBest(2, 9);
    api.saveBest(2, 20);
    assert.strictEqual(storage.get('lights-out-best-2'), '9', 'best steps should keep the minimum');

    api.saveUnlockedLevel(4);
    api.saveUnlockedLevel(3);
    assert.strictEqual(storage.get('lights-out-unlocked-level'), '4', 'unlock level should never regress');
}

/* 统计位掩码中 1 的个数 */
function popcount(mask) {
    let count = 0;
    while (mask) {
        mask &= mask - 1;
        count += 1;
    }
    return count;
}

/* 把掩码表示的按压集合施加到棋盘上 */
function applyPressMask(api, board, size, mask) {
    const total = size * size;
    let next = board.slice();
    for (let index = 0; index < total; index += 1) {
        if ((mask >>> index) & 1) next = api.toggleAt(next, size, index);
    }
    return next;
}

/* 局面对应的暗格掩码（求解方程 A·x = 暗格掩码） */
function darkMaskOf(board) {
    let mask = 0;
    for (let index = 0; index < board.length; index += 1) {
        if (!board[index]) mask |= 1 << index;
    }
    return mask;
}

/* 覆盖 1~60 关（超过 40 个种子关卡，含 3×3/4×4/5×5 三种尺寸）：
   最小解按完必全灭，且解的大小不超过生成时的打乱按压数 */
function testGf2SolverOnSeededLevels() {
    const { api } = runScriptWithContext();

    for (let level = 1; level <= 60; level += 1) {
        const config = api.levelConfig(level);
        const random = api.createSeededRandom(api.levelSeed(level));
        const generated = api.generateLevel(config.size, config.presses, random);
        const solution = api.solveBoard(generated.board, config.size);

        assert(
            solution.length <= generated.scrambleSet.length,
            `level ${level}: solver should not need more presses than generation (${solution.length} > ${generated.scrambleSet.length})`
        );

        let board = generated.board;
        for (const index of solution) {
            board = api.toggleAt(board, config.size, index);
        }
        assert(api.isAllLit(board), `level ${level}: applying the minimum solution should light every cell`);
    }
}

/* 5×5 抽样核空间性质：核基为静默按压；特解 XOR 任一核基组合仍可解出；
   solveBoard 的解在特解 + 核空间构成的完整解空间里重量最小 */
function testGf2KernelProperties() {
    const { api } = runScriptWithContext();

    /* 实测核维数：3×3 满秩、4×4 核 4 维、5×5 核 2 维 */
    assert.strictEqual(api.solveGf2(api.buildPressMatrix(3), 0).kernel.length, 0, '3x3 matrix should be full rank');
    assert.strictEqual(api.solveGf2(api.buildPressMatrix(4), 0).kernel.length, 4, '4x4 kernel should be 4-dimensional');
    assert.strictEqual(api.solveGf2(api.buildPressMatrix(5), 0).kernel.length, 2, '5x5 kernel should be 2-dimensional');

    const darkBoard = new Array(25).fill(false);
    for (const basis of api.solveGf2(api.buildPressMatrix(5), 0).kernel) {
        assert.deepStrictEqual(
            applyPressMask(api, darkBoard, 5, basis),
            darkBoard,
            'kernel basis should be a quiet pattern'
        );
    }

    for (let level = 10; level <= 30; level += 2) {
        const config = api.levelConfig(level);
        const random = api.createSeededRandom(api.levelSeed(level));
        const generated = api.generateLevel(config.size, config.presses, random);
        const detail = api.solveGf2(api.buildPressMatrix(config.size), darkMaskOf(generated.board));
        assert(detail !== null, `level ${level}: seeded board should be solvable`);

        const weights = [];
        for (let combo = 0; combo < (1 << detail.kernel.length); combo += 1) {
            let mask = detail.solution;
            for (let k = 0; k < detail.kernel.length; k += 1) {
                if ((combo >>> k) & 1) mask ^= detail.kernel[k];
            }
            assert(
                api.isAllLit(applyPressMask(api, generated.board, config.size, mask)),
                `level ${level}: solution XOR kernel combo should still light every cell`
            );
            weights.push(popcount(mask));
        }
        assert.strictEqual(
            api.solveBoard(generated.board, config.size).length,
            Math.min(...weights),
            `level ${level}: solveBoard should pick the minimum weight in the whole solution space`
        );
    }
}

/* 小棋盘暴力对拍：3×3 穷举全部局面，4×4 固定种子抽样局面，最小步数须与暴力一致 */
function testGf2SolverMatchesBruteForce() {
    const { api } = runScriptWithContext();

    function bruteForceMinPresses(size, target) {
        const total = size * size;
        const rows = api.buildPressMatrix(size);
        let best = Infinity;
        for (let x = 0; x < (1 << total); x += 1) {
            let acc = 0;
            for (let index = 0; index < total; index += 1) {
                if ((x >>> index) & 1) acc ^= rows[index];
            }
            if (acc === target) {
                const weight = popcount(x);
                if (weight < best) best = weight;
            }
        }
        return best;
    }

    /* 3×3：矩阵满秩，2^9 个按压向量覆盖全部局面，逐一比对 */
    for (let x = 0; x < (1 << 9); x += 1) {
        const board = applyPressMask(api, new Array(9).fill(false), 3, x);
        assert.strictEqual(
            api.solveBoard(board, 3).length,
            bruteForceMinPresses(3, darkMaskOf(board)),
            `3x3 board from press mask ${x} should match brute force minimum`
        );
    }

    /* 4×4：固定种子保证可复现，随机抽 6 个局面比对 */
    const random = api.createSeededRandom(424242);
    for (let sample = 0; sample < 6; sample += 1) {
        let mask = 0;
        for (let index = 0; index < 16; index += 1) {
            if (random() < 0.5) mask |= 1 << index;
        }
        const board = applyPressMask(api, new Array(16).fill(true), 4, mask);
        assert.strictEqual(
            api.solveBoard(board, 4).length,
            bruteForceMinPresses(4, darkMaskOf(board)),
            `4x4 sampled board ${sample} should match brute force minimum`
        );
    }
}

testFilesAndCatalogExist();
testToggleBehaviour();
testGeneratedLevelsAreSolvable();
testLevelProgression();
testStarRatingAndRecords();
testGf2SolverOnSeededLevels();
testGf2KernelProperties();
testGf2SolverMatchesBruteForce();

console.log('lights out smoke test passed');
