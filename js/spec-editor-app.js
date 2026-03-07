const $ = (selector) => document.querySelector(selector);

const elements = {
  statusPill: $('#status-pill'),
  loadSampleBtn: $('#load-sample-btn'),
  importSpecInput: $('#import-spec-input'),
  copyPromptBtn: $('#copy-prompt-btn'),
  downloadPromptBtn: $('#download-prompt-btn'),
  downloadSpecBtn: $('#download-spec-btn'),
  reviewTotal: $('#review-total'),
  promptPreview: $('#prompt-preview'),
  jsonPreview: $('#json-preview'),
  bookIdInput: $('#book-id-input'),
  pageIdInput: $('#page-id-input'),
  versionInput: $('#version-input'),
  pageRoleInput: $('#page-role-input'),
  storyEnInput: $('#story-en-input'),
  storyZhInput: $('#story-zh-input'),
  coreFeelingInput: $('#core-feeling-input'),
  compositionModeSelect: $('#composition-mode-select'),
  leadSubjectInput: $('#lead-subject-input'),
  secondarySubjectInput: $('#secondary-subject-input'),
  negativeSpaceInput: $('#negative-space-input'),
  subjectScaleInput: $('#subject-scale-input'),
  cameraDistanceInput: $('#camera-distance-input'),
  aspectRatioInput: $('#aspect-ratio-input'),
  readingTopInput: $('#reading-top-input'),
  readingLeftInput: $('#reading-left-input'),
  readingRightInput: $('#reading-right-input'),
  readingBottomInput: $('#reading-bottom-input'),
  edgeTopInput: $('#edge-top-input'),
  edgeLeftInput: $('#edge-left-input'),
  edgeRightInput: $('#edge-right-input'),
  edgeBottomInput: $('#edge-bottom-input'),
  noOverlapInput: $('#no-overlap-input'),
  noCropInput: $('#no-crop-input'),
  paletteInput: $('#palette-input'),
  styleKeywordsInput: $('#style-keywords-input'),
  negativeKeywordsInput: $('#negative-keywords-input'),
  canvasTitleInput: $('#canvas-title-input'),
  canvasVersionTagInput: $('#canvas-version-tag-input'),
  canvasShareUrlInput: $('#canvas-share-url-input'),
  canvasExportedImageInput: $('#canvas-exported-image-input'),
  canvasNotesInput: $('#canvas-notes-input'),
  reviewStatusSelect: $('#review-status-select'),
  reviewNotesInput: $('#review-notes-input'),
  scoreReadabilityInput: $('#score-readability-input'),
  scoreContainmentInput: $('#score-containment-input'),
  scoreWhitespaceInput: $('#score-whitespace-input'),
  scoreFocusInput: $('#score-focus-input'),
  scoreRestraintInput: $('#score-restraint-input'),
  scoreConsistencyInput: $('#score-consistency-input'),
};

const state = {
  spec: null,
  promptTemplate: '',
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function setStatus(text) {
  elements.statusPill.textContent = text;
}

function listToText(value = []) {
  return Array.isArray(value) ? value.join(', ') : '';
}

function textToList(value = '') {
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function get(obj, path, fallback = '') {
  return path.split('.').reduce((current, key) => {
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
    style_keywords: listToText(get(spec, 'style_system.keywords', [])),
    palette: listToText(get(spec, 'style_system.palette', [])),
  };
}

function computeReviewTotal(spec) {
  const scores = spec.review?.scores || {};
  const keys = ['readability', 'containment', 'whitespace', 'focus', 'restraint', 'consistency'];
  const total = keys.reduce((sum, key) => sum + Number(scores[key] || 0), 0);
  return Math.round(total / keys.length);
}

function ensureSpecShape(spec) {
  spec.book_id ??= 'storybook-mvp';
  spec.page_id ??= 'page_001';
  spec.version ??= 1;
  spec.story_text ??= { en: '', zh: '' };
  spec.visual_intent ??= {};
  spec.visual_intent.page_role ??= '';
  spec.visual_intent.core_feeling ??= '';
  spec.visual_intent.composition_mode ??= 'wide';
  spec.visual_intent.lead_subject ??= '';
  spec.visual_intent.secondary_subject ??= '';
  spec.visual_intent.negative_space_ratio ??= 0.55;
  spec.visual_intent.subject_scale ??= 'small_to_medium';
  spec.visual_intent.camera_distance ??= 'storybook_mid_wide';
  spec.layout_constraints ??= {};
  spec.layout_constraints.target_aspect_ratio ??= '16:9';
  spec.layout_constraints.reading_safe_zone ??= { top: 0.12, left: 0.12, right: 0.88, bottom: 0.42 };
  spec.layout_constraints.edge_safety ??= { top: 0.08, left: 0.08, right: 0.92, bottom: 0.9 };
  spec.layout_constraints.do_not_overlap_text ??= true;
  spec.layout_constraints.do_not_crop_subjects ??= true;
  spec.style_system ??= {};
  spec.style_system.palette ??= [];
  spec.style_system.keywords ??= [];
  spec.style_system.negative_keywords ??= [];
  spec.canvas_prompt ??= { title: '', version_tag: '' };
  spec.canvas_result ??= { share_url: '', exported_image: '', selected: false, notes: '' };
  spec.review ??= {};
  spec.review.status ??= 'draft_spec';
  spec.review.scores ??= {
    readability: 0,
    containment: 0,
    whitespace: 0,
    focus: 0,
    restraint: 0,
    consistency: 0,
  };
  spec.review.reviewer_notes ??= '';
  return spec;
}

function renderForm() {
  const spec = state.spec;
  elements.bookIdInput.value = spec.book_id || '';
  elements.pageIdInput.value = spec.page_id || '';
  elements.versionInput.value = spec.version || 1;
  elements.pageRoleInput.value = get(spec, 'visual_intent.page_role', '');
  elements.storyEnInput.value = get(spec, 'story_text.en', '');
  elements.storyZhInput.value = get(spec, 'story_text.zh', '');
  elements.coreFeelingInput.value = get(spec, 'visual_intent.core_feeling', '');
  elements.compositionModeSelect.value = get(spec, 'visual_intent.composition_mode', 'wide');
  elements.leadSubjectInput.value = get(spec, 'visual_intent.lead_subject', '');
  elements.secondarySubjectInput.value = get(spec, 'visual_intent.secondary_subject', '');
  elements.negativeSpaceInput.value = get(spec, 'visual_intent.negative_space_ratio', 0.55);
  elements.subjectScaleInput.value = get(spec, 'visual_intent.subject_scale', '');
  elements.cameraDistanceInput.value = get(spec, 'visual_intent.camera_distance', '');
  elements.aspectRatioInput.value = get(spec, 'layout_constraints.target_aspect_ratio', '16:9');
  elements.readingTopInput.value = get(spec, 'layout_constraints.reading_safe_zone.top', 0.12);
  elements.readingLeftInput.value = get(spec, 'layout_constraints.reading_safe_zone.left', 0.12);
  elements.readingRightInput.value = get(spec, 'layout_constraints.reading_safe_zone.right', 0.88);
  elements.readingBottomInput.value = get(spec, 'layout_constraints.reading_safe_zone.bottom', 0.42);
  elements.edgeTopInput.value = get(spec, 'layout_constraints.edge_safety.top', 0.08);
  elements.edgeLeftInput.value = get(spec, 'layout_constraints.edge_safety.left', 0.08);
  elements.edgeRightInput.value = get(spec, 'layout_constraints.edge_safety.right', 0.92);
  elements.edgeBottomInput.value = get(spec, 'layout_constraints.edge_safety.bottom', 0.9);
  elements.noOverlapInput.checked = Boolean(get(spec, 'layout_constraints.do_not_overlap_text', true));
  elements.noCropInput.checked = Boolean(get(spec, 'layout_constraints.do_not_crop_subjects', true));
  elements.paletteInput.value = listToText(get(spec, 'style_system.palette', []));
  elements.styleKeywordsInput.value = listToText(get(spec, 'style_system.keywords', []));
  elements.negativeKeywordsInput.value = listToText(get(spec, 'style_system.negative_keywords', []));
  elements.canvasTitleInput.value = get(spec, 'canvas_prompt.title', '');
  elements.canvasVersionTagInput.value = get(spec, 'canvas_prompt.version_tag', '');
  elements.canvasShareUrlInput.value = get(spec, 'canvas_result.share_url', '');
  elements.canvasExportedImageInput.value = get(spec, 'canvas_result.exported_image', '');
  elements.canvasNotesInput.value = get(spec, 'canvas_result.notes', '');
  elements.reviewStatusSelect.value = get(spec, 'review.status', 'draft_spec');
  elements.reviewNotesInput.value = get(spec, 'review.reviewer_notes', '');
  elements.scoreReadabilityInput.value = get(spec, 'review.scores.readability', 0);
  elements.scoreContainmentInput.value = get(spec, 'review.scores.containment', 0);
  elements.scoreWhitespaceInput.value = get(spec, 'review.scores.whitespace', 0);
  elements.scoreFocusInput.value = get(spec, 'review.scores.focus', 0);
  elements.scoreRestraintInput.value = get(spec, 'review.scores.restraint', 0);
  elements.scoreConsistencyInput.value = get(spec, 'review.scores.consistency', 0);
}

function syncSpecFromForm() {
  const spec = state.spec;
  spec.book_id = elements.bookIdInput.value.trim();
  spec.page_id = elements.pageIdInput.value.trim();
  spec.version = Math.max(1, parseInt(elements.versionInput.value, 10) || 1);
  spec.story_text.en = elements.storyEnInput.value;
  spec.story_text.zh = elements.storyZhInput.value;
  spec.visual_intent.page_role = elements.pageRoleInput.value.trim();
  spec.visual_intent.core_feeling = elements.coreFeelingInput.value.trim();
  spec.visual_intent.composition_mode = elements.compositionModeSelect.value;
  spec.visual_intent.lead_subject = elements.leadSubjectInput.value.trim();
  spec.visual_intent.secondary_subject = elements.secondarySubjectInput.value.trim();
  spec.visual_intent.negative_space_ratio = Number(elements.negativeSpaceInput.value || 0);
  spec.visual_intent.subject_scale = elements.subjectScaleInput.value.trim();
  spec.visual_intent.camera_distance = elements.cameraDistanceInput.value.trim();
  spec.layout_constraints.target_aspect_ratio = elements.aspectRatioInput.value.trim();
  spec.layout_constraints.reading_safe_zone.top = Number(elements.readingTopInput.value || 0);
  spec.layout_constraints.reading_safe_zone.left = Number(elements.readingLeftInput.value || 0);
  spec.layout_constraints.reading_safe_zone.right = Number(elements.readingRightInput.value || 0);
  spec.layout_constraints.reading_safe_zone.bottom = Number(elements.readingBottomInput.value || 0);
  spec.layout_constraints.edge_safety.top = Number(elements.edgeTopInput.value || 0);
  spec.layout_constraints.edge_safety.left = Number(elements.edgeLeftInput.value || 0);
  spec.layout_constraints.edge_safety.right = Number(elements.edgeRightInput.value || 0);
  spec.layout_constraints.edge_safety.bottom = Number(elements.edgeBottomInput.value || 0);
  spec.layout_constraints.do_not_overlap_text = elements.noOverlapInput.checked;
  spec.layout_constraints.do_not_crop_subjects = elements.noCropInput.checked;
  spec.style_system.palette = textToList(elements.paletteInput.value);
  spec.style_system.keywords = textToList(elements.styleKeywordsInput.value);
  spec.style_system.negative_keywords = textToList(elements.negativeKeywordsInput.value);
  spec.canvas_prompt.title = elements.canvasTitleInput.value.trim();
  spec.canvas_prompt.version_tag = elements.canvasVersionTagInput.value.trim();
  spec.canvas_result.share_url = elements.canvasShareUrlInput.value.trim();
  spec.canvas_result.exported_image = elements.canvasExportedImageInput.value.trim();
  spec.canvas_result.notes = elements.canvasNotesInput.value;
  spec.review.status = elements.reviewStatusSelect.value;
  spec.review.reviewer_notes = elements.reviewNotesInput.value;
  spec.review.scores.readability = Number(elements.scoreReadabilityInput.value || 0);
  spec.review.scores.containment = Number(elements.scoreContainmentInput.value || 0);
  spec.review.scores.whitespace = Number(elements.scoreWhitespaceInput.value || 0);
  spec.review.scores.focus = Number(elements.scoreFocusInput.value || 0);
  spec.review.scores.restraint = Number(elements.scoreRestraintInput.value || 0);
  spec.review.scores.consistency = Number(elements.scoreConsistencyInput.value || 0);
}

function renderDerived() {
  syncSpecFromForm();
  const prompt = fillTemplate(state.promptTemplate, buildTemplateValues(state.spec));
  elements.promptPreview.textContent = prompt;
  elements.jsonPreview.value = JSON.stringify(state.spec, null, 2);
  elements.reviewTotal.textContent = `总评 ${computeReviewTotal(state.spec)}`;
}

function downloadText(filename, text, type = 'text/plain;charset=utf-8') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function copyPrompt() {
  const text = elements.promptPreview.textContent;
  await navigator.clipboard.writeText(text);
  setStatus('Prompt 已复制');
}

async function loadSample() {
  const [specResponse, templateResponse] = await Promise.all([
    fetch('page_specs/lp_001.json'),
    fetch('tools/templates/gemini_canvas_prompt_template.md'),
  ]);
  state.spec = ensureSpecShape(await specResponse.json());
  state.promptTemplate = await templateResponse.text();
  renderForm();
  renderDerived();
  setStatus('已加载示例 spec');
}

async function importSpec(file) {
  const text = await file.text();
  state.spec = ensureSpecShape(JSON.parse(text));
  renderForm();
  renderDerived();
  setStatus(`已导入 ${file.name}`);
}

function bindEvents() {
  const inputs = document.querySelectorAll('input, select, textarea');
  inputs.forEach((element) => {
    if (element === elements.importSpecInput || element === elements.jsonPreview) return;
    const eventName = element.type === 'checkbox' ? 'change' : 'input';
    element.addEventListener(eventName, renderDerived);
    if (eventName !== 'change') {
      element.addEventListener('change', renderDerived);
    }
  });

  elements.loadSampleBtn.addEventListener('click', loadSample);
  elements.importSpecInput.addEventListener('change', async () => {
    const [file] = elements.importSpecInput.files || [];
    if (!file) return;
    try {
      await importSpec(file);
    } catch (error) {
      console.error(error);
      setStatus('导入失败');
    } finally {
      elements.importSpecInput.value = '';
    }
  });

  elements.copyPromptBtn.addEventListener('click', () => {
    copyPrompt().catch((error) => {
      console.error(error);
      setStatus('复制失败');
    });
  });

  elements.downloadPromptBtn.addEventListener('click', () => {
    renderDerived();
    downloadText(`${state.spec.page_id || 'page'}.prompt.md`, elements.promptPreview.textContent, 'text/markdown;charset=utf-8');
    setStatus('Prompt 已下载');
  });

  elements.downloadSpecBtn.addEventListener('click', () => {
    renderDerived();
    downloadText(`${state.spec.page_id || 'page'}.json`, elements.jsonPreview.value, 'application/json;charset=utf-8');
    setStatus('Spec 已下载');
  });
}

async function init() {
  bindEvents();
  await loadSample();
}

init().catch((error) => {
  console.error(error);
  setStatus('初始化失败');
});
