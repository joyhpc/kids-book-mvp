import { bus } from 'core/bus.js';

class AudioSyncEngine {
  constructor() {
    this.playing = false;
    this.startTs = 0;
    this.words = [];
    this.rafId = null;
    this.audio = null;

    this._tick = this._tick.bind(this);

    bus.on('audio:setupSubtitle', (dialogue) => this.setupSubtitle(dialogue));
    bus.on('audio:stop', () => this.stop());
  }

  setupSubtitle(dialogue) {
    const audioBtn = document.getElementById('audio-btn');
    const hasText = !!(dialogue.text_original || dialogue.text_en || dialogue.text_zh);

    if (audioBtn && hasText) {
      audioBtn.classList.remove('hidden');
      audioBtn.textContent = '🔊';
      audioBtn.title = '播放朗读';

      audioBtn.onclick = () => {
        if (dialogue.audio) {
          if (this.playing) {
            this.stop();
            audioBtn.textContent = '🔊';
            audioBtn.classList.remove('playing');
          } else {
            this.play(dialogue);
            audioBtn.textContent = '⏸';
            audioBtn.classList.add('playing');
          }
        } else {
          if (window.speechSynthesis && window.speechSynthesis.speaking) {
            window.speechSynthesis.cancel();
            audioBtn.textContent = '🔊';
            audioBtn.classList.remove('playing');
          } else {
            this.playBrowserTTS(dialogue, audioBtn);
          }
        }
      };

      bus.on('audio:ended', () => {
        if (audioBtn) {
          audioBtn.textContent = '🔊';
          audioBtn.classList.remove('playing');
        }
      });
    } else if (audioBtn) {
      audioBtn.classList.add('hidden');
      audioBtn.onclick = null;
    }

    if (dialogue.auto_play) {
      if (dialogue.audio) {
        setTimeout(() => {
          this.play(dialogue);
          if (audioBtn) { audioBtn.textContent = '⏸'; audioBtn.classList.add('playing'); }
        }, 600);
      } else if (dialogue.words && dialogue.words.length > 0) {
        setTimeout(() => this.play(dialogue), 600);
      } else if (hasText) {
        setTimeout(() => this.playBrowserTTS(dialogue, audioBtn), 600);
      }
    }
  }

  playBrowserTTS(dialogue, btn) {
    const text = dialogue.text_zh || dialogue.text_original || dialogue.text_en || '';
    if (!text || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    
    const u = new SpeechSynthesisUtterance(text);
    u.lang = dialogue.text_zh ? 'zh-CN' : (dialogue.text_original ? 'fr-FR' : 'en-US');
    u.rate = 0.9;
    
    if (btn) { btn.textContent = '⏸'; btn.classList.add('playing'); }
    
    u.onend = u.onerror = () => { 
      if (btn) { btn.textContent = '🔊'; btn.classList.remove('playing'); } 
      bus.emit('audio:ended');
    };
    
    window.speechSynthesis.speak(u);
  }

  play(dialogue) {
    if (this.playing) this.stop();

    this.words = dialogue.words || [];
    this.playing = true;

    if (dialogue.audio) {
      this.audio = new Audio(dialogue.audio);
      this.audio.onended = () => {
        this.playing = false;
        if (this.rafId) { cancelAnimationFrame(this.rafId); this.rafId = null; }
        this.audio = null;
        bus.emit('audio:ended');
      };
      this.audio.play().then(() => {
        this.startTs = performance.now();
        if (this.words.length > 0) this.rafId = requestAnimationFrame(this._tick);
      }).catch(() => {
        this.startTs = performance.now();
        if (this.words.length > 0) this.rafId = requestAnimationFrame(this._tick);
      });
    } else if (this.words.length > 0) {
      this.startTs = performance.now();
      this.rafId = requestAnimationFrame(this._tick);
    } else {
      this.playing = false;
    }
  }

  _tick(now) {
    if (!this.playing) return;

    const elapsed = this.audio
      ? this.audio.currentTime
      : (now - this.startTs) / 1000;
    const spans = document.querySelectorAll('#subtitle-words .word-span');

    let allDone = true;

    spans.forEach((span) => {
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
      this.playing = false;
      bus.emit('audio:ended');
      return;
    }

    this.rafId = requestAnimationFrame(this._tick);
  }

  stop() {
    this.playing = false;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.audio) {
      this.audio.pause();
      // Safari 巨坑：彻底切断底层解码缓冲区内存
      this.audio.src = '';
      this.audio.load();
      this.audio = null;
    }
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  }
}

export const audioEngine = new AudioSyncEngine();
