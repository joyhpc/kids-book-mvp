import { bus } from 'core/bus.js';
import { store } from 'core/store.js';
import { interpolate } from 'utils/interpolate.js';

class SceneLoader {
  constructor() {
    this.stageEl = document.getElementById('stage');
    
    // 当场景数据变更时，重新渲染 DOM
    bus.on('store:currentSceneData', (data) => {
      if (data) this.render(data);
    });

    // 独立事件：需要切换对话
    bus.on('scene:switchDialogue', (dialogueId) => {
      this.switchDialogue(dialogueId);
    });
  }

  render(data) {
    if (!this.stageEl) return;
    const { scene, dialogues, ui } = data;

    // 清理旧内容 (由 PageTransition 清理过了，但确保一下安全)
    // 渲染背景
    if (scene.background.type === 'css_gradient') {
      this.stageEl.style.background = scene.background.value;
    } else if (scene.background.type === 'image') {
      this.stageEl.style.background = `url('${scene.background.src}') center/cover no-repeat`;
    } else if (scene.background.type === 'canvas') {
      if (scene.background.gradient) {
        this.stageEl.style.background = scene.background.gradient;
      }
    }

    // 渲染角色
    scene.characters.forEach(ch => {
      const el = this._createEntityDOM(ch, 'scene-character');
      if (ch.states && ch.initial_state) {
        const initState = ch.states[ch.initial_state];
        if (initState) {
          if (initState.filter) el.style.filter = initState.filter;
          // [架构理念] 20% 的微动态 + 80% 的精美静态：尽量使用极缓的光影与呼吸动画，或者仅根据环境给予极小的浮动。
          if (initState.animation && initState.animation !== 'none') el.classList.add('anim-' + initState.animation);
        }
        el.dataset.states = JSON.stringify(ch.states);
      }
      this.stageEl.appendChild(el);
    });

    // 渲染物品
    scene.items.forEach(item => {
      const el = this._createEntityDOM(item, 'scene-item');
      if (item.draggable) el.dataset.draggable = 'true';
      if (item.animation) el.classList.add('anim-' + item.animation);
      this.stageEl.appendChild(el);
    });

    // 渲染字幕
    if (dialogues && dialogues.intro) {
      this.renderSubtitle(dialogues.intro);
    }

    // 显示提示栏
    if (ui && ui.hint) {
      bus.emit('ui:showHint', ui.hint);
    }
  }

  // 统一的实体渲染器：支持 Emoji 魔法渲染与图片加载兜底
  _createEntityDOM(config, className) {
    const el = document.createElement('div');
    el.id = config.id;
    el.className = className;

    if (config.width) el.style.width = config.width;
    if (config.height) el.style.height = config.height;
    el.style.left = config.position.x;
    el.style.top = config.position.y;

    if (config.emoji) {
      const sprite = document.createElement('div');
      sprite.className = 'emoji-sprite';
      
      const span = document.createElement('span');
      span.textContent = config.emoji;
      
      // 让 Emoji 适配其磨砂水晶球容器大小：缩小到 55%，完美居中，显得像是封印在里面的神器
      const size = Math.min(parseInt(config.width || 100), parseInt(config.height || 100));
      span.style.fontSize = (size * 0.55) + 'px';
      
      sprite.appendChild(span);
      el.appendChild(sprite);
    } else if (config.img_src) {
      const img = document.createElement('img');
      img.src = config.img_src + '?v=' + Date.now(); // 强制突破浏览器图片缓存
      img.alt = config.label || '';
      img.draggable = false;
      // 引擎级防御：如果图片加载失败，绝不显示原生的破图图标，替换为容错组件
      img.onerror = () => {
        const fallback = document.createElement('div');
        fallback.className = 'fallback-sprite';
        fallback.textContent = config.label || config.id;
        img.replaceWith(fallback);
      };
      el.appendChild(img);
    }

    return el;
  }

  renderSubtitle(dialogue) {
    const panel = document.getElementById('subtitle-panel');
    if (!panel || !dialogue) return;
    
    // [Tale-js 微 DSL] 变量插值：对 dialogue 文本做 {{var}} 替换
    const vars = store.variables || {};
    const textOriginal = interpolate(dialogue.text_original || '', vars);
    const textEn = interpolate(dialogue.text_en || '', vars);
    const textZh = interpolate(dialogue.text_zh || '', vars);
    
    // 通知音频模块停止上一次播放
    bus.emit('audio:stop');
    
    panel.innerHTML = '';

    // 原文
    if (textOriginal) {
      const originalLine = document.createElement('div');
      originalLine.className = 'subtitle-original';
      originalLine.textContent = textOriginal;
      panel.appendChild(originalLine);
    }

    // 英文卡拉OK区
    if (!textOriginal) {
      const wordContainer = document.createElement('div');
      wordContainer.id = 'subtitle-words';
      wordContainer.style.display = 'flex';
      wordContainer.style.flexWrap = 'wrap';
      wordContainer.style.justifyContent = 'center';
      wordContainer.style.gap = '0.35em';
      wordContainer.style.width = '100%';

      if (dialogue.words && dialogue.words.length > 0) {
        dialogue.words.forEach((w, i) => {
          const span = document.createElement('span');
          span.className = 'word-span';
          span.textContent = interpolate(w.word, vars);
          span.dataset.index = i;
          span.dataset.start = w.start_time;
          span.dataset.end = w.end_time;
          wordContainer.appendChild(span);
        });
        panel.appendChild(wordContainer);
      } else if (textEn) {
        const fallback = document.createElement('div');
        fallback.className = 'subtitle-original';
        fallback.textContent = textEn;
        panel.appendChild(fallback);
      }
    }

    // 中文翻译
    if (textZh) {
      const zhLine = document.createElement('div');
      zhLine.id = 'subtitle-zh';
      zhLine.textContent = textZh;
      panel.appendChild(zhLine);
    }

    // 配置音频按钮并自动播放（传入插值后的文案，供 TTS 朗读）
    bus.emit('audio:setupSubtitle', { ...dialogue, text_zh: textZh, text_en: textEn, text_original: textOriginal });
  }

  switchDialogue(dialogueId) {
    const data = store.currentSceneData;
    if (!data || !data.dialogues) return;
    const dlg = data.dialogues[dialogueId];
    if (dlg) this.renderSubtitle(dlg);
  }
}

export const sceneLoader = new SceneLoader();
