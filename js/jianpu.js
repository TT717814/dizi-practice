/**
 * 简谱渲染引擎 v1.0
 * G调竹笛·筒音作5·动态缩放·光标跟踪
 */

class JianpuRenderer {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.scale = 1.0;
    this.currentBeat = -1;  // 当前播放到的拍子（全局拍号）
    this.beatPositions = []; // 每拍的DOM位置
    this.allBeats = [];      // 所有拍的元素引用
  }

  /** 解析音符为渲染数据 */
  parseNote(n) {
    if (!n || n === '') return { type:'empty' };
    if (n === '0') return { type:'rest' };
    if (n === '-') return { type:'hold' };
    let text = n;
    let hi = false, lo = false;
    if (text.endsWith('·')) { hi = true; text = text.slice(0,-1); }
    if (text.endsWith('..')) { lo = true; text = text.slice(0,-2); }
    if (/^\d$/.test(text)) return { type:'note', value:text, hi, lo };
    return { type:'raw', value:n };
  }

  /** 解析一拍（可能是多音） */
  renderBeat(beat, beatIdx, globalBeatIdx) {
    const div = document.createElement('span');
    div.className = 'jp-beat';
    div.dataset.beat = globalBeatIdx;

    if (!beat || beat.length === 0 || (beat.length === 1 && beat[0] === '')) {
      div.innerHTML = '<span class="jp-empty"></span>';
      return div;
    }

    const isMulti = beat.length > 1;
    const wrapper = document.createElement('span');
    wrapper.className = isMulti ? 'jp-sub ul' : 'jp-one';

    beat.forEach(n => {
      const parsed = this.parseNote(n);
      if (parsed.type === 'hold') {
        const s = document.createElement('span');
        s.className = 'jp-hold'; s.textContent = '—';
        wrapper.appendChild(s);
      } else if (parsed.type === 'rest') {
        const s = document.createElement('span');
        s.className = 'jp-note rest'; s.textContent = '0';
        wrapper.appendChild(s);
      } else if (parsed.type === 'note') {
        const s = document.createElement('span');
        s.className = 'jp-note';
        if (parsed.hi) s.classList.add('hi');
        if (parsed.lo) s.classList.add('lo');
        s.textContent = parsed.value;
        wrapper.appendChild(s);
      } else if (parsed.type === 'raw') {
        const s = document.createElement('span');
        s.className = 'jp-note'; s.textContent = parsed.value;
        wrapper.appendChild(s);
      } else {
        const s = document.createElement('span');
        s.className = 'jp-empty'; wrapper.appendChild(s);
      }
    });

    div.appendChild(wrapper);
    return div;
  }

  /** 渲染完整曲谱 */
  render(song) {
    this.container.innerHTML = '';
    this.beatPositions = [];
    this.allBeats = [];
    let globalBeat = 0;

    song.sections.forEach((sec, si) => {
      // 段落标签
      if (sec.label) {
        const label = document.createElement('div');
        label.className = 'jp-section';
        label.textContent = '【' + sec.label + '】';
        this.container.appendChild(label);
      }

      const beatsPerBar = song.timeSig[0];
      const barCount = sec.bars.length;

      for (let bi = 0; bi < barCount; bi += 2) {
        const sys = document.createElement('div');
        sys.className = 'jp-sys';
        if (bi === barCount - 1 || bi === barCount - 2) sys.classList.add('end');

        // 渲染1-2个小节
        for (let bo = 0; bo < 2 && (bi + bo) < barCount; bo++) {
          const barIdx = bi + bo;
          const bar = document.createElement('div');
          bar.className = 'jp-bar';

          const beats = sec.bars[barIdx];
          const actualBeats = Math.max(beatsPerBar, beats.length);
          for (let t = 0; t < actualBeats; t++) {
            const beatData = t < beats.length ? beats[t] : [];
            const beatEl = this.renderBeat(beatData, t, globalBeat);
            bar.appendChild(beatEl);
            this.allBeats.push({ el: beatEl, global: globalBeat, bar: barIdx, tick: t });
            globalBeat++;
          }

          sys.appendChild(bar);
          if (bo === 0 && bi + 1 < barCount) {
            const bl = document.createElement('span');
            bl.className = 'jp-bl';
            sys.appendChild(bl);
          }
        }

        this.container.appendChild(sys);

        // 歌词行
        if (sec.lyrics && sec.lyrics[bi]) {
          const lr = document.createElement('div');
          lr.className = 'jp-lr';
          if (bi >= barCount - 2) lr.classList.add('end');
          for (let bo = 0; bo < 2 && (bi + bo) < barCount; bo++) {
            const lyricsForBar = sec.lyrics[bi + bo] || [];
            const barBeats = sec.bars[bi + bo] || [];
            const actualBeats2 = Math.max(beatsPerBar, barBeats.length, lyricsForBar.length);
            for (let t = 0; t < actualBeats2; t++) {
              const lb = document.createElement('span');
              lb.className = 'jp-lb';
              lb.textContent = lyricsForBar[t] || '';
              lr.appendChild(lb);
            }
            if (bo === 0 && bi + 1 < barCount) {
              const spacer = document.createElement('span');
              spacer.style.width = '1px'; spacer.style.flexShrink = '0';
              lr.appendChild(spacer);
            }
          }
          this.container.appendChild(lr);
        }
      }
    });

    // 记录所有拍子的屏幕位置
    this.updateBeatPositions();
  }

  /** 更新拍子位置缓存 */
  updateBeatPositions() {
    this.beatPositions = [];
    this.allBeats.forEach(b => {
      const rect = b.el.getBoundingClientRect();
      const containerRect = this.container.getBoundingClientRect();
      this.beatPositions.push({
        global: b.global,
        bar: b.bar,
        tick: b.tick,
        left: rect.left - containerRect.left + rect.width / 2,
        top: rect.top - containerRect.top,
        el: b.el
      });
    });
  }

  /** 设置缩放 */
  setScale(s) {
    this.scale = Math.max(0.5, Math.min(2.0, s));
    this.container.style.transform = `scale(${this.scale})`;
    this.container.style.transformOrigin = 'top center';
    setTimeout(() => this.updateBeatPositions(), 100);
  }

  /** 高亮当前拍 */
  highlightBeat(globalBeat) {
    // 清除之前的高亮
    this.allBeats.forEach(b => b.el.classList.remove('active'));
    this.currentBeat = globalBeat;

    const found = this.allBeats.find(b => b.global === globalBeat);
    if (found) {
      found.el.classList.add('active');
      // 自动滚动到可见区域（如果需要的话可以由外部控制）
    }
  }

  /** 滚动到指定拍 */
  scrollToBeat(globalBeat) {
    const found = this.allBeats.find(b => b.global === globalBeat);
    if (found) {
      found.el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    }
  }

  /** 获取总拍数 */
  getTotalBeats(song) {
    let total = 0;
    song.sections.forEach(sec => {
      sec.bars.forEach(bar => {
        total += song.timeSig[0];
      });
    });
    return total;
  }

  /** 获取指定全局拍的bar和tick */
  getBeatInfo(song, globalBeat) {
    let gb = 0;
    for (let si = 0; si < song.sections.length; si++) {
      for (let bi = 0; bi < song.sections[si].bars.length; bi++) {
        for (let t = 0; t < song.timeSig[0]; t++) {
          if (gb === globalBeat) {
            return { section: si, bar: bi, tick: t, sectionLabel: song.sections[si].label };
          }
          gb++;
        }
      }
    }
    return null;
  }
}

if (typeof window !== 'undefined') window.JianpuRenderer = JianpuRenderer;
