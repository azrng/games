const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = __dirname;

function read(file) {
    return fs.readFileSync(path.join(root, file), 'utf8');
}

/* 任意属性可取、任意方法可调的自动桩：覆盖 canvas 2D 上下文等重绘制依赖 */
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

function createElement(id) {
    const element = {
        id,
        textContent: '',
        innerHTML: '',
        value: '',
        hidden: false,
        disabled: false,
        width: 0,
        height: 0,
        dataset: {},
        style: {},
        className: '',
        children: [],
        addEventListener() {},
        appendChild(child) {
            this.children.push(child);
            return child;
        },
        remove() {},
        focus() {},
        setAttribute(name, value) {
            this[name] = value;
        },
        getContext() {
            return makeAutoStub();
        }
    };
    const classSet = new Set();
    const syncClassName = () => {
        element.className = Array.from(classSet).join(' ');
    };
    element.classList = {
        add(...cls) {
            cls.forEach((c) => classSet.add(c));
            syncClassName();
        },
        remove(...cls) {
            cls.forEach((c) => classSet.delete(c));
            syncClassName();
        },
        toggle(cls, force) {
            const on = force === undefined ? !classSet.has(cls) : !!force;
            if (on) classSet.add(cls);
            else classSet.delete(cls);
            syncClassName();
            return on;
        },
        contains(cls) {
            return classSet.has(cls);
        }
    };
    return element;
}

function runScriptWithContext(seedStorage = []) {
    const storage = new Map(seedStorage);
    const elements = new Map();

    const document = {
        createElement(tag) {
            return createElement(`${tag}-${elements.size}`);
        },
        getElementById(id) {
            if (!elements.has(id)) elements.set(id, createElement(id));
            return elements.get(id);
        },
        addEventListener() {}
    };

    /* requestAnimationFrame 桩不执行回调，游戏循环由断言主动驱动 */
    const context = {
        window: {
            innerWidth: 1280,
            innerHeight: 720,
            devicePixelRatio: 1,
            addEventListener() {},
            ZhPoem: null
        },
        location: { href: '' },
        localStorage: {
            getItem(key) {
                return storage.has(key) ? storage.get(key) : null;
            },
            setItem(key, value) {
                storage.set(key, String(value));
            },
            removeItem(key) {
                storage.delete(key);
            }
        },
        performance: {
            now() {
                return 0;
            }
        },
        requestAnimationFrame() {
            return 1;
        },
        setTimeout() {
            return 1;
        },
        clearTimeout() {},
        document,
        Math,
        Date,
        JSON,
        console
    };
    context.window.window = context.window;
    context.window.document = document;

    vm.runInNewContext(read('script.js'), context);
    return { context, storage, elements };
}

function testFilesAndCatalogExist() {
    const html = read('index.html');
    const css = read('style.css');
    const script = read('script.js');
    const catalog = fs.readFileSync(path.join(root, '..', 'data', 'games.js'), 'utf8');
    const homeApp = fs.readFileSync(path.join(root, '..', 'js', 'app.js'), 'utf8');

    assert(html.includes('charset="UTF-8"'), 'page should declare UTF-8');
    assert(html.includes('user-scalable=no'), 'mobile page should disable viewport scaling');
    assert(html.includes('href="style.css"'), 'page should link extracted stylesheet');
    assert(html.includes('src="script.js"'), 'page should load extracted script');
    for (const id of ['zhCanvas', 'zhMenu', 'zhOver', 'zhTopBtn', 'zhStart']) {
        assert(html.includes(`id="${id}"`), `page should keep the ${id} host element`);
    }
    assert(!html.includes('id="enCanvas"') && !html.includes('id="mathApp"') && !html.includes('id="hub"'),
        'standalone page should not keep the other modes markup');
    assert(!html.includes('zhToEn') && !html.includes('zhToMath'),
        'standalone page should not keep cross-mode switch buttons');

    /* 拆分后语文画布默认可见（合体版默认隐藏、进入时再打开） */
    assert(/#zhCanvas\s*{[^}]*display:block/.test(css), 'zh canvas should be visible by default in standalone css');

    for (const marker of ['zhNewQuestion', 'zhHitRight', 'ZH_POEMS', 'window.ZhPoem']) {
        assert(script.includes(marker), `script should contain ${marker}`);
    }
    assert(!/mode\s*[!=]==?\s*'(en|zh|math)'/.test(script), 'script should not keep cross-mode dispatch');
    for (const key of ['yuwenSaveV1']) {
        assert(script.includes(key), `script should keep the original save key ${key}`);
    }
    assert(script.includes("goHub() { location.href = '../index.html'; }"), 'home buttons should navigate to the platform hub');

    assert(catalog.includes('slug: "zh-poem"'), 'catalog should register zh-poem');
    assert(catalog.includes('path: "zh-poem/index.html"'), 'catalog should point to the game page');
    assert(catalog.includes('mobilePath: "zh-poem/index.html"'), 'catalog should route mobile to the game page');
    assert(homeApp.includes('"zh-poem"'), 'home page should give zh-poem an icon and tag');
}

function testBootRendersHome() {
    const { elements, context } = runScriptWithContext([]);

    assert(context.window.ZhPoem, 'script should expose window.ZhPoem');
    assert.strictEqual(elements.get('zhBestScore').textContent, '—', 'best score should show placeholder on empty save');
    assert.strictEqual(elements.get('zhBestGroups').textContent, '—', 'best groups should show placeholder on empty save');
}

function testQuestionGeneration() {
    const { context } = runScriptWithContext([]);
    const state = context.window.ZhPoem.state;

    for (let round = 0; round < 60; round += 1) {
        context.zhNewQuestion();
        const q = state.q;
        assert(q && q.phrase && q.phrase.length >= 2, 'question should carry a phrase');
        assert.strictEqual(q.answer, q.phrase[q.blank], 'answer should match the blank cell');
        assert(q.blank >= 0 && q.blank < q.phrase.length, 'blank index should stay inside the phrase');
        assert.strictEqual(q.chars.length, 4, 'question should offer 4 candidate tiles');
        assert.strictEqual(new Set(q.chars).size, 4, 'candidate tiles should be unique');
        assert(q.chars.includes(q.answer), 'candidates should include the correct char');
        for (const ch of q.chars) {
            assert(/^[\u4e00-\u9fa5]$/.test(ch), `candidate ${ch} should be a single Chinese char`);
        }
    }
}

function testGameplayFlow() {
    const { context } = runScriptWithContext([]);
    const state = context.window.ZhPoem.state;

    context.zhStartRun();
    assert.strictEqual(state.state, 'playing', 'start should enter playing state');
    assert(state.q, 'start should prepare the first question');

    /* 点对字：+20 分并进入飞字阶段 */
    context.zhHitRight({ ch: state.q.answer, right: true, x: 100, y: 100 });
    assert.strictEqual(state.score, 20, 'first correct hit should score 20');
    assert.strictEqual(state.stage, 1, 'correct hit should start the fly stage');
    assert.strictEqual(state.combo, 1, 'correct hit should build combo');

    /* 一组完成后进入下一组 */
    context.zhFinishGroup();
    assert.strictEqual(state.groups, 1, 'finish should count the group');
    assert.strictEqual(state.stage, 0, 'next group should return to dropping stage');
    assert(state.q && state.q !== null, 'next question should be prepared');

    /* 点错字：扣心 */
    const wrongChar = state.q.chars.find((c) => c !== state.q.answer);
    const heartsBefore = state.hearts;
    context.zhHitWrong({ ch: wrongChar, right: false, x: 100, y: 100 });
    assert.strictEqual(state.hearts, heartsBefore - 1, 'wrong hit should cost a heart');
    assert.strictEqual(state.combo, 0, 'wrong hit should reset combo');
}

testFilesAndCatalogExist();
testBootRendersHome();
testQuestionGeneration();
testGameplayFlow();

console.log('zh-poem smoke test passed');
