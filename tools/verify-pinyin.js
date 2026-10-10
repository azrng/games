// @ts-check
/* 拼音字库离线校验工具（仅开发用：node tools/verify-pinyin.js，不进页面、不参与构建）
 *
 * 用途：以 pinyin-pro 为参考读音，逐一核对 src/pinyin-typing/wordbank.js 四档字库的
 *       拼音标注（p 无调字母 + t 声调 0-4），输出差异报告。
 *
 * 数据来源：运行时从 npmmirror（https://registry.npmmirror.com/pinyin-pro/latest 的
 *   dist.tarball）下载 pinyin-pro，解压到系统临时目录后 require 其 dist 产物。
 *   数据仅缓存于系统临时目录（os.tmpdir()/verify-pinyin-cache），不入仓库；
 *   缓存已存在则跳过下载；项目本身保持零 npm 依赖。
 *
 * 判定口径：
 *   - 完全一致：字母与声调均与参考读音相同（pinyin-pro 单字默认给最常用音）
 *   - 轻声豁免：一方为轻声（标注 t=0，或参考为 5 声/无调）且声母韵母一致 → 允许差异
 *   - 多音字两可：标注音属于该字全部读音之一 → 列入报告但不计错（语境两可，人工判断）
 *   - 疑似错误：其余差异（声母/韵母写错、调号标错等），退出码非 0 便于 CI 化
 *
 * 双字词（挑战档 t=0）只对字母串，声调整条豁免（页面打词不打调）。
 * 本脚本只读 wordbank.js、只出报告，不做任何修改；修正由人工完成。
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const vm = require('vm');

const CACHE_DIR = path.join(os.tmpdir(), 'verify-pinyin-cache');
const REGISTRY_URL = 'https://registry.npmmirror.com/pinyin-pro/latest';
const WORDBANK_PATH = path.join(__dirname, '..', 'src', 'pinyin-typing', 'wordbank.js');

/* ---------- 1. 获取 pinyin-pro（npmmirror tarball → 临时目录缓存） ---------- */

/** 解析 tar 包名段：去 NUL 尾与八进制空白 */
function cleanTarText(bytes) {
    return bytes.toString('utf8').replace(/\0[\s\S]*$/, '').trim();
}

/** 极简 tar 解析：只为了把 pinyin-pro 解压到缓存目录，支持普通文件/GNU 长名/pax path */
function extractTarGz(buf) {
    const tar = zlib.gunzipSync(buf);
    const files = [];
    let offset = 0;
    let pendingName = null; // GNU 'L' / pax 'x' 传给下一个文件的真实路径
    while (offset + 512 <= tar.length) {
        const header = tar.subarray(offset, offset + 512);
        if (header.every((b) => b === 0)) break; // 结束块
        const size = parseInt(cleanTarText(header.subarray(124, 136)), 8) || 0;
        const typeflag = String.fromCharCode(header[156]);
        const shortName = cleanTarText(header.subarray(0, 100));
        const prefix = cleanTarText(header.subarray(345, 500));
        offset += 512;
        const data = tar.subarray(offset, offset + size);
        offset += Math.ceil(size / 512) * 512;
        if (typeflag === 'L') {
            pendingName = data.toString('utf8').replace(/\0+$/, '');
        } else if (typeflag === 'x' || typeflag === 'g') {
            // pax 扩展头：仅关心 path 记录（形如 "N path=xxx\n"）
            const m = data.toString('utf8').match(/(?:^|\n)\d+ path=([^\n]+)/);
            if (m) pendingName = m[1];
        } else if (typeflag === '0' || typeflag === '\0') {
            files.push({ name: pendingName || (prefix ? `${prefix}/${shortName}` : shortName), data: Buffer.from(data) });
            pendingName = null;
        } else {
            pendingName = null; // 目录（5）/链接（1/2）等，跳过
        }
    }
    return files;
}

/** 下载并解压 pinyin-pro 到系统临时目录；已缓存则直接复用。返回包根目录 */
async function ensurePinyinPro() {
    const pkgFile = path.join(CACHE_DIR, 'package.json');
    if (fs.existsSync(pkgFile)) return CACHE_DIR;
    console.log(`首次运行：从 npmmirror 下载 pinyin-pro → ${CACHE_DIR}`);
    console.log('（数据仅缓存于系统临时目录，不入仓库）');
    const metaRes = await fetch(REGISTRY_URL);
    if (!metaRes.ok) throw new Error(`查询 npmmirror 失败：HTTP ${metaRes.status}`);
    const meta = await metaRes.json();
    const tarballUrl = meta.dist.tarball;
    console.log(`版本 ${meta.version} ← ${tarballUrl}`);
    const tarRes = await fetch(tarballUrl);
    if (!tarRes.ok) throw new Error(`下载 tarball 失败：HTTP ${tarRes.status}`);
    const files = extractTarGz(Buffer.from(await tarRes.arrayBuffer()));
    for (const f of files) {
        const rel = f.name.replace(/^package[\\/]/, '');
        const target = path.join(CACHE_DIR, rel);
        if (!target.startsWith(CACHE_DIR)) throw new Error(`tar 内异常路径：${f.name}`); // 防路径穿越
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, f.data);
    }
    return CACHE_DIR;
}

/** 依据 package.json 的 main 定位 dist 的 CJS 产物 */
function requirePinyinPro(pkgRoot) {
    const pkg = JSON.parse(fs.readFileSync(path.join(pkgRoot, 'package.json'), 'utf8'));
    let main = pkg.main || 'dist/index.js';
    if (!fs.existsSync(path.join(pkgRoot, main))) main = 'dist/index.js';
    return require(path.join(pkgRoot, main));
}

/* ---------- 2. 读取字库（最小 window 桩 + vm，避免 eval） ---------- */

function loadWordbank() {
    const code = fs.readFileSync(WORDBANK_PATH, 'utf8');
    const sandbox = { window: {} };
    vm.createContext(sandbox);
    vm.runInContext(code, sandbox, { filename: 'wordbank.js' });
    const bank = sandbox.window.PT_WORDBANK;
    if (!bank) throw new Error('wordbank.js 未挂载 window.PT_WORDBANK');
    return bank;
}

/* ---------- 3. 拼音对比 ---------- */

/** 归一化字母串：统一 ü→v，剔除非字母，便于对齐 */
const lettersOf = (syl) => syl.toLowerCase().replace(/ü/g, 'v').replace(/[^a-z]/g, '');

/** 参考读音（带数字调）→ { letters, tone }；pinyin-pro 轻声输出 0（兜底 5 也按轻声） */
function parseSyllable(syl) {
    const m = syl.toLowerCase().match(/^([a-zü]+)([0-5])?$/);
    if (!m) return null;
    return { letters: m[1].replace(/ü/g, 'v'), tone: m[2] ? Number(m[2]) : 5 };
}

const isNeutral = (tone) => tone === 0 || tone === 5;
/** 参考读音的可读形式：数字调号，轻声记 0 */
const label = (s) => (s ? `${s.letters}${s.tone}` : '?');

async function run() {
    const pkgRoot = await ensurePinyinPro();
    const { pinyin } = requirePinyinPro(pkgRoot);
    const version = JSON.parse(fs.readFileSync(path.join(pkgRoot, 'package.json'), 'utf8')).version;
    const bank = loadWordbank();

    /** 单字参考：最常用音 + 全部读音（多音字判断用），按字缓存 */
    const refPrimaryCache = new Map();
    const refAllCache = new Map();
    const getPrimary = (h) => {
        if (!refPrimaryCache.has(h)) refPrimaryCache.set(h, parseSyllable(pinyin(h, { toneType: 'num', type: 'string' })));
        return refPrimaryCache.get(h);
    };
    const getAll = (h) => {
        if (!refAllCache.has(h)) {
            const list = pinyin(h, { multiple: true, toneType: 'num', type: 'array' }) || [];
            refAllCache.set(h, list.map(parseSyllable).filter(Boolean));
        }
        return refAllCache.get(h);
    };

    const exact = [];
    const neutralFree = []; // 轻声豁免
    const polyphonic = []; // 多音字两可
    const suspect = []; // 疑似错误

    for (const tier of Object.keys(bank)) {
        for (const entry of bank[tier]) {
            const { h, p, t } = entry;
            if (!/[\u4e00-\u9fff]/.test(h)) { suspect.push({ tier, h, p, t, ref: '非汉字', reason: '非汉字条目' }); continue; }
            if (h.length === 2) {
                // 双字词：只对字母串，声调整条豁免（页面打词不打调）
                const refWord = (pinyin(h, { toneType: 'none', type: 'array' }) || []).map(lettersOf).join('');
                if (lettersOf(p) === refWord) exact.push({ tier, h, p, t, ref: refWord });
                else suspect.push({ tier, h, p, t, ref: refWord, reason: '词拼音字母不一致' });
                continue;
            }
            const primary = getPrimary(h);
            const all = getAll(h);
            const hit = {
                tier, h, p, t,
                ref: primary ? label(primary) : '?',
                all: all.map(label).join('/')
            };
            if (!primary) { suspect.push({ ...hit, reason: 'pinyin-pro 无参考音' }); continue; }
            const annotatedLetters = lettersOf(p);
            if (primary.letters === annotatedLetters && primary.tone === t) { exact.push(hit); continue; }
            // 轻声豁免：仅当该字确有轻声读法时，一方标轻声、另一方标调的差异允许保留
            //（晒/耐/派这类字典里根本没有轻声读法的 t=0 属调号缺失，不算轻声）
            const hasNeutralRef = all.some((s) => isNeutral(s.tone));
            if (
                primary.letters === annotatedLetters
                && (isNeutral(t) || isNeutral(primary.tone))
                && hasNeutralRef
            ) { neutralFree.push(hit); continue; }
            // 标注音属于该字全部读音之一 → 多音字两可
            if (all.some((s) => s.letters === annotatedLetters && s.tone === t)) { polyphonic.push(hit); continue; }
            // 全部读音里字母对得上但声调都对不上 → 调号错；字母对不上 → 声韵错
            suspect.push({
                ...hit,
                reason: all.some((s) => s.letters === annotatedLetters)
                    ? '调号与全部读音均不符'
                    : '声母/韵母与全部读音均不符'
            });
        }
    }

    /* ---------- 3.5 例词语境核查：以例词读音为准绳再过一遍 ---------- */
    // 单字条目带双字例词时，取例词里该字的语境读音（pinyin-pro 分词注音），
    // 声母/韵母对不上才列疑似（调号差异与轻声变调噪声不在此列，多音字两可已另行归类）。
    const contextSuspect = [];
    for (const tier of Object.keys(bank)) {
        for (const entry of bank[tier]) {
            const { h, p, t, w } = entry;
            if (h.length !== 1 || !w || ![...w].includes(h)) continue;
            const wordPinyin = pinyin(w, { toneType: 'num', type: 'array' }) || [];
            const ctx = parseSyllable(wordPinyin[[...w].indexOf(h)] || '');
            if (!ctx) { contextSuspect.push({ tier, h, p, t, w, ref: '?' }); continue; }
            if (ctx.letters !== lettersOf(p)) {
                contextSuspect.push({ tier, h, p, t, w, ref: `${label(ctx)}（词 ${w}）` });
            }
        }
    }

    /* ---------- 4. 报告 ---------- */
    const fmt = (list) => list.map((x) => `  [${x.tier}] ${x.h} 标注=${x.p}(t${x.t}) 参考=${x.ref}${x.all ? ` 全部读音=${x.all}` : ''}${x.reason ? ` → ${x.reason}` : ''}`).join('\n');
    console.log('==== 拼音字库校验报告 ====');
    console.log(`字库: ${WORDBANK_PATH}`);
    console.log(`参考: pinyin-pro@${version}（缓存于 ${CACHE_DIR}）`);
    console.log(`完全一致: ${exact.length}`);
    console.log(`轻声豁免: ${neutralFree.length}`);
    if (neutralFree.length) console.log(fmt(neutralFree));
    console.log(`多音字两可（不计错）: ${polyphonic.length}`);
    if (polyphonic.length) console.log(fmt(polyphonic));
    console.log(`例词语境疑似（以例词读音为准）: ${contextSuspect.length}`);
    if (contextSuspect.length) console.log(fmt(contextSuspect));
    console.log(`疑似错误: ${suspect.length}`);
    if (suspect.length) console.log(fmt(suspect));
    if (suspect.length || contextSuspect.length) {
        console.log('\n存在疑似错误，退出码 1（请人工核对 wordbank.js 后重跑）');
        process.exitCode = 1;
    } else {
        console.log('\n无疑似错误 ✓');
    }
}

run().catch((e) => { console.error(e); process.exit(1); });
