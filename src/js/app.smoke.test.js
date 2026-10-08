const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

/* 首页年龄筛选冒烟测试：node js/app.smoke.test.js
 * 用轻量 DOM 桩加载真实 data/games.js 与 js/app.js，驱动 Tab 点击验证筛选行为 */
const root = path.join(__dirname, '..');

function read(file) {
    return fs.readFileSync(path.join(root, file), 'utf8');
}

/* 最小 DOM 元素桩：支持 className/dataset/children 与本测试用到的少量方法 */
function makeElement(tagName) {
    const element = {
        tagName,
        className: '',
        textContent: '',
        type: '',
        dataset: {},
        attributes: {},
        handlers: {},
        children: [],
        parentElement: null,
        _isFragment: false,
        appendChild(child) {
            child.parentElement = this;
            this.children.push(child);
            return child;
        },
        /* 与真实 DOM 一致：传入 DocumentFragment 时落位其子节点 */
        replaceChildren(...nodes) {
            const flat = [];
            nodes.forEach((node) => {
                if (!node) return;
                if (node._isFragment) {
                    node.children.forEach((child) => { child.parentElement = this; });
                    flat.push(...node.children);
                } else {
                    node.parentElement = this;
                    flat.push(node);
                }
            });
            this.children = flat;
        },
        setAttribute(name, value) {
            this.attributes[name] = value;
        },
        matches(selector) {
            if (selector.startsWith('.')) {
                return this.className.split(/\s+/).includes(selector.slice(1));
            }
            return false;
        },
        closest(selector) {
            let node = this;
            while (node) {
                if (node.matches && node.matches(selector)) return node;
                node = node.parentElement;
            }
            return null;
        },
        addEventListener(type, handler) {
            this.handlers[type] = handler;
        }
    };
    return element;
}

/* 组装沙箱并依次执行 games.js 与 app.js，返回关键节点引用 */
function setup(customCatalog) {
    const elements = {};
    const windowStub = {};
    const documentStub = {
        getElementById(id) {
            if (!elements[id]) elements[id] = makeElement('div');
            return elements[id];
        },
        createElement(tag) {
            return makeElement(tag);
        },
        createDocumentFragment() {
            const fragment = makeElement('#document-fragment');
            fragment._isFragment = true;
            return fragment;
        }
    };
    const sandbox = { window: windowStub, document: documentStub };
    vm.runInNewContext(read('data/games.js'), sandbox, { filename: 'data/games.js' });
    if (customCatalog) {
        /* 测试自定义目录时替换 GAME_CATALOG（games.js 的冻结只作用于其自身数组） */
        windowStub.GAME_CATALOG = customCatalog;
    }
    vm.runInNewContext(read('js/app.js'), sandbox, { filename: 'js/app.js' });
    return {
        window: windowStub,
        grid: documentStub.getElementById('game-grid'),
        tabs: documentStub.getElementById('age-tabs')
    };
}

function cards(gridElement) {
    return gridElement.children.filter((child) => child.className === 'game-card');
}

function cardSlugs(gridElement) {
    return cards(gridElement).map((card) => card.dataset.slug);
}

function tabCountText(tabsElement, age) {
    const button = tabsElement.children.find((child) => child.dataset.age === age);
    assert.ok(button, `缺少 ${age} Tab`);
    return button.children.find((child) => child.className === 'hub-tab-count').textContent;
}

function clickTab(tabsElement, age) {
    const button = tabsElement.children.find((child) => child.dataset.age === age);
    assert.ok(button, `点击的 ${age} Tab 不存在`);
    assert.ok(typeof tabsElement.handlers.click === 'function', 'Tab 容器未绑定点击事件');
    tabsElement.handlers.click({
        target: { closest: (selector) => (selector === '.hub-tab' ? button : null) }
    });
}

/* ===== 场景 A：真实目录 ===== */
{
    const { grid, tabs } = setup();

    /* 初始态：默认全部选中并渲染全量 */
    assert.strictEqual(tabs.children.length, 3, '应渲染三个年龄 Tab');
    assert.strictEqual(tabs.children[0].attributes['aria-selected'], 'true', '默认选中「全部」');
    assert.strictEqual(cardSlugs(grid).length, 16, '初始应渲染全部 16 款游戏');
    assert.deepStrictEqual(
        [tabCountText(tabs, 'all'), tabCountText(tabs, 'kids'), tabCountText(tabs, 'adult')],
        ['16', '15', '11'],
        'Tab 计数应为 16/15/11'
    );

    /* 儿童 Tab：隐藏成人向，保留儿童专属与全龄 */
    clickTab(tabs, 'kids');
    const kidsSlugs = cardSlugs(grid);
    assert.strictEqual(tabs.children[1].attributes['aria-selected'], 'true', '点击后「儿童」应选中');
    assert.strictEqual(tabs.children[0].attributes['aria-selected'], 'false', '「全部」应取消选中');
    assert.ok(!kidsSlugs.includes('typing-cannon'), '儿童 Tab 不应出现单词大炮');
    assert.ok(['math-hero', 'pinyin-typing', '2048'].every((slug) => kidsSlugs.includes(slug)),
        '儿童 Tab 应包含儿童专属与全龄游戏');
    assert.strictEqual(kidsSlugs.length, 15, '儿童 Tab 应为 15 款');
    assert.strictEqual(tabCountText(tabs, 'kids'), String(kidsSlugs.length), 'Tab 计数应与卡片数一致');

    /* 成人 Tab：隐藏儿童专属，保留成人向与全龄 */
    clickTab(tabs, 'adult');
    const adultSlugs = cardSlugs(grid);
    assert.ok(!['math-hero', 'zh-poem', 'hidden-cats', 'animal-flip-chess', 'pinyin-typing']
        .some((slug) => adultSlugs.includes(slug)), '成人 Tab 不应出现儿童专属游戏');
    assert.ok(adultSlugs.includes('typing-cannon') && adultSlugs.includes('minesweeper'),
        '成人 Tab 应包含成人向与全龄游戏');
    assert.strictEqual(adultSlugs.length, 11, '成人 Tab 应为 11 款');
    assert.strictEqual(tabCountText(tabs, 'adult'), String(adultSlugs.length), 'Tab 计数应与卡片数一致');

    /* 回到全部 */
    clickTab(tabs, 'all');
    assert.strictEqual(cardSlugs(grid).length, 16, '回到「全部」应恢复 16 款');

    /* 重复点击当前 Tab 不应重建列表 */
    const stableGrid = cardSlugs(grid);
    clickTab(tabs, 'all');
    assert.deepStrictEqual(cardSlugs(grid), stableGrid, '重复点击同一 Tab 应保持列表稳定');
}

/* ===== 场景 B：meta 缺失与非法值兜底为全龄 ===== */
{
    const catalog = [
        { slug: 'a-null', title: 'A', path: 'x.html', meta: null },
        { slug: 'b-no-age', title: 'B', path: 'x.html', meta: {} },
        { slug: 'c-bad-age', title: 'C', path: 'x.html', meta: { age: 'baby' } }
    ];
    const { grid, tabs } = setup(catalog);
    assert.deepStrictEqual(
        [tabCountText(tabs, 'all'), tabCountText(tabs, 'kids'), tabCountText(tabs, 'adult')],
        ['3', '3', '3'],
        '缺省/非法 age 均应按全龄兜底计数'
    );
    ['all', 'kids', 'adult'].forEach((age) => {
        clickTab(tabs, age);
        assert.strictEqual(cards(grid).length, 3, `${age} Tab 下兜底条目应全部可见`);
    });
}

/* ===== 场景 C：分类为空时的空态 ===== */
{
    const catalog = [{ slug: 'only-adult', title: 'X', path: 'x.html', meta: { age: 'adult' } }];
    const { grid, tabs } = setup(catalog);
    clickTab(tabs, 'kids');
    assert.strictEqual(cards(grid).length, 0, '儿童 Tab 下不应渲染游戏卡片');
    assert.strictEqual(grid.children[0].className, 'hub-empty', '应渲染空态提示');
    assert.strictEqual(tabCountText(tabs, 'kids'), '0', '空分类计数应显示 0');
}

/* ===== 场景 D：目录为空时整体不渲染 ===== */
{
    const { grid, tabs } = setup([]);
    assert.strictEqual(tabs.children.length, 0, '空目录不渲染 Tab');
    assert.strictEqual(grid.children.length, 0, '空目录不渲染卡片');
}

console.log('js/app.smoke.test.js：全部断言通过');
