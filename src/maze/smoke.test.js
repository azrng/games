const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const catalog = fs.readFileSync(path.join(root, '..', 'data', 'games.js'), 'utf8');
const readme = fs.readFileSync(path.join(root, 'readme.md'), 'utf8');

function testThemeUsesLightGameHubPalette() {
    assert(!html.includes('--bg-a: #081325'), 'maze page should not use the old dark navy theme');
    assert(!html.includes('--bg-b: #1b2d52'), 'maze page should not use the old dark blue theme');
    assert(html.includes('--maze-page: #eff3f8'), 'maze page should use the shared light page color');
    assert(html.includes('--maze-primary: #2957c8'), 'maze page should keep the Game Hub primary blue');
    assert(html.includes('--maze-success: #2f9e44'), 'maze page should use green only as a success/accent color');
}

function testDesktopLayoutUsesSidebarAndStage() {
    assert(html.includes('id="game-sidebar"'), 'maze page should group HUD and stats in a sidebar');
    assert(/#game-sidebar\s*\{[^}]*position:\s*fixed/s.test(html), 'sidebar should be fixed on desktop');
    assert(/#game-container\s*\{[^}]*background:\s*var\(--maze-stage\)/s.test(html), 'maze stage should have a distinct stage surface');
    assert(!/#hud\s*\{[^}]*position:\s*fixed/s.test(html), 'HUD should no longer float separately');
    assert(!/#hud-stats-panel\s*\{[^}]*position:\s*fixed/s.test(html), 'stats should no longer float separately');
}

function testCatalogAndReadmeMatchDesktopOnlyMode() {
    assert(catalog.includes('桌面端专用'), 'catalog should describe maze as desktop-only');
    assert(!catalog.includes('支持移动端方向键和缩放操作'), 'catalog should not claim mobile controls');
    assert(readme.includes('桌面端专用'), 'readme should document desktop-only mode');
    assert(!readme.includes('移动端提供虚拟方向键和缩放按钮'), 'readme should not document removed mobile controls');
}

function testGameplayUpgrades() {
    assert(html.includes('id="restart-btn"'), 'sidebar should provide an in-game restart entry');
    assert(html.includes("const RECORDS_KEY = 'app_maze_records'"), 'records should persist under an app_ prefixed key');
    assert(html.includes('function computeOptimalSteps'), 'maze should compute BFS optimal steps for route rating');
    assert(html.includes('function formatDuration'), 'elapsed time should use readable minute formatting');
    assert(html.includes('id="result-rating"'), 'victory card should show a route rating');
    assert(html.includes('class="confetti"'), 'victory card should include the confetti layer');
    assert(html.includes('function stepHeldMovement'), 'held keys should drive continuous movement');
}

function testDesktopOnlyCodeHealth() {
    assert(!html.includes('carvePassages'), 'maze generation should use the iterative carver, not recursion');
    assert(html.includes('stack.pop()'), 'maze generation should backtrack via an explicit stack');
    assert(!html.includes('mobile-controls'), 'dead mobile control markup/refs should be removed');
    assert(!html.includes('zoomLevel'), 'dead zoom state should be removed');
    assert(!html.includes('bindMobileButton'), 'unused mobile button binder should be removed');
    assert(!html.includes('isMobileViewportMode'), 'dead mobile viewport branch should be removed');
}

testThemeUsesLightGameHubPalette();
testDesktopLayoutUsesSidebarAndStage();
testCatalogAndReadmeMatchDesktopOnlyMode();
testGameplayUpgrades();
testDesktopOnlyCodeHealth();

console.log('maze smoke test passed');
