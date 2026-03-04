import { BaseInteraction } from '../core/base-interaction.js';
import { checkCollision, getPointer } from '../utils/helpers.js';

export class DragDropInteraction extends BaseInteraction {
  constructor(stageEl, config, bus) {
    super(stageEl, config, bus);

    this.dragging = null;
    this.startX = 0;
    this.startY = 0;
    this.deltaX = 0;
    this.deltaY = 0;
    this.rafTicking = false;

    // 绑定作用域
    this._onStart = this._onStart.bind(this);
    this._onMove = this._onMove.bind(this);
    this._onEnd = this._onEnd.bind(this);
    this._updateDOM = this._updateDOM.bind(this);
  }

  mount() {
    super.mount();
    this.stageEl.addEventListener('mousedown', this._onStart, { passive: false });
    this.stageEl.addEventListener('touchstart', this._onStart, { passive: false });
    document.addEventListener('mousemove', this._onMove, { passive: false });
    document.addEventListener('touchmove', this._onMove, { passive: false });
    document.addEventListener('mouseup', this._onEnd);
    document.addEventListener('touchend', this._onEnd);
    document.addEventListener('touchcancel', this._onEnd);
  }

  unmount() {
    this.stageEl?.removeEventListener('mousedown', this._onStart);
    this.stageEl?.removeEventListener('touchstart', this._onStart);
    document.removeEventListener('mousemove', this._onMove);
    document.removeEventListener('touchmove', this._onMove);
    document.removeEventListener('mouseup', this._onEnd);
    document.removeEventListener('touchend', this._onEnd);
    document.removeEventListener('touchcancel', this._onEnd);
    
    this.dragging = null;
    super.unmount();
  }

  _onStart(e) {
    const target = e.target.closest('.scene-item[data-draggable="true"]');
    if (!target) return;
    e.preventDefault();

    this.dragging = target;
    const ptr = getPointer(e);
    
    this.startX = ptr.x;
    this.startY = ptr.y;
    this.deltaX = 0;
    this.deltaY = 0;
    this.rafTicking = false;

    window.__E2E_DRAG_STARTED = true;

    target.classList.add('dragging');
    // 移除可能存在的动画类，否则 CSS 动画会覆盖 inline transform 导致无法拖拽
    Array.from(target.classList).forEach(cls => {
      if (cls.startsWith('anim-')) {
        target.classList.remove(cls);
        target.dataset.removedAnim = cls; // 记住被移除的动画，方便失败后恢复
      }
    });
  }

  _onMove(e) {
    if (!this.dragging) return;
    e.preventDefault();

    const ptr = getPointer(e);
    this.deltaX = ptr.x - this.startX;
    this.deltaY = ptr.y - this.startY;
    window.__E2E_DRAGGING_DELTA = { x: this.deltaX, y: this.deltaY };

    if (!this.rafTicking) {
      requestAnimationFrame(this._updateDOM);
      this.rafTicking = true;
    }
  }

  _updateDOM() {
    if (!this.dragging) {
      this.rafTicking = false;
      return;
    }

    // 极高帧率移动端硬件加速
    this.dragging.style.transform = `translate(calc(-50% + ${this.deltaX}px), calc(-50% + ${this.deltaY}px)) scale(1.1)`;

    if (this.config) {
      const targetEl = document.getElementById(this.config.target_id);
      if (targetEl) {
        const hit = checkCollision(this.dragging, targetEl, this.config.hit_tolerance);
        targetEl.classList.toggle('drop-hover', hit);
      }
    }
    
    this.rafTicking = false;
  }

  _onEnd() {
    if (!this.dragging) return;
    
    const el = this.dragging;
    el.classList.remove('dragging');
    this.dragging = null;

    if (this.config) {
      const targetEl = document.getElementById(this.config.target_id);
      if (targetEl) {
        targetEl.classList.remove('drop-hover');
        const hit = checkCollision(el, targetEl, this.config.hit_tolerance);
        window.__E2E_ACTUAL_HIT = hit;
        window.__E2E_ACTUAL_RECTS = {
           a: el.getBoundingClientRect(),
           b: targetEl.getBoundingClientRect()
        };
        if (hit) {
          el.dataset.draggable = 'false';
          this._triggerSuccess(el, targetEl);
          return;
        }
      }
    }

    this._springBack(el);
  }

  _springBack(el) {
    const cfg = this.config ? this.config.on_fail : {};
    const duration = cfg.duration_ms || 400;
    const easing = cfg.easing || 'cubic-bezier(0.34, 1.56, 0.64, 1)';

    el.style.transition = `transform ${duration}ms ${easing}`;
    el.style.transform = `translate(-50%, -50%)`;

    setTimeout(() => {
      el.style.transition = '';
      if (el.dataset.removedAnim) {
        el.classList.add(el.dataset.removedAnim);
        delete el.dataset.removedAnim;
      } else {
        el.classList.add('anim-item-bounce'); // fallback
      }
    }, duration + 50);
  }
}
