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
        'progress-text',
        'correct-text',
        'mode-chip',
        'scales-area',
        'question-prompt',
        'feedback-text',
        'options-grid',
        'answer-burst',
        'restart-btn',
        'levels-btn',
        'win-modal',
        'result-stars',
        'result-correct',
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
        createElementNS(namespace, tag) {
            return createElement(`${tag}-ns-${elements.size}`);
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
    return { api: context.window.BalanceApi, storage };
}

/* (a) 文件与目录约定：页面元信息、共享返回脚本、自包含样式、目录注册 */
function testFilesAndCatalogExist() {
    const html = read('index.html');
    assert(html.includes('viewport-fit=cover'), 'mobile page should use viewport-fit=cover');
    assert(html.includes('user-scalable=no'), 'mobile page should disable viewport scaling');
    assert(html.includes("../js/game-back.js"), 'page should mount the shared back button script');
    assert(html.includes('<title>天平称重 - 游戏平台</title>'), 'page title should follow hub convention');
    assert(html.includes('id="scales-area"'), 'page should host the scales area');
    assert(
        html.indexOf('"script.js"') !== -1 && html.indexOf('"script.js"') < html.indexOf('"../js/game-back.js"'),
        'script.js should be loaded before the shared back button script'
    );

    const css = read('style.css');
    assert(css.includes('--bs-'), 'style should use the self-contained --bs- variable prefix');
    assert(css.includes('padding-top: calc(max(16px, env(safe-area-inset-top)) + 44px)'), 'header should avoid the floating back button');

    const script = read('script.js');
    assert(script.includes('generateEquation'), 'script should expose puzzle generation');
    assert(script.includes('solveEquation'), 'script should expose the substitution solver');
    assert(script.includes('windowObject.BalanceApi'), 'script should expose window.BalanceApi');

    const catalog = fs.readFileSync(path.join(root, '..', 'data', 'games.js'), 'utf8');
    assert(catalog.includes('slug: "balance-scale"'), 'catalog should register balance-scale');
    assert(catalog.includes('mobilePath: "src/balance-scale/index.html"'), 'catalog should route mobile to balance-scale');
}

/* (b) 12 关 × 多种子：结构与档位一致、answer 为正整数 ≤30 且与代换推导一致、选项互异含正确项、同种子可复现 */
function testGenerateEquationAcrossLevels() {
    const { api } = runScriptWithContext();

    for (let level = 1; level <= api.levelCount(); level += 1) {
        const config = api.levelConfig(level);
        const expectedEquations = config.tier === 1 ? 1 : config.tier === 4 ? 3 : 2;

        for (let index = 0; index < 8; index += 1) {
            const seed = api.questionSeed(level, index);
            const question = api.generateEquation(level, seed);
            const replay = api.generateEquation(level, seed);
            assert.deepStrictEqual(question, replay, `level ${level} seed ${index}: same seed should reproduce the same puzzle`);

            assert.strictEqual(
                question.equations.length,
                expectedEquations,
                `level ${level}: tier ${config.tier} should show ${expectedEquations} scale(s)`
            );
            for (const eq of question.equations) {
                assert(eq.left.length >= 1 && eq.right.length >= 1, `level ${level}: both pans should hold at least one fruit`);
                for (const fruit of eq.left.concat(eq.right)) {
                    assert(
                        Object.prototype.hasOwnProperty.call(api.FRUITS, fruit),
                        `level ${level}: fruit ${fruit} should be a known key`
                    );
                }
            }
            /* 档位四的和式托盘：葡萄一侧至少是两个水果之和 */
            if (config.tier === 4) {
                assert(question.equations[2].left.length === 1 && question.equations[2].right.length >= 2,
                    `level ${level}: the third scale should be a sum equation`);
            }

            assert(
                Number.isInteger(question.answer) && question.answer > 0 && question.answer <= 30,
                `level ${level}: answer ${question.answer} should be a positive integer within 30`
            );
            assert.strictEqual(
                api.solveEquation(question.equations, question.question.target, question.question.unit),
                question.answer,
                `level ${level}: independent substitution should reproduce the answer`
            );

            const options = api.generateOptions(question.answer, seed);
            assert.strictEqual(options.length, 4, `level ${level}: every puzzle should carry 4 options`);
            assert.strictEqual(new Set(options).size, 4, `level ${level}: options should be pairwise distinct`);
            assert(options.includes(question.answer), `level ${level}: options should contain the correct answer`);
            for (const option of options) {
                assert(Number.isInteger(option) && option >= 0, `level ${level}: option ${option} should be a non-negative integer`);
            }
            assert.deepStrictEqual(api.generateOptions(question.answer, seed), options,
                `level ${level}: same seed should reproduce the same options`);
        }
    }
}

/* (c1) solveEquation 手算样例：单条、反向、两步推导、三元链，以及欠定 / 非整数的 null 兜底 */
function testSolveEquationHandSamples() {
    const { api } = runScriptWithContext();

    /* 单条：🍎 = 2🍋 → 1🍎 = 2🍋 */
    assert.strictEqual(
        api.solveEquation([{ left: ['apple'], right: ['lemon', 'lemon'] }], 'apple', 'lemon'),
        2,
        'single equation apple = 2 lemons should solve to 2'
    );
    /* 反向：2🍎 = 🍋 → 1🍋 = 2🍎（档位一的反向提问形态） */
    assert.strictEqual(
        api.solveEquation([{ left: ['lemon'], right: ['apple', 'apple'] }], 'lemon', 'apple'),
        2,
        'reversed equation 2 apples = lemon should solve lemon to 2 apples'
    );
    /* 两步：🍌=🍎🍎、🍎=🍋🍋 ⇒ 1🍌 = 4🍋；换单位后 1🍌 = 2🍎 */
    const twoStep = [
        { left: ['banana'], right: ['apple', 'apple'] },
        { left: ['apple'], right: ['lemon', 'lemon'] }
    ];
    assert.strictEqual(api.solveEquation(twoStep, 'banana', 'lemon'), 4, 'two-step chain should give banana = 4 lemons');
    assert.strictEqual(api.solveEquation(twoStep, 'banana', 'apple'), 2, 'two-step chain should give banana = 2 apples');
    /* 三元链（REQ 示例）：🍌=🍎🍎、🍇=🍌🍋、🍎=🍋🍋 ⇒ 1🍇 = 5🍋 */
    const triple = [
        { left: ['banana'], right: ['apple', 'apple'] },
        { left: ['grape'], right: ['banana', 'lemon'] },
        { left: ['apple'], right: ['lemon', 'lemon'] }
    ];
    assert.strictEqual(api.solveEquation(triple, 'grape', 'lemon'), 5, 'triple chain should give grape = 5 lemons');

    /* 欠定：目标水果无法被任何等式约束 */
    assert.strictEqual(
        api.solveEquation([{ left: ['apple'], right: ['lemon'] }], 'banana', 'lemon'),
        null,
        'unconstrained target should return null'
    );
    /* 非整数：1🍋 = 0.5🍎，分数解必须被拒绝 */
    assert.strictEqual(
        api.solveEquation([{ left: ['apple'], right: ['lemon', 'lemon'] }], 'lemon', 'apple'),
        null,
        'fractional result should return null'
    );
}

/* (c2) generateOptions 边界：answer=1 等极端值下干扰项仍非负、互异且含正确项 */
function testGenerateOptionsEdges() {
    const { api } = runScriptWithContext();

    for (const answer of [1, 2, 3, 5, 9, 25, 30]) {
        for (let seed = 0; seed < 24; seed += 1) {
            const options = api.generateOptions(answer, seed);
            assert.strictEqual(options.length, 4, `answer ${answer}: should always carry 4 options`);
            assert.strictEqual(new Set(options).size, 4, `answer ${answer}: options should be pairwise distinct`);
            assert(options.includes(answer), `answer ${answer}: options should contain the answer`);
            for (const option of options) {
                assert(Number.isInteger(option) && option >= 0, `answer ${answer}: option ${option} should be non-negative`);
            }
        }
    }

    /* answer=1 的候补池恰好是 0/2/3/4，显式验证正确项在且干扰项都落在近邻窗口内 */
    const edge = api.generateOptions(1, 7);
    assert(edge.includes(1), 'answer 1: options should contain the correct answer');
    for (const option of edge) {
        assert(option >= 0 && option <= 4, `answer 1: option ${option} should stay inside the near-miss window`);
    }
}

/* (d) 星级边界、档位递进、存档 unlocked 只增不减、stars 保留最大值 */
function testStarsProgressionAndStorage() {
    const { api } = runScriptWithContext();

    assert.strictEqual(api.levelCount(), 12);
    assert.strictEqual(api.QUESTIONS_PER_LEVEL, 4);
    const tiers = [1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4];
    for (let level = 1; level <= 12; level += 1) {
        assert.strictEqual(api.levelConfig(level).tier, tiers[level - 1], `level ${level} should sit in tier ${tiers[level - 1]}`);
    }
    /* 档位递进：档一倍数逐关放宽；档三的倍数上限不低于档二；档四末关可用到最大倍数 */
    assert(api.levelConfig(1).maxMultiplier < api.levelConfig(3).maxMultiplier, 'tier 1 multipliers should widen with levels');
    assert(api.levelConfig(4).maxMultiplier <= api.levelConfig(9).maxMultiplier, 'tier 3 should allow larger multipliers than tier 2');
    assert(api.levelConfig(10).maxMultiplier <= api.levelConfig(12).maxMultiplier, 'tier 4 multipliers should widen with levels');

    assert.strictEqual(api.starRating(4, 4), 3, '4 correct answers should earn 3 stars');
    assert.strictEqual(api.starRating(3, 4), 2, '3 correct answers should earn 2 stars');
    assert.strictEqual(api.starRating(2, 4), 1, '2 correct answers should earn 1 star');
    assert.strictEqual(api.starRating(0, 4), 1, '0 correct answers should still earn 1 star');

    /* 全新进度默认值 */
    const fresh = runScriptWithContext();
    assert.strictEqual(fresh.api.loadUnlockedLevel(), 1, 'fresh progress should start at level 1');
    assert.strictEqual(fresh.api.loadStars(3), 0, 'fresh progress should have no stars');

    /* unlocked 只增不减、stars 保留最大值 */
    const { api: api2, storage } = runScriptWithContext();
    api2.saveUnlockedLevel(5);
    api2.saveUnlockedLevel(4);
    assert.strictEqual(storage.get('balance-scale-unlocked-level'), '5', 'unlocked level should never regress');
    api2.saveStars(2, 2);
    api2.saveStars(2, 1);
    assert.strictEqual(storage.get('balance-scale-stars-2'), '2', 'stars should keep the maximum');
    api2.saveStars(2, 3);
    assert.strictEqual(storage.get('balance-scale-stars-2'), '3', 'stars should upgrade to 3');
}

testFilesAndCatalogExist();
testGenerateEquationAcrossLevels();
testSolveEquationHandSamples();
testGenerateOptionsEdges();
testStarsProgressionAndStorage();

console.log('balance scale smoke test passed');
