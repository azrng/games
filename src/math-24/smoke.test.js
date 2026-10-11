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
        style: {},
        children: [],
        handlers: {},
        attributes: {},
        classList: {
            add(c) { if (!element.className.includes(c)) element.className += ' ' + c; },
            remove(c) { element.className = element.className.replace(c, '').trim(); },
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
        setAttribute(name, value) {
            element.attributes[name] = value;
        },
        getAttribute(name) {
            return Object.prototype.hasOwnProperty.call(element.attributes, name) ? element.attributes[name] : null;
        },
        querySelectorAll() {
            // 桩内不做真实选择器匹配：卡片行返回已挂载子节点，其余场景由调用方预置
            return element.children.slice();
        }
    };
    return element;
}

function buildContext(seed) {
    const storage = new Map();
    const elements = new Map();
    const registered = {};

    function getElementById(id) {
        if (!elements.has(id)) {
            const el = createElement('div');
            el.id = id;
            elements.set(id, el);
        }
        return elements.get(id);
    }

    // 运算符条与难度列表需要可枚举的按钮子元素
    const opRow = getElementById('op-row');
    ['add', 'sub', 'mul', 'div'].forEach((op) => {
        const button = createElement('button');
        button.setAttribute('data-op', op);
        opRow.children.push(button);
    });
    const tierList = getElementById('tier-list');
    ['easy', 'normal', 'hard'].forEach((tier) => {
        const button = createElement('button');
        button.setAttribute('data-tier', tier);
        tierList.children.push(button);
    });

    const documentStub = {
        getElementById,
        createElement,
        addEventListener() {},
        body: createElement('body')
    };

    const windowStub = {
        localStorage: {
            getItem: (key) => (storage.has(key) ? storage.get(key) : null),
            setItem: (key, value) => { storage.set(key, String(value)); }
        },
        setInterval: () => 1,
        clearInterval: () => {},
        setTimeout: () => {},
        addEventListener(name, handler) {
            registered[name] = handler;
        }
    };

    const context = {
        window: windowStub,
        document: documentStub,
        console,
        // 传入 seed 时用固定随机源（派生对象继承原生 Math），保证发牌可复现
        Math: seed === undefined ? Math : Object.assign(Object.create(Math), { random: mulberry32(seed) }),
        Date,
        Number,
        String,
        JSON,
        Array,
        Object,
        Set,
        parseInt,
        parseFloat,
        isFinite
    };
    windowStub.window = windowStub;
    vm.createContext(context);
    vm.runInNewContext(read('script.js'), context, { filename: 'script.js' });
    return { context, windowStub, storage, registered };
}

/* 测试内独立的表达式求值（有理数近似），验证解法串确实算得 24 */
function evalExpr(text) {
    let pos = 0;
    function skip() {
        while (pos < text.length && /\s/.test(text[pos])) pos += 1;
    }
    function parseExpr() {
        let value = parseTerm();
        for (;;) {
            skip();
            const ch = text[pos];
            if (ch === '+') { pos += 1; value += parseTerm(); }
            else if (ch === '−') { pos += 1; value -= parseTerm(); }
            else return value;
        }
    }
    function parseTerm() {
        let value = parseFactor();
        for (;;) {
            skip();
            const ch = text[pos];
            if (ch === '×') { pos += 1; value *= parseFactor(); }
            else if (ch === '÷') { pos += 1; value /= parseFactor(); }
            else return value;
        }
    }
    function parseFactor() {
        skip();
        if (text[pos] === '(') {
            pos += 1;
            const value = parseExpr();
            skip();
            assert.strictEqual(text[pos], ')', '表达式括号不匹配: ' + text);
            pos += 1;
            return value;
        }
        if (text[pos] === '-') {
            pos += 1;
            return -parseFactor();
        }
        const start = pos;
        while (pos < text.length && /[0-9]/.test(text[pos])) pos += 1;
        assert.ok(pos > start, '表达式含非法字符: ' + text);
        return Number.parseFloat(text.slice(start, pos));
    }
    const value = parseExpr();
    skip();
    assert.strictEqual(pos, text.length, '表达式未消费完: ' + text);
    return value;
}

/* 固定种子随机源（mulberry32），保证生成器测试可复现 */
function mulberry32(seed) {
    let a = seed >>> 0;
    return function random() {
        a += 0x6D2B79F5;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function testFilesAndCatalogExist() {
    const html = read('index.html');
    assert.ok(html.includes('../js/game-back.js'), 'index.html 应引入共享返回按钮');
    assert.ok(html.includes('viewport-fit=cover'), 'index.html 应含 viewport-fit=cover');
    assert.ok(html.includes('user-scalable=no'), 'index.html 应禁止缩放');
    const games = read('../data/games.js');
    assert.ok(games.includes('slug: "math-24"'), 'games.js 应注册 math-24');
    const app = read('../js/app.js');
    assert.ok(app.includes('"math-24"'), 'app.js gameMeta 应含 math-24');
    const css = read('style.css');
    assert.ok(css.includes('touch-action: manipulation'), 'style.css 应含触控优化样式');
    const shell = read('../lights-out/index.html');
    assert.ok(shell.includes('game-shell'), '页面壳模板存在性对照');
}

function testFractionMath() {
    const M = buildContext().context.window.Math24;
    const half = M.frac(1, 2);
    const third = M.frac(1, 3);
    assert.deepStrictEqual([M.frac(6, 4).n, M.frac(6, 4).d], [3, 2], '6/4 应约分为 3/2');
    assert.deepStrictEqual([M.frac(3, -2).n, M.frac(3, -2).d], [-3, 2], '负分母应归一到分子');
    assert.strictEqual(M.frac(1, 0), null, '分母为 0 应返回 null');
    assert.deepStrictEqual([M.fAdd(half, third).n, M.fAdd(half, third).d], [5, 6], '1/2+1/3=5/6');
    assert.deepStrictEqual([M.fSub(half, third).n, M.fSub(half, third).d], [1, 6], '1/2-1/3=1/6');
    assert.deepStrictEqual([M.fMul(half, third).n, M.fMul(half, third).d], [1, 6], '1/2×1/3=1/6');
    assert.deepStrictEqual([M.fDiv(half, third).n, M.fDiv(half, third).d], [3, 2], '1/2÷1/3=3/2');
    assert.strictEqual(M.fDiv(half, M.frac(0, 1)), null, '除以 0 应返回 null');
    assert.ok(M.fEq(M.frac(2, 4), M.frac(1, 2)), '跨约分判等应成立');
    assert.ok(M.fIsInt(M.frac(8, 2)), '4 应为整数');
    assert.ok(!M.fIsInt(M.frac(8, 3)), '8/3 不应为整数');
}

function testSolverClassics() {
    const M = buildContext().context.window.Math24;
    const classics = [
        [3, 3, 8, 8],
        [1, 5, 5, 5],
        [3, 3, 7, 7],
        [4, 4, 10, 10],
        [1, 2, 3, 4],
        [2, 3, 5, 12]
    ];
    classics.forEach((nums) => {
        const solutions = M.solve24(nums.map((n) => M.frac(n, 1)));
        assert.ok(Array.from(solutions).length > 0, nums.join(' ') + ' 应有解');
        Array.from(solutions).forEach((solution) => {
            const value = evalExpr(solution.expr);
            assert.ok(Math.abs(value - 24) < 1e-9, nums.join(' ') + ' 的解法 ' + solution.expr + ' 应实算为 24');
        });
    });
    // 3 3 8 8 的唯一解必须用到分数中间值
    const hard = M.solve24([3, 3, 8, 8].map((n) => M.frac(n, 1)));
    assert.ok(Array.from(hard).every((s) => s.usedFrac), '3 3 8 8 全部解法应含分数中间值');
    // 1 2 3 4 存在纯整数解法
    const easy = M.solve24([1, 2, 3, 4].map((n) => M.frac(n, 1)));
    assert.ok(Array.from(easy).some((s) => !s.usedFrac), '1 2 3 4 应有纯整数路径解');
    // 无解题返回空
    assert.strictEqual(M.solve24([1, 1, 1, 1].map((n) => M.frac(n, 1))).length, 0, '1 1 1 1 应无解');
}

function testGeneratePuzzle() {
    const M = buildContext().context.window.Math24;
    const tiers = ['easy', 'normal', 'hard'];
    tiers.forEach((tier, index) => {
        const random = mulberry32(20261010 + index * 7919);
        let hardFallback = 0;
        for (let i = 0; i < 60; i += 1) {
            const puzzle = M.generatePuzzle(tier, random);
            const cards = Array.from(puzzle.cards).map((f) => [f.n, f.d]);
            assert.strictEqual(cards.length, 4, '每题应 4 个数');
            const solutions = M.solve24(puzzle.cards);
            assert.ok(solutions.length > 0, tier + ' 档生成的题 ' + JSON.stringify(cards) + ' 必有解');
            if (tier === 'hard') {
                const allHard = Array.from(solutions).every((s) => s.usedFrac);
                const someHard = Array.from(solutions).some((s) => s.usedFrac);
                if (!allHard) {
                    assert.ok(someHard, '大师档放宽兜底也应含分数技巧解');
                    hardFallback += 1;
                }
            }
        }
        if (tier === 'hard') {
            console.log('大师档 60 题中放宽兜底触发 ' + hardFallback + ' 题');
        }
    });
}

function testSolutionStringsOfGeneratedPuzzle() {
    const M = buildContext().context.window.Math24;
    const puzzle = M.generatePuzzle('normal', mulberry32(42));
    const solutions = Array.from(M.solve24(puzzle.cards));
    assert.ok(solutions.length > 0, '抽样本题应有解');
    solutions.forEach((solution) => {
        const value = evalExpr(solution.expr);
        assert.ok(Math.abs(value - 24) < 1e-9, '生成题解法 ' + solution.expr + ' 应实算为 24');
    });
}

function testPersistence() {
    const { context, storage } = buildContext();
    const M = context.window.Math24;
    assert.strictEqual(M.readBestTime('normal'), null, '无存档最快时间应为 null');
    assert.ok(M.writeBestTime('normal', 12.3), '首次写入最快时间应成功');
    assert.strictEqual(M.readBestTime('normal'), 12.3, '读回应与写入一致');
    assert.ok(!M.writeBestTime('normal', 15.8), '更慢的成绩不应覆盖');
    assert.ok(M.writeBestTime('normal', 9.6), '更快成绩应覆盖');
    assert.strictEqual(storage.get('math24-best-time-normal'), '9.6', '存储键应为 math24-best-time-normal');
    M.writeStreak('normal', { last: 5, best: 21 });
    assert.deepStrictEqual([M.readStreak('normal').last, M.readStreak('normal').best], [5, 21], '连击应往返一致');
    storage.set('math24-streak-normal', '{oops');
    assert.deepStrictEqual([M.readStreak('normal').last, M.readStreak('normal').best], [0, 0], '坏存档应兜底为 0');
    storage.set('math24-best-time-normal', 'abc');
    assert.strictEqual(M.readBestTime('normal'), null, '坏最快时间应兜底为 null');
}

/* ---------- 卡牌交互：经 DOM 桩上的 click 处理器驱动 onCardClick/onOpClick ---------- */

function buildCardHarness(contextObject) {
    const cardRow = contextObject.document.getElementById('card-row');
    const opRow = contextObject.document.getElementById('op-row');
    return {
        cardValues() {
            return cardRow.children.map((button) => button.children[0].textContent);
        },
        clickCard(index) {
            cardRow.children[index].handlers.click();
        },
        clickOp(name) {
            const button = opRow.children.find((item) => item.getAttribute('data-op') === name);
            assert.ok(button, '运算符按钮应存在: ' + name);
            button.handlers.click();
        },
        cardIsSelected(index) {
            return cardRow.children[index].className.includes('is-selected');
        },
        opIsActive(name) {
            const button = opRow.children.find((item) => item.getAttribute('data-op') === name);
            return Boolean(button) && button.className.includes('is-selected');
        },
        assertNoSelection() {
            cardRow.children.forEach((button) => {
                assert.ok(!button.className.includes('is-selected'), '不应有卡牌处于选中态');
            });
            opRow.children.forEach((button) => {
                assert.ok(!button.className.includes('is-selected'), '不应有运算符处于待合并态');
            });
        }
    };
}

/** 缺陷回归：已选运算符后再点同一张卡应取消选中，而不是自我合并导致牌面少一张 */
function testCardSelfClickCancel() {
    const harness = buildCardHarness(buildContext(20261011).context);
    const before = harness.cardValues();
    assert.strictEqual(before.length, 4, '初始应发 4 张牌');

    harness.clickCard(0);
    assert.ok(harness.cardIsSelected(0), '点卡 0 后卡 0 应处于选中态');
    harness.clickOp('add');
    assert.ok(harness.opIsActive('add'), '点 + 后加号应处于待合并态');

    harness.clickCard(0);
    assert.strictEqual(harness.cardValues().length, 4, '已选运算符时再点自己应取消选中，牌面仍应 4 张');
    assert.deepStrictEqual(harness.cardValues(), before, '取消选中不应改动任何牌面数值');
    harness.assertNoSelection();
}

/** 正向回归：选卡 0 → 选 + → 点卡 1 应正常合并为 3 张，结果落在先点的卡上 */
function testCardMergeRegression() {
    const harness = buildCardHarness(buildContext(20261011).context);
    const before = harness.cardValues();

    harness.clickCard(0);
    harness.clickOp('add');
    harness.clickCard(1);

    const after = harness.cardValues();
    assert.strictEqual(after.length, 3, '卡 0 + 卡 1 合并后应剩 3 张');
    assert.strictEqual(after[0], String(Number(before[0]) + Number(before[1])), '合并结果应落在先点的卡 0 上');
    assert.deepStrictEqual(after.slice(1), before.slice(2), '其余卡牌应保持原序');
    harness.assertNoSelection();
}

/** 缺陷回归：解集去重契约——旧实现按"下标合并串"去重会键坍缩，既重复展示同一解法又漏掉本质解 */
function testSolverDedupContract() {
    const M = buildContext().context.window.Math24;
    const toFracs = (nums) => nums.map((n) => M.frac(n, 1));

    // 重复牌：3 3 8 8 的唯一解不应因下标来源不同被重复返回
    const dup = Array.from(M.solve24(toFracs([3, 3, 8, 8])));
    assert.strictEqual(dup.length, 1, '3 3 8 8 应恰返回 1 条本质解，实测: ' + dup.map((s) => s.expr).join(' | '));

    // 每组解内表达式两两互异
    [[3, 3, 8, 8], [1, 5, 5, 5], [1, 2, 3, 4], [2, 3, 5, 12]].forEach((nums) => {
        const solutions = Array.from(M.solve24(toFracs(nums)));
        const exprs = solutions.map((s) => s.expr);
        assert.strictEqual(new Set(exprs).size, exprs.length, nums.join(' ') + ' 的解法串不应重复');
    });

    // 旧实现漏解回归：1 2 3 4 应包含除法技巧解 4÷((1÷2)÷3)
    const easy = Array.from(M.solve24(toFracs([1, 2, 3, 4])));
    assert.ok(
        easy.some((s) => s.expr === '(4÷((1÷2)÷3))'),
        '1 2 3 4 应含除法技巧解 (4÷((1÷2)÷3))'
    );

    // 伪难题回归：13 8 4 3 存在纯整数路径解 ((8×(4−3))+3)+13，不得被当作全分数技巧题
    const pseudo = Array.from(M.solve24(toFracs([13, 8, 4, 3])));
    assert.ok(pseudo.some((s) => !s.usedFrac), '13 8 4 3 应含纯整数路径解');
}

/** 相邻两题不重复：连点“下一题”，新发牌组不应与上一题完全相同 */
function testNextPuzzleNotRepeat() {
    const { context } = buildContext(20261011);
    const doc = context.document;
    const harness = buildCardHarness(context);
    const key = () => harness.cardValues().slice().sort().join(',');
    let prev = key();
    for (let i = 0; i < 40; i += 1) {
        doc.getElementById('next-btn').handlers.click();
        const current = key();
        assert.notStrictEqual(current, prev, '相邻两题牌组不应完全相同（第 ' + (i + 1) + ' 次发牌）');
        prev = current;
    }
}

/** 胜利后误点“跳过”不应清连击、不应换题，只展示本题解法 */
function testSkipAfterWinKeepsStreak() {
    const { context } = buildContext(20261011);
    const doc = context.document;
    const harness = buildCardHarness(context);
    const M = context.window.Math24;
    const cardRow = doc.getElementById('card-row');

    const toFracs = (texts) => texts.map((text) => {
        const parts = String(text).split('/');
        return parts.length === 2 ? M.frac(Number(parts[0]), Number(parts[1])) : M.frac(Number(text), 1);
    });
    const fracStr = (f) => (f.d === 1 ? String(f.n) : f.n + '/' + f.d);

    const cards = toFracs(harness.cardValues());
    const solutions = Array.from(M.solve24(cards));
    assert.ok(solutions.length > 0, '种子题应有解');
    const solution = solutions.find((s) => !s.usedFrac) || solutions[0];

    /* 解析完全括号化表达式 '(A∆B)' 为二叉树 */
    function parse(text) {
        if (text[0] !== '(') return { leaf: text };
        let depth = 0;
        for (let i = 1; i < text.length - 1; i += 1) {
            if (text[i] === '(') depth += 1;
            else if (text[i] === ')') depth -= 1;
            else if (depth === 0 && '+−×÷'.includes(text[i])) {
                return { op: text[i], l: parse(text.slice(1, i)), r: parse(text.slice(i + 1, -1)) };
            }
        }
        throw new Error('无法解析解法表达式: ' + text);
    }

    const OP_BUTTON = { '+': 'add', '−': 'sub', '×': 'mul', '÷': 'div' };
    const APPLY = { '+': M.fAdd, '−': M.fSub, '×': M.fMul, '÷': M.fDiv };

    /* 后序驱动：先造出左右两张牌，再点左牌 + 运算符 + 右牌完成合并 */
    function drive(node) {
        if (node.leaf) return toFracs([node.leaf])[0];
        const lv = drive(node.l);
        const rv = drive(node.r);
        const li = cardRow.children.findIndex((b) => b.children[0].textContent === fracStr(lv));
        const ri = cardRow.children.findIndex((b, i) => i !== li && b.children[0].textContent === fracStr(rv));
        assert.ok(li >= 0 && ri >= 0, '驱动路径上应存在待合并牌: ' + fracStr(lv) + ' 与 ' + fracStr(rv));
        harness.clickCard(li);
        harness.clickOp(OP_BUTTON[node.op]);
        harness.clickCard(ri);
        return APPLY[node.op](lv, rv);
    }

    const tiers = ['easy', 'normal', 'hard'];
    const beforeWin = tiers.map((tier) => M.readStreak(tier).last);
    const result = drive(parse(solution.expr));
    assert.ok(result.n === 24 && result.d === 1, '驱动完整解法后应算出 24');
    assert.strictEqual(harness.cardValues().length, 1, '合并完成后应剩 1 张牌');
    const afterWin = tiers.map((tier) => M.readStreak(tier).last);
    assert.notDeepStrictEqual(afterWin, beforeWin, '胜利后当前档连击应 +1');

    doc.getElementById('skip-btn').handlers.click();
    assert.deepStrictEqual(tiers.map((tier) => M.readStreak(tier).last), afterWin, '胜利后点跳过不应清空连击');
    assert.strictEqual(harness.cardValues().length, 1, '胜利后点跳过不应换题');
    assert.strictEqual(doc.getElementById('solutions-modal').hidden, false, '胜利后点跳过应展示解法弹窗');
    assert.strictEqual(doc.getElementById('solutions-title').textContent, '本题解法', '解法弹窗标题应为本题解法');
}

testFilesAndCatalogExist();
testFractionMath();
testSolverClassics();
testGeneratePuzzle();
testSolutionStringsOfGeneratedPuzzle();
testPersistence();
testCardSelfClickCancel();
testCardMergeRegression();
testSolverDedupContract();
testNextPuzzleNotRepeat();
testSkipAfterWinKeepsStreak();

console.log('math-24 smoke test passed');
