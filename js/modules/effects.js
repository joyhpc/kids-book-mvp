import { bus } from '../core/bus.js';

class VisualEffects {
  constructor() {
    this.ticking = false;
    this.mx = 0.5;
    this.my = 0.5;

    // 等待 DOM 准备就绪
    document.addEventListener('DOMContentLoaded', () => {
      this.stageEl = document.getElementById('stage');
      
      // 创建跟随鼠标的全局环境光
      this.lightOverlay = document.createElement('div');
      this.lightOverlay.id = 'ambient-light';
      this.stageEl.appendChild(this.lightOverlay);

      // 绑定指针事件
      document.addEventListener('mousemove', this.onMove.bind(this));
      document.addEventListener('touchmove', (e) => this.onMove(e.touches[0]), {passive: true});
    });
  }

  onMove(e) {
    this.mx = e.clientX / window.innerWidth;
    this.my = e.clientY / window.innerHeight;

    if (!this.ticking) {
      requestAnimationFrame(() => this.update());
      this.ticking = true;
    }
  }

  update() {
    if (!this.lightOverlay) return;

    // 1. 更新全局光照位置
    this.lightOverlay.style.setProperty('--mx', `${this.mx * 100}%`);
    this.lightOverlay.style.setProperty('--my', `${this.my * 100}%`);

    // 2. 计算归一化的视差参数 (-1 到 1)
    const x = (this.mx - 0.5) * 2; 
    const y = (this.my - 0.5) * 2;

    // 3. 2.5D 深度视差更新
    document.querySelectorAll('.scene-character, .scene-item').forEach(el => {
      // 利用大小自动推断物理深度：越大的物体感觉越近，移动视差和 3D 翻转越明显
      const size = parseInt(el.style.width) || 100;
      const depth = size / 100; 
      
      const moveX = x * 15 * depth;
      const moveY = y * 15 * depth;
      // 极限 3D 偏转角
      const rotateY = x * 20;
      const rotateX = -y * 20;

      // 仅对内部包裹器施加视差 Transform，绝对不干扰外层核心模块（如拖拽、动画）的 Transform！
      const sprite = el.firstElementChild;
      if (sprite && (sprite.classList.contains('emoji-sprite') || sprite.tagName === 'IMG')) {
         sprite.style.transform = `translate3d(${moveX}px, ${moveY}px, 0) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
      }
    });

    // 4. 背景图层反向视差，拉开极其深邃的空间感
    const bgCanvas = document.getElementById('bg-canvas');
    if (bgCanvas) {
      bgCanvas.style.transform = `translate3d(${-x * 10}px, ${-y * 10}px, 0) scale(1.05)`;
    }

    this.ticking = false;
  }
}

export const effects = new VisualEffects();
