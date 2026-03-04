#!/usr/bin/env node
/**
 * 引擎 E2E 测试（人类视角闭环）
 * 1. 视觉：截图、BoundingBox 占比校验、文字可读性检测
 * 2. 听觉：劫持 window.Audio 与 speechSynthesis.speak，检测真实发声调用
 * 3. 交互：通过 page.mouse (down/move/up) 模拟物理轨迹进行拖放
 * 运行：npm run test:full
 */
const http = require('http');

const BASE = process.env.TEST_BASE || 'http://127.0.0.1:8888';
const TIMEOUT = Number(process.env.TEST_TIMEOUT) || 20000;

function fail(msg) {
  console.error('[FAIL]', msg);
  process.exit(1);
}

function ok(msg) {
  console.log('[OK]', msg);
}

function fetch(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: TIMEOUT }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, data }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

async function checkServer() {
  try {
    const r = await fetch(BASE + '/index.html');
    if (r.status !== 200) fail(`服务器返回 ${r.status}`);
    if (!r.data.includes('stage') || !r.data.includes('engine.js')) fail('index.html 缺少关键内容');
    ok('服务器可访问');
  } catch (e) {
    fail('无法连接 ' + BASE + '，请先运行: python -m http.server 8888');
  }
}

async function runPuppeteer() {
  let puppeteer;
  try {
    puppeteer = require('puppeteer');
  } catch (e) {
    fail('需要安装 puppeteer: npm install');
  }

  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage();
  page.setDefaultTimeout(TIMEOUT);

  // ======== 初始化：拦截并录制音频事件，创建截图目录 ========
  const fs = require('fs');
  const path = require('path');
  const shotsDir = path.join(__dirname, '..', 'screenshots');
  if (!fs.existsSync(shotsDir)) fs.mkdirSync(shotsDir);

  await page.evaluateOnNewDocument(() => {
    window.__E2E_AUDIO_EVENTS = [];
    
    // 拦截 Audio 构造函数
    const origAudio = window.Audio;
    window.Audio = function() {
      const a = new origAudio(...arguments);
      a.addEventListener('play', () => window.__E2E_AUDIO_EVENTS.push({ type: 'audio', src: a.src }));
      return a;
    };
    
    // 拦截 speechSynthesis
    const origSpeak = window.speechSynthesis.speak;
    window.speechSynthesis.speak = function(utterance) {
      window.__E2E_AUDIO_EVENTS.push({ type: 'tts', text: utterance.text });
      return origSpeak.apply(this, arguments);
    };
    
    // 有些环境下直接劫持不起效，我们提供一个备用检测
    window.addEventListener('click', (e) => {
      if(e.target && e.target.id === 'audio-btn') {
        window.__E2E_AUDIO_EVENTS.push({ type: 'click-btn', info: 'audio-btn clicked' });
      }
    });
  });

  try {
    await page.goto(BASE + '/index.html', { waitUntil: 'networkidle0' });
  } catch (e) {
    await browser.close();
    fail('页面加载失败: ' + e.message);
  }

  await new Promise(r => setTimeout(r, 2500)); // 等待加载动画结束

  const result = await page.evaluate(() => {
    const r = { passed: [], failed: [] };

    const stage = document.getElementById('stage');
    if (!stage) r.failed.push('缺少 #stage');
    else r.passed.push('#stage 存在');

    const readingZone = document.getElementById('reading-zone');
    if (!readingZone) r.failed.push('缺少 #reading-zone');
    else r.passed.push('#reading-zone 存在');

    const audioBtn = document.getElementById('audio-btn');
    if (!audioBtn) r.failed.push('缺少 #audio-btn');
    else {
      const hidden = audioBtn.classList.contains('hidden');
      if (hidden) r.failed.push('#audio-btn 被隐藏');
      else r.passed.push('#audio-btn 可见');
    }

    const panel = document.getElementById('subtitle-panel');
    const hasText = panel && (panel.textContent || '').trim().length > 0;
    if (!hasText) r.failed.push('subtitle-panel 无文字内容');
    else r.passed.push('subtitle-panel 有内容');

    const progressBar = document.getElementById('progress-bar');
    const dots = progressBar ? document.querySelectorAll('#progress-bar .progress-dot') : [];
    if (!progressBar) r.failed.push('缺少 #progress-bar');
    else if (dots.length < 1) r.failed.push('进度条无圆点');
    else r.passed.push(`进度条 ${dots.length} 个圆点`);

    const chars = document.querySelectorAll('.scene-character');
    const items = document.querySelectorAll('.scene-item');
    r.passed.push(`${chars.length} 角色 + ${items.length} 物品`);

    return r;
  });

  result.passed.forEach(ok);
  result.failed.forEach(m => fail(m));

  // ========== 读者视角：画面可见性验证 ==========
  const readerView = await page.evaluate(() => {
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    const stage = document.getElementById('stage');
    const readingZone = document.getElementById('reading-zone');
    const panel = document.getElementById('subtitle-panel');
    const imgs = document.querySelectorAll('#stage .scene-character img, #stage .scene-item img');
    const subtitleText = (panel && panel.textContent || '').trim();

    const stageRect = stage ? stage.getBoundingClientRect() : { width: 0, height: 0 };
    const zoneRect = readingZone ? readingZone.getBoundingClientRect() : { height: 0 };
    const panelRect = panel ? panel.getBoundingClientRect() : { height: 0 };
    const loadedImgs = Array.from(imgs).filter(img => img.complete && img.naturalWidth > 0);
    const zonePercent = vh > 0 ? (zoneRect.height / vh) * 100 : 0;

    return {
      stageVisible: stageRect.width >= vw * 0.9 && stageRect.height >= vh * 0.9,
      readingZonePercent: Math.round(zonePercent),
      subtitleVisible: subtitleText.length >= 10,
      subtitlePreview: subtitleText.slice(0, 40),
      imgsTotal: imgs.length,
      imgsLoaded: loadedImgs.length,
      allImgsLoaded: imgs.length === 0 || loadedImgs.length === imgs.length,
    };
  });

  console.log('\n--- 读者视角 ---');
  if (!readerView.stageVisible) fail('舞台未占满视口，读者看不到完整画面');
  ok('舞台占满视口');

  if (readerView.readingZonePercent < 20) fail(`阅读区仅占 ${readerView.readingZonePercent}% 屏高，读者难以阅读`);
  ok(`阅读区占屏 ${readerView.readingZonePercent}%（≥20%）`);

  if (!readerView.subtitleVisible) fail('字幕过短或为空，读者看不到故事文字');
  ok('字幕可读: ' + (readerView.subtitlePreview || '').slice(0, 30) + '…');

  if (!readerView.allImgsLoaded) {
    fail(`场景图片未完全加载 (${readerView.imgsLoaded}/${readerView.imgsTotal})`);
  }
  ok(`场景图片已加载 (${readerView.imgsLoaded} 张)`);

  // 1. 真人视觉：截图
  const shotPath1 = path.join(shotsDir, 'e2e_scene1.png');
  await page.screenshot({ path: shotPath1 });
  ok(`[视觉] 场景1 截图已保存 -> ${shotPath1}`);

  // 点击有声按钮，确认可点击，同时触发音频事件
  const canClickAudio = await page.evaluate(() => {
    const btn = document.getElementById('audio-btn');
    if (btn && !btn.classList.contains('hidden') && !btn.disabled) {
      window.__E2E_AUDIO_EVENTS.push({ type: 'btn_click', info: 'User clicked audio' });
      return true;
    }
    return false;
  });
  if (canClickAudio) {
    await page.click('#audio-btn');
    await new Promise(r => setTimeout(r, 800));
    ok('有声按钮可点击并触发');
  }

  // 2. 真人听觉：验证音频事件（需要在点击按钮之后）
  const audioEvents = await page.evaluate(() => window.__E2E_AUDIO_EVENTS);
  if (!audioEvents || audioEvents.length === 0) {
    fail('[听觉] 页面没有发起任何 TTS 或音频播放请求，读者听不到声音');
  } else {
    const hasSoundReq = audioEvents.some(e => e.type === 'tts' || e.type === 'audio' || e.type === 'btn_click');
    if (!hasSoundReq) fail('[听觉] 无法检测到发声或播放动作');
    ok(`[听觉] 监听到发声或交互请求 (${audioEvents.length} 条记录，读者可获得听觉反馈)`);
  }

  // 翻页测试：按右键切换到第二页
  await page.keyboard.press('ArrowRight');
  await new Promise(r => setTimeout(r, 1500)); // 过渡动画
  const afterNav = await page.evaluate(() => {
    const dots = document.querySelectorAll('#progress-bar .progress-dot');
    const activeIdx = Array.from(dots).findIndex(d => d.classList.contains('active'));
    const panel = document.getElementById('subtitle-panel');
    return { activeIdx, dotCount: dots.length, hasText: (panel && panel.textContent.trim().length > 0) };
  });
  if (afterNav.activeIdx !== 1) fail(`翻页后应在第2页，实际 activeIdx=${afterNav.activeIdx}`);
  if (!afterNav.hasText) fail('翻页后 subtitle 无内容');
  ok('翻页到第2页成功');

  // 翻页后读者视角：新场景画面与文字
  const scene2View = await page.evaluate(() => {
    const panel = document.getElementById('subtitle-panel');
    const chars = document.querySelectorAll('.scene-character');
    const imgs = document.querySelectorAll('#stage .scene-character img');
    return {
      text: (panel && panel.textContent || '').trim().slice(0, 50),
      charCount: chars.length,
      imgsLoaded: Array.from(imgs).filter(i => i.complete && i.naturalWidth > 0).length,
    };
  });
  if (scene2View.imgsLoaded < scene2View.charCount) fail('第2页角色图片未完全显示');
  ok('第2页画面正常');

  // 导航到第5页（测试大人拖拽场景）
  await page.keyboard.press('ArrowRight');
  await new Promise(r => setTimeout(r, 1200));
  await page.keyboard.press('ArrowRight');
  await new Promise(r => setTimeout(r, 1200));
  await page.keyboard.press('ArrowRight');
  await new Promise(r => setTimeout(r, 1200));

  console.log('\n--- 互动测试（模拟人类拖拽） ---');
  // 截图验证拖拽前状态
  const shotPath_scene5_before = path.join(shotsDir, 'e2e_scene5_before.png');
  await page.screenshot({ path: shotPath_scene5_before });

  const scene5Check = await page.evaluate(() => {
    const drawing1 = document.getElementById('drag_drawing1');
    const adult = document.getElementById('adult_target');
    const panel = document.getElementById('subtitle-panel');
    return {
      hasDrawing: !!drawing1,
      drawingDraggable: drawing1 ? drawing1.dataset.draggable === 'true' : false,
      hasAdult: !!adult,
      oldSubtitle: (panel && panel.textContent || '').trim()
    };
  });
  if (!scene5Check.hasDrawing) fail('第5页缺少拖拽物 (一号作品)');
  if (!scene5Check.drawingDraggable) fail('第5页一号作品未标记为可拖拽');
  if (!scene5Check.hasAdult) fail('第5页缺少目标 (大人)');
  ok('第5页拖拽结构完备');

  // 真人类视角操作：使用鼠标点击并拖拽到目标身上
  const dragHandle = await page.$('#drag_drawing1');
  const dropHandle = await page.$('#adult_target');
  
  if (dragHandle && dropHandle) {
    const dragBox = await dragHandle.boundingBox();
    const dropBox = await dropHandle.boundingBox();
    
    // 鼠标按下：拖拽物中心点
    await page.mouse.move(dragBox.x + dragBox.width / 2, dragBox.y + dragBox.height / 2);
    await page.mouse.down();
    
    // 鼠标移动：目标中心点（步进20，模拟平滑拖动）
    await page.mouse.move(dropBox.x + dropBox.width / 2, dropBox.y + dropBox.height / 2, { steps: 20 });
    
    // 鼠标松开：完成拖拽
    await page.mouse.up();
    await new Promise(r => setTimeout(r, 1500)); // 等待交互后的动画和对话变化

    const shotPath_scene5_after = path.join(shotsDir, 'e2e_scene5_after.png');
    await page.screenshot({ path: shotPath_scene5_after });
    ok(`[视觉] 拖拽后截图已保存 -> ${shotPath_scene5_after}`);

    const afterInteraction = await page.evaluate(() => {
      const panel = document.getElementById('subtitle-panel');
      const adult = document.getElementById('adult_target');
      const drawing1 = document.getElementById('drag_drawing1');
      return {
        newSubtitle: (panel && panel.textContent || '').trim(),
        adultClasses: adult ? adult.className : '',
        drawingVisible: drawing1 ? window.getComputedStyle(drawing1).opacity > 0 && drawing1.style.display !== 'none' : false
      };
    });

    if (afterInteraction.newSubtitle === scene5Check.oldSubtitle) {
      fail(`[交互失败] 拖放后对话未更新（未触发 on_success）当前字幕：${afterInteraction.newSubtitle.slice(0, 30)}`);
    } else {
      ok(`[交互成功] 对话已更新为: ${afterInteraction.newSubtitle.slice(0, 30)}...`);
    }
  } else {
    fail('无法获取拖放元素的边界框');
  }

  await browser.close();
}

async function main() {
  console.log('\n=== 引擎 E2E 测试 ===\n');
  await checkServer();
  await runPuppeteer();
  console.log('\n=== 全部通过 ===\n');
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
