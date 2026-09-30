/*
 * SOL 500 — small SVG line charts for the debrief.
 * One y-axis per chart, 2 px lines, legend + direct end labels, crosshair tooltip, and a data table for screen readers.
 * config: { title, unit, series: [{ name, color, points: [[x, y], ...] }], refLines: [{ y, label }], xLabel, fmt }
 */
(function (root) {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const W = 640, H = 230, M = { l: 48, r: 104, t: 14, b: 30 };

  function el(tag, attrs, parent) {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }

  function niceMax(v) {
    if (v <= 0) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p;
    return 10 * p;
  }

  function lineChart(container, cfg) {
    const fmt = cfg.fmt || (v => Math.round(v).toLocaleString());
    const series = cfg.series.filter(s => s.points.length);
    const xs = series.flatMap(s => s.points.map(p => p[0]));
    const xMin = 0, xMax = Math.max(500, ...xs);
    const yMaxData = Math.max(1, ...series.flatMap(s => s.points.map(p => p[1])), ...(cfg.refLines || []).map(r => r.y));
    const yMax = niceMax(yMaxData * 1.05);
    const X = x => M.l + (x - xMin) / (xMax - xMin) * (W - M.l - M.r);
    const Y = y => H - M.b - (y / yMax) * (H - M.t - M.b);

    const wrap = document.createElement('div');
    wrap.className = 'chart';
    if (series.length > 1) {
      const lg = document.createElement('div');
      lg.className = 'chart-legend';
      for (const s of series) {
        const item = document.createElement('span');
        const sw = document.createElement('i');
        sw.style.background = s.color;
        item.appendChild(sw);
        item.appendChild(document.createTextNode(s.name));
        lg.appendChild(item);
      }
      wrap.appendChild(lg);
    }

    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': cfg.title || '' });
    el('title', {}, svg).textContent = cfg.title || '';

    // grid + y axis
    const ticks = 4;
    for (let i = 0; i <= ticks; i++) {
      const v = (yMax / ticks) * i;
      const y = Y(v);
      el('line', { x1: M.l, x2: W - M.r, y1: y, y2: y, stroke: 'var(--line)', 'stroke-width': i === 0 ? 1.2 : 0.8 }, svg);
      const t = el('text', { x: M.l - 8, y: y + 4, 'text-anchor': 'end', fill: 'var(--fg-3)', 'font-size': 11, 'font-family': 'var(--font-data)' }, svg);
      t.textContent = fmt(v);
    }
    for (let x = 0; x <= xMax; x += 100) {
      const t = el('text', { x: X(x), y: H - M.b + 18, 'text-anchor': 'middle', fill: 'var(--fg-3)', 'font-size': 11, 'font-family': 'var(--font-data)' }, svg);
      t.textContent = String(x);
    }
    if (cfg.xLabel) {
      const t = el('text', { x: W - M.r, y: H - 2, 'text-anchor': 'end', fill: 'var(--fg-3)', 'font-size': 11 }, svg);
      t.textContent = cfg.xLabel;
    }

    // reference lines (e.g. dose budget)
    for (const r of cfg.refLines || []) {
      const y = Y(r.y);
      el('line', { x1: M.l, x2: W - M.r, y1: y, y2: y, stroke: 'var(--fg-2)', 'stroke-width': 1.2, 'stroke-dasharray': '5 4' }, svg);
      // Label sits inside the plot, above the line on the left, so it never meets the series end labels.
      const t = el('text', { x: M.l + 6, y: y - 6, fill: 'var(--fg-2)', 'font-size': 11 }, svg);
      t.textContent = r.label;
    }

    // lines
    for (const s of series) {
      const d = s.points.map((p, i) => (i ? 'L' : 'M') + X(p[0]).toFixed(1) + ' ' + Y(p[1]).toFixed(1)).join(' ');
      el('path', { d, fill: 'none', stroke: s.color, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, svg);
    }

    // direct labels at line ends, nudged apart
    const ends = series.map(s => {
      const p = s.points[s.points.length - 1];
      return { s, x: X(p[0]), y: Y(p[1]) };
    }).sort((a, b) => a.y - b.y);
    for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 13) ends[i].y = ends[i - 1].y + 13;
    for (const e of ends) {
      const last = e.s.points[e.s.points.length - 1];
      el('circle', { cx: X(last[0]), cy: Y(last[1]), r: 3.5, fill: e.s.color, stroke: 'var(--panel)', 'stroke-width': 2 }, svg);
      if (series.length <= 5) {
        const t = el('text', { x: W - M.r + 8, y: e.y + 4, fill: 'var(--fg-2)', 'font-size': 11 }, svg);
        t.textContent = e.s.name;
      }
    }

    // hover layer
    const cross = el('line', { y1: M.t, y2: H - M.b, stroke: 'var(--fg-3)', 'stroke-width': 1, visibility: 'hidden' }, svg);
    const dots = series.map(s => el('circle', { r: 4, fill: s.color, stroke: 'var(--panel)', 'stroke-width': 2, visibility: 'hidden' }, svg));
    const hit = el('rect', { x: M.l, y: M.t, width: W - M.l - M.r, height: H - M.t - M.b, fill: 'transparent' }, svg);
    const tip = document.createElement('div');
    tip.className = 'tip';
    tip.hidden = true;
    const allX = [...new Set(xs)].sort((a, b) => a - b);

    function show(evt) {
      const box = svg.getBoundingClientRect();
      const vx = ((evt.clientX - box.left) / box.width) * W;
      const sol = xMin + ((vx - M.l) / (W - M.l - M.r)) * (xMax - xMin);
      let best = allX[0];
      for (const x of allX) if (Math.abs(x - sol) < Math.abs(best - sol)) best = x;
      const cx = X(best);
      cross.setAttribute('x1', cx); cross.setAttribute('x2', cx); cross.setAttribute('visibility', 'visible');
      tip.textContent = '';
      const head = document.createElement('div');
      head.textContent = (cfg.xLabel || 'x') + ' ' + best;
      tip.appendChild(head);
      series.forEach((s, i) => {
        const p = s.points.find(q => q[0] === best);
        if (!p) { dots[i].setAttribute('visibility', 'hidden'); return; }
        dots[i].setAttribute('cx', X(p[0])); dots[i].setAttribute('cy', Y(p[1])); dots[i].setAttribute('visibility', 'visible');
        const row = document.createElement('div');
        const sw = document.createElement('span');
        sw.style.cssText = `display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px;background:${s.color}`;
        row.appendChild(sw);
        row.appendChild(document.createTextNode(s.name + ' '));
        const b = document.createElement('b');
        b.textContent = fmt(p[1]) + (cfg.unit ? ' ' + cfg.unit : '');
        row.appendChild(b);
        tip.appendChild(row);
      });
      tip.hidden = false;
      tip.style.left = (cx / W) * 100 + '%';
      tip.style.top = (M.t / H) * 100 + '%';
    }
    function hide() {
      tip.hidden = true;
      cross.setAttribute('visibility', 'hidden');
      dots.forEach(d => d.setAttribute('visibility', 'hidden'));
    }
    hit.addEventListener('pointermove', show);
    hit.addEventListener('pointerdown', show);
    hit.addEventListener('pointerleave', hide);

    wrap.appendChild(svg);
    wrap.appendChild(tip);

    // accessible table view
    const det = document.createElement('details');
    const sum = document.createElement('summary');
    sum.className = 'hint';
    sum.textContent = cfg.tableLabel || 'Data table';
    det.appendChild(sum);
    const tw = document.createElement('div');
    tw.className = 'tablewrap';
    const table = document.createElement('table');
    table.className = 'log';
    const thead = table.createTHead().insertRow();
    [cfg.xLabel || 'x', ...series.map(s => s.name)].forEach(h => { const th = document.createElement('th'); th.textContent = h; thead.appendChild(th); });
    const tb = table.createTBody();
    for (const x of allX) {
      const r = tb.insertRow();
      r.insertCell().textContent = x;
      for (const s of series) {
        const p = s.points.find(q => q[0] === x);
        r.insertCell().textContent = p ? fmt(p[1]) : '';
      }
    }
    tw.appendChild(table);
    det.appendChild(tw);
    wrap.appendChild(det);
    container.appendChild(wrap);
    return wrap;
  }

  root.SolCharts = { lineChart };
})(typeof self !== 'undefined' ? self : this);
