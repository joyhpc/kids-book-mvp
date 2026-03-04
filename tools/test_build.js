#!/usr/bin/env node
/**
 * 构建产出校验：book.json + scene_XX.json 结构合法性
 * 运行：node tools/test_build.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'data');

function fail(msg) {
  console.error('[FAIL]', msg);
  process.exit(1);
}

function ok(msg) {
  console.log('[OK]', msg);
}

function validateBook() {
  const bookPath = path.join(DATA, 'book.json');
  if (!fs.existsSync(bookPath)) fail('book.json 不存在');

  let book;
  try {
    book = JSON.parse(fs.readFileSync(bookPath, 'utf8'));
  } catch (e) {
    fail('book.json 解析失败: ' + e.message);
  }

  if (!book.meta || !book.meta.book_id) fail('book.json 缺少 meta.book_id');
  if (!Array.isArray(book.scenes) || book.scenes.length === 0) fail('book.json scenes 为空');

  const sceneIds = new Set();
  book.scenes.forEach((s, i) => {
    if (!s.data_url) fail(`scene[${i}] 缺少 data_url`);
    if (!s.id) fail(`scene[${i}] 缺少 id`);
    if (sceneIds.has(s.id)) fail(`scene[${i}] id 重复: ${s.id}`);
    sceneIds.add(s.id);
  });

  // navigation_rules 键需与 scene id 一致
  if (book.navigation_rules) {
    for (const sid of Object.keys(book.navigation_rules)) {
      if (!sceneIds.has(sid)) fail(`navigation_rules 含未知 scene id: ${sid}`);
    }
  }

  ok(`book.json 合法，${book.scenes.length} 个场景`);
  return book;
}

function assetExists(relPath) {
  if (!relPath) return false;
  const full = path.join(ROOT, relPath);
  return fs.existsSync(full);
}

function validateScene(filePath, index, sceneId) {
  if (!fs.existsSync(filePath)) fail(`scene_${String(index).padStart(2, '0')}.json 不存在: ${filePath}`);

  let data;
  try {
    data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    fail(`scene_${String(index).padStart(2, '0')}.json 解析失败: ` + e.message);
  }

  const scene = data.scene;
  if (!scene) fail(`scene_${index}: 缺少 scene`);
  if (!scene.id) fail(`scene_${index}: scene.id 缺失`);
  if (scene.id !== sceneId) fail(`scene_${index}: scene.id(${scene.id}) 与 book 中不一致(${sceneId})`);

  if (!data.dialogues) fail(`scene_${index}: 缺少 dialogues`);
  if (!data.dialogues.intro) fail(`scene_${index}: 缺少 dialogues.intro`);

  const intro = data.dialogues.intro;
  const hasText = !!(intro.text_zh || intro.text_original || intro.text_en);
  if (!hasText) fail(`scene_${index}: intro 无任何文字 (text_zh/text_original/text_en)`);

  if (!scene.background) fail(`scene_${index}: scene.background 缺失`);
  const bg = scene.background;
  if (bg.type === 'image' && !bg.src) fail(`scene_${index}: background.type=image 需有 src`);
  if (bg.type === 'css_gradient' && !bg.value) fail(`scene_${index}: background.type=css_gradient 需有 value`);
  if (!bg.src && !bg.gradient && !bg.value) fail(`scene_${index}: background 需有 src/gradient/value 之一`);

  if (!Array.isArray(scene.characters)) fail(`scene_${index}: scene.characters 须为数组`);
  if (!Array.isArray(scene.items)) fail(`scene_${index}: scene.items 须为数组`);

  scene.characters.forEach(ch => {
    if (!ch.id) fail(`scene_${index}: character 缺 id`);
    if (ch.img_src && !assetExists(ch.img_src)) fail(`scene_${index}: 资源不存在 ${ch.img_src}`);
  });
  scene.items.forEach(it => {
    if (!it.id) fail(`scene_${index}: item 缺 id`);
    if (it.img_src && !assetExists(it.img_src)) fail(`scene_${index}: 资源不存在 ${it.img_src}`);
  });

  // 拖拽场景校验
  const ia = data.interaction;
  if (ia && ia.type === 'drag_and_drop') {
    if (!ia.draggable_id) fail(`scene_${index}: interaction.draggable_id 缺失`);
    if (!ia.target_id) fail(`scene_${index}: interaction.target_id 缺失`);
    const dragItem = scene.items.find(i => i.id === ia.draggable_id);
    if (!dragItem) fail(`scene_${index}: 拖拽物 ${ia.draggable_id} 不在 items 中`);
    if (!dragItem.draggable) fail(`scene_${index}: 拖拽物 ${ia.draggable_id} 须有 draggable: true`);
    const target = scene.characters.find(c => c.id === ia.target_id) || scene.items.find(i => i.id === ia.target_id);
    if (!target) fail(`scene_${index}: 目标 ${ia.target_id} 不在 characters/items 中`);
  }

  ok(`scene_${String(index).padStart(2, '0')} 合法`);
}

function main() {
  console.log('\n=== 构建产出校验 ===\n');

  const book = validateBook();

  book.scenes.forEach((s, i) => {
    const abs = path.join(ROOT, s.data_url);
    validateScene(abs, i + 1, s.id);
  });

  console.log('\n=== 全部通过 ===\n');
}

main();
