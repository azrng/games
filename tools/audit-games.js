// @ts-check
/* 游戏仓库静态体检工具（仅开发用：node tools/audit-games.js，不进页面、不参与构建）
 *
 * 用途：批量回归前对全仓做一轮零依赖静态检查，覆盖人工审查中反复出现的问题类别：
 *   1. 大厅注册一致性：games.js 字段完整、slug 唯一、path/mobilePath/icon/readme 文件存在、meta 取值合法
 *   2. 页面资源引用：注册页 index.html 引用的本地 src/href 文件必须存在
 *   3. 页面基础：viewport meta（错误级）、<title>（警告级）
 *   4. 移动端触控：游戏 style.css 是否声明 touch-action（警告级）
 *   5. 存储键撞名：localStorage 调用字面量 + 游戏 slug 前缀字面量，跨游戏目录同名即错误
 *   6. 编码完整性：源码出现 U+FFFD 替换符即视为文件损坏（错误级）
 *   7. 注释语言：JS 注释含连续英文且无中文时给警告（启发式，含豁免规则）
 *   8. smoke 覆盖：每个注册游戏目录应含 smoke.test.js（警告级）
 *
 * 用法：
 *   node tools/audit-games.js            # 常规体检：错误使退出码非 0，警告不影响
 *   node tools/audit-games.js --strict   # 严格模式：警告也使退出码非 0
 *
 * 口径说明：
 *   - 以 games.js 注册表为"游戏"的唯一事实来源，未注册目录只参与编码与注释扫描
 *   - 存储键采用启发式收集（字面量 + slug 前缀），完全动态拼接的键覆盖不到，属已知盲区
 *   - 注释语言检查按文件聚合输出样例，允许误报（人工确认后处理），故仅警告级；
 *     单行超长的 vendor/压缩产物整文件跳过
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const GAMES_JS = path.join(SRC, 'data', 'games.js');
const VALID_AGES = ['all', 'kids', 'adult'];
const VALID_DEVICES = ['all', 'desktop', 'mobile'];

/** @type {{level:'ERROR'|'WARN', check:string, message:string}[]} */
const issues = [];

function error(check, message) {
    issues.push({ level: 'ERROR', check, message });
}
function warn(check, message) {
    issues.push({ level: 'WARN', check, message });
}

/** 递归收集指定扩展名文件（相对仓库根的 POSIX 路径） */
function collectFiles(dir, extensions, out = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            collectFiles(full, extensions, out);
        } else if (entry.isFile() && extensions.includes(path.extname(entry.name))) {
            out.push(path.relative(ROOT, full).split(path.sep).join('/'));
        }
    }
    return out;
}

function readRepoFile(relativePath) {
    return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

/** 依据 match 在原文中的下标换算行号（1 起） */
function lineOf(content, index) {
    return content.slice(0, index).split('\n').length;
}

function escapeRegExp(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/* ---------- 1. 大厅注册一致性 ---------- */

/** 用 vm 加载 games.js，拿到 GAME_CATALOG；加载失败返回 null */
function loadCatalog() {
    try {
        const windowObject = {};
        vm.runInNewContext(fs.readFileSync(GAMES_JS, 'utf8'), { window: windowObject });
        return windowObject.GAME_CATALOG;
    } catch (loadError) {
        error('大厅注册', `games.js 无法加载：${loadError.message}`);
        return null;
    }
}

function checkCatalog(catalog) {
    const seenSlugs = new Set();
    for (const entry of catalog) {
        const label = `slug=${entry.slug || '(缺失)'}`;
        for (const field of ['slug', 'title', 'path', 'icon', 'desc']) {
            if (!entry[field]) error('大厅注册', `${label} 缺少字段 ${field}`);
        }
        if (entry.slug && seenSlugs.has(entry.slug)) error('大厅注册', `slug 重复：${entry.slug}`);
        if (entry.slug) seenSlugs.add(entry.slug);
        for (const field of ['path', 'mobilePath', 'icon', 'readme']) {
            const value = entry[field];
            if (value && !fs.existsSync(path.join(ROOT, value))) {
                error('大厅注册', `${label} 的 ${field} 文件不存在：${value}`);
            }
        }
        if (!VALID_AGES.includes(entry.meta?.age)) error('大厅注册', `${label} meta.age 非法：${entry.meta?.age}`);
        if (!VALID_DEVICES.includes(entry.meta?.device)) error('大厅注册', `${label} meta.device 非法：${entry.meta?.device}`);
    }
    return catalog.length;
}

/* ---------- 2. 页面资源引用 / 3. 页面基础 / 4. 触控 / 8. smoke 覆盖 ---------- */

/** 判断 html 里的引用是否为需要存在的本地文件 */
function isLocalRef(ref) {
    return !/^(https?:)?\/\//i.test(ref) && !ref.startsWith('data:') && !ref.startsWith('#');
}

function checkGamePages(catalog) {
    for (const entry of catalog) {
        if (!entry.path || !fs.existsSync(path.join(ROOT, entry.path))) continue;
        const gameDir = path.dirname(entry.path);
        const html = readRepoFile(entry.path);

        // 资源引用存在性
        for (const match of html.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)) {
            const ref = match[1].split('?')[0].split('#')[0];
            if (!ref || !isLocalRef(ref)) continue;
            const resolved = path.posix.normalize(path.posix.join(gameDir.split(path.sep).join('/'), ref));
            if (!fs.existsSync(path.join(ROOT, resolved))) {
                error('资源引用', `${entry.path} 引用了不存在的文件：${ref}`);
            }
        }

        // viewport 与标题
        if (!/<meta[^>]+name=["']viewport["']/i.test(html)) {
            error('页面基础', `${entry.path} 缺少 viewport meta`);
        }
        if (!/<title>\s*\S+/.test(html)) {
            warn('页面基础', `${entry.path} 缺少 <title>`);
        }

        // 触控声明：游戏目录内任一 css 声明 touch-action 即可
        const cssFiles = collectFiles(gameDir, ['.css']);
        if (cssFiles.length > 0 && !cssFiles.some((file) => /touch-action/i.test(readRepoFile(file)))) {
            warn('移动端触控', `${gameDir} 的样式未声明 touch-action`);
        }

        // smoke 覆盖
        if (!fs.existsSync(path.join(ROOT, gameDir, 'smoke.test.js'))) {
            warn('smoke 覆盖', `${gameDir} 缺少 smoke.test.js`);
        }
    }
}

/* ---------- 5. 存储键撞名 ---------- */

/** 按游戏目录归集存储键候选：localStorage 调用字面量 + 任意 slug 前缀字面量 */
function collectStorageKeyCandidates(catalog) {
    const jsFiles = collectFiles(SRC, ['.js']).filter((file) => file !== 'src/data/games.js');
    const slugs = catalog.map((entry) => entry.slug).filter(Boolean);
    const slugLiteralRe = new RegExp("['\"`](?:" + slugs.map(escapeRegExp).join('|') + ")-[^'\"`\\n]{1,60}['\"`]", 'g');
    /** @type {Map<string, Set<string>>} 键 -> 出现的游戏目录集合 */
    const keyDirs = new Map();
    /** @type {Map<string, string>} 键 -> 首个出现位置（用于报告） */
    const keyExample = new Map();

    const remember = (key, gameDir, where) => {
        if (!keyDirs.has(key)) keyDirs.set(key, new Set());
        keyDirs.get(key).add(gameDir);
        if (!keyExample.has(key)) keyExample.set(key, where);
    };

    for (const file of jsFiles) {
        const content = readRepoFile(file);
        const gameDir = path.dirname(file);
        for (const match of content.matchAll(/(?:getItem|setItem|removeItem)\(\s*['"]([^'"\n]+)['"]/g)) {
            remember(match[1], gameDir, `${file}:${lineOf(content, match.index)}`);
        }
        for (const match of content.matchAll(slugLiteralRe)) {
            remember(match[0].slice(1, -1), gameDir, `${file}:${lineOf(content, match.index)}`);
        }
    }
    return { keyDirs, keyExample };
}

function checkStorageKeys(catalog) {
    const { keyDirs, keyExample } = collectStorageKeyCandidates(catalog);
    for (const [key, dirs] of keyDirs) {
        if (dirs.size > 1) {
            error('存储键撞名', `键 "${key}" 被 ${dirs.size} 个游戏目录使用（首见 ${keyExample.get(key)}）`);
        }
    }
}

/* ---------- 6. 编码完整性 / 7. 注释语言 ---------- */

function checkEncodingAndComments(jsFiles) {
    for (const file of jsFiles) {
        const content = readRepoFile(file);
        if (content.includes('\uFFFD')) {
            error('编码完整性', `${file} 含 U+FFFD 替换符，疑似文件损坏`);
        }
    }
    for (const file of jsFiles) {
        const content = readRepoFile(file);
        // 跳过疑似 vendor/压缩产物：单行超长即视为打包文件，注释语言不适用
        if (content.split('\n').some((line) => line.length > 400)) continue;
        const comments = [
            ...content.matchAll(/\/\/[^\n]*/g),
            ...content.matchAll(/\/\*[\s\S]*?\*\//g)
        ];
        /** @type {{line:number, text:string}[]} */
        const suspects = [];
        for (const match of comments) {
            // "http://" 里的双斜杠在字符串内、并非注释起点，跳过
            if (match.index > 0 && content[match.index - 1] === ':') continue;
            const text = match[0]
                .replace(/^\/\/\s*/, '')
                .replace(/^\/\*+/, '')
                .replace(/\*+\/$/, '')
                .replace(/^[ \t]*\*[ \t]?/gm, '')
                .trim();
            if (!text) continue;
            // 豁免：含中文、指令注记与 JSDoc 标签、URL、文件路径引用的注释
            if (/[\u4e00-\u9fff]/.test(text)) continue;
            if (/@(?:ts-|type|param|returns|typedef|property|template|see)\b|eslint|istanbul|noinspection|prettier/i.test(text)) continue;
            if (/https?:\/\//i.test(text)) continue;
            if (/[\w.-]+\.(?:js|css|html|md|json|png|svg|test)\b/i.test(text)) continue;
            if ((text.match(/[A-Za-z]/g) || []).length >= 8) {
                suspects.push({ line: lineOf(content, match.index), text });
            }
        }
        // 按文件聚合并给出样例，避免逐行刷屏；存量英文注释文件一眼可见
        if (suspects.length > 0) {
            const samples = suspects.slice(0, 3).map((item) => `行${item.line}「${item.text.slice(0, 40)}」`).join('、');
            warn('注释语言', `${file} 疑似纯英文注释 ${suspects.length} 处（${samples}${suspects.length > 3 ? ' 等' : ''}）`);
        }
    }
}

/* ---------- 主流程 ---------- */

function main() {
    const strict = process.argv.includes('--strict');
    const catalog = loadCatalog();
    if (!catalog) {
        console.error('games.js 加载失败，中止体检');
        process.exit(1);
    }

    const count = checkCatalog(catalog);
    checkGamePages(catalog);
    checkStorageKeys(catalog);
    const jsFiles = collectFiles(SRC, ['.js']);
    checkEncodingAndComments(jsFiles);

    // 按检查项分组输出
    const byCheck = new Map();
    for (const issue of issues) {
        if (!byCheck.has(issue.check)) byCheck.set(issue.check, []);
        byCheck.get(issue.check).push(issue);
    }
    console.log(`体检完成：注册游戏 ${count} 款，扫描 JS 文件 ${jsFiles.length} 个\n`);
    for (const [check, list] of byCheck) {
        console.log(`== ${check} ==`);
        for (const issue of list) {
            console.log(`${issue.level === 'ERROR' ? '[ERROR]' : '[WARN ]'} ${issue.message}`);
        }
        console.log('');
    }
    const errors = issues.filter((issue) => issue.level === 'ERROR').length;
    const warnings = issues.length - errors;
    console.log(`汇总：${errors} 项错误，${warnings} 项警告${errors === 0 && warnings === 0 ? '，全部通过 ✓' : ''}`);
    if (errors > 0 || (strict && warnings > 0)) {
        process.exit(1);
    }
}

main();
