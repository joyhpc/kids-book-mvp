import { bus } from 'core/bus.js';
import { store } from 'core/store.js';

class BookEngine {
  constructor() {
    this.STORAGE_KEY = 'storybook_progress';
    this.sceneCache = new Map();
    this.autoAdvanceTimer = null;

    // Load progress initially
    store.progress = this._loadProgress();

    // 监听事件：
    bus.on('app:startBook', (url) => this.loadBook(url));
    bus.on('app:startSingle', (url) => this.loadSingleScene(url));
    bus.on('scene:next', () => this.nextScene());
    bus.on('scene:prev', () => this.prevScene());
    bus.on('scene:markComplete', () => this.markCurrentComplete());
    
    // 当交互成功时
    bus.on('interaction:success', () => {
      this.markCurrentComplete();
      const sceneData = store.currentSceneData;
      if (this.isLastScene() && sceneData && sceneData.ending) {
        bus.emit('ui:showEnding', sceneData.ending);
      } else if (sceneData && sceneData.ending && sceneData.ending.auto_advance) {
        this._autoAdvance(sceneData.ending.delay_after_success_ms || 3000);
      }
    });
  }

  async loadBook(url) {
    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const bookData = await resp.json();
      
      // 1% 防线：极其轻量的 Schema 版本检查
      if (bookData.meta && bookData.meta.version !== "4.0.0" && bookData.meta.version !== "1.0.0") {
        bus.emit('app:error', `数据版本(${bookData.meta.version})与当前引擎不兼容，请刷新升级`);
        return;
      }
      
      store.bookData = bookData;
      store.mode = 'book';
      
      bus.emit('book:loaded'); // 通知其他模块 bookData 已准备好

      // Load first scene
      await this.goToScene(0);
    } catch (e) {
      console.warn('book.json 加载失败:', e.message);
      bus.emit('app:error', '绘本数据加载失败');
    }
  }

  async loadSingleScene(url) {
    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const sceneData = await resp.json();
      
      // 1% 防线：极其轻量的 Schema 版本检查
      if (sceneData.meta && sceneData.meta.version !== "4.0.0" && sceneData.meta.version !== "1.0.0") {
        bus.emit('app:error', `数据版本(${sceneData.meta.version})与当前引擎不兼容，请刷新升级`);
        return;
      }
      
      store.mode = 'single';
      store.currentSceneData = sceneData;

      // 自动完成逻辑
      const isInteractive = sceneData.interaction && sceneData.interaction.type;
      if (!isInteractive && sceneData.ending) {
          if (sceneData.ending.auto_advance) {
              // 单场景可能没有真正的下一页，但可以触发 ending
              setTimeout(() => bus.emit('ui:showEnding', sceneData.ending), sceneData.ending.delay_after_success_ms || 3000);
          } else {
              bus.emit('ui:showEnding', sceneData.ending);
          }
      }
    } catch (e) {
      console.warn('scene 加载失败:', e.message);
      if (window.__SCENE_DATA__) {
        store.mode = 'single';
        store.currentSceneData = window.__SCENE_DATA__;
      } else {
        bus.emit('app:error', '场景数据加载失败，请使用本地服务器运行');
      }
    }
  }

  async loadScene(index) {
    const bookData = store.bookData;
    if (!bookData || index < 0 || index >= bookData.scenes.length) return null;

    const sceneInfo = bookData.scenes[index];
    if (this.sceneCache.has(sceneInfo.id)) {
      return this.sceneCache.get(sceneInfo.id);
    }

    try {
      const resp = await fetch(sceneInfo.data_url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const sceneData = await resp.json();
      this.sceneCache.set(sceneInfo.id, sceneData);
      return sceneData;
    } catch (e) {
      console.error(`场景 ${sceneInfo.id} 加载失败:`, e);
      return null;
    }
  }

  async goToScene(index) {
    if (store.isTransitioning) return;
    
    const sceneData = await this.loadScene(index);
    if (!sceneData) return;

    this._cancelAutoAdvance();
    
    // 如果不是第一次，触发转场效果
    if (store.currentSceneData) {
      store.isTransitioning = true;
      const dir = index > store.currentIndex ? 'next' : 'prev';
      bus.emit('ui:pageTransition', {
        dir,
        renderNext: () => {
          store.currentIndex = index;
          store.currentSceneData = sceneData;
          this._handleSceneLoaded(sceneData);
        },
        onComplete: () => {
          store.isTransitioning = false;
        }
      });
    } else {
      store.currentIndex = index;
      store.currentSceneData = sceneData;
      this._handleSceneLoaded(sceneData);
    }
  }

  _handleSceneLoaded(sceneData) {
    this.preloadNext();
    
    const isInteractive = sceneData.interaction && sceneData.interaction.type;
    if (!isInteractive) {
      this.markCurrentComplete();
      if (this.isLastScene() && sceneData.ending) {
        bus.emit('ui:showEnding', sceneData.ending);
      } else if (sceneData.ending && sceneData.ending.auto_advance) {
        this._autoAdvance(sceneData.ending.delay_after_success_ms || 3000);
      }
    }
  }

  markCurrentComplete() {
    if (!store.bookData || store.mode !== 'book') return;
    const sceneId = store.bookData.scenes[store.currentIndex].id;
    if (!store.progress.completed_scenes.includes(sceneId)) {
      store.progress.completed_scenes.push(sceneId);
      this._saveProgress();
      // 通知进度条更新（其实可以通过 proxy setter，但这里手动重新赋值也可触发）
      store.progress = { ...store.progress };
    }
  }

  canAdvance() {
    if (!store.bookData || store.mode !== 'book') return false;
    if (store.currentIndex >= store.bookData.scenes.length - 1) return false;

    const sceneId = store.bookData.scenes[store.currentIndex].id;
    const rule = store.bookData.navigation_rules?.[sceneId];
    if (!rule || !rule.unlock_condition) return true;

    if (rule.unlock_condition === 'interaction_success') {
      return store.progress.completed_scenes.includes(sceneId);
    }
    return true;
  }

  async nextScene() {
    if (!this.canAdvance()) return;
    await this.goToScene(store.currentIndex + 1);
  }

  async prevScene() {
    if (store.currentIndex <= 0) return;
    await this.goToScene(store.currentIndex - 1);
  }

  isLastScene() {
    return store.bookData && store.currentIndex >= store.bookData.scenes.length - 1;
  }

  _loadProgress() {
    try {
      const saved = localStorage.getItem(this.STORAGE_KEY);
      return saved ? JSON.parse(saved) : { completed_scenes: [] };
    } catch { return { completed_scenes: [] }; }
  }

  _saveProgress() {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(store.progress));
    } catch { /* localStorage 不可用时静默失败 */ }
  }

  preloadNext() {
    if (store.bookData && store.currentIndex < store.bookData.scenes.length - 1) {
      this.loadScene(store.currentIndex + 1);
    }
  }

  _autoAdvance(delayMs) {
    this._cancelAutoAdvance();
    this.autoAdvanceTimer = setTimeout(() => {
      this.autoAdvanceTimer = null;
      if (this.canAdvance()) {
        this.nextScene();
      }
    }, delayMs);
  }

  _cancelAutoAdvance() {
    if (this.autoAdvanceTimer) {
      clearTimeout(this.autoAdvanceTimer);
      this.autoAdvanceTimer = null;
    }
  }
}

export const bookEngine = new BookEngine();
