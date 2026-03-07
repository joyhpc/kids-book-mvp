function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function parsePercent(value, fallback = 50) {
  const match = String(value ?? '').match(/-?\d+(?:\.\d+)?/);
  return match ? parseFloat(match[0]) : fallback;
}

function parsePixels(value, fallback = 120) {
  const match = String(value ?? '').match(/-?\d+(?:\.\d+)?/);
  return match ? parseFloat(match[0]) : fallback;
}

function absoluteUrl(url, baseUrl) {
  try {
    return new URL(url, baseUrl).href;
  } catch {
    return url;
  }
}

const dataUrlCache = new Map();

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function fetchAsDataUrl(url) {
  if (!url) return '';
  if (url.startsWith('data:')) return url;
  if (dataUrlCache.has(url)) return dataUrlCache.get(url);

  const promise = fetch(url)
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.blob();
    })
    .then(blobToDataUrl)
    .catch(() => url);

  dataUrlCache.set(url, promise);
  return promise;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function loadSceneImage(src, baseUrl) {
  const resolved = absoluteUrl(src, baseUrl);
  const safeSrc = await fetchAsDataUrl(resolved);
  return loadImage(safeSrc);
}

function coverRect(img, width, height) {
  const scale = Math.max(width / img.width, height / img.height);
  const drawWidth = img.width * scale;
  const drawHeight = img.height * scale;
  return {
    x: (width - drawWidth) / 2,
    y: (height - drawHeight) / 2,
    width: drawWidth,
    height: drawHeight,
  };
}

function parseGradientColors(gradient) {
  return String(gradient || '').match(/rgba?\([^)]*\)|#[0-9a-fA-F]{3,8}/g) || [];
}

function drawFallbackGradient(ctx, width, height, gradientString = '') {
  const colors = parseGradientColors(gradientString);
  if (/radial-gradient/i.test(gradientString)) {
    const centerMatch = gradientString.match(/at\s+(\d+)%\s+(\d+)%/i);
    const centerX = centerMatch ? Number(centerMatch[1]) / 100 : 0.5;
    const centerY = centerMatch ? Number(centerMatch[2]) / 100 : 0.35;
    const radius = Math.max(width, height) * 0.92;
    const gradient = ctx.createRadialGradient(width * centerX, height * centerY, 0, width * centerX, height * centerY, radius);
    const stops = colors.length ? colors : ['#13213b', '#09111f', '#04070d'];
    stops.forEach((color, index) => gradient.addColorStop(index / Math.max(1, stops.length - 1), color));
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    return;
  }

  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  const stops = colors.length ? colors : ['#13213b', '#04070d'];
  stops.forEach((color, index) => gradient.addColorStop(index / Math.max(1, stops.length - 1), color));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

function hashString(input = '') {
  let hash = 0;
  const text = String(input);
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) - hash) + text.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

function createSeededRandom(seed) {
  let value = seed % 2147483647;
  if (value <= 0) value += 2147483646;
  return () => {
    value = value * 16807 % 2147483647;
    return (value - 1) / 2147483646;
  };
}

function drawParticles(ctx, width, height, seedKey) {
  const random = createSeededRandom(hashString(seedKey));
  for (let index = 0; index < 22; index += 1) {
    const x = random() * width;
    const y = random() * height;
    const radius = 1 + random() * 3;
    const alpha = 0.08 + random() * 0.18;
    ctx.fillStyle = `rgba(255,255,255,${alpha.toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawStageOverlay(ctx, width, height) {
  const vignette = ctx.createRadialGradient(width * 0.5, height * 0.3, 0, width * 0.5, height * 0.3, Math.max(width, height));
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, 'rgba(1,2,5,0.8)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);
}

function wrapText(ctx, text, maxWidth) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  if (!words.length) return [];

  const lines = [];
  let current = words[0];
  for (let index = 1; index < words.length; index += 1) {
    const candidate = `${current} ${words[index]}`;
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
    } else {
      lines.push(current);
      current = words[index];
    }
  }
  lines.push(current);
  return lines;
}

function wrapChineseText(ctx, text, maxWidth) {
  const chars = Array.from(String(text || ''));
  if (!chars.length) return [];

  const lines = [];
  let current = '';
  chars.forEach((char) => {
    const candidate = current + char;
    if (current && ctx.measureText(candidate).width > maxWidth) {
      lines.push(current);
      current = char;
    } else {
      current = candidate;
    }
  });
  if (current) lines.push(current);
  return lines;
}

function drawPanel(ctx, x, y, width, height, radius = 18, fill = 'rgba(5,8,15,0.72)', stroke = 'rgba(255,255,255,0.08)') {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.stroke();
  ctx.restore();
}

function drawDialogue(ctx, sceneData, width, height) {
  const intro = sceneData?.dialogues?.intro;
  const textEn = intro?.text_en || '';
  const textZh = intro?.text_zh || '';
  if (!textEn && !textZh) return;

  const panelHeight = Math.min(height * 0.28, 170);
  drawPanel(ctx, 24, 18, width - 48, panelHeight, 18, 'rgba(5,8,15,0.72)');

  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = '600 20px system-ui, sans-serif';
  const enLines = wrapText(ctx, textEn, width - 96).slice(0, 3);
  let cursorY = 54;
  enLines.forEach((line) => {
    ctx.fillText(line, width / 2, cursorY);
    cursorY += 28;
  });

  if (textZh) {
    cursorY += 10;
    ctx.fillStyle = 'rgba(220,210,255,0.92)';
    ctx.font = '400 18px system-ui, sans-serif';
    const zhLines = wrapChineseText(ctx, textZh, width - 120).slice(0, 2);
    zhLines.forEach((line) => {
      ctx.fillText(line, width / 2, cursorY);
      cursorY += 26;
    });
  }
}

function drawHint(ctx, sceneData, width, height) {
  if (!sceneData?.editor?.preview?.show_hint) return;
  const hint = sceneData?.ui?.hint?.text_zh || sceneData?.ui?.hint?.text_en;
  if (!hint) return;

  ctx.font = '600 16px system-ui, sans-serif';
  const paddingX = 18;
  const textWidth = ctx.measureText(hint).width;
  const boxWidth = Math.min(width - 48, textWidth + paddingX * 2);
  const boxHeight = 42;
  const x = (width - boxWidth) / 2;
  const y = height - boxHeight - 18;
  drawPanel(ctx, x, y, boxWidth, boxHeight, 999, 'rgba(5,8,15,0.7)', 'rgba(255,255,255,0.1)');
  ctx.fillStyle = '#f5f7ff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(hint, width / 2, y + boxHeight / 2 + 1);
}

async function drawEntityImage(ctx, entity, width, height, baseUrl) {
  const entityWidth = parsePixels(entity.width, entity.draggable ? 72 : 120);
  const entityHeight = parsePixels(entity.height, entity.draggable ? 72 : 120);
  const centerX = width * parsePercent(entity.position?.x, 50) / 100;
  const centerY = height * parsePercent(entity.position?.y, 55) / 100;
  const left = centerX - entityWidth / 2;
  const top = centerY - entityHeight / 2;

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 8;

  if (entity.img_src) {
    try {
      const image = await loadSceneImage(entity.img_src, baseUrl);
      ctx.drawImage(image, left, top, entityWidth, entityHeight);
      ctx.restore();
      return;
    } catch {}
  }

  const emoji = entity.emoji || '✨';
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.beginPath();
  ctx.arc(centerX, centerY, Math.max(entityWidth, entityHeight) * 0.42, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.28)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.font = `${Math.round(Math.min(entityWidth, entityHeight) * 0.55)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowBlur = 0;
  ctx.fillText(emoji, centerX, centerY + 2);
  ctx.restore();
}

async function drawEntities(ctx, sceneData, width, height, baseUrl) {
  const entities = [
    ...(sceneData?.scene?.characters || []),
    ...(sceneData?.scene?.items || []),
  ];

  for (const entity of entities) {
    await drawEntityImage(ctx, entity, width, height, baseUrl);
  }
}

async function drawBackground(ctx, sceneData, width, height, baseUrl) {
  const background = sceneData?.scene?.background || {};
  ctx.fillStyle = '#010205';
  ctx.fillRect(0, 0, width, height);

  if (background.type === 'image' && background.src) {
    try {
      const image = await loadSceneImage(background.src, baseUrl);
      const rect = coverRect(image, width, height);
      ctx.drawImage(image, rect.x, rect.y, rect.width, rect.height);
    } catch {
      drawFallbackGradient(ctx, width, height, background.gradient || 'radial-gradient(circle at 50% 40%, #13213b 0%, #04070d 100%)');
    }
  } else {
    drawFallbackGradient(ctx, width, height, background.gradient || 'radial-gradient(circle at 50% 40%, #13213b 0%, #04070d 100%)');
  }

  if (background.particles && sceneData?.editor?.preview?.show_particles) {
    drawParticles(ctx, width, height, `${sceneData?.scene?.id || 'scene'}:${background.src || background.gradient || ''}`);
  }

  drawStageOverlay(ctx, width, height);
}

export async function captureStageFromIframe(iframe, options = {}) {
  const sceneData = options.sceneData;
  if (!sceneData) {
    throw new Error('sceneData is required for capture');
  }

  const iframeDocument = iframe?.contentDocument;
  const iframeWindow = iframe?.contentWindow;
  const frameRect = iframe?.getBoundingClientRect?.() || { width: 0, height: 0 };
  const stageRect = iframeDocument?.getElementById('stage')?.getBoundingClientRect?.() || { width: 0, height: 0 };
  const width = Math.max(1, Math.round(frameRect.width || stageRect.width || 800));
  const height = Math.max(1, Math.round(frameRect.height || stageRect.height || 450));
  const baseUrl = iframeDocument?.location?.href || iframeWindow?.location?.href || window.location.href;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d context unavailable');

  await drawBackground(ctx, sceneData, width, height, baseUrl);
  await drawEntities(ctx, sceneData, width, height, baseUrl);
  drawDialogue(ctx, sceneData, width, height);
  drawHint(ctx, sceneData, width, height);

  return canvas.toDataURL('image/png');
}

function summarizeBias(value) {
  if (value > 0.08) return 'right';
  if (value < -0.08) return 'left';
  return 'balanced';
}

function summarizeWarmth(value) {
  if (value > 0.05) return 'warm';
  if (value < -0.05) return 'cool';
  return 'neutral';
}

export async function analyzeSnapshot(dataUrl, options = {}) {
  if (!dataUrl) {
    throw new Error('snapshot dataUrl is required');
  }

  const img = await loadImage(dataUrl);
  const sampleWidth = options.sampleWidth || 200;
  const scale = sampleWidth / img.width;
  const width = Math.max(1, Math.round(sampleWidth));
  const height = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('2d context unavailable');
  ctx.drawImage(img, 0, 0, width, height);

  const { data } = ctx.getImageData(0, 0, width, height);
  const topBoundary = Math.max(1, Math.floor(height * 0.25));
  let luminanceSum = 0;
  let luminanceSqSum = 0;
  let leftWeight = 0;
  let rightWeight = 0;
  let topBrightnessSum = 0;
  let topCount = 0;
  let redSum = 0;
  let blueSum = 0;
  let alphaWeightSum = 0;

  for (let index = 0; index < data.length; index += 4) {
    const pixelIndex = index / 4;
    const x = pixelIndex % width;
    const y = Math.floor(pixelIndex / width);
    const r = data[index];
    const g = data[index + 1];
    const b = data[index + 2];
    const alpha = data[index + 3] / 255;

    const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    const weight = Math.max(0.05, alpha);

    luminanceSum += luminance * weight;
    luminanceSqSum += luminance * luminance * weight;
    alphaWeightSum += weight;
    redSum += r * weight;
    blueSum += b * weight;

    if (x < width / 2) leftWeight += luminance * weight;
    else rightWeight += luminance * weight;

    if (y < topBoundary) {
      topBrightnessSum += luminance * weight;
      topCount += weight;
    }
  }

  const meanLuminance = alphaWeightSum ? luminanceSum / alphaWeightSum : 0;
  const variance = alphaWeightSum ? luminanceSqSum / alphaWeightSum - meanLuminance * meanLuminance : 0;
  const contrast = Math.sqrt(Math.max(0, variance));
  const topBrightness = topCount ? topBrightnessSum / topCount : 0;
  const leftRightBias = (rightWeight - leftWeight) / Math.max(1e-6, rightWeight + leftWeight);
  const warmth = (redSum - blueSum) / Math.max(1e-6, redSum + blueSum);

  return {
    width: img.width,
    height: img.height,
    brightness: Number(meanLuminance.toFixed(4)),
    contrast: Number(contrast.toFixed(4)),
    leftRightBias: Number(leftRightBias.toFixed(4)),
    leftRightBalance: summarizeBias(leftRightBias),
    topBrightnessRatio: Number((topBrightness / Math.max(meanLuminance || 1, 0.0001)).toFixed(4)),
    topBrightness: Number(topBrightness.toFixed(4)),
    warmth: Number(warmth.toFixed(4)),
    colorTemperature: summarizeWarmth(warmth),
  };
}
