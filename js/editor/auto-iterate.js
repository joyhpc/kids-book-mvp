import { analyzeScene } from './scene-analysis.js';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function parsePercent(value, fallback = 50) {
  const match = String(value ?? '').match(/-?\d+(?:\.\d+)?/);
  return match ? parseFloat(match[0]) : fallback;
}

function parsePixels(value, fallback = 100) {
  const match = String(value ?? '').match(/-?\d+(?:\.\d+)?/);
  return match ? parseFloat(match[0]) : fallback;
}

function formatPercent(value) {
  return `${clamp(value, 0, 100).toFixed(2).replace(/\.00$/, '')}%`;
}

function formatPixels(value) {
  return `${Math.round(Math.max(24, value))}px`;
}

function getEntities(sceneData) {
  return [
    ...(sceneData?.scene?.characters || []),
    ...(sceneData?.scene?.items || []),
  ];
}

function ensureDirector(sceneData) {
  sceneData.editor ??= {};
  sceneData.editor.director ??= {
    composition: 'wide',
    mood: 'dreamy',
    camera_strength: 42,
    negative_space: 64,
    subject_scale: 46,
  };
  return sceneData.editor.director;
}

function getLeadEntity(sceneData) {
  const entities = getEntities(sceneData);
  if (!entities.length) return null;
  return entities.slice().sort((a, b) => {
    const areaA = parsePixels(a.width, 100) * parsePixels(a.height, 100);
    const areaB = parsePixels(b.width, 100) * parsePixels(b.height, 100);
    return areaB - areaA;
  })[0];
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
  const entities = getEntities(sceneData);
  const lead = getLeadEntity(sceneData);
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
  const lead = getLeadEntity(sceneData);
  if (!lead) return;
  const entities = getEntities(sceneData);
  const leadFactor = 0.85 + subjectScale / 100;
  const cameraFactor = 0.85 + cameraStrength / 180;

  entities.forEach((entity) => {
    const width = parsePixels(entity.width, entity.draggable ? 72 : 120);
    const height = parsePixels(entity.height, entity.draggable ? 72 : 120);
    const factor = entity.id === lead.id ? leadFactor * cameraFactor : 0.9 + subjectScale / 260;
    entity.width = formatPixels(width * factor);
    entity.height = formatPixels(height * factor);
  });
}

function applyMood(sceneData, mood) {
  sceneData.scene ??= {};
  sceneData.scene.background ??= {};
  sceneData.scene.background.type = 'canvas';
  sceneData.scene.background.gradient = getMoodGradient(mood);
  sceneData.scene.background.particles = false;
}

function applyNegativeSpace(sceneData, negativeSpace = 48) {
  const entities = getEntities(sceneData);
  const lead = getLeadEntity(sceneData);
  if (!lead) return;
  const factor = negativeSpace / 100;
  entities.filter((entity) => entity.id !== lead.id).forEach((entity) => {
    const x = parsePercent(entity.position?.x, 50);
    const y = parsePercent(entity.position?.y, 55);
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
  const entities = getEntities(sceneData);

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

function applyRecipe(sceneData, recipe) {
  const nextScene = clone(sceneData);
  const director = ensureDirector(nextScene);

  if (recipe.composition) director.composition = recipe.composition;
  if (recipe.mood) director.mood = recipe.mood;
  if (typeof recipe.camera_strength === 'number') director.camera_strength = clamp(recipe.camera_strength, 0, 100);
  if (typeof recipe.negative_space === 'number') director.negative_space = clamp(recipe.negative_space, 0, 100);
  if (typeof recipe.subject_scale === 'number') director.subject_scale = clamp(recipe.subject_scale, 0, 100);

  applyMood(nextScene, director.mood);
  applyComposition(nextScene, director.composition, director.camera_strength, director.negative_space);
  applyNegativeSpace(nextScene, director.negative_space);
  applyScale(nextScene, director.subject_scale, director.camera_strength);
  applyReadingSafeZone(nextScene);

  return nextScene;
}

function uniqueRecipes(recipes) {
  const seen = new Set();
  return recipes.filter((recipe) => {
    const key = JSON.stringify(recipe);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function scoreScene(sceneData, analysis, options = {}) {
  const weights = options.weights || {};
  return Math.round(
    analysis.metrics.balance * (weights.balance ?? 0.22) +
    analysis.metrics.focal * (weights.focal ?? 0.28) +
    analysis.metrics.depth * (weights.depth ?? 0.18) +
    analysis.metrics.whitespace * (weights.whitespace ?? 0.16) +
    analysis.metrics.readability * (weights.readability ?? 0.16)
  );
}

export function summarizeRecipe(recipe = {}) {
  const parts = [];
  if (recipe.composition) parts.push(`构图→${recipe.composition}`);
  if (recipe.mood) parts.push(`情绪→${recipe.mood}`);
  if (typeof recipe.camera_strength === 'number') parts.push(`镜头 ${recipe.camera_strength}`);
  if (typeof recipe.negative_space === 'number') parts.push(`留白 ${recipe.negative_space}`);
  if (typeof recipe.subject_scale === 'number') parts.push(`主体 ${recipe.subject_scale}`);
  return parts.join(' / ') || '保持当前设置';
}

export function proposeIterationRecipes(sceneData, analyses = {}) {
  const analysis = analyses.analysis || analyzeScene(sceneData);
  const visual = analyses.visualAnalysis || null;
  const director = clone(ensureDirector(clone(sceneData)));
  const centroidX = analysis.metrics.centroidX;
  const hasDialogue = Boolean(sceneData?.dialogues?.intro?.text_en || sceneData?.dialogues?.intro?.text_zh);
  const maxSubjectScale = hasDialogue ? 62 : 80;
  const maxCameraStrength = hasDialogue ? 68 : 86;
  const recipes = [];

  recipes.push(hasDialogue ? {
    composition: centroidX < 50 ? 'rule_left' : 'rule_right',
    subject_scale: clamp(director.subject_scale + 8, 0, maxSubjectScale),
    camera_strength: clamp(director.camera_strength + 4, 0, maxCameraStrength),
    negative_space: clamp(director.negative_space + 10, 0, 100),
  } : {
    composition: 'centered',
    subject_scale: clamp(director.subject_scale + 12, 0, maxSubjectScale),
    camera_strength: clamp(director.camera_strength + 8, 0, maxCameraStrength),
  });

  recipes.push({
    negative_space: clamp(director.negative_space + 10, 0, 100),
    camera_strength: clamp(director.camera_strength - 4, 0, maxCameraStrength),
  });

  recipes.push({
    composition: 'wide',
    negative_space: clamp(director.negative_space + 12, 0, 100),
    subject_scale: clamp(director.subject_scale - 6, 0, maxSubjectScale),
  });

  if (analysis.metrics.balance < 60) {
    recipes.push({ composition: centroidX < 50 ? 'rule_left' : 'rule_right' });
    recipes.push({ composition: 'centered', negative_space: clamp(director.negative_space + 8, 0, 100) });
  }

  if (analysis.metrics.focal < 58) {
    recipes.push(hasDialogue ? {
      composition: centroidX < 50 ? 'rule_left' : 'rule_right',
      subject_scale: clamp(director.subject_scale + 10, 0, maxSubjectScale),
      camera_strength: clamp(director.camera_strength + 6, 0, maxCameraStrength),
      negative_space: clamp(director.negative_space + 10, 0, 100),
    } : {
      composition: 'centered',
      subject_scale: clamp(director.subject_scale + 16, 0, maxSubjectScale),
      camera_strength: clamp(director.camera_strength + 12, 0, maxCameraStrength),
    });
  }

  if (analysis.metrics.depth < 55) {
    recipes.push({ composition: director.composition === 'wide' ? 'dialogue' : 'wide' });
  }

  if (analysis.metrics.readability < 58) {
    recipes.push({
      negative_space: clamp(director.negative_space + 14, 0, 100),
      camera_strength: clamp(director.camera_strength - 8, 0, maxCameraStrength),
    });
  }

  if (analysis.metrics.whitespace < 56) {
    recipes.push({ negative_space: clamp(director.negative_space + 14, 0, 100) });
  }

  if (analysis.overallScore < 60) {
    recipes.push({ mood: 'dreamy' });
    recipes.push({ mood: 'magical' });
  } else {
    recipes.push({ mood: director.mood === 'dreamy' ? 'warm' : 'dreamy' });
  }

  if (visual && visual.contrast < 38) {
    recipes.push({ mood: director.mood === 'warm' ? 'magical' : 'tense' });
  }

  if (visual && visual.topWeight > 30) {
    recipes.push({ composition: 'centered', negative_space: clamp(director.negative_space + 12, 0, 100) });
  }

  return uniqueRecipes(recipes).map((recipe) => ({
    ...recipe,
    summary: summarizeRecipe(recipe),
  }));
}

export function runAutoIteration(seedScene, options = {}) {
  const iterations = clamp(options.iterations ?? options.rounds ?? 5, 1, 12);
  const branchFactor = clamp(options.branchFactor ?? 4, 1, 8);
  const seedAnalysis = options.analysis || analyzeScene(seedScene);
  const seedScore = scoreScene(seedScene, seedAnalysis, options);

  let currentBest = {
    round: 0,
    sceneData: clone(seedScene),
    analysis: seedAnalysis,
    score: seedScore,
    recipe: {},
    summary: '起始版本',
  };

  const rounds = [];

  for (let round = 1; round <= iterations; round += 1) {
    const proposals = proposeIterationRecipes(currentBest.sceneData, {
      analysis: currentBest.analysis,
      visualAnalysis: options.visualAnalysis || null,
      round,
    }).slice(0, branchFactor);

    const candidates = proposals.map((proposal, index) => {
      const sceneData = applyRecipe(currentBest.sceneData, proposal);
      const analysis = analyzeScene(sceneData);
      const score = scoreScene(sceneData, analysis, options);
      return {
        id: `r${round}-c${index + 1}`,
        round,
        sceneData,
        analysis,
        score,
        delta: score - currentBest.score,
        recipe: proposal,
        summary: proposal.summary || summarizeRecipe(proposal),
      };
    }).sort((left, right) => right.score - left.score);

    const bestCandidate = candidates[0] || null;
    const adopted = Boolean(bestCandidate && bestCandidate.score >= currentBest.score);

    if (adopted) {
      currentBest = {
        round,
        sceneData: clone(bestCandidate.sceneData),
        analysis: bestCandidate.analysis,
        score: bestCandidate.score,
        recipe: bestCandidate.recipe,
        summary: bestCandidate.summary,
      };
    }

    rounds.push({
      round,
      baselineScore: round === 1 ? seedScore : rounds[rounds.length - 1].bestScore,
      candidates: candidates.map((candidate) => ({
        id: candidate.id,
        score: candidate.score,
        delta: candidate.delta,
        summary: candidate.summary,
        recipe: candidate.recipe,
        analysis: candidate.analysis,
      })),
      adopted,
      adoptedCandidateId: adopted ? bestCandidate.id : null,
      bestScore: currentBest.score,
      bestSummary: currentBest.summary,
    });
  }

  return {
    seed: {
      sceneData: clone(seedScene),
      analysis: seedAnalysis,
      score: seedScore,
    },
    rounds,
    bestResult: currentBest,
  };
}
