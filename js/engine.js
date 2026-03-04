// engine.js - Orchestrator
import { bus } from 'core/bus.js';
import { store } from 'core/store.js';

// 引入各模块，模块内部会自动挂载事件监听，无需互相调用
import 'modules/effects.js'; // 1. 挂载 2.5D 视差与光影系统
import 'modules/ui.js';
import 'modules/audio.js';
import 'modules/particles.js';
import 'plugins/interaction-manager.js';
import 'modules/scene-loader.js';
import 'modules/book.js';

export function initBook() {
  console.log('Kids Book Engine Native Modules Started 🚀');
  
  fetch('data/book.json?v=' + Date.now())
    .then(r => r.ok ? r.json() : null)
    .then(data => {
      if (data && data.scenes && data.scenes.length > 0) {
        bus.emit('app:startBook', 'data/book.json');
      } else {
        bus.emit('app:startSingle', 'data/scene.json');
      }
      setTimeout(() => bus.emit('app:ready'), 500);
    })
    .catch(() => {
      bus.emit('app:startSingle', 'data/scene.json');
      setTimeout(() => bus.emit('app:ready'), 500);
    });
}

document.addEventListener('DOMContentLoaded', initBook);
