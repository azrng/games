// @ts-check
/* 字库生成管道：从部编版课本生字数据生成三档字库（T044）
 *
 * 数据源（运行时下载并缓存，不入库；来源 github.com/cjp1016/hanzi-park）：
 *   - pep-textbook-g1-g2.ts   部编版一、二年级课本生字（按册 → 单元 → 课文）
 *   - all-characters.json     汉字带调拼音/笔画/部首表
 *
 * 档位划分（用户已拍板"全量对齐课本"）：
 *   sprout 启蒙档 = 一年级上册全部生字
 *   basic  基础档 = 一年级下册新增生字（不含上册）
 *   rocket 挑战档 = 二年级新增生字 + 既有双字词
 *
 * 过滤规则：
 *   - 不雅/不宜课堂出现的字（BLACKLIST）
 *   - 拼音数据缺失的字
 *   - 音节含 ü 的字（女/绿类，键盘无对应键位；ju/qu/xu/yu 系拼写无 ü 正常保留）
 *
 * 例词/插图降级：现有精配条目（e/w）原样保留，新字 e=""、w=""，
 * 页面对空值降级为大字 + 拼音卡。
 *
 * 用法：node src/pinyin-typing/build-wordbank.js
 * 产物：覆盖 src/pinyin-typing/wordbank.js
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = __dirname;
const CACHE_DIR = path.join(os.tmpdir(), 'pt-wordbank-cache');
const SOURCES = {
    textbook: {
        url: 'https://raw.githubusercontent.com/cjp1016/hanzi-park/main/src/data/pep-textbook-g1-g2.ts',
        file: 'pep-textbook-g1-g2.ts'
    },
    characters: {
        url: 'https://raw.githubusercontent.com/cjp1016/hanzi-park/main/public/all-characters.json',
        file: 'all-characters.json'
    }
};

/* 不宜进入幼儿字库的字（不雅/缺拼音数据等），命中即过滤 */
const BLACKLIST = new Set(['屎', '尿', '屁', '尸', '棺', '囱', '巫', '葬', '鬼']);

/* 多音字按一年级教学读音校准（数据源给的可能是词典常见音） */
const TONE_OVERRIDES = {
    '谁': 'shéi'
};

/* 带调拼音字符 → 无调字母 + 声调号 */
const TONE_TABLE = {
    'ā': ['a', 1], 'á': ['a', 2], 'ǎ': ['a', 3], 'à': ['a', 4],
    'ē': ['e', 1], 'é': ['e', 2], 'ě': ['e', 3], 'è': ['e', 4],
    'ī': ['i', 1], 'í': ['i', 2], 'ǐ': ['i', 3], 'ì': ['i', 4],
    'ō': ['o', 1], 'ó': ['o', 2], 'ǒ': ['o', 3], 'ò': ['o', 4],
    'ū': ['u', 1], 'ú': ['u', 2], 'ǔ': ['u', 3], 'ù': ['u', 4]
};

async function ensureSource(key) {
    const { url, file } = SOURCES[key];
    const cachePath = path.join(CACHE_DIR, file);
    if (fs.existsSync(cachePath) && fs.statSync(cachePath).size > 0) {
        return fs.readFileSync(cachePath, 'utf8');
    }
    console.log(`下载 ${key}: ${url}`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`下载失败 ${key}: HTTP ${res.status}`);
    const text = await res.text();
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(cachePath, text, 'utf8');
    return text;
}

/** 从旧 wordbank.js 提取精配（e/w）与双字词，生成时不丢失人工成果 */
function loadCurated() {
    const old = fs.readFileSync(path.join(ROOT, 'wordbank.js'), 'utf8');
    const curated = new Map();
    const words = [];
    const re = /\{ h: "([^"]+)", p: "([a-z]+)", t: (\d), e: "([^"]*)", w: "([^"]*)" \}/g;
    let m;
    while ((m = re.exec(old)) !== null) {
        const entry = { h: m[1], p: m[2], t: Number(m[3]), e: m[4], w: m[5] };
        if (entry.h.length === 2) words.push(entry);
        else curated.set(entry.h, entry);
    }
    return { curated, words };
}

/** 按册切分课本数据并提取 characters（保课文顺序） */
function parseTextbook(text) {
    const bookIds = ['pepG1S1', 'pepG1S2', 'pepG2S1', 'pepG2S2'];
    const starts = bookIds.map((id) => ({ id, at: text.indexOf(`export const ${id}`) }));
    const books = {};
    bookIds.forEach((id, i) => {
        const from = starts[i].at;
        const to = i + 1 < starts.length ? starts[i + 1].at : text.length;
        const seg = text.slice(from, to);
        const chars = [...seg.matchAll(/characters:\s*\[([^\]]*)\]/g)]
            .flatMap((m) => [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]));
        books[id] = chars;
    });
    return books;
}

/** 带调拼音 → { p: 无调字母, t: 声调 0-4 }；含 ü（含 ǖǘǚǜ，无键盘对应键位）返回 null 表示过滤 */
function splitTone(raw) {
    if (/[üǖǘǚǜ]/.test(raw)) return null;
    // 归一化数据源的拉丁变体 g（U+0261，如 shànɡ）与数字标调（如 diu1）
    let pinyin = raw.replace(/\u0261/g, 'g');
    let t = 0;
    const tail = pinyin.match(/^[a-zü]+([1-4])$/);
    if (tail) {
        t = Number(tail[1]);
        pinyin = pinyin.slice(0, -1);
    }
    let p = '';
    for (const ch of pinyin) {
        if (TONE_TABLE[ch]) {
            const [plain, tone] = TONE_TABLE[ch];
            p += plain;
            t = Math.max(t, tone); // 数据源正常只标一个调号
        } else if (ch === 'ü') {
            return null;
        } else {
            p += ch;
        }
    }
    return { p, t };
}

async function main() {
    const [textbookText, charText] = await Promise.all([
        ensureSource('textbook'),
        ensureSource('characters')
    ]);
    const charMap = new Map(JSON.parse(charText).map((r) => [r[0], r]));
    const { curated, words } = loadCurated();
    const books = parseTextbook(textbookText);

    const skipped = [];
    /** 单字 → 字库条目；不合格返回 null */
    const toEntry = (h) => {
        if (BLACKLIST.has(h)) return null;
        const row = charMap.get(h);
        if (!row) { skipped.push(`${h}(无拼音数据)`); return null; }
        const override = TONE_OVERRIDES[h];
        const split = splitTone(override || row[1]);
        if (!split) { skipped.push(`${h}(音节含ü)`); return null; }
        if (!/^[a-z]+$/.test(split.p)) { skipped.push(`${h}(拼音异常:${row[1]})`); return null; }
        // 精配优先：e/w 沿用旧字库；新字降级为空（页面按大字卡渲染）
        const old = curated.get(h);
        return {
            h,
            p: override ? split.p : old ? old.p : split.p,
            t: override ? split.t : old ? old.t : split.t,
            e: old ? old.e : '',
            w: old ? old.w : ''
        };
    };

    const dedupeAppend = (seen, chars) => {
        const out = [];
        for (const h of chars) {
            if (seen.has(h)) continue;
            seen.add(h);
            const entry = toEntry(h);
            if (entry) out.push(entry);
        }
        return out;
    };

    const seen = new Set();
    const sprout = dedupeAppend(seen, books.pepG1S1);
    const basic = dedupeAppend(seen, books.pepG1S2);
    const rocketChars = dedupeAppend(seen, [...books.pepG2S1, ...books.pepG2S2]);
    const rocket = [...rocketChars, ...words];

    // 一致性自检：拼音/声调必须与精配一致（覆盖表生效时以覆盖为准）
    console.log(`启蒙档(一上): ${sprout.length} 字`);
    console.log(`基础档(一下新增): ${basic.length} 字`);
    console.log(`挑战档(二年级新增 ${rocketChars.length} 字 + 双字词 ${words.length} 条)`);
    console.log(`过滤: ${skipped.length} 个 → ${skipped.join(' ')}`);
    console.log(`总条目: ${sprout.length + basic.length + rocket.length}`);

    const banner = `// @ts-check
/* 拼音打字乐园 · 三档字库（由 build-wordbank.js 生成，勿手改；扩字改管道后重新生成）
 * 数据来源：部编版语文课本生字（github.com/cjp1016/hanzi-park），档位对齐课本册次：
 *   sprout 启蒙档 = 一年级上册 / basic 基础档 = 一年级下册新增 / rocket 挑战档 = 二年级新增 + 双字词
 * 条目结构见 doc/design/pinyin-typing/core-game.md：
 *   h 汉字（档内唯一）/ p 拼音字母（小写无调）/ t 声调 0-4 / e 插图 emoji（可空）/ w 例词（可空）
 * e/w 为空时页面降级为大字卡（无插图、只朗读汉字）。
 */
(function attachWordbank(windowObject) {
    var WORDS = {`;

    const fmtEntries = (entries) =>
        entries.map((c) => `            { h: "${c.h}", p: "${c.p}", t: ${c.t}, e: "${c.e}", w: "${c.w}" }`).join(',\n');

    const body =
        banner + '\n' +
        '        /* 启蒙档 · 5-6 岁（一年级上册生字，按课本顺序） */\n' +
        '        sprout: [\n' + fmtEntries(sprout) + '\n        ],\n' +
        '        /* 基础档 · 6-7 岁（一年级下册新增生字） */\n' +
        '        basic: [\n' + fmtEntries(basic) + '\n        ],\n' +
        '        /* 挑战档 · 7-8 岁（二年级新增生字 + 双字词） */\n' +
        '        rocket: [\n' + fmtEntries(rocket) + '\n        ]\n' +
        '    };\n\n    windowObject.PT_WORDBANK = Object.freeze(WORDS);\n})(window);\n';

    fs.writeFileSync(path.join(ROOT, 'wordbank.js'), body, 'utf8');
    console.log('已生成 wordbank.js');
}

main().catch((e) => { console.error(e); process.exit(1); });
