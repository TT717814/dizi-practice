/**
 * 伴奏播放器 + 光标跟踪
 * 支持：原声伴奏MP3 / Web Audio合成伴奏 / 节拍器联合
 */

class AccompanimentPlayer {
  constructor() {
    this.audio = null;         // HTML Audio 元素（原声伴奏）
    this.audioCtx = null;
    this.running = false;
    this.mode = 'metronome';   // 'metronome' | 'accompaniment' | 'both'
    this.tempo = 120;
    this.totalBeats = 0;
    this.currentGlobalBeat = 0;
    this.onBeatChange = null;  // 回调：曲谱光标更新
    this.onTimeUpdate = null;  // 回调：时间显示更新
    this.startTime = 0;        // performance.now() 起始时间

    // 节拍器集成
    this.metronome = null;

    // RAF loop
    this.rafId = null;
  }

  /** 初始化 */
  init(metronomeInstance) {
    this.metronome = metronomeInstance;
  }

  /** 加载原声伴奏 */
  loadAudio(url) {
    return new Promise((resolve, reject) => {
      if (this.audio) {
        this.audio.pause();
        this.audio.src = '';
      }
      this.audio = new Audio();
      this.audio.src = url;
      this.audio.preload = 'auto';
      this.audio.addEventListener('canplaythrough', () => resolve(true), { once: true });
      this.audio.addEventListener('error', (e) => {
        console.warn('伴奏文件不可用，使用节拍器模式:', url);
        resolve(false); // 降级到节拍器模式
      });
      this.audio.load();
    });
  }

  /** 开始播放 */
  start(options = {}) {
    const { tempo, totalBeats, mode } = options;
    this.tempo = tempo || this.tempo;
    this.totalBeats = totalBeats || this.totalBeats;
    this.mode = mode || 'metronome';
    this.currentGlobalBeat = 0;
    this.running = true;
    this.startTime = performance.now();

    // 启动节拍器（始终用于光标跟踪）
    if (this.metronome) {
      this.metronome.onBeat = (globalBeat, beatInBar, barNum) => {
        this.currentGlobalBeat = globalBeat;
        if (this.onBeatChange) {
          this.onBeatChange(globalBeat, beatInBar, barNum);
        }
        // 超过总拍数自动停止
        if (globalBeat >= this.totalBeats) {
          this.stop();
        }
      };
      this.metronome.start(this.tempo, 4);
    }

    // 如果有伴奏音频，也播放
    if (this.mode === 'accompaniment' && this.audio && this.audio.readyState >= 2) {
      this.audio.currentTime = 0;
      this.audio.play().catch(e => console.warn('音频播放失败:', e));
    }

    // 启动RAF循环（时间显示）
    this._tick();
  }

  /** 停止 */
  stop() {
    this.running = false;
    if (this.metronome) this.metronome.stop();
    if (this.audio) this.audio.pause();
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    // 触发最终状态
    if (this.onBeatChange) {
      this.onBeatChange(-1, 0, 0); // -1 表示停止
    }
  }

  /** 暂停/继续 */
  toggle() {
    if (this.running) {
      this.stop();
      return false;
    } else {
      this.start({ tempo: this.tempo, totalBeats: this.totalBeats, mode: this.mode });
      return true;
    }
  }

  /** 跳转到指定拍 */
  seekTo(globalBeat) {
    this.currentGlobalBeat = globalBeat;
    if (this.metronome) {
      this.metronome.stop();
      this.metronome.globalBeat = globalBeat;
      this.metronome.currentBeat = globalBeat % this.metronome.beatsPerBar;
    }
    if (this.audio && this.audio.readyState >= 2) {
      const beatDuration = 60.0 / this.tempo;
      this.audio.currentTime = globalBeat * beatDuration;
    }
    if (this.onBeatChange) {
      this.onBeatChange(globalBeat, globalBeat % 4, Math.floor(globalBeat / 4));
    }
  }

  /** RAF循环：更新时间显示 */
  _tick() {
    if (!this.running) return;

    const elapsed = (performance.now() - this.startTime) / 1000;
    const beatDuration = 60.0 / this.tempo;
    const estimatedBeat = Math.floor(elapsed / beatDuration);

    if (this.onTimeUpdate) {
      const mins = Math.floor(elapsed / 60);
      const secs = Math.floor(elapsed % 60);
      this.onTimeUpdate(elapsed, estimatedBeat, `${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`);
    }

    this.rafId = requestAnimationFrame(() => this._tick());
  }

  /** 设置伴奏模式 */
  setMode(mode) {
    this.mode = mode;
  }

  /** 销毁 */
  destroy() {
    this.stop();
    if (this.audio) {
      this.audio.pause();
      this.audio.src = '';
      this.audio = null;
    }
  }
}

if (typeof window !== 'undefined') window.AccompanimentPlayer = AccompanimentPlayer;
