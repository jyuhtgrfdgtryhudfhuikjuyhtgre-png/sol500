/*
 * SOL 500 — the minimap (160×160 tiles, one pixel per tile, centred on you) and the full-screen map of everything
 * the crew has explored, with pan and zoom. Both draw the painter's one-pixel-per-tile "mini" images of explored
 * chunks, so they never need the full ground painting. Also formats the debug overlay (?debug=chunks or F3).
 *
 * API: SolMap.create({ t, onOpen, onClose }) → map
 *        map.attach(world, painter)          a new mission's world
 *        map.minimap · map.el                elements for the surface overlay
 *        map.drawMini(state, now)            state: { px, py, crew: [{ x, y, color, you }] } (world pixels)
 *        map.open(state?) · map.close() · map.isOpen() · map.key(keyEvent) → used?
 *        map.frame(state, deadline)          every animation frame (does nothing while closed)
 *        map.relabel()                       after a language change
 *      SolMap.debugText(stats) → string
 */
(function (root) {
  'use strict';
  const W = root.SolWorldgen, P = root.SolPaint;
  const T = 64, CH = W.CHUNK, MINI = 160;
  const ZOOMS = [1, 2, 3, 4, 6, 8]; // screen pixels per tile on the full map
  const PAN = { ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0], ArrowUp: [0, -1], KeyW: [0, -1], ArrowDown: [0, 1], KeyS: [0, 1] };

  function create(opts) {
    const t = opts.t;
    let world = null, painter = null, last = null, lastMini = -1e9;
    let open = false, zi = 2, cx = 0, cy = 0, drag = null;
    const dpr = () => Math.min(2, root.devicePixelRatio || 1);
    const node = (tag, cls, text) => {
      const n = document.createElement(tag);
      if (cls) n.className = cls;
      if (text != null) n.textContent = text;
      return n;
    };

    // The HQ, then every crew member as a dot in their role colour (you with a white ring).
    function markers(g, st, at) {
      const [bx, by] = at(T / 2, T / 2); // the HQ is tile (0, 0)
      g.fillStyle = '#f4e9df';
      g.strokeStyle = '#120a0c';
      g.lineWidth = 1;
      g.fillRect(bx - 3.5, by - 3.5, 7, 7);
      g.strokeRect(bx - 3.5, by - 3.5, 7, 7);
      for (const c of st.crew) {
        const [x, y] = at(c.x, c.y);
        g.fillStyle = c.color;
        g.beginPath(); g.arc(x, y, c.you ? 3.5 : 2.5, 0, Math.PI * 2); g.fill();
        if (c.you) { g.strokeStyle = '#ffffff'; g.lineWidth = 1.5; g.stroke(); }
      }
    }

    // ---------- minimap ----------
    const minimap = node('button', 'sf-mini');
    minimap.type = 'button';
    const mc = node('canvas');
    minimap.appendChild(mc);
    minimap.addEventListener('click', () => openMap());

    function drawMini(st, now) {
      last = st;
      if (!world || open || now - lastMini < 150) return;
      lastMini = now;
      const size = minimap.clientWidth || MINI, k = dpr();
      if (mc.width !== Math.round(size * k)) { mc.width = Math.round(size * k); mc.height = Math.round(size * k); }
      const g = mc.getContext('2d');
      const z = size / MINI; // CSS pixels per tile: 1, or less on small screens
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.imageSmoothingEnabled = false;
      g.fillStyle = '#120a0c';
      g.fillRect(0, 0, mc.width, mc.height);
      const ox = Math.floor(st.px / T) - MINI / 2, oy = Math.floor(st.py / T) - MINI / 2;
      for (let ky = Math.floor(oy / CH); ky <= Math.floor((oy + MINI - 1) / CH); ky++) {
        for (let kx = Math.floor(ox / CH); kx <= Math.floor((ox + MINI - 1) / CH); kx++) {
          const c = painter.mini(kx, ky);
          if (c) blit(g, c, kx * CH - ox, ky * CH - oy, k * z);
        }
      }
      g.setTransform(k, 0, 0, k, 0, 0);
      markers(g, st, (x, y) => [(x / T - ox) * z, (y / T - oy) * z]);
    }

    // Draws a chunk's mini image snapped to whole device pixels (s = device pixels per tile), so neighbouring
    // chunks meet exactly, with no seam.
    function blit(g, c, tx, ty, s) {
      const x0 = Math.round(tx * s), y0 = Math.round(ty * s), x1 = Math.round((tx + CH) * s), y1 = Math.round((ty + CH) * s);
      g.drawImage(c, x0, y0, x1 - x0, y1 - y0);
    }

    // ---------- full map ----------
    const el = node('div', 'sf-map');
    el.hidden = true;
    el.setAttribute('role', 'dialog');
    const fc = node('canvas');
    const head = node('div', 'sf-map-head');
    const title = node('b');
    const legend = node('div', 'sf-map-legend');
    const button = (label, onClick) => { const b = node('button', null, label); b.type = 'button'; b.addEventListener('click', onClick); return b; };
    const zoomOut = button('−', () => zoom(-1)), zoomIn = button('+', () => zoom(1)), shut = button('×', () => closeMap());
    head.append(title, legend, zoomOut, zoomIn, shut);
    const hint = node('p', 'sf-map-hint');
    el.append(fc, head, hint);

    function relabel() {
      title.textContent = t('sf.mapTitle');
      hint.textContent = t('sf.mapHint');
      el.setAttribute('aria-label', t('sf.mapTitle'));
      minimap.setAttribute('aria-label', t('sf.minimap'));
      zoomIn.setAttribute('aria-label', t('sf.zoomIn'));
      zoomOut.setAttribute('aria-label', t('sf.zoomOut'));
      shut.setAttribute('aria-label', t('common.close'));
      legend.textContent = '';
      W.REGIONS.forEach((id, i) => {
        const item = node('span');
        const swatch = node('i');
        swatch.style.background = P.REGION_COLORS[i];
        item.append(swatch, document.createTextNode(t('region.' + id)));
        legend.appendChild(item);
      });
    }

    function openMap(st) {
      if (!world) return;
      const s = st || last;
      if (s) { cx = s.px / T; cy = s.py / T; }
      open = true;
      el.hidden = false;
      if (opts.onOpen) opts.onOpen();
      shut.focus({ preventScroll: true });
    }
    function closeMap() {
      if (!open) return;
      open = false;
      el.hidden = true;
      drag = null;
      if (opts.onClose) opts.onClose();
    }
    function zoom(d) { zi = Math.max(0, Math.min(ZOOMS.length - 1, zi + d)); }
    // Keys while the map is open; returns true when the key was used.
    function key(e) {
      if (e.code === 'Escape' || e.code === 'KeyM') { closeMap(); return true; }
      if (e.key === '+' || e.key === '=') { zoom(1); return true; }
      if (e.key === '-' || e.key === '_') { zoom(-1); return true; }
      const d = PAN[e.code];
      if (!d) return false;
      const step = 48 / ZOOMS[zi];
      cx += d[0] * step;
      cy += d[1] * step;
      return true;
    }
    fc.addEventListener('pointerdown', e => { drag = { id: e.pointerId, x: e.clientX, y: e.clientY }; fc.setPointerCapture(e.pointerId); });
    fc.addEventListener('pointermove', e => {
      if (!drag || drag.id !== e.pointerId) return;
      const z = ZOOMS[zi];
      cx -= (e.clientX - drag.x) / z;
      cy -= (e.clientY - drag.y) / z;
      drag.x = e.clientX;
      drag.y = e.clientY;
    });
    const endDrag = () => { drag = null; };
    fc.addEventListener('pointerup', endDrag);
    fc.addEventListener('pointercancel', endDrag);
    fc.addEventListener('wheel', e => { e.preventDefault(); zoom(e.deltaY < 0 ? 1 : -1); }, { passive: false });

    function frame(st, deadline) {
      last = st;
      if (!open || !world) return;
      painter.workMinis(deadline);
      const k = dpr(), w = el.clientWidth, h = el.clientHeight;
      if (fc.width !== Math.round(w * k) || fc.height !== Math.round(h * k)) { fc.width = Math.round(w * k); fc.height = Math.round(h * k); }
      const g = fc.getContext('2d');
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.imageSmoothingEnabled = false;
      g.fillStyle = '#120a0c';
      g.fillRect(0, 0, fc.width, fc.height);
      const z = ZOOMS[zi], ox = cx - w / 2 / z, oy = cy - h / 2 / z;
      for (const fk of world.fogKeys()) {
        const comma = fk.indexOf(',');
        const kx = Number(fk.slice(0, comma)), ky = Number(fk.slice(comma + 1));
        const sx = (kx * CH - ox) * z, sy = (ky * CH - oy) * z;
        if (sx > w || sy > h || sx + CH * z < 0 || sy + CH * z < 0) continue;
        const c = painter.mini(kx, ky);
        if (c) blit(g, c, kx * CH - ox, ky * CH - oy, k * z);
      }
      g.setTransform(k, 0, 0, k, 0, 0);
      markers(g, st, (x, y) => [(x / T - ox) * z, (y / T - oy) * z]);
    }

    return {
      minimap, el, drawMini, frame, key, relabel,
      attach(w, p) { world = w; painter = p; closeMap(); },
      open: openMap, close: closeMap, isOpen: () => open,
    };
  }

  function debugText(s) {
    return [
      'fps ' + s.fps,
      'data ' + s.world.data + '/' + s.world.cap + '  queue ' + s.world.queue + '  built ' + s.world.built,
      'images ' + s.paint.images + '/' + s.paint.cap + '  queue ' + s.paint.queue + '  paint ' + s.paint.paintMedian.toFixed(2) + ' ms',
      'minis ' + s.paint.minis + ' (+' + s.paint.miniQueue + ')  fog chunks ' + s.world.fog,
      'tile ' + s.tile.join(',') + '  chunk ' + s.chunk.join(',') + '  ' + s.region,
    ].join('\n');
  }

  root.SolMap = { create, debugText };
})(typeof self !== 'undefined' ? self : this);
