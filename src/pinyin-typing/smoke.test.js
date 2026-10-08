// @ts-check
/* 拼音打字乐园 smoke 测试：node vm 直跑 + 自动桩（仿 typing-cannon）
 * 覆盖：字库数据合法性、声调标注、取字优先级、判键与星级、存档读写与损坏恢复
 * 运行：node src/pinyin-typing/smoke.test.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = __dirname;

function read(file) {
    return fs.readFileSync(path.join(root, file), 'utf8');
}

/* 任意属性可取、任意方法可调的自动桩：覆盖 DOM/canvas 等重依赖 */
function makeAutoStub() {
    const stub = new Proxy(function () {}, {
        get(target, prop) {
            if (prop === Symbol.toPrimitive) return () => 0;
            if (!(prop in target)) target[prop] = makeAutoStub();
            return target[prop];
        },
        apply() { return makeAutoStub(); },
        construct() { return makeAutoStub(); }
    });
    return stub;
}

/* 带 children/textContent 真实行为的轻量元素桩，方便断言渲染产物 */
function makeElement(tag) {
    const el = makeAutoStub();
    el.tagName = tag;
    el.children = [];
    el.textContent = '';
    el.className = '';
    el.appendChild = (child) => { el.children.push(child); return child; };
    return el;
}

function makeDocumentStub() {
    const cache = {};
    const byId = (id) => {
        if (!cache[id]) cache[id] = makeElement('div');
        return cache[id];
    };
    return {
        getElementById: byId,
        createElement: (tag) => makeElement(tag),
        addEventListener() {},
        body: makeElement('body')
    };
}

function makeStorage() {
    const store = new Map();
    return {
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => { store.set(k, String(v)); },
        removeItem: (k) => { store.delete(k); }
    };
}

function loadGame(storage) {
    const sandbox = {
        document: makeDocumentStub(),
        localStorage: storage || makeStorage(),
        setTimeout: function () { return 0; }, // 不推进庆祝定时器，测试直接调 PT.advanceRound
        clearTimeout: function () {},
        console,
        Math,
        JSON,
        Date,
        Object,
        Array,
        Number,
        String
    };
    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(read('wordbank.js'), sandbox, { filename: 'wordbank.js' });
    vm.runInContext(read('script.js'), sandbox, { filename: 'script.js' });
    return { PT: sandbox.window.PT, sandbox };
}

/* ---------- 1. 字库数据合法性 ---------- */
{
    const { PT } = loadGame();
    const bank = PT.tierBank;
    assert.strictEqual(bank('sprout').length, 40, '启蒙档 40 字');
    assert.strictEqual(bank('basic').length, 60, '基础档 60 字');
    assert.strictEqual(bank('rocket').length, 60, '挑战档 60 条');
    const caps = { sprout: 2, basic: 3 };
    [['sprout', 40], ['basic', 60], ['rocket', 60]].forEach(([tier, total]) => {
        const seen = new Set();
        bank(tier).forEach((c) => {
            assert.match(c.p, /^[a-z]+$/, `${tier} ${c.h} 拼音必须是小写字母`);
            assert.ok(c.h, `${tier} 汉字非空`);
            assert.ok(c.e, `${tier} ${c.h} 需要插图`);
            assert.ok(c.w, `${tier} ${c.h} 需要示例词`);
            assert.ok(c.t >= 0 && c.t <= 4, `${tier} ${c.h} 声调取值 0-4`);
            assert.ok(!seen.has(c.h), `${tier} 汉字档内唯一：${c.h}`);
            seen.add(c.h);
            if (caps[tier]) {
                assert.ok(c.p.length <= caps[tier], `${tier} ${c.h} 拼音长度 ≤${caps[tier]}`);
                assert.strictEqual(c.h.length, 1, `${tier} 应全部是单字`);
            }
        });
        assert.strictEqual(seen.size, total, `${tier} 去重后数量一致`);
    });
    // 挑战档：单字 ≤4 字母，双字词总长 ≤8 且无声调
    bank('rocket').forEach((c) => {
        if (c.h.length === 2) {
            assert.strictEqual(c.t, 0, `双字词 ${c.h} 无声调`);
            assert.ok(c.p.length >= 2 && c.p.length <= 8, `双字词 ${c.h} 总长 ≤8`);
        } else {
            assert.ok(c.p.length <= 4, `挑战单字 ${c.h} 拼音 ≤4 字母`);
        }
    });
    // 双字词共 20 条
    assert.strictEqual(bank('rocket').filter((c) => c.h.length === 2).length, 20, '挑战档双字词 20 条');
    console.log('✓ 字库数据合法性');
}

/* ---------- 2. 声调标注 ---------- */
{
    const { PT } = loadGame();
    assert.strictEqual(PT.toneMark('hua', 1), 'huā');
    assert.strictEqual(PT.toneMark('ma', 1), 'mā');
    assert.strictEqual(PT.toneMark('ba', 4), 'bà');
    assert.strictEqual(PT.toneMark('e', 2), 'é');
    assert.strictEqual(PT.toneMark('yu', 3), 'yǔ');
    assert.strictEqual(PT.toneMark('shui', 3), 'shuǐ'); // ui 组标在 i 上
    assert.strictEqual(PT.toneMark('liu', 4), 'liù');   // iu 组标在 u 上
    assert.strictEqual(PT.toneMark('laoshi', 0), 'laoshi'); // 双字词原样
    assert.strictEqual(PT.toneMark('ma', 0), 'ma');
    console.log('✓ 声调标注');
}

/* ---------- 3. 取字：优先未学 + 补齐 + 不重复 ---------- */
{
    const { PT } = loadGame();
    // 场景 A：未学字充足（50 个已学）→ 8 个全部来自未学
    const basic = PT.tierBank('basic');
    basic.slice(0, 50).forEach((c) => { PT.PT_SAVE.stars.basic[c.h] = 3; });
    let queue = PT.pickQueue('basic', 8);
    assert.strictEqual(queue.length, 8);
    queue.forEach((c) => assert.ok(!PT.hasStar('basic', c.h), '未学充足时不出已学字'));
    // 场景 B：未学只剩 5 个 → 用已学补齐到 8
    basic.slice(50).forEach((c) => { PT.PT_SAVE.stars.basic[c.h] = 2; }); // 全部已学
    delete PT.PT_SAVE.stars.basic[basic[55].h];
    delete PT.PT_SAVE.stars.basic[basic[56].h];
    delete PT.PT_SAVE.stars.basic[basic[57].h];
    delete PT.PT_SAVE.stars.basic[basic[58].h];
    delete PT.PT_SAVE.stars.basic[basic[59].h];
    queue = PT.pickQueue('basic', 8);
    assert.strictEqual(queue.length, 8, '未学不足时补齐到 8');
    assert.strictEqual(new Set(queue.map((c) => c.h)).size, 8, '一局内不重复');
    const freshCount = queue.filter((c) => !PT.hasStar('basic', c.h)).length;
    assert.strictEqual(freshCount, 5, '补齐时优先出完全部 5 个未学字');
    console.log('✓ 取字优先级与补齐');
}

/* ---------- 4. 判键、星级与结算 ---------- */
{
    const { PT } = loadGame();
    const G = PT.G;
    // 造一局：三个字分别验证 3/2/1 星
    G.tier = 'sprout';
    G.queue = [
        { h: '妈', p: 'ma', t: 1, e: '👩', w: '妈妈' },
        { h: '娃', p: 'wa', t: 2, e: '👶', w: '娃娃' },
        { h: '笔', p: 'bi', t: 3, e: '✏️', w: '铅笔' }
    ];
    G.qi = 0; G.slotIdx = 0; G.wrongCount = 0; G.combo = 0; G.bestCombo = 0;
    G.roundStars = []; G.newStickers = []; G.running = true;

    // 字 1：非字母键与大写忽略，正确输入得 3 星
    assert.strictEqual(PT.handleKey('1'), false, '非字母键忽略');
    assert.strictEqual(PT.handleKey('M'), false, '大写键由 onKeydown 统一转小写，直接传入也忽略');
    assert.strictEqual(G.wrongCount, 0, '忽略的键不计按错');
    assert.strictEqual(PT.handleKey('m'), true);
    assert.strictEqual(PT.handleKey('a'), true);
    assert.deepStrictEqual(G.roundStars, [3], '零按错 3 星');
    assert.strictEqual(G.running, false, '庆祝间隙暂停判键');
    PT.advanceRound();

    // 字 2：1 次按错 → 2 星
    assert.strictEqual(G.qi, 1);
    assert.strictEqual(PT.handleKey('q'), false, '按错不通过');
    assert.strictEqual(G.combo, 0, '按错清零连击');
    assert.ok(PT.handleKey('w') && PT.handleKey('a'));
    assert.deepStrictEqual(G.roundStars, [3, 2], '1-2 次按错 2 星');
    PT.advanceRound();

    // 字 3：3 次按错 → 1 星；期间断连不惩罚
    for (let i = 0; i < 3; i++) PT.handleKey('z');
    assert.ok(PT.handleKey('b') && PT.handleKey('i'));
    assert.deepStrictEqual(G.roundStars, [3, 2, 1], '3 次及以上按错 1 星');
    assert.deepStrictEqual(G.newStickers.map((c) => c.h), ['妈', '娃', '笔'], '首次点亮全部进新贴纸');
    PT.advanceRound();
    assert.strictEqual(G.running, false, '打满一局进结算');

    // 存档落盘
    assert.strictEqual(PT.PT_SAVE.stars.sprout['妈'], 3);
    assert.strictEqual(PT.PT_SAVE.stars.sprout['娃'], 2);
    assert.strictEqual(PT.PT_SAVE.stars.sprout['笔'], 1);
    console.log('✓ 判键、星级与结算');
}

/* ---------- 5. 挑战档连击入档 ---------- */
{
    const { PT } = loadGame();
    const G = PT.G;
    G.tier = 'rocket';
    G.queue = [{ h: '老师', p: 'laoshi', t: 0, e: '👩‍🏫', w: '老师' }];
    G.qi = 0; G.slotIdx = 0; G.wrongCount = 0; G.combo = 0; G.bestCombo = 0;
    G.roundStars = []; G.newStickers = []; G.running = true;
    'laoshi'.split('').forEach((k) => assert.strictEqual(PT.handleKey(k), true, `双字词逐字母通过：${k}`));
    assert.strictEqual(G.bestCombo, 6);
    assert.strictEqual(PT.PT_SAVE.bestCombo.rocket, 6, '挑战档最高连击入档');
    assert.strictEqual(PT.PT_SAVE.stars.rocket['老师'], 3);
    console.log('✓ 挑战档连击');
}

/* ---------- 6. 存档持久化与损坏恢复 ---------- */
{
    const storage = makeStorage();
    const { PT } = loadGame(storage);
    PT.PT_SAVE.stars.sprout['鱼'] = 3;
    PT.PT_SAVE.muted = true;
    PT.persistSave();
    const raw = JSON.parse(storage.getItem('pinyin_typing_save_v1'));
    assert.strictEqual(raw.stars.sprout['鱼'], 3, '写档成功');
    assert.strictEqual(raw.muted, true);

    // 重启读取：数据保留
    const again = loadGame(storage);
    assert.strictEqual(again.PT.PT_SAVE.stars.sprout['鱼'], 3, '刷新后进度保留');
    assert.strictEqual(again.PT.PT_SAVE.muted, true, '声音开关保留');

    // 损坏 JSON → 重置默认，不抛错（vm 上下文对象与宿主原型不同，用键数断言）
    storage.setItem('pinyin_typing_save_v1', '{oops not json');
    const broken = loadGame(storage);
    assert.strictEqual(Object.keys(broken.PT.PT_SAVE.stars.sprout).length, 0, '损坏存档重置');

    // 版本不符 → 重置默认
    storage.setItem('pinyin_typing_save_v1', JSON.stringify({ version: 99, stars: { sprout: { '鱼': 3 } } }));
    const oldVersion = loadGame(storage);
    assert.strictEqual(oldVersion.PT.PT_SAVE.stars.sprout['鱼'], undefined, '版本不符重置');

    // 非法星级/连击被过滤
    storage.setItem('pinyin_typing_save_v1', JSON.stringify({
        version: 1, muted: false,
        stars: { sprout: { '鱼': 9, '马': 0, '爸': 2 } },
        bestCombo: { rocket: -5 }
    }));
    const filtered = loadGame(storage);
    assert.strictEqual(filtered.PT.PT_SAVE.stars.sprout['鱼'], undefined, '越界星级被过滤');
    assert.strictEqual(filtered.PT.PT_SAVE.stars.sprout['爸'], 2, '合法星级保留');
    assert.strictEqual(filtered.PT.PT_SAVE.bestCombo.rocket, 0, '非法连击被过滤');
    console.log('✓ 存档持久化与损坏恢复');
}

console.log('\n全部 smoke 断言通过 ✓');
