/**
 * ============================================================
 *  《沉浸式双语互动绘本》通用播放引擎 v3
 *  纯 Vanilla JS · JSON 驱动 · 图片占位符体系 · Canvas 粒子
 *
 *  核心状态机（绝对不动）：DragDropEngine / AudioSyncEngine
 *  渲染层 v3：img 占位符 + ParticleSystem（Canvas 超新星）
 * ============================================================
 */

/* ==================== SceneLoader 模块 ==================== */
const SceneLoader = (() => {
  let _data = null;
  let _stageEl = null;

  async function load(url) {
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

    // —— 渲染背景 ——
    if (scene.background.type === 'css_gradient') {
      _stageEl.style.background = scene.background.value;
    } else if (scene.background.type === 'image') {
      _stageEl.style.background = `url('${scene.background.src}') center/cover no-repeat`;
    } else if (scene.background.type === 'canvas') {
      if (scene.background.gradient) {
        _stageEl.style.background = scene.background.gradient;
      }
    }

    // —— 渲染角色 ——
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

      const initState = ch.states[ch.initial_state];
      if (initState) {
        el.style.filter = initState.filter;
        if (initState.animation) el.classList.add('anim-' + initState.animation);
      }

      el.dataset.states = JSON.stringify(ch.states);
      _stageEl.appendChild(el);
    });

    // —— 渲染可拖拽物品 ——
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

    // —— 渲染字幕面板 ——
    _renderSubtitle(dialogues.intro);

    // —— 渲染底部提示 ——
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
    setTimeout(() => el.style.display = 'none', 500);
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

  /**
   * Canvas 超新星爆炸 + DOM 粒子双层叠加
   */
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
/* requestAnimationFrame 驱动逐词卡拉OK高亮，支持真实音频文件同步 */
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


/* ==================== ParticleSystem（Canvas 粒子引擎） ==================== */
const ParticleSystem = (() => {
  let _canvas, _ctx;
  let _w = 0, _h = 0, _dpr = 1;
  let _ambients = [];
  let _bursts = [];
  let _shockwaves = [];
  let _running = false;
  let _rafId = null;

  function init(canvas) {
    _canvas = canvas;
    _ctx = canvas.getContext('2d');
    _dpr = Math.min(window.devicePixelRatio || 1, 2);
    _resize();
    window.addEventListener('resize', _resize);

    for (let i = 0; i < 70; i++) {
      _ambients.push(_makeAmbient());
    }

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

  function _makeAmbient() {
    return {
      x: Math.random() * (_w || 400),
      y: Math.random() * (_h || 800),
      r: Math.random() * 2.0 + 0.5,
      vx: (Math.random() - 0.5) * 0.2,
      vy: -(Math.random() * 0.35 + 0.06),
      alpha: Math.random(),
      dAlpha: (Math.random() * 0.012 + 0.004) * (Math.random() > 0.5 ? 1 : -1),
      color: Math.random() > 0.3 ? '#d4af37' : '#ffffff'
    };
  }

  function burst(vx, vy) {
    const rect = _canvas.getBoundingClientRect();
    const cx = vx - rect.left;
    const cy = vy - rect.top;

    const colors = ['#FFD700', '#FFA500', '#FF6347', '#FFFFFF', '#d4af37',
                    '#FFE4B5', '#FF8C00', '#FFFACD'];

    for (let i = 0; i < 130; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 8 + 1.5;
      _bursts.push({
        x: cx, y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2,
        r: Math.random() * 5.5 + 1.5,
        life: 1,
        decay: 0.006 + Math.random() * 0.011,
        gravity: 0.035 + Math.random() * 0.03,
        color: colors[Math.floor(Math.random() * colors.length)]
      });
    }

    _shockwaves.push(
      { x: cx, y: cy, radius: 0, maxR: 200, speed: 5.5, alpha: 0.75, color: '#FFD700', width: 3 },
      { x: cx, y: cy, radius: 0, maxR: 280, speed: 3.5, alpha: 0.35, color: '#d4af37', width: 2 }
    );
  }

  function _loop() {
    if (!_running) return;
    _ctx.clearRect(0, 0, _w, _h);
    _drawAmbients();
    _drawBursts();
    _drawShockwaves();
    _rafId = requestAnimationFrame(_loop);
  }

  function _drawAmbients() {
    _ambients.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.alpha += p.dAlpha;
      if (p.alpha >= 1 || p.alpha <= 0.08) p.dAlpha *= -1;
      p.alpha = Math.max(0.08, Math.min(1, p.alpha));

      if (p.y < -10) { p.y = _h + 10; p.x = Math.random() * _w; }
      if (p.x < -10) p.x = _w + 10;
      if (p.x > _w + 10) p.x = -10;

      _ctx.save();
      _ctx.globalAlpha = p.alpha * 0.5;
      _ctx.fillStyle = p.color;
      _ctx.shadowColor = p.color;
      _ctx.shadowBlur = p.r * 4;
      _ctx.beginPath();
      _ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      _ctx.fill();
      _ctx.restore();
    });
  }

  function _drawBursts() {
    for (let i = _bursts.length - 1; i >= 0; i--) {
      const p = _bursts[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += p.gravity;
      p.vx *= 0.985;
      p.life -= p.decay;

      if (p.life <= 0) { _bursts.splice(i, 1); continue; }

      _ctx.save();
      _ctx.globalAlpha = p.life * p.life;
      _ctx.fillStyle = p.color;
      _ctx.shadowColor = p.color;
      _ctx.shadowBlur = p.r * 5 * p.life;
      _ctx.beginPath();
      _ctx.arc(p.x, p.y, p.r * (0.3 + p.life * 0.7), 0, Math.PI * 2);
      _ctx.fill();
      _ctx.restore();
    }
  }

  function _drawShockwaves() {
    for (let i = _shockwaves.length - 1; i >= 0; i--) {
      const sw = _shockwaves[i];
      sw.radius += sw.speed;
      const progress = sw.radius / sw.maxR;

      if (progress >= 1) { _shockwaves.splice(i, 1); continue; }

      _ctx.save();
      _ctx.globalAlpha = sw.alpha * (1 - progress);
      _ctx.strokeStyle = sw.color;
      _ctx.lineWidth = sw.width * (1 - progress * 0.5);
      _ctx.shadowColor = sw.color;
      _ctx.shadowBlur = 18 * (1 - progress);
      _ctx.beginPath();
      _ctx.arc(sw.x, sw.y, sw.radius, 0, Math.PI * 2);
      _ctx.stroke();
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


/* ==================== App 入口 ==================== */
const App = (() => {

  async function boot() {
    const loadingScreen = document.getElementById('loading-screen');

    try {
      const data = await SceneLoader.load('data/scene.json');

      const stage = document.getElementById('stage');
      if (!stage) throw new Error('找不到 #stage 元素');

      SceneLoader.render(stage);

      const bgCanvas = document.getElementById('bg-canvas');
      if (bgCanvas && data.scene.background.particles) {
        ParticleSystem.init(bgCanvas);
      }

      DragDropEngine.init(stage, data.interaction, () => {
        const hintBar = document.getElementById('hint-bar');
        if (hintBar) hintBar.classList.remove('visible');
      });

      if (loadingScreen) {
        loadingScreen.classList.add('fade-out');
        setTimeout(() => loadingScreen.remove(), 800);
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

  return { boot };
})();

document.addEventListener('DOMContentLoaded', App.boot);
