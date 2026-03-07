const $ = (selector) => document.querySelector(selector);
const STORAGE_KEY = 'kids-book-mvp.canvas-tracker';

const elements = {
  refreshPagesBtn: $('#refresh-pages-btn'),
  saveDraftBtn: $('#save-draft-btn'),
  copySummaryBtn: $('#copy-summary-btn'),
  downloadRegistryBtn: $('#download-registry-btn'),
  downloadMergedSpecBtn: $('#download-merged-spec-btn'),
  pagesCount: $('#pages-count'),
  pagesList: $('#pages-list'),
  pageHeading: $('#page-heading'),
  pageMeta: $('#page-meta'),
  openSpecLink: $('#open-spec-link'),
  canvasTitleInput: $('#canvas-title-input'),
  canvasVersionTagInput: $('#canvas-version-tag-input'),
  canvasShareUrlInput: $('#canvas-share-url-input'),
  canvasExportedImageInput: $('#canvas-exported-image-input'),
  canvasNotesInput: $('#canvas-notes-input'),
  canvasSelectedInput: $('#canvas-selected-input'),
  reviewStatusSelect: $('#review-status-select'),
  reviewNotesInput: $('#review-notes-input'),
  scoreReadabilityInput: $('#score-readability-input'),
  scoreContainmentInput: $('#score-containment-input'),
  scoreWhitespaceInput: $('#score-whitespace-input'),
  scoreFocusInput: $('#score-focus-input'),
  scoreRestraintInput: $('#score-restraint-input'),
  scoreConsistencyInput: $('#score-consistency-input'),
  promptPreview: $('#prompt-preview'),
  summaryPreview: $('#summary-preview'),
  jsonPreview: $('#json-preview'),
};

const state = {
  template: '',
  pages: [],
  selectedPageId: '',
  drafts: {},
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function readDrafts() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function saveDrafts() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.drafts, null, 2));
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

function listToText(value = []) {
  return Array.isArray(value) ? value.join(', ') : '';
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

function ensureReviewShape(spec) {
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

function reviewTotal(spec) {
  const scores = spec.review?.scores || {};
  const keys = ['readability', 'containment', 'whitespace', 'focus', 'restraint', 'consistency'];
  return Math.round(keys.reduce((sum, key) => sum + Number(scores[key] || 0), 0) / keys.length);
}

function mergeDraft(spec) {
  const draft = state.drafts[spec.page_id];
  if (!draft) return spec;
  const merged = clone(spec);
  merged.canvas_prompt = { ...(merged.canvas_prompt || {}), ...(draft.canvas_prompt || {}) };
  merged.canvas_result = { ...(merged.canvas_result || {}), ...(draft.canvas_result || {}) };
  merged.review = {
    ...(merged.review || {}),
    ...(draft.review || {}),
    scores: {
      ...((merged.review || {}).scores || {}),
      ...((draft.review || {}).scores || {}),
    },
  };
  return ensureReviewShape(merged);
}

function selectedPage() {
  return state.pages.find((page) => page.page_id === state.selectedPageId) || null;
}

function buildSummary(spec) {
  const scores = spec.review?.scores || {};
  return [
    `Page: ${spec.page_id}`,
    `Status: ${spec.review?.status || 'draft_spec'}`,
    `Canvas Title: ${spec.canvas_prompt?.title || ''}`,
    `Share URL: ${spec.canvas_result?.share_url || ''}`,
    `Exported Image: ${spec.canvas_result?.exported_image || ''}`,
    `Selected: ${spec.canvas_result?.selected ? 'yes' : 'no'}`,
    `Review Total: ${reviewTotal(spec)}`,
    `Scores: readability ${scores.readability || 0}, containment ${scores.containment || 0}, whitespace ${scores.whitespace || 0}, focus ${scores.focus || 0}, restraint ${scores.restraint || 0}, consistency ${scores.consistency || 0}`,
    `Notes: ${spec.review?.reviewer_notes || spec.canvas_result?.notes || ''}`,
  ].join('\n');
}

function renderPagesList() {
  elements.pagesCount.textContent = `${state.pages.length}`;
  elements.pagesList.innerHTML = state.pages.map((spec) => {
    const merged = mergeDraft(spec);
    const active = merged.page_id === state.selectedPageId ? 'active' : '';
    return `
      <button class="page-card ${active}" type="button" data-page-id="${merged.page_id}">
        <strong>${merged.page_id}</strong>
        <span>${get(merged, 'visual_intent.page_role', 'no page role')}</span>
        <span>${merged.review.status} · 总评 ${reviewTotal(merged)}</span>
      </button>
    `;
  }).join('');

  elements.pagesList.querySelectorAll('[data-page-id]').forEach((button) => {
    button.addEventListener('click', () => {
      state.selectedPageId = button.dataset.pageId;
      renderAll();
    });
  });
}

function renderDetail() {
  const spec = selectedPage();
  if (!spec) {
    elements.pageHeading.textContent = '未选择页面';
    elements.pageMeta.textContent = '选择左侧页面开始登记 Canvas 结果';
    elements.promptPreview.textContent = '';
    elements.summaryPreview.value = '';
    elements.jsonPreview.value = '';
    return;
  }

  const merged = mergeDraft(spec);
  elements.pageHeading.textContent = merged.page_id;
  elements.pageMeta.textContent = `${get(merged, 'visual_intent.page_role', '')} · ${get(merged, 'story_text.en', '').slice(0, 80)}`;
  elements.openSpecLink.href = `spec-editor.html`;
  elements.canvasTitleInput.value = get(merged, 'canvas_prompt.title', '');
  elements.canvasVersionTagInput.value = get(merged, 'canvas_prompt.version_tag', '');
  elements.canvasShareUrlInput.value = get(merged, 'canvas_result.share_url', '');
  elements.canvasExportedImageInput.value = get(merged, 'canvas_result.exported_image', '');
  elements.canvasNotesInput.value = get(merged, 'canvas_result.notes', '');
  elements.canvasSelectedInput.checked = Boolean(get(merged, 'canvas_result.selected', false));
  elements.reviewStatusSelect.value = get(merged, 'review.status', 'draft_spec');
  elements.reviewNotesInput.value = get(merged, 'review.reviewer_notes', '');
  elements.scoreReadabilityInput.value = get(merged, 'review.scores.readability', 0);
  elements.scoreContainmentInput.value = get(merged, 'review.scores.containment', 0);
  elements.scoreWhitespaceInput.value = get(merged, 'review.scores.whitespace', 0);
  elements.scoreFocusInput.value = get(merged, 'review.scores.focus', 0);
  elements.scoreRestraintInput.value = get(merged, 'review.scores.restraint', 0);
  elements.scoreConsistencyInput.value = get(merged, 'review.scores.consistency', 0);
  elements.promptPreview.textContent = fillTemplate(state.template, buildTemplateValues(merged));
  elements.summaryPreview.value = buildSummary(merged);
  elements.jsonPreview.value = JSON.stringify(merged, null, 2);
}

function writeDraftFromForm() {
  const spec = selectedPage();
  if (!spec) return;
  state.drafts[spec.page_id] = {
    canvas_prompt: {
      title: elements.canvasTitleInput.value.trim(),
      version_tag: elements.canvasVersionTagInput.value.trim(),
    },
    canvas_result: {
      share_url: elements.canvasShareUrlInput.value.trim(),
      exported_image: elements.canvasExportedImageInput.value.trim(),
      selected: elements.canvasSelectedInput.checked,
      notes: elements.canvasNotesInput.value,
    },
    review: {
      status: elements.reviewStatusSelect.value,
      reviewer_notes: elements.reviewNotesInput.value,
      scores: {
        readability: Number(elements.scoreReadabilityInput.value || 0),
        containment: Number(elements.scoreContainmentInput.value || 0),
        whitespace: Number(elements.scoreWhitespaceInput.value || 0),
        focus: Number(elements.scoreFocusInput.value || 0),
        restraint: Number(elements.scoreRestraintInput.value || 0),
        consistency: Number(elements.scoreConsistencyInput.value || 0),
      },
    },
  };
}

function renderAll() {
  renderPagesList();
  renderDetail();
}

async function loadPages() {
  const [indexResponse, templateResponse] = await Promise.all([
    fetch('page_specs/index.json'),
    fetch('tools/templates/gemini_canvas_prompt_template.md'),
  ]);
  const indexJson = await indexResponse.json();
  state.template = await templateResponse.text();
  state.pages = await Promise.all((indexJson.pages || []).map(async (page) => {
    const response = await fetch(page.path);
    return ensureReviewShape(await response.json());
  }));
  if (!state.selectedPageId && state.pages[0]) {
    state.selectedPageId = state.pages[0].page_id;
  }
  renderAll();
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

function bindEvents() {
  const watched = [
    elements.canvasTitleInput,
    elements.canvasVersionTagInput,
    elements.canvasShareUrlInput,
    elements.canvasExportedImageInput,
    elements.canvasNotesInput,
    elements.canvasSelectedInput,
    elements.reviewStatusSelect,
    elements.reviewNotesInput,
    elements.scoreReadabilityInput,
    elements.scoreContainmentInput,
    elements.scoreWhitespaceInput,
    elements.scoreFocusInput,
    elements.scoreRestraintInput,
    elements.scoreConsistencyInput,
  ];
  watched.forEach((element) => {
    const eventName = element.type === 'checkbox' ? 'change' : 'input';
    element.addEventListener(eventName, () => {
      writeDraftFromForm();
      renderAll();
    });
    if (eventName !== 'change') {
      element.addEventListener('change', () => {
        writeDraftFromForm();
        renderAll();
      });
    }
  });

  elements.refreshPagesBtn.addEventListener('click', () => {
    loadPages().catch((error) => console.error(error));
  });
  elements.saveDraftBtn.addEventListener('click', () => {
    writeDraftFromForm();
    saveDrafts();
    renderAll();
  });
  elements.copySummaryBtn.addEventListener('click', async () => {
    await navigator.clipboard.writeText(elements.summaryPreview.value);
  });
  elements.downloadRegistryBtn.addEventListener('click', () => {
    writeDraftFromForm();
    saveDrafts();
    downloadText('canvas-review-registry.json', JSON.stringify(state.drafts, null, 2), 'application/json;charset=utf-8');
  });
  elements.downloadMergedSpecBtn.addEventListener('click', () => {
    writeDraftFromForm();
    const spec = selectedPage();
    if (!spec) return;
    const merged = mergeDraft(spec);
    downloadText(`${merged.page_id}.reviewed.json`, JSON.stringify(merged, null, 2), 'application/json;charset=utf-8');
  });
}

async function init() {
  state.drafts = readDrafts();
  bindEvents();
  await loadPages();
}

init().catch((error) => {
  console.error(error);
});
