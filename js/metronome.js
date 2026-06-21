/**
 * 节拍器模块 — Web Audio API
 * 支持：点击音、重音、拍号、视觉闪烁
 */

class Metronome {
  constructor() {
    this.audioCtx = null;
    this.timer = null;
    this.bpm = 120;
    this.beatsPerBar = 4;
    this.currentBeat = 0;     // 0-based within bar
    this.globalBeat = 0;      // total beats elapsed
    this.running = false;
    this.onBeat = null;       // 回调: (globalBeat, beatInBar, barNumber)
    this.volume = 0.7;
    this.accentVolume = 1.0;
    this.nextTime = 0;        // AudioContext timeline
  }

  /** 初始化 AudioContext（需用户交互后调用） */
  init() {
    if (!this.audioCtx) {
      this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  /** 生成点击音 */
  _clickSound(accent) {
    const ctx = this.audioCtx;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    // 重音：稍高频率+大声
    const freq = accent ? 1000 : 800;
    const vol = accent ? this.accentVolume : this.volume;

    osc.frequency.setValueAtTime(freq, now);
    osc.type = 'sine';

    // 短促的打击音
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    osc.start(now);
    osc.stop(now + 0.08);
  }

  /** 调度下一个拍子 */
  _scheduleBeat() {
    if (!this.running) return;

    const beatDuration = 60.0 / this.bpm;
    const ctx = this.audioCtx;

    // 当 nextTime 落后于当前时间，重新同步
    if (this.nextTime < ctx.currentTime) {
      this.nextTime = ctx.currentTime + 0.05;
    }

    // 提前调度 0.1s 的节拍
    while (this.nextTime < ctx.currentTime + 0.2) {
      const beatInBar = this.currentBeat % this.beatsPerBar;
      const barNumber = Math.floor(this.currentBeat / this.beatsPerBar);

      // 调度音频
      const isAccent = (beatInBar === 0);
      this._scheduleClick(this.nextTime, isAccent);

      // 回调
      const gb = this.globalBeat;
      const cb = this.currentBeat;
      const bn = barNumber;
      if (this.onBeat) {
        // 延迟到节拍时刻触发视觉更新
        const delay = (this.nextTime - ctx.currentTime) * 1000;
        setTimeout(() => this.onBeat(gb, cb, bn), Math.max(0, delay));
      }

      this.nextTime += beatDuration;
      this.currentBeat++;
      this.globalBeat++;
    }

    // 设置下一次检查（比一拍稍短）
    const checkInterval = (beatDuration * 1000) / 4;
    this.timer = setTimeout(() => this._scheduleBeat(), checkInterval);
  }

  /** 精确调度一次点击 */
  _scheduleClick(time, accent) {
    const ctx = this.audioCtx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.frequency.setValueAtTime(accent ? 1000 : 800, time);
    osc.type = 'sine';

    gain.gain.setValueAtTime(accent ? this.accentVolume : this.volume, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.08);

    osc.start(time);
    osc.stop(time + 0.08);
  }

  /** 开始 */
  start(bpm, beatsPerBar) {
    this.init();
    if (this.running) this.stop();

    this.bpm = bpm || this.bpm;
    this.beatsPerBar = beatsPerBar || this.beatsPerBar;
    this.currentBeat = 0;
    this.globalBeat = 0;
    this.running = true;
    this.nextTime = this.audioCtx.currentTime + 0.05;

    this._scheduleBeat();
  }

  /** 停止 */
  stop() {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  /** 重置 */
  reset() {
    this.stop();
    this.currentBeat = 0;
    this.globalBeat = 0;
  }

  /** 切换暂停/继续 */
  toggle() {
    if (this.running) {
      this.stop();
      return false;
    } else {
      this.start(this.bpm, this.beatsPerBar);
      return true;
    }
  }

  /** 设置速度 */
  setBpm(bpm) {
    this.bpm = Math.max(30, Math.min(300, bpm));
    if (this.running) {
      // 重启以应用新速度
      const savedGlobal = this.globalBeat;
      this.stop();
      this.globalBeat = savedGlobal;
      this.currentBeat = savedGlobal % this.beatsPerBar;
      this.start(this.bpm, this.beatsPerBar);
    }
  }

  /** 销毁 */
  destroy() {
    this.stop();
    if (this.audioCtx) {
      this.audioCtx.close();
      this.audioCtx = null;
    }
  }
}

if (typeof window !== 'undefined') window.Metronome = Metronome;
