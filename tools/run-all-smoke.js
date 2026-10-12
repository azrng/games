// @ts-check
/* smoke 测试全量批跑器（仅开发用：node tools/run-all-smoke.js，不进页面、不参与构建）
 *
 * 用途：递归发现 src/**／smoke.test.js 并逐个以子进程运行，输出逐项结果与汇总，
 *       任一失败则退出码非 0，便于批量回归与 CI 化。
 *
 * 用法：
 *   node tools/run-all-smoke.js              # 跑全部 smoke 测试
 *   node tools/run-all-smoke.js snake tile   # 只跑路径含任一关键词的测试（子串匹配）
 *
 * 口径：
 *   - 每个测试独立子进程（process.execPath），互不污染；单测超时 120 秒按失败计
 *   - 失败时输出该测试 stdout/stderr 末尾若干行，便于定位断言错误
 *   - 项目保持零 npm 依赖，仅用 Node 内置模块
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const TEST_TIMEOUT_MS = 120 * 1000;
const FAILURE_EXCERPT_LINES = 20;

/** 递归收集 src 下全部 smoke.test.js，返回相对仓库根的 POSIX 风格路径 */
function collectSmokeTests(dir, out) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            collectSmokeTests(full, out);
        } else if (entry.isFile() && entry.name === 'smoke.test.js') {
            out.push(path.relative(ROOT, full).split(path.sep).join('/'));
        }
    }
    return out;
}

/** 运行单个测试，返回 { ok, durationMs, output } */
function runSmokeTest(relativePath) {
    const startedAt = Date.now();
    const result = spawnSync(process.execPath, [path.join(ROOT, relativePath)], {
        cwd: ROOT,
        encoding: 'utf8',
        timeout: TEST_TIMEOUT_MS,
        killSignal: 'SIGKILL'
    });
    const durationMs = Date.now() - startedAt;
    const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    if (result.error) {
        // 超时或无法启动子进程：error 非空且 status 为 null
        const reason = result.error.killed ? '超时（>120s，已终止）' : `无法启动：${result.error.message}`;
        return { ok: false, durationMs, output: `${output}\n[批跑器] ${reason}`.trim() };
    }
    return { ok: result.status === 0, durationMs, output };
}

/** 截取失败输出的末尾若干行，避免长堆栈刷屏 */
function excerpt(output) {
    const lines = output.split('\n');
    const tail = lines.slice(-FAILURE_EXCERPT_LINES).join('\n');
    return lines.length > FAILURE_EXCERPT_LINES ? `（仅显示末尾 ${FAILURE_EXCERPT_LINES} 行）\n${tail}` : tail;
}

function main() {
    const filters = process.argv.slice(2);
    const allTests = collectSmokeTests(SRC, []);
    const tests = filters.length
        ? allTests.filter((file) => filters.some((keyword) => file.includes(keyword)))
        : allTests;

    if (tests.length === 0) {
        console.error('未找到匹配的 smoke 测试' + (filters.length ? `（关键词：${filters.join('、')}）` : ''));
        process.exit(1);
    }
    console.log(`共发现 ${allTests.length} 个 smoke 测试，本次运行 ${tests.length} 个\n`);

    const failures = [];
    for (const file of tests) {
        const { ok, durationMs, output } = runSmokeTest(file);
        const mark = ok ? '✓' : '✗';
        console.log(`${mark} ${file}（${(durationMs / 1000).toFixed(1)}s）`);
        if (!ok) {
            failures.push({ file, output });
        }
    }

    console.log(`\n汇总：${tests.length - failures.length} 通过 / ${failures.length} 失败，共 ${tests.length} 项`);
    if (failures.length > 0) {
        console.log('\n========== 失败详情 ==========');
        for (const { file, output } of failures) {
            console.log(`\n✗ ${file}`);
            console.log(output ? excerpt(output) : '（无输出，进程非 0 退出）');
        }
        process.exit(1);
    }
}

main();
