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

function getEntities(sceneData) {
  return [
    ...(sceneData?.scene?.characters || []),
    ...(sceneData?.scene?.items || []),
  ];
}

function getDirector(sceneData) {
  return sceneData?.editor?.director || {};
}

function expectedCenterX(composition) {
  switch (composition) {
    case 'rule_left': return 36;
    case 'rule_right': return 64;
    case 'centered': return 50;
    case 'wide': return 50;
    case 'dialogue': return 50;
    default: return 50;
  }
}

function weightedCentroid(entities) {
  if (!entities.length) return { x: 50, y: 55, totalWeight: 0 };
  let totalWeight = 0;
  let sumX = 0;
  let sumY = 0;
  entities.forEach((entity) => {
    const width = parsePixels(entity.width, entity.draggable ? 72 : 120);
    const height = parsePixels(entity.height, entity.draggable ? 72 : 120);
    const weight = Math.max(1, width * height);
    totalWeight += weight;
    sumX += parsePercent(entity.position?.x, 50) * weight;
    sumY += parsePercent(entity.position?.y, 55) * weight;
  });
  return {
    x: sumX / totalWeight,
    y: sumY / totalWeight,
    totalWeight,
  };
}

function getLeadEntity(entities) {
  if (!entities.length) return null;
  return entities.slice().sort((a, b) => {
    const areaA = parsePixels(a.width, 100) * parsePixels(a.height, 100);
    const areaB = parsePixels(b.width, 100) * parsePixels(b.height, 100);
    return areaB - areaA;
  })[0];
}

function computeOccupancy(entities) {
  const stageArea = 1000 * 1000;
  const occupied = entities.reduce((sum, entity) => {
    return sum + parsePixels(entity.width, entity.draggable ? 72 : 120) * parsePixels(entity.height, entity.draggable ? 72 : 120);
  }, 0);
  return occupied / stageArea;
}

function scoreAgainstIdeal(actual, ideal, tolerance) {
  const distance = Math.abs(actual - ideal);
  return clamp(100 - distance / tolerance * 100, 0, 100);
}

function analyzeWhitespace(occupancy, negativeSpace = 48) {
  const ideal = 0.12 + (negativeSpace / 100) * 0.18;
  return scoreAgainstIdeal(occupancy, ideal, 0.14);
}

function analyzeBalance(centroidX, composition) {
  return scoreAgainstIdeal(centroidX, expectedCenterX(composition), composition === 'wide' ? 18 : 14);
}

function analyzeFocalClarity(entities, lead) {
  if (!lead || !entities.length) return 0;
  const leadArea = parsePixels(lead.width, 100) * parsePixels(lead.height, 100);
  const totalArea = entities.reduce((sum, entity) => sum + parsePixels(entity.width, 100) * parsePixels(entity.height, 100), 0);
  const ratio = totalArea ? leadArea / totalArea : 0;
  const ratioScore = scoreAgainstIdeal(ratio, 0.42, 0.22);

  const leadX = parsePercent(lead.position?.x, 50);
  const leadY = parsePercent(lead.position?.y, 55);
  const nearestDistance = entities
    .filter((entity) => entity.id !== lead.id)
    .reduce((min, entity) => {
      const dx = leadX - parsePercent(entity.position?.x, 50);
      const dy = leadY - parsePercent(entity.position?.y, 55);
      return Math.min(min, Math.hypot(dx, dy));
    }, 100);
  const separationScore = scoreAgainstIdeal(nearestDistance, 24, 18);
  return Math.round(ratioScore * 0.6 + separationScore * 0.4);
}

function analyzeDepth(entities) {
  if (entities.length <= 1) return 55;
  const sizes = entities.map((entity) => parsePixels(entity.width, 100));
  const ys = entities.map((entity) => parsePercent(entity.position?.y, 55));
  const sizeSpread = Math.max(...sizes) - Math.min(...sizes);
  const ySpread = Math.max(...ys) - Math.min(...ys);
  const sizeScore = scoreAgainstIdeal(sizeSpread, 68, 48);
  const yScore = scoreAgainstIdeal(ySpread, 22, 18);
  return Math.round(sizeScore * 0.55 + yScore * 0.45);
}

function analyzeReadability(sceneData, entities) {
  const hasDialogue = Boolean(sceneData?.dialogues?.intro?.text_en || sceneData?.dialogues?.intro?.text_zh);
  const hasHint = Boolean(sceneData?.ui?.hint?.text_zh || sceneData?.ui?.hint?.text_en);
  const readingZoneBottom = hasDialogue ? 42 : 24;

  const intrusion = entities.reduce((sum, entity) => {
    const centerY = parsePercent(entity.position?.y, 55);
    const heightPercent = parsePixels(entity.height, entity.draggable ? 72 : 120) / 10;
    const widthPercent = parsePixels(entity.width, entity.draggable ? 72 : 120) / 10;
    const topEdge = centerY - heightPercent / 2;
    const overlap = Math.max(0, readingZoneBottom - topEdge);
    if (!overlap) return sum;
    const sizeFactor = clamp((widthPercent * heightPercent) / 180, 0.35, 2.1);
    return sum + (overlap / readingZoneBottom) * sizeFactor;
  }, 0);

  const topIntrusionCount = entities.filter((entity) => {
    const centerY = parsePercent(entity.position?.y, 55);
    const heightPercent = parsePixels(entity.height, entity.draggable ? 72 : 120) / 10;
    return centerY - heightPercent / 2 < readingZoneBottom;
  }).length;

  let score = 26;
  if (hasDialogue) score += 24;
  if (hasHint) score += 10;
  score += Math.max(0, 40 - intrusion * 20);
  score += Math.max(0, 12 - topIntrusionCount * 5);
  return clamp(Math.round(score), 0, 100);
}

function analyzeContainment(sceneData, entities) {
  const hasDialogue = Boolean(sceneData?.dialogues?.intro?.text_en || sceneData?.dialogues?.intro?.text_zh);
  const safeTop = hasDialogue ? 40 : 10;
  const safeBottom = 92;
  const safeLeft = 8;
  const safeRight = 92;

  const overflow = entities.reduce((sum, entity) => {
    const centerX = parsePercent(entity.position?.x, 50);
    const centerY = parsePercent(entity.position?.y, 55);
    const widthPercent = parsePixels(entity.width, entity.draggable ? 72 : 120) / 10;
    const heightPercent = parsePixels(entity.height, entity.draggable ? 72 : 120) / 10;
    const left = centerX - widthPercent / 2;
    const right = centerX + widthPercent / 2;
    const top = centerY - heightPercent / 2;
    const bottom = centerY + heightPercent / 2;
    return sum
      + Math.max(0, safeLeft - left)
      + Math.max(0, right - safeRight)
      + Math.max(0, safeTop - top)
      + Math.max(0, bottom - safeBottom);
  }, 0);

  return clamp(Math.round(100 - overflow * 4.5), 0, 100);
}

function buildSuggestions({ entities, lead, occupancy, centroid, whitespaceScore, balanceScore, focalScore, depthScore, readabilityScore, director }) {
  const suggestions = [];

  if (!entities.length) {
    suggestions.push({ level: 'high', title: '缺少主体', detail: '先放入至少一个角色或物品，否则导演规则无法建立视觉重心。' });
    return suggestions;
  }

  if (occupancy < 0.08) {
    suggestions.push({ level: 'medium', title: '画面偏空', detail: '可以增加陪体、前景元素，或提高主体尺寸，让叙事更稳。' });
  } else if (occupancy > 0.34) {
    suggestions.push({ level: 'medium', title: '画面偏满', detail: '建议拉开距离或提高留白，避免主体和配角互相抢戏。' });
  }

  if (balanceScore < 58) {
    suggestions.push({ level: 'high', title: '构图偏离目标', detail: `当前视觉重心在 ${centroid.x.toFixed(1)}%，和 ${director.composition || '当前'} 构图预期不一致。` });
  }

  if (focalScore < 55 && lead) {
    suggestions.push({ level: 'high', title: '主体不够明确', detail: `建议放大 ${lead.label || lead.id} 或与其它元素拉开距离。` });
  }

  if (depthScore < 52) {
    suggestions.push({ level: 'medium', title: '层次感不足', detail: '目前实体尺寸和纵深差异偏小，可以做前后景区分。' });
  }

  if (readabilityScore < 58) {
    suggestions.push({ level: 'medium', title: '阅读区受干扰', detail: '顶部区域元素略多，建议把主体压到中下部，给字幕更多呼吸空间。' });
  }

  if (whitespaceScore > 82 && focalScore > 72 && depthScore > 60) {
    suggestions.push({ level: 'low', title: '画面已经比较稳', detail: '可以尝试生成变体，用评分找到更电影化的一版。' });
  }

  return suggestions.slice(0, 4);
}

export function analyzeScene(sceneData) {
  const entities = getEntities(sceneData);
  const director = getDirector(sceneData);
  const centroid = weightedCentroid(entities);
  const occupancy = computeOccupancy(entities);
  const lead = getLeadEntity(entities);

  const whitespaceScore = Math.round(analyzeWhitespace(occupancy, director.negative_space ?? 48));
  const balanceScore = Math.round(analyzeBalance(centroid.x, director.composition));
  const focalScore = Math.round(analyzeFocalClarity(entities, lead));
  const depthScore = Math.round(analyzeDepth(entities));
  const readabilityScore = Math.round(analyzeReadability(sceneData, entities));
  const containmentScore = Math.round(analyzeContainment(sceneData, entities));

  const overallScore = Math.round(
    whitespaceScore * 0.18 +
    balanceScore * 0.18 +
    focalScore * 0.2 +
    depthScore * 0.14 +
    readabilityScore * 0.18 +
    containmentScore * 0.12
  );

  const suggestions = buildSuggestions({
    entities,
    lead,
    occupancy,
    centroid,
    whitespaceScore,
    balanceScore,
    focalScore,
    depthScore,
    readabilityScore,
    director,
  });

  return {
    overallScore,
    leadId: lead?.id || null,
    leadLabel: lead?.label || lead?.id || '未识别',
    metrics: {
      entityCount: entities.length,
      occupancy: Math.round(occupancy * 100),
      balance: balanceScore,
      focal: focalScore,
      depth: depthScore,
      readability: readabilityScore,
      containment: containmentScore,
      whitespace: whitespaceScore,
      centroidX: Number(centroid.x.toFixed(1)),
    },
    suggestions,
  };
}

export function rankVariants(variantEntries) {
  return variantEntries
    .map((entry) => ({
      ...entry,
      analysis: analyzeScene(entry.sceneData),
    }))
    .sort((left, right) => right.analysis.overallScore - left.analysis.overallScore)
    .map((entry, index) => ({
      ...entry,
      rank: index + 1,
    }));
}
