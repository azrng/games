const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = __dirname;

function read(file) {
    return fs.readFileSync(path.join(root, file), 'utf8');
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
        classList: {
            add() {},
            remove() {},
            toggle() {}
        },
        addEventListener() {},
        appendChild(child) {
            this.children.push(child);
            return child;
        },
        replaceChildren(...children) {
            this.children = children;
        },
        setAttribute(name, value) {
            this[name] = value;
        },
        removeAttribute(name) {
            delete this[name];
        },
        remove() {}
    };
    return element;
}

function runScriptWithContext(seedStorage = []) {
    const storage = new Map(seedStorage);
    const elements = new Map();

    /* 先在独立上下文执行数据文件，再执行游戏脚本，模拟页面的脚本加载顺序 */
    const dataWindow = {};
    vm.runInNewContext(read('hanndata.js'), { window: dataWindow });

    const document = {
        body: createElement('body'),
        createElement(tag) {
            return createElement(`${tag}-${elements.size}`);
        },
        createDocumentFragment() {
            return { children: [], appendChild(child) { this.children.push(child); } };
        },
        getElementById(id) {
            if (!elements.has(id)) elements.set(id, createElement(id));
            return elements.get(id);
        },
        addEventListener() {}
    };

    const windowObject = {
        localStorage: {
            getItem(key) {
                return storage.has(key) ? storage.get(key) : null;
            },
            setItem(key, value) {
                storage.set(key, String(value));
            }
        },
        HanziPartsData: dataWindow.HanziPartsData
    };

    const context = {
        window: windowObject,
        document,
        Math,
        setTimeout() {
            return 1;
        },
        clearTimeout() {}
    };
    context.window.window = windowObject;
    context.window.document = document;

    vm.runInNewContext(read('script.js'), context);
    return { api: context.window.HanziApi, data: dataWindow.HanziPartsData, storage };
}

/* (a) 文件与目录约定：页面骨架、脚本挂载顺序、目录注册 */
function testFilesAndCatalogExist() {
    const html = read('index.html');
    assert(html.includes('viewport-fit=cover'), 'mobile page should use viewport-fit=cover');
    assert(html.includes('user-scalable=no'), 'mobile page should disable viewport scaling');
    assert(html.includes('src="hanndata.js"'), 'page should load the word bank before script.js');
    assert(html.includes('src="script.js"'), 'page should load script.js');
    assert(html.includes('../js/game-back.js'), 'page should mount the shared back button script');

    const script = read('script.js');
    assert(script.includes('windowObject.HanziApi'), 'script should expose window.HanziApi');
    assert(script.includes("hanzi-parts-unlocked-level"), 'storage keys should use the hanzi-parts- prefix');
    assert(script.includes("hanzi-parts-stars-"), 'star records should use the hanzi-parts- prefix');

    const css = read('style.css');
    assert(css.includes('--hz-'), 'style should define self-contained --hz-* variables');

    const catalog = fs.readFileSync(path.join(root, '..', 'data', 'games.js'), 'utf8');
    assert(catalog.includes('slug: "hanzi-parts"'), 'catalog should register hanzi-parts');
    assert(catalog.includes('mobilePath: "src/hanzi-parts/index.html"'), 'catalog should route mobile to hanzi-parts');
}

/* (b) 题库质量：数量、字段、组合键唯一性、tryCombine 正反例 */
function testWordBankQuality() {
    const { api, data } = runScriptWithContext();

    assert(api.DATA === data, 'HanziApi.DATA should reference the loaded bank');
    assert(data.length >= 48, `bank should hold at least 48 entries, got ${data.length}`);

    const keys = new Set();
    for (const entry of data) {
        assert(typeof entry.char === 'string' && entry.char.length === 1, `entry char should be one hanzi: ${entry.char}`);
        assert(Array.isArray(entry.parts) && entry.parts.length === 2, `${entry.char} should have exactly 2 parts`);
        for (const part of entry.parts) {
            assert(typeof part === 'string' && part.length >= 1, `${entry.char} part should be a non-empty string`);
        }
        assert(typeof entry.pinyin === 'string' && entry.pinyin.length > 0, `${entry.char} should carry pinyin`);
        assert(typeof entry.word === 'string' && entry.word.length > 0, `${entry.char} should carry an example word`);

        const key = api.combinationKey(entry.parts[0], entry.parts[1]);
        assert(!keys.has(key), `part pair ${key} maps to both an earlier entry and ${entry.char}`);
        keys.add(key);
    }

    /* 组合规范键：顺序无关 */
    assert.strictEqual(api.combinationKey('日', '月'), api.combinationKey('月', '日'));

    /* 正例：日月成明，且与传入顺序无关；同部件字（木木成林）也能命中 */
    assert.strictEqual(api.tryCombine(data, '日', '月').char, '明');
    assert.strictEqual(api.tryCombine(data, '月', '日').char, '明');
    assert.strictEqual(api.tryCombine(data, '木', '木').char, '林');
    /* 命中结果应为题库原条目（vm 对象原型与宿主不同，逐字段比较） */
    const hao = api.tryCombine(data, '女', '子');
    assert.strictEqual(hao.char, '好');
    assert.strictEqual(hao.pinyin, 'hǎo');
    assert.strictEqual(hao.word, '好人');
    assert(data.includes(hao), 'tryCombine should return the original bank entry');

    /* 反例：题库里不存在的组合返回 null */
    assert.strictEqual(api.tryCombine(data, '日', '山'), null);
    assert.strictEqual(api.tryCombine([], '日', '月'), null);
}

/* (c) 12 关生成：档位、目标互异、部件池规模与互异性、种子可复现 */
function testGeneratedLevels() {
    const { api } = runScriptWithContext();

    assert.strictEqual(api.levelCount(), 12);
    for (let level = 1; level <= api.levelCount(); level += 1) {
        const config = api.levelConfig(level);
        const expectedTargets = level <= 4 ? 3 : level <= 8 ? 4 : 5;
        const expectedPool = level <= 4 ? 6 : level <= 8 ? 8 : 10;
        assert.strictEqual(config.targetCount, expectedTargets, `level ${level} target count`);
        assert.strictEqual(config.poolSize, expectedPool, `level ${level} pool size`);

        const seed = api.levelSeed(level);
        const generated = api.generateLevel(level, seed);

        assert.strictEqual(generated.targets.length, expectedTargets, `level ${level} should draw ${expectedTargets} targets`);
        assert.strictEqual(generated.pool.length, expectedPool, `level ${level} pool should hold ${expectedPool} parts`);

        /* 目标字两两部件对互不相同 */
        const keys = generated.targets.map((entry) => api.combinationKey(entry.parts[0], entry.parts[1]));
        assert.strictEqual(new Set(keys).size, keys.length, `level ${level} target pairs should be distinct`);

        /* 部件池互异，且包含拼出全部目标字所需的每一个部件 */
        assert.strictEqual(new Set(generated.pool).size, generated.pool.length, `level ${level} pool entries should be distinct`);
        const required = new Set();
        for (const entry of generated.targets) {
            required.add(entry.parts[0]);
            required.add(entry.parts[1]);
        }
        for (const part of required) {
            assert(generated.pool.includes(part), `level ${level} pool should contain required part ${part}`);
        }

        /* 每个目标都能在目标清单内按任意顺序拼出 */
        for (const entry of generated.targets) {
            assert.strictEqual(api.tryCombine(generated.targets, entry.parts[0], entry.parts[1]), entry);
            assert.strictEqual(api.tryCombine(generated.targets, entry.parts[1], entry.parts[0]), entry);
        }

        /* 同种子完全可复现 */
        const again = api.generateLevel(level, seed);
        assert.deepStrictEqual(again.targets, generated.targets, `level ${level} targets should be reproducible`);
        assert.deepStrictEqual(again.pool, generated.pool, `level ${level} pool should be reproducible`);
    }

    /* 抽查更多种子：部件池规模与互异性始终成立 */
    for (let level = 1; level <= api.levelCount(); level += 1) {
        const config = api.levelConfig(level);
        for (let seed = 1; seed <= 20; seed += 1) {
            const generated = api.generateLevel(level, seed * 977);
            assert.strictEqual(generated.pool.length, config.poolSize);
            assert.strictEqual(new Set(generated.pool).size, generated.pool.length);
            const required = new Set();
            for (const entry of generated.targets) {
                required.add(entry.parts[0]);
                required.add(entry.parts[1]);
            }
            for (const part of required) {
                assert(generated.pool.includes(part), `seed ${seed} pool should contain required part ${part}`);
            }
        }
    }
}

/* (d) 星级边界与存档：解锁只增不减、星级保留最大值 */
function testStarRatingAndRecords() {
    const { api, storage } = runScriptWithContext();

    assert.strictEqual(api.starRating(0), 3, 'no mistake should earn 3 stars');
    assert.strictEqual(api.starRating(1), 2, 'up to 3 mistakes should earn 2 stars');
    assert.strictEqual(api.starRating(3), 2, 'exactly 3 mistakes should still earn 2 stars');
    assert.strictEqual(api.starRating(4), 1, 'more than 3 mistakes should earn 1 star');
    assert.strictEqual(api.starRating(99), 1);

    assert.strictEqual(api.loadUnlockedLevel(), 1, 'fresh progress should start at level 1');
    api.saveUnlockedLevel(5);
    api.saveUnlockedLevel(2);
    assert.strictEqual(storage.get('hanzi-parts-unlocked-level'), '5', 'unlock level should never regress');
    assert.strictEqual(api.loadUnlockedLevel(), 5);

    assert.strictEqual(api.loadStars(3), 0, 'unplayed level should have no stars');
    api.saveStars(3, 2);
    assert.strictEqual(storage.get('hanzi-parts-stars-3'), '2');
    api.saveStars(3, 3);
    assert.strictEqual(storage.get('hanzi-parts-stars-3'), '3', 'stars should keep the maximum');
    api.saveStars(3, 1);
    assert.strictEqual(api.loadStars(3), 3, 'a worse run should not lower saved stars');
}

/* 存储异常兜底：localStorage 抛错时退化为内存存档，游戏主流程不中断 */
function testStorageFallback() {
    const elements = new Map();
    const dataWindow = {};
    vm.runInNewContext(read('hanndata.js'), { window: dataWindow });
    const document = {
        body: createElement('body'),
        createElement(tag) {
            return createElement(`${tag}-${elements.size}`);
        },
        createDocumentFragment() {
            return { children: [], appendChild(child) { this.children.push(child); } };
        },
        getElementById(id) {
            if (!elements.has(id)) elements.set(id, createElement(id));
            return elements.get(id);
        },
        addEventListener() {}
    };
    const context = {
        window: {
            localStorage: {
                getItem() {
                    throw new Error('storage blocked');
                },
                setItem() {
                    throw new Error('storage blocked');
                }
            },
            HanziPartsData: dataWindow.HanziPartsData
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
    const api = context.window.HanziApi;
    assert.strictEqual(api.loadUnlockedLevel(), 1, 'blocked storage should fall back to defaults');
    assert.strictEqual(api.saveUnlockedLevel(4), 4, 'unlocked level should track in memory when storage fails');
    assert.strictEqual(api.loadUnlockedLevel(), 4);
}

testFilesAndCatalogExist();
testWordBankQuality();
testGeneratedLevels();
testStarRatingAndRecords();
testStorageFallback();

console.log('hanzi parts smoke test passed');
