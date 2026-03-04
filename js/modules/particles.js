import { bus } from 'core/bus.js';
import { store } from 'core/store.js';

class ParticleSystem {
  constructor() {
    this.canvas = null;
    this.ctx = null;
    this.w = 0;
    this.h = 0;
    this.dpr = 1;
    this.stars = [];
    this.fireflies = [];
    this.ripples = [];
    this.burstFireflies = [];
    this.running = false;
    this.rafId = null;

    this._resize = this._resize.bind(this);
    this._loop = this._loop.bind(this);

    // 监听状态改变来初始化/销毁粒子
    bus.on('store:currentSceneData', (data) => {
      this.destroy();
      const bgCanvas = document.getElementById('bg-canvas');
      if (bgCanvas && data && data.scene.background.particles) {
        this.init(bgCanvas);
      }
    });

    // 从 drag-drop 和 book 过来的触发事件
    bus.on('particles:burst', (payload) => {
      if (!this.running) return;
      if (payload.action && payload.targetEl) {
        this._burstAction(payload.action, payload.targetEl);
      } else if (payload.x !== undefined && payload.y !== undefined) {
        this.burst(payload.x, payload.y);
      }
    });
  }

  init(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this._resize();
    window.addEventListener('resize', this._resize);

    const numStars = Math.min(100, (this.w * this.h) / 5000);
    for (let i = 0; i < numStars; i++) this.stars.push(this._makeStar());

    const numFF = Math.min(40, (this.w * this.h) / 25000);
    for (let i = 0; i < numFF; i++) this.fireflies.push(this._makeFirefly());

    this.running = true;
    this.rafId = requestAnimationFrame(this._loop);
  }

  _resize() {
    if (!this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    this.w = rect.width;
    this.h = rect.height;
    this.canvas.width = this.w * this.dpr;
    this.canvas.height = this.h * this.dpr;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  _makeStar() {
    return {
      x: Math.random() * (this.w || 400),
      y: Math.random() * (this.h || 800),
      size: Math.random() * 1.5,
      alpha: Math.random() * 0.4,
      speed: (Math.random() * 0.005 + 0.002) * (Math.random() < 0.5 ? 1 : -1)
    };
  }

  _makeFirefly() {
    return {
      x: Math.random() * (this.w || 400),
      y: Math.random() * (this.h || 800),
      size: Math.random() * 2 + 1,
      angle: Math.random() * Math.PI * 2,
      speedY: -(Math.random() * 0.2 + 0.1),
      color: Math.random() > 0.4 ? '#ffffff' : '#a78bfa'
    };
  }

  burst(cx, cy) {
    for (let i = 0; i < 4; i++) {
      this.ripples.push({
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
      this.burstFireflies.push({
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

  _burstAction(action, anchorEl) {
    const rect = anchorEl.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    this.burst(cx, cy);

    // 额外的 DOM 粒子
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

  _loop() {
    if (!this.running) return;

    this.ctx.globalCompositeOperation = 'destination-out';
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
    this.ctx.fillRect(0, 0, this.w, this.h);

    this.ctx.globalCompositeOperation = 'lighter';

    this._drawStars();
    this._drawFireflies();
    this._drawRipples();
    this._drawBurstFireflies();

    this.rafId = requestAnimationFrame(this._loop);
  }

  _drawStars() {
    for (let i = 0; i < this.stars.length; i++) {
      const s = this.stars[i];
      s.alpha += s.speed;
      if (s.alpha <= 0.05 || s.alpha >= 0.5) s.speed *= -1;
      s.alpha = Math.max(0.05, Math.min(0.5, s.alpha));
      s.x -= 0.02;
      if (s.x < 0) s.x = this.w;

      this.ctx.fillStyle = `rgba(255, 255, 255, ${s.alpha})`;
      this.ctx.fillRect(s.x, s.y, s.size, s.size);
    }
  }

  _drawFireflies() {
    for (let i = 0; i < this.fireflies.length; i++) {
      const f = this.fireflies[i];

      f.angle += 0.02;
      f.x += Math.sin(f.angle) * 0.5;
      f.y += f.speedY;

      if (f.y < -10) { f.y = this.h + 10; f.x = Math.random() * this.w; }
      if (f.x < -10) f.x = this.w + 10;
      if (f.x > this.w + 10) f.x = -10;

      this.ctx.beginPath();
      this.ctx.arc(f.x, f.y, f.size, 0, Math.PI * 2);
      this.ctx.fillStyle = f.color;
      this.ctx.shadowBlur = 8;
      this.ctx.shadowColor = f.color;
      this.ctx.fill();
      this.ctx.shadowBlur = 0;
    }
  }

  _drawRipples() {
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const r = this.ripples[i];
      r.radius += 0.6;
      r.alpha -= 0.004;

      if (r.alpha <= 0) { this.ripples.splice(i, 1); continue; }

      this.ctx.save();
      this.ctx.globalAlpha = Math.max(0, r.alpha);
      this.ctx.beginPath();
      this.ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
      this.ctx.lineWidth = 1.5;
      this.ctx.strokeStyle = r.color.replace('A', r.alpha.toFixed(2));
      this.ctx.stroke();
      this.ctx.restore();
    }
  }

  _drawBurstFireflies() {
    for (let i = this.burstFireflies.length - 1; i >= 0; i--) {
      const p = this.burstFireflies[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.995;
      p.vy *= 0.995;
      p.life -= p.decay;

      if (p.life <= 0) { this.burstFireflies.splice(i, 1); continue; }

      this.ctx.save();
      this.ctx.globalAlpha = p.life * p.life;
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
      this.ctx.fillStyle = p.color;
      this.ctx.shadowBlur = 6 * p.life;
      this.ctx.shadowColor = p.color;
      this.ctx.fill();
      this.ctx.restore();
    }
  }

  destroy() {
    this.running = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    window.removeEventListener('resize', this._resize);
    this.stars = [];
    this.fireflies = [];
    this.ripples = [];
    this.burstFireflies = [];
    if (this.ctx && this.canvas) {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }
}

export const particleSystem = new ParticleSystem();
