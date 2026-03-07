import { bus } from 'core/bus.js';
import { store } from 'core/store.js';
import 'modules/effects.js';
import 'modules/ui.js';
import 'modules/audio.js';
import 'modules/particles.js';
import 'modules/scene-loader.js';

const stageEl = document.getElementById('stage');
const preservedIds = new Set(['bg-canvas', 'reading-zone', 'hint-bar', 'ending-overlay', 'ambient-light', 'progress-bar']);

const previewState = {
  sceneData: null,
  selectedId: null,
  draggingId: null,
  dragCommitted: false,
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function clearStage() {
  Array.from(stageEl.children).forEach((child) => {
    if (!preservedIds.has(child.id)) child.remove();
  });

  const hintBar = document.getElementById('hint-bar');
  if (hintBar) {
    hintBar.textContent = '';
    hintBar.classList.remove('visible');
  }

  const endingOverlay = document.getElementById('ending-overlay');
  if (endingOverlay) endingOverlay.classList.remove('visible');
}

function sanitizeSceneData(sceneData) {
  const nextScene = clone(sceneData);
  nextScene.scene ??= {};
  nextScene.scene.background ??= {};
  nextScene.scene.background.particles = false;

  Object.values(nextScene.dialogues || {}).forEach((dialogue) => {
    dialogue.auto_play = false;
  });

  (nextScene.scene.characters || []).forEach((character) => {
    if (character.states) {
      Object.values(character.states).forEach((state) => {
        state.animation = 'none';
      });
    }
  });

  (nextScene.scene.items || []).forEach((item) => {
    item.animation = '';
  });

  nextScene.ui ??= {};
  nextScene.ui.hint = {
    ...(nextScene.ui.hint || {}),
    text_en: '',
    text_zh: '',
  };

  if (nextScene.ending) nextScene.ending.auto_advance = false;
  return nextScene;
}

function setSelection(id) {
  previewState.selectedId = id;
  document.querySelectorAll('.scene-character, .scene-item').forEach((element) => {
    const active = id && element.id === id;
    element.classList.toggle('editor-selected', active);
    if (active) {
      element.dataset.editorLabel = element.id;
    } else {
      delete element.dataset.editorLabel;
    }
  });
}

function renderScene(sceneData, selectedId) {
  previewState.sceneData = sanitizeSceneData(sceneData);
  clearStage();
  bus.emit('audio:stop');
  store.mode = 'single';
  store.currentSceneData = previewState.sceneData;
  requestAnimationFrame(() => setSelection(selectedId));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function toPercent(value, total) {
  if (!total) return '50%';
  return `${(value / total * 100).toFixed(2)}%`;
}

function findEntity(id) {
  const characters = previewState.sceneData?.scene?.characters || [];
  const items = previewState.sceneData?.scene?.items || [];
  return characters.find((entity) => entity.id === id) || items.find((entity) => entity.id === id) || null;
}

function beginDrag(event, element) {
  previewState.draggingId = element.id;
  previewState.dragCommitted = false;
  setSelection(element.id);
  window.parent.postMessage({ type: 'preview:dragStarted', id: element.id }, '*');
  window.parent.postMessage({ type: 'preview:entitySelected', id: element.id }, '*');
  event.preventDefault();
}

function moveDrag(event) {
  if (!previewState.draggingId) return;
  const pointer = event.touches?.[0] || event;
  const rect = stageEl.getBoundingClientRect();
  const x = clamp(pointer.clientX - rect.left, 0, rect.width);
  const y = clamp(pointer.clientY - rect.top, 0, rect.height);
  const entity = findEntity(previewState.draggingId);
  const element = document.getElementById(previewState.draggingId);
  if (!entity || !element) return;

  const position = {
    x: toPercent(x, rect.width),
    y: toPercent(y, rect.height),
  };

  previewState.dragCommitted = true;
  entity.position = position;
  element.style.left = position.x;
  element.style.top = position.y;

  window.parent.postMessage({
    type: 'preview:entityMoved',
    id: previewState.draggingId,
    position,
  }, '*');
}

function endDrag() {
  if (previewState.draggingId && previewState.dragCommitted) {
    const entity = findEntity(previewState.draggingId);
    if (entity) {
      window.parent.postMessage({
        type: 'preview:entityMoveCommitted',
        id: previewState.draggingId,
        position: clone(entity.position),
      }, '*');
    }
  }

  previewState.draggingId = null;
  previewState.dragCommitted = false;
}

function onPointerDown(event) {
  const element = event.target.closest('.scene-character, .scene-item');
  if (element) {
    beginDrag(event, element);
    return;
  }

  if (event.target.id === 'stage' || event.target.id === 'bg-canvas') {
    previewState.selectedId = '__scene__';
    setSelection(null);
    window.parent.postMessage({ type: 'preview:entitySelected', id: '__scene__' }, '*');
  }
}

window.addEventListener('message', (event) => {
  const { data } = event;
  if (!data || typeof data !== 'object') return;

  if (data.type === 'scene:update' && data.sceneData) {
    renderScene(data.sceneData, data.selectedId);
    return;
  }

  if (data.type === 'scene:select') {
    setSelection(data.selectedId);
  }
});

stageEl.addEventListener('mousedown', onPointerDown);
stageEl.addEventListener('touchstart', onPointerDown, { passive: false });
document.addEventListener('mousemove', moveDrag, { passive: false });
document.addEventListener('touchmove', moveDrag, { passive: false });
document.addEventListener('mouseup', endDrag);
document.addEventListener('touchend', endDrag);
document.addEventListener('touchcancel', endDrag);

window.parent.postMessage({ type: 'preview:ready' }, '*');
