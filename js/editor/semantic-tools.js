function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function parsePercent(value, fallback = 50) {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return fallback;
  const match = value.match(/-?\d+(\.\d+)?/);
  return match ? Number(match[0]) : fallback;
}

function formatPercent(value) {
  return `${clamp(value, 0, 100).toFixed(2)}%`;
}

function parsePx(value, fallback = 100) {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return fallback;
  const match = value.match(/-?\d+(\.\d+)?/);
  return match ? Number(match[0]) : fallback;
}

function formatPx(value) {
  return `${Math.round(Math.max(24, value))}px`;
}

function allEntities(sceneData) {
  const scene = sceneData.scene || {};
  return [...(scene.characters || []), ...(scene.items || [])];
}

function findFocusEntity(sceneData, focusId) {
  const entities = allEntities(sceneData);
  if (!entities.length) return null;
  if (focusId) {
    const found = entities.find((entity) => entity.id === focusId);
    if (found) return found;
  }
  return entities
    .slice()
    .sort((a, b) => (parsePx(b.width, 80) * parsePx(b.height, 80)) - (parsePx(a.width, 80) * parsePx(a.height, 80)))[0];
}

function adjustEntityScale(entity, factor) {
  entity.width = formatPx(parsePx(entity.width, 100) * factor);
  entity.height = formatPx(parsePx(entity.height, 100) * factor);
}

function offsetEntity(entity, dx = 0, dy = 0) {
  entity.position ??= { x: '50%', y: '50%' };
  entity.position.x = formatPercent(parsePercent(entity.position.x, 50) + dx);
  entity.position.y = formatPercent(parsePercent(entity.position.y, 50) + dy);
}

function spreadEntities(sceneData, amount = 10) {
  const entities = allEntities(sceneData);
  if (entities.length <= 1) return;
  const step = amount / Math.max(1, entities.length - 1);
  entities.forEach((entity, index) => {
    offsetEntity(entity, (index - (entities.length - 1) / 2) * step, 0);
  });
}

function setMood(sceneData, mood) {
  const background = sceneData.scene.background || (sceneData.scene.background = { type: 'canvas', particles: false });
  const subtitlePanel = sceneData.ui?.subtitle_panel || (sceneData.ui.subtitle_panel = {});
  const hint = sceneData.ui?.hint || (sceneData.ui.hint = {});

  const moods = {
    dreamy: {
      gradient: 'radial-gradient(circle at 50% 32%, #3c2f74 0%, #1a1938 40%, #070b16 100%)',
      hint: '✨ 让故事像梦一样慢慢展开',
      panel: 'rgba(20,16,44,0.72)',
    },
    warm: {
      gradient: 'radial-gradient(circle at 48% 28%, #7a4e32 0%, #37231f 42%, #120c10 100%)',
      hint: '☀️ 画面更温暖，角色关系更亲近',
      panel: 'rgba(52,26,16,0.68)',
    },
    tense: {
      gradient: 'radial-gradient(circle at 55% 24%, #422133 0%, #20111f 38%, #07070d 100%)',
      hint: '⚡ 画面张力更强，距离更危险',
      panel: 'rgba(28,10,20,0.72)',
    },
    night: {
      gradient: 'radial-gradient(circle at 50% 24%, #17294e 0%, #0b1328 42%, #02040a 100%)',
      hint: '🌙 夜色更深，空间更辽阔',
      panel: 'rgba(8,16,34,0.72)',
    },
    whimsical: {
      gradient: 'radial-gradient(circle at 50% 30%, #5b4377 0%, #27204a 40%, #0a0f1d 100%)',
      hint: '🪄 更童趣一点，带一点魔法感',
      panel: 'rgba(24,18,52,0.72)',
    },
  };

  const config = moods[mood] || moods.dreamy;
  background.type = 'canvas';
  background.gradient = config.gradient;
  background.particles = false;
  subtitlePanel.bg_color = config.panel;
  hint.text_zh = hint.text_zh || '';
  hint.text_en = hint.text_en || '';
}

function applyComposition(sceneData, preset, options = {}) {
  const focus = findFocusEntity(sceneData, options.focusId);
  const intensity = clamp((options.cameraIntensity ?? 55) / 100, 0, 1);
  const whitespace = clamp((options.whitespace ?? 40) / 100, 0, 1);
  const subjectScale = clamp((options.subjectScale ?? 50) / 100, 0, 1);
  const entities = allEntities(sceneData);

  if (!entities.length) return sceneData;

  if (preset === 'left-focus') {
    if (focus) {
      focus.position.x = formatPercent(35 - whitespace * 6);
      focus.position.y = formatPercent(58 + intensity * 4);
      adjustEntityScale(focus, 1.05 + subjectScale * 0.35);
    }
    entities.filter((entity) => entity !== focus).forEach((entity, index) => {
      entity.position.x = formatPercent(66 + index * 8);
      entity.position.y = formatPercent(46 + index * 8);
      adjustEntityScale(entity, 0.92 - whitespace * 0.15);
    });
  }

  if (preset === 'centered-hero') {
    if (focus) {
      focus.position.x = '50.00%';
      focus.position.y = formatPercent(54 + intensity * 5);
      adjustEntityScale(focus, 1.1 + subjectScale * 0.45);
    }
    entities.filter((entity) => entity !== focus).forEach((entity, index) => {
      entity.position.x = formatPercent(26 + index * 48);
      entity.position.y = formatPercent(60 + (index % 2) * 8);
      adjustEntityScale(entity, 0.88);
    });
  }

  if (preset === 'cinematic-wide') {
    if (focus) {
      focus.position.x = formatPercent(28 + intensity * 8);
      focus.position.y = formatPercent(62 + whitespace * 4);
      adjustEntityScale(focus, 0.9 + subjectScale * 0.2);
    }
    spreadEntities(sceneData, 22 + whitespace * 12);
    entities.filter((entity) => entity !== focus).forEach((entity) => adjustEntityScale(entity, 0.78 + intensity * 0.12));
  }

  if (preset === 'diagonal-tension') {
    entities.forEach((entity, index) => {
      entity.position.x = formatPercent(22 + index * (58 / Math.max(1, entities.length - 1)));
      entity.position.y = formatPercent(28 + index * (36 / Math.max(1, entities.length - 1)));
    });
    if (focus) adjustEntityScale(focus, 1 + subjectScale * 0.25);
  }

  if (preset === 'close-up') {
    if (focus) {
      focus.position.x = formatPercent(48);
      focus.position.y = formatPercent(58);
      adjustEntityScale(focus, 1.3 + subjectScale * 0.55);
    }
    entities.filter((entity) => entity !== focus).forEach((entity, index) => {
      entity.position.x = formatPercent(15 + index * 70);
      entity.position.y = formatPercent(74);
      adjustEntityScale(entity, 0.68);
    });
  }

  return sceneData;
}

function inferFocusId(sceneData, prompt) {
  if (!prompt) return undefined;
  const lower = prompt.toLowerCase();
  const entities = allEntities(sceneData);
  const found = entities.find((entity) => {
    const tokens = [entity.id, entity.label].filter(Boolean).map((value) => String(value).toLowerCase());
    return tokens.some((token) => lower.includes(token));
  });
  return found?.id;
}

function inferPromptIntent(prompt = '') {
  const lower = prompt.toLowerCase();
  return {
    composition:
      /left|左/.test(lower) ? 'left-focus' :
      /center|居中|中央|中间|主角居中/.test(lower) ? 'centered-hero' :
      /wide|远景|更远|空镜|大全景/.test(lower) ? 'cinematic-wide' :
      /diagonal|张力|对角/.test(lower) ? 'diagonal-tension' :
      /close|特写|近景|更近/.test(lower) ? 'close-up' :
      null,
    mood:
      /dream|梦幻|空灵|柔和/.test(lower) ? 'dreamy' :
      /warm|温暖|金色|夕阳/.test(lower) ? 'warm' :
      /tense|紧张|危险|压迫/.test(lower) ? 'tense' :
      /night|夜|深蓝|星空|dark/.test(lower) ? 'night' :
      /whim|童趣|可爱|魔法|playful/.test(lower) ? 'whimsical' :
      null,
    whitespaceDelta:
      /空|留白|sparse|minimal/.test(lower) ? 15 :
      /满|拥挤|dense|crowded/.test(lower) ? -12 : 0,
    scaleDelta:
      /大一点|更大|放大|closer|bigger|hero/.test(lower) ? 0.18 :
      /小一点|更小|远一点|smaller|farther/.test(lower) ? -0.14 : 0,
    moveRight: /右|right/.test(lower),
    moveLeft: /左|left/.test(lower),
    moveUp: /上|higher|up/.test(lower),
    moveDown: /下|lower|down/.test(lower),
  };
}

export function applyPreset(sceneData, preset) {
  const nextScene = clone(sceneData);
  const composition = preset.type === 'composition' ? preset.value : preset.composition;
  const mood = preset.type === 'mood' ? preset.value : preset.mood;

  if (mood) setMood(nextScene, mood);
  if (composition && composition !== 'auto') applyComposition(nextScene, composition, preset);
  return nextScene;
}

export function applyDirectorPrompt(sceneData, prompt, options = {}) {
  const nextScene = clone(sceneData);
  const intent = inferPromptIntent(prompt);
  const focusId = inferFocusId(nextScene, prompt) || options.focusId;

  if (intent.mood || options.mood) {
    setMood(nextScene, intent.mood || options.mood);
  }

  applyComposition(nextScene, intent.composition || options.composition || 'centered-hero', {
    ...options,
    focusId,
    whitespace: clamp((options.whitespace ?? 40) + intent.whitespaceDelta, 0, 100),
    subjectScale: clamp((options.subjectScale ?? 50) + intent.scaleDelta * 100, 0, 100),
  });

  const focus = findFocusEntity(nextScene, focusId);
  if (focus) {
    if (intent.moveRight) offsetEntity(focus, 8, 0);
    if (intent.moveLeft) offsetEntity(focus, -8, 0);
    if (intent.moveUp) offsetEntity(focus, 0, -6);
    if (intent.moveDown) offsetEntity(focus, 0, 6);
    if (intent.scaleDelta) adjustEntityScale(focus, 1 + intent.scaleDelta);
  }


  return nextScene;
}

export function createSceneVariants(sceneData, options = {}) {
  const baseMood = options.mood || 'dreamy';
  const variants = [
    {
      key: 'left-focus',
      name: '变体 A · 左侧叙事',
      summary: '主体偏左，右侧留白更明显，适合旁白推进。',
      sceneData: applyPreset(sceneData, { ...options, composition: 'left-focus', mood: baseMood }),
    },
    {
      key: 'centered-hero',
      name: '变体 B · 主角中心',
      summary: '主体居中更强，强调角色关系与情感正面输出。',
      sceneData: applyPreset(sceneData, { ...options, composition: 'centered-hero', mood: baseMood }),
    },
    {
      key: 'cinematic-wide',
      name: '变体 C · 电影远景',
      summary: '拉开距离，空间感更大，更接近镜头语言。',
      sceneData: applyPreset(sceneData, { ...options, composition: 'cinematic-wide', mood: baseMood === 'dreamy' ? 'night' : baseMood }),
    },
  ];

  return variants;
}
