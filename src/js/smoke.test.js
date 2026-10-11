/* game-tip.js 共享组件 smoke 测试（纯 Node 手写 DOM 桩，不依赖浏览器）
 * 覆盖：首次进入展示 / 关闭记档 / 二次进入隐藏 / 问号重开 / 存储异常兜底 / 缺配置跳过 / 防重复注入
 * 运行：node src/js/smoke.test.js（命名遵循批跑器约定，tools/run-all-smoke.js 可自动发现）
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const componentCode = fs.readFileSync(path.join(__dirname, 'game-tip.js'), 'utf8');

/** 创建带 localStorage 的 window 桩 */
function createWindow(options = {}) {
    const backing = options.backing || {};
    const shouldThrow = options.shouldThrow === true;
    return {
        console,
        localStorage: {
            getItem(key) {
                if (shouldThrow) throw new Error('storage unavailable');
                return Object.prototype.hasOwnProperty.call(backing, key) ? backing[key] : null;
            },
            setItem(key, value) {
                if (shouldThrow) throw new Error('storage unavailable');
                backing[key] = String(value);
            }
        }
    };
}

/** 创建最小 document 桩：记录创建的元素，querySelector 支持本组件用到的选择器 */
function createDocument(windowObject, dataset, options = {}) {
    const created = [];
    const mainStub = {
        tag: 'main',
        children: [],
        firstChild: null,
        insertBefore(node, ref) {
            const index = ref === null ? this.children.length : this.children.indexOf(ref);
            if (index < 0) index = this.children.length;
            this.children.splice(index, 0, node);
            this.firstChild = this.children[0] || null;
            return node;
        },
        appendChild(node) { return this.insertBefore(node, null); }
    };
    /* withHeader：页头是 main 的首个子节点，模拟真实游戏页结构 */
    const headerStub = options.withHeader === true ? {
        tag: 'header',
        className: 'game-header',
        parentElement: mainStub,
        nextSibling: null,
        children: [],
        appendChild(node) { this.children.push(node); return node; }
    } : null;
    if (headerStub) mainStub.appendChild(headerStub);
    const headStub = {
        tag: 'head',
        children: [],
        appendChild(node) { this.children.push(node); return node; }
    };
    const bodyStub = {
        tag: 'body',
        children: [],
        firstChild: null,
        insertBefore(node, ref) {
            const index = ref === null ? this.children.length : this.children.indexOf(ref);
            this.children.splice(index, 0, node);
            this.firstChild = this.children[0] || null;
            return node;
        },
        appendChild(node) { return this.insertBefore(node, null); }
    };

    const documentStub = {
        currentScript: dataset ? { dataset } : null,
        head: headStub,
        body: bodyStub,
        querySelector(selector) {
            if (selector === 'main') return mainStub;
            if (selector === '.game-header') return headerStub;
            if (selector === '.game-first-tip') {
                return created.find((element) => element.className === 'game-first-tip') || null;
            }
            return null;
        },
        createElement(tag) {
            const attributes = {};
            const element = {
                tag,
                id: '',
                className: '',
                textContent: '',
                hidden: false,
                type: '',
                dataset: {},
                handlers: {},
                attributes,
                setAttribute(name, value) { attributes[name] = value; },
                getAttribute(name) { return Object.prototype.hasOwnProperty.call(attributes, name) ? attributes[name] : null; },
                addEventListener(type, handler) { this.handlers[type] = handler; },
                appendChild(child) { this.children.push(child); return child; },
                children: [],
                focus() { this.focusCalled = true; }
            };
            created.push(element);
            return element;
        }
    };
    return { documentStub, mainStub, headerStub, headStub, bodyStub, created };
}

/** 在新沙盒中执行一次组件注入，返回关键元素引用 */
function bootstrap(options = {}) {
    const windowObject = createWindow(options);
    const { documentStub, mainStub, headerStub, created } = createDocument(windowObject, options.dataset || {
        slug: 'tangram',
        text: '先点一块板，再点拼板上的位置。'
    }, options);
    vm.runInNewContext(componentCode, { document: documentStub, window: windowObject }, { filename: 'game-tip.js' });
    const tipBar = created.find((element) => element.className === 'game-first-tip');
    const closeButton = created.find((element) => element.className === 'game-first-tip__close');
    const helpButton = created.find((element) => String(element.className).split(' ').indexOf('game-tip-help') >= 0);
    const style = created.find((element) => element.tag === 'style');
    return { windowObject, mainStub, headerStub, created, tipBar, closeButton, helpButton, style };
}

function testFirstVisitShowsTip() {
    const { tipBar, helpButton, style, mainStub } = bootstrap();
    assert.ok(style, '应注入组件样式');
    assert.strictEqual(style.textContent.includes('.game-first-tip'), true, '样式应覆盖提示条');
    assert.ok(tipBar, '应创建提示条');
    assert.strictEqual(tipBar.hidden, false, '首次进入应展示提示条');
    assert.strictEqual(tipBar.getAttribute('role'), 'note', '提示条应声明 role=note');
    assert.strictEqual(mainStub.children[0], tipBar, '无页头时提示条应插入 main 首位');
    assert.ok(helpButton, '应创建右上角问号按钮');
    assert.strictEqual(helpButton.className, 'game-tip-help is-floating', '无页头时间号按钮应为浮层形态');
    assert.strictEqual(helpButton.getAttribute('aria-label'), '查看玩法说明', '问号按钮应带无障碍标签');
    assert.strictEqual(helpButton.getAttribute('aria-expanded'), 'true', '展开时 aria-expanded 应为 true');
    const paragraph = tipBar.children.find((child) => child.className === 'game-first-tip__text');
    assert.strictEqual(paragraph.textContent, '先点一块板，再点拼板上的位置。', '文案应取自 data-text 配置');
}

function testClosePersistsFlag() {
    const { closeButton, tipBar, helpButton, windowObject } = bootstrap();
    closeButton.handlers.click();
    assert.strictEqual(tipBar.hidden, true, '点击知道了后应隐藏');
    assert.strictEqual(helpButton.getAttribute('aria-expanded'), 'false', '收起后 aria-expanded 应为 false');
    assert.strictEqual(
        windowObject.localStorage.getItem('app_game_tangram_howto_seen'),
        '1',
        '关闭状态应按 store.js 命名约定写入存档'
    );
}

function testSecondVisitStaysHiddenThenHelpReopens() {
    const backing = {};
    const first = bootstrap({ backing });
    first.closeButton.handlers.click();

    const second = bootstrap({ backing });
    assert.strictEqual(second.tipBar.hidden, true, '二次进入不应再自动展示');
    assert.strictEqual(second.helpButton.getAttribute('aria-expanded'), 'false', '二次进入问号按钮为收起态');

    second.helpButton.handlers.click();
    assert.strictEqual(second.tipBar.hidden, false, '点问号应重新展开提示条');
    assert.strictEqual(second.closeButton.focusCalled, true, '重开应聚焦「知道了」按钮便于键盘操作');
}

function testStorageFailureFallsBackToMemory() {
    const { closeButton, tipBar } = bootstrap({ shouldThrow: true });
    assert.strictEqual(tipBar.hidden, false, '存储不可用时首次进入仍应展示');
    assert.doesNotThrow(() => closeButton.handlers.click(), '关闭写入失败不应抛错');
    assert.strictEqual(tipBar.hidden, true, '存储不可用时关闭仍应隐藏提示条');
}

function testMissingConfigSkipsInjection() {
    const { created } = bootstrap({ dataset: { slug: 'tangram' } });
    assert.strictEqual(created.length, 0, '缺少 data-text 时不应注入任何元素');

    const empty = bootstrap({ dataset: {} });
    assert.strictEqual(empty.created.length, 0, '完全缺配置时不应注入任何元素');
}

function testDuplicateIncludeInjectsOnce() {
    const windowObject = createWindow();
    const { documentStub, created } = createDocument(windowObject, { slug: 'tangram', text: '玩法文案。' });
    vm.runInNewContext(componentCode, { document: documentStub, window: windowObject }, { filename: 'game-tip.js' });
    vm.runInNewContext(componentCode, { document: documentStub, window: windowObject }, { filename: 'game-tip.js' });
    const tipCount = created.filter((element) => element.className === 'game-first-tip').length;
    assert.strictEqual(tipCount, 1, '重复引入脚本只应注入一条提示条');
}

function testHelpButtonLandsInGameHeader() {
    const { headerStub, mainStub, tipBar, helpButton } = bootstrap({ withHeader: true });
    assert.ok(headerStub, '应存在页头桩');
    assert.strictEqual(headerStub.children[headerStub.children.length - 1], helpButton, '有页头时间号按钮应插入页头行尾');
    assert.strictEqual(helpButton.className, 'game-tip-help', '页头形态不应带浮层类');
    assert.strictEqual(mainStub.children[0], headerStub, '页头应保持在 main 首位');
    assert.strictEqual(mainStub.children[1], tipBar, '提示条应紧随页头之后（标题在上、提示在下）');
}

function testNoMainFallsBackToBody() {
    const windowObject = createWindow();
    const { documentStub, bodyStub, created } = createDocument(windowObject, { slug: 'tangram', text: '玩法文案。' });
    documentStub.querySelector = (selector) => (selector === '.game-first-tip' ? null : null);
    vm.runInNewContext(componentCode, { document: documentStub, window: windowObject }, { filename: 'game-tip.js' });
    const tipBar = created.find((element) => element.className === 'game-first-tip');
    assert.strictEqual(bodyStub.children[0], tipBar, '无 main 时提示条应兜底挂 body 首位');
}

const tests = [
    testFirstVisitShowsTip,
    testClosePersistsFlag,
    testSecondVisitStaysHiddenThenHelpReopens,
    testStorageFailureFallsBackToMemory,
    testMissingConfigSkipsInjection,
    testDuplicateIncludeInjectsOnce,
    testHelpButtonLandsInGameHeader,
    testNoMainFallsBackToBody
];

for (const test of tests) {
    test();
    console.log(`ok - ${test.name}`);
}
console.log(`game-tip smoke: ${tests.length} 项全部通过`);
