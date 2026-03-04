import { bus } from 'core/bus.js';

export const store = new Proxy({
  mode: 'single',
  currentIndex: 0,
  bookData: null,
  currentSceneData: null,
  // 基础进度记录
  progress: JSON.parse(localStorage.getItem('kids_book_progress') || '{"completed_scenes": []}'),
  // [Tale-js 借鉴] 引入全局变量系统，用于存储玩家选择、数值，驱动剧情分支
  variables: JSON.parse(localStorage.getItem('kids_book_variables') || '{}'),
  isTransitioning: false,
}, {
  set(target, prop, value) {
    if (target[prop] !== value) {
      target[prop] = value;
      // 持久化存储
      if (prop === 'progress') {
        localStorage.setItem('kids_book_progress', JSON.stringify(value));
      }
      if (prop === 'variables') {
        localStorage.setItem('kids_book_variables', JSON.stringify(value));
      }
      // 广播状态变更
      bus.emit(`store:${prop}`, value); 
    }
    return true;
  }
});
