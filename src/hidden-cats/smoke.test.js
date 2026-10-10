const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const htmlPath = path.join(root, "hidden-cats", "index.html");
const cssPath = path.join(root, "hidden-cats", "style.css");
const jsPath = path.join(root, "hidden-cats", "script.js");
const catalogPath = path.join(root, "data", "games.js");

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

function createCanvasContext() {
    const noop = () => {};
    return {
        save: noop,
        restore: noop,
        translate: noop,
        rotate: noop,
        scale: noop,
        beginPath: noop,
        closePath: noop,
        moveTo: noop,
        lineTo: noop,
        quadraticCurveTo: noop,
        bezierCurveTo: noop,
        rect: noop,
        arc: noop,
        ellipse: noop,
        fill: noop,
        stroke: noop,
        drawImage: noop,
        fillRect: noop,
        strokeRect: noop,
        clearRect: noop,
        setTransform: noop,
        set fillStyle(value) { this._fillStyle = value; },
        get fillStyle() { return this._fillStyle; },
        set strokeStyle(value) { this._strokeStyle = value; },
        get strokeStyle() { return this._strokeStyle; },
        set lineWidth(value) { this._lineWidth = value; },
        get lineWidth() { return this._lineWidth; },
        set lineJoin(value) { this._lineJoin = value; },
        get lineJoin() { return this._lineJoin; },
        set lineCap(value) { this._lineCap = value; },
        get lineCap() { return this._lineCap; },
    };
}

function createElement(id) {
    return {
        id,
        style: {},
        textContent: "",
        innerHTML: "",
        disabled: false,
        className: "",
        classList: {
            add() {},
            remove() {},
            contains() { return false; },
        },
        appendChild() {},
        remove() {},
        addEventListener() {},
        setAttribute() {},
        scrollTop: 0,
        scrollHeight: 360,
        clientHeight: 260,
        getBoundingClientRect() {
            return { left: 0, top: 0, width: 390, height: 620 };
        },
    };
}

function createSandbox() {
    const elements = new Map();
    const context = createCanvasContext();
    const canvas = createElement("gameCanvas");
    canvas.getContext = () => context;
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 390, height: 390 });

    const wrap = createElement("canvasWrap");
    wrap.clientWidth = 390;
    wrap.clientHeight = 620;

    elements.set("#gameCanvas", canvas);
    elements.set("#canvasWrap", wrap);

    [
        "levelLabel",
        "stepCount",
        "timerDisplay",
        "progressCount",
        "progressFill",
        "hintBadge",
        "btnHint",
        "btnResetView",
        "btnLevels",
        "btnRestart",
        "btnReplay",
        "btnShare",
        "btnNext",
        "winOverlay",
        "introOverlay",
        "levelOverlay",
        "levelPanel",
        "levelGrid",
        "levelScrollHint",
        "btnIntroStart",
        "btnCloseLevels",
        "proximityToast",
        "comboToast",
        "shareToast",
        "modalStars",
        "modalRating",
        "modalLevelBest",
    ].forEach((id) => elements.set(`#${id}`, createElement(id)));

    return {
        console,
        Math,
        Date,
        setTimeout(callback) {
            callback();
            return 1;
        },
        clearTimeout() {},
        requestAnimationFrame(callback) {
            callback(16);
            return 1;
        },
        setInterval() {
            return 1;
        },
        clearInterval() {},
        performance: {
            now() { return 0; },
        },
        localStorage: {
            getItem() { return null; },
            setItem() {},
        },
        navigator: {
            clipboard: {
                writeText() { return Promise.resolve(); },
            },
        },
        document: {
            querySelector(selector) {
                const element = elements.get(selector);
                assert(element, `missing mocked element ${selector}`);
                return element;
            },
            createElement(tagName) {
                const element = createElement(tagName);
                if (tagName === "canvas") {
                    element.getContext = () => createCanvasContext();
                }
                return element;
            },
        },
        window: {
            devicePixelRatio: 2,
            addEventListener() {},
        },
    };
}

function testPageBootsAndRegistersCatalog() {
    const html = fs.readFileSync(htmlPath, "utf8");
    const css = fs.readFileSync(cssPath, "utf8");
    const js = fs.readFileSync(jsPath, "utf8");
    // 拆分后静态契约跨三个文件，统一在拼接源上断言
    const source = [html, css, js].join("\n");
    const catalog = fs.readFileSync(catalogPath, "utf8");

    assert(source.includes("width=device-width"), "page should declare mobile viewport");
    assert(source.includes("user-scalable=no"), "page should disable browser zoom for touch gestures");
    assert(source.includes("id=\"gameCanvas\""), "page should include a canvas");
    assert(source.includes("aria-label=\"找猫咪游戏画布"), "canvas should expose an accessible label");
    assert(source.includes("id=\"btnHint\""), "page should include hint control");
    assert(source.includes("id=\"introOverlay\""), "page should include first-run onboarding");
    assert(source.includes("id=\"levelOverlay\""), "page should include level picker overlay");
    assert(source.includes("id=\"btnShare\""), "win modal should include share control");
    assert(source.includes("id=\"shareToast\""), "share feedback should use a dedicated toast");
    assert(source.includes("id=\"comboToast\""), "quick finds should use a dedicated combo toast");
    assert(source.includes("id=\"levelScrollHint\""), "level picker should show a scroll hint");
    assert(source.includes("modalStars"), "win modal should show a star rating");
    assert(source.includes("proximityToast"), "miss feedback should include proximity toast");
    assert(source.includes("hintsForLevel"), "hint count should scale by level and cat count");
    assert(source.includes("calculateStars"), "completion should calculate star ratings");
    assert(source.includes("steps3: cats + Math.ceil(cats * 1.25) + 1"), "three-star click target should allow a few beginner mistakes");
    assert(source.includes("level-records"), "page should persist per-level records");
    assert(source.includes("openLevelPicker"), "page should support replaying unlocked levels");
    assert(source.includes("updateLevelScrollHint"), "level picker should update its scroll indicator");
    assert(source.includes("shareToast.textContent"), "share feedback should not reuse proximity feedback");
    assert(source.includes("whiskerSpread"), "cat variants should vary whiskers");
    assert(source.includes("traceCatOutline"), "cat poses should use continuous single-path silhouettes");
    assert(source.includes("CAT_POSE_COUNT"), "cat shapes should be driven by an explicit pose count constant");
    assert(source.includes("% CAT_POSE_COUNT"), "cat drawing should wrap variants across every pose");
    assert(source.includes("expandCatPose"), "cat placement should expand base poses into extended shapes");
    assert(source.includes("addEventListener(\"wheel\""), "desktop mouse wheel zoom should be supported");
    assert(source.includes("resizeTimer"), "resize handling should be debounced");
    assert(!source.includes(".found-ring"), "unused found-ring CSS should be removed");
    assert(source.includes("sceneSeed"), "page should generate a randomized scene seed per level");
    assert(source.includes("levelSeed"), "page should keep a stable level seed for reproducible restarts");
    assert(source.includes("catSeed"), "page should derive a dedicated cat seed");
    assert(source.includes("obstacleSeed"), "page should derive a dedicated obstacle seed");
    assert(source.includes("hintSeed"), "page should derive a dedicated hint seed");
    assert(source.includes("SCENE_TEMPLATES"), "page should define multiple scene templates");
    assert(source.includes("\"travel\", \"harbor\", \"library\", \"garden\", \"kitchen\", \"museum\""), "scene templates should include six scene categories");
    assert(source.includes("LEVEL_DIFFICULTY"), "level progression should use a difficulty configuration table");
    assert(source.includes("sceneTemplateForLevel"), "levels should select scene templates through a stable helper");
    assert(source.includes("shuffledSceneTemplatesForCycle"), "scene templates should be shuffled by seeded cycles");
    assert(source.includes("rawShuffledSceneTemplatesForCycle"), "scene template shuffling should keep a raw seeded permutation helper");
    assert(source.includes("if (shuffled[i] !== previous[i]) continue;"), "scene cycles should avoid repeating the same slot across cycles");
    assert(source.includes("drawHarborScene"), "page should include a harbor sketch scene");
    assert(source.includes("drawLibraryScene"), "page should include a library sketch scene");
    assert(source.includes("drawGardenScene"), "page should include a garden sketch scene");
    assert(source.includes("drawKitchenScene"), "page should include a kitchen sketch scene");
    assert(source.includes("drawKitchenTileBand"), "kitchen tiles should be limited to visible bands");
    assert(source.includes("drawMuseumScene"), "page should include a museum sketch scene");
    assert(source.includes("SCENE_DRAWERS"), "scene drawing should use a dispatch lookup");
    assert(source.includes("SCENE_OBSTACLES"), "obstacles should be filtered by scene theme");
    assert(source.includes("SCENE_DECOY_REGIONS"), "decoy placement should be constrained by scene geometry");
    assert(source.includes("SCENE_TEXTURES"), "scene-specific texture hooks should be available");
    assert(source.includes("drawGardenTexture"), "garden should have dedicated texture marks");
    assert(source.includes("drawKitchenTexture"), "kitchen should have dedicated texture marks");
    assert(source.includes("drawMuseumTexture"), "museum should have dedicated texture marks");
    assert(source.includes("try {") && source.includes("finally {"), "background cache should restore canvas context with try/finally");
    assert(source.includes("sceneObstacles()"), "level generation should use themed obstacle lists");
    assert(source.includes("const bhx = size * (0.72 + (random() - 0.5) * 0.04)"), "garden birdhouse should be jittered");
    assert(source.includes("花园线稿"), "scene labels should include garden");
    assert(source.includes("厨房线稿"), "scene labels should include kitchen");
    assert(source.includes("博物馆线稿"), "scene labels should include museum");
    assert(source.includes("regionsByScene"), "cat semantic regions should vary by scene template");
    assert(source.includes("anchorSets"), "fixed cat anchors should vary by scene template");
    assert(source.includes("textureBoost"), "difficulty config should control dense linework intensity");
    assert(source.includes("minCatSpacing"), "difficulty config should control cat spacing");
    assert(source.includes("semanticCatRegions"), "cat placement should include semantic scene regions beyond fixed anchors");
    assert(source.includes("pickCatCandidates"), "cat placement should select from a larger seeded candidate pool");
    assert(source.includes("generateLevel(state.level, state.levelSeed)"), "restart should replay the current level seed");
    assert(source.includes("buildBackgroundCache"), "static sketch background should be cached before active rendering");
    assert(source.includes("canvasDpr"), "canvas rendering should account for device pixel ratio");
    assert(source.includes("configureCanvasForDpr"), "canvas backing store should be configured for high DPI");
    // 高关卡大画布需按尺寸反向钳制 dpr：部分 iOS Safari 画布面积上限约 4096²，
    // 超限后主画布+背景缓存分配失败会直接白屏
    assert(source.includes("MAX_CANVAS_EDGE"), "canvas dpr should be clamped so the backing store stays inside the iOS pixel limit");
    assert(source.includes("targetCtx.setTransform(dpr, 0, 0, dpr, 0, 0)"), "high DPI canvas should use a scaled transform");
    assert(source.includes("ctx.drawImage(state.backgroundCanvas, 0, 0, size, size)"), "cached background should draw back at logical canvas size");
    assert(source.includes("registerCombo"), "quick consecutive hits should register combo state");
    assert(source.includes("maxCombo"), "best combo should be tracked for scoring");
    assert(source.includes("showComboToast"), "combo hits should show feedback");
    assert(source.includes("comboBonus"), "combo should affect star calculation");
    assert(source.includes("showHitParticles"), "hits should spawn lightweight particles");
    assert(source.includes("showWinConfetti"), "win modal should show a lightweight celebration effect");
    assert(source.includes("requestAnimationFrame"), "hint navigation should use frame-based animation");
    assert(!source.includes("const j = randInt(0, i);"), "anchor shuffle should not use unseeded Math.random");
    assert(!source.includes("const target = unfound[Math.floor(Math.random()"), "hint target should not use unseeded Math.random");
    assert(!source.includes("CAT_ACCENT"), "hidden cats should not use a high-contrast accent color");
    assert(!source.includes("#d94f7d"), "hidden cats should not use pink fill that makes targets obvious");
    assert(source.includes("drawTravelSketchScene"), "page should render a generated sketch scene");
    assert(source.includes("drawDenseLinework"), "page should add dense sketch details for higher difficulty");
    assert(source.includes("drawCatDecoy"), "page should include cat-like decoys instead of relying on color");
    assert(catalog.includes("slug: \"hidden-cats\""), "hidden-cats should be registered in catalog");
    assert(catalog.includes("mobilePath: \"src/hidden-cats/index.html\""), "hidden-cats should have mobile path");

    vm.runInNewContext(js, createSandbox(), { filename: "hidden-cats/script.js" });
}

/* 跨多关生成猫咪，断言 8 种姿势（基础 0-3 + 扩展 4-7）全部会出现在画面上 */
function testAllEightCatPosesAppear() {
    const js = fs.readFileSync(jsPath, "utf8");
    const hook = `
        const __seenPoses = new Set();
        for (let lv = 1; lv <= 40; lv++) {
            generateLevel(lv, 987654321 + lv * 7919);
            state.cats.forEach((cat) => __seenPoses.add(cat.variant % CAT_POSE_COUNT));
        }
        window.__seenPoses = [...__seenPoses].sort();
    `;
    const sandbox = createSandbox();
    sandbox.window.__seenPoses = null;
    vm.runInNewContext(js.replace("generateLevel(1);", hook), sandbox, { filename: "hidden-cats/script.js" });
    const seen = sandbox.window.__seenPoses;
    assert(Array.isArray(seen) && seen.length === 8, `all 8 cat poses should appear across levels, got: ${JSON.stringify(seen)}`);
}

testPageBootsAndRegistersCatalog();
testAllEightCatPosesAppear();

console.log("hidden cats smoke test passed");
