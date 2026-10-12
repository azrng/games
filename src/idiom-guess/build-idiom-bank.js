// @ts-check
/**
 * 猜成语题库生成管道（一次性构建脚本，node 直跑，零 npm 依赖；npmmirror 拉取用全局 fetch，需 Node 18+）。
 *
 * 数据来源（均为 MIT 许可；URL 固定到最后一次改动对应文件的 commit，保证可复现）：
 * 1. 常用成语候选表：antfu/handle（汉兜）src/data/idioms.txt @ 8adfdae（2022-04-12）
 * 2. 拼音与释义补全：pwxcoo/chinese-xinhua data/idiom.json @ 8de1001（2018-12-16）
 *    （两个 commit 均为对应文件的最后一次提交，main/master 内容与其一致，已核对与缓存逐字节相同）
 *
 * 选材策略（v2，修复“最差字一票否决”缺陷）：
 * - 字频语料：新华库全部释义文本的汉字频率（约 3 万条现代汉语释义）；
 * - 成语得分 = 四字字频名次（1 起）的几何平均，越小越常用：单个低频字不再
 *   一票否决著名成语，但整体用字生僻仍被显著惩罚；
 * - 保底成语：内置 41 条人工校验的教材级成语强制进库（前 30 条与 script.js
 *   的 FALLBACK_BANK 同源，另 11 条为教材常用补充，拼音沿用人工校订值），
 *   先放保底再按得分填充至 1000 条；
 * - 拼音校验：以 pinyin-pro 为参考读音，逐字核对声母韵母（忽略声调比较；
 *   轻声豁免：de/le/men/zi/ge/zhe 等常用轻声音节允许缺调号，pinyin-pro 标轻
 *   声 0 调的读音因只比字母天然放行；“一/不”按全库统一约定标原调并豁免语
 *   境校验），校验不过的条目剔除（保底清单除外）；
 * - 多音字语境读音：内置人工校订覆盖表（见 PINYIN_OVERRIDES）；
 * - 释义/出处不截断（源数据最长约 120 字），避免半句截断与引号不配对。
 *
 * 运行：node build-idiom-bank.js
 * 产物：idiom-bank.js（数据产物，请勿手改；扩题改本脚本后重新生成）
 * 缓存：源文件与 pinyin-pro 均缓存在系统临时目录，二次运行不再联网。
 */
const fs = require('fs');
const https = require('https');
const os = require('os');
const path = require('path');
const zlib = require('zlib');

const HANDLE_URLS = [
    'https://cdn.jsdelivr.net/gh/antfu/handle@8adfdaedb263d9cc156cf6b316c546eb8141bd6c/src/data/idioms.txt',
    'https://raw.githubusercontent.com/antfu/handle/8adfdaedb263d9cc156cf6b316c546eb8141bd6c/src/data/idioms.txt'
];
const XINHUA_URLS = [
    'https://cdn.jsdelivr.net/gh/pwxcoo/chinese-xinhua@8de1001aa499cd65fb97ef8712550188c0297a08/data/idiom.json',
    'https://raw.githubusercontent.com/pwxcoo/chinese-xinhua/8de1001aa499cd65fb97ef8712550188c0297a08/data/idiom.json'
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

/* ---------- pinyin-pro 参考读音（npmmirror tarball → 系统临时目录，与 tools/verify-pinyin.js 同模式） ---------- */

const PINYIN_CACHE_DIR = path.join(os.tmpdir(), 'verify-pinyin-cache');
const REGISTRY_URL = 'https://registry.npmmirror.com/pinyin-pro/latest';

/** 解析 tar 包名段：去 NUL 尾与八进制空白 */
function cleanTarText(bytes) {
    return bytes.toString('utf8').replace(/\0[\s\S]*$/, '').trim();
}

/** 极简 tar 解析：只为把 pinyin-pro 解压到缓存目录，支持普通文件/GNU 长名/pax path */
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
    const pkgFile = path.join(PINYIN_CACHE_DIR, 'package.json');
    if (fs.existsSync(pkgFile)) return PINYIN_CACHE_DIR;
    console.log('首次运行：从 npmmirror 下载 pinyin-pro → ' + PINYIN_CACHE_DIR);
    const metaRes = await fetch(REGISTRY_URL);
    if (!metaRes.ok) throw new Error('查询 npmmirror 失败：HTTP ' + metaRes.status);
    const meta = await metaRes.json();
    const tarballUrl = meta.dist.tarball;
    console.log('版本 ' + meta.version + ' ← ' + tarballUrl);
    const tarRes = await fetch(tarballUrl);
    if (!tarRes.ok) throw new Error('下载 tarball 失败：HTTP ' + tarRes.status);
    const files = extractTarGz(Buffer.from(await tarRes.arrayBuffer()));
    for (const f of files) {
        const rel = f.name.replace(/^package[\\/]/, '');
        const target = path.join(PINYIN_CACHE_DIR, rel);
        if (!target.startsWith(PINYIN_CACHE_DIR)) throw new Error('tar 内异常路径：' + f.name); // 防路径穿越
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, f.data);
    }
    return PINYIN_CACHE_DIR;
}

/** 依据 package.json 的 main 定位 dist 的 CJS 产物 */
function requirePinyinPro(pkgRoot) {
    const pkg = JSON.parse(fs.readFileSync(path.join(pkgRoot, 'package.json'), 'utf8'));
    let main = pkg.main || 'dist/index.js';
    if (!fs.existsSync(path.join(pkgRoot, main))) main = 'dist/index.js';
    return require(path.join(pkgRoot, main));
}

/* ---------- 保底著名成语（人工校验条目，强制进库） ----------
 * 前 30 条与 script.js 的 FALLBACK_BANK 同源；后 11 条为教材常用成语补充——
 * 纯字频几何平均对含实字的常用成语（贯/鸦/栩/津等）仍系统性压分，语料字频
 * 无法识别“教材级常用”，故以人工清单保底（拼音按词典人工校订，并与新华库
 * 标注逐条核对一致）。 */
const FALLBACK_IDIOMS = [
    { w: '一心一意', p: ['yī', 'xīn', 'yī', 'yì'], e: '只有一个心眼儿，没有别的考虑。' },
    { w: '十全十美', p: ['shí', 'quán', 'shí', 'měi'], e: '各方面都非常完美，毫无缺陷。' },
    { w: '万象更新', p: ['wàn', 'xiàng', 'gēng', 'xīn'], e: '一切事物都改换了样子，出现了一番新气象。' },
    { w: '三心二意', p: ['sān', 'xīn', 'èr', 'yì'], e: '犹豫不决或意志不坚定。' },
    { w: '不约而同', p: ['bù', 'yuē', 'ér', 'tóng'], e: '事先没有商量，彼此的意见或行动却完全一致。' },
    { w: '不可思议', p: ['bù', 'kě', 'sī', 'yì'], e: '不可想象，不能理解。' },
    { w: '东张西望', p: ['dōng', 'zhāng', 'xī', 'wàng'], e: '向四处张望，形容心神不安地到处看。' },
    { w: '举世闻名', p: ['jǔ', 'shì', 'wén', 'míng'], e: '全世界都有名。' },
    { w: '亡羊补牢', p: ['wáng', 'yáng', 'bǔ', 'láo'], e: '羊丢失后再修补羊圈，比喻出了问题以后想办法补救。' },
    { w: '井底之蛙', p: ['jǐng', 'dǐ', 'zhī', 'wā'], e: '比喻见识短浅的人。' },
    { w: '画蛇添足', p: ['huà', 'shé', 'tiān', 'zú'], e: '蛇画好了又添上脚，比喻做多余的事反而坏事。' },
    { w: '守株待兔', p: ['shǒu', 'zhū', 'dài', 'tù'], e: '比喻死守经验不知变通，妄想不劳而获。' },
    { w: '掩耳盗铃', p: ['yǎn', 'ěr', 'dào', 'líng'], e: '捂住耳朵偷铃铛，比喻自己欺骗自己。' },
    { w: '杯弓蛇影', p: ['bēi', 'gōng', 'shé', 'yǐng'], e: '把酒杯里的弓影当成蛇，比喻疑神疑鬼自相惊扰。' },
    { w: '水滴石穿', p: ['shuǐ', 'dī', 'shí', 'chuān'], e: '水不停滴石头能滴穿，比喻坚持不懈终有成效。' },
    { w: '百发百中', p: ['bǎi', 'fā', 'bǎi', 'zhòng'], e: '每次都命中目标，形容射箭或射击非常准。' },
    { w: '目瞪口呆', p: ['mù', 'dèng', 'kǒu', 'dāi'], e: '瞪着眼睛说不出话，形容受惊而愣住的样子。' },
    { w: '破釜沉舟', p: ['pò', 'fǔ', 'chén', 'zhōu'], e: '砸锅沉船，比喻下定决心不留退路。' },
    { w: '胸有成竹', p: ['xiōng', 'yǒu', 'chéng', 'zhú'], e: '画竹前心中已有竹的形象，比喻做事之前已有主张。' },
    { w: '自相矛盾', p: ['zì', 'xiāng', 'máo', 'dùn'], e: '比喻言行前后抵触。' },
    { w: '叶公好龙', p: ['yè', 'gōng', 'hào', 'lóng'], e: '比喻口头上说爱好某事物，实际并不真爱好。' },
    { w: '对牛弹琴', p: ['duì', 'niú', 'tán', 'qín'], e: '比喻对不懂道理的人讲道理，白费口舌。' },
    { w: '愚公移山', p: ['yú', 'gōng', 'yí', 'shān'], e: '下定决心不怕困难，坚持不懈就一定能成功。' },
    { w: '惊弓之鸟', p: ['jīng', 'gōng', 'zhī', 'niǎo'], e: '被弓箭吓怕了的鸟，比喻受过惊吓遇事惶恐的人。' },
    { w: '雪中送炭', p: ['xuě', 'zhōng', 'sòng', 'tàn'], e: '下雪天送炭取暖，比喻在别人急需时给以帮助。' },
    { w: '鹤立鸡群', p: ['hè', 'lì', 'jī', 'qún'], e: '像鹤站在鸡群中，比喻才能或仪表十分出众。' },
    { w: '画龙点睛', p: ['huà', 'lóng', 'diǎn', 'jīng'], e: '比喻写文章或讲话在关键处点明要旨使之生动。' },
    { w: '刻舟求剑', p: ['kè', 'zhōu', 'qiú', 'jiàn'], e: '比喻拘泥固执，不懂随着情势变化处理问题。' },
    { w: '望梅止渴', p: ['wàng', 'méi', 'zhǐ', 'kě'], e: '想到梅子生津止渴，比喻用空想安慰自己。' },
    { w: '塞翁失马', p: ['sài', 'wēng', 'shī', 'mǎ'], e: '比喻坏事在一定条件下可以变成好事。' },
    /* —— 以下 11 条为教材常用成语补充（拼音人工校订，与新华库标注一致） —— */
    { w: '全神贯注', p: ['quán', 'shén', 'guàn', 'zhù'], e: '全部精神集中在一点，形容注意力高度集中。' },
    { w: '兴高采烈', p: ['xìng', 'gāo', 'cǎi', 'liè'], e: '形容兴致高涨、情绪热烈。' },
    { w: '鸦雀无声', p: ['yā', 'què', 'wú', 'shēng'], e: '连乌鸦麻雀的叫声都没有，形容非常安静。' },
    { w: '情不自禁', p: ['qíng', 'bù', 'zì', 'jīn'], e: '感情激动得不能控制，强调完全被某种感情所支配。' },
    { w: '栩栩如生', p: ['xǔ', 'xǔ', 'rú', 'shēng'], e: '形容艺术形象非常逼真，如同活的一样。' },
    { w: '全力以赴', p: ['quán', 'lì', 'yǐ', 'fù'], e: '把全部力量都投入进去。' },
    { w: '半途而废', p: ['bàn', 'tú', 'ér', 'fèi'], e: '路走到一半停下来，比喻做事中途停止、不能坚持。' },
    { w: '小心翼翼', p: ['xiǎo', 'xīn', 'yì', 'yì'], e: '原形容严肃虔敬的样子，现形容举动十分谨慎、丝毫不敢疏忽。' },
    { w: '迫不及待', p: ['pò', 'bù', 'jí', 'dài'], e: '急迫得不能再等待，形容心情急切。' },
    { w: '恋恋不舍', p: ['liàn', 'liàn', 'bù', 'shě'], e: '形容非常留恋、舍不得分离。' },
    { w: '津津有味', p: ['jīn', 'jīn', 'yǒu', 'wèi'], e: '形容兴味特别浓厚。' }
];

/* ---------- 多音字语境读音人工校订（覆盖表；成语若因重排未进库则对应项自然不生效） ---------- */

const PINYIN_OVERRIDES = new Map([
    // “中”作“击中/中伤”解读 zhòng
    ['一语中人', ['yī', 'yǔ', 'zhòng', 'rén']],
    ['十发十中', ['shí', 'fā', 'shí', 'zhòng']],
    ['多言或中', ['duō', 'yán', 'huò', 'zhòng']],
    // “为”表“成为”读 wéi，表“为了/替”读 wèi
    ['三人为众', ['sān', 'rén', 'wéi', 'zhòng']],
    ['为国为民', ['wèi', 'guó', 'wèi', 'mín']],
    // “作”作“作坊”义读 zuō
    ['五行八作', ['wǔ', 'háng', 'bā', 'zuō']],
    // “将”指将领读 jiàng
    ['神兵天将', ['shén', 'bīng', 'tiān', 'jiàng']],
    // “相”指宰相读 xiàng
    ['七相五公', ['qī', 'xiàng', 'wǔ', 'gōng']],
    // “好”表“喜爱”读 hào
    ['乐道好古', ['lè', 'dào', 'hào', 'gǔ']],
    // “少”表“年纪轻”读 shào
    ['三老四少', ['sān', 'lǎo', 'sì', 'shào']],
    // “分”表“名分/本分”读 fèn
    ['正名定分', ['zhèng', 'míng', 'dìng', 'fèn']],
    // “了”表“完全/明白”读 liǎo，“当”表“妥当”读 dàng
    ['了然无闻', ['liǎo', 'rán', 'wú', 'wén']],
    ['一见了然', ['yī', 'jiàn', 'liǎo', 'rán']],
    ['七了八当', ['qī', 'liǎo', 'bā', 'dàng']]
]);

/* ---------- 拼音校验 ---------- */

/** 固定次级键：Unicode 码点比较，保证排序跨平台可复现 */
function cmpWord(a, b) {
    return a < b ? -1 : a > b ? 1 : 0;
}

/** 带调标注音节 → { letters（ü 归一为 v），tone（'1'-'4'，缺调号记 null）} */
const TONE_MARKS = { '\u0304': '1', '\u0301': '2', '\u030c': '3', '\u0300': '4' };
function parseAnnotated(syllable) {
    let letters = '';
    let tone = null;
    for (const ch of String(syllable).toLowerCase().normalize('NFD')) {
        if (TONE_MARKS[ch]) { tone = TONE_MARKS[ch]; continue; }
        if (ch === '\u0308') { // ü 的分音符：还原为 v
            if (letters.endsWith('u')) letters = letters.slice(0, -1) + 'v';
            continue;
        }
        if (ch >= 'a' && ch <= 'z') letters += ch;
    }
    return { letters, tone };
}

/** 常用轻声音节：允许缺调号（声母韵母仍须命中该字读音集合） */
const NEUTRAL_SYLLABLES = new Set(['de', 'le', 'men', 'zi', 'ge', 'zhe']);

/** 单条拼音校验：返回问题描述，通过返回 null（“一/不”按原调约定豁免语境校验） */
function pinyinIssue(word, pinyinList, readingsOf) {
    for (let i = 0; i < 4; i += 1) {
        const { letters, tone } = parseAnnotated(pinyinList[i]);
        if (!letters) return '第' + (i + 1) + '字音节无字母：' + pinyinList[i];
        if (tone === null && !NEUTRAL_SYLLABLES.has(letters)) return '第' + (i + 1) + '字缺声调：' + pinyinList[i];
        if (word[i] === '一' || word[i] === '不') continue;
        const readings = readingsOf(word[i]);
        if (readings.size === 0) return '第' + (i + 1) + '字无参考读音';
        if (!readings.has(letters)) return '第' + (i + 1) + '字声韵不符：' + pinyinList[i] + '（参考 ' + Array.from(readings).join('/') + '）';
    }
    return null;
}

/** 全库约定：一/不 一律标原调 yī/bù（源数据存在 bū 等变调/丢调写法），返回改写处数 */
function normalizeYiBu(word, pinyinList) {
    let fixed = 0;
    for (let i = 0; i < 4; i += 1) {
        if (word[i] === '一' && pinyinList[i] !== 'yī') { pinyinList[i] = 'yī'; fixed += 1; continue; }
        if (word[i] === '不' && pinyinList[i] !== 'bù') { pinyinList[i] = 'bù'; fixed += 1; }
    }
    return fixed;
}

/** 出处清洗：新华库用字面“无”表示无出处，归一为空串（页面不展示该行） */
function cleanDerivation(value) {
    const text = String(value || '').trim();
    return text === '无' ? '' : text;
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

    /* 字频语料：全部释义文本中的汉字频率；名次 1 起，并列按码点排序保证可复现 */
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
        .sort((a, b) => b[1] - a[1] || cmpWord(a[0], b[0]))
        .map(([ch], index) => [ch, index + 1]));

    /* 候选 = 汉兜表 ∩ 新华库（拼音 4 音节 + 释义非空），按汉兜文件顺序去重 */
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
        candidates.push({ word, pinyin, explanation, derivation: cleanDerivation(entry.derivation) });
    });
    console.log('有效候选（汉兜∩新华，拼音释义齐全）: ' + candidates.length + ' 条');

    /* 一/不 原调统一改写（长生不死 bū → bù 一类） */
    let yiBuFixed = 0;
    candidates.forEach((item) => { yiBuFixed += normalizeYiBu(item.word, item.pinyin); });
    console.log('一/不 原调改写: ' + yiBuFixed + ' 处');

    /* 拼音校验：声母韵母必须属于该字 pinyin-pro 读音集合（忽略声调；缺调仅轻声豁免） */
    const pkgRoot = await ensurePinyinPro();
    const { pinyin: pinyinPro } = requirePinyinPro(pkgRoot);
    const pinyinVersion = JSON.parse(fs.readFileSync(path.join(pkgRoot, 'package.json'), 'utf8')).version;
    console.log('拼音参考: pinyin-pro@' + pinyinVersion + '（缓存于 ' + PINYIN_CACHE_DIR + '）');
    const readingsCache = new Map();
    const readingsOf = (hanzi) => {
        if (!readingsCache.has(hanzi)) {
            const list = pinyinPro(hanzi, { multiple: true, toneType: 'num', type: 'array' }) || [];
            const letters = new Set();
            list.forEach((item) => {
                const m = String(item).toLowerCase().match(/^([a-zü]+)[0-5]?$/);
                if (m) letters.add(m[1].replace(/ü/g, 'v'));
            });
            readingsCache.set(hanzi, letters);
        }
        return readingsCache.get(hanzi);
    };
    const rejected = [];
    const validated = candidates.filter((item) => {
        const issue = pinyinIssue(item.word, item.pinyin, readingsOf);
        if (issue) rejected.push(item.word + '：' + issue);
        return !issue;
    });
    console.log('拼音校验剔除 ' + rejected.length + ' 条（保底清单不参与校验）');
    rejected.slice(0, 20).forEach((line) => console.log('  剔除: ' + line));
    if (rejected.length > 20) console.log('  ……其余 ' + (rejected.length - 20) + ' 条略');

    /* 得分 = 四字字频名次的几何平均（对数平均），越小越常用；语料未收字按最差名次计 */
    const worstRank = charRank.size + 1;
    validated.forEach((item) => {
        let logSum = 0;
        for (const ch of item.word) logSum += Math.log(charRank.get(ch) || worstRank);
        item.score = logSum / 4;
    });
    validated.sort((a, b) => a.score - b.score || cmpWord(a.word, b.word));

    /* 组装：保底著名成语强制进库（释义/出处取新华库，缺则用人工条目），再按得分填充至 1000 */
    const fallbackWords = new Set(FALLBACK_IDIOMS.map((f) => f.w));
    const picked = FALLBACK_IDIOMS.map((f) => {
        const fromXinhua = byWord.get(f.w) || {};
        return {
            word: f.w,
            pinyin: f.p.slice(),
            explanation: String(fromXinhua.explanation || '').trim() || f.e,
            derivation: cleanDerivation(fromXinhua.derivation)
        };
    });
    const pool = validated.filter((item) => !fallbackWords.has(item.word));
    picked.push(...pool.slice(0, TARGET_COUNT - picked.length));
    picked.sort((a, b) => cmpWord(a.word, b.word));

    /* 多音字语境人工校订 */
    let overrideApplied = 0;
    picked.forEach((item) => {
        const override = PINYIN_OVERRIDES.get(item.word);
        if (override) { item.pinyin = override.slice(); overrideApplied += 1; }
    });
    const missedOverrides = [];
    PINYIN_OVERRIDES.forEach((_, word) => {
        if (!picked.some((item) => item.word === word)) missedOverrides.push(word);
    });
    console.log('覆盖表命中 ' + overrideApplied + ' 条' +
        (missedOverrides.length ? '，未进库: ' + missedOverrides.join('、') : ''));

    /* 产出数据文件（释义/出处不截断，源数据最长约 120 字） */
    const lines = picked.map((item) => {
        const e = item.explanation.replace(/"/g, '').replace(/\\/g, '');
        const s = item.derivation.replace(/"/g, '').replace(/\\/g, '');
        return '  { w: "' + item.word + '", p: [' + item.pinyin.map((p) => '"' + p + '"').join(', ') + '], e: "' +
            e + '", s: "' + s + '" }';
    });
    const header = [
        '// 数据产物：猜成语题库 ' + picked.length + ' 条（勿手改；扩题请改 build-idiom-bank.js 后重新生成）。',
        '// 候选表：antfu/handle（汉兜，MIT）src/data/idioms.txt @ 8adfdae；',
        '// 拼音/释义/出处：pwxcoo/chinese-xinhua（MIT）data/idiom.json @ 8de1001。',
        '// 选材：四字字频名次几何平均排序 + ' + FALLBACK_IDIOMS.length + ' 条保底著名成语强制进库；',
        '// 拼音：pinyin-pro 声韵校验剔除坏条目 + 多音字语境人工校订 + 一/不统一标原调。',
        'window.IDIOM_BANK = [',
        ''
    ].join('\n');
    const out = header + lines.join(',\n') + '\n];\n';
    fs.writeFileSync(path.join(__dirname, 'idiom-bank.js'), out, 'utf8');

    /* 构建统计 */
    const hanziSet = new Set();
    picked.forEach((item) => { for (const ch of item.word) hanziSet.add(ch); });
    console.log('入选题库: ' + picked.length + ' 条（保底 ' + FALLBACK_IDIOMS.length + ' + 得分填充 ' + (picked.length - FALLBACK_IDIOMS.length) + '）');
    console.log('全库不同汉字: ' + hanziSet.size + ' / 语料总字数 ' + charRank.size);
    console.log('已写出 idiom-bank.js，字节: ' + Buffer.byteLength(out));
}

main().catch((error) => {
    console.error('生成失败: ' + error.message);
    process.exit(1);
});
