#!/usr/bin/env node
/**
 * 跨平台：构建 + 产出校验（npm test）
 */
const { spawn } = require('child_process');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { cwd: ROOT, stdio: 'inherit', shell: true });
    proc.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`exit ${code}`))));
    proc.on('error', reject);
  });
}

async function main() {
  await run('python', ['tools/build_book.py', 'book', '--config', 'tools/chapter1_config.yaml']);
  require('./test_build.js');
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
