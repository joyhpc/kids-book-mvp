const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function runMermaidTest() {
  console.log('=== 启动 海的女儿 E2E 回归测试 ===\n');
  
  const browser = await chromium.launch();
  const page = await browser.newPage();
  // 模拟手机视口
  await page.setViewportSize({ width: 375, height: 812 });

  const shotsDir = path.join(__dirname, '..', 'screenshots', 'mermaid');
  if (!fs.existsSync(shotsDir)) fs.mkdirSync(shotsDir, { recursive: true });

  await page.goto('http://localhost:8888/index.html');
  await page.waitForSelector('#stage', { timeout: 5000 });

  // 等待 Loading 结束
  await page.waitForTimeout(1500);

  // ---------- TC-001: 场景1 ----------
  console.log('[TC-001] 检查场景 1: 海底宫殿');
  let text = await page.textContent('#subtitle-panel');
  if (!text.replace(/\\s+/g, '').includes('Deepbelowtheoceanwaves')) throw new Error('Scene 1 文本错误');
  await page.screenshot({ path: path.join(shotsDir, '01_ocean.png') });
  console.log('  -> 截图成功: 01_ocean.png');

  // 翻页到场景 2
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(1500); // 等待过渡

  // ---------- TC-002: 场景2 ----------
  console.log('[TC-002] 检查场景 2: 浮出水面');
  text = await page.textContent('#subtitle-panel');
  if (!text.replace(/\\s+/g, '').includes('Whensheturnedfifteen')) throw new Error('Scene 2 文本错误');
  await page.screenshot({ path: path.join(shotsDir, '02_surface.png') });
  console.log('  -> 截图成功: 02_surface.png');

  // 翻页到场景 3
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(1500);

  // ---------- TC-003: 场景3 (交互) ----------
  console.log('[TC-003] 检查场景 3: 拯救王子 (拖拽测试)');
  text = await page.textContent('#subtitle-panel');
  if (!text.replace(/\\s+/g, '').includes('Aterriblestormwrecked')) throw new Error('Scene 3 初始文本错误');
  
  await page.screenshot({ path: path.join(shotsDir, '03_rescue_before.png') });
  console.log('  -> 拖拽前截图成功: 03_rescue_before.png');

  // 执行拖拽 (mermaid_savior -> prince_drowning)
  const dragEl = await page.locator('#mermaid_savior');
  const dropEl = await page.locator('#prince_drowning');
  
  const dragBox = await dragEl.boundingBox();
  const dropBox = await dropEl.boundingBox();

  await page.mouse.move(dragBox.x + dragBox.width / 2, dragBox.y + dragBox.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(100);
  await page.mouse.move(dropBox.x + dropBox.width / 2, dropBox.y + dropBox.height / 2, { steps: 30 });
  await page.waitForTimeout(100);

  const check = await page.evaluate(() => {
    const a = document.getElementById('mermaid_savior').getBoundingClientRect();
    const b = document.getElementById('prince_drowning').getBoundingClientRect();
    const dragging = window.__E2E_DRAGGING_DELTA || { x: 0, y: 0 };
    const dragStarted = window.__E2E_DRAG_STARTED || false;
    const dragElVisible = document.elementFromPoint(a.left + a.width/2, a.top + a.height/2);
    const tolerance = 50;
    const hit = !(
      a.right  < b.left - tolerance ||
      a.left   > b.right + tolerance ||
      a.bottom < b.top - tolerance ||
      a.top    > b.bottom + tolerance
    );
    return { a: {left: a.left, top: a.top}, b: {left: b.left, top: b.top}, hit, dragging, dragStarted, dragElVisible: dragElVisible ? dragElVisible.id : null };
  });
  console.log('拖拽到位检测: ', check);

  await page.mouse.up();
  
  // 等待成功逻辑执行完毕（改变状态、隐藏物品、播放对白）
  await page.waitForTimeout(2000);
  
  const interactionCheck = await page.evaluate(() => ({
     success: window.__E2E_INTERACTION_SUCCESS,
     hit: window.__E2E_ACTUAL_HIT,
     rects: window.__E2E_ACTUAL_RECTS
  }));
  console.log('交互底层执行结果:', interactionCheck);
  
  // 验证对白是否更新为成功后对白
  text = await page.textContent('#subtitle-panel');
  console.log('拖拽后文本内容: ', text);
  if (!text.replace(/\\s+/g, '').includes('Thelittlemermaidheldhim')) throw new Error('拖拽成功后文本未更新');
  
  await page.screenshot({ path: path.join(shotsDir, '04_rescue_after.png') });
  console.log('  -> 拖拽后截图成功: 04_rescue_after.png');

  // 翻页到场景 4
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(1500);

  // ---------- TC-004: 场景4 (结局) ----------
  console.log('[TC-004] 检查场景 4: 结局界面');
  text = await page.textContent('#subtitle-panel');
  if (!text.replace(/\\s+/g, '').includes('Shelefthimsafelyonthebeach')) throw new Error('Scene 4 文本错误');
  
  await page.screenshot({ path: path.join(shotsDir, '05_beach.png') });
  console.log('  -> 场景4截图成功: 05_beach.png');

  // 等待结局弹窗出现 (delay_after_success_ms: 5000 在 scene 3，或者由 scene 4 的直接结束)
  // 因为我们在场景4配置了 ending 覆盖层，场景4没有交互，但有 ending，会直接在几秒后显示
  await page.waitForSelector('#ending-overlay.visible', { timeout: 6000 });
  
  const endingTitle = await page.textContent('.ending-title-zh');
  if (!endingTitle.includes('第一章 · 完')) throw new Error('结局标题错误');
  
  await page.screenshot({ path: path.join(shotsDir, '06_ending.png') });
  console.log('  -> 结局界面截图成功: 06_ending.png');

  await browser.close();
  console.log('\n=== E2E 回归测试通过！ ===');
}

runMermaidTest().catch(e => {
  console.error('测试失败:', e);
  process.exit(1);
});
