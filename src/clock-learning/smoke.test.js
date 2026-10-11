const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = __dirname;

function read(file) {
    return fs.readFileSync(path.join(root, file), 'utf8');
}

function runScriptWithContext() {
    const storage = new Map();
    const elements = new Map();

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
            },
            replaceChildren(...children) {
                this.children = children;
            },
            setAttribute(name, value) {
                this[name] = value;
            },
            removeAttribute(name) {
                delete this[name];
            }
        };
        elements.set(id, element);
        return element;
    }

    [
        'level-text',
        'progress-text',
        'correct-text',
        'mode-chip',
        'question-prompt',
        'feedback-text',
        'clock-svg',
        'clock-ticks',
        'clock-numbers',
        'hour-hand',
        'minute-hand',
        'options-grid',
        'dial-panel',
        'hour-minus',
        'hour-plus',
        'minute-minus',
        'minute-plus',
        'confirm-btn',
        'answer-burst',
        'restart-btn',
        'levels-btn',
        'win-modal',
        'result-stars',
        'result-correct',
        'replay-btn',
        'next-btn',
        'level-modal',
        'level-grid',
        'close-levels-btn'
    ].forEach(createElement);

    const document = {
        createElement(tag) {
            return createElement(`${tag}-${elements.size}`);
        },
        createElementNS(namespace, tag) {
            return createElement(`${tag}-ns-${elements.size}`);
        },
        createDocumentFragment() {
            return { children: [], appendChild(child) { this.children.push(child); } };
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
            },
            addEventListener() {}
        },
        document,
        Math,
        setTimeout() {
            return 1;
        }
    };
    context.window.window = context.window;
    context.window.document = document;

    vm.runInNewContext(read('script.js'), context);
    return { api: context.window.ClockApi, storage };
}

/* (a) 文件与目录约定：页面元信息、共享返回脚本、自包含样式、目录注册 */
function testFilesAndCatalogExist() {
    const html = read('index.html');
    assert(html.includes('viewport-fit=cover'), 'mobile page should use viewport-fit=cover');
    assert(html.includes('user-scalable=no'), 'mobile page should disable viewport scaling');
    assert(html.includes("../js/game-back.js"), 'page should mount the shared back button script');
    assert(html.includes('<title>时钟认知 - 游戏平台</title>'), 'page title should follow hub convention');
    assert(html.includes('id="clock-svg"'), 'page should host the SVG clock');
    assert(
        html.indexOf('"script.js"') !== -1 && html.indexOf('"script.js"') < html.indexOf('"../js/game-back.js"'),
        'script.js should be loaded before the shared back button script'
    );

    const css = read('style.css');
    assert(css.includes('--ck-'), 'style should use the self-contained --ck- variable prefix');
    assert(css.includes('touch-action: none'), 'clock svg should disable touch scrolling for dragging');
    assert(css.includes('padding-top: calc(max(16px, env(safe-area-inset-top)) + 44px)'), 'header should avoid the floating back button');

    const script = read('script.js');
    assert(script.includes('generateQuestion'), 'script should expose question generation');
    assert(script.includes('windowObject.ClockApi'), 'script should expose window.ClockApi');

    const catalog = fs.readFileSync(path.join(root, '..', 'data', 'games.js'), 'utf8');
    assert(catalog.includes('slug: "clock-learning"'), 'catalog should register clock-learning');
    assert(catalog.includes('mobilePath: "src/clock-learning/index.html"'), 'catalog should route mobile to clock-learning');
}

/* (b) 角度换算往返一致性：整点 / 半点 / 五分钟全样本 + 12→0、11:55→12:00 等边界 */
function testAngleRoundTrip() {
    const { api } = runScriptWithContext();

    const samples = [];
    for (let hour = 1; hour <= 12; hour += 1) {
        samples.push([hour, 0], [hour, 30]);
        for (const minute of api.FIVE_MINUTE_VALUES) {
            samples.push([hour, minute]);
        }
    }
    /* 显式补齐边界样本：12 点计 0°、11:55 时针贴近 0°、半点/五分钟跨 12 点等 */
    samples.push([12, 0], [11, 55], [12, 55], [11, 5], [12, 30], [1, 55]);

    for (const [hour, minute] of samples) {
        const angles = api.angleFromTime(hour, minute);
        assert(angles.hourAngle >= 0 && angles.hourAngle < 360, `hour angle of ${hour}:${minute} should stay in [0, 360)`);
        assert(angles.minuteAngle >= 0 && angles.minuteAngle < 360, `minute angle of ${hour}:${minute} should stay in [0, 360)`);
        const restored = api.timeFromAngles(angles.hourAngle, angles.minuteAngle);
        assert.strictEqual(restored.hour12, hour, `roundtrip should keep hour of ${hour}:${minute}`);
        assert.strictEqual(restored.minute, minute, `roundtrip should keep minute of ${hour}:${minute}`);
    }

    assert.strictEqual(api.angleFromTime(12, 0).hourAngle, 0, '12:00 should map the hour hand to 0 degrees, not 360');
    assert.strictEqual(api.angleFromTime(11, 55).hourAngle, 357.5, '11:55 hour hand should sit 2.5 degrees before 0');
    assert.strictEqual(api.angleFromTime(3, 30).hourAngle, 105, 'half hour should push the hour hand halfway');

    assert.strictEqual(api.timeFromAngles(0, 0).hour12, 12, 'zero hour angle should restore hour 12');
    assert.strictEqual(api.timeFromAngles(357.5, 330).hour12, 11, 'exact 11:55 angles should restore 11:55');
    assert.strictEqual(api.timeFromAngles(357.5, 330).minute, 55, 'exact 11:55 angles should keep minute 55');
    /* 分针角按 5 分钟刻度就近吸附：55 分区间偏后（≥345°）归入下一整点，配合贴近 12 点的时针得 12:00 */
    assert.strictEqual(api.timeFromAngles(0, 355).minute, 0, 'minute angle 355 should snap to the next five-minute mark');
    assert.strictEqual(api.timeFromAngles(0, 355).hour12, 12, 'minute angle 355 with hour at 12 should restore 12:00');
    assert.strictEqual(api.timeFromAngles(357.5, 345).hour12, 12, '11:55-side angles should round to 12:00');
    assert.strictEqual(api.timeFromAngles(357.5, 345).minute, 0, '11:55-side minute angle should snap to 0');
}

/* (c1) generateQuestion：档位值域、选项互异含正确项、干扰项同档位、同种子可复现、认/拨各半 */
function testGenerateQuestion() {
    const { api } = runScriptWithContext();

    for (let level = 1; level <= api.levelCount(); level += 1) {
        const config = api.levelConfig(level);
        let readCount = 0;
        let dialCount = 0;

        for (let index = 0; index < api.QUESTIONS_PER_LEVEL; index += 1) {
            const seed = api.questionSeed(level, index);
            const question = api.generateQuestion(level, seed);
            const replay = api.generateQuestion(level, seed);
            assert.deepStrictEqual(question, replay, 'same seed should reproduce the same question');
            assert.strictEqual(question.type, seed % 2 === 0 ? 'read' : 'dial', 'question type should follow seed parity');
            if (question.type === 'read') readCount += 1;
            else dialCount += 1;

            assert(
                question.hour >= config.hourMin && question.hour <= config.hourMax,
                `level ${level} question hour ${question.hour} should stay in [${config.hourMin}, ${config.hourMax}]`
            );
            assert(
                config.minuteValues.includes(question.minute),
                `level ${level} question minute ${question.minute} should match the tier`
            );

            assert.strictEqual(question.options.length, 4, 'every question should carry 4 options');
            assert.strictEqual(new Set(question.options).size, 4, 'options should be pairwise distinct');
            assert(
                question.options.includes(api.formatTime(question.hour, question.minute)),
                'options should contain the correct time'
            );
            for (const label of question.options) {
                const match = /^([1-9]|1[0-2]):([0-5]\d)$/.exec(label);
                assert(match, `option ${label} should be a legal 12-hour time label`);
                const optionHour = Number(match[1]);
                const optionMinute = Number(match[2]);
                assert(optionHour >= 1 && optionHour <= 12, `option ${label} hour should stay in 1..12`);
                assert(
                    config.minuteValues.includes(optionMinute),
                    `distractor ${label} should stay inside the level tier`
                );
            }
        }

        assert.strictEqual(readCount, 4, 'each level should alternate to 4 read questions');
        assert.strictEqual(dialCount, 4, 'each level should alternate to 4 dial questions');
    }
}

/* (c2) validateDial / validateDialAngles：时刻口径与角度口径的容差内通过、超容差拒绝 */
function testValidateDialTolerances() {
    const { api } = runScriptWithContext();

    /* 时刻口径：完全一致通过；邻位（30° 起步）拒绝 */
    assert.strictEqual(api.validateDial(3, 0, { hour: 3, minute: 0 }, 1), true, 'tier1 exact time should pass');
    assert.strictEqual(api.validateDial(4, 0, { hour: 3, minute: 0 }, 1), false, 'tier1 hour off by 1 should fail');
    assert.strictEqual(api.validateDial(3, 5, { hour: 3, minute: 0 }, 1), false, 'tier1 minute off by 5 should fail');
    assert.strictEqual(api.validateDial(3, 30, { hour: 3, minute: 30 }, 5), true, 'tier2 exact time should pass');
    assert.strictEqual(api.validateDial(4, 30, { hour: 3, minute: 30 }, 5), false, 'tier2 hour off by 1 should fail');
    assert.strictEqual(api.validateDial(3, 0, { hour: 3, minute: 30 }, 5), false, 'tier2 minute off by 30 should fail');
    assert.strictEqual(api.validateDial(2, 20, { hour: 2, minute: 20 }, 9), true, 'tier3 exact time should pass');
    assert.strictEqual(api.validateDial(2, 25, { hour: 2, minute: 20 }, 9), false, 'tier3 minute off by 5 should fail');
    assert.strictEqual(api.validateDial(3, 20, { hour: 2, minute: 20 }, 9), false, 'tier3 hour off by 1 should fail');

    /* 角度口径（确认按钮实际走这条路径）：逐档验证容差边界 */
    const tier1 = { hour: 3, minute: 0 }; /* 时针 90° / 分针 0° */
    assert.strictEqual(api.validateDialAngles(100, 0, tier1, 1), true, 'tier1 hour within ±15° should pass');
    assert.strictEqual(api.validateDialAngles(106, 0, tier1, 1), false, 'tier1 hour beyond ±15° should fail');
    assert.strictEqual(api.validateDialAngles(90, 10, tier1, 1), true, 'tier1 minute within ±15° should pass');
    assert.strictEqual(api.validateDialAngles(90, 20, tier1, 1), false, 'tier1 minute beyond ±15° should fail');

    const tier2 = { hour: 3, minute: 30 }; /* 时针 105° / 分针 180° */
    assert.strictEqual(api.validateDialAngles(112, 180, tier2, 5), true, 'tier2 hour within ±10° should pass');
    assert.strictEqual(api.validateDialAngles(116, 180, tier2, 5), false, 'tier2 hour beyond ±10° should fail');
    assert.strictEqual(api.validateDialAngles(105, 188, tier2, 5), true, 'tier2 minute within ±9° should pass');
    assert.strictEqual(api.validateDialAngles(105, 190, tier2, 5), false, 'tier2 minute beyond ±9° should fail');

    const tier3 = { hour: 2, minute: 20 }; /* 时针 70° / 分针 120° */
    assert.strictEqual(api.validateDialAngles(85, 120, tier3, 9), true, 'tier3 hour within ±20° should pass');
    assert.strictEqual(api.validateDialAngles(91, 120, tier3, 9), false, 'tier3 hour beyond ±20° should fail');
    assert.strictEqual(api.validateDialAngles(70, 128, tier3, 9), true, 'tier3 minute within ±9° should pass');
    assert.strictEqual(api.validateDialAngles(70, 130, tier3, 9), false, 'tier3 minute beyond ±9° should fail');

    /* 跨 0° 方向取最短弧：355° 与 0° 只差 5°，应判通过 */
    assert.strictEqual(api.validateDialAngles(355, 0, { hour: 12, minute: 0 }, 1), true, 'angle diff should wrap around 0 degrees');
}

/* (d1) 星级边界与关卡配置递进 */
function testStarsAndLevelProgression() {
    const { api } = runScriptWithContext();

    assert.strictEqual(api.levelCount(), 12);
    assert.strictEqual(api.levelConfig(1).tier, 1, 'levels 1-4 should be the whole-hour tier');
    assert.strictEqual(api.levelConfig(4).tier, 1);
    assert.strictEqual(api.levelConfig(5).tier, 2, 'levels 5-8 should be the half-hour tier');
    assert.strictEqual(api.levelConfig(8).tier, 2);
    assert.strictEqual(api.levelConfig(9).tier, 3, 'levels 9-12 should be the five-minute tier');
    /* api 返回的数组诞生于 vm 沙箱 realm，先用 Array.from 归一到本 realm 再做深度比较 */
    assert.deepStrictEqual(Array.from(api.levelConfig(1).minuteValues), [0], 'tier 1 should only use minute 0');
    assert.deepStrictEqual(Array.from(api.levelConfig(5).minuteValues), [30], 'tier 2 should only use minute 30');
    assert.strictEqual(api.levelConfig(9).minuteValues.length, 10, 'tier 3 should cover ten five-minute values');
    assert(
        !api.levelConfig(9).minuteValues.includes(0) && !api.levelConfig(9).minuteValues.includes(30),
        'tier 3 should exclude minutes already covered by tiers 1-2'
    );
    assert(api.levelConfig(1).hourMax < api.levelConfig(3).hourMax, 'hour range should widen inside tier 1');
    assert(api.levelConfig(5).hourMax < api.levelConfig(7).hourMax, 'hour range should widen inside tier 2');
    assert(api.levelConfig(9).hourMax < api.levelConfig(11).hourMax, 'hour range should widen inside tier 3');

    assert.strictEqual(api.starRating(8, 8), 3, '8 correct answers should earn 3 stars');
    assert.strictEqual(api.starRating(7, 8), 2, '7 correct answers should earn 2 stars');
    assert.strictEqual(api.starRating(6, 8), 2, '6 correct answers should earn 2 stars');
    assert.strictEqual(api.starRating(5, 8), 1, '5 correct answers should earn 1 star');
    assert.strictEqual(api.starRating(0, 8), 1, '0 correct answers should still earn 1 star');
}

/* (d2) 存档：unlocked 只增不减、stars 保留最大值、全新进度默认第 1 关 */
function testStorageNeverRegresses() {
    const fresh = runScriptWithContext();
    assert.strictEqual(fresh.api.loadUnlockedLevel(), 1, 'fresh progress should start at level 1');
    assert.strictEqual(fresh.api.loadStars(3), 0, 'fresh progress should have no stars');

    const { api, storage } = runScriptWithContext();
    api.saveUnlockedLevel(4);
    api.saveUnlockedLevel(3);
    api.saveUnlockedLevel(4);
    assert.strictEqual(storage.get('clock-learning-unlocked-level'), '4', 'unlocked level should never regress');

    api.saveStars(2, 2);
    api.saveStars(2, 1);
    assert.strictEqual(storage.get('clock-learning-stars-2'), '2', 'stars should keep the maximum');
    api.saveStars(2, 3);
    assert.strictEqual(storage.get('clock-learning-stars-2'), '3', 'stars should upgrade to 3');
    api.saveStars(5, 1);
    assert.strictEqual(storage.get('clock-learning-stars-5'), '1', 'stars of other levels should save independently');
}

testFilesAndCatalogExist();
testAngleRoundTrip();
testGenerateQuestion();
testValidateDialTolerances();
testStarsAndLevelProgression();
testStorageNeverRegresses();

console.log('clock learning smoke test passed');
