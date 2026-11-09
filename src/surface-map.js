/*
 * SOL 500 — the minimap (160×160 tiles, one pixel per tile, centred on you) and the full-screen map of everything
 * the crew has explored, with pan and zoom. Both draw the painter's one-pixel-per-tile "mini" images of explored
 * chunks, so they never need the full ground painting. Also formats the debug overlay (?debug=chunks or F3).
 *
 * API: SolMap.create({ t, onOpen, onClose, onPing(x, y) }) → map   (onPing: a tap on the minimap or a click on the map, world px)
 *        map.attach(world, painter)          a new mission's world
 *        map.minimap · map.openBtn · map.el  elements for the surface overlay (openBtn: the minimap's open-the-map corner)
 *        map.drawMini(state, now)            state: { px, py, crew: [{ x, y, color, you }], marks: [{ x, y, color, square, diamond, beacon, text, ring,
 *                                            ping, label, alpha }], lines: [{ x0, y0, x1, y1, color, width?, dash?, alpha? }] }
 *                                            (world pixels; marks are finds, cave mouths, dropped loads, the parked rover, relay beacons, live
 *                                            pings and poiMarks; lines the dashed route home and the commander's route line)
 *        map.open(state?) · map.close() · map.isOpen() · map.key(keyEvent) → used?
 *        map.frame(state, deadline)          every animation frame (does nothing while closed)
 *        map.relabel()                       after a language change
 *      SolMap.debugText(stats) → string · SolMap.poiMarks(seed, expedition, masts) → the points of interest's marks
 */
(function (root) {
  'use strict';
  const W = root.SolWorldgen, P = root.SolPaint;
  const T = 64, CH = W.CHUNK, MINI = 160;
  const ZOOMS = [1, 2, 3, 4, 6, 8]; // screen pixels per tile on the full map
  // The map key: [id, glyph, colour] for each mark the maps draw (see markers); the strings are sf.key.<id>.
  const MARKS = [['find', '●', '#9fd3ea'], ['cave', '○', '#e8c9a8'], ['drop', '●', '#f46e5f'], ['rover', '■', '#e9e2d8'], ['beacon', '▲', '#ffcf7a'],
    ['landmark', '◆', '#f0c35a'], ['structure', '■', '#a9f4e4'], ['mast', '?', '#a9f4e4'], ['base', '■', '#f4e9df'], ['you', '◎', '#ffffff']];
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

    // The lines (the dashed route home, the commander's route line), then finds and the like, then the HQ, then every crew member
    // as a dot in their role colour (you with a white ring). Dashes are in screen pixels, so they read the same at every zoom; a
    // line or mark with an `alpha` (a ping fading out, spec §3.5) is drawn that faint.
    function markers(g, st, at) {
      for (const l of st.lines || []) {
        const [x0, y0] = at(l.x0, l.y0), [x1, y1] = at(l.x1, l.y1);
        g.globalAlpha = l.alpha == null ? 1 : l.alpha;
        g.strokeStyle = l.color;
        g.lineWidth = l.width || 1.5;
        g.setLineDash(l.dash || []);
        g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
      }
      g.globalAlpha = 1;
      g.setLineDash([]);
      for (const k of st.marks || []) {
        const [x, y] = at(k.x, k.y);
        g.fillStyle = k.color;
        if (k.ping) { // a ping: a ring in the sender's colour with their name over it, edged in dark
          g.globalAlpha = k.alpha == null ? 1 : k.alpha;
          g.strokeStyle = k.color;
          g.lineWidth = 2;
          g.beginPath(); g.arc(x, y, 4.5, 0, Math.PI * 2); g.stroke();
          g.font = '600 9px system-ui, sans-serif';
          g.textAlign = 'center';
          g.textBaseline = 'bottom';
          g.strokeStyle = '#120a0c';
          g.lineWidth = 2.5;
          g.strokeText(k.label || '', x, y - 6);
          g.fillText(k.label || '', x, y - 6);
          g.globalAlpha = 1;
          continue;
        }
        if (k.text) { // a comms mast's "?", edged in dark so it reads on any ground
          g.font = '700 10px system-ui, sans-serif';
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.strokeStyle = '#120a0c';
          g.lineWidth = 2.5;
          g.strokeText(k.text, x, y);
          g.fillText(k.text, x, y);
          continue;
        }
        if (k.square) g.fillRect(x - 2.5, y - 2.5, 5, 5);
        else if (k.diamond) { g.beginPath(); g.moveTo(x, y - 4); g.lineTo(x + 4, y); g.lineTo(x, y + 4); g.lineTo(x - 4, y); g.closePath(); g.fill(); }
        else if (k.beacon) { // a relay beacon: a little mast standing on its spot, edged in dark
          g.beginPath(); g.moveTo(x, y - 5); g.lineTo(x + 3.5, y + 1.5); g.lineTo(x - 3.5, y + 1.5); g.closePath(); g.fill();
          g.strokeStyle = '#120a0c'; g.lineWidth = 1; g.stroke();
        }
        else { g.beginPath(); g.arc(x, y, k.ring ? 2.5 : 2, 0, Math.PI * 2); g.fill(); }
        if (k.ring) { g.strokeStyle = k.ring; g.lineWidth = 1; g.stroke(); } // a cave's mouth: dark, with a light rim; a landmark's dark edge
      }
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
    // A tap or click on the minimap pings that spot (spec §3.5); its corner button, M, or Enter on the minimap opens the map.
    const minimap = node('button', 'sf-mini');
    minimap.type = 'button';
    const mc = node('canvas');
    minimap.appendChild(mc);
    minimap.addEventListener('click', e => {
      if (e.detail === 0 || !opts.onPing || !last) { openMap(); return; } // Enter or Space on the focused minimap
      const r = mc.getBoundingClientRect(), z = (minimap.clientWidth || MINI) / MINI;
      const ox = Math.floor(last.px / T) - MINI / 2, oy = Math.floor(last.py / T) - MINI / 2;
      opts.onPing((ox + (e.clientX - r.left) / z) * T, (oy + (e.clientY - r.top) / z) * T);
    });
    const openBtn = node('button', 'sf-mini-open', '⤢');
    openBtn.type = 'button';
    openBtn.addEventListener('click', () => openMap());

    function drawMini(st, now) {
      last = st;
      if (!world || open || now - lastMini < 150) return;
      lastMini = now;
      // Explored chunks at the edge have no live data (a teammate's fog, a resumed save): build the image the last redraw
      // queued for them, about one every 150 ms, so the minimap never waits for the full map to open.
      painter.workMinis(now + 1);
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
    const markKey = node('div', 'sf-map-key'); // what the marks on the map mean
    head.append(title, legend, zoomOut, zoomIn, shut, markKey);
    const hint = node('p', 'sf-map-hint');
    el.append(fc, head, hint);

    function relabel() {
      title.textContent = t('sf.mapTitle');
      hint.textContent = t('sf.mapHint');
      el.setAttribute('aria-label', t('sf.mapTitle'));
      minimap.setAttribute('aria-label', t('sf.minimap'));
      openBtn.setAttribute('aria-label', t('sf.openMap'));
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
      markKey.textContent = '';
      for (const [id, glyph, color] of MARKS) {
        const item = node('span'), sw = node('i', null, glyph);
        sw.style.color = color;
        item.append(sw, node('span', null, t('sf.key.' + id)));
        markKey.appendChild(item);
      }
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
    // Keys while the map is open; returns true when the key was used. A held M repeats keydown: only the press closes the map.
    function key(e) {
      if (e.code === 'Escape' || (e.code === 'KeyM' && !e.repeat)) { closeMap(); return true; }
      if (e.key === '+' || e.key === '=') { zoom(1); return true; }
      if (e.key === '-' || e.key === '_') { zoom(-1); return true; }
      const d = PAN[e.code];
      if (!d) return false;
      const step = 48 / ZOOMS[zi];
      cx += d[0] * step;
      cy += d[1] * step;
      return true;
    }
    fc.addEventListener('pointerdown', e => { drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0, primary: !e.button }; fc.setPointerCapture(e.pointerId); });
    fc.addEventListener('pointermove', e => {
      if (!drag || drag.id !== e.pointerId) return;
      const z = ZOOMS[zi];
      drag.moved += Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y);
      cx -= (e.clientX - drag.x) / z;
      cy -= (e.clientY - drag.y) / z;
      drag.x = e.clientX;
      drag.y = e.clientY;
    });
    const endDrag = () => { drag = null; };
    // A click that did not drag the map (under 5 px) pings the spot under it.
    fc.addEventListener('pointerup', e => {
      const click = drag && drag.id === e.pointerId && drag.moved < 5 && drag.primary; // only the primary button (a pen and a finger report 0)
      endDrag();
      if (!click || !opts.onPing) return;
      const r = fc.getBoundingClientRect(), z = ZOOMS[zi], w = el.clientWidth, h = el.clientHeight;
      opts.onPing((cx - w / 2 / z + (e.clientX - r.left) / z) * T, (cy - h / 2 / z + (e.clientY - r.top) / z) * T);
    });
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
      minimap, openBtn, el, drawMini, frame, key, relabel,
      attach(w, p) { world = w; painter = p; closeMap(); },
      open: openMap, close: closeMap, isOpen: () => open,
    };
  }

  // The points of interest both maps mark (spec §2.6, §3.7), in world pixels: the landmarks the crew has discovered
  // (x.landmarks, a gold diamond at its centre), the structures used or repaired (x.structures, a pale teal square on its
  // footprint's teal), and the comms masts' "?" (`masts`: the rules' X.mastMarks(m), [{ id, x, y, kind }] in tiles) on
  // what is not marked already. x is the mission's expedition, seed the world's.
  const cellOf = id => id.slice(1).split(',').map(Number); // "L<i>,<j>" or "S<i>,<j>"
  function poiMarks(seed, x, masts) {
    const out = [], shown = new Set();
    for (const id of Object.keys(x.landmarks || {})) {
      const l = W.landmarkAt(seed, ...cellOf(id));
      if (l) { shown.add(id); out.push({ x: (l.x + 0.5) * T, y: (l.y + 0.5) * T, color: '#f0c35a', diamond: true, ring: '#120a0c' }); }
    }
    for (const id of Object.keys(x.structures || {})) {
      const s = W.structureAt(seed, ...cellOf(id)), b = s && s.box;
      if (s) { shown.add(id); out.push({ x: (b[0] + b[2] + 1) / 2 * T, y: (b[1] + b[3] + 1) / 2 * T, color: '#a9f4e4', square: true }); }
    }
    for (const k of masts || []) if (!shown.has(k.id)) out.push({ x: (k.x + 0.5) * T, y: (k.y + 0.5) * T, color: '#a9f4e4', text: '?' });
    return out;
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

  root.SolMap = { create, debugText, poiMarks };
})(typeof self !== 'undefined' ? self : this);
