/*
 * SOL 500 — hand-built SVG art: UI icons, outpost structures, crew portraits and the dusk landscape.
 * Every function returns an SVG string built only from constants (never from player text).
 */
(function (root) {
  'use strict';

  const HULL = '#e9e2d8', HULL2 = '#bdb3a7', DARK = '#2a2124', WIN = '#1c3656', WARM = '#ffcf7a',
    METAL = '#8b9097', PANEL = '#2b4d82', GRID = '#86a8da', GREEN = '#72c35b', ICE = '#c3e4f3', RUST = '#8a4128';
  const ROLE = { engineer: '#e9a13b', biologist: '#8fcf7a', scientist: '#6fa8ff', medic: '#4fd0c4', commander: '#d69cf0' };

  // ---------- UI icons (24×24, stroked with currentColor) ----------
  const ICONS = {
    power: '<path d="M13 2 4.5 13.5H11l-1 8.5 8.5-11.5H12z"/>',
    o2: '<circle cx="9.5" cy="14" r="5.5"/><circle cx="17.5" cy="7" r="3"/>',
    water: '<path d="M12 3c-3.2 4.6-6 7.9-6 11.3a6 6 0 0 0 12 0C18 10.9 15.2 7.6 12 3z"/>',
    food: '<path d="M12 21v-8"/><path d="M12 13c0-4.2 3-7 8-7 0 4.2-3 7-8 7z"/><path d="M12 15.5C12 12 9.5 9.5 5 9.5c0 3.5 2.5 6 7 6z"/>',
    shield: '<path d="M12 3 19 6v5.2c0 4.8-3 8.3-7 9.8-4-1.5-7-5-7-9.8V6z"/>',
    materials: '<rect x="3" y="14" width="8" height="6" rx="1"/><rect x="13" y="14" width="8" height="6" rx="1"/><rect x="8" y="7" width="8" height="6" rx="1"/>',
    spares: '<path d="M14.5 5.5a4.2 4.2 0 0 0-5 5.5L3.5 17l3.5 3.5 6-6a4.2 4.2 0 0 0 5.5-5l-2.6 2.6-2.3-.6-.6-2.3z"/>',
    morale: '<path d="M12 20s-7.5-4.6-7.5-10.2A4.2 4.2 0 0 1 12 7.2a4.2 4.2 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20z"/>',
    science: '<path d="M9 3h6M10 3v6.2L4.6 18.8A1.5 1.5 0 0 0 5.9 21h12.2a1.5 1.5 0 0 0 1.3-2.2L14 9.2V3"/><path d="M7.5 15h9"/>',
    maintenance: '<path d="M14.5 5.5a4.2 4.2 0 0 0-5 5.5L3.5 17l3.5 3.5 6-6a4.2 4.2 0 0 0 5.5-5l-2.6 2.6-2.3-.6-.6-2.3z"/>',
    construction: '<path d="M3 21h18"/><path d="M6 21V9l6-5 6 5v12"/><path d="M10 21v-6h4v6"/>',
    farming: '<path d="M12 21v-8"/><path d="M12 13c0-4.2 3-7 8-7 0 4.2-3 7-8 7z"/><path d="M12 15.5C12 12 9.5 9.5 5 9.5c0 3.5 2.5 6 7 6z"/>',
    eva: '<circle cx="12" cy="10" r="6.5"/><path d="M8.5 9.5h7a0 0 0 0 1 0 0 3.5 3 0 0 1-7 0z"/><path d="M6 21c.6-3 3-4.5 6-4.5s5.4 1.5 6 4.5"/>',
    medical: '<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><path d="M12 8v8M8 12h8"/>',
    warn: '<path d="M12 3.5 2.5 20h19z"/><path d="M12 10v4.5M12 17.2v.3"/>',
    crit: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v6M12 16.5v.3"/>',
    ok: '<circle cx="12" cy="12" r="9"/><path d="m8 12.5 2.8 2.8L16.5 9.5"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.8v.3"/>',
    earth: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.8 2.6 4 5.6 4 9s-1.2 6.4-4 9c-2.8-2.6-4-5.6-4-9s1.2-6.4 4-9z"/>',
    radio: '<path d="M5 19a10 10 0 0 1 0-14M8.5 15.5a5 5 0 0 1 0-7M19 19a10 10 0 0 0 0-14M15.5 15.5a5 5 0 0 0 0-7"/><circle cx="12" cy="12" r="1.5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    star: '<path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.2a2.6 2.6 0 0 1 5 .9c0 1.8-2.5 2.2-2.5 3.9M12 17.2v.3"/>',
    trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H4.5a3 3 0 0 0 3.5 4M16 6h3.5a3 3 0 0 1-3.5 4M12 13v4M8.5 21h7M9.5 17h5v4h-5z"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5"/><circle cx="17" cy="9" r="2.8"/><path d="M16.5 14.6c2.6.2 4.4 1.9 5 4.9"/>',
    wifi: '<path d="M2.5 9a14 14 0 0 1 19 0M5.5 12.5a9.5 9.5 0 0 1 13 0M8.7 16a5 5 0 0 1 6.6 0"/><circle cx="12" cy="19.5" r="1"/>',
    rocket: '<path d="M12 2.5c3.5 2.5 5 6.2 5 10.5l-2 3h-6l-2-3c0-4.3 1.5-8 5-10.5z"/><circle cx="12" cy="10" r="1.8"/><path d="M9 16l-2.5 4.5L9.5 19M15 16l2.5 4.5-3-1.5"/>',
    refresh: '<path d="M20 11a8 8 0 0 0-14.3-4.3L4 8.5M4 13a8 8 0 0 0 14.3 4.3L20 15.5"/><path d="M4 4v4.5h4.5M20 20v-4.5h-4.5"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    scrap: '<path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13"/>',
    power_off: '<path d="M12 3v8"/><path d="M6.3 6.8a8 8 0 1 0 11.4 0"/>',
    chevron: '<path d="m9 6 6 6-6 6"/>',
    flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  };

  function icon(name, size, extra) {
    const s = size || 18;
    return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra || ''}>${ICONS[name] || ICONS.info}</svg>`;
  }

  // ---------- structures (64×64, front view on the ground) ----------
  const shadow = (rx) => `<ellipse cx="32" cy="54" rx="${rx || 22}" ry="4.5" fill="#000" opacity="0.32"/>`;

  const MODULE_ART = {
    hab: () => shadow(27) +
      `<path d="M6 53a26 26 0 0 1 52 0z" fill="${HULL}"/>` +
      `<path d="M6 53a26 26 0 0 1 26-26v26z" fill="#fff" opacity="0.16"/>` +
      `<path d="M32 27v26M19 30.5q-7 9-7 22.5M45 30.5q7 9 7 22.5" stroke="${HULL2}" stroke-width="1.2" fill="none"/>` +
      `<rect x="15" y="39" width="34" height="6" rx="3" fill="${WIN}"/>` +
      `<rect x="18" y="40.5" width="5" height="3" rx="1" fill="${WARM}"/><rect x="26" y="40.5" width="5" height="3" rx="1" fill="${WARM}" opacity="0.7"/><rect x="41" y="40.5" width="5" height="3" rx="1" fill="${WARM}"/>` +
      `<rect x="28" y="46" width="8" height="7" rx="1.5" fill="${DARK}"/>` +
      `<path d="M44 29l7-13" stroke="${HULL2}" stroke-width="1.6"/><circle cx="51" cy="15.5" r="2.2" fill="#f46e5f" class="pulse"/>`,
    solar: (o) => shadow(24) +
      `<path d="M20 51v-8M44 51v-12" stroke="${METAL}" stroke-width="2.2"/>` +
      `<path d="M7 45 39 30.5 58 37 26 51.5z" fill="${PANEL}" stroke="#a9c1e3" stroke-width="1"/>` +
      `<path d="M15.5 41.2 34 48M23.5 37.5 42 44.3M31.5 33.9 50 40.6M16.5 48.5 48.5 34" stroke="${GRID}" stroke-width="0.9" opacity="0.7"/>` +
      `<path d="M7 45 39 30.5 58 37 26 51.5z" fill="#c98f5e" opacity="${Math.max(0, Math.min(0.75, (1 - (o.clean == null ? 1 : o.clean)) * 1.1)).toFixed(2)}"/>`,
    battery: () => shadow(19) +
      `<rect x="15" y="30" width="34" height="23" rx="3" fill="#5c6872"/><rect x="15" y="30" width="34" height="6" rx="3" fill="#7c8994"/>` +
      `<rect x="21" y="26" width="5" height="4" rx="1" fill="${METAL}"/><rect x="38" y="26" width="5" height="4" rx="1" fill="${METAL}"/>` +
      `<rect x="20" y="40" width="5" height="9" rx="1" fill="#7fd1a0"/><rect x="27" y="40" width="5" height="9" rx="1" fill="#7fd1a0"/><rect x="34" y="40" width="5" height="9" rx="1" fill="#7fd1a0" opacity="0.75"/><rect x="41" y="40" width="5" height="9" rx="1" fill="#7fd1a0" opacity="0.35"/>`,
    reactor: () => shadow(24) +
      `<path d="M5 20h15v32H5z" fill="#dcd6cd"/><path d="M8 22v28M11.5 22v28M15 22v28" stroke="#a9a095" stroke-width="1"/>` +
      `<path d="M44 20h15v32H44z" fill="#dcd6cd"/><path d="M47 22v28M50.5 22v28M54 22v28" stroke="#a9a095" stroke-width="1"/>` +
      `<rect x="23" y="17" width="18" height="36" rx="3" fill="#4a4e56"/><ellipse cx="32" cy="17.5" rx="9" ry="3.2" fill="#6c7179"/>` +
      `<rect x="25" y="34" width="14" height="4" rx="1" fill="#ffb347" opacity="0.9"/><rect x="20" y="28" width="3" height="3" fill="${METAL}"/><rect x="41" y="28" width="3" height="3" fill="${METAL}"/>`,
    recycler: () => shadow(20) +
      `<rect x="12" y="23" width="26" height="30" rx="7" fill="#cfd6dc"/><rect x="12" y="23" width="26" height="30" rx="7" fill="#fff" opacity="0.12"/>` +
      `<path d="M38 33h8a6 6 0 0 1 6 6v8H38" stroke="${METAL}" stroke-width="3.5" fill="none" stroke-linejoin="round"/>` +
      `<path d="M25 29c-3.4 4.4-5.4 6.6-5.4 9.6a5.4 5.4 0 0 0 10.8 0c0-3-2-5.2-5.4-9.6z" fill="#5fb4ff"/>`,
    oxygen: () => shadow(24) +
      `<rect x="6" y="30" width="28" height="23" rx="3" fill="#d8d0c4"/><circle cx="20" cy="41.5" r="7.5" fill="#3a3235"/>` +
      `<path d="M20 34.5v14M13 41.5h14M15 36.5l10 10M25 36.5l-10 10" stroke="#6d6266" stroke-width="1.2"/>` +
      `<rect x="37" y="22" width="9" height="31" rx="4.5" fill="#86b8ea"/><rect x="48" y="26" width="9" height="27" rx="4.5" fill="#86b8ea"/>` +
      `<rect x="39" y="25" width="2.5" height="24" rx="1.2" fill="#fff" opacity="0.35"/>` +
      `<text x="41" y="18" font-family="JetBrains Mono, monospace" font-size="9" font-weight="700" fill="#cfe4fb">O₂</text>`,
    icedrill: () => shadow(22) +
      `<path d="M9 53l6-7 7 2 2 5z" fill="${ICE}"/><path d="M42 53l4-5 8 1 3 4z" fill="${ICE}"/>` +
      `<path d="M21 53 32 13l11 40" stroke="#d9aa7a" stroke-width="3" fill="none" stroke-linejoin="round"/>` +
      `<path d="M24.5 40h15M27 30h10M29 21h6" stroke="#d9aa7a" stroke-width="2"/>` +
      `<rect x="30" y="24" width="4" height="31" fill="${METAL}"/><path d="M29 55l3 5 3-5z" fill="${METAL}"/>` +
      `<rect x="12" y="44" width="10" height="9" rx="1.5" fill="#6b7680"/>`,
    greenhouse: () => shadow(26) +
      `<path d="M5 53a27 23 0 0 1 54 0z" fill="#aee0ff" opacity="0.2" stroke="#cfe8fb" stroke-width="1.4"/>` +
      `<path d="M5 53a27 23 0 0 1 54 0z" fill="#d69cf0" opacity="0.1"/>` +
      `<path d="M32 30v23M18 34q-6 8-6.5 19M46 34q6 8 6.5 19M8 44h48" stroke="#cfe8fb" stroke-width="1" opacity="0.55" fill="none"/>` +
      `<ellipse cx="17" cy="49" rx="5" ry="3.5" fill="${GREEN}"/><ellipse cx="27" cy="48" rx="5.5" ry="4" fill="#5fae4a"/><ellipse cx="37" cy="48.5" rx="5" ry="3.8" fill="${GREEN}"/><ellipse cx="47" cy="49" rx="5" ry="3.4" fill="#5fae4a"/>` +
      `<path d="M27 44v-4M37 45v-3" stroke="#8fd872" stroke-width="1.4"/>`,
    lab: () => shadow(25) +
      `<rect x="7" y="29" width="50" height="24" rx="12" fill="${HULL}"/><path d="M19 29v24M45 29v24" stroke="${HULL2}" stroke-width="1"/>` +
      `<circle cx="32" cy="41" r="6.5" fill="${WIN}"/><circle cx="30" cy="39" r="2" fill="#9fd0ff" opacity="0.6"/>` +
      `<path d="M11 36h4v8h-4zM49 36h4v8h-4z" fill="#6fa8ff" opacity="0.8"/>` +
      `<path d="M52 29V20M49 20h6" stroke="${HULL2}" stroke-width="1.5"/>`,
    rover: () => shadow(24) +
      `<path d="M8 45V35a7 7 0 0 1 7-7h25l11 8.5V45z" fill="${HULL}"/>` +
      `<path d="M40.5 29.5 49 36h-8.5z" fill="${WIN}"/><rect x="14" y="33" width="9" height="5" rx="1.5" fill="${WIN}"/><rect x="26" y="33" width="9" height="5" rx="1.5" fill="${WIN}"/>` +
      `<path d="M8 41h43" stroke="#e9a13b" stroke-width="2.2"/>` +
      `<g fill="${DARK}" stroke="${METAL}" stroke-width="1.6"><circle cx="15" cy="48" r="5"/><circle cx="29" cy="48" r="5"/><circle cx="43" cy="48" r="5"/></g>` +
      `<path d="M18 28v-7" stroke="${HULL2}" stroke-width="1.4"/><circle cx="18" cy="20" r="1.6" fill="#7fd1a0"/>`,
    habitat: () => shadow(27) +
      `<rect x="5" y="27" width="54" height="26" rx="13" fill="#efe6d8"/><rect x="5" y="27" width="54" height="10" rx="5" fill="#fff" opacity="0.12"/>` +
      `<path d="M16 28v24M27 27v26M38 27v26M49 28v24" stroke="#cbbfae" stroke-width="1.2"/>` +
      `<rect x="18" y="37" width="7" height="6" rx="2" fill="${WARM}"/><rect x="29" y="37" width="7" height="6" rx="2" fill="${WARM}" opacity="0.8"/><rect x="40" y="37" width="7" height="6" rx="2" fill="${WARM}"/>`,
    medbay: () => shadow(24) +
      `<rect x="9" y="28" width="46" height="25" rx="6" fill="${HULL}"/><rect x="9" y="28" width="46" height="7" rx="6" fill="#fff" opacity="0.14"/>` +
      `<rect x="24" y="31.5" width="16" height="16" rx="4" fill="#123f3c"/><path d="M32 34.5v10M27 39.5h10" stroke="#4fd0c4" stroke-width="3.4" stroke-linecap="round"/>`,
    workshop: () => shadow(24) +
      `<rect x="6" y="31" width="38" height="22" rx="3" fill="#cfc6ba"/><rect x="10" y="38" width="14" height="15" fill="${DARK}"/>` +
      `<circle cx="34" cy="41" r="5.5" fill="none" stroke="#6d6266" stroke-width="2.6" stroke-dasharray="3 2"/>` +
      `<path d="M50 53V16H31" stroke="#e9a13b" stroke-width="3" fill="none"/><path d="M34 16v7" stroke="${METAL}" stroke-width="1.4"/><path d="M31.5 23h5l-1 3h-3z" fill="${METAL}"/>`,
    comms: () => shadow(16) +
      `<path d="M32 53V32M26 53l6-9 6 9" stroke="${HULL2}" stroke-width="2.6" fill="none"/>` +
      `<path d="M14 23a19 19 0 0 0 32 15z" fill="${HULL}" stroke="${HULL2}" stroke-width="1"/>` +
      `<path d="M30 30.5 42 19" stroke="${METAL}" stroke-width="1.6"/><circle cx="42.5" cy="18.5" r="2.4" fill="#86b8ea"/>`,
    shelter: () => shadow(27) +
      `<path d="M4 53q28-36 56 0z" fill="${RUST}"/><path d="M11 48q21-26 42 0" stroke="#a5552f" stroke-width="2" fill="none"/>` +
      `<path d="M24 53v-8a8 8 0 0 1 16 0v8z" fill="${DARK}"/><path d="M24 45h16" stroke="#e9a13b" stroke-width="1.6"/>`,
    scaffold: () =>
      `<rect x="10" y="22" width="44" height="31" fill="none" stroke="#d9aa7a" stroke-width="1.6" stroke-dasharray="4 3"/>` +
      `<path d="M10 22l44 31M54 22 10 53" stroke="#d9aa7a" stroke-width="0.8" opacity="0.5"/>` +
      `<path d="M50 53V12H30" stroke="#e9a13b" stroke-width="2.4" fill="none"/><path d="M33 12v8" stroke="${METAL}" stroke-width="1.2"/>`,
  };

  function moduleInner(type, opts) {
    const f = MODULE_ART[type] || MODULE_ART.scaffold;
    return f(opts || {});
  }

  function module(type, size, opts) {
    const s = size || 48;
    return `<svg width="${s}" height="${s}" viewBox="0 0 64 64" aria-hidden="true">${moduleInner(type, opts)}</svg>`;
  }

  // Supply pallets for the manifest
  const CRATES = {
    spares: `<rect x="12" y="28" width="40" height="24" rx="3" fill="#6b5e57"/><path d="M12 36h40" stroke="#8a7a70"/><path d="M28 40.5a5 5 0 0 0-2 5.8l-5 5 2.6 2.6 5-5a5 5 0 0 0 5.8-2" stroke="#e9a13b" stroke-width="2" fill="none" stroke-linecap="round"/>`,
    materials: `<rect x="8" y="42" width="48" height="10" rx="2" fill="#9c8f82"/><rect x="12" y="32" width="40" height="9" rx="2" fill="#b3a595"/><rect x="18" y="22" width="28" height="9" rx="2" fill="#c8baa8"/>`,
    food: `<rect x="10" y="26" width="44" height="27" rx="3" fill="#7a6a4e"/><path d="M10 34h44M32 26v27" stroke="#5e5139"/><path d="M40 44c0-5 3-8 8-8 0 5-3 8-8 8z" fill="${GREEN}"/>`,
    o2: `<rect x="12" y="20" width="11" height="33" rx="5.5" fill="#86b8ea"/><rect x="26.5" y="20" width="11" height="33" rx="5.5" fill="#86b8ea"/><rect x="41" y="20" width="11" height="33" rx="5.5" fill="#86b8ea"/><rect x="14" y="23" width="3" height="26" rx="1.5" fill="#fff" opacity="0.35"/>`,
    water: `<rect x="10" y="24" width="44" height="29" rx="4" fill="#3b6fa6"/><path d="M32 30c-3.8 4.8-6 7.2-6 10.4a6 6 0 0 0 12 0c0-3.2-2.2-5.6-6-10.4z" fill="#9fd0ff"/>`,
    waterwall: `<rect x="8" y="18" width="48" height="35" rx="4" fill="#2f5f93"/><path d="M8 28h48M8 38h48" stroke="#5f93c9" stroke-width="1.4"/><path d="M32 42c-2.6 3-4 4.6-4 6.6a4 4 0 0 0 8 0c0-2-1.4-3.6-4-6.6z" fill="#bfe1ff"/>`,
  };

  function itemArt(id, size) {
    const s = size || 44;
    const inner = CRATES[id] ? shadow(22) + CRATES[id] : moduleInner(id, { clean: 1 });
    return `<svg width="${s}" height="${s}" viewBox="0 0 64 64" aria-hidden="true">${inner}</svg>`;
  }

  // ---------- crew portraits (64×64) ----------
  let uid = 0;
  const GLYPH = {
    engineer: '<path d="M44 52.5a3 3 0 0 0-1 3.5l-3 3 1.6 1.6 3-3a3 3 0 0 0 3.5-1" stroke="#fff" stroke-width="1.6" fill="none" stroke-linecap="round"/>',
    biologist: '<path d="M46 58v-4M46 54c0-2.4 1.8-4 4-4 0 2.4-1.8 4-4 4z" stroke="#fff" stroke-width="1.4" fill="none"/>',
    scientist: '<path d="M44.5 50h3M45 50v3l-2.6 4.6h7.2L47 53v-3" stroke="#fff" stroke-width="1.3" fill="none" stroke-linejoin="round"/>',
    medic: '<path d="M46 50.5v7M42.5 54h7" stroke="#fff" stroke-width="2" stroke-linecap="round"/>',
    commander: '<path d="m46 50.3 1.2 2.4 2.6.4-1.9 1.8.5 2.6-2.4-1.3-2.4 1.3.5-2.6-1.9-1.8 2.6-.4z" fill="#fff"/>',
  };

  function portrait(role, size, opts) {
    const s = size || 52;
    const o = opts || {};
    const c = ROLE[role] || '#aaa';
    const id = 'v' + (++uid);
    const tilt = o.variant || 0;
    return `<svg class="portrait ${o.status || ''}" width="${s}" height="${s}" viewBox="0 0 64 64" role="img" aria-label="${role}">` +
      `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0.4" y2="1"><stop offset="0" stop-color="#0d1624"/><stop offset="0.6" stop-color="#1f3c62"/><stop offset="1" stop-color="${c}"/></linearGradient>` +
      `<clipPath id="${id}c"><circle cx="32" cy="32" r="32"/></clipPath></defs>` +
      `<g clip-path="url(#${id}c)"><rect width="64" height="64" fill="#2b2023"/><circle cx="32" cy="32" r="32" fill="${c}" opacity="0.18"/>` +
      `<path d="M4 66c2-13 13-19 28-19s26 6 28 19z" fill="${HULL}"/><path d="M11 58h42" stroke="${c}" stroke-width="4"/>` +
      `<rect x="25" y="44" width="14" height="6" rx="2" fill="${HULL2}"/>` +
      `<circle cx="32" cy="27" r="18.5" fill="#f3eee7" stroke="${HULL2}" stroke-width="1.2"/>` +
      `<ellipse cx="32" cy="28.5" rx="13.2" ry="10.4" fill="url(#${id})"/>` +
      `<path d="M${22 + tilt} 24.5q6-6.5 16-4.2" stroke="#fff" stroke-width="2" opacity="0.55" fill="none" stroke-linecap="round"/>` +
      `<circle cx="${38 - tilt}" cy="33" r="1.4" fill="#fff" opacity="0.45"/>` +
      `<rect x="27.5" y="9.5" width="9" height="3.2" rx="1.6" fill="${c}"/>` +
      `<circle cx="46" cy="54" r="6.5" fill="${c}"/>${GLYPH[role] || ''}</g></svg>`;
  }

  // ---------- title landscape ----------
  function landscape() {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    let stars = '';
    for (let i = 0; i < 90; i++) {
      const x = rnd() * 1600, y = rnd() * 330, r = rnd() * 1.3 + 0.3;
      stars += `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${r.toFixed(2)}" fill="#fff" opacity="${(0.25 + rnd() * 0.6).toFixed(2)}"/>`;
    }
    let dust = '';
    for (let i = 0; i < 40; i++) {
      dust += `<circle cx="${(rnd() * 1800).toFixed(0)}" cy="${(470 + rnd() * 200).toFixed(0)}" r="${(rnd() * 1.6 + 0.4).toFixed(2)}" fill="#e7b88a" opacity="${(0.15 + rnd() * 0.3).toFixed(2)}"/>`;
    }
    return `<svg viewBox="0 0 1600 700" preserveAspectRatio="xMidYMax slice" aria-hidden="true">` +
      `<defs>` +
      `<linearGradient id="skyg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#120c16"/><stop offset="0.42" stop-color="#271a24"/><stop offset="0.72" stop-color="#5a3834"/><stop offset="1" stop-color="#9c664b"/></linearGradient>` +
      `<radialGradient id="sung" cx="1170" cy="560" r="330" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#f4f9ff"/><stop offset="0.05" stop-color="#cfe4fb"/><stop offset="0.28" stop-color="#8cbcec" stop-opacity="0.55"/><stop offset="1" stop-color="#8cbcec" stop-opacity="0"/></radialGradient>` +
      `<linearGradient id="fadeg" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#1b1417" stop-opacity="0.92"/><stop offset="0.55" stop-color="#1b1417" stop-opacity="0.35"/><stop offset="1" stop-color="#1b1417" stop-opacity="0"/></linearGradient>` +
      `</defs>` +
      `<rect width="1600" height="700" fill="url(#skyg)"/>${stars}` +
      `<rect width="1600" height="700" fill="url(#sung)"/><circle cx="1170" cy="560" r="9" fill="#fbfdff"/>` +
      `<path d="M318 132c9-6 23-4 28 5s0 19-10 22-26 1-28-9 1-13 10-18z" fill="#8c7d74"/><circle cx="330" cy="143" r="2.4" fill="#6e6159"/>` +
      `<path d="M0 560 60 548 110 552 170 530 260 528 300 540 420 536 470 518 560 516 600 530 760 534 820 522 900 524 960 540 1100 546 1180 562 1260 552 1340 530 1420 526 1480 540 1600 536V700H0z" fill="#3a2322"/>` +
      `<path d="M0 600c140-30 260-24 400-8s260 18 400-6 300-40 420-20 260 34 380 20V700H0z" fill="#5b2d21"/>` +
      `<path d="M0 640c180-26 380-34 560-18 150 13 260 4 380-10 170-20 360-20 520 6 60 10 100 12 140 8V700H0z" fill="#7a3623"/>` +
      `<g class="dust-drift">${dust}</g>` +
      `<g transform="translate(1270 560)">` +
      `<path d="M-40 34a44 44 0 0 1 88 0z" fill="#1c1215"/><path d="M-26 22h52" stroke="#ffcf7a" stroke-width="3" stroke-dasharray="6 7" opacity="0.8"/>` +
      `<path d="M60 34 96 18 120 26 84 42z" fill="#1c1215"/><path d="M-110 34-74 18-50 26-86 42z" fill="#1c1215"/>` +
      `<path d="M20 -10 32 -34" stroke="#1c1215" stroke-width="3"/><circle cx="32" cy="-35" r="3" fill="#f46e5f" class="pulse"/></g>` +
      `<rect width="1600" height="700" fill="url(#fadeg)"/>` +
      `</svg>`;
  }

  root.SolArt = { icon, module, moduleInner, itemArt, portrait, landscape, ROLE };
})(typeof self !== 'undefined' ? self : this);
