// @ts-check
/**
 * 猜成语题库生成管道（一次性构建脚本，node 直跑，零 npm 依赖）。
 *
 * 数据来源（均为 MIT 许可）：
 * 1. 常用成语候选表：antfu/handle（汉兜）src/data/idioms.txt（约 2.6 万条四字成语）
 * 2. 拼音与释义补全：pwxcoo/chinese-xinhua data/idiom.json（约 3 万条，含 pinyin/explanation/derivation）
 *
 * 常用度策略：用 idiom.json 全部释义文本统计汉字频率（3 万条现代汉语释义是
 * 现成的常用字语料），成语得分取其四字中最差字的频率名次；名次越靠前越常用。
 * 取得分最好的 1000 条作为题库——保证 10-18 岁玩家见到的基本都是常见成语。
 *
 * 运行：node build-idiom-bank.js
 * 产物：idiom-bank.js（数据产物，请勿手改；扩题改本脚本后重新生成）
 * 缓存：源文件缓存在系统临时目录，二次运行不再联网。
 */
const fs = require('fs');
const https = require('https');
const os = require('os');
const path = require('path');

const HANDLE_URLS = [
    'https://cdn.jsdelivr.net/gh/antfu/handle@main/src/data/idioms.txt',
    'https://raw.githubusercontent.com/antfu/handle/main/src/data/idioms.txt'
];
const XINHUA_URLS = [
    'https://cdn.jsdelivr.net/gh/pwxcoo/chinese-xinhua@master/data/idiom.json',
    'https://raw.githubusercontent.com/pwxcoo/chinese-xinhua/master/data/idiom.json'
];
const TARGET_COUNT = 1000;

function fetchText(url, redirects) {
    const limit = redirects === undefined ? 3 : redirects;
    return new Promise((resolve, reject) => {
        https.get(url, (response) => {
            if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location && limit > 0) {
                response.resume();
                fetchText(response.headers.location, limit - 1).then(resolve, reject);
                return;
            }
            if (response.statusCode !== 200) {
                response.resume();
                reject(new Error(url + ' 状态码 ' + response.statusCode));
                return;
            }
            let body = '';
            response.setEncoding('utf8');
            response.on('data', (chunk) => { body += chunk; });
            response.on('end', () => resolve(body));
        }).on('error', reject);
    });
}

async function loadSource(cacheName, urls) {
    const cached = path.join(os.tmpdir(), cacheName);
    if (fs.existsSync(cached)) {
        console.log('使用缓存: ' + cached);
        return fs.readFileSync(cached, 'utf8');
    }
    let lastError = null;
    for (const url of urls) {
        try {
            console.log('拉取: ' + url);
            const text = await fetchText(url);
            fs.writeFileSync(cached, text, 'utf8');
            return text;
        } catch (error) {
            lastError = error;
            console.log('  失败: ' + error.message);
        }
    }
    throw lastError;
}

function isFourHanzi(word) {
    return /^[\u4e00-\u9fa5]{4}$/.test(word);
}

async function main() {
    const handleText = await loadSource('handle-idioms.txt', HANDLE_URLS);
    const xinhuaText = await loadSource('idiom.json', XINHUA_URLS);

    const handleWords = handleText.split(/\r?\n/).map((w) => w.trim()).filter(isFourHanzi);
    const xinhua = JSON.parse(xinhuaText);
    const byWord = new Map();
    xinhua.forEach((entry) => {
        if (isFourHanzi(entry.word)) byWord.set(entry.word, entry);
    });
    console.log('汉兜候选: ' + handleWords.length + ' 条；新华库四字成语: ' + byWord.size + ' 条');

    /* 字频语料：全部释义文本中的汉字频率 */
    const charCount = new Map();
    xinhua.forEach((entry) => {
        const text = (entry.explanation || '') + (entry.derivation || '');
        for (const ch of text) {
            if (/[\u4e00-\u9fa5]/.test(ch)) {
                charCount.set(ch, (charCount.get(ch) || 0) + 1);
            }
        }
    });
    const charRank = new Map([...charCount.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([ch], index) => [ch, index]));

    /* 候选 = 汉兜表 ∩ 新华库（拼音 4 音节 + 释义非空） */
    const candidates = [];
    const seen = new Set();
    handleWords.forEach((word) => {
        if (seen.has(word)) return;
        seen.add(word);
        const entry = byWord.get(word);
        if (!entry) return;
        const pinyin = String(entry.pinyin || '').trim().split(/\s+/);
        if (pinyin.length !== 4 || pinyin.some((p) => !p)) return;
        const explanation = String(entry.explanation || '').trim();
        if (!explanation) return;
        candidates.push({ word, pinyin, explanation, derivation: String(entry.derivation || '').trim() });
    });
    console.log('有效候选（汉兜∩新华，拼音释义齐全）: ' + candidates.length + ' 条');

    /* 得分 = 四字中最差字的频率名次，越小越常用 */
    candidates.forEach((item) => {
        item.score = Math.max(...item.word.split('').map((ch) => charRank.get(ch) || Number.MAX_SAFE_INTEGER));
    });
    candidates.sort((a, b) => a.score - b.score || a.word.localeCompare(b.word, 'zh'));
    const picked = candidates.slice(0, TARGET_COUNT);
    picked.sort((a, b) => a.word.localeCompare(b.word, 'zh'));
    console.log('入选题库: ' + picked.length + ' 条（最差字名次中位数 ' +
        picked[Math.floor(picked.length / 2)].score + ' / 总字数 ' + charRank.size + '）');

    /* 产出数据文件 */
    const lines = picked.map((item) => {
        const e = item.explanation.length > 80 ? item.explanation.slice(0, 80) + '…' : item.explanation;
        const s = item.derivation.length > 60 ? item.derivation.slice(0, 60) + '…' : item.derivation;
        return '  { w: "' + item.word + '", p: [' + item.pinyin.map((p) => '"' + p + '"').join(', ') + '], e: "' +
            e.replace(/"/g, '').replace(/\\/g, '') + '", s: "' +
            s.replace(/"/g, '').replace(/\\/g, '') + '" }';
    });
    const header = [
        '// 数据产物：猜成语题库 ' + picked.length + ' 条（勿手改；扩题请改 build-idiom-bank.js 后重新生成）。',
        '// 候选表：antfu/handle（汉兜，MIT）src/data/idioms.txt；',
        '// 拼音/释义/出处：pwxcoo/chinese-xinhua（MIT）data/idiom.json。',
        '// 常用度：按新华库 3 万条释义文本的汉字频率排序，取四字中最差字名次最优的 ' + TARGET_COUNT + ' 条。',
        'window.IDIOM_BANK = [',
        ''
    ].join('\n');
    const out = header + lines.join(',\n') + '\n];\n';
    fs.writeFileSync(path.join(__dirname, 'idiom-bank.js'), out, 'utf8');
    console.log('已写出 idiom-bank.js，字节: ' + Buffer.byteLength(out));
}

main().catch((error) => {
    console.error('生成失败: ' + error.message);
    process.exit(1);
});
