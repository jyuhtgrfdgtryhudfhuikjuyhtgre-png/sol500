/*
 * SOL 500 — hand-built SVG art: UI icons, outpost structures, points of interest, crew portraits and the dusk landscape.
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
    // a relay beacon (spec §3.8): its mast on three legs, the light on top and its signal (the backpack's kit, the maps' key)
    kit: '<path d="M12 9v12M12 16l-4.5 5M12 16l4.5 5"/><circle cx="12" cy="6" r="2"/><path d="M8 9.5a5 5 0 0 1 0-7M16 2.5a5 5 0 0 1 0 7"/>',
    gear: '<path d="M10.3 5.1 10.6 2.3h2.8l.3 2.8A7.1 7.1 0 0 1 17.1 7.1l2.6-1.2 1.4 2.5-2.3 1.6A7.1 7.1 0 0 1 18.8 14l2.3 1.6-1.4 2.5-2.6-1.2a7.1 7.1 0 0 1-3.4 2l-.3 2.8h-2.8l-.3-2.8a7.1 7.1 0 0 1-3.4-2l-2.6 1.2-1.4-2.5L5.2 14A7.1 7.1 0 0 1 5.2 10L2.9 8.4l1.4-2.5 2.6 1.2a7.1 7.1 0 0 1 3.4-2z"/><circle cx="12" cy="12" r="3"/>',
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
    // a relay beacon kit (spec §3.8): the folded mast strapped on its case, its light at the tip
    kit: () => shadow(20) +
      `<rect x="13" y="37" width="38" height="16" rx="3" fill="#6b5e57"/><rect x="13" y="37" width="38" height="5" rx="2.5" fill="#fff" opacity="0.12"/>` +
      `<path d="M13 46h38" stroke="#4fd0c4" stroke-width="2"/><path d="M19 37v16M45 37v16" stroke="#54494b" stroke-width="1.6"/>` +
      `<path d="M16 32h31" stroke="${METAL}" stroke-width="3" stroke-linecap="round"/><path d="M20 35l4-3M30 35l4-3" stroke="${METAL}" stroke-width="1.4"/>` +
      `<circle cx="49" cy="32" r="4.5" fill="${WARM}" opacity="0.3"/><circle cx="49" cy="32" r="2.4" fill="${WARM}"/>`,
    // M6: the Garage (a hangar, a rover's nose in its door), the Fabricator (a printer at work), the sample-return pad (a
    // rocket by its tower), the pressurised rover (a long cabin on four wheels) and the scout drone (Ingenuity's two rotors)
    garage: () => shadow(27) +
      `<path d="M5 53V31l27-9 27 9v22z" fill="#cfc6ba"/><path d="M5 31h54" stroke="#e9a13b" stroke-width="2"/>` +
      `<rect x="14" y="35" width="36" height="18" rx="2" fill="${DARK}"/><path d="M14 38h36M14 41h36" stroke="#54494b" stroke-width="1.2"/>` +
      `<path d="M18 52v-5a4 4 0 0 1 4-4h14l6 5v4z" fill="${HULL}" opacity="0.85"/>` +
      `<g fill="${DARK}" stroke="${METAL}" stroke-width="1.4"><circle cx="23" cy="51" r="2.6"/><circle cx="37" cy="51" r="2.6"/></g>`,
    fabricator: () => shadow(24) +
      `<rect x="8" y="24" width="48" height="29" rx="4" fill="${HULL}"/><rect x="8" y="24" width="48" height="7" rx="4" fill="#fff" opacity="0.14"/>` +
      `<rect x="13" y="33" width="31" height="16" rx="2" fill="${WIN}"/><path d="M15 37h27" stroke="${METAL}" stroke-width="1.6"/>` +
      `<path d="M29 37v5" stroke="${METAL}" stroke-width="1.4"/><path d="M27.5 42h3L29 44z" fill="${WARM}"/><path d="M22 49v-3h14v3z" fill="#e9a13b"/>` +
      `<rect x="47" y="33" width="5" height="5" rx="1" fill="#7fd1a0"/><rect x="47" y="41" width="5" height="5" rx="1" fill="#f2b84f"/>`,
    launchpad: () => shadow(27) +
      `<path d="M6 53l5-6h42l5 6z" fill="#6b5e57"/><path d="M14 50h36" stroke="#e9a13b" stroke-width="1.6" stroke-dasharray="4 3"/>` +
      `<path d="M45 47V12M45 17h-8M45 27h-8M45 37h-8" stroke="${METAL}" stroke-width="2"/>` +
      `<path d="M28 10c4 3 6 8 6 15v20H22V25c0-7 2-12 6-15z" fill="${HULL}"/><circle cx="28" cy="24" r="3" fill="${WIN}"/>` +
      `<path d="M22 35l-4 10h4zM34 35l4 10h-4z" fill="#d06a4a"/>`,
    cabin: () => shadow(28) +
      `<path d="M4 46V30a8 8 0 0 1 8-8h31a12 12 0 0 1 12 12v12z" fill="${HULL}"/><path d="M43 24a10 10 0 0 1 10 10H43z" fill="${WIN}"/>` +
      `<rect x="10" y="28" width="7" height="6" rx="2" fill="${WARM}"/><rect x="20" y="28" width="7" height="6" rx="2" fill="${WARM}" opacity="0.8"/>` +
      `<rect x="31" y="27" width="8" height="13" rx="2" fill="${HULL2}"/><path d="M4 41h51" stroke="#4fd0c4" stroke-width="2.2"/>` +
      `<g fill="${DARK}" stroke="${METAL}" stroke-width="1.6"><circle cx="11" cy="49" r="5"/><circle cx="23" cy="49" r="5"/><circle cx="37" cy="49" r="5"/><circle cx="49" cy="49" r="5"/></g>`,
    drone: () => shadow(14) +
      `<path d="M22 53l5-11M42 53l-5-11" stroke="${METAL}" stroke-width="1.4"/>` +
      `<rect x="25" y="34" width="14" height="9" rx="2" fill="${HULL}"/><rect x="29" y="36.5" width="6" height="3" rx="1" fill="${WIN}"/>` +
      `<path d="M32 34V12" stroke="${HULL2}" stroke-width="1.8"/><rect x="26" y="9" width="12" height="4" rx="1" fill="${PANEL}" stroke="${GRID}" stroke-width="0.8"/>` +
      `<path d="M9 27h46M13 20h38" stroke="${DARK}" stroke-width="2.6" stroke-linecap="round"/><path d="M9 27h46M13 20h38" stroke="#9a877f" stroke-width="0.9"/>`,
    // M6 builds with no tile: a rank-up, the four gear lines and the launch (the console's rows and queue)
    rankup: () => shadow(24) +
      `<path d="M10 53a22 22 0 0 1 44 0z" fill="${HULL}"/><rect x="20" y="43" width="24" height="5" rx="2.5" fill="${WIN}"/>` +
      `<path d="M20 20l12-12 12 12M20 30l12-12 12 12" stroke="#7fd1a0" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
    tanks: () => shadow(20) +
      `<rect x="16" y="20" width="13" height="33" rx="6.5" fill="#86b8ea"/><rect x="33" y="20" width="13" height="33" rx="6.5" fill="#86b8ea"/>` +
      `<rect x="19" y="24" width="3" height="25" rx="1.5" fill="#fff" opacity="0.35"/><rect x="36" y="24" width="3" height="25" rx="1.5" fill="#fff" opacity="0.35"/>` +
      `<path d="M22.5 20v-5h17v5M31 15v-3" stroke="${METAL}" stroke-width="2" fill="none"/><circle cx="31" cy="9" r="3" fill="${DARK}" stroke="${METAL}"/>`,
    backpack: () => shadow(20) +
      `<rect x="17" y="18" width="30" height="35" rx="6" fill="${HULL}"/><rect x="17" y="18" width="30" height="8" rx="6" fill="#fff" opacity="0.14"/>` +
      `<rect x="22" y="30" width="20" height="12" rx="2" fill="${HULL2}"/><path d="M22 36h20" stroke="${METAL}" stroke-width="1.2"/>` +
      `<path d="M13 24v22M51 24v22" stroke="#e9a13b" stroke-width="3" stroke-linecap="round"/><rect x="27" y="45" width="10" height="4" rx="1" fill="#7fd1a0"/>`,
    racks: () => shadow(25) +
      `<path d="M8 47h48M10 47V27M54 47V27M10 27h44M10 37h44" stroke="${METAL}" stroke-width="2.4" fill="none"/>` +
      `<rect x="13" y="39" width="12" height="8" rx="1" fill="#b3a595"/><rect x="27" y="39" width="12" height="8" rx="1" fill="#9c8f82"/><rect x="41" y="39" width="10" height="8" rx="1" fill="#b3a595"/>` +
      `<rect x="15" y="29" width="14" height="8" rx="1" fill="#c8baa8"/><rect x="33" y="29" width="12" height="8" rx="1" fill="#9c8f82"/>` +
      `<g fill="${DARK}" stroke="${METAL}" stroke-width="1.4"><circle cx="16" cy="50" r="3.5"/><circle cx="48" cy="50" r="3.5"/></g>`,
    tools: () => shadow(22) +
      `<path d="M12 26h28a6 6 0 0 1 0 12H12z" fill="#e9a13b"/><path d="M46 32h10" stroke="${METAL}" stroke-width="3" stroke-linecap="round"/>` +
      `<path d="M19 38l-3 15h9l3-15z" fill="#54494b"/><rect x="15" y="29" width="10" height="5" rx="1.5" fill="${DARK}" opacity="0.5"/>`,
    launch: () =>
      `<path d="M20 54q12-12 24 0z" fill="#e7b88a" opacity="0.5"/>` +
      `<path d="M32 6c5 4 7 10 7 18v16H25V24c0-8 2-14 7-18z" fill="${HULL}"/><circle cx="32" cy="22" r="3.2" fill="${WIN}"/>` +
      `<path d="M25 32l-5 10h5zM39 32l5 10h-5z" fill="#d06a4a"/>` +
      `<path d="M27 41q5 14 10 0z" fill="${WARM}"/><path d="M29.5 41q2.5 7 5 0z" fill="#fff" opacity="0.7"/>`,
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

  // ---------- points of interest on the map (64×64, 3/4 view and light from the upper left, as the modules) ----------
  // Each fills a square as wide as its footprint, with its bottom edge on the footprint's: a footprint wider than deep (the
  // 3×2 wreck, the 4×2 array) leaves the top of the square to what stands up, as with the modules. A size that is not a
  // positive number gives 64 px; an unknown id gives a known drawing.
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const svg64 = (size, inner) => {
    const s = Number.isFinite(size) && size > 0 ? size : 64;
    return `<svg width="${s}" height="${s}" viewBox="0 0 64 64" aria-hidden="true">${inner}</svg>`;
  };

  // The Kestrel Survey (spec §3.7): robotic hardware older than the outpost, so its paint is faded and dust lies on its
  // tops and feet. One teal accent marks the programme; a repaired machine's beacon is lit. Paint: hull, its lit top, its
  // shade, dark.
  const KH = '#c3b7a7', KT = '#d8cdbe', KS = '#968a7c', KD = '#3d3537', TEAL = '#4a978e', LIT = '#a9f4e4', DUST = '#a96f48', STRUT = '#7a736d';
  const dust = (d, op) => `<path d="${d}" fill="${DUST}" opacity="${op || 0.45}"/>`;
  const beacon = (x, y, on) => (on ? `<circle cx="${x}" cy="${y}" r="6" fill="${LIT}" opacity="0.3"/><circle cx="${x}" cy="${y}" r="2.4" fill="${LIT}"/>`
    : `<circle cx="${x}" cy="${y}" r="2.2" fill="#4d4346"/>`);
  // the weather station's top, from the break in its mast up: the boom with the wind cups and the vane, and the beacon
  const weatherTop = on => `<path d="M32 27V12M21 18h22M21 18v-4M17 14h8" stroke="#8f8780" stroke-width="1.6"/><circle cx="17" cy="14" r="1.8" fill="${KH}"/>` +
    `<circle cx="25" cy="14" r="1.8" fill="${KH}"/><path d="M43 18l5-4v8z" fill="${TEAL}"/>` + beacon(32, 10, on);

  const KESTREL_ART = {
    // a supply cache on its four landing legs; opened, its lid stands up behind and the box is empty
    cache: done => shadow(27) +
      `<path d="M16 46 9 53M48 46l7 7M24 48l-1 6M40 48l1 6" stroke="${STRUT}" stroke-width="2"/><path d="M6 53.5h6M52 53.5h6" stroke="${STRUT}" stroke-width="2.4" stroke-linecap="round"/>` +
      (done ? `<path d="M15 20l2-14h30l2 14z" fill="#a89c8d"/><path d="M19 9h26" stroke="${TEAL}" stroke-width="2"/>` : '') +
      `<rect x="12" y="29" width="40" height="20" rx="2" fill="${KH}"/><path d="M32 29v20" stroke="${KS}"/><rect x="12" y="35" width="40" height="3.5" fill="${TEAL}"/>` + dust('M12 43h40v6H12z') +
      (done ? `<path d="M15 20h34l3 9H12z" fill="${KD}"/><path d="M15 20h34l1 3H14z" fill="#62575a"/><path d="M15 20h34" stroke="${KS}" stroke-width="1.5"/>`
        : `<path d="M15 20h34l3 9H12z" fill="${KT}"/><path d="M20 27v4M44 27v4" stroke="${KD}" stroke-width="3"/>` + dust('M17 22h18l-1 4H16z', 0.35)),
    // a six-wheeled scout rover that crashed nose down; salvaged, only its stripped frame is left
    wreck: done => (done
      ? shadow(25) + `<g transform="rotate(-8 32 44)"><rect x="10" y="35" width="42" height="11" rx="2" fill="#a39a90"/><path d="M13 38h9v5h-9zM26 38h10v5H26zM40 38h9v5h-9z" fill="${KD}"/>` +
        `<path d="M13 29h36l3 6H10z" fill="${KD}"/><path d="M18 29l-1 6M26 29v6M34 29v6M42 29l1 6" stroke="#a39a90" stroke-width="1.5"/><path d="M17 29v-4" stroke="#9a938c" stroke-width="2"/>` +
        `<rect x="10" y="44" width="14" height="1.5" fill="${TEAL}" opacity="0.7"/><path d="M16 46v3M30 46v3M45 46v3" stroke="${STRUT}" stroke-width="2"/></g>`
      : shadow(28) + dust('M5 53q8-7 20-3l1 3z', 0.55) + `<g transform="rotate(-8 32 44)"><rect x="10" y="30" width="42" height="12" rx="2.5" fill="${KH}"/>` +
        `<path d="M13 24h36l3 6H10z" fill="#55627a"/>` + dust('M13 24h36l3 6H10z', 0.5) + `<rect x="10" y="35" width="42" height="2.5" fill="${TEAL}"/>` +
        `<path d="M16 45l7-4 7 5" stroke="${STRUT}" stroke-width="1.8" fill="none"/><g fill="${KD}" stroke="${STRUT}" stroke-width="1.5"><circle cx="16" cy="45" r="5"/><circle cx="30" cy="46" r="5"/></g>` +
        `<path d="M46 42l2 5" stroke="${STRUT}" stroke-width="2"/><path d="M17 24v-8l7-3" stroke="#9a938c" stroke-width="2" fill="none"/><rect x="22" y="10" width="8" height="5" rx="1" fill="${STRUT}"/></g>` +
        `<ellipse cx="54" cy="51" rx="5" ry="3" fill="${KD}" stroke="${STRUT}" stroke-width="1.4"/>`),
    // a weather station: a box on a tripod with its own small panel; broken, the mast is snapped and its top leans over, a cup
    // in the dust; repaired, it stands straight, the panel is clean and the beacon is lit
    weather: done => shadow(22) +
      `<path d="M32 40 20 54M32 40l12 14" stroke="${STRUT}" stroke-width="2"/><path d="M15 51v-6" stroke="${STRUT}" stroke-width="1.6"/><path d="M8 45l4-7h10l-4 7z" fill="${done ? PANEL : '#4c5b76'}"/>` +
      (done ? `<path d="M10 41.5h10M15 38l-2 7" stroke="${GRID}" stroke-width="0.7" opacity="0.7"/>` : dust('M8 45l4-7h10l-4 7z', 0.6)) +
      `<path d="M32 40V27" stroke="#8f8780" stroke-width="1.6"/><rect x="24" y="41" width="16" height="10" rx="1.5" fill="${KH}"/><path d="M25 38h14l1 3H24z" fill="${KT}"/><rect x="24" y="45" width="16" height="2.5" fill="${TEAL}"/>` +
      (done ? weatherTop(true) : `<g transform="rotate(35 32 27)">${weatherTop(false)}</g><circle cx="50" cy="52" r="1.8" fill="${KH}"/>`),
    // a lattice comms mast; broken, a guy wire hangs and the dish droops; repaired, the dish looks up and the beacon is lit
    mast: done => shadow(19) +
      `<path d="M31 16 9 53${done ? 'M33 16l22 37' : 'M33 16q7 14 4 24'}" stroke="#9b938c" stroke-width="0.8" opacity="0.8" fill="none"/>` +
      `<path d="M21 50h22l3 4H18z" fill="${STRUT}"/><path d="M26 51 30.5 13M38 51 33.5 13" stroke="#857d76" stroke-width="2"/><path d="M26.6 46l10.6-6-9.9-5 9.3-6-8.7-5 8.1-6" stroke="#857d76" stroke-width="1.1" fill="none"/>` +
      `<rect x="26" y="42" width="12" height="8" rx="1" fill="${KH}"/><rect x="26" y="45" width="12" height="2.5" fill="${TEAL}"/><path d="M34 24h5" stroke="#857d76" stroke-width="1.6"/>` +
      (done ? `<ellipse cx="43" cy="20" rx="8" ry="3.6" transform="rotate(-40 43 20)" fill="${KH}"/><path d="M43 20l4-5" stroke="${KS}" stroke-width="1.2"/><path d="M50 9a7 7 0 0 1 5 5M52 5a11 11 0 0 1 7 8" stroke="${LIT}" stroke-width="1.2" fill="none" opacity="0.7"/>`
        : `<ellipse cx="41" cy="30" rx="8" ry="3.6" transform="rotate(70 41 30)" fill="${KS}"/><ellipse cx="41.6" cy="30" rx="6" ry="2.4" transform="rotate(70 41.6 30)" fill="#7d7268"/>`) +
      beacon(32, 11, done),
    // an abandoned hab pod: its roof from outside; inside (the roof hidden), its room. Drawn for a 5×5 footprint: a ring of
    // wall one tile thick, a 3×3 room, and the door in the middle of the south wall
    pod: (done, inside) => `<ellipse cx="32" cy="58" rx="31" ry="5" fill="#000" opacity="0.32"/>` +
      `<rect x="2" y="44" width="60" height="15" rx="4" fill="${KS}"/><rect x="2" y="49" width="60" height="2.5" fill="${TEAL}"/><rect x="26" y="45" width="12" height="14" rx="1.5" fill="${KD}"/>` +
      `<circle cx="13" cy="54.5" r="2.2" fill="${WIN}" stroke="${KH}"/><circle cx="51" cy="54.5" r="2.2" fill="${WIN}" stroke="${KH}"/>` +
      (inside
        ? `<rect x="2" y="3" width="60" height="45" rx="9" fill="#b9ad9d"/><rect x="13" y="13" width="38" height="33" fill="#6d625c"/><rect x="13" y="13" width="38" height="5" fill="#4f4542"/>` +
          `<path d="M13 31h38M26 18v28M38 18v28" stroke="#5c524d" stroke-width="0.8"/><rect x="14" y="21" width="9" height="18" rx="1.5" fill="#8c8076"/><rect x="15" y="22" width="7" height="5" rx="1" fill="#c9bfb3"/>` +
          `<rect x="27" y="13" width="12" height="7" rx="1" fill="#3a3436"/><rect x="29" y="14.5" width="8" height="3" fill="${LIT}" opacity="0.65"/>` +
          `<rect x="44" y="20" width="6" height="12" rx="3" fill="#86b8ea"/><circle cx="47" cy="34" r="1.3" fill="${LIT}"/><rect x="42" y="37" width="8" height="8" rx="1" fill="${KS}"/>` + dust('M26 46q6-5 12 0z', 0.5)
        : `<rect x="2" y="3" width="60" height="45" rx="9" fill="#c9bdad"/><rect x="2" y="12" width="60" height="13" fill="${KT}"/><rect x="2" y="33" width="60" height="6" fill="#b4a898"/>` +
          `<path d="M14 4v43M26 3v45M38 3v45M50 4v43" stroke="${KS}" stroke-width="0.8" opacity="0.7"/><rect x="40" y="14" width="12" height="8" rx="2" fill="${KS}"/><rect x="42" y="16" width="8" height="4" rx="1" fill="#837768"/>` +
          dust('M6 22q7-4 14-1t12 0v3H6z', 0.3) + dust('M36 36q8-3 16 0v3H36z', 0.3) + `<path d="M10 12V2.4" stroke="${STRUT}" stroke-width="1.4"/>` + beacon(10, 2.4, false)),
    // a dusty solar array of three panels; salvaged, two panels are gone and the one left is wiped clean
    array: done => shadow(28) + [0, 1, 2].map(i => {
      const x = 6 + i * 18, gone = done && i > 0;
      const panel = `M${x} 44l5-13h14l-5 13z`;
      return `<path d="M${x + 4} 44v7M${x + 12} 44v6" stroke="${STRUT}" stroke-width="1.6"/>` +
        (gone ? `<path d="${panel}" fill="none" stroke="${STRUT}" stroke-width="1.4"/>`
          : `<path d="${panel}" fill="${PANEL}"/><path d="M${x + 3} 37.5h14M${x + 9} 31l-5 13" stroke="${GRID}" stroke-width="0.8" opacity="0.7"/>` + (done ? '' : dust(panel, 0.75)));
    }).join('') + `<rect x="52" y="47" width="7" height="6" rx="1" fill="${TEAL}"/>`,
  };

  // Natural formations (spec §3.7), real geology in regolith tones: lit top, face, shade and deep shade.
  const R0 = '#c4916a', R1 = '#a06a4b', R2 = '#7a4a34', R3 = '#4f2f23';
  const FORMATION_ART = {
    // a thin span over a wide opening, the ground showing through it
    arch: shadow(28) + `<path d="M4 54 5 44 3 36l4-8 3-6 6-6 8-3 10-1 10 1 8 4 4 5 1 8-2 8 3 8-1 8zM19 54l-1-10 2-10 4-8 8-5 8 1 5 6 2 10-1 8 1 8z" fill="${R1}" fill-rule="evenodd"/>` +
      `<path d="M10 22l6-6 8-3 10-1 10 1 8 4 4 5-6-1-8-3-9-1-9 1-8 2z" fill="${R0}"/><path d="M52 17l4 5 1 8-2 8 3 8-1 8h-5l1-8-2-8 1-8-1-8z" fill="${R2}"/>` +
      `<path d="M19 54l-1-10 2-10 4-8 8-5-2 4-5 5-2 8-1 8 1 8z" fill="${R3}"/><path d="M5 44h12M48 44h8M7 32h11M49 30h7" stroke="${R3}" stroke-width="0.8" opacity="0.5"/>`,
    // three wind-carved ridges in a row: a blunt head into the wind (from the left), a long tail, grooves along the flanks
    yardang: [[14, 30, 43, 6, 9], [6, 43, 54, 9, 12], [20, 54, 32, 5, 7]].map(([x, y, l, d, h]) =>
      `<ellipse cx="${x + l / 2}" cy="${y + 0.5}" rx="${l / 2 + 1}" ry="2" fill="#000" opacity="0.3"/><path d="M${x} ${y}c0-${h - 4} 2-${h - 1} ${d}-${h}l${l - d} ${h - 2}v2z" fill="${R1}"/>` +
      `<path d="M${x} ${y}c0-${h - 4} 2-${h - 1} ${d}-${h}l${l - d} ${h - 2}-${l - d - 1}-${h - 5}c-3 0-${d - 1} 2-${d} ${h - 5}z" fill="${R0}"/><path d="M${x + d + 2} ${y - 3}l${l - d - 6} 2" stroke="${R2}" stroke-width="0.8" opacity="0.7"/>`).join(''),
    hoodoo: shadow(22) +
      `<path d="M21 54c1-9-2-15 0-23s-1-11 1-17h8c2 6-1 10 0 17s-1 14 1 23z" fill="${R1}"/><path d="M26 14h4c2 6-1 10 0 17s-1 14 1 23h-5z" fill="${R2}"/><ellipse cx="26" cy="14" rx="7.5" ry="3.4" fill="${R3}"/><ellipse cx="25.5" cy="12.8" rx="6.5" ry="2.3" fill="${R0}"/>` +
      `<path d="M38 54c1-7-1-11 0-17s-1-8 0-11h7c1 3-1 6 0 11s-1 10 1 17z" fill="${R1}"/><path d="M42 26h3c1 3-1 6 0 11s-1 10 1 17h-4z" fill="${R2}"/><ellipse cx="41.5" cy="26" rx="6" ry="2.8" fill="${R3}"/><ellipse cx="41" cy="25" rx="5" ry="1.9" fill="${R0}"/>` +
      `<path d="M10 54c1-6-1-9 0-13s0-5 1-7h5c1 2-1 4 0 7s0 7 1 13z" fill="${R1}"/><ellipse cx="13.5" cy="34" rx="4.8" ry="2.2" fill="${R3}"/><ellipse cx="13.2" cy="33.2" rx="4" ry="1.5" fill="${R0}"/>` +
      `<path d="M21 30h10M21 42h11M38 38h8M10 44h7" stroke="${R0}" stroke-width="1.2" opacity="0.6"/>`,
    // the oblong boulder of its fact: it tumbled down a slope, leaving a trail of dents behind it, and came to rest standing
    // on end, nearly twice as tall as it is wide
    balanced: shadow(16) +
      `<ellipse cx="18" cy="46" rx="2.6" ry="1.2" fill="${R3}" opacity="0.5"/><ellipse cx="12" cy="40" rx="2.2" ry="1" fill="${R3}" opacity="0.4"/><ellipse cx="7" cy="34.5" rx="1.8" ry="0.8" fill="${R3}" opacity="0.3"/>` +
      `<path d="M24 54 22 41 24 27 29 19 36 16 42 21 44 34 43 46 41 54z" fill="${R1}"/><path d="M24 54 22 41 24 27 29 19 36 16 32 22 28 34 27 54z" fill="${R0}"/>` +
      `<path d="M42 21 44 34 43 46 41 54H36L38 40 39 27z" fill="${R2}"/><path d="M30 28l3 4M33 45l2-5" stroke="${R2}" stroke-width="0.9" opacity="0.7"/><ellipse cx="47" cy="53" rx="3" ry="1.7" fill="${R2}"/>`,
    ventifact: shadow(24) + `<path d="M10 51 14 35l12-8 14 1 10 10 2 13z" fill="#4a4140"/><path d="M14 35l12-8 6 7-12 7z" fill="#7d716c"/><path d="M26 27l14 1 10 10-18-4z" fill="#605654"/>` +
      `<path d="M40 28l10 10 2 13-12-4z" fill="#2f2928"/><path d="M16 41l8-5M17 45l9-6M19 49l8-5" stroke="#2a2423" stroke-width="0.9"/>` +
      `<path d="M41 55l3-8 8-2 6 5-1 5z" fill="#4a4140"/><path d="M44 47l8-2 2 4-9 1z" fill="#7d716c"/><path d="M15 36l10-7" stroke="#b3a59d" stroke-width="0.8" opacity="0.7"/>`,
    // an outcrop of soft and hard layers: a steep face on the left, ledges stepping down to the right, a ragged cap
    layered: shadow(30) + [[3, 61, 46, 8, '#a2603f'], [4, 57, 39, 7, '#c99f78'], [6, 52, 32, 7, R1], [8, 46, 26, 6, '#cfa883']].map(([a, b, y, h, c]) =>
      `<path d="M${a} ${y + h}l1-${h}h${b - a - 3}l2 ${h}z" fill="${c}"/><path d="M${a + 1} ${y + 0.6}h${b - a - 3}" stroke="#fff" stroke-width="1.2" opacity="0.2"/><path d="M${b - 7} ${y}h5l2 ${h}h-7z" fill="#000" opacity="0.18"/>`).join('') +
      `<path d="M9 26l1-5 4-1 3-2 8-1 3 2h7l4 2 3 2 1 3z" fill="${R2}"/><path d="M9 26l1-5 4-1 3-2 8-1v9z" fill="${R1}"/>` +
      `<path d="M34 39v-7M44 54v-8" stroke="${R3}" stroke-width="0.9" opacity="0.4"/><path d="M52 54l2-3h4l2 3zM6 54l2-2h3l1 2z" fill="${R2}"/>`,
    // dust-devil tracks: dark lanes where the devils scoured off the bright dust, each as wide all along as the devil that
    // made it, crossing one another; flat on the ground, and each ends inside the square, so no track is cut off at its edge
    deviltracks: `<g fill="none" stroke="#1d110d" stroke-linecap="round" opacity="0.26"><path d="M6 49C17 45 27 38 35 32C43 26 50 21 58 17" stroke-width="4"/>` +
      `<path d="M5 31C14 29 22 24 30 22C38 20 45 15 51 8" stroke-width="2.4"/><path d="M11 12C20 21 27 31 35 40C42 48 49 53 55 58" stroke-width="1.6"/>` +
      `<path d="M31 58C39 55 47 50 58 45" stroke-width="3"/></g>`,
  };

  // Landmark props (spec §3.6): the skylight into a lava tube, and the methane vent (its puffs: ventPuff).
  const PROP_ART = {
    // a collapse pit with no rim: cracks round it, the far wall lit inside, black below, a slope of rubble going in at the front
    skylight: `<ellipse cx="32" cy="34" rx="28" ry="18" fill="#000" opacity="0.12"/><path d="M5 30l7 2M59 38l-7-2M18 52l4-4M47 15l-3 4M8 42l6-2" stroke="#1a0f0c" stroke-width="1" opacity="0.45"/>` +
      `<ellipse cx="32" cy="34" rx="22" ry="14" fill="#0b0607"/><path d="M10 34a22 14 0 0 1 44 0c-5-5-13-8-22-8s-17 3-22 8z" fill="#4a2a1f"/><path d="M10 34a22 14 0 0 1 44 0c-4-6-12-11-22-11s-18 5-22 11z" fill="#7a4632"/>` +
      `<path d="M10 34a22 14 0 0 0 44 0" stroke="#b07a58" stroke-width="1.2" fill="none" opacity="0.5"/><path d="M25 48l3-6 4-3 4 3 3 6z" fill="#4e2c21"/><path d="M27 46h2M33 44h2M30 41h2" stroke="#8a5538" stroke-width="1.6"/>` +
      `<ellipse cx="9" cy="24" rx="3.5" ry="2.2" fill="${R2}"/><ellipse cx="55" cy="47" rx="3" ry="1.9" fill="${R2}"/><ellipse cx="47" cy="12" rx="2.4" ry="1.5" fill="${R2}"/>`,
    // a low mound split by a fissure, its lips crusted pale, in a faint pale halo
    vent: `<ellipse cx="32" cy="42" rx="27" ry="12" fill="#e3d3ab" opacity="0.14"/><path d="M8 46c4-6 14-10 24-10s20 4 24 10c-6 3-14 4-24 4S14 49 8 46z" fill="#8a5a40"/>` +
      `<path d="M10 45c5-5 13-8 22-8s17 3 22 8c-8-3-14-4-22-4s-15 1-22 4z" fill="#a87250"/><path d="M18 43l6-2 4 1 5-2 4 1 6-2 5 1" stroke="#1a0f0c" stroke-width="2" fill="none" stroke-linejoin="round" stroke-linecap="round"/>` +
      `<path d="M19 41.4l5-2 4 1 5-2 4 1 6-2" stroke="#efe4c4" stroke-width="1" fill="none" opacity="0.7"/><path d="M13 47l5-2M46 45l5 2" stroke="#1a0f0c" stroke-width="1" opacity="0.6"/>` +
      `<ellipse cx="22" cy="46.5" rx="3" ry="1.1" fill="#efe4c4" opacity="0.45"/><ellipse cx="42" cy="46" rx="2.5" ry="1" fill="#efe4c4" opacity="0.45"/><ellipse cx="11" cy="50" rx="2.6" ry="1.6" fill="${R2}"/><ellipse cx="53" cy="49" rx="2.2" ry="1.4" fill="${R2}"/>`,
  };

  // opts: { done } opened, salvaged or repaired; { inside } the hab pod's room, drawn while you are in it (its roof hidden).
  function kestrel(id, size, opts) {
    const o = opts || {};
    return svg64(size, KESTREL_ART[own(KESTREL_ART, id) ? id : 'cache'](!!o.done, !!o.inside));
  }
  function formation(id, size) { return svg64(size, FORMATION_ART[own(FORMATION_ART, id) ? id : 'ventifact']); }
  function prop(id, size) { return svg64(size, PROP_ART[own(PROP_ART, id) ? id : 'vent']); }

  // The methane vent's puff, drawn over prop('vent') in the same square: three wisps rise from the fissure, grow and fade,
  // a third of a cycle apart, so phase 1 looks like phase 0 and the loop never jumps. Any phase is safe (not a number: 0).
  function ventPuff(phase, size) {
    const p = Number.isFinite(phase) ? phase - Math.floor(phase) : 0;
    let o = '';
    for (let i = 0; i < 3; i++) {
      const q = (p + i / 3) % 1, x = 33 + q * 10, y = 40 - q * 30, r = 2.5 + q * 8, a = (q * (1 - q) * 1.6).toFixed(2);
      o += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="#efe6dc" opacity="${a}"/>` +
        `<circle cx="${(x - r * 0.6).toFixed(1)}" cy="${(y + r * 0.4).toFixed(1)}" r="${(r * 0.7).toFixed(1)}" fill="#efe6dc" opacity="${a}"/>`;
    }
    return svg64(size, o);
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
      // Phobos, in the clear sky on the right: over the wordmark, under the left fade, it read as a smudge
      `<g transform="translate(1068 92)"><path d="M318 132c9-6 23-4 28 5s0 19-10 22-26 1-28-9 1-13 10-18z" fill="#a8998e"/><circle cx="330" cy="143" r="2.4" fill="#7d6f66"/><circle cx="338" cy="151" r="1.5" fill="#7d6f66"/></g>` +
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

  root.SolArt = { icon, module, moduleInner, itemArt, portrait, landscape, ROLE, kestrel, formation, prop, ventPuff };
})(typeof self !== 'undefined' ? self : this);
