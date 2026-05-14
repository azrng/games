const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const htmlPath = path.join(root, "hidden-cats", "index.html");
const catalogPath = path.join(root, "data", "games.js");

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

function extractInlineScript(html) {
    const match = html.match(/<script>\s*([\s\S]*?)\s*<\/script>/);
    assert(match, "hidden-cats page should contain an inline game script");
    return match[1];
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
        "btnRestart",
        "btnNext",
        "winOverlay",
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
            addEventListener() {},
        },
    };
}

function testPageBootsAndRegistersCatalog() {
    const html = fs.readFileSync(htmlPath, "utf8");
    const catalog = fs.readFileSync(catalogPath, "utf8");

    assert(html.includes("width=device-width"), "page should declare mobile viewport");
    assert(html.includes("user-scalable=no"), "page should disable browser zoom for touch gestures");
    assert(html.includes("id=\"gameCanvas\""), "page should include a canvas");
    assert(html.includes("id=\"btnHint\""), "page should include hint control");
    assert(html.includes("sceneSeed"), "page should generate a randomized scene seed per level");
    assert(html.includes("levelSeed"), "page should keep a stable level seed for reproducible restarts");
    assert(html.includes("catSeed"), "page should derive a dedicated cat seed");
    assert(html.includes("obstacleSeed"), "page should derive a dedicated obstacle seed");
    assert(html.includes("hintSeed"), "page should derive a dedicated hint seed");
    assert(html.includes("SCENE_TEMPLATES"), "page should define multiple scene templates");
    assert(html.includes("\"travel\", \"harbor\", \"library\""), "scene templates should include travel, harbor, and library");
    assert(html.includes("LEVEL_DIFFICULTY"), "level progression should use a difficulty configuration table");
    assert(html.includes("sceneTemplateForLevel"), "levels should select scene templates through a stable helper");
    assert(html.includes("drawHarborScene"), "page should include a harbor sketch scene");
    assert(html.includes("drawLibraryScene"), "page should include a library sketch scene");
    assert(html.includes("regionsByScene"), "cat semantic regions should vary by scene template");
    assert(html.includes("anchorSets"), "fixed cat anchors should vary by scene template");
    assert(html.includes("textureBoost"), "difficulty config should control dense linework intensity");
    assert(html.includes("minCatSpacing"), "difficulty config should control cat spacing");
    assert(html.includes("semanticCatRegions"), "cat placement should include semantic scene regions beyond fixed anchors");
    assert(html.includes("pickCatCandidates"), "cat placement should select from a larger seeded candidate pool");
    assert(html.includes("generateLevel(state.level, state.levelSeed)"), "restart should replay the current level seed");
    assert(html.includes("buildBackgroundCache"), "static sketch background should be cached before active rendering");
    assert(html.includes("requestAnimationFrame"), "hint navigation should use frame-based animation");
    assert(!html.includes("const j = randInt(0, i);"), "anchor shuffle should not use unseeded Math.random");
    assert(!html.includes("const target = unfound[Math.floor(Math.random()"), "hint target should not use unseeded Math.random");
    assert(!html.includes("CAT_ACCENT"), "hidden cats should not use a high-contrast accent color");
    assert(!html.includes("#d94f7d"), "hidden cats should not use pink fill that makes targets obvious");
    assert(html.includes("drawTravelSketchScene"), "page should render a generated sketch scene");
    assert(html.includes("drawDenseLinework"), "page should add dense sketch details for higher difficulty");
    assert(html.includes("drawCatDecoy"), "page should include cat-like decoys instead of relying on color");
    assert(catalog.includes("slug: \"hidden-cats\""), "hidden-cats should be registered in catalog");
    assert(catalog.includes("mobilePath: \"hidden-cats/index.html\""), "hidden-cats should have mobile path");

    vm.runInNewContext(extractInlineScript(html), createSandbox(), { filename: "hidden-cats/index.html" });
}

testPageBootsAndRegistersCatalog();

console.log("hidden cats smoke test passed");
