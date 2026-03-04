#!/usr/bin/env node
/**
 * 完整测试闭环：构建 → 校验 → 启动服务 → E2E
 * 运行：node tools/run_tests.js 或 npm run test:full
 */
const { spawn } = require('child_process');
const path = require('path');
const http = require('http');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.TEST_PORT) || 9876;
const BASE = `http://127.0.0.1:${PORT}`;
const SERVER_WAIT_MS = 15000;

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const cwd = opts.cwd || ROOT;
    const env = opts.env ? { ...process.env, ...opts.env } : undefined;
    const proc = spawn(cmd, args, { cwd, stdio: 'inherit', shell: true, env });
    proc.on('exit', code => (code === 0 ? resolve() : reject(new Error(`exit ${code}`))));
    proc.on('error', reject);
  });
}

function waitForServer(ms = SERVER_WAIT_MS) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    function tryConnect() {
      const req = http.get(BASE + '/index.html', { timeout: 3000 }, (res) => {
        res.resume();
        if (res.statusCode === 200) return resolve();
        if (Date.now() - start >= ms) return reject(new Error('服务器启动超时（状态码 ' + res.statusCode + '）'));
        setTimeout(tryConnect, 400);
      });
      req.on('error', (err) => {
        if (Date.now() - start >= ms) return reject(new Error('服务器启动超时: ' + err.message));
        setTimeout(tryConnect, 400);
      });
    }
    setTimeout(tryConnect, 1500);
  });
}

async function main() {
  console.log('\n========== 测试闭环 ==========\n');
  let server = null;

  try {
    console.log('1. 构建 chapter1...');
    await run('python', ['tools/build_book.py', 'book', '--config', 'tools/chapter1_config.yaml']);

    console.log('\n2. 构建产出校验...');
    require('./test_build.js');

    console.log('\n3. 启动测试服务器 (port ' + PORT + ')...');
    server = spawn('python', ['-m', 'http.server', String(PORT)], {
      cwd: ROOT,
      stdio: 'ignore',
    });

    await waitForServer(SERVER_WAIT_MS);
    ok('服务器已就绪');

    console.log('\n4. E2E 测试...');
    await run('node', ['tools/test_engine.js'], {
      cwd: ROOT,
      env: { ...process.env, TEST_BASE: BASE, TEST_TIMEOUT: 25000 },
    });

    console.log('\n========== 全部通过 ==========\n');
  } finally {
    if (server) {
      try {
        process.kill(server.pid, 'SIGTERM');
      } catch (_) {}
    }
  }
}

function ok(msg) {
  console.log('[OK]', msg);
}

main().catch((e) => {
  console.error('\n[FAIL]', e.message || e);
  process.exit(1);
});
