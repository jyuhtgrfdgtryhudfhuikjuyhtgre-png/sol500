'use strict';
// Check mode for the desktop app (driven by tools/app-smoke.js): looks at the page, writes one JSON file, quits.
const fs = require('node:fs');

async function run({ win, port, app, startOnline }) {
  const out = { port, ok: false };
  try {
    if (win.webContents.isLoading()) await new Promise(r => win.webContents.once('did-finish-load', r));
    await new Promise(r => setTimeout(r, 1500));
    out.page = await win.webContents.executeJavaScript(`({
      title: document.title, ui: !!window.SolUI, app: !!window.solApp,
      lan: !!(window.SolUI && SolUI.store.lanInfo),
      addresses: (window.SolUI && SolUI.store.lanInfo && SolUI.store.lanInfo.addresses) || [],
      keys: [...document.querySelectorAll('[data-k]')].map(b => b.getAttribute('data-k')),
    })`);
    if (process.env.SOL_SMOKE_ONLINE && startOnline) out.online = await startOnline();
    out.ok = !!(out.page.ui && out.page.app && out.page.lan && out.page.keys.includes('host-game') &&
      (!process.env.SOL_SMOKE_ONLINE || (out.online && out.online.url)));
    fs.writeFileSync(process.env.SOL_SMOKE_OUT, JSON.stringify(out)); // written early so a long --stay run can be read
    if (process.env.SOL_SMOKE_SHOT) fs.writeFileSync(process.env.SOL_SMOKE_SHOT, (await win.webContents.capturePage()).toPNG());
  } catch (e) {
    out.error = String((e && e.message) || e);
    out.ok = false;
  }
  fs.writeFileSync(process.env.SOL_SMOKE_OUT, JSON.stringify(out));
  const stay = Number(process.env.SOL_SMOKE_STAY) || 0;
  setTimeout(() => app.exit(out.ok ? 0 : 1), stay * 1000);
}

module.exports = { run };
