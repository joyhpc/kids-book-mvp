/**
 * ============================================================
 *  《沉浸式双语互动绘本》通用播放引擎 v4
 *  深邃助眠暗夜画风 · 萤火虫粒子 · 梦境涟漪
 *
 *  核心状态机（绝对不动）：DragDropEngine / AudioSyncEngine
 *  渲染层 v4：img 占位符 + ParticleSystem（萤火虫 + DreamRipple）
 * ============================================================
 */

/* ==================== SceneLoader 模块 ==================== */
const SceneLoader = (() => {
  let _data = null;
  let _stageEl = null;

  async function load(url, directData) {
    if (directData) {
      _data = directData;
      return _data;
    }
    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      _data = await resp.json();
    } catch (e) {
      console.warn('fetch 加载失败，使用内嵌数据降级:', e.message);
      if (window.__SCENE_DATA__) {
        _data = window.__SCENE_DATA__;
      } else {
        throw new Error('场景数据加载失败，请使用本地服务器运行');
      }
    }
    return _data;
  }

  function render(stageEl) {
    _stageEl = stageEl;
    if (!_data) throw new Error('请先调用 SceneLoader.load()');

    const { scene, dialogues, ui } = _data;

    if (scene.background.type === 'css_gradient') {
      _stageEl.style.background = scene.background.value;
    } else if (scene.background.type === 'image') {
      _stageEl.style.background = `url('${scene.background.src}') center/cover no-repeat`;
    } else if (scene.background.type === 'canvas') {
      if (scene.background.gradient) {
        _stageEl.style.background = scene.background.gradient;
      }
    }

    scene.characters.forEach(ch => {
      const el = document.createElement('div');
      el.id = ch.id;
      el.className = 'scene-character';

      if (ch.img_src) {
        const img = document.createElement('img');
        img.src = ch.img_src;
        img.alt = ch.label || '';
        img.draggable = false;
        el.appendChild(img);
      }

      if (ch.width) el.style.width = ch.width;
      if (ch.height) el.style.height = ch.height;
      el.style.left = ch.position.x;
      el.style.top = ch.position.y;

      if (ch.states && ch.initial_state) {
        const initState = ch.states[ch.initial_state];
        if (initState) {
          if (initState.filter) el.style.filter = initState.filter;
          if (initState.animation && initState.animation !== 'none') el.classList.add('anim-' + initState.animation);
        }
        el.dataset.states = JSON.stringify(ch.states);
      }
      _stageEl.appendChild(el);
    });

    scene.items.forEach(item => {
      const el = document.createElement('div');
      el.id = item.id;
      el.className = 'scene-item';

      if (item.img_src) {
        const img = document.createElement('img');
        img.src = item.img_src;
        img.alt = item.label || '';
        img.draggable = false;
        el.appendChild(img);
      }

      if (item.width) el.style.width = item.width;
      if (item.height) el.style.height = item.height;
      el.style.left = item.position.x;
      el.style.top = item.position.y;

      if (item.draggable) el.dataset.draggable = 'true';
      if (item.animation) el.classList.add('anim-' + item.animation);

      _stageEl.appendChild(el);
    });

    _renderSubtitle(dialogues.intro);

    if (ui && ui.hint) {
      const hintBar = document.getElementById('hint-bar');
      if (hintBar) {
        hintBar.textContent = ui.hint.text_zh;
        setTimeout(() => hintBar.classList.add('visible'), ui.hint.show_after_ms || 2000);
      }
    }
  }

  function _renderSubtitle(dialogue) {
    const panel = document.getElementById('subtitle-panel');
    if (!panel || !dialogue) return;
    panel.innerHTML = '';

    const wordContainer = document.createElement('div');
    wordContainer.id = 'subtitle-words';
    wordContainer.style.display = 'flex';
    wordContainer.style.flexWrap = 'wrap';
    wordContainer.style.justifyContent = 'center';
    wordContainer.style.gap = '0.35em';
    wordContainer.style.width = '100%';

    dialogue.words.forEach((w, i) => {
      const span = document.createElement('span');
      span.className = 'word-span';
      span.textContent = w.word;
      span.dataset.index = i;
      span.dataset.start = w.start_time;
      span.dataset.end = w.end_time;
      wordContainer.appendChild(span);
    });
    panel.appendChild(wordContainer);

    if (dialogue.text_zh) {
      const zhLine = document.createElement('div');
      zhLine.id = 'subtitle-zh';
      zhLine.textContent = dialogue.text_zh;
      panel.appendChild(zhLine);
    }

    if (dialogue.auto_play) {
      setTimeout(() => AudioSyncEngine.play(dialogue), 600);
    }
  }

  function switchDialogue(dialogueId) {
    if (!_data) return;
    const dlg = _data.dialogues[dialogueId];
    if (dlg) _renderSubtitle(dlg);
  }

  function getData() { return _data; }

  return { load, render, switchDialogue, getData };
})();


/* ==================== DragDropEngine 模块 ==================== */
/* ▼▼▼ 核心状态机：拖拽/碰撞/回弹/成功链 —— 一行不动 ▼▼▼ */
const DragDropEngine = (() => {
  let _dragging = null;
  let _offsetX = 0;
  let _offsetY = 0;
  let _startX = 0;
  let _startY = 0;
  let _interactionCfg = null;
  let _stageEl = null;
  let _onSuccessCallback = null;

  function init(stageEl, interactionCfg, onSuccess) {
    _stageEl = stageEl;
    _interactionCfg = interactionCfg;
    _onSuccessCallback = onSuccess;

    _stageEl.addEventListener('mousedown', _onStart, { passive: false });
    _stageEl.addEventListener('touchstart', _onStart, { passive: false });
    document.addEventListener('mousemove', _onMove, { passive: false });
    document.addEventListener('touchmove', _onMove, { passive: false });
    document.addEventListener('mouseup', _onEnd);
    document.addEventListener('touchend', _onEnd);
    document.addEventListener('touchcancel', _onEnd);
  }

  function _getPointer(e) {
    if (e.touches && e.touches.length > 0) {
      return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
    return { x: e.clientX, y: e.clientY };
  }

  function _onStart(e) {
    const target = e.target.closest('.scene-item[data-draggable="true"]');
    if (!target) return;
    e.preventDefault();

    _dragging = target;
    const rect = target.getBoundingClientRect();
    const ptr = _getPointer(e);

    _offsetX = ptr.x - rect.left - rect.width / 2;
    _offsetY = ptr.y - rect.top - rect.height / 2;

    _startX = rect.left + rect.width / 2;
    _startY = rect.top + rect.height / 2;

    target.classList.add('dragging');
    target.classList.remove('anim-item-bounce');
  }

  function _onMove(e) {
    if (!_dragging) return;
    e.preventDefault();

    const ptr = _getPointer(e);
    const stageRect = _stageEl.getBoundingClientRect();

    let x = ptr.x - _offsetX - stageRect.left;
    let y = ptr.y - _offsetY - stageRect.top;
    x = Math.max(0, Math.min(stageRect.width, x));
    y = Math.max(0, Math.min(stageRect.height, y));

    _dragging.style.left = x + 'px';
    _dragging.style.top = y + 'px';

    if (_interactionCfg) {
      const targetEl = document.getElementById(_interactionCfg.target_id);
      if (targetEl) {
        const hit = _checkCollision(_dragging, targetEl, _interactionCfg.hit_tolerance);
        targetEl.classList.toggle('drop-hover', hit);
      }
    }
  }

  function _onEnd(e) {
    if (!_dragging) return;

    _dragging.classList.remove('dragging');

    if (_interactionCfg) {
      const targetEl = document.getElementById(_interactionCfg.target_id);
      if (targetEl) {
        targetEl.classList.remove('drop-hover');
        const hit = _checkCollision(_dragging, targetEl, _interactionCfg.hit_tolerance);
        if (hit) {
          _handleSuccess(_dragging, targetEl);
          _dragging = null;
          return;
        }
      }
    }

    _springBack(_dragging);
    _dragging = null;
  }

  function _checkCollision(elA, elB, tolerance) {
    const a = elA.getBoundingClientRect();
    const b = elB.getBoundingClientRect();
    const t = tolerance || 0;

    return !(
      a.right  < b.left - t ||
      a.left   > b.right + t ||
      a.bottom < b.top - t ||
      a.top    > b.bottom + t
    );
  }

  function _springBack(el) {
    const cfg = _interactionCfg ? _interactionCfg.on_fail : {};
    const duration = cfg.duration_ms || 400;
    const easing = cfg.easing || 'cubic-bezier(0.34, 1.56, 0.64, 1)';

    el.style.transition = `left ${duration}ms ${easing}, top ${duration}ms ${easing}`;

    const sceneData = SceneLoader.getData();
    if (sceneData) {
      const itemCfg = sceneData.scene.items.find(i => i.id === el.id);
      if (itemCfg) {
        el.style.left = itemCfg.position.x;
        el.style.top = itemCfg.position.y;
      }
    }

    setTimeout(() => {
      el.style.transition = '';
      el.classList.add('anim-item-bounce');
    }, duration + 50);
  }

  function _handleSuccess(itemEl, targetEl) {
    itemEl.dataset.draggable = 'false';

    const actions = _interactionCfg.on_success.actions || [];
    actions.forEach(action => {
      switch (action.type) {
        case 'hide_item':
          _hideItem(action);
          break;
        case 'change_state':
          _changeState(action);
          break;
        case 'play_dialogue':
          setTimeout(() => SceneLoader.switchDialogue(action.dialogue_id), 500);
          break;
        case 'show_particles':
          _showParticles(action, targetEl);
          break;
      }
    });

    if (_onSuccessCallback) _onSuccessCallback();
  }

  function _hideItem(action) {
    const el = document.getElementById(action.target);
    if (!el) return;
    if (action.animation) el.classList.add('anim-' + action.animation);
    setTimeout(() => el.style.display = 'none', 600);
  }

  function _changeState(action) {
    const el = document.getElementById(action.target);
    if (!el) return;
    let states;
    try { states = JSON.parse(el.dataset.states); } catch { return; }

    const newState = states[action.to_state];
    if (!newState) return;

    el.className = el.className.replace(/anim-[\w-]+/g, '').trim();
    el.classList.add('scene-character');

    el.style.filter = newState.filter;
    if (newState.animation) el.classList.add('anim-' + newState.animation);
  }

  function _showParticles(action, anchorEl) {
    const rect = anchorEl.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    if (typeof ParticleSystem !== 'undefined' && ParticleSystem.burst) {
      ParticleSystem.burst(cx, cy);
    }

    for (let i = 0; i < (action.count || 6); i++) {
      const p = document.createElement('div');
      p.className = 'particle';
      p.textContent = action.emoji || '✨';
      p.style.left = cx + 'px';
      p.style.top = cy + 'px';

      const angle = (Math.PI * 2 / action.count) * i + Math.random() * 0.5;
      const dist = 60 + Math.random() * 80;
      p.style.setProperty('--px', Math.cos(angle) * dist + 'px');
      p.style.setProperty('--py', Math.sin(angle) * dist - 40 + 'px');

      document.body.appendChild(p);
      setTimeout(() => p.remove(), action.duration_ms || 1200);
    }
  }

  function destroy() {
    _stageEl?.removeEventListener('mousedown', _onStart);
    _stageEl?.removeEventListener('touchstart', _onStart);
    document.removeEventListener('mousemove', _onMove);
    document.removeEventListener('touchmove', _onMove);
    document.removeEventListener('mouseup', _onEnd);
    document.removeEventListener('touchend', _onEnd);
    document.removeEventListener('touchcancel', _onEnd);
  }

  return { init, destroy };
})();
/* ▲▲▲ DragDropEngine 核心状态机结束 ▲▲▲ */


/* ==================== AudioSyncEngine 模块 ==================== */
/* 支持真实音频文件同步（dialogue.audio）+ performance.now() 降级 */
const AudioSyncEngine = (() => {
  let _playing = false;
  let _startTs = 0;
  let _words = [];
  let _rafId = null;
  let _audio = null;

  function play(dialogue) {
    if (_playing) stop();

    _words = dialogue.words || [];
    if (_words.length === 0) return;

    _playing = true;

    if (dialogue.audio) {
      _audio = new Audio(dialogue.audio);
      _audio.play().then(() => {
        _startTs = performance.now();
        _rafId = requestAnimationFrame(_tick);
      }).catch(() => {
        _startTs = performance.now();
        _rafId = requestAnimationFrame(_tick);
      });
    } else {
      _startTs = performance.now();
      _rafId = requestAnimationFrame(_tick);
    }
  }

  function _tick(now) {
    if (!_playing) return;

    const elapsed = _audio
      ? _audio.currentTime
      : (now - _startTs) / 1000;
    const spans = document.querySelectorAll('#subtitle-words .word-span');

    let allDone = true;

    spans.forEach((span, i) => {
      const start = parseFloat(span.dataset.start);
      const end = parseFloat(span.dataset.end);

      if (elapsed >= start && elapsed < end) {
        span.classList.add('highlight');
        span.classList.remove('spoken');
        allDone = false;
      } else if (elapsed >= end) {
        span.classList.remove('highlight');
        span.classList.add('spoken');
      } else {
        span.classList.remove('highlight', 'spoken');
        allDone = false;
      }
    });

    if (allDone) {
      _playing = false;
      return;
    }

    _rafId = requestAnimationFrame(_tick);
  }

  function stop() {
    _playing = false;
    if (_rafId) {
      cancelAnimationFrame(_rafId);
      _rafId = null;
    }
    if (_audio) {
      _audio.pause();
      _audio = null;
    }
  }

  function isPlaying() { return _playing; }

  return { play, stop, isPlaying };
})();
/* ▲▲▲ AudioSyncEngine 结束 ▲▲▲ */


/* ==================== ParticleSystem v4（萤火虫 + 梦境涟漪） ==================== */
const ParticleSystem = (() => {
  let _canvas, _ctx;
  let _w = 0, _h = 0, _dpr = 1;
  let _stars = [];
  let _fireflies = [];
  let _ripples = [];
  let _burstFireflies = [];
  let _running = false;
  let _rafId = null;

  function init(canvas) {
    _canvas = canvas;
    _ctx = canvas.getContext('2d');
    _dpr = Math.min(window.devicePixelRatio || 1, 2);
    _resize();
    window.addEventListener('resize', _resize);

    const numStars = Math.min(100, (_w * _h) / 5000);
    for (let i = 0; i < numStars; i++) _stars.push(_makeStar());

    const numFF = Math.min(40, (_w * _h) / 25000);
    for (let i = 0; i < numFF; i++) _fireflies.push(_makeFirefly());

    _running = true;
    _rafId = requestAnimationFrame(_loop);
  }

  function _resize() {
    const rect = _canvas.getBoundingClientRect();
    _w = rect.width;
    _h = rect.height;
    _canvas.width = _w * _dpr;
    _canvas.height = _h * _dpr;
    _ctx.setTransform(_dpr, 0, 0, _dpr, 0, 0);
  }

  function _makeStar() {
    return {
      x: Math.random() * (_w || 400),
      y: Math.random() * (_h || 800),
      size: Math.random() * 1.5,
      alpha: Math.random() * 0.4,
      speed: (Math.random() * 0.005 + 0.002) * (Math.random() < 0.5 ? 1 : -1)
    };
  }

  function _makeFirefly() {
    return {
      x: Math.random() * (_w || 400),
      y: Math.random() * (_h || 800),
      size: Math.random() * 2 + 1,
      angle: Math.random() * Math.PI * 2,
      speedY: -(Math.random() * 0.2 + 0.1),
      color: Math.random() > 0.4 ? '#ffffff' : '#a78bfa'
    };
  }

  /**
   * 梦境涟漪 burst —— 公共 API 与 v3 相同，内部改为柔和涟漪
   */
  function burst(vx, vy) {
    const rect = _canvas.getBoundingClientRect();
    const cx = vx - rect.left;
    const cy = vy - rect.top;

    for (let i = 0; i < 4; i++) {
      _ripples.push({
        x: cx, y: cy,
        radius: 0,
        maxRadius: 60 + Math.random() * 80,
        alpha: 0.5 + Math.random() * 0.2,
        color: i % 2 === 0 ? 'rgba(167, 139, 250, A)' : 'rgba(255, 255, 255, A)'
      });
    }

    for (let i = 0; i < 25; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 1.5 + 0.3;
      _burstFireflies.push({
        x: cx, y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 0.5,
        size: Math.random() * 2.5 + 1,
        life: 1,
        decay: 0.005 + Math.random() * 0.008,
        color: Math.random() > 0.5 ? '#a78bfa' : '#ffffff'
      });
    }
  }

  function _loop() {
    if (!_running) return;

    _ctx.globalCompositeOperation = 'destination-out';
    _ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
    _ctx.fillRect(0, 0, _w, _h);

    _ctx.globalCompositeOperation = 'lighter';

    _drawStars();
    _drawFireflies();
    _drawRipples();
    _drawBurstFireflies();

    _rafId = requestAnimationFrame(_loop);
  }

  function _drawStars() {
    for (let i = 0; i < _stars.length; i++) {
      const s = _stars[i];
      s.alpha += s.speed;
      if (s.alpha <= 0.05 || s.alpha >= 0.5) s.speed *= -1;
      s.alpha = Math.max(0.05, Math.min(0.5, s.alpha));
      s.x -= 0.02;
      if (s.x < 0) s.x = _w;

      _ctx.fillStyle = `rgba(255, 255, 255, ${s.alpha})`;
      _ctx.fillRect(s.x, s.y, s.size, s.size);
    }
  }

  function _drawFireflies() {
    for (let i = 0; i < _fireflies.length; i++) {
      const f = _fireflies[i];

      f.angle += 0.02;
      f.x += Math.sin(f.angle) * 0.5;
      f.y += f.speedY;

      if (f.y < -10) { f.y = _h + 10; f.x = Math.random() * _w; }
      if (f.x < -10) f.x = _w + 10;
      if (f.x > _w + 10) f.x = -10;

      _ctx.beginPath();
      _ctx.arc(f.x, f.y, f.size, 0, Math.PI * 2);
      _ctx.fillStyle = f.color;
      _ctx.shadowBlur = 8;
      _ctx.shadowColor = f.color;
      _ctx.fill();
      _ctx.shadowBlur = 0;
    }
  }

  function _drawRipples() {
    for (let i = _ripples.length - 1; i >= 0; i--) {
      const r = _ripples[i];
      r.radius += 0.6;
      r.alpha -= 0.004;

      if (r.alpha <= 0) { _ripples.splice(i, 1); continue; }

      _ctx.save();
      _ctx.globalAlpha = Math.max(0, r.alpha);
      _ctx.beginPath();
      _ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
      _ctx.lineWidth = 1.5;
      _ctx.strokeStyle = r.color.replace('A', r.alpha.toFixed(2));
      _ctx.stroke();
      _ctx.restore();
    }
  }

  function _drawBurstFireflies() {
    for (let i = _burstFireflies.length - 1; i >= 0; i--) {
      const p = _burstFireflies[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.995;
      p.vy *= 0.995;
      p.life -= p.decay;

      if (p.life <= 0) { _burstFireflies.splice(i, 1); continue; }

      _ctx.save();
      _ctx.globalAlpha = p.life * p.life;
      _ctx.beginPath();
      _ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
      _ctx.fillStyle = p.color;
      _ctx.shadowBlur = 6 * p.life;
      _ctx.shadowColor = p.color;
      _ctx.fill();
      _ctx.restore();
    }
  }

  function destroy() {
    _running = false;
    if (_rafId) cancelAnimationFrame(_rafId);
    window.removeEventListener('resize', _resize);
  }

  return { init, burst, destroy };
})();


/* ==================== BookEngine 多场景引擎 ==================== */
const BookEngine = (() => {
  let _bookData = null;
  let _currentIndex = 0;
  let _sceneCache = new Map();
  let _progress = { completed_scenes: [] };
  let _onSceneReady = null;
  let _transitioning = false;

  const STORAGE_KEY = 'storybook_progress';

  async function loadBook(url) {
    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      _bookData = await resp.json();
    } catch (e) {
      console.warn('book.json 加载失败:', e.message);
      return null;
    }
    _progress = _loadProgress();
    return _bookData;
  }

  async function loadScene(index) {
    if (!_bookData || index < 0 || index >= _bookData.scenes.length) return null;

    const sceneInfo = _bookData.scenes[index];
    if (_sceneCache.has(sceneInfo.id)) {
      return _sceneCache.get(sceneInfo.id);
    }

    try {
      const resp = await fetch(sceneInfo.data_url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const sceneData = await resp.json();
      _sceneCache.set(sceneInfo.id, sceneData);
      return sceneData;
    } catch (e) {
      console.error(`场景 ${sceneInfo.id} 加载失败:`, e);
      return null;
    }
  }

  function getCurrentIndex() { return _currentIndex; }
  function getSceneCount() { return _bookData ? _bookData.scenes.length : 0; }
  function getBookData() { return _bookData; }

  function markCurrentComplete() {
    if (!_bookData) return;
    const sceneId = _bookData.scenes[_currentIndex].id;
    if (!_progress.completed_scenes.includes(sceneId)) {
      _progress.completed_scenes.push(sceneId);
      _saveProgress();
    }
  }

  function canAdvance() {
    if (!_bookData) return false;
    if (_currentIndex >= _bookData.scenes.length - 1) return false;

    const sceneId = _bookData.scenes[_currentIndex].id;
    const rule = _bookData.navigation_rules[sceneId];
    if (!rule || !rule.unlock_condition) return true;

    if (rule.unlock_condition === 'interaction_success') {
      return _progress.completed_scenes.includes(sceneId);
    }
    return true;
  }

  async function nextScene() {
    if (!canAdvance() || _transitioning) return null;
    _currentIndex++;
    return await loadScene(_currentIndex);
  }

  async function prevScene() {
    if (_currentIndex <= 0 || _transitioning) return null;
    _currentIndex--;
    return await loadScene(_currentIndex);
  }

  async function goToScene(index) {
    if (!_bookData || index < 0 || index >= _bookData.scenes.length || _transitioning) return null;
    _currentIndex = index;
    return await loadScene(_currentIndex);
  }

  function isLastScene() {
    return _bookData && _currentIndex >= _bookData.scenes.length - 1;
  }

  function setTransitioning(val) { _transitioning = val; }

  function _loadProgress() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : { completed_scenes: [] };
    } catch { return { completed_scenes: [] }; }
  }

  function _saveProgress() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(_progress));
    } catch { /* localStorage 不可用时静默失败 */ }
  }

  function preloadNext() {
    if (_bookData && _currentIndex < _bookData.scenes.length - 1) {
      loadScene(_currentIndex + 1);
    }
  }

  return {
    loadBook, loadScene, getCurrentIndex, getSceneCount, getBookData,
    markCurrentComplete, canAdvance, nextScene, prevScene, goToScene,
    isLastScene, setTransitioning, preloadNext
  };
})();


/* ==================== PageTransition 场景切换动画 ==================== */
const PageTransition = (() => {

  async function fade(stageEl, renderFn, duration) {
    duration = duration || 600;
    stageEl.style.transition = `opacity ${duration / 2}ms ease`;
    stageEl.style.opacity = '0';

    await _wait(duration / 2);

    _clearStageContent(stageEl);
    await renderFn();

    stageEl.style.opacity = '1';
    await _wait(duration / 2);
    stageEl.style.transition = '';
  }

  async function slideLeft(stageEl, renderFn, duration) {
    duration = duration || 500;
    stageEl.style.transition = `transform ${duration}ms ease, opacity ${duration}ms ease`;
    stageEl.style.transform = 'translateX(-100%)';
    stageEl.style.opacity = '0';

    await _wait(duration);

    _clearStageContent(stageEl);
    await renderFn();

    stageEl.style.transition = 'none';
    stageEl.style.transform = 'translateX(100%)';
    stageEl.style.opacity = '0';

    await _wait(30);
    stageEl.style.transition = `transform ${duration}ms ease, opacity ${duration}ms ease`;
    stageEl.style.transform = 'translateX(0)';
    stageEl.style.opacity = '1';

    await _wait(duration);
    stageEl.style.transition = '';
    stageEl.style.transform = '';
  }

  async function slideRight(stageEl, renderFn, duration) {
    duration = duration || 500;
    stageEl.style.transition = `transform ${duration}ms ease, opacity ${duration}ms ease`;
    stageEl.style.transform = 'translateX(100%)';
    stageEl.style.opacity = '0';

    await _wait(duration);

    _clearStageContent(stageEl);
    await renderFn();

    stageEl.style.transition = 'none';
    stageEl.style.transform = 'translateX(-100%)';
    stageEl.style.opacity = '0';

    await _wait(30);
    stageEl.style.transition = `transform ${duration}ms ease, opacity ${duration}ms ease`;
    stageEl.style.transform = 'translateX(0)';
    stageEl.style.opacity = '1';

    await _wait(duration);
    stageEl.style.transition = '';
    stageEl.style.transform = '';
  }

  function _clearStageContent(stageEl) {
    const preserve = new Set(['bg-canvas', 'subtitle-panel', 'hint-bar', 'ending-overlay', 'progress-bar']);
    Array.from(stageEl.children).forEach(child => {
      if (!preserve.has(child.id)) {
        child.remove();
      }
    });
  }

  function _wait(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  return { fade, slideLeft, slideRight };
})();


/* ==================== ProgressBar 进度条 ==================== */
const ProgressBar = (() => {
  let _el = null;
  let _dots = [];

  function create(container, count) {
    if (_el) _el.remove();

    _el = document.createElement('div');
    _el.id = 'progress-bar';
    _dots = [];

    for (let i = 0; i < count; i++) {
      const dot = document.createElement('div');
      dot.className = 'progress-dot';
      dot.dataset.index = i;
      _el.appendChild(dot);
      _dots.push(dot);
    }

    container.appendChild(_el);
  }

  function update(currentIndex) {
    _dots.forEach((dot, i) => {
      dot.classList.toggle('active', i === currentIndex);
      dot.classList.toggle('completed', i < currentIndex);
    });
  }

  function destroy() {
    if (_el) { _el.remove(); _el = null; }
    _dots = [];
  }

  return { create, update, destroy };
})();


/* ==================== App 入口 ==================== */
const App = (() => {
  let _stage = null;
  let _mode = 'single';

  async function boot() {
    const loadingScreen = document.getElementById('loading-screen');

    try {
      _stage = document.getElementById('stage');
      if (!_stage) throw new Error('找不到 #stage 元素');

      const bookData = await BookEngine.loadBook('data/book.json');

      if (bookData && bookData.scenes && bookData.scenes.length > 0) {
        _mode = 'book';
        await _bootBookMode(bookData);
      } else {
        _mode = 'single';
        await _bootSingleMode();
      }

      if (loadingScreen) {
        loadingScreen.classList.add('fade-out');
        setTimeout(() => loadingScreen.remove(), 1000);
      }

    } catch (err) {
      console.error('引擎启动失败:', err);
      if (loadingScreen) {
        const ring = loadingScreen.querySelector('.loader-ring');
        const text = loadingScreen.querySelector('.loading-text');
        if (ring) ring.style.borderTopColor = '#ff4444';
        if (text) text.textContent = '加载失败，请刷新重试';
      }
    }
  }

  async function _bootSingleMode() {
    const data = await SceneLoader.load('data/scene.json');

    SceneLoader.render(_stage);

    const bgCanvas = document.getElementById('bg-canvas');
    if (bgCanvas && data.scene.background.particles) {
      ParticleSystem.init(bgCanvas);
    }

    DragDropEngine.init(_stage, data.interaction, () => {
      const hintBar = document.getElementById('hint-bar');
      if (hintBar) hintBar.classList.remove('visible');
      _scheduleEnding(data.ending);
    });
  }

  async function _bootBookMode(bookData) {
    ProgressBar.create(_stage, bookData.scenes.length);

    const firstScene = await BookEngine.loadScene(0);
    if (!firstScene) throw new Error('首个场景加载失败');

    await _renderScene(firstScene);
    ProgressBar.update(0);

    _setupBookNavigation();

    BookEngine.preloadNext();
  }

  async function _renderScene(sceneData) {
    _cancelAutoAdvance();
    AudioSyncEngine.stop();
    DragDropEngine.destroy();

    await SceneLoader.load(null, sceneData);
    SceneLoader.render(_stage);

    const bgCanvas = document.getElementById('bg-canvas');
    if (bgCanvas && sceneData.scene.background.particles) {
      ParticleSystem.destroy();
      ParticleSystem.init(bgCanvas);
    }

    const isInteractive = sceneData.interaction && sceneData.interaction.type;

    if (isInteractive) {
      DragDropEngine.init(_stage, sceneData.interaction, () => {
        const hintBar = document.getElementById('hint-bar');
        if (hintBar) hintBar.classList.remove('visible');

        BookEngine.markCurrentComplete();

        if (BookEngine.isLastScene() && sceneData.ending) {
          _scheduleEnding(sceneData.ending);
        } else if (sceneData.ending && sceneData.ending.auto_advance) {
          _autoAdvance(sceneData.ending.delay_after_success_ms || 3000);
        }
      });
    } else {
      BookEngine.markCurrentComplete();
      if (BookEngine.isLastScene() && sceneData.ending) {
        _scheduleEnding(sceneData.ending);
      } else if (sceneData.ending && sceneData.ending.auto_advance) {
        _autoAdvance(sceneData.ending.delay_after_success_ms || 3000);
      }
    }
  }

  let _autoAdvanceTimer = null;

  function _autoAdvance(delayMs) {
    _cancelAutoAdvance();
    _autoAdvanceTimer = setTimeout(async () => {
      _autoAdvanceTimer = null;
      if (!BookEngine.canAdvance()) return;
      await _navigateNext();
    }, delayMs);
  }

  function _cancelAutoAdvance() {
    if (_autoAdvanceTimer) {
      clearTimeout(_autoAdvanceTimer);
      _autoAdvanceTimer = null;
    }
  }

  async function _navigateNext() {
    _cancelAutoAdvance();
    const sceneData = await BookEngine.nextScene();
    if (!sceneData) return;

    BookEngine.setTransitioning(true);
    await PageTransition.fade(_stage, async () => {
      await _renderScene(sceneData);
      ProgressBar.update(BookEngine.getCurrentIndex());
    });
    BookEngine.setTransitioning(false);
    BookEngine.preloadNext();
  }

  async function _navigatePrev() {
    _cancelAutoAdvance();
    const sceneData = await BookEngine.prevScene();
    if (!sceneData) return;

    BookEngine.setTransitioning(true);
    await PageTransition.fade(_stage, async () => {
      await _renderScene(sceneData);
      ProgressBar.update(BookEngine.getCurrentIndex());
    });
    BookEngine.setTransitioning(false);
  }

  function _setupBookNavigation() {
    let _touchStartX = 0;
    let _touchStartY = 0;

    _stage.addEventListener('touchstart', e => {
      _touchStartX = e.touches[0].clientX;
      _touchStartY = e.touches[0].clientY;
    }, { passive: true });

    _stage.addEventListener('touchend', e => {
      const dx = e.changedTouches[0].clientX - _touchStartX;
      const dy = e.changedTouches[0].clientY - _touchStartY;
      if (Math.abs(dx) < 60 || Math.abs(dy) > Math.abs(dx)) return;

      if (dx < 0 && BookEngine.canAdvance()) {
        _navigateNext();
      } else if (dx > 0) {
        _navigatePrev();
      }
    }, { passive: true });

    document.addEventListener('keydown', e => {
      if (_mode !== 'book') return;
      if (e.key === 'ArrowRight' && BookEngine.canAdvance()) {
        _navigateNext();
      } else if (e.key === 'ArrowLeft') {
        _navigatePrev();
      }
    });
  }

  function _scheduleEnding(cfg) {
    if (!cfg) return;
    const delay = cfg.delay_after_success_ms || 4000;

    setTimeout(() => {
      const overlay = document.getElementById('ending-overlay');
      if (!overlay) return;

      const stars = overlay.querySelector('.ending-stars');
      const titleEn = overlay.querySelector('.ending-title-en');
      const titleZh = overlay.querySelector('.ending-title-zh');
      const subtitle = overlay.querySelector('.ending-subtitle');
      const btn = overlay.querySelector('.ending-btn');

      if (stars) stars.textContent = '✦  ✧  ✦';
      if (titleEn) titleEn.textContent = cfg.title_en || '';
      if (titleZh) titleZh.textContent = cfg.title_zh || '';
      if (subtitle) subtitle.textContent = cfg.subtitle_zh || '';
      if (btn) {
        btn.textContent = cfg.button_text || '再读一遍';
        btn.addEventListener('click', () => location.reload());
      }

      const subtitlePanel = document.getElementById('subtitle-panel');
      if (subtitlePanel) subtitlePanel.style.opacity = '0';

      overlay.classList.add('visible');

      if (typeof ParticleSystem !== 'undefined' && ParticleSystem.burst) {
        const vw = window.innerWidth, vh = window.innerHeight;
        ParticleSystem.burst(vw * 0.5, vh * 0.45);
        setTimeout(() => ParticleSystem.burst(vw * 0.3, vh * 0.5), 400);
        setTimeout(() => ParticleSystem.burst(vw * 0.7, vh * 0.5), 800);
      }
    }, delay);
  }

  return { boot };
})();

document.addEventListener('DOMContentLoaded', App.boot);
