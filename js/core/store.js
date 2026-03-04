import { bus } from 'core/bus.js';

export const store = new Proxy({
  mode: 'single',
  currentIndex: 0,
  bookData: null,
  currentSceneData: null,
  progress: { completed_scenes: [] },
  isTransitioning: false,
}, {
  set(target, prop, value) {
    if (target[prop] !== value) {
      target[prop] = value;
      // 广播状态变更
      bus.emit(`store:${prop}`, value); 
    }
    return true;
  }
});
