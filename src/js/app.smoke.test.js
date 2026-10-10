const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

/* 首页年龄 + 设备筛选冒烟测试：node js/app.smoke.test.js
 * 用轻量 DOM 桩加载真实 data/games.js 与 js/app.js，驱动两行 Tab 点击验证交集筛选行为 */
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

/* 组装沙箱并依次执行 games.js 与 app.js，返回关键节点引用。
 * localStorageStub 可选：注入内存版 localStorage 以验证筛选持久化恢复 */
function setup(customCatalog, localStorageStub) {
    const elements = {};
    const windowStub = {};
    if (localStorageStub) {
        windowStub.localStorage = localStorageStub;
    }
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
        tabs: documentStub.getElementById('age-tabs'),
        deviceTabs: documentStub.getElementById('device-tabs')
    };
}

function cards(gridElement) {
    return gridElement.children.filter((child) => child.className === 'game-card');
}

function cardSlugs(gridElement) {
    return cards(gridElement).map((card) => card.dataset.slug);
}

function tabCountText(tabsElement, dimension, value) {
    const button = tabsElement.children.find((child) => child.dataset[dimension] === value);
    assert.ok(button, `缺少 ${dimension}=${value} Tab`);
    return button.children.find((child) => child.className === 'hub-tab-count').textContent;
}

function clickTab(tabsElement, dimension, value) {
    const button = tabsElement.children.find((child) => child.dataset[dimension] === value);
    assert.ok(button, `点击的 ${dimension}=${value} Tab 不存在`);
    assert.ok(typeof tabsElement.handlers.click === 'function', 'Tab 容器未绑定点击事件');
    tabsElement.handlers.click({
        target: { closest: (selector) => (selector === '.hub-tab' ? button : null) }
    });
}

/* ===== 场景 A：真实目录 ===== */
{
    const { grid, tabs, deviceTabs } = setup();

    /* 初始态：默认全部选中并渲染全量 */
    assert.strictEqual(tabs.children.length, 3, '应渲染三个年龄 Tab');
    assert.strictEqual(tabs.children[0].attributes['aria-selected'], 'true', '默认选中「全部」');
    assert.strictEqual(cardSlugs(grid).length, 16, '初始应渲染全部 16 款游戏');
    assert.deepStrictEqual(
        [
            tabCountText(tabs, 'age', 'all'),
            tabCountText(tabs, 'age', 'kids'),
            tabCountText(tabs, 'age', 'adult'),
            tabCountText(deviceTabs, 'device', 'all'),
            tabCountText(deviceTabs, 'device', 'desktop'),
            tabCountText(deviceTabs, 'device', 'mobile')
        ],
        ['16', '15', '11', '16', '16', '14'],
        '年龄 Tab 计数应为 16/15/11，设备 Tab 计数应为 16/16/14'
    );

    /* 儿童 Tab：隐藏成人向，保留儿童专属与全龄 */
    clickTab(tabs, 'age', 'kids');
    const kidsSlugs = cardSlugs(grid);
    assert.strictEqual(tabs.children[1].attributes['aria-selected'], 'true', '点击后「儿童」应选中');
    assert.strictEqual(tabs.children[0].attributes['aria-selected'], 'false', '「全部」应取消选中');
    assert.ok(!kidsSlugs.includes('typing-cannon'), '儿童 Tab 不应出现单词大炮');
    assert.ok(['math-hero', 'pinyin-typing', '2048'].every((slug) => kidsSlugs.includes(slug)),
        '儿童 Tab 应包含儿童专属与全龄游戏');
    assert.strictEqual(kidsSlugs.length, 15, '儿童 Tab 应为 15 款');
    assert.strictEqual(tabCountText(tabs, 'age', 'kids'), String(kidsSlugs.length), 'Tab 计数应与卡片数一致');

    /* 成人 Tab：隐藏儿童专属，保留成人向与全龄 */
    clickTab(tabs, 'age', 'adult');
    const adultSlugs = cardSlugs(grid);
    assert.ok(!['math-hero', 'zh-poem', 'hidden-cats', 'animal-flip-chess', 'pinyin-typing']
        .some((slug) => adultSlugs.includes(slug)), '成人 Tab 不应出现儿童专属游戏');
    assert.ok(adultSlugs.includes('typing-cannon') && adultSlugs.includes('minesweeper'),
        '成人 Tab 应包含成人向与全龄游戏');
    assert.strictEqual(adultSlugs.length, 11, '成人 Tab 应为 11 款');
    assert.strictEqual(tabCountText(tabs, 'age', 'adult'), String(adultSlugs.length), 'Tab 计数应与卡片数一致');

    /* 回到全部 */
    clickTab(tabs, 'age', 'all');
    assert.strictEqual(cardSlugs(grid).length, 16, '回到「全部」应恢复 16 款');

    /* 重复点击当前 Tab 不应重建列表 */
    const stableGrid = cardSlugs(grid);
    clickTab(tabs, 'age', 'all');
    assert.deepStrictEqual(cardSlugs(grid), stableGrid, '重复点击同一 Tab 应保持列表稳定');
}

/* ===== 场景 B：meta 缺失与非法值兜底为全龄 / 全设备 ===== */
{
    const catalog = [
        { slug: 'a-null', title: 'A', path: 'x.html', meta: null },
        { slug: 'b-no-age', title: 'B', path: 'x.html', meta: {} },
        { slug: 'c-bad-age', title: 'C', path: 'x.html', meta: { age: 'baby' } },
        { slug: 'd-bad-device', title: 'D', path: 'x.html', meta: { age: 'all', device: 'tv' } }
    ];
    const { grid, tabs, deviceTabs } = setup(catalog);
    assert.deepStrictEqual(
        [
            tabCountText(tabs, 'age', 'all'),
            tabCountText(tabs, 'age', 'kids'),
            tabCountText(tabs, 'age', 'adult'),
            tabCountText(deviceTabs, 'device', 'all'),
            tabCountText(deviceTabs, 'device', 'desktop'),
            tabCountText(deviceTabs, 'device', 'mobile')
        ],
        ['4', '4', '4', '4', '4', '4'],
        '缺省/非法 age 与 device 均应按全龄/全设备兜底计数'
    );
    ['all', 'kids', 'adult'].forEach((age) => {
        clickTab(tabs, 'age', age);
        assert.strictEqual(cards(grid).length, 4, `${age} Tab 下兜底条目应全部可见`);
    });
    ['desktop', 'mobile'].forEach((device) => {
        clickTab(deviceTabs, 'device', device);
        assert.strictEqual(cards(grid).length, 4, `${device} Tab 下兜底条目应全部可见`);
    });
}

/* ===== 场景 C：设备与年龄交集过滤 ===== */
{
    const { grid, tabs, deviceTabs } = setup();
    /* 儿童 + 移动端：kids 5 款全部可见（均为双端），
     * 全龄中 8 款双端（含 2048/五子棋）也可见 → 13 款 */
    clickTab(tabs, 'age', 'kids');
    clickTab(deviceTabs, 'device', 'mobile');
    assert.deepStrictEqual(
        cardSlugs(grid),
        [
            '2048', 'gomoku-advanced', 'color-challenge', 'sliding-puzzle',
            'hidden-cats', 'yibihua', 'animal-flip-chess', 'pipes',
            'lights-out', 'minesweeper', 'math-hero', 'zh-poem', 'pinyin-typing'
        ],
        '儿童 + 移动端交集应为 13 款（5 款儿童 + 8 款支持移动的全龄）'
    );

    /* 儿童 + 电脑端：kids 5 款全为双端可见，加全龄双端与仅电脑 tetris/maze
     * → 15 款；仅电脑端只有俄罗斯方块与迷宫 2 款全龄 */
    clickTab(deviceTabs, 'device', 'desktop');
    assert.deepStrictEqual(
        cardSlugs(grid),
        [
            '2048', 'gomoku-advanced', 'tetris', 'maze', 'color-challenge',
            'sliding-puzzle', 'hidden-cats', 'yibihua', 'animal-flip-chess', 'pipes',
            'lights-out', 'minesweeper', 'math-hero', 'zh-poem', 'pinyin-typing'
        ],
        '儿童 + 电脑端交集应为 15 款（仅电脑端的俄罗斯方块与迷宫之外全部可见）'
    );

    /* 成人 + 移动端：单词大炮（双端）+ 8 款双端全龄 = 9 款 */
    clickTab(tabs, 'age', 'adult');
    clickTab(deviceTabs, 'device', 'mobile');
    const adultMobile = cardSlugs(grid);
    assert.strictEqual(adultMobile.length, 9, '成人 + 移动端交集应为 9 款');
    assert.ok(!adultMobile.includes('tetris') && !adultMobile.includes('maze'),
        '成人 + 移动端不应包含仅电脑端的俄罗斯方块与迷宫');
    assert.ok(adultMobile.includes('typing-cannon') && adultMobile.includes('2048'),
        '成人 + 移动端应包含双端的单词大炮与 2048');

    /* 恢复默认 */
    clickTab(tabs, 'age', 'all');
    clickTab(deviceTabs, 'device', 'all');
    assert.strictEqual(cardSlugs(grid).length, 16, '两维度都回到「全部」应恢复 16 款');
}

/* ===== 场景 D：设备分类为空时的空态与独立计数 ===== */
{
    const catalog = [
        { slug: 'only-desktop', title: 'X', path: 'x.html', meta: { age: 'adult', device: 'desktop' } }
    ];
    const { grid, tabs, deviceTabs } = setup(catalog);

    /* 设备 Tab 计数独立于年龄选中态：选中成人后，移动端计数仍按全目录统计为 0 */
    clickTab(tabs, 'age', 'adult');
    assert.strictEqual(tabCountText(deviceTabs, 'device', 'mobile'), '0', '移动端计数应独立于年龄维度显示 0');

    clickTab(deviceTabs, 'device', 'mobile');
    assert.strictEqual(cards(grid).length, 0, '成人 + 移动端交集为空时不应渲染卡片');
    assert.strictEqual(grid.children[0].className, 'hub-empty', '交集为空应渲染空态提示');
}

/* ===== 场景 E：目录为空时整体不渲染 ===== */
{
    const { grid, tabs } = setup([]);
    assert.strictEqual(tabs.children.length, 0, '空目录不渲染 Tab');
    assert.strictEqual(grid.children.length, 0, '空目录不渲染卡片');
}

/* ===== 场景 F：筛选持久化（从游戏页返回平台时恢复上次选择） ===== */
{
    const store = {};
    const storageStub = {
        getItem: (key) => (key in store ? store[key] : null),
        setItem: (key, value) => { store[key] = String(value); }
    };
    store.app_game_hub_filters = JSON.stringify({ age: 'kids', device: 'mobile', scrollY: 240 });
    const { grid, tabs, deviceTabs } = setup(null, storageStub);

    /* 启动时按存储恢复「儿童 + 移动端」并渲染交集 */
    assert.strictEqual(cardSlugs(grid).length, 13, '启动时应恢复上次的儿童+移动端筛选（13 款）');
    assert.strictEqual(tabs.children[1].attributes['aria-selected'], 'true', '恢复后年龄「儿童」应选中');
    assert.strictEqual(deviceTabs.children[2].attributes['aria-selected'], 'true', '恢复后设备「移动端」应选中');

    /* 切换 Tab 后新筛选应写回存储，另一维度保持不变 */
    clickTab(tabs, 'age', 'all');
    const saved = JSON.parse(store.app_game_hub_filters);
    assert.strictEqual(saved.age, 'all', '切换后年龄应写回存储');
    assert.strictEqual(saved.device, 'mobile', '设备维度应保持不变');

    /* 存储中的非法取值按「全部」兜底，不抛错 */
    store.app_game_hub_filters = JSON.stringify({ age: 'baby', device: 'tv' });
    const fallback = setup(null, storageStub);
    assert.strictEqual(cardSlugs(fallback.grid).length, 16, '非法存储值应兜底为「全部」并渲染 16 款');
}

console.log('js/app.smoke.test.js：全部断言通过');
