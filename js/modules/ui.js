import { bus } from 'core/bus.js';
import { store } from 'core/store.js';
import { wait } from 'utils/helpers.js';
import { interpolate } from 'utils/interpolate.js';

class UIController {
  constructor() {
    this.stageEl = document.getElementById('stage');
    this.hintBar = document.getElementById('hint-bar');
    this.endingOverlay = document.getElementById('ending-overlay');
    this.progressBar = null;
    this.dots = [];

    // Events listening
    bus.on('book:loaded', () => {
      if (store.bookData) {
        this.createProgressBar(store.bookData.scenes.length);
        this.setupNavigation();
      }
    });

    bus.on('store:currentIndex', (index) => {
      this.updateProgressBar(index);
    });

    bus.on('store:progress', () => {
      this.updateProgressBar(store.currentIndex);
    });

    bus.on('ui:showHint', (hint) => {
      if (this.hintBar && hint) {
        this.hintBar.textContent = interpolate(hint.text_zh || '', store.variables || {});
        setTimeout(() => this.hintBar.classList.add('visible'), hint.show_after_ms || 2000);
      }
    });

    bus.on('interaction:success', () => {
      if (this.hintBar) this.hintBar.classList.remove('visible');
    });

    bus.on('ui:showEnding', (cfg) => this.scheduleEnding(cfg));

    bus.on('ui:pageTransition', async (payload) => {
      await this.fadeTransition(payload.renderNext);
      if (payload.onComplete) payload.onComplete();
    });

    bus.on('app:error', (msg) => {
      const loadingScreen = document.getElementById('loading-screen');
      if (loadingScreen) {
        const ring = loadingScreen.querySelector('.loader-ring');
        const text = loadingScreen.querySelector('.loading-text');
        if (ring) ring.style.borderTopColor = '#ff4444';
        if (text) text.textContent = msg;
      }
    });

    bus.on('app:ready', () => {
      const loadingScreen = document.getElementById('loading-screen');
      if (loadingScreen) {
        loadingScreen.classList.add('fade-out');
        setTimeout(() => loadingScreen.remove(), 1000);
      }
    });
  }

  // ==== ProgressBar ====
  createProgressBar(count) {
    if (this.progressBar) this.progressBar.remove();

    this.progressBar = document.createElement('div');
    this.progressBar.id = 'progress-bar';
    this.dots = [];

    for (let i = 0; i < count; i++) {
      const dot = document.createElement('div');
      dot.className = 'progress-dot';
      dot.dataset.index = i;
      this.progressBar.appendChild(dot);
      this.dots.push(dot);
    }

    this.stageEl.appendChild(this.progressBar);
  }

  updateProgressBar(currentIndex) {
    if (!this.dots.length) return;
    this.dots.forEach((dot, i) => {
      dot.classList.toggle('active', i === currentIndex);
      
      // 判断是否完成（历史记录中是否有该场景，或者下标小于当前场景）
      let isCompleted = i < currentIndex;
      if (store.bookData && store.progress && store.progress.completed_scenes) {
        const sceneId = store.bookData.scenes[i]?.id;
        if (sceneId && store.progress.completed_scenes.includes(sceneId)) {
          isCompleted = true;
        }
      }
      dot.classList.toggle('completed', isCompleted);
    });
  }

  // ==== Page Transition ====
  async fadeTransition(renderFn, duration = 600) {
    this.stageEl.style.transition = `opacity ${duration / 2}ms ease`;
    this.stageEl.style.opacity = '0';

    await wait(duration / 2);

    this.clearStageContent();
    await renderFn();

    this.stageEl.style.opacity = '1';
    await wait(duration / 2);
    this.stageEl.style.transition = '';
  }

  clearStageContent() {
    const preserve = new Set(['bg-canvas', 'reading-zone', 'hint-bar', 'ending-overlay', 'progress-bar', 'ambient-light']);
    Array.from(this.stageEl.children).forEach(child => {
      if (!preserve.has(child.id)) {
        // 彻底物理拔除 DOM 并切断引用，防止闭包残留
        child.innerHTML = '';
        child.remove();
      }
    });
  }

  // ==== Navigation Setup ====
  setupNavigation() {
    let touchStartX = 0;
    let touchStartY = 0;

    this.stageEl.addEventListener('touchstart', e => {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
    }, { passive: true });

    this.stageEl.addEventListener('touchend', e => {
      const dx = e.changedTouches[0].clientX - touchStartX;
      const dy = e.changedTouches[0].clientY - touchStartY;
      if (Math.abs(dx) < 60 || Math.abs(dy) > Math.abs(dx)) return;

      if (dx < 0) {
        bus.emit('scene:next');
      } else if (dx > 0) {
        bus.emit('scene:prev');
      }
    }, { passive: true });

    document.addEventListener('keydown', e => {
      if (store.mode !== 'book') return;
      if (e.key === 'ArrowRight') {
        bus.emit('scene:next');
      } else if (e.key === 'ArrowLeft') {
        bus.emit('scene:prev');
      }
    });
  }

  // ==== Ending Overlay ====
  scheduleEnding(cfg) {
    if (!cfg) return;
    const delay = cfg.delay_after_success_ms || 4000;

    setTimeout(() => {
      if (!this.endingOverlay) return;

      const stars = this.endingOverlay.querySelector('.ending-stars');
      const titleEn = this.endingOverlay.querySelector('.ending-title-en');
      const titleZh = this.endingOverlay.querySelector('.ending-title-zh');
      const subtitle = this.endingOverlay.querySelector('.ending-subtitle');
      const btn = this.endingOverlay.querySelector('.ending-btn');

      if (stars) stars.textContent = '✦  ✧  ✦';
      if (titleEn) titleEn.textContent = cfg.title_en || '';
      if (titleZh) titleZh.textContent = cfg.title_zh || '';
      if (subtitle) subtitle.textContent = interpolate(cfg.subtitle_zh || '', store.variables || {});
      if (btn) {
        btn.textContent = cfg.button_text || '再读一遍';
        btn.addEventListener('click', () => location.reload());
      }

      const subtitlePanel = document.getElementById('subtitle-panel');
      if (subtitlePanel) subtitlePanel.style.opacity = '0';

      this.endingOverlay.classList.add('visible');

      // 结束时全屏粒子
      const vw = window.innerWidth, vh = window.innerHeight;
      bus.emit('particles:burst', { x: vw * 0.5, y: vh * 0.45 });
      setTimeout(() => bus.emit('particles:burst', { x: vw * 0.3, y: vh * 0.5 }), 400);
      setTimeout(() => bus.emit('particles:burst', { x: vw * 0.7, y: vh * 0.5 }), 800);
      
    }, delay);
  }
}

export const uiController = new UIController();
