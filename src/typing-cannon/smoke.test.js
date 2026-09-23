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
            TypingCannon: null
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
    assert(html.includes("../../js/game-back.js"), 'page should mount the shared back button script');
    const css = read('style.css');
    const script = read('script.js');
    const catalog = fs.readFileSync(path.join(root, '..', '..', 'data', 'games.js'), 'utf8');
    const homeApp = fs.readFileSync(path.join(root, '..', '..', 'js', 'app.js'), 'utf8');

    assert(html.includes('charset="UTF-8"'), 'page should declare UTF-8');
    assert(html.includes('user-scalable=no'), 'mobile page should disable viewport scaling');
    assert(html.includes('href="style.css"'), 'page should link extracted stylesheet');
    assert(html.includes('src="script.js"'), 'page should load extracted script');
    for (const id of ['enCanvas', 'enMenu', 'enOver', 'enTopBtn', 'mobileInput', 'enGrid']) {
        assert(html.includes(`id="${id}"`), `page should keep the ${id} host element`);
    }
    assert(!html.includes('id="hub"') && !html.includes('id="mathApp"') && !html.includes('id="zhCanvas"'),
        'standalone page should not keep the other modes markup');
    assert(!html.includes('enToMath'), 'standalone page should not keep cross-mode switch buttons');

    assert(css.includes('#enCanvas'), 'stylesheet should keep the canvas styles');

    for (const marker of ['THEMES', 'handleChar', 'typingKey', 'window.TypingCannon']) {
        assert(script.includes(marker), `script should contain ${marker}`);
    }
    assert(!/mode\s*[!=]==?\s*'(en|zh|math)'/.test(script), 'script should not keep cross-mode dispatch');
    for (const key of ['typcannonLevelsV1', 'typcannon_best', 'typcannon_prac_best', 'typcannon_top3']) {
        assert(script.includes(key), `script should keep the original save key ${key}`);
    }
    assert(script.includes("goHub() { location.href = '../../index.html'; }"), 'home buttons should navigate to the platform hub');

    assert(catalog.includes('slug: "typing-cannon"'), 'catalog should register typing-cannon');
    assert(catalog.includes('path: "src/typing-cannon/index.html"'), 'catalog should point to the game page');
    assert(catalog.includes('mobilePath: "src/typing-cannon/index.html"'), 'catalog should route mobile to the game page');
    assert(homeApp.includes('"typing-cannon"'), 'home page should give typing-cannon an icon and tag');
}

function testBootRendersLevelSelect() {
    const { elements, context } = runScriptWithContext([]);

    assert(context.window.TypingCannon, 'script should expose window.TypingCannon');
    const grid = elements.get('enGrid').innerHTML;
    assert(grid.includes('1.短词热身'), 'level grid should render the first level');
    assert(!grid.split('disabled').length || grid.includes('data-i="0"'), 'level cards should carry level indexes');
    /* 只有第 1 关解锁：其余 11 张卡片带 disabled */
    assert((grid.match(/disabled/g) || []).length === 11, 'only the first level should be unlocked');
    assert(grid.includes('12.终极混战'), 'level grid should render the last level');
    assert(elements.get('menuBoardRows').innerHTML.includes('虚位以待'), 'leaderboard should show the empty hint');
}

function testThemeDataIntegrity() {
    const { context } = runScriptWithContext([]);
    const themes = context.window.TypingCannon.THEMES;

    assert.strictEqual(themes.length, 12, 'should keep 12 themed levels');
    for (let i = 0; i < 11; i += 1) {
        assert.strictEqual(themes[i].words.length, 8, `theme ${i} should keep 8 words`);
        for (const [word] of themes[i].words) {
            assert(/^[a-z]+$/.test(word), `word ${word} should be lowercase letters only`);
        }
    }
    /* 终极混战 = 前 11 关去重大乱斗（vm 数组与宿主原型不同，用序列化比较） */
    const pool = themes.slice(0, 11).flatMap((t) => t.words);
    const unique = [...new Map(pool.map((w) => [w[0], w])).values()];
    assert.strictEqual(JSON.stringify(themes[11].words), JSON.stringify(unique),
        'final mix level should be the deduped pool');
}

function testUnlockAndTyping() {
    const { context } = runScriptWithContext([]);
    const api = context.window.TypingCannon;

    assert.strictEqual(context.enUnlocked(0), true, 'first level should always be unlocked');
    assert.strictEqual(context.enUnlocked(1), false, 'second level locked without stars');
    api.save.stars[0] = 2;
    assert.strictEqual(context.enUnlocked(1), true, 'clearing a level should unlock the next');
    assert.strictEqual(context.enStarTotal(), 2, 'star total should sum saved stars');

    /* 打字主链路：开局 → 生成单词 → 打对首字母推进 → 打错累计失误 */
    context.startGame();
    assert.strictEqual(api.state.state, 'playing', 'endless start should enter playing state');
    context.spawnItem();
    const item = api.state.items[0];
    assert(item.word.length >= 2, 'spawned item should be a word');
    context.handleChar(item.word[0]);
    assert.strictEqual(item.typed, 1, 'correct letter should advance the typed cursor');
    assert.strictEqual(api.state.combo, 1, 'correct letter should build combo');
    const wrong = 'abcdefghijklmnopqrstuvwxyz'.split('').find((ch) => ch !== item.word[1]);
    context.handleChar(wrong);
    assert.strictEqual(api.state.mistakes, 1, 'unmatched letter should count a mistake');
    assert.strictEqual(api.state.combo, 0, 'mistake should reset combo');
}

testFilesAndCatalogExist();
testBootRendersLevelSelect();
testThemeDataIntegrity();
testUnlockAndTyping();

console.log('typing-cannon smoke test passed');
