import { analyzeScene, rankVariants } from './scene-analysis.js';
import { captureStageFromIframe, analyzeSnapshot } from './preview-capture.js';
import { proposeIterationRecipes, summarizeRecipe } from './auto-iterate.js';

const $ = (selector) => document.querySelector(selector);

const state = {
  sceneData: null,
  selectedId: '__scene__',
  presets: [],
  previewReady: false,
  past: [],
  future: [],
  variants: {},
  analysis: null,
  rankedVariants: [],
  visualAnalysis: null,
  snapshotDataUrl: '',
  iterationResults: [],
  bestIteration: null,
  autoIterating: false,
  iterateStatusText: '待机',
  iterationTargetRounds: 0,
};

const elements = {
  loadDefaultBtn: $('#load-default-btn'),
  importFile: $('#import-file'),
  exportBtn: $('#export-btn'),
  addCharacterBtn: $('#add-character-btn'),
  addItemBtn: $('#add-item-btn'),
  duplicateBtn: $('#duplicate-btn'),
  deleteBtn: $('#delete-btn'),
  undoBtn: $('#undo-btn'),
  redoBtn: $('#redo-btn'),
  statusPill: $('#status-pill'),
  scenePresetSelect: $('#scene-preset-select'),
  sceneIdInput: $('#scene-id-input'),
  backgroundTypeSelect: $('#background-type-select'),
  backgroundGradientInput: $('#background-gradient-input'),
  backgroundSrcInput: $('#background-src-input'),
  backgroundParticlesInput: $('#background-particles-input'),
  introEnInput: $('#intro-en-input'),
  introZhInput: $('#intro-zh-input'),
  hintZhInput: $('#hint-zh-input'),
  entityList: $('#entity-list'),
  focusSceneBtn: $('#focus-scene-btn'),
  refreshPreviewBtn: $('#refresh-preview-btn'),
  previewFrame: $('#preview-frame'),
  inspector: $('#inspector'),
  jsonEditor: $('#json-editor'),
  formatJsonBtn: $('#format-json-btn'),
  applyJsonBtn: $('#apply-json-btn'),
  directorPromptInput: $('#director-prompt-input'),
  applyDirectorPromptBtn: $('#apply-director-prompt-btn'),
  focusLeadBtn: $('#focus-lead-btn'),
  compositionPresetSelect: $('#composition-preset-select'),
  moodPresetSelect: $('#mood-preset-select'),
  cameraStrengthInput: $('#camera-strength-input'),
  cameraStrengthValue: $('#camera-strength-value'),
  negativeSpaceInput: $('#negative-space-input'),
  negativeSpaceValue: $('#negative-space-value'),
  subjectScaleInput: $('#subject-scale-input'),
  subjectScaleValue: $('#subject-scale-value'),
  generateVariantsBtn: $('#generate-variants-btn'),
  variantABtn: $('#variant-a-btn'),
  variantBBtn: $('#variant-b-btn'),
  variantCBtn: $('#variant-c-btn'),
  analysisScore: $('#analysis-score'),
  analysisMetrics: $('#analysis-metrics'),
  analysisSuggestions: $('#analysis-suggestions'),
  analysisVisualMetrics: $('#analysis-visual-metrics'),
  snapshotPreview: $('#snapshot-preview'),
  captureSnapshotBtn: $('#capture-snapshot-btn') || $('#capture-preview-btn'),
  autoFixBtn: $('#auto-fix-btn') || $('#auto-fix-composition-btn'),
  runAutoIterateBtn: $('#run-auto-iterate-btn'),
  iterateRoundsSelect: $('#iterate-rounds-select'),
  applyBestIterationBtn: $('#apply-best-iteration-btn'),
  iterateStatus: $('#iterate-status'),
  iterateCurrentRound: $('#iterate-current-round'),
  iterateBestScore: $('#iterate-best-score'),
  iterateResults: $('#iterate-results'),
  visualScore: $('#visual-score'),
  visualLumaSummary: $('#visual-luma-summary'),
  visualContrastSummary: $('#visual-contrast-summary'),
  visualFocusSummary: $('#visual-focus-summary'),
  visualTopSummary: $('#visual-top-summary'),
  visualAnalysisSuggestions: $('#visual-analysis-suggestions'),
  snapshotThumbnail: $('#snapshot-thumbnail'),
  visualBrightnessValue: $('#visual-brightness-value'),
  visualContrastValue: $('#visual-contrast-value'),
  visualBalanceValue: $('#visual-balance-value'),
  visualTopNoiseValue: $('#visual-top-noise-value'),
};

const compositionOptions = ['rule_left', 'rule_right', 'centered', 'wide', 'dialogue'];
const moodOptions = ['dreamy', 'warm', 'tense', 'lonely', 'magical'];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function setStatus(text) {
  elements.statusPill.textContent = text;
}

function ensureSceneShape(sceneData) {
  sceneData.meta ??= { title: 'Scene', version: '1.0.0' };
  sceneData.scene ??= {};
  sceneData.scene.id ??= 'scene_editor';
  sceneData.scene.background ??= { type: 'canvas', gradient: '', particles: false };
  sceneData.scene.characters ??= [];
  sceneData.scene.items ??= [];
  [...sceneData.scene.characters, ...sceneData.scene.items].forEach((entity) => {
    entity._editorBaseWidth ??= entity.width;
    entity._editorBaseHeight ??= entity.height;
  });
  sceneData.dialogues ??= {};
  sceneData.dialogues.intro ??= { id: 'intro', text_en: '', text_zh: '', words: [], auto_play: false };
  sceneData.ui ??= {};
  sceneData.ui.hint ??= { text_zh: '', text_en: '', show_after_ms: 2500, position: 'bottom' };
  sceneData.editor ??= {};
  sceneData.editor.director ??= {
    composition: 'wide',
    mood: 'dreamy',
    camera_strength: 42,
    negative_space: 64,
    subject_scale: 46,
  };
  return sceneData;
}

function normalizeDirectorState() {
  ensureSceneShape(state.sceneData);
  const director = state.sceneData.editor.director;
  director.composition ??= 'wide';
  director.mood ??= 'dreamy';
  director.camera_strength ??= 42;
  director.negative_space ??= 64;
  director.subject_scale ??= 46;
}

function getEntities() {
  if (!state.sceneData) return [];
  const { characters = [], items = [] } = state.sceneData.scene;
  return [
    ...characters.map((entity) => ({ entity, kind: 'character' })),
    ...items.map((entity) => ({ entity, kind: 'item' })),
  ];
}

function findEntity(id = state.selectedId) {
  if (!state.sceneData || !id || id === '__scene__') return null;
  const characters = state.sceneData.scene.characters || [];
  const items = state.sceneData.scene.items || [];
  const character = characters.find((entity) => entity.id === id);
  if (character) return { entity: character, collection: characters, kind: 'character' };
  const item = items.find((entity) => entity.id === id);
  if (item) return { entity: item, collection: items, kind: 'item' };
  return null;
}

function nextId(base) {
  const existing = new Set(getEntities().map(({ entity }) => entity.id));
  if (!existing.has(base)) return base;
  let index = 2;
  while (existing.has(`${base}_${index}`)) index += 1;
  return `${base}_${index}`;
}

function postToPreview(payload) {
  const target = elements.previewFrame.contentWindow;
  if (!target) return;
  target.postMessage(payload, '*');
}

function syncPreview(sceneData = state.sceneData, selectedId = state.selectedId) {
  if (!sceneData) return;
  postToPreview({
    type: 'scene:update',
    sceneData: clone(sceneData),
    selectedId,
  });
}

function wait(ms = 120) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function waitForPreviewRender(sceneData = state.sceneData) {
  let retries = 30;
  while ((!elements.previewFrame.contentDocument || !elements.previewFrame.contentDocument.getElementById('stage')) && retries > 0) {
    await wait(120);
    retries -= 1;
  }

  if (!elements.previewFrame.contentDocument?.getElementById('stage')) {
    throw new Error('preview not ready');
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    syncPreview(sceneData);
    await wait(100);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }
  state.previewReady = true;
  await wait(160);
}

function updateJsonMirror(force = false) {
  if (!force && document.activeElement === elements.jsonEditor) return;
  elements.jsonEditor.value = JSON.stringify(state.sceneData, null, 2);
}

function updateUndoRedoButtons() {
  elements.undoBtn.disabled = state.past.length === 0;
  elements.redoBtn.disabled = state.future.length === 0;
}

function captureHistory(label = '更新') {
  if (!state.sceneData) return;
  state.past.push(clone(state.sceneData));
  if (state.past.length > 80) state.past.shift();
  state.future = [];
  updateUndoRedoButtons();
  if (label) setStatus(`${label} 已记录`);
}

function resetVisualState() {
  state.visualAnalysis = null;
  state.snapshotDataUrl = '';
}

function resetIterationState() {
  state.iterationResults = [];
  state.bestIteration = null;
  state.autoIterating = false;
  state.iterateStatusText = '待机';
  state.iterationTargetRounds = 0;
}

function restoreScene(sceneData, statusText) {
  state.sceneData = ensureSceneShape(sceneData);
  normalizeDirectorState();
  if (state.selectedId !== '__scene__' && !findEntity(state.selectedId)) {
    state.selectedId = '__scene__';
  }
  rerender({ syncPreviewNow: true, forceJson: true });
  updateUndoRedoButtons();
  if (statusText) setStatus(statusText);
}

function undo() {
  if (!state.past.length) return;
  state.future.push(clone(state.sceneData));
  const previous = state.past.pop();
  restoreScene(previous, '已撤销');
}

function redo() {
  if (!state.future.length) return;
  state.past.push(clone(state.sceneData));
  const next = state.future.pop();
  restoreScene(next, '已重做');
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function parsePercent(value, fallback = 50) {
  if (typeof value === 'number') return value;
  const match = String(value ?? '').match(/-?\d+(?:\.\d+)?/);
  return match ? parseFloat(match[0]) : fallback;
}

function parsePixels(value, fallback = 120) {
  const match = String(value ?? '').match(/-?\d+(?:\.\d+)?/);
  return match ? parseFloat(match[0]) : fallback;
}

function formatPercent(value) {
  return `${clamp(value, 0, 100).toFixed(2).replace(/\.00$/, '')}%`;
}

function formatPixels(value) {
  return `${Math.round(Math.max(24, value))}px`;
}

function getLeadEntity() {
  const found = findEntity();
  if (found) return found.entity;
  const { characters = [], items = [] } = state.sceneData.scene;
  return characters[0] || items[0] || null;
}

function getMoodGradient(mood) {
  const gradients = {
    dreamy: 'radial-gradient(circle at 50% 30%, #7c6cff 0%, #2c235a 35%, #090d18 100%)',
    warm: 'radial-gradient(circle at 50% 30%, #ffcc8d 0%, #a8553e 32%, #140f16 100%)',
    tense: 'radial-gradient(circle at 50% 20%, #ff5d5d 0%, #451722 28%, #05070d 100%)',
    lonely: 'radial-gradient(circle at 50% 18%, #9ab8ff 0%, #24364f 30%, #03070d 100%)',
    magical: 'radial-gradient(circle at 50% 28%, #92f0ff 0%, #3753b8 30%, #07101d 100%)',
  };
  return gradients[mood] || gradients.dreamy;
}

function distributePairLayout(entities, lead, sideX, cameraStrength) {
  const others = entities.filter((entity) => entity.id !== lead.id);
  lead.position.x = formatPercent(sideX);
  lead.position.y = formatPercent(54 - cameraStrength * 0.06);
  if (others[0]) {
    others[0].position.x = formatPercent(100 - sideX);
    others[0].position.y = formatPercent(56 + cameraStrength * 0.04);
  }
  others.slice(1).forEach((entity, index) => {
    entity.position.x = formatPercent(18 + index * 18);
    entity.position.y = formatPercent(68 + (index % 2) * 8);
  });
}

function applyComposition(sceneData, composition, cameraStrength = 55, negativeSpace = 48) {
  const entities = [
    ...(sceneData.scene.characters || []),
    ...(sceneData.scene.items || []),
  ];
  const lead = (state.selectedId && entities.find((entity) => entity.id === state.selectedId)) || entities[0];
  if (!lead) return;

  const sideX = 28 + negativeSpace * 0.18;
  const rightX = 72 - negativeSpace * 0.18;

  switch (composition) {
    case 'rule_left':
      lead.position.x = formatPercent(sideX);
      lead.position.y = formatPercent(54 - cameraStrength * 0.08);
      entities.filter((entity) => entity.id !== lead.id).forEach((entity, index) => {
        entity.position.x = formatPercent(68 + (index % 2) * 10);
        entity.position.y = formatPercent(44 + index * 13);
      });
      break;
    case 'rule_right':
      lead.position.x = formatPercent(rightX);
      lead.position.y = formatPercent(54 - cameraStrength * 0.08);
      entities.filter((entity) => entity.id !== lead.id).forEach((entity, index) => {
        entity.position.x = formatPercent(24 + (index % 2) * 12);
        entity.position.y = formatPercent(44 + index * 13);
      });
      break;
    case 'centered':
      lead.position.x = formatPercent(50);
      lead.position.y = formatPercent(54 - cameraStrength * 0.1);
      entities.filter((entity) => entity.id !== lead.id).forEach((entity, index) => {
        const spread = 20 + negativeSpace * 0.1 + index * 7;
        entity.position.x = formatPercent(index % 2 === 0 ? 50 - spread : 50 + spread);
        entity.position.y = formatPercent(58 + index * 8);
      });
      break;
    case 'wide':
      lead.position.x = formatPercent(50);
      lead.position.y = formatPercent(61 - cameraStrength * 0.04);
      entities.filter((entity) => entity.id !== lead.id).forEach((entity, index) => {
        entity.position.x = formatPercent(16 + index * (70 / Math.max(1, entities.length - 1)));
        entity.position.y = formatPercent(64 + (index % 3) * 6);
      });
      break;
    case 'dialogue':
      distributePairLayout(entities, lead, sideX, cameraStrength);
      break;
    default:
      break;
  }
}

function applyScale(sceneData, subjectScale = 58, cameraStrength = 55) {
  const lead = getLeadEntity();
  if (!lead) return;
  const entities = [
    ...(sceneData.scene.characters || []),
    ...(sceneData.scene.items || []),
  ];
  const leadFactor = 0.85 + subjectScale / 100;
  const cameraFactor = 0.85 + cameraStrength / 180;

  entities.forEach((entity) => {
    entity._editorBaseWidth ??= entity.width;
    entity._editorBaseHeight ??= entity.height;
    const width = parsePixels(entity._editorBaseWidth, entity.draggable ? 72 : 120);
    const height = parsePixels(entity._editorBaseHeight, entity.draggable ? 72 : 120);
    const factor = entity.id === lead.id ? leadFactor * cameraFactor : 0.9 + subjectScale / 260;
    entity.width = formatPixels(width * factor);
    entity.height = formatPixels(height * factor);
  });
}

function applyMood(sceneData, mood) {
  sceneData.scene.background.type = 'canvas';
  sceneData.scene.background.gradient = getMoodGradient(mood);
  sceneData.scene.background.particles = false;
}

function applyNegativeSpace(sceneData, negativeSpace = 48) {
  const entities = [
    ...(sceneData.scene.characters || []),
    ...(sceneData.scene.items || []),
  ];
  const lead = getLeadEntity();
  if (!lead) return;
  const factor = negativeSpace / 100;
  entities.filter((entity) => entity.id !== lead.id).forEach((entity) => {
    const x = parsePercent(entity.position.x, 50);
    const y = parsePercent(entity.position.y, 55);
    const offsetX = (x - 50) * (1 + factor * 0.5);
    const offsetY = (y - 55) * (1 + factor * 0.35);
    entity.position.x = formatPercent(50 + offsetX);
    entity.position.y = formatPercent(55 + offsetY);
  });
}

function applyReadingSafeZone(sceneData) {
  const hasDialogue = Boolean(sceneData?.dialogues?.intro?.text_en || sceneData?.dialogues?.intro?.text_zh);
  const safeTop = hasDialogue ? 48 : 12;
  const safeBottom = 88;
  const safeLeft = 10;
  const safeRight = 90;
  const entities = [
    ...(sceneData.scene.characters || []),
    ...(sceneData.scene.items || []),
  ];

  entities.forEach((entity) => {
    const widthPercent = parsePixels(entity.width, entity.draggable ? 72 : 120) / 10;
    const heightPercent = parsePixels(entity.height, entity.draggable ? 72 : 120) / 10;
    let centerX = parsePercent(entity.position?.x, 50);
    let centerY = parsePercent(entity.position?.y, 55);
    const halfW = widthPercent / 2;
    const halfH = heightPercent / 2;

    centerX = clamp(centerX, safeLeft + halfW, safeRight - halfW);
    centerY = clamp(centerY, safeTop + halfH, safeBottom - halfH);

    entity.position.x = formatPercent(centerX);
    entity.position.y = formatPercent(centerY);
  });
}

function applyDirectorRecipe(sceneData, recipe, options = {}) {
  const director = sceneData.editor.director;
  if (recipe.composition) director.composition = recipe.composition;
  if (recipe.mood) director.mood = recipe.mood;
  if (typeof recipe.camera_strength === 'number') director.camera_strength = clamp(recipe.camera_strength, 0, 100);
  if (typeof recipe.negative_space === 'number') director.negative_space = clamp(recipe.negative_space, 0, 100);
  if (typeof recipe.subject_scale === 'number') director.subject_scale = clamp(recipe.subject_scale, 0, 100);

  applyMood(sceneData, director.mood);
  applyComposition(sceneData, director.composition, director.camera_strength, director.negative_space);
  applyNegativeSpace(sceneData, director.negative_space);
  applyScale(sceneData, director.subject_scale, director.camera_strength);
  applyReadingSafeZone(sceneData);

  if (!options.silentStatus) {
    setStatus(`已应用 ${director.composition} / ${director.mood}`);
  }
}

function parseDirectorPrompt(prompt) {
  const text = String(prompt || '').toLowerCase();
  const recipe = {};

  if (/左|left/.test(text)) recipe.composition = 'rule_left';
  if (/右|right/.test(text)) recipe.composition = 'rule_right';
  if (/中心|居中|center/.test(text)) recipe.composition = 'centered';
  if (/远景|wide|establish/.test(text)) recipe.composition = 'wide';
  if (/对话|双人|dialogue|two/.test(text)) recipe.composition = 'dialogue';

  if (/梦|dream|soft/.test(text)) recipe.mood = 'dreamy';
  if (/暖|温暖|warm|gold/.test(text)) recipe.mood = 'warm';
  if (/紧张|危险|tense|storm|dark red/.test(text)) recipe.mood = 'tense';
  if (/孤独|寂寞|lonely|alone|empty blue/.test(text)) recipe.mood = 'lonely';
  if (/魔法|神秘|magic|sparkle/.test(text)) recipe.mood = 'magical';

  if (/更大|放大|close|closer|hero/.test(text)) recipe.subject_scale = 74;
  if (/更小|远一点|farther|smaller/.test(text)) recipe.subject_scale = 38;
  if (/留白|空|empty|minimal/.test(text)) recipe.negative_space = 76;
  if (/更满|拥挤|dense|crowd/.test(text)) recipe.negative_space = 22;
  if (/强烈|dramatic|cinematic/.test(text)) recipe.camera_strength = 82;
  if (/平静|gentle|soft camera/.test(text)) recipe.camera_strength = 35;

  return recipe;
}

function updateSliderLabels() {
  normalizeDirectorState();
  const director = state.sceneData.editor.director;
  elements.cameraStrengthValue.textContent = `${director.camera_strength}%`;
  elements.negativeSpaceValue.textContent = `${director.negative_space}%`;
  elements.subjectScaleValue.textContent = `${director.subject_scale}%`;
}

function renderSceneFields() {
  normalizeDirectorState();
  const background = state.sceneData.scene.background || {};
  const intro = state.sceneData.dialogues.intro || {};
  const hint = state.sceneData.ui.hint || {};
  const director = state.sceneData.editor.director;

  elements.sceneIdInput.value = state.sceneData.scene.id || '';
  elements.backgroundTypeSelect.value = background.type || 'canvas';
  elements.backgroundGradientInput.value = background.gradient || background.value || '';
  elements.backgroundSrcInput.value = background.src || '';
  elements.backgroundParticlesInput.checked = Boolean(background.particles);
  elements.introEnInput.value = intro.text_en || '';
  elements.introZhInput.value = intro.text_zh || '';
  elements.hintZhInput.value = hint.text_zh || '';
  elements.compositionPresetSelect.value = director.composition;
  elements.moodPresetSelect.value = director.mood;
  elements.cameraStrengthInput.value = director.camera_strength;
  elements.negativeSpaceInput.value = director.negative_space;
  elements.subjectScaleInput.value = director.subject_scale;
  updateSliderLabels();
}

function renderEntityList() {
  const html = getEntities().map(({ entity, kind }) => `
    <button class="entity-row${entity.id === state.selectedId ? ' active' : ''}" data-entity-id="${entity.id}" type="button">
      <div class="entity-meta">
        <div class="entity-name">${entity.label || entity.id}</div>
        <div class="entity-sub">${entity.id}</div>
      </div>
      <span class="entity-badge">${kind}</span>
    </button>
  `).join('');
  elements.entityList.innerHTML = html || '<div class="inspector-empty">当前场景还没有实体。</div>';
  elements.entityList.querySelectorAll('[data-entity-id]').forEach((button) => {
    button.addEventListener('click', () => selectEntity(button.dataset.entityId));
  });
}

function renderInspector() {
  if (state.selectedId === '__scene__') {
    elements.inspector.className = 'inspector-empty';
    elements.inspector.innerHTML = '<div>当前选中的是整个场景。可在左侧编辑背景、导演参数与文案。</div>';
    return;
  }

  const found = findEntity();
  if (!found) {
    elements.inspector.className = 'inspector-empty';
    elements.inspector.textContent = '先选择一个实体，或点击“选中场景”。';
    return;
  }

  const { entity, kind } = found;
  const statesValue = kind === 'character' ? JSON.stringify(entity.states || {}, null, 2) : '';

  elements.inspector.className = '';
  elements.inspector.innerHTML = `
    <div class="inspector-grid">
      <label>
        <span>类型</span>
        <input type="text" value="${kind}" disabled>
      </label>
      <label>
        <span>ID</span>
        <input data-path="id" type="text" value="${entity.id || ''}">
      </label>
      <label>
        <span>标签</span>
        <input data-path="label" type="text" value="${entity.label || ''}">
      </label>
      <label>
        <span>图片</span>
        <input data-path="img_src" type="text" value="${entity.img_src || ''}">
      </label>
      <label>
        <span>Emoji</span>
        <input data-path="emoji" type="text" value="${entity.emoji || ''}">
      </label>
      <label>
        <span>X</span>
        <input data-path="position.x" type="text" value="${entity.position?.x || ''}">
      </label>
      <label>
        <span>Y</span>
        <input data-path="position.y" type="text" value="${entity.position?.y || ''}">
      </label>
      <label>
        <span>宽度</span>
        <input data-path="width" type="text" value="${entity.width || ''}">
      </label>
      <label>
        <span>高度</span>
        <input data-path="height" type="text" value="${entity.height || ''}">
      </label>
      <label>
        <span>动画</span>
        <input data-path="animation" type="text" value="${entity.animation || ''}">
      </label>
      ${kind === 'item' ? `
        <label class="checkbox-field">
          <input data-path="draggable" type="checkbox" ${entity.draggable ? 'checked' : ''}>
          <span>可拖拽</span>
        </label>
      ` : ''}
      ${kind === 'character' ? `
        <label>
          <span>初始状态</span>
          <input data-path="initial_state" type="text" value="${entity.initial_state || ''}">
        </label>
        <label>
          <span>状态 JSON</span>
          <textarea data-path="states" rows="8">${statesValue}</textarea>
        </label>
      ` : ''}
    </div>
  `;

  elements.inspector.querySelectorAll('[data-path]').forEach((input) => {
    const eventName = input.type === 'checkbox' ? 'change' : 'input';
    input.addEventListener(eventName, () => updateEntityField(input));
  });
}

function setDeepValue(target, path, rawValue, inputType) {
  const keys = path.split('.');
  let current = target;
  for (let index = 0; index < keys.length - 1; index += 1) {
    const key = keys[index];
    current[key] ??= {};
    current = current[key];
  }
  const key = keys[keys.length - 1];

  if (key === 'states') {
    current[key] = rawValue ? JSON.parse(rawValue) : {};
    return;
  }

  if (inputType === 'checkbox') {
    current[key] = rawValue;
    return;
  }

  current[key] = rawValue;
  if (key === 'width') target._editorBaseWidth = rawValue;
  if (key === 'height') target._editorBaseHeight = rawValue;
}

function updateEntityField(input) {
  const found = findEntity();
  if (!found) return;
  const { entity } = found;
  const nextIdValue = input.dataset.path === 'id' ? input.value.trim() : null;

  if (input.dataset.path !== 'position.x' && input.dataset.path !== 'position.y') {
    captureHistory('属性修改');
  }

  try {
    setDeepValue(entity, input.dataset.path, input.type === 'checkbox' ? input.checked : input.value, input.type);
  } catch {
    setStatus('状态 JSON 格式错误');
    return;
  }

  if (nextIdValue && nextIdValue !== state.selectedId) {
    state.selectedId = nextIdValue;
  }

  rerender({ syncPreviewNow: true });
}


function getVisualScore(visualAnalysis) {
  if (!visualAnalysis) return 0;
  const contrast = clamp(Math.round((visualAnalysis.contrast || 0) * 100), 0, 100);
  const topNoise = clamp(Math.round((visualAnalysis.topBrightnessRatio || 0) * 100), 0, 100);
  const balance = clamp(100 - Math.round(Math.abs((visualAnalysis.leftRightBias || 0) * 100)), 0, 100);
  return Math.round((contrast + (100 - topNoise) + balance) / 3);
}

function getCombinedScore(structuralAnalysis, visualAnalysis) {
  const structural = structuralAnalysis?.overallScore ?? 0;
  const visual = getVisualScore(visualAnalysis);
  return Math.round(structural * 0.68 + visual * 0.32);
}

function summarizeBrightness(brightness = 0) {
  if (brightness < 0.3) return '偏暗';
  if (brightness > 0.72) return '偏亮';
  return '适中';
}

function summarizeContrast(contrast = 0) {
  if (contrast < 0.11) return '偏平';
  if (contrast > 0.22) return '鲜明';
  return '稳定';
}

function summarizeTopWeight(topWeight = 0) {
  if (topWeight > 122) return '偏抢眼';
  if (topWeight > 108) return '稍活跃';
  return '稳定';
}

function buildVisualSuggestions(visualAnalysis, structuralAnalysis = state.analysis) {
  if (!visualAnalysis) {
    return [{
      level: 'low',
      title: '等待截图分析',
      detail: '完成截图后，这里会显示基于真实预览画面的视觉建议。',
    }];
  }

  const suggestions = [];
  const topWeight = Math.round(visualAnalysis.topBrightnessRatio * 100);

  if (visualAnalysis.brightness < 0.3) {
    suggestions.push({
      level: 'medium',
      title: '整体偏暗',
      detail: '可以切到 warm / magical 情绪，或给主体更多镜头强度，让角色从背景里跳出来。',
    });
  } else if (visualAnalysis.brightness > 0.72) {
    suggestions.push({
      level: 'medium',
      title: '整体偏亮',
      detail: '建议增加层次反差，避免高亮背景把主体边缘吞掉。',
    });
  }

  if (visualAnalysis.contrast < 0.11) {
    suggestions.push({
      level: 'high',
      title: '画面对比不足',
      detail: '主体和背景分离度偏弱，可以提高主体尺寸，或改用更有反差的情绪底色。',
    });
  }

  if (topWeight > 112 || (structuralAnalysis?.metrics.readability ?? 100) < 58) {
    suggestions.push({
      level: 'high',
      title: '顶部阅读区有干扰',
      detail: '把主体压到中下部，并提升留白，通常能让字幕和提示区更干净。',
    });
  }

  if (visualAnalysis.leftRightBalance !== 'balanced' && (structuralAnalysis?.metrics.balance ?? 100) < 60) {
    suggestions.push({
      level: 'medium',
      title: '视觉重心偏移',
      detail: `当前真实画面的重心偏${visualAnalysis.leftRightBalance === 'left' ? '左' : '右'}，建议用 centered 或对应三分法重新压主角。`,
    });
  }

  if (!suggestions.length) {
    suggestions.push({
      level: 'low',
      title: '视觉表现稳定',
      detail: '这一版在真实预览中的亮度、对比和重心都比较稳，可以继续做多轮自动优化。',
    });
  }

  return suggestions.slice(0, 4);
}

function renderSnapshotThumbnail() {
  if (!elements.snapshotThumbnail) return;

  elements.snapshotThumbnail.innerHTML = '';
  if (!state.snapshotDataUrl) {
    elements.snapshotThumbnail.classList.add('is-empty');
    elements.snapshotThumbnail.innerHTML = `
      <div class="snapshot-placeholder">
        <strong>等待截图</strong>
        <span>点击“截图评估”后，这里会显示当前预览缩略图。</span>
      </div>
    `;
    return;
  }

  elements.snapshotThumbnail.classList.remove('is-empty');
  const image = document.createElement('img');
  image.src = state.snapshotDataUrl;
  image.alt = '当前预览截图';
  elements.snapshotThumbnail.appendChild(image);
}

function renderVisualAnalysis() {
  renderSnapshotThumbnail();

  if (!state.visualAnalysis) {
    elements.visualScore.textContent = '--';
    elements.visualLumaSummary.textContent = '--';
    elements.visualContrastSummary.textContent = '--';
    elements.visualFocusSummary.textContent = '--';
    elements.visualTopSummary.textContent = '--';
    elements.visualBrightnessValue.textContent = '--';
    elements.visualContrastValue.textContent = '--';
    elements.visualBalanceValue.textContent = '--';
    elements.visualTopNoiseValue.textContent = '--';
    elements.analysisVisualMetrics.innerHTML = '';
    elements.visualAnalysisSuggestions.innerHTML = buildVisualSuggestions(null).map((item) => `
      <div class="suggestion-card" data-level="${item.level}">
        <strong>${item.title}</strong>
        <p>${item.detail}</p>
      </div>
    `).join('');
    elements.snapshotPreview.removeAttribute('src');
    elements.snapshotPreview.classList.remove('has-image');
    return;
  }

  const visualScore = getVisualScore(state.visualAnalysis);
  const topWeight = Math.round(state.visualAnalysis.topBrightnessRatio * 100);
  const biasWeight = Math.round((state.visualAnalysis.leftRightBias + 1) * 50);
  const metrics = [
    ['亮度', `${Math.round(state.visualAnalysis.brightness * 100)}`],
    ['对比', `${Math.round(state.visualAnalysis.contrast * 100)}`],
    ['重心', `${biasWeight}`],
    ['顶部', `${topWeight}`],
  ];

  elements.visualScore.textContent = `${visualScore}`;
  elements.visualLumaSummary.textContent = summarizeBrightness(state.visualAnalysis.brightness);
  elements.visualContrastSummary.textContent = summarizeContrast(state.visualAnalysis.contrast);
  elements.visualFocusSummary.textContent = state.visualAnalysis.leftRightBalance === 'balanced'
    ? '居中'
    : `偏${state.visualAnalysis.leftRightBalance === 'left' ? '左' : '右'}`;
  elements.visualTopSummary.textContent = summarizeTopWeight(topWeight);
  elements.visualBrightnessValue.textContent = `${Math.round(state.visualAnalysis.brightness * 100)}`;
  elements.visualContrastValue.textContent = `${Math.round(state.visualAnalysis.contrast * 100)}`;
  elements.visualBalanceValue.textContent = `${biasWeight}`;
  elements.visualTopNoiseValue.textContent = `${topWeight}`;
  elements.analysisVisualMetrics.innerHTML = metrics.map(([label, value]) => `
    <div class="metric-chip visual-chip">
      <strong>${value}</strong>
      <span>${label}</span>
    </div>
  `).join('');
  elements.visualAnalysisSuggestions.innerHTML = buildVisualSuggestions(state.visualAnalysis).map((item) => `
    <div class="suggestion-card" data-level="${item.level}">
      <strong>${item.title}</strong>
      <p>${item.detail}</p>
    </div>
  `).join('');
  elements.snapshotPreview.src = state.snapshotDataUrl;
  elements.snapshotPreview.classList.add('has-image');
}

function renderIterationResults() {
  if (!elements.iterateResults) return;

  const completedRounds = state.iterationResults.length;
  const targetRounds = state.iterationTargetRounds || completedRounds;
  elements.iterateStatus.textContent = state.iterateStatusText;
  elements.iterateCurrentRound.textContent = targetRounds ? `${completedRounds}/${targetRounds}` : '0/0';
  elements.iterateBestScore.textContent = state.bestIteration ? `${state.bestIteration.combinedScore}` : '--';
  elements.runAutoIterateBtn.disabled = !state.sceneData || state.autoIterating;
  elements.applyBestIterationBtn.disabled = !state.bestIteration || state.autoIterating;

  if (!state.iterationResults.length) {
    elements.iterateResults.innerHTML = '<div class="helper-text">点击“自动优化”后，这里会记录每轮候选和最佳方案。</div>';
    return;
  }

  elements.iterateResults.innerHTML = state.iterationResults.map((roundResult) => {
    const bestCandidate = roundResult.candidates[0] || null;
    const lead = bestCandidate
      ? `最佳 ${bestCandidate.combinedScore} 分 · ${bestCandidate.summary}`
      : '本轮没有可评估候选';
    const detail = bestCandidate
      ? `结构 ${bestCandidate.structuralScore} / 视觉 ${bestCandidate.visualScore} · ${roundResult.adopted ? '已采纳' : '未超过当前最佳'}`
      : '请检查预览是否已连接';
    return `
      <div class="iteration-card ${roundResult.adopted ? 'is-best' : ''}">
        <strong>第 ${roundResult.round} 轮 · ${lead}</strong>
        <span>${detail}</span>
        <p>${roundResult.candidates.slice(0, 3).map((candidate) => `${candidate.id}: ${candidate.combinedScore} 分`).join(' / ') || '无候选'}</p>
      </div>
    `;
  }).join('');
}

async function captureAndAnalyzeSnapshot(sceneData = state.sceneData, options = {}) {
  if (!sceneData) return null;
  const { silentStatus = false, transient = false } = options;

  try {
    if (!silentStatus) setStatus('正在截图评估…');
    await waitForPreviewRender(sceneData);
    const snapshotDataUrl = await captureStageFromIframe(elements.previewFrame, { pixelRatio: 1, sceneData });
    const visualAnalysis = await analyzeSnapshot(snapshotDataUrl);

    if (!transient) {
      state.snapshotDataUrl = snapshotDataUrl;
      state.visualAnalysis = visualAnalysis;
      renderVisualAnalysis();
    }

    if (!silentStatus) setStatus('截图评估完成');
    return { snapshotDataUrl, visualAnalysis };
  } catch (error) {
    console.error(error);
    if (!silentStatus) setStatus('截图评估失败');
    return null;
  }
}

async function evaluateSceneCandidate(sceneData, options = {}) {
  const structuralAnalysis = options.structuralAnalysis || analyzeScene(sceneData);
  const capture = await captureAndAnalyzeSnapshot(sceneData, { transient: true, silentStatus: true });
  const visualAnalysis = capture?.visualAnalysis || null;
  const snapshotDataUrl = capture?.snapshotDataUrl || '';
  const combinedScore = getCombinedScore(structuralAnalysis, visualAnalysis);

  return {
    id: options.id || `candidate-${Date.now()}`,
    round: options.round || 0,
    recipe: options.recipe || {},
    summary: options.summary || summarizeRecipe(options.recipe || {}),
    sceneData: clone(sceneData),
    structuralAnalysis,
    visualAnalysis,
    snapshotDataUrl,
    structuralScore: structuralAnalysis.overallScore,
    visualScore: getVisualScore(visualAnalysis),
    combinedScore,
  };
}

async function runAutoFixLoop() {
  if (!state.sceneData || state.autoIterating) return;
  if (!state.previewReady) {
    setStatus('等待预览连接后再执行一键修正');
    return;
  }

  setStatus('正在尝试一键修正…');
  const baseline = await evaluateSceneCandidate(state.sceneData, {
    id: 'baseline',
    round: 0,
    summary: '当前版本',
    recipe: {},
  });
  const proposals = proposeIterationRecipes(state.sceneData, {
    analysis: baseline.structuralAnalysis,
    visualAnalysis: baseline.visualAnalysis,
  }).slice(0, 3);

  let bestResult = baseline;
  for (let index = 0; index < proposals.length; index += 1) {
    const recipe = proposals[index];
    const candidateScene = clone(state.sceneData);
    applyDirectorRecipe(candidateScene, recipe, { silentStatus: true });
    const candidate = await evaluateSceneCandidate(candidateScene, {
      id: `fix-${index + 1}`,
      round: 1,
      recipe,
      summary: recipe.summary || summarizeRecipe(recipe),
    });
    if (candidate.combinedScore > bestResult.combinedScore) {
      bestResult = candidate;
    }
  }

  syncPreview();

  if (bestResult.id === 'baseline') {
    state.visualAnalysis = baseline.visualAnalysis;
    state.snapshotDataUrl = baseline.snapshotDataUrl;
    rerender();
    setStatus('当前版本已经接近最佳，无需自动修正');
    return;
  }

  captureHistory('一键修正');
  restoreScene(bestResult.sceneData, `已自动修正：${bestResult.summary}`);
  state.visualAnalysis = bestResult.visualAnalysis;
  state.snapshotDataUrl = bestResult.snapshotDataUrl;
  rerender({ syncPreviewNow: true, forceJson: true });
}

async function runAutoIterationLoop() {
  if (!state.sceneData || state.autoIterating) return;
  if (!state.previewReady) {
    setStatus('等待预览连接后再执行自动优化');
    return;
  }

  const totalRounds = clamp(parseInt(elements.iterateRoundsSelect.value, 10) || 5, 1, 8);
  state.autoIterating = true;
  state.iterationTargetRounds = totalRounds;
  state.iterationResults = [];
  state.bestIteration = null;
  state.iterateStatusText = '准备中';
  renderIterationResults();

  try {
    let workingBest = await evaluateSceneCandidate(state.sceneData, {
      id: 'seed',
      round: 0,
      recipe: {},
      summary: '起始版本',
    });
    state.bestIteration = workingBest;
    renderIterationResults();

    for (let round = 1; round <= totalRounds; round += 1) {
      const proposals = proposeIterationRecipes(workingBest.sceneData, {
        analysis: workingBest.structuralAnalysis,
        visualAnalysis: workingBest.visualAnalysis,
        round,
      }).slice(0, 4);

      const candidates = [];
      for (let index = 0; index < proposals.length; index += 1) {
        const recipe = proposals[index];
        state.iterateStatusText = `第 ${round} 轮 · ${index + 1}/${proposals.length}`;
        renderIterationResults();

        const candidateScene = clone(workingBest.sceneData);
        applyDirectorRecipe(candidateScene, recipe, { silentStatus: true });
        const evaluated = await evaluateSceneCandidate(candidateScene, {
          id: `r${round}-c${index + 1}`,
          round,
          recipe,
          summary: recipe.summary || summarizeRecipe(recipe),
        });
        candidates.push(evaluated);
      }

      candidates.sort((left, right) => right.combinedScore - left.combinedScore);
      const bestCandidate = candidates[0] || null;
      const adopted = Boolean(bestCandidate && bestCandidate.combinedScore >= workingBest.combinedScore);
      if (adopted && bestCandidate) {
        workingBest = bestCandidate;
      }

      state.iterationResults.push({
        round,
        adopted,
        candidates,
      });
      state.bestIteration = workingBest;
      state.iterateStatusText = adopted ? `第 ${round} 轮已更新最佳` : `第 ${round} 轮保持原最佳`;
      renderIterationResults();
    }

    setStatus(`自动优化完成，最佳 ${workingBest.combinedScore} 分`);
  } catch (error) {
    console.error(error);
    state.iterateStatusText = '失败';
    setStatus('自动优化失败');
  } finally {
    state.autoIterating = false;
    if (state.bestIteration && !state.snapshotDataUrl) {
      state.snapshotDataUrl = state.bestIteration.snapshotDataUrl;
      state.visualAnalysis = state.bestIteration.visualAnalysis;
      renderVisualAnalysis();
    }
    state.iterateStatusText = state.bestIteration ? '完成' : state.iterateStatusText;
    renderIterationResults();
    syncPreview();
  }
}

function applyBestIteration() {
  if (!state.bestIteration) return;
  captureHistory('应用自动优化');
  restoreScene(state.bestIteration.sceneData, `已应用最佳方案（${state.bestIteration.combinedScore} 分）`);
  state.visualAnalysis = state.bestIteration.visualAnalysis;
  state.snapshotDataUrl = state.bestIteration.snapshotDataUrl;
  rerender({ syncPreviewNow: true, forceJson: true });
}


function renderAnalysis() {
  if (!state.sceneData) return;
  state.analysis = analyzeScene(state.sceneData);

  if (elements.analysisScore) {
    elements.analysisScore.textContent = `${state.analysis.overallScore}`;
  }

  if (elements.analysisMetrics) {
    const metrics = [
      ['主体', state.analysis.leadLabel],
      ['平衡', `${state.analysis.metrics.balance}`],
      ['聚焦', `${state.analysis.metrics.focal}`],
      ['层次', `${state.analysis.metrics.depth}`],
      ['留白', `${state.analysis.metrics.whitespace}`],
      ['可读', `${state.analysis.metrics.readability}`],
      ['收边', `${state.analysis.metrics.containment}`],
    ];
    elements.analysisMetrics.innerHTML = metrics.map(([label, value]) => `
      <div class="metric-chip">
        <strong>${value}</strong>
        <span>${label}</span>
      </div>
    `).join('');
  }

  if (elements.analysisSuggestions) {
    const suggestions = state.analysis.suggestions.length
      ? state.analysis.suggestions
      : [{ level: 'low', title: '暂无明显问题', detail: '当前画面结构较稳，可以继续尝试导演变体。' }];
    elements.analysisSuggestions.innerHTML = suggestions.map((item) => `
      <div class="suggestion-card" data-level="${item.level}">
        <strong>${item.title}</strong>
        <p>${item.detail}</p>
      </div>
    `).join('');
  }
}

function updateVariantButtons() {
  const buttonMap = {
    a: elements.variantABtn,
    b: elements.variantBBtn,
    c: elements.variantCBtn,
  };

  const ranked = rankVariants(Object.entries(state.variants).map(([key, sceneData]) => ({ key, sceneData })));
  state.rankedVariants = ranked;

  ['a', 'b', 'c'].forEach((key) => {
    const button = buttonMap[key];
    const variant = state.variants[key];
    button.disabled = !variant;
    button.style.order = '0';
    if (!variant) {
      button.innerHTML = `<strong>变体 ${key.toUpperCase()}</strong><span>尚未生成</span>`;
    }
  });

  ranked.forEach((item, index) => {
    const button = buttonMap[item.key];
    if (!button) return;
    button.style.order = String(index + 1);
    button.innerHTML = `
      <span class="variant-rank">#${item.rank}</span>
      <strong>${item.key.toUpperCase()} · ${item.analysis.overallScore} 分</strong>
      <span class="variant-score">${item.analysis.leadLabel} / 平衡 ${item.analysis.metrics.balance} / 聚焦 ${item.analysis.metrics.focal}</span>
    `;
  });
}

function rerender({ syncPreviewNow = false, forceJson = false } = {}) {
  if (!state.sceneData) return;
  renderSceneFields();
  renderEntityList();
  renderInspector();
  renderAnalysis();
  renderVisualAnalysis();
  renderIterationResults();
  updateJsonMirror(forceJson);
  updateUndoRedoButtons();
  updateVariantButtons();
  if (syncPreviewNow) syncPreview();
}

function selectEntity(id) {
  state.selectedId = id;
  rerender({ syncPreviewNow: true });
}

function applySceneFieldBindings() {
  elements.sceneIdInput.addEventListener('input', () => {
    captureHistory('场景修改');
    state.sceneData.scene.id = elements.sceneIdInput.value;
    rerender({ syncPreviewNow: true });
  });

  elements.backgroundTypeSelect.addEventListener('change', () => {
    captureHistory('背景修改');
    state.sceneData.scene.background.type = elements.backgroundTypeSelect.value;
    rerender({ syncPreviewNow: true });
  });

  elements.backgroundGradientInput.addEventListener('input', () => {
    state.sceneData.scene.background.gradient = elements.backgroundGradientInput.value;
    rerender({ syncPreviewNow: true });
  });

  elements.backgroundSrcInput.addEventListener('input', () => {
    state.sceneData.scene.background.src = elements.backgroundSrcInput.value;
    rerender({ syncPreviewNow: true });
  });

  elements.backgroundParticlesInput.addEventListener('change', () => {
    captureHistory('背景修改');
    state.sceneData.scene.background.particles = elements.backgroundParticlesInput.checked;
    rerender({ syncPreviewNow: true });
  });

  elements.introEnInput.addEventListener('input', () => {
    state.sceneData.dialogues.intro.text_en = elements.introEnInput.value;
    rerender({ syncPreviewNow: true });
  });

  elements.introZhInput.addEventListener('input', () => {
    state.sceneData.dialogues.intro.text_zh = elements.introZhInput.value;
    rerender({ syncPreviewNow: true });
  });

  elements.hintZhInput.addEventListener('input', () => {
    state.sceneData.ui.hint.text_zh = elements.hintZhInput.value;
    rerender({ syncPreviewNow: true });
  });
}

function createEntity(kind) {
  captureHistory('新增实体');
  const entity = {
    id: nextId(kind === 'character' ? 'character' : 'item'),
    label: kind === 'character' ? 'New Character' : 'New Item',
    img_src: '',
    emoji: kind === 'character' ? '🦊' : '✨',
    position: { x: '50%', y: '50%' },
    width: kind === 'character' ? '120px' : '72px',
    height: kind === 'character' ? '120px' : '72px',
    _editorBaseWidth: kind === 'character' ? '120px' : '72px',
    _editorBaseHeight: kind === 'character' ? '120px' : '72px',
  };

  if (kind === 'character') {
    entity.states = { idle: { filter: 'none', animation: 'none' } };
    entity.initial_state = 'idle';
    state.sceneData.scene.characters.push(entity);
  } else {
    entity.draggable = true;
    entity.animation = 'item-bounce';
    state.sceneData.scene.items.push(entity);
  }

  state.selectedId = entity.id;
  rerender({ syncPreviewNow: true, forceJson: true });
}

function duplicateSelection() {
  const found = findEntity();
  if (!found) return;
  captureHistory('复制实体');
  const duplicated = clone(found.entity);
  duplicated.id = nextId(found.entity.id || 'entity');
  duplicated.label = `${found.entity.label || found.entity.id} Copy`;
  duplicated.position = {
    x: formatPercent(parsePercent(duplicated.position?.x, 50) + 6),
    y: formatPercent(parsePercent(duplicated.position?.y, 50) + 4),
  };
  found.collection.push(duplicated);
  state.selectedId = duplicated.id;
  rerender({ syncPreviewNow: true, forceJson: true });
}

function deleteSelection() {
  const found = findEntity();
  if (!found) return;
  captureHistory('删除实体');
  const index = found.collection.findIndex((entity) => entity.id === found.entity.id);
  if (index >= 0) found.collection.splice(index, 1);
  state.selectedId = '__scene__';
  rerender({ syncPreviewNow: true, forceJson: true });
}

async function loadSceneFromUrl(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const sceneData = ensureSceneShape(await response.json());
  state.past = [];
  state.future = [];
  state.variants = {};
  state.rankedVariants = [];
  resetVisualState();
  resetIterationState();
  state.selectedId = '__scene__';
  restoreScene(sceneData, `已加载 ${url}`);
}

function exportJson() {
  const blob = new Blob([JSON.stringify(state.sceneData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${state.sceneData.scene.id || 'scene'}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function populatePresets() {
  const presets = [{ label: '默认场景 / data/scene.json', url: 'data/scene.json' }];
  try {
    const response = await fetch('data/book.json');
    if (response.ok) {
      const book = await response.json();
      if (Array.isArray(book.scenes)) {
        book.scenes.forEach((scene) => {
          presets.push({
            label: `${scene.title_zh || scene.id} / ${scene.data_url}`,
            url: scene.data_url,
          });
        });
      }
    }
  } catch {}

  state.presets = presets;
  elements.scenePresetSelect.innerHTML = presets.map((preset, index) => `
    <option value="${preset.url}" ${index === 0 ? 'selected' : ''}>${preset.label}</option>
  `).join('');
}

function applyJsonEditor() {
  try {
    captureHistory('应用 JSON');
    restoreScene(JSON.parse(elements.jsonEditor.value), 'JSON 已应用');
  } catch {
    setStatus('JSON 解析失败');
  }
}

function generateVariants() {
  const base = clone(state.sceneData);
  const director = base.editor.director;
  state.variants = {
    a: clone(base),
    b: clone(base),
    c: clone(base),
  };

  applyDirectorRecipe(state.variants.a, {
    composition: compositionOptions[(compositionOptions.indexOf(director.composition) + 1) % compositionOptions.length],
    mood: director.mood,
    camera_strength: clamp(director.camera_strength + 8, 0, 100),
    negative_space: clamp(director.negative_space + 12, 0, 100),
    subject_scale: clamp(director.subject_scale + 8, 0, 100),
  }, { silentStatus: true });

  applyDirectorRecipe(state.variants.b, {
    composition: 'centered',
    mood: moodOptions[(moodOptions.indexOf(director.mood) + 1) % moodOptions.length],
    camera_strength: clamp(director.camera_strength + 18, 0, 100),
    negative_space: clamp(director.negative_space, 0, 100),
    subject_scale: clamp(director.subject_scale + 18, 0, 100),
  }, { silentStatus: true });

  applyDirectorRecipe(state.variants.c, {
    composition: 'wide',
    mood: 'lonely',
    camera_strength: clamp(director.camera_strength - 12, 0, 100),
    negative_space: clamp(director.negative_space + 20, 0, 100),
    subject_scale: clamp(director.subject_scale - 12, 0, 100),
  }, { silentStatus: true });

  updateVariantButtons();
  const best = state.rankedVariants[0];
  setStatus(best ? `已生成 3 个导演变体，当前最佳是 ${best.key.toUpperCase()}（${best.analysis.overallScore} 分）` : '已生成 3 个导演变体');
}


function applyVariant(key) {
  const variant = state.variants[key];
  if (!variant) return;
  captureHistory(`应用变体 ${key.toUpperCase()}`);
  restoreScene(clone(variant), `已应用变体 ${key.toUpperCase()}`);
}

function applySemanticControls(label = '语义控制') {
  captureHistory(label);
  applyDirectorRecipe(state.sceneData, clone(state.sceneData.editor.director));
  rerender({ syncPreviewNow: true, forceJson: true });
}

function applyDirectorPrompt() {
  const prompt = elements.directorPromptInput.value.trim();
  if (!prompt) {
    setStatus('先输入导演指令');
    return;
  }
  const recipe = parseDirectorPrompt(prompt);
  captureHistory('导演指令');
  applyDirectorRecipe(state.sceneData, recipe);
  rerender({ syncPreviewNow: true, forceJson: true });
}

function bindSemanticControls() {
  elements.applyDirectorPromptBtn.addEventListener('click', applyDirectorPrompt);
  elements.focusLeadBtn.addEventListener('click', () => {
    const lead = getLeadEntity();
    if (!lead) {
      setStatus('当前场景没有可聚焦的主体');
      return;
    }
    state.selectedId = lead.id;
    captureHistory('聚焦主角');
    applyDirectorRecipe(state.sceneData, {
      composition: 'centered',
      camera_strength: clamp(state.sceneData.editor.director.camera_strength + 10, 0, 100),
      subject_scale: clamp(state.sceneData.editor.director.subject_scale + 14, 0, 100),
    });
    rerender({ syncPreviewNow: true, forceJson: true });
  });

  elements.compositionPresetSelect.addEventListener('change', () => {
    state.sceneData.editor.director.composition = elements.compositionPresetSelect.value;
    applySemanticControls('构图预设');
  });

  elements.moodPresetSelect.addEventListener('change', () => {
    state.sceneData.editor.director.mood = elements.moodPresetSelect.value;
    applySemanticControls('情绪预设');
  });

  elements.cameraStrengthInput.addEventListener('input', () => {
    state.sceneData.editor.director.camera_strength = parseInt(elements.cameraStrengthInput.value, 10);
    updateSliderLabels();
  });
  elements.cameraStrengthInput.addEventListener('change', () => applySemanticControls('镜头强度'));

  elements.negativeSpaceInput.addEventListener('input', () => {
    state.sceneData.editor.director.negative_space = parseInt(elements.negativeSpaceInput.value, 10);
    updateSliderLabels();
  });
  elements.negativeSpaceInput.addEventListener('change', () => applySemanticControls('留白调整'));

  elements.subjectScaleInput.addEventListener('input', () => {
    state.sceneData.editor.director.subject_scale = parseInt(elements.subjectScaleInput.value, 10);
    updateSliderLabels();
  });
  elements.subjectScaleInput.addEventListener('change', () => applySemanticControls('主体尺寸'));

  elements.generateVariantsBtn.addEventListener('click', generateVariants);
  elements.captureSnapshotBtn.addEventListener('click', captureAndAnalyzeSnapshot);
  elements.autoFixBtn.addEventListener('click', runAutoFixLoop);
  elements.runAutoIterateBtn.addEventListener('click', runAutoIterationLoop);
  elements.applyBestIterationBtn.addEventListener('click', applyBestIteration);
  elements.variantABtn.addEventListener('click', () => applyVariant('a'));
  elements.variantBBtn.addEventListener('click', () => applyVariant('b'));
  elements.variantCBtn.addEventListener('click', () => applyVariant('c'));
}

function handlePreviewMessage(event) {
  const { data } = event;
  if (!data || typeof data !== 'object') return;

  if (data.type === 'preview:ready') {
    state.previewReady = true;
    syncPreview();
    setStatus('编辑器已连接预览');
    return;
  }

  if (data.type === 'preview:entitySelected') {
    state.selectedId = data.id || '__scene__';
    rerender();
    return;
  }

  if (data.type === 'preview:entityMoved') {
    const found = findEntity(data.id);
    if (!found) return;
    found.entity.position = { x: data.position.x, y: data.position.y };
    state.selectedId = data.id;
    renderEntityList();
    renderInspector();
    updateJsonMirror();
  }
}

function bindEvents() {
  applySceneFieldBindings();
  bindSemanticControls();
  window.addEventListener('message', handlePreviewMessage);
  elements.previewFrame.addEventListener('load', () => {
    state.previewReady = true;
    syncPreview();
  });

  elements.loadDefaultBtn.addEventListener('click', () => loadSceneFromUrl('data/scene.json'));
  elements.exportBtn.addEventListener('click', exportJson);
  elements.addCharacterBtn.addEventListener('click', () => createEntity('character'));
  elements.addItemBtn.addEventListener('click', () => createEntity('item'));
  elements.duplicateBtn.addEventListener('click', duplicateSelection);
  elements.deleteBtn.addEventListener('click', deleteSelection);
  elements.undoBtn.addEventListener('click', undo);
  elements.redoBtn.addEventListener('click', redo);
  elements.focusSceneBtn.addEventListener('click', () => selectEntity('__scene__'));
  elements.refreshPreviewBtn.addEventListener('click', syncPreview);
  elements.formatJsonBtn.addEventListener('click', () => updateJsonMirror(true));
  elements.applyJsonBtn.addEventListener('click', applyJsonEditor);

  elements.scenePresetSelect.addEventListener('change', () => {
    if (elements.scenePresetSelect.value) {
      loadSceneFromUrl(elements.scenePresetSelect.value);
    }
  });

  elements.importFile.addEventListener('change', async () => {
    const [file] = elements.importFile.files || [];
    if (!file) return;
    const text = await file.text();
    try {
      state.past = [];
      state.future = [];
      state.variants = {};
      state.rankedVariants = [];
      resetVisualState();
      resetIterationState();
      restoreScene(JSON.parse(text), `已导入 ${file.name}`);
    } catch {
      setStatus('导入失败：JSON 无效');
    } finally {
      elements.importFile.value = '';
    }
  });
}

async function init() {
  bindEvents();
  updateUndoRedoButtons();
  await populatePresets();
  await loadSceneFromUrl('data/scene.json');
}

init().catch((error) => {
  console.error(error);
  setStatus('初始化失败');
});
