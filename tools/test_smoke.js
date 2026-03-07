#!/usr/bin/env node
/**
 * 轻量级 Smoke 测试：仅 HTTP 请求，无 Puppeteer
 * 用于快速验证服务器与页面可访问
 */
const http = require('http');

const BASE = process.env.TEST_BASE || 'http://127.0.0.1:8888';
const TIMEOUT = 8000;

function fail(msg) {
  console.error('[FAIL]', msg);
  process.exit(1);
}

function ok(msg) {
  console.log('[OK]', msg);
}

function fetch(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: TIMEOUT }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, data }));
    });
    req.on('error', reject);
  });
}

function countId(html, id) {
  return (html.match(new RegExp(`id="${id}"`, 'g')) || []).length;
}

async function main() {
  console.log('\n=== Smoke 测试 ===\n');

  let r;
  try {
    r = await fetch(BASE + '/index.html');
  } catch (e) {
    fail('无法连接 ' + BASE + '，请先启动: python -m http.server 8888');
  }

  if (r.status !== 200) fail('index.html 返回 ' + r.status);
  ok('index.html 可访问');

  if (!r.data.includes('id="stage"')) fail('index.html 缺少 #stage');
  ok('#stage 存在');

  if (!r.data.includes('engine.js')) fail('index.html 未加载 engine.js');
  ok('engine.js 已引用');

  r = await fetch(BASE + '/editor.html');
  if (r.status !== 200) fail('editor.html 返回 ' + r.status);
  ok('editor.html 可访问');

  if (!r.data.includes('preview-frame')) fail('editor.html 缺少预览 iframe');
  ok('编辑器预览 iframe 存在');

  if (!r.data.includes('director-prompt-input')) fail('editor.html 缺少导演指令区');
  ok('导演指令区存在');

  if (!r.data.includes('analysis-score')) fail('editor.html 缺少画面分析区');
  ok('画面分析区存在');

  if (!r.data.includes('capture-snapshot-btn')) fail('editor.html 缺少截图评估按钮');
  ok('截图评估按钮存在');

  if (!r.data.includes('run-auto-iterate-btn')) fail('editor.html 缺少自动优化按钮');
  ok('自动优化按钮存在');

  [
    'run-auto-iterate-btn',
    'apply-best-iteration-btn',
    'iterate-rounds-select',
    'iterate-status',
    'iterate-current-round',
    'iterate-best-score',
    'iterate-results',
  ].forEach((id) => {
    const count = countId(r.data, id);
    if (count !== 1) fail(`editor.html 中 #${id} 出现 ${count} 次`);
  });
  ok('自动优化面板关键 ID 唯一');

  r = await fetch(BASE + '/editor-preview.html');
  if (r.status !== 200) fail('editor-preview.html 返回 ' + r.status);
  ok('editor-preview.html 可访问');

  r = await fetch(BASE + '/data/book.json');
  if (r.status !== 200) fail('book.json 返回 ' + r.status);
  ok('book.json 可访问');

  let book;
  try {
    book = JSON.parse(r.data);
  } catch (e) {
    fail('book.json 解析失败');
  }
  if (!book.scenes || book.scenes.length < 1) fail('book.json 无场景');
  ok(`book.json 含 ${book.scenes.length} 个场景`);

  const firstScene = book.scenes[0].data_url;
  r = await fetch(BASE + '/' + firstScene);
  if (r.status !== 200) fail(firstScene + ' 返回 ' + r.status);
  ok('首场景 JSON 可访问');

  console.log('\n=== Smoke 通过 ===\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
