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
        value: '',
        hidden: false,
        disabled: false,
        className: '',
        dataset: {},
        style: {},
        children: [],
        handlers: {},
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
        appendData(text) {
            element.textContent = (element.textContent || '') + text;
        },
        replaceChildren(...children) {
            element.children = children;
        },
        setAttribute() {},
        removeAttribute() {},
        createTextNode(text) {
            return { text, textContent: text };
        }
    };
    return element;
}

function buildContext(withBank) {
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

    const documentStub = {
        getElementById,
        createElement,
        addEventListener() {}
    };
    // createTextNode 挂到 createElement 返回的 document 桩上（appendData 用）
    documentStub.createTextNode = (text) => ({ text });

    const context = {
        window: {
            localStorage: {
                getItem: (key) => (storage.has(key) ? storage.get(key) : null),
                setItem: (key, value) => { storage.set(key, String(value)); }
            },
            setInterval: () => 1,
            clearInterval: () => {},
            setTimeout: () => 1,
            clearTimeout: () => {},
            addEventListener() {}
        },
        document: documentStub,
        console,
        Math,
        Number,
        String,
        JSON,
        Array,
        Object,
        Map,
        Set,
        RegExp,
        parseInt,
        parseFloat,
        isFinite
    };
    context.window.window = context.window;
    vm.createContext(context);
    if (withBank) {
        vm.runInNewContext(read('idiom-bank.js'), context, { filename: 'idiom-bank.js' });
    }
    vm.runInNewContext(read('script.js'), context, { filename: 'script.js' });
    return { context, storage, window: context.window };
}

/* 固定种子随机源 */
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
    assert.ok(html.includes('idiom-bank.js'), 'index.html 应加载题库数据');
    const games = read('../data/games.js');
    assert.ok(games.includes('slug: "idiom-guess"'), 'games.js 应注册 idiom-guess');
    const app = read('../js/app.js');
    assert.ok(app.includes('"idiom-guess"'), 'app.js gameMeta 应含 idiom-guess');
    const css = read('style.css');
    assert.ok(css.includes('touch-action: manipulation'), 'style.css 应含触控优化样式');
}

function testBankIntegrity() {
    const { window } = buildContext(true);
    const IG = window.IdiomGuess;
    const bank = IG.getBank();
    assert.ok(bank.length >= 900, '题库应 ≥900 条，实际 ' + bank.length);
    const seen = new Set();
    bank.forEach((entry) => {
        assert.ok(IG.entryValid(entry), '条目应完整合法: ' + JSON.stringify(entry).slice(0, 60));
        assert.ok(!seen.has(entry.w), '成语应唯一: ' + entry.w);
        seen.add(entry.w);
    });
}

function testJudge() {
    const { window } = buildContext(true);
    const IG = window.IdiomGuess;
    // 全对
    assert.deepStrictEqual(Array.from(IG.judge('兴高采烈', '兴高采烈')), ['green', 'green', 'green', 'green'], '全对应全绿');
    // 全无
    assert.deepStrictEqual(Array.from(IG.judge('一帆风顺', '兴高采烈')), ['gray', 'gray', 'gray', 'gray'], '无交集应全灰');
    // 位置与重复字交互：答案 兴高采烈，猜 高高兴兴 → 高(1)绿；多出的高灰；答案唯一的兴派一个橙、第二个兴灰
    assert.deepStrictEqual(
        Array.from(IG.judge('高高兴兴', '兴高采烈')),
        ['gray', 'green', 'orange', 'gray'],
        '字对位错应橙、超额重复应灰'
    );
    // 重复字两遍扫描①：答案 心心相印，猜 心相心心 → 心(0)绿；相(1)橙；心(2)橙（答案非绿位还剩一个心）；心(3)灰（心已用尽）
    assert.deepStrictEqual(
        Array.from(IG.judge('心相心心', '心心相印')),
        ['green', 'orange', 'orange', 'gray'],
        '重复字派橙不应超过答案中该字剩余数'
    );
    // 重复字两遍扫描②：答案 心心相印，猜 印印印印 → 只有位3绿，前三个印全灰
    assert.deepStrictEqual(
        Array.from(IG.judge('印印印印', '心心相印')),
        ['gray', 'gray', 'gray', 'green'],
        '绿位消耗后的多余重复字应全灰'
    );
    // 重复字两遍扫描③：答案 全心全意，猜 心心心心 → 位1绿，其余灰（非绿答案位没有"心"）
    assert.deepStrictEqual(
        Array.from(IG.judge('心心心心', '全心全意')),
        ['gray', 'green', 'gray', 'gray'],
        '超额重复字应只保留绿'
    );
    // 答案 大快人心，猜 心想大成 → 心橙、想灰、大橙、成灰
    assert.deepStrictEqual(
        Array.from(IG.judge('心想大成', '大快人心')),
        ['orange', 'gray', 'orange', 'gray'],
        '换位与去重应同时成立'
    );
}

function testNormalizeInput() {
    const { window } = buildContext(true);
    const IG = window.IdiomGuess;
    assert.deepStrictEqual(Array.from(IG.normalizeInput('兴高采烈').chars), Array.from('兴高采烈'), '纯四汉字应原样');
    assert.strictEqual(IG.normalizeInput('兴高采烈').ok, true, '四汉字应 ok');
    const mixed = IG.normalizeInput('xīng高采烈！');
    assert.deepStrictEqual(Array.from(mixed.chars), Array.from('高采烈'), '应剔除非汉字（含拼音字母与标点）');
    assert.strictEqual(mixed.ok, false, '不足四汉字应 ok=false');
    const extra = IG.normalizeInput('一二三四五六');
    assert.strictEqual(extra.chars.length, 4, '超长应截前四个');
}

function testRevealHint() {
    const { window } = buildContext(true);
    const IG = window.IdiomGuess;
    // 全灰（未猜中任何位）：应返回 0-3 的下标
    const idx = IG.revealHint('兴高采烈', ['gray', 'gray', 'gray', 'gray']);
    assert.ok(idx >= 0 && idx <= 3, '提示应给出合法下标');
    // 指定位置全绿时不再揭示该位置
    for (let i = 0; i < 20; i += 1) {
        const idx2 = IG.revealHint('兴高采烈', ['green', 'gray', 'green', 'gray']);
        assert.ok(idx2 === 1 || idx2 === 3, '提示不应重复揭示已绿位置');
    }
    // 全绿返回 -1
    assert.strictEqual(IG.revealHint('兴高采烈', ['green', 'green', 'green', 'green']), -1, '全绿应无提示');
    // 已揭示过的位置不再重复揭示（旧实现第二次提示可能重复同一位，白耗提示机会）
    const revealed = new Set();
    for (let i = 0; i < 3; i += 1) {
        const idx3 = IG.revealHint('兴高采烈', ['gray', 'gray', 'gray', 'gray'], revealed);
        assert.ok(idx3 >= 0 && idx3 <= 3 && !revealed.has(idx3), '提示不应重复揭示已提示过的位置');
        revealed.add(idx3);
    }
    // 非 green 且未提示的位置耗尽时返回 -1
    assert.strictEqual(
        IG.revealHint('兴高采烈', ['green', 'gray', 'gray', 'gray'], new Set([1, 2, 3])),
        -1,
        '剩余位置全被提示/绿占据时应返回 -1'
    );
}

function testPickAnswerAndFallbackBank() {
    const { window } = buildContext(false);
    const IG = window.IdiomGuess;
    const bank = IG.getBank();
    assert.strictEqual(bank.length, 30, '无题库数据时应用 30 条保底题库');
    const random = mulberry32(20261010);
    for (let i = 0; i < 20; i += 1) {
        const answer = IG.pickAnswer(bank, random);
        assert.ok(bank.includes(answer), '随机答案应来自题库');
    }
}

function testStatsPersistence() {
    const { storage, window } = buildContext(true);
    const IG = window.IdiomGuess;
    assert.deepStrictEqual(
        [IG.readStats().last, IG.readStats().best, IG.readStats().total],
        [0, 0, 0],
        '无存档应全 0'
    );
    IG.writeStats({ last: 5, best: 7, total: 21 });
    assert.strictEqual(storage.get('idiom-stats'), JSON.stringify({ version: 1, last: 5, best: 7, total: 21 }), '存储键与结构应一致');
    storage.set('idiom-stats', '{oops');
    assert.deepStrictEqual([IG.readStats().last, IG.readStats().best], [0, 0], '坏存档应兜底为 0');
    storage.set('idiom-stats', JSON.stringify({ last: -3, best: 'x' }));
    assert.deepStrictEqual([IG.readStats().last, IG.readStats().best], [0, 0], '非法字段应过滤为默认');
}

testFilesAndCatalogExist();
testBankIntegrity();
testJudge();
testNormalizeInput();
testRevealHint();
testPickAnswerAndFallbackBank();
testStatsPersistence();

console.log('idiom-guess smoke test passed');
