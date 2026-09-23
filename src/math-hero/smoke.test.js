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
        innerHTML: '',
        value: '',
        hidden: false,
        disabled: false,
        isConnected: true,
        offsetWidth: 0,
        offsetHeight: 0,
        offsetLeft: 0,
        offsetTop: 0,
        clientHeight: 0,
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
        querySelectorAll() {
            return [];
        },
        getBoundingClientRect() {
            return { left: 0, top: 0, width: 0, height: 0 };
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
    const selectors = new Map();

    const document = {
        createElement(tag) {
            return createElement(`${tag}-${elements.size}`);
        },
        getElementById(id) {
            if (!elements.has(id)) elements.set(id, createElement(id));
            return elements.get(id);
        },
        querySelector(selector) {
            if (!selectors.has(selector)) selectors.set(selector, createElement(selector));
            return selectors.get(selector);
        },
        addEventListener() {}
    };

    const context = {
        window: {
            innerWidth: 1280,
            innerHeight: 720,
            devicePixelRatio: 1,
            addEventListener() {},
            MathHero: null,
            mathKey: null
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
    return { context, storage, elements, selectors };
}

function testFilesAndCatalogExist() {
    const html = read('index.html');
    assert(html.includes("../../js/game-back.js"), 'page should mount the shared back button script');
    const css = read('style.css');
    const script = read('script.js');
    const catalog = fs.readFileSync(path.join(root, '..', '..', 'data', 'games.js'), 'utf8');
    const homeApp = fs.readFileSync(path.join(root, '..', '..', 'js', 'app.js'), 'utf8');

    assert(html.includes('charset="UTF-8"'), 'page should declare UTF-8');
    assert(html.includes('user-scalable=no'), 'mobile page should disable viewport scaling');
    assert(html.includes('href="style.css"'), 'page should link extracted stylesheet');
    assert(html.includes('src="script.js"'), 'page should load extracted script');
    for (const id of ['mathApp', 'mHome', 'mGame', 'mResult', 'mGrid', 'mAnswer', 'mKpGrid']) {
        assert(html.includes(`id="${id}"`), `page should keep the ${id} host element`);
    }
    assert(!html.includes('id="enCanvas"') && !html.includes('id="zhCanvas"') && !html.includes('id="hub"'),
        'standalone page should not keep the other modes markup');
    /* 页面初始不再隐藏（合体版靠隐藏整块 mathApp 切模式） */
    assert(!/<div id="mathApp" class="hidden">/.test(html), 'math app should be visible on standalone load');

    assert(css.includes('#mathApp'), 'stylesheet should keep math mode styles');
    /* 电脑端隐藏九宫格、用物理键盘输入的原有约定保留 */
    assert(css.includes('#mKeypad'), 'stylesheet should keep the keypad rule');

    for (const marker of ['LEVELS', 'nextQuestion', 'window.mathKey', 'window.MathHero', 'MathHero.enter()']) {
        assert(script.includes(marker), `script should contain ${marker}`);
    }
    /* 性能契约：主循环/火球/特效不得逐帧读布局属性，统一走几何缓存与游戏坐标 */
    assert(script.includes('refreshGeo'), 'script should cache arena geometry via refreshGeo');
    for (const legacy of ['areaH = areaEl.clientHeight', 't.el.offsetLeft', 'm.el.offsetLeft', 'm.el.offsetTop']) {
        assert(!script.includes(legacy), `hot path should not read layout via ${legacy}`);
    }
    assert(!/mode\s*[!=]==?\s*'(en|zh|math)'/.test(script), 'script should not keep cross-mode dispatch');
    assert(script.includes('mathHeroSaveV1'), 'script should keep the original save key');
    assert(script.includes("goHub() { location.href = '../../index.html'; }"), 'home buttons should navigate to the platform hub');

    assert(catalog.includes('slug: "math-hero"'), 'catalog should register math-hero');
    assert(catalog.includes('path: "src/math-hero/index.html"'), 'catalog should point to the game page');
    assert(catalog.includes('mobilePath: "src/math-hero/index.html"'), 'catalog should route mobile to the game page');
    assert(homeApp.includes('"math-hero"'), 'home page should give math-hero an icon and tag');
}

function testBootRendersHome() {
    const { selectors, context } = runScriptWithContext([]);

    assert(context.window.MathHero, 'script should expose window.MathHero');
    assert.strictEqual(typeof context.window.MathHero.enter, 'function', 'MathHero.enter should be a function');
    assert.strictEqual(typeof context.window.mathKey, 'function', 'math keyboard handler should be registered');

    /* 脚本加载即进入选关首页 */
    const grid = selectors.get('#mGrid');
    assert(grid.innerHTML.includes('1.10以内加法'), 'level grid should render the first level');
    assert(grid.innerHTML.includes('12.混合大挑战'), 'level grid should render the last level');
    assert((grid.innerHTML.match(/disabled/g) || []).length === 11, 'only the first level should be unlocked');
    assert.strictEqual(selectors.get('#mBtnSound').textContent, '🔊', 'sound toggle should default to on');
    assert(selectors.get('#mTotal').textContent.includes('0/36'), 'star total should start from zero');
    assert.strictEqual(selectors.get('#mBtnSpeak').textContent, '🗣️读题:关', 'speech should default to off');
}

function testQuestionGenerationIntegrity() {
    const { context } = runScriptWithContext([]);
    const levels = context.window.MathHero._levels;

    assert.strictEqual(levels.length, 12, 'should keep 12 arithmetic levels');
    /* 算式文本里的特殊运算符映射回普通运算后逐题验算 */
    const normalize = (text) => text.replace(/−/g, '-').replace(/×/g, '*').replace(/÷/g, '/');
    for (const level of levels) {
        assert(level.name && typeof level.goal === 'number' && typeof level.speed === 'number',
            `level ${level.name} should keep its config`);
        for (let i = 0; i < 30; i += 1) {
            const q = level.gen();
            const expected = Function(`"use strict"; return (${normalize(q.text)});`)();
            assert.strictEqual(q.ans, expected, `level ${level.name}: ${q.text} should equal ${q.ans}`);
        }
    }
}

function testKeyboardAndStateGuards() {
    const { context } = runScriptWithContext([]);
    const game = context.window.MathHero._game;

    /* 空闲态按键不应抛错也不改变状态 */
    for (const key of ['5', 'Backspace', 'Enter', 'a']) {
        context.window.mathKey({ key, preventDefault() {} });
    }
    assert.strictEqual(game.state, 'idle', 'idle state should survive stray keys');

    context.window.MathHero.enter();
    assert.strictEqual(game.state, 'idle', 'enter should reset to idle home');
}

testFilesAndCatalogExist();
testBootRendersHome();
testQuestionGenerationIntegrity();
testKeyboardAndStateGuards();

console.log('math-hero smoke test passed');
