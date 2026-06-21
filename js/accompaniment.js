/**
 * G调竹笛合成伴奏引擎 — Web Audio API
 * 鼓组 + 低音 + 和声铺垫，适配筒音作5
 */

class SynthAccompaniment {
  constructor() {
    this.ctx = null;
    this.running = false;
    this.tempo = 120;
    this.beatsPerBar = 4;
    this.currentBeat = 0;
    this.globalBeat = 0;
    this.totalBeats = 0;
    this.onBeat = null;
    this.nextTime = 0;
    this.timer = null;

    // 乐曲和声进行（每小节的根音，1=G调, 简谱数字）
    this.chordProg = null;
    this.songStyle = 'march'; // march | lyrical | folk
  }

  init() {
    if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  /** 打击乐：短促噪音模拟 */
  _kick(time) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(30, time + 0.12);
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.8, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.25);
    osc.start(time); osc.stop(time + 0.25);
  }

  _snare(time) {
    const ctx = this.ctx;
    const bufSize = ctx.sampleRate * 0.15;
    const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufSize, 3);
    }
    const src = ctx.createBufferSource();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    src.buffer = buf;
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(1000, time);
    src.connect(filter); filter.connect(gain); gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.5, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.15);
    src.start(time); src.stop(time + 0.15);
  }

  _hihat(time, accented) {
    const ctx = this.ctx;
    const bufSize = ctx.sampleRate * 0.05;
    const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufSize, 6);
    }
    const src = ctx.createBufferSource();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    src.buffer = buf;
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(3000, time);
    src.connect(filter); filter.connect(gain); gain.connect(ctx.destination);
    gain.gain.setValueAtTime(accented ? 0.3 : 0.15, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.04);
    src.start(time); src.stop(time + 0.04);
  }

  /** 低音：五声音阶根音 */
  _bass(time, rootNote, duration) {
    // 简谱数字 → G大调频率 (1=G4≈392Hz)
    const baseFreqs = {
      1: 392.0, 2: 440.0, 3: 493.9, 4: 523.3,
      5: 587.3, 6: 659.3, 7: 740.0
    };
    let freq = baseFreqs[rootNote] || 392;
    // 降八度
    freq = freq / 2;

    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    osc.connect(filter); filter.connect(gain); gain.connect(ctx.destination);

    osc.type = 'triangle';
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(freq * 2, time);
    osc.frequency.setValueAtTime(freq, time);

    const dur = duration || 0.5;
    gain.gain.setValueAtTime(0.35, time);
    gain.gain.setValueAtTime(0.35, time + dur * 0.7);
    gain.gain.linearRampToValueAtTime(0.001, time + dur);

    osc.start(time); osc.stop(time + dur);
  }

  /** 和声铺垫：轻柔的长音和弦 */
  _pad(time, rootNote, duration) {
    const baseFreqs = {
      1: 392.0, 2: 440.0, 3: 493.9, 4: 523.3,
      5: 587.3, 6: 659.3, 7: 740.0
    };
    let freq = baseFreqs[rootNote] || 392;

    const ctx = this.ctx;
    // 五度音程 + 八度，营造空灵感
    [freq, freq * 3 / 2, freq / 2].forEach(f => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, time);
      gain.gain.setValueAtTime(0.1, time);
      gain.gain.linearRampToValueAtTime(0.08, time + duration * 0.8);
      gain.gain.linearRampToValueAtTime(0.001, time + duration);
      osc.start(time); osc.stop(time + duration);
    });
  }

  /** 获取当前小节的根音 */
  _getChordRoot(barNumber) {
    if (!this.chordProg || this.chordProg.length === 0) {
      // 默认识别：三首曲目都偏羽调式，根音在6(羽)
      return 6;
    }
    return this.chordProg[barNumber % this.chordProg.length];
  }

  /** 设置曲风 */
  setStyle(style) { this.songStyle = style; }

  /** 设置和声进行 */
  setChordProg(prog) { this.chordProg = prog; }

  _schedule() {
    if (!this.running) return;
    const ctx = this.ctx;
    const beatDur = 60.0 / this.tempo;

    if (this.nextTime < ctx.currentTime) {
      this.nextTime = ctx.currentTime + 0.05;
    }

    while (this.nextTime < ctx.currentTime + 0.2) {
      const beatInBar = this.currentBeat % this.beatsPerBar;
      const barNum = Math.floor(this.currentBeat / this.beatsPerBar);
      const t = this.nextTime;

      // --- 鼓组 ---
      if (beatInBar === 0) {
        this._kick(t);              // 重拍：底鼓
        this._hihat(t, true);      // 开镲
        // 低音 + 铺垫
        const root = this._getChordRoot(barNum);
        this._bass(t, root, beatDur * 2);
        this._pad(t, root, beatDur * this.beatsPerBar);
      } else if (beatInBar === 2) {
        this._snare(t);             // 第3拍：军鼓
        this._hihat(t, false);
      } else {
        this._hihat(t, false);     // 踩镲
      }

      // 某些曲风加花
      if (this.songStyle === 'march' && beatInBar === 3) {
        this._snare(t + 0.001);    // 进行曲最后一拍加军鼓
      }

      if (this.onBeat) {
        const gb = this.globalBeat;
        const delay = Math.max(0, (t - ctx.currentTime) * 1000);
        setTimeout(() => this.onBeat(gb, beatInBar, barNum), delay);
      }

      this.nextTime += beatDur;
      this.currentBeat++;
      this.globalBeat++;

      if (this.globalBeat >= this.totalBeats) {
        this.stop();
        return;
      }
    }

    this.timer = setTimeout(() => this._schedule(), beatDur * 1000 / 4);
  }

  start(tempo, totalBeats, chordProg, style) {
    this.init();
    if (this.running) this.stop();

    this.tempo = tempo || 120;
    this.totalBeats = totalBeats || 999;
    if (chordProg) this.chordProg = chordProg;
    if (style) this.songStyle = style;
    this.currentBeat = 0;
    this.globalBeat = 0;
    this.running = true;
    this.nextTime = this.ctx.currentTime + 0.05;

    this._schedule();
  }

  stop() {
    this.running = false;
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
  }

  destroy() {
    this.stop();
    if (this.ctx) { this.ctx.close(); this.ctx = null; }
  }
}

if (typeof window !== 'undefined') window.SynthAccompaniment = SynthAccompaniment;

/** 曲目和声进行预设（根音 = 简谱数字，G调） */
window.SONG_CHORDS = {
  junma: [6, 6, 6, 6, 3, 3, 6, 6, 2, 2, 3, 3, 6, 6, 6, 6],     // 骏马：羽调式
  xiaoxiao: [1, 5, 6, 3, 2, 5, 1, 1, 6, 5, 3, 5, 1, 1, 6, 5, 3, 5, 1, 1],  // 小小竹排
  aobao: [6, 3, 6, 3, 6, 3, 6, 3, 6, 3, 6, 3, 6, 3, 6, 6],      // 敖包：蒙古羽调
};

window.SONG_STYLES = {
  junma: 'march',
  xiaoxiao: 'lyrical',
  aobao: 'folk',
};
