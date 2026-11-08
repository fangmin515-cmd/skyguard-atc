// SkyGuard ATC — 2.4GHz / 5.8GHz 实时射频 FFT 频谱与瀑布图渲染器 (Canvas 2D)
export class SpectrumWaterfallView {
  constructor(fftCanvasId, waterfallCanvasId) {
    this.fftCanvas = document.getElementById(fftCanvasId);
    this.wfCanvas = document.getElementById(waterfallCanvasId);
    this.band = "58g"; // "58g" | "24g"
    this.history = [];
    this.maxRows = 56;
  }

  setBand(band) {
    if (this.band !== band) {
      this.band = band;
      this.history = [];
    }
  }

  _dbmToColor(dbm) {
    // 归一化 -100 dBm ~ -45 dBm -> 航空深灰热力色谱 (Dark Slate -> Steel Blue -> Emerald -> Amber -> Crimson)
    const norm = Math.max(0, Math.min(1, (dbm + 100) / 55));
    if (norm < 0.25) {
      const k = norm / 0.25;
      return `rgb(${Math.round(16 + 14 * k)}, ${Math.round(22 + 32 * k)}, ${Math.round(32 + 58 * k)})`;
    } else if (norm < 0.55) {
      const k = (norm - 0.25) / 0.3;
      return `rgb(${Math.round(30 - 10 * k)}, ${Math.round(54 + 125 * k)}, ${Math.round(90 + 45 * k)})`;
    } else if (norm < 0.8) {
      const k = (norm - 0.55) / 0.25;
      return `rgb(${Math.round(20 + 225 * k)}, ${Math.round(179 - 20 * k)}, ${Math.round(135 - 120 * k)})`;
    } else {
      const k = (norm - 0.8) / 0.2;
      return `rgb(${Math.round(245 - 6 * k)}, ${Math.round(159 - 91 * k)}, ${Math.round(15 + 53 * k)})`;
    }
  }

  render(spectrumData) {
    if (!this.fftCanvas || !this.wfCanvas || !spectrumData) return;

    const bins = this.band === "58g" ? spectrumData.band_58g : spectrumData.band_24g;
    if (!bins || !bins.length) return;

    this.history.unshift([...bins]);
    if (this.history.length > this.maxRows) {
      this.history.pop();
    }

    this._drawFFT(bins);
    this._drawWaterfall(bins.length);
  }

  _drawFFT(bins) {
    const canvas = this.fftCanvas;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    if (rect.width < 10) return;
    if (canvas.width !== Math.floor(rect.width * dpr) || canvas.height !== Math.floor(rect.height * dpr)) {
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
    }

    const ctx = canvas.getContext("2d");
    ctx.save();
    ctx.scale(dpr, dpr);
    const w = rect.width;
    const h = rect.height;

    ctx.fillStyle = "#0d1118";
    ctx.fillRect(0, 0, w, h);

    // 绘制 dBm 标尺参考网格 (-50, -70, -90 dBm)
    ctx.strokeStyle = "rgba(148, 163, 184, 0.12)";
    ctx.lineWidth = 1;
    ctx.font = "10px 'SF Mono', Menlo, monospace";
    ctx.fillStyle = "#64748b";
    [-50, -70, -90].forEach((lvl) => {
      const y = h - ((lvl + 102) / 60) * (h - 14) - 10;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
      ctx.fillText(`${lvl}`, 4, y - 2);
    });

    // 告警门限虚线 (-62 dBm)
    const thY = h - ((-62 + 102) / 60) * (h - 14) - 10;
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = "rgba(245, 158, 11, 0.55)";
    ctx.beginPath();
    ctx.moveTo(0, thY);
    ctx.lineTo(w, thY);
    ctx.stroke();
    ctx.restore();

    // 绘制实时 FFT 折线与渐变填充
    ctx.beginPath();
    bins.forEach((val, i) => {
      const x = (i / (bins.length - 1)) * w;
      const y = h - Math.max(0, Math.min(1, (val + 102) / 60)) * (h - 14) - 10;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });

    ctx.strokeStyle = "#38bdf8";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.lineTo(w, h - 10);
    ctx.lineTo(0, h - 10);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, "rgba(239, 68, 68, 0.32)");
    grad.addColorStop(0.45, "rgba(56, 189, 248, 0.22)");
    grad.addColorStop(1, "rgba(15, 23, 42, 0.02)");
    ctx.fillStyle = grad;
    ctx.fill();

    // 底部频率刻度
    ctx.fillStyle = "#64748b";
    const labels =
      this.band === "58g"
        ? ["5725", "5760", "5790", "5820", "5850 MHz"]
        : ["2400", "2420", "2442", "2462", "2483 MHz"];
    labels.forEach((txt, idx) => {
      const lx = (idx / (labels.length - 1)) * (w - 42) + 4;
      ctx.fillText(txt, lx, h - 1);
    });

    ctx.restore();
  }

  _drawWaterfall(numBins) {
    const canvas = this.wfCanvas;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    if (rect.width < 10) return;
    if (canvas.width !== Math.floor(rect.width * dpr) || canvas.height !== Math.floor(rect.height * dpr)) {
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
    }

    const ctx = canvas.getContext("2d");
    ctx.save();
    ctx.scale(dpr, dpr);
    const w = rect.width;
    const h = rect.height;

    ctx.fillStyle = "#0a0d13";
    ctx.fillRect(0, 0, w, h);

    const rowH = h / this.maxRows;
    const colW = w / numBins;

    for (let r = 0; r < this.history.length; r++) {
      const row = this.history[r];
      const y = r * rowH;
      for (let c = 0; c < row.length; c++) {
        ctx.fillStyle = this._dbmToColor(row[c]);
        ctx.fillRect(c * colW, y, Math.ceil(colW), Math.ceil(rowH));
      }
    }
    ctx.restore();
  }
}
