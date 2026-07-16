// Minimal dependency-free canvas line-chart renderer (no external libraries,
// so the app works fully offline). One chart instance per container; call
// .setSeries() to update data, it redraws itself and on container resize.

const PALETTE = [
  "#4f7cff", "#ff8a3d", "#2fbf71", "#e14b7a",
  "#9b6bff", "#17b6c9", "#e0b93a", "#6b7280",
];

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function niceStep(rawStep) {
  if (rawStep <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const norm = rawStep / magnitude;
  let niceNorm;
  if (norm <= 1) niceNorm = 1;
  else if (norm <= 2) niceNorm = 2;
  else if (norm <= 5) niceNorm = 5;
  else niceNorm = 10;
  return niceNorm * magnitude;
}

export class LineChart {
  constructor(container, opts = {}) {
    this.container = container;
    this.formatY = opts.formatY || ((v) => String(Math.round(v)));
    this.formatX = opts.formatX || ((t) => new Date(t).toLocaleDateString());
    this.emptyMessage = opts.emptyMessage || "Пока нет данных";
    this.series = [];
    this.hidden = new Set();
    this._hoverPixelX = null;

    this.wrap = document.createElement("div");
    this.wrap.className = "chart-wrap";
    this.canvas = document.createElement("canvas");
    this.canvas.className = "chart-canvas";
    this.legend = document.createElement("div");
    this.legend.className = "chart-legend";
    this.wrap.appendChild(this.canvas);
    this.wrap.appendChild(this.legend);
    this.container.innerHTML = "";
    this.container.appendChild(this.wrap);

    this.ctx = this.canvas.getContext("2d");
    this._resizeObserver = new ResizeObserver(() => this.draw());
    this._resizeObserver.observe(this.wrap);

    const setHover = (x) => {
      this._hoverPixelX = x;
      this.draw();
    };
    const clearHover = () => setHover(null);
    this.canvas.addEventListener("mousemove", (e) => setHover(e.offsetX));
    this.canvas.addEventListener("mouseleave", clearHover);
    const setHoverFromTouch = (e) => {
      const rect = this.canvas.getBoundingClientRect();
      setHover(e.touches[0].clientX - rect.left);
    };
    this.canvas.addEventListener("touchstart", setHoverFromTouch, { passive: true });
    this.canvas.addEventListener("touchmove", setHoverFromTouch, { passive: true });
    this.canvas.addEventListener("touchend", clearHover);
  }

  setSeries(series) {
    this.series = series.map((s, i) => ({
      color: PALETTE[i % PALETTE.length],
      ...s,
    }));
    this.hidden.clear();
    // Charts are often built while their container is still detached from the
    // document (assembled off-DOM, then attached in one go), so clientWidth
    // would read 0 if we drew synchronously here. Deferring lets layout catch
    // up; ResizeObserver takes over for real resizes after that. setTimeout
    // (rather than requestAnimationFrame) so this still runs in background /
    // non-visible tabs, which never get a paint tick.
    setTimeout(() => this.draw(), 0);
  }

  destroy() {
    this._resizeObserver.disconnect();
  }

  _visibleSeries() {
    return this.series.filter((s) => !this.hidden.has(s.id));
  }

  draw() {
    const ctx = this.ctx;
    const cssWidth = Math.max(this.wrap.clientWidth, 280);
    const cssHeight = 260;
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = cssWidth * dpr;
    this.canvas.height = cssHeight * dpr;
    this.canvas.style.width = cssWidth + "px";
    this.canvas.style.height = cssHeight + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssWidth, cssHeight);

    this._renderLegend();

    const visible = this._visibleSeries().filter((s) => s.points && s.points.length);
    const styles = getComputedStyle(document.documentElement);
    const gridColor = styles.getPropertyValue("--chart-grid").trim() || "#e5e7eb";
    const textColor = styles.getPropertyValue("--chart-text").trim() || "#6b7280";

    if (!visible.length) {
      ctx.fillStyle = textColor;
      ctx.font = "14px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(this.emptyMessage, cssWidth / 2, cssHeight / 2);
      return;
    }

    const padding = { top: 16, right: 20, bottom: 28, left: 64 };
    const plotW = cssWidth - padding.left - padding.right;
    const plotH = cssHeight - padding.top - padding.bottom;

    let allPoints = visible.flatMap((s) => s.points);
    let minX = Math.min(...allPoints.map((p) => p.x));
    let maxX = Math.max(...allPoints.map((p) => p.x));
    let minY = Math.min(0, ...allPoints.map((p) => p.y));
    let maxY = Math.max(...allPoints.map((p) => p.y));
    if (minX === maxX) { minX -= 86400000; maxX += 86400000; }
    if (minY === maxY) { maxY = minY + 1; }

    const yStep = niceStep((maxY - minY) / 4);
    const niceMinY = Math.floor(minY / yStep) * yStep;
    const niceMaxY = Math.ceil(maxY / yStep) * yStep;

    const xToPx = (x) => padding.left + ((x - minX) / (maxX - minX)) * plotW;
    const yToPx = (y) => padding.top + plotH - ((y - niceMinY) / (niceMaxY - niceMinY)) * plotH;

    // gridlines + y labels
    ctx.strokeStyle = gridColor;
    ctx.fillStyle = textColor;
    ctx.font = "11px system-ui, sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    const rows = Math.round((niceMaxY - niceMinY) / yStep);
    for (let i = 0; i <= rows; i++) {
      const y = niceMinY + i * yStep;
      const py = yToPx(y);
      ctx.beginPath();
      ctx.moveTo(padding.left, py);
      ctx.lineTo(cssWidth - padding.right, py);
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillText(this.formatY(y), padding.left - 8, py);
    }

    // x labels (up to 5, evenly spaced)
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    const xTickCount = Math.min(5, allPoints.length);
    for (let i = 0; i < xTickCount; i++) {
      const t = minX + ((maxX - minX) * i) / Math.max(xTickCount - 1, 1);
      ctx.fillText(this.formatX(t), xToPx(t), cssHeight - padding.bottom + 8);
    }

    // series lines + points
    for (const s of visible) {
      const pts = [...s.points].sort((a, b) => a.x - b.x);
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      pts.forEach((p, i) => {
        const px = xToPx(p.x);
        const py = yToPx(p.y);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();

      ctx.fillStyle = s.color;
      for (const p of pts) {
        ctx.beginPath();
        ctx.arc(xToPx(p.x), yToPx(p.y), pts.length === 1 ? 3.5 : 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // hover: vertical guide + tooltip with each series' value at that point
    if (this._hoverPixelX !== null && this._hoverPixelX >= padding.left && this._hoverPixelX <= cssWidth - padding.right) {
      const hoverX = minX + ((this._hoverPixelX - padding.left) / plotW) * (maxX - minX);

      ctx.save();
      ctx.strokeStyle = gridColor;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(this._hoverPixelX, padding.top);
      ctx.lineTo(this._hoverPixelX, padding.top + plotH);
      ctx.stroke();
      ctx.restore();

      const rows = [];
      for (const s of visible) {
        let nearest = s.points[0];
        let bestDist = Infinity;
        for (const p of s.points) {
          const d = Math.abs(p.x - hoverX);
          if (d < bestDist) {
            bestDist = d;
            nearest = p;
          }
        }
        rows.push({ label: s.label, color: s.color, value: nearest.y, x: nearest.x });
        ctx.fillStyle = s.color;
        ctx.beginPath();
        ctx.arc(xToPx(nearest.x), yToPx(nearest.y), 4.5, 0, Math.PI * 2);
        ctx.fill();
      }

      const surfaceColor = styles.getPropertyValue("--surface").trim() || "#ffffff";
      const dateLabel = this.formatX(rows[0] ? rows[0].x : hoverX);
      const lines = [{ text: dateLabel, color: textColor }, ...rows.map((r) => ({ text: `${r.label}: ${this.formatY(r.value)}`, color: r.color }))];

      ctx.font = "12px system-ui, sans-serif";
      const lineHeight = 16;
      const boxWidth = Math.max(...lines.map((l) => ctx.measureText(l.text).width)) + 20;
      const boxHeight = lines.length * lineHeight + 10;
      let boxX = this._hoverPixelX + 10;
      if (boxX + boxWidth > cssWidth - padding.right) boxX = this._hoverPixelX - boxWidth - 10;
      const boxY = padding.top + 4;

      ctx.fillStyle = surfaceColor;
      ctx.strokeStyle = gridColor;
      ctx.lineWidth = 1;
      roundRect(ctx, boxX, boxY, boxWidth, boxHeight, 6);
      ctx.fill();
      ctx.stroke();

      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      lines.forEach((line, i) => {
        ctx.fillStyle = line.color;
        ctx.fillText(line.text, boxX + 10, boxY + 5 + i * lineHeight);
      });
    }
  }

  _renderLegend() {
    this.legend.innerHTML = "";
    if (this.series.length <= 1) return;
    for (const s of this.series) {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "chart-legend-item" + (this.hidden.has(s.id) ? " is-hidden" : "");
      item.innerHTML = `<span class="chart-legend-swatch" style="background:${s.color}"></span>${s.label}`;
      item.addEventListener("click", () => {
        if (this.hidden.has(s.id)) this.hidden.delete(s.id);
        else this.hidden.add(s.id);
        this.draw();
      });
      this.legend.appendChild(item);
    }
  }
}
