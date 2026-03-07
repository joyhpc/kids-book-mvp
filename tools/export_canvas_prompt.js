#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function fail(message) {
  console.error('[FAIL]', message);
  process.exit(1);
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    fail(`无法解析 JSON: ${filePath}\n${error.message}`);
  }
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function stringifyList(value) {
  if (Array.isArray(value)) return value.join(', ');
  if (value == null) return '';
  return String(value);
}

function get(obj, keyPath, fallback = '') {
  return keyPath.split('.').reduce((current, key) => {
    if (current && Object.prototype.hasOwnProperty.call(current, key)) return current[key];
    return undefined;
  }, obj) ?? fallback;
}

function fillTemplate(template, values) {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
    return Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : '';
  });
}

function buildTemplateValues(spec) {
  return {
    page_id: spec.page_id || '',
    story_text_en: get(spec, 'story_text.en', ''),
    story_text_zh: get(spec, 'story_text.zh', ''),
    composition_mode: get(spec, 'visual_intent.composition_mode', ''),
    lead_subject: get(spec, 'visual_intent.lead_subject', ''),
    secondary_subject: get(spec, 'visual_intent.secondary_subject', ''),
    negative_space_ratio: get(spec, 'visual_intent.negative_space_ratio', ''),
    subject_scale: get(spec, 'visual_intent.subject_scale', ''),
    camera_distance: get(spec, 'visual_intent.camera_distance', ''),
    reading_safe_zone_top: get(spec, 'layout_constraints.reading_safe_zone.top', ''),
    reading_safe_zone_bottom: get(spec, 'layout_constraints.reading_safe_zone.bottom', ''),
    style_keywords: stringifyList(get(spec, 'style_system.keywords', [])),
    palette: stringifyList(get(spec, 'style_system.palette', [])),
  };
}

function buildBundle(spec, promptMarkdown, specPath) {
  return {
    book_id: spec.book_id || '',
    page_id: spec.page_id || '',
    version: spec.version || 1,
    exported_at: new Date().toISOString(),
    source_spec: specPath,
    canvas_prompt_title: get(spec, 'canvas_prompt.title', spec.page_id || ''),
    prompt_markdown: promptMarkdown,
    constraints: {
      composition_mode: get(spec, 'visual_intent.composition_mode', ''),
      negative_space_ratio: get(spec, 'visual_intent.negative_space_ratio', ''),
      reading_safe_zone: get(spec, 'layout_constraints.reading_safe_zone', {}),
      edge_safety: get(spec, 'layout_constraints.edge_safety', {}),
      style_keywords: get(spec, 'style_system.keywords', []),
      negative_keywords: get(spec, 'style_system.negative_keywords', []),
    },
    spec,
  };
}

function parseArgs(argv) {
  const args = { spec: '', out: 'canvas_exports' };
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--spec') {
      args.spec = argv[index + 1] || '';
      index += 1;
      continue;
    }
    if (token === '--out') {
      args.out = argv[index + 1] || args.out;
      index += 1;
      continue;
    }
    if (!args.spec && !token.startsWith('--')) {
      args.spec = token;
    }
  }
  return args;
}

function main() {
  const { spec, out } = parseArgs(process.argv);
  if (!spec) {
    fail('用法: node tools/export_canvas_prompt.js --spec page_specs/xxx.json [--out canvas_exports]');
  }

  const repoRoot = process.cwd();
  const specPath = path.resolve(repoRoot, spec);
  if (!fs.existsSync(specPath)) {
    fail(`找不到 spec 文件: ${spec}`);
  }

  const templatePath = path.join(repoRoot, 'tools', 'templates', 'gemini_canvas_prompt_template.md');
  if (!fs.existsSync(templatePath)) {
    fail('缺少 prompt 模板: tools/templates/gemini_canvas_prompt_template.md');
  }

  const specJson = readJson(specPath);
  if (!specJson.page_id) {
    fail('spec 缺少 page_id');
  }

  const template = fs.readFileSync(templatePath, 'utf8');
  const values = buildTemplateValues(specJson);
  const promptMarkdown = fillTemplate(template, values);

  const outDir = path.resolve(repoRoot, out, specJson.page_id);
  ensureDir(outDir);

  const promptPath = path.join(outDir, `${specJson.page_id}.prompt.md`);
  const bundlePath = path.join(outDir, `${specJson.page_id}.bundle.json`);

  fs.writeFileSync(promptPath, promptMarkdown);
  fs.writeFileSync(bundlePath, JSON.stringify(buildBundle(specJson, promptMarkdown, spec), null, 2));

  console.log('[OK] Prompt Pack 已导出');
  console.log(promptPath);
  console.log(bundlePath);
}

main();
