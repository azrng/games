const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = __dirname;

function read(file) {
    return fs.readFileSync(path.join(root, file), 'utf8');
}

function runScriptWithContext(storagePreset) {
    const storage = new Map(storagePreset ? Object.entries(storagePreset) : []);
    const elements = new Map();

    function createElement(tag) {
        const element = {
            id: tag,
            tag,
            textContent: '',
            hidden: false,
            disabled: false,
            dataset: {},
            className: '',
            attributes: {},
            children: [],
            handlers: {},
            classList: {
                add(c) { if (!this.set.has(c)) this.set.add(c); },
                remove(c) { this.set.delete(c); },
                toggle(c) { this.set.has(c) ? this.set.delete(c) : this.set.add(c); },
                contains(c) { return this.set.has(c); },
                set: new Set()
            },
            addEventListener(type, handler) {
                this.handlers[type] = handler;
            },
            appendChild(child) {
                this.children.push(child);
                return child;
            },
            removeChild(child) {
                const index = this.children.indexOf(child);
                if (index >= 0) this.children.splice(index, 1);
                return child;
            },
            get firstChild() {
                return this.children.length > 0 ? this.children[0] : null;
            },
            setAttribute(name, value) {
                this.attributes[name] = value;
            },
            getAttribute(name) {
                return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : null;
            },
            querySelector() {
                return null;
            },
            getBoundingClientRect() {
                return { left: 0, top: 0, width: 100, height: 100 };
            }
        };
        elements.set(tag, element);
        return element;
    }

    [
        'level-text', 'placed-text', 'best-text', 'board', 'tray', 'hint-text',
        'restart-btn', 'levels-btn', 'win-modal', 'result-stars',
        'replay-btn', 'next-btn', 'level-modal', 'level-grid', 'close-levels-btn'
    ].forEach(createElement);

    const documentStub = {
        createElement(tag) {
            return createElement(tag + '-' + elements.size);
        },
        createElementNS(ns, tag) {
            return createElement(tag + '-ns-' + elements.size);
        },
        getElementById(id) {
            return elements.get(id) || null;
        },
        addEventListener() {}
    };

    const context = {
        window: {
            localStorage: {
                getItem(key) {
                    return storage.has(key) ? storage.get(key) : null;
                },
                setItem(key, value) {
                    storage.set(key, String(value));
                }
            }
        },
        document: documentStub,
        Math,
        setTimeout() {
            return 1;
        },
        clearTimeout() {}
    };
    context.window.window = context.window;
    context.window.document = documentStub;

    vm.runInNewContext(read('script.js'), context);
    return { api: context.window.TangramApi, storage, elements };
}

/* 鞋带公式面积（关卡坐标系为真实尺寸的 2 倍，面积是真值的 4 倍） */
function polygonArea(pts) {
    let sum = 0;
    for (let i = 0; i < pts.length; i += 1) {
        const [x1, y1] = pts[i];
        const [x2, y2] = pts[(i + 1) % pts.length];
        sum += x1 * y2 - x2 * y1;
    }
    return Math.abs(sum) / 2;
}

function pointInPolygon(x, y, pts) {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i, i += 1) {
        const [xi, yi] = pts[i];
        const [xj, yj] = pts[j];
        if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
            inside = !inside;
        }
    }
    return inside;
}

/* 与关卡数据生成器一致的采样口径：步长 1，偏移 (0.37, 0.61) */
function sampleCoverage(level) {
    let single = 0;
    let multi = 0;
    for (let i = 0; i < level.w; i += 1) {
        for (let j = 0; j < level.h; j += 1) {
            const x = i + 0.37;
            const y = j + 0.61;
            let hits = 0;
            for (const slot of level.slots) {
                if (pointInPolygon(x, y, slot.pts)) hits += 1;
            }
            if (hits === 1) single += 1;
            if (hits >= 2) multi += 1;
        }
    }
    return { single, multi };
}

function testFilesAndCatalogExist() {
    const html = read('index.html');
    const script = read('script.js');
    const catalog = fs.readFileSync(path.join(root, '..', 'data', 'games.js'), 'utf8');

    assert(html.includes('viewport-fit=cover'), '页面应使用 viewport-fit=cover');
    assert(html.includes('user-scalable=no'), '移动端应禁用缩放');
    assert(html.includes('id="board"'), '页面应有拼板 SVG');
    assert(html.includes('id="tray"'), '页面应有板块托盘');
    assert(html.includes('../js/game-back.js'), '页面应挂载共享返回脚本');
    assert(script.includes('shuffleTray'), '托盘顺序应可种子复现');
    assert(script.includes('placeAtNearest'), '纯剪影模式应有最近槽位判定');
    assert(catalog.includes('slug: "tangram"'), '目录应注册七巧板');
    assert(catalog.includes('mobilePath: "src/tangram/index.html"'), '目录应把移动端路由到七巧板');
}

function testPieceDefsAndLevelsGeometry() {
    const { api } = runScriptWithContext();

    const defs = api.PIECE_DEFS;
    assert.strictEqual(defs.length, 7, '七巧板应恰有 7 块');
    const typeCount = { L: 0, M: 0, S: 0, Q: 0, P: 0 };
    for (const def of defs) typeCount[def.t] += 1;
    assert.deepStrictEqual(typeCount, { L: 2, M: 1, S: 2, Q: 1, P: 1 }, '板块类型应为 2大1中2小1方1平');

    /* 托盘标准形态面积（2 倍刻度）：大 16、中 8、小 4、方 8、平 8，合计 64 */
    const expectArea = { L: 16, M: 8, S: 4, Q: 8, P: 8 };
    for (const def of defs) {
        const area = polygonArea(def.pts);
        assert.ok(
            Math.abs(area - expectArea[def.t]) < 1e-6,
            `类型 ${def.t} 的托盘面积应为 ${expectArea[def.t]}，实测 ${area}`
        );
    }

    assert.strictEqual(api.levelCount(), 12, '应有 12 关');
    for (let level = 1; level <= api.levelCount(); level += 1) {
        const data = api.levelData(level);
        assert.strictEqual(data.slots.length, 7, `第 ${level} 关应有 7 个槽位`);
        const slotTypes = { L: 0, M: 0, S: 0, Q: 0, P: 0 };
        let total = 0;
        for (const slot of data.slots) {
            slotTypes[slot.t] += 1;
            const area = polygonArea(slot.pts);
            assert.ok(
                Math.abs(area - expectArea[slot.t]) < 1e-6,
                `第 ${level} 关 ${slot.t} 槽位面积应为 ${expectArea[slot.t]}，实测 ${area}`
            );
            total += area;
        }
        assert.deepStrictEqual(slotTypes, typeCount, `第 ${level} 关槽位类型应与七块一一对应`);
        assert.ok(Math.abs(total - 64) < 1e-6, `第 ${level} 关槽位总面积应为 64，实测 ${total}`);
        assert.strictEqual(data.samples, 64, `第 ${level} 关期望采样数应为 64`);
    }
}

/* 采样级拼合校验：每关恰好 samples 个采样格被单块覆盖，且无任何重叠覆盖 */
function testLevelTilingsAreExact() {
    const { api } = runScriptWithContext();
    for (let level = 1; level <= api.levelCount(); level += 1) {
        const data = api.levelData(level);
        const { single, multi } = sampleCoverage(data);
        assert.strictEqual(multi, 0, `第 ${level} 关存在重叠覆盖的采样格`);
        assert.strictEqual(single, data.samples, `第 ${level} 关单块覆盖采样数应为 ${data.samples}，实测 ${single}`);
    }
}

function testHintProgression() {
    const { api } = runScriptWithContext();
    for (let level = 1; level <= 4; level += 1) {
        assert.strictEqual(api.levelData(level).hint, 0, `第 ${level} 关应为彩色提示`);
    }
    for (let level = 5; level <= 8; level += 1) {
        assert.strictEqual(api.levelData(level).hint, 1, `第 ${level} 关应为灰影提示`);
    }
    for (let level = 9; level <= 12; level += 1) {
        assert.strictEqual(api.levelData(level).hint, 2, `第 ${level} 关应为纯剪影`);
    }
}

function testMatchAndNearestPlacement() {
    const { api } = runScriptWithContext();

    assert.strictEqual(api.matchPiece('L', 'L'), true, '同型板块应可匹配');
    assert.strictEqual(api.matchPiece('L', 'M'), false, '异型板块不应匹配');

    /* 纯剪影最近槽位：第 1 关（8x8 正方形），取各槽位质心验证 */
    const data = api.levelData(1);
    const centroid = api.slotCentroid(data.slots[0]);
    assert.strictEqual(
        api.placeAtNearest(1, [], centroid[0], centroid[1]),
        0,
        '距槽位 0 质心最近应返回槽位 0'
    );
    assert.strictEqual(
        api.placeAtNearest(1, [0], centroid[0], centroid[1]) !== 0,
        true,
        '已填槽位应被跳过'
    );
    const last = api.levelData(1).slots.length - 1;
    const lastCentroid = api.slotCentroid(data.slots[last]);
    const farX = lastCentroid[0] + 100;
    const farY = lastCentroid[1] + 100;
    /* 远离全部槽位的点击应落在质心距离最小的未填槽位 */
    let expected = -1;
    let bestDist = Infinity;
    data.slots.forEach((slot, index) => {
        const c = api.slotCentroid(slot);
        const dist = (c[0] - farX) ** 2 + (c[1] - farY) ** 2;
        if (dist < bestDist) {
            bestDist = dist;
            expected = index;
        }
    });
    assert.strictEqual(
        api.placeAtNearest(1, [], farX, farY),
        expected,
        '远离全部槽位的点击应落在质心距离最小的槽位'
    );
}

/* 剪影关点击回归：点击应按 x/y 二维最近槽位判定（旧实现 y 恒传 0 会系统性偏向顶部槽位） */
function testSilhouetteTapPicksNearestIn2D() {
    const { api, elements } = runScriptWithContext({ 'tangram-unlocked-level': '9' });
    const data = api.levelData(9);
    assert.strictEqual(data.hint, 2, '第 9 关应为纯剪影模式');

    function nearestSlot(x, y) {
        let best = -1;
        let bestDist = Infinity;
        data.slots.forEach((slot, index) => {
            const c = api.slotCentroid(slot);
            const dist = (c[0] - x) ** 2 + (c[1] - y) ** 2;
            if (dist < bestDist) {
                bestDist = dist;
                best = index;
            }
        });
        return best;
    }

    /* 找一个纵向可区分的点击点：真实 y 与 y=0 选出的槽位不同、且两槽位类型互斥（可用放置成败区分） */
    let tap = null;
    let expected = -1;
    for (let xi = 0.5; xi < data.w && !tap; xi += 0.5) {
        for (let yi = data.h * 0.55; yi < data.h; yi += 0.5) {
            const real = nearestSlot(xi, yi);
            const flat = nearestSlot(xi, 0);
            if (real !== flat && data.slots[real].t !== data.slots[flat].t) {
                tap = [xi, yi];
                expected = real;
                break;
            }
        }
    }
    assert.ok(tap, '第 9 关应存在纵向可区分的剪影点击点');

    /* 从托盘选中与期望槽位类型匹配的板块（托盘按钮按 shuffleTray 顺序创建） */
    const order = api.shuffleTray(9 * 7919 + 13);
    const trayButtons = elements.get('tray').children;
    let picked = false;
    for (let i = 0; i < order.length; i += 1) {
        if (api.PIECE_DEFS[order[i]].t === data.slots[expected].t) {
            trayButtons[i].handlers.click();
            picked = true;
            break;
        }
    }
    assert.ok(picked, '托盘中应存在匹配板块');

    /* stub 的 board rect 为 100x100，按关卡宽高反算 clientX/clientY */
    elements.get('board').handlers.click({
        clientX: (tap[0] / data.w) * 100,
        clientY: (tap[1] / data.h) * 100
    });
    assert.strictEqual(
        elements.get('placed-text').textContent,
        '1/7',
        '剪影关点击应放入二维最近槽位（y 参与距离计算）'
    );
}

function testShuffleTrayReproducible() {
    const { api } = runScriptWithContext();

    const a = api.shuffleTray(42);
    const b = api.shuffleTray(42);
    assert.deepStrictEqual(a, b, '同种子托盘顺序应一致');
    assert.strictEqual(a.length, 7, '托盘应含 7 块');
    assert.deepStrictEqual([...a].sort((x, y) => x - y), [0, 1, 2, 3, 4, 5, 6], '托盘应为 7 块的排列');
    assert.notDeepStrictEqual(api.shuffleTray(43), a, '不同种子顺序应不同');
}

function testStarRatingAndStorage() {
    const { api, storage } = runScriptWithContext();

    /* 零失败：不计失误，通关即三星 */
    assert.strictEqual(api.starRating(), 3, '通关即应得 3 星');
    assert.ok(!read('script.js').includes('state.mistakes'), '零失败设计不应存在失误计数状态');
    assert.ok(!read('index.html').includes('mistakes-text'), '页面不应再有失误计数卡');

    api.saveUnlockedLevel(4);
    api.saveUnlockedLevel(2);
    assert.strictEqual(storage.get('tangram-unlocked-level'), '4', '解锁进度只增不减');

    api.saveStars(2, 2);
    api.saveStars(2, 3);
    api.saveStars(2, 1);
    assert.strictEqual(storage.get('tangram-stars-2'), '3', '星级应保留最大值');

    assert.strictEqual(api.getUnlockedLevel(), 4, '应能读回解锁进度');
    assert.strictEqual(api.getStars(2), 3, '应能读回星级');
    assert.strictEqual(api.getStars(99), 0, '未玩关卡星级应为 0');
}

testFilesAndCatalogExist();
testPieceDefsAndLevelsGeometry();
testLevelTilingsAreExact();
testHintProgression();
testMatchAndNearestPlacement();
testSilhouetteTapPicksNearestIn2D();
testShuffleTrayReproducible();
testStarRatingAndStorage();

console.log('tangram smoke test passed');
