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

function testCatalogAndReadmeMatchTouchSupport() {
    // games.js 属于本测试不可修改的文件：其「桌面端专用」文案与 device: "desktop"
    // 需在主会话同步（device 改 all、desc 去掉桌面端专用字样），同步后再补充 catalog 正向断言
    assert(!catalog.includes('支持移动端方向键和缩放操作'), 'catalog should not claim removed zoom controls');
    assert(readme.includes('虚拟方向键'), 'readme should document the touch D-pad');
    assert(readme.includes('路径最远'), 'readme should document the BFS farthest endpoint');
    assert(!readme.includes('桌面端专用'), 'readme should no longer claim desktop-only mode');
    assert(!readme.includes('移动端提供虚拟方向键和缩放按钮'), 'readme should not document removed zoom controls');
}

function testGameplayUpgrades() {
    assert(html.includes('id="restart-btn"'), 'sidebar should provide an in-game restart entry');
    assert(html.includes("const RECORDS_KEY = 'app_maze_records'"), 'records should persist under an app_ prefixed key');
    assert(html.includes('function computeDistanceField'), 'maze should compute a BFS distance field from the start');
    assert(html.includes('distances[endY][endX]'), 'optimal steps should reuse the BFS distance to the endpoint');
    assert(!/Math\.abs\(x - startX\)\s*\+\s*Math\.abs\(y - startY\)/.test(html), 'endpoint should be the true BFS farthest cell, not the Manhattan approximation');
    assert(html.includes('function formatDuration'), 'elapsed time should use readable minute formatting');
    assert(html.includes('id="result-rating"'), 'victory card should show a route rating');
    assert(html.includes('class="confetti"'), 'victory card should include the confetti layer');
    assert(html.includes('function stepHeldMovement'), 'held keys should drive continuous movement');
}

function testMobileSupport() {
    assert(html.includes('id="dpad"'), 'page should provide an on-screen D-pad for touch play');
    assert(html.includes("'pointerdown'"), 'D-pad should trigger movement on pointerdown');
    assert(html.includes('function pressDirectionKey') && html.includes('function releaseDirectionKey'), 'keyboard and virtual D-pad should share the same held-movement path');
    assert(html.includes('body.maze-playing #dpad'), 'D-pad should only be visible while a game is in progress');
    assert(/\(hover:\s*none\)\s*and\s*\(pointer:\s*coarse\)/.test(html), 'D-pad should be limited to coarse-pointer touch devices');
    assert(html.includes('env(safe-area-inset-bottom)') && html.includes('env(safe-area-inset-right)'), 'D-pad should avoid notches with safe-area insets');
    assert(html.includes('viewport-fit=cover'), 'viewport should extend into safe areas so env() insets apply');
    assert(!html.includes('isMobileDevice'), 'UA-based device blocking should be removed');
    assert(!html.includes('unsupported-overlay'), 'the desktop-only unsupported overlay should be removed');
    assert(!html.includes('mazeSupported'), 'the desktop-only gate flag should be removed');
}

function testRemovedCodeHealth() {
    assert(!html.includes('carvePassages'), 'maze generation should use the iterative carver, not recursion');
    assert(html.includes('stack.pop()'), 'maze generation should backtrack via an explicit stack');
    assert(!html.includes('mobile-controls'), 'dead mobile control markup/refs should be removed');
    assert(!html.includes('zoomLevel'), 'dead zoom state should be removed');
    assert(!html.includes('bindMobileButton'), 'unused mobile button binder should be removed');
    assert(!html.includes('isMobileViewportMode'), 'dead mobile viewport branch should be removed');
    assert(!html.includes('computeOptimalSteps'), 'the standalone BFS helper should be folded into the distance field');
    assert(!html.includes('showUnsupportedState'), 'the unsupported-state branch should be removed');
}

/* ===== 行为验证：以下挖洞与 BFS 距离场是 index.html 内联脚本的镜像副本 =====
 * 用于在 Node 环境验证算法性质；修改游戏内对应实现时必须同步这里，否则断言会失真。 */

// 可播种伪随机数（mulberry32），保证测试可复现
function createSeededRandom(seed) {
    let state = seed >>> 0;
    return function nextRandom() {
        state = (state + 0x6D2B79F5) | 0;
        let mixed = state;
        mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
        mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
        return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
    };
}

// 镜像 index.html generateMaze 的迭代回溯挖洞逻辑
function carveMazeLikeGame(width, height, nextRandom) {
    const maze = Array(height).fill(null).map(() => Array(width).fill(1));
    const startX = 1;
    const startY = 1;
    maze[startY][startX] = 0;

    const stack = [[startX, startY]];

    while (stack.length > 0) {
        const [x, y] = stack[stack.length - 1];
        const candidates = [[0, -2], [2, 0], [0, 2], [-2, 0]].filter(([dx, dy]) => {
            const nx = x + dx;
            const ny = y + dy;
            return nx > 0 && nx < width - 1 && ny > 0 && ny < height - 1 && maze[ny][nx] === 1;
        });

        if (candidates.length === 0) {
            stack.pop();
            continue;
        }

        const [dx, dy] = candidates[Math.floor(nextRandom() * candidates.length)];
        maze[y + dy / 2][x + dx / 2] = 0;
        maze[y + dy][x + dx] = 0;
        stack.push([x + dx, y + dy]);
    }

    return maze;
}

// 镜像 index.html computeDistanceField 的全图 BFS 逻辑
function computeDistanceFieldLikeGame(maze, startX, startY) {
    const height = maze.length;
    const width = maze[0].length;
    const distances = Array(height).fill(null).map(() => Array(width).fill(-1));
    const queue = [[startX, startY]];
    distances[startY][startX] = 0;

    for (let head = 0; head < queue.length; head++) {
        const [x, y] = queue[head];

        for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
            const nx = x + dx;
            const ny = y + dy;

            if (nx >= 0 && nx < width && ny >= 0 && ny < height && maze[ny][nx] === 0 && distances[ny][nx] === -1) {
                distances[ny][nx] = distances[y][x] + 1;
                queue.push([nx, ny]);
            }
        }
    }

    return distances;
}

function testBFSEndpointBeatsManhattanApproximation() {
    // 覆盖三档难度起步尺寸与高关卡扩张后的代表性尺寸，每档跑多个随机种子
    const sizes = [13, 19, 27, 35, 45];

    for (const size of sizes) {
        for (let seed = 1; seed <= 20; seed++) {
            const maze = carveMazeLikeGame(size, size, createSeededRandom(seed));
            const distances = computeDistanceFieldLikeGame(maze, 1, 1);
            let bfsFarthest = 0;
            let manhattanFarthest = 0;
            let endX = 1;
            let endY = 1;

            for (let y = 0; y < size; y++) {
                for (let x = 0; x < size; x++) {
                    if (maze[y][x] !== 0) {
                        continue;
                    }

                    // 镜像游戏内的终点选取规则：首个更大距离胜出
                    if (distances[y][x] > bfsFarthest) {
                        bfsFarthest = distances[y][x];
                        endX = x;
                        endY = y;
                    }

                    const manhattan = Math.abs(x - 1) + Math.abs(y - 1);
                    if (manhattan > manhattanFarthest) {
                        manhattanFarthest = manhattan;
                    }
                }
            }

            assert(bfsFarthest >= manhattanFarthest, `seed ${seed} size ${size}: BFS 终点的路径距离应不小于曼哈顿近似`);
            assert(bfsFarthest > 0, `seed ${seed} size ${size}: 终点不应落在起点自身`);
            assert(distances[endY][endX] === bfsFarthest, `seed ${seed} size ${size}: 选取的终点必须可达且为 BFS 最远格`);
        }
    }
}

testThemeUsesLightGameHubPalette();
testDesktopLayoutUsesSidebarAndStage();
testCatalogAndReadmeMatchTouchSupport();
testGameplayUpgrades();
testMobileSupport();
testRemovedCodeHealth();
testBFSEndpointBeatsManhattanApproximation();

console.log('maze smoke test passed');
