// Regression check for extensions/wmpotify-compat.js + extensions/wmpotify-skin.js. Not loaded by Spotify.
// Run: install (./install.sh), launch Spotify with --remote-debugging-port=9222, then `node dev/check.mjs [dark|light|player|crash]`.
// Every check runs in both of the theme's modes, light and dark (switched with the same attribute the
// theme itself sets). The last step reproduces the real Spicetify startup crash: it minimises the Spotify
// window, reloads the page a few times, then restores the window. Exits 1 if anything fails.
const connect = async (url) => {
  const ws = new WebSocket(url);
  await new Promise((r) => (ws.onopen = r));
  let id = 0;
  const pending = new Map();
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    const done = pending.get(m.id);
    if (done) { pending.delete(m.id); done(m); }
  };
  const send = (method, params = {}) => new Promise((resolve) => {
    const i = ++id;
    pending.set(i, resolve);
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  return { send, close: () => ws.close() };
};
const target = (await (await fetch('http://localhost:9222/json')).json()).find((t) => t.type === 'page');
const page = await connect(target.webSocketDebuggerUrl);
const browser = await connect((await (await fetch('http://localhost:9222/json/version')).json()).webSocketDebuggerUrl);
const cdp = page.send;
const evaluate = async (fn, ...args) => {
  const m = await cdp('Runtime.evaluate', {
    expression: `(${fn})(...${JSON.stringify(args)})`, returnByValue: true, awaitPromise: true });
  if (m.error) throw new Error(m.error.message);
  if (m.result.exceptionDetails) throw new Error(m.result.exceptionDetails.exception?.description || 'eval error');
  return m.result.result.value;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const failures = [];
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
  if (!ok) failures.push(name);
};

const go = async (path) => {
  await evaluate((p) => { Spicetify.Platform.History.push(p); }, path);
  await sleep(3500);
};
const scrollTo = async (y) => {
  await evaluate((y) => {
    const sc = [...document.querySelectorAll('#main-view *')]
      .filter((e) => e.scrollHeight > e.clientHeight + 50 && /auto|scroll/.test(getComputedStyle(e).overflowY))
      .sort((a, b) => b.clientHeight - a.clientHeight)[0];
    sc.scrollTop = y;
  }, y);
  await sleep(700);
};
// Polls: theme init is slow while the window is hidden (timers throttled to 1/s).
const waitForInit = async () => {
  for (let t = 0; t < 120; t++) {
    try {
      if (await evaluate(() => document.documentElement.dataset.wmpotifyInitComplete === 'true'
        || !!document.getElementById('wmpotify-error-dialog'))) break;
    } catch { /* page is mid-navigation */ }
    await sleep(1000);
  }
  return evaluate(() => ({
    done: document.documentElement.dataset.wmpotifyInitComplete === 'true',
    err: !!document.getElementById('wmpotify-error-dialog'),
  }));
};

const init = await waitForInit();
check('theme init complete, no error dialog', init.done && !init.err, JSON.stringify(init));

async function suite(scheme) {
  const T = (name) => `[${scheme}] ${name}`;
  const wantDark = scheme === 'dark';
  // any CSS colour ("#222", "#eef3fa", ...) -> "rgb(r, g, b)", resolved by the browser
  await evaluate(() => {
    window.__resolveColour = (css) => {
      const probe = document.body.appendChild(document.createElement('i'));
      probe.style.color = css;
      const rgb = getComputedStyle(probe).color;
      probe.remove();
      return rgb;
    };
  });
  await evaluate((dark) => {
    if (dark) document.documentElement.dataset.wmpotifyDarkMode = 'true';
    else delete document.documentElement.dataset.wmpotifyDarkMode;
  }, wantDark);
  await sleep(6000); // colours cross-fade for a few seconds

  // 1. Theme style
  const style = await evaluate(() => document.documentElement.dataset.wmpotifyStyle);
  check(T('theme style is aero'), style === 'aero', String(style));

  // 2. Frame + palette: light = WMP12 glass with dark text, dark = stock black glass with light text
  await go('/collection/tracks');
  const look = await evaluate(() => {
    const v = (k) => getComputedStyle(document.documentElement).getPropertyValue(k).trim();
    const lum = (css) => {
      const [r, g, b] = css.match(/[\d.]+/g).slice(0, 3).map(Number).map((c) => {
        c /= 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const color = (sel) => getComputedStyle(document.querySelector(sel)).color;
    const titleLum = lum(color('main [data-testid="entityTitle"] h1'));
    const bgLum = lum(window.__resolveColour(v('--spice-main')));
    const info = document.querySelector('.wmpotify-track-info');
    return {
      navSprite: (v('--nav').match(/image\/[a-z+]+/) || [''])[0],
      tabLabelLum: +lum(color('#wmpotify-tabs-container .wmpotify-tab-label')).toFixed(2),
      windowTitleLum: +lum(color('#wmpotify-title-text')).toFixed(2),
      titleStrip: getComputedStyle(document.querySelector('#wmpotify-title-bar'), '::before').backgroundImage.slice(0, 15),
      main: v('--spice-main'), text: v('--spice-text'), accent: v('--spice-accent'),
      contentContrast: +((Math.max(titleLum, bgLum) + 0.05) / (Math.min(titleLum, bgLum) + 0.05)).toFixed(1),
      trackInfoGlow: info ? getComputedStyle(info).textShadow : 'n/a',
    };
  });
  if (wantDark) {
    check(T('frame: stock black glass, light tab/title text'),
      look.navSprite === 'image/png' && look.tabLabelLum > 0.7 && look.windowTitleLum > 0.7, JSON.stringify(look));
    check(T('palette: soft dark'), look.text === '#d6dce5' && look.accent === '#5aa7ee', JSON.stringify(look));
    check(T('player text has no white glow on the dark bar'), look.trackInfoGlow === 'none' || look.trackInfoGlow === 'n/a', look.trackInfoGlow);
  } else {
    check(T('frame: WMP12 light glass, dark tab/title text'),
      look.navSprite === 'image/svg+xml' && look.tabLabelLum < 0.15 && look.windowTitleLum < 0.15
      && look.titleStrip.startsWith('linear-gradient'), JSON.stringify(look));
    check(T('palette: soft light'), look.text === '#1c2530' && look.accent === '#2f7fd6', JSON.stringify(look));
  }
  check(T('content text contrast >= 7:1'), look.contentContrast >= 7, String(look.contentContrast));

  // the "Add to Liked Songs" (+) in the player bar must be visible against the bar (UI icons need 3:1)
  const like = await evaluate(() => {
    const b = document.querySelector('.main-nowPlayingBar-left button[aria-checked="false"]');
    if (!b) return null; // current track is already liked: nothing to measure
    const lum = (rgb) => {
      const [r, g, bl] = rgb.match(/[\d.]+/g).slice(0, 3).map(Number).map((c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
      return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
    };
    const icon = getComputedStyle(b.querySelector('svg')).color;
    const bar = window.__resolveColour(getComputedStyle(document.documentElement).getPropertyValue('--spice-main').trim());
    const [a, c] = [lum(icon), lum(bar)];
    return { icon, bar, contrast: +((Math.max(a, c) + 0.05) / (Math.min(a, c) + 0.05)).toFixed(1) };
  });
  if (like) check(T('player: "Add to Liked Songs" icon visible (contrast >= 3:1)'), like.contrast >= 3, JSON.stringify(like));

  // 3. Track-list pages: sticky column header never covered, topbar strip never empty, no cover-colour fill
  for (const page of ['/collection/tracks', '/album/4aawyAB9vmqN3uQ7FjRGTy']) {
    await go(page);
    for (let t = 0; t < 20 && !(await evaluate(() => !!document.querySelector('.main-trackList-trackListHeader'))); t++) await sleep(500);
    // the header layers are either unpainted (light) or the plain page colour (dark) — never the cover colour
    const bg = await evaluate(() => {
      const pageColour = window.__resolveColour(getComputedStyle(document.documentElement).getPropertyValue('--spice-main').trim());
      const fills = [...document.querySelectorAll('[data-testid="entity-header"] > div:not(.main-entityHeader-contentWrapper)')]
        .map((e) => ({ colour: getComputedStyle(e).backgroundColor, image: getComputedStyle(e).backgroundImage }));
      return { pageColour, fills, ok: fills.every((f) => f.image === 'none' && ['rgba(0, 0, 0, 0)', pageColour].includes(f.colour)) };
    });
    check(T(`${page}: no cover-colour fill behind header`), bg.ok, bg.ok ? '' : JSON.stringify(bg));
    const bad = [];
    for (const y of [0, 60, 90, 140, 200, 300, 600, 1200]) {
      await scrollTo(y);
      const s = await evaluate(() => {
        const hdr = document.querySelector('.main-trackList-trackListHeader');
        const tb = document.querySelector('.main-topBar-container');
        const tbVisible = !!tb && getComputedStyle(tb).display !== 'none' && +getComputedStyle(tb).opacity > 0;
        const tbBg = tb?.querySelector('.main-topBar-background');
        const r = hdr.getBoundingClientRect();
        const top = document.elementFromPoint(r.left + 60, r.top + r.height / 2);
        const title = tb?.querySelector('.main-entityHeader-topbarTitle');
        return {
          hdrTop: Math.round(r.top),
          hdrVisible: !!top && hdr.contains(top),
          titleShown: !tbVisible || !title || getComputedStyle(title).opacity === '1',
          // a visible strip must be opaque, or the header scrolling underneath shows through it
          stripSolid: !tbVisible || (!!tbBg && getComputedStyle(tbBg).opacity === '1' && /^rgb\(/.test(getComputedStyle(tbBg).backgroundColor)),
        };
      });
      if (!s.hdrVisible || !s.titleShown || !s.stripSolid) bad.push(`@${y} ${JSON.stringify(s)}`);
    }
    check(T(`${page}: column header never covered, sticky strip whole and opaque whenever visible (8 scroll positions)`), !bad.length, bad.join('; '));
  }

  // 4. Filter box magnifier, seek handle
  await go('/collection/tracks');
  const mag = await evaluate(() => [...document.querySelectorAll('[role="search"] > button')]
    .every((b) => getComputedStyle(b).display === 'none'));
  check(T('filter box: Spotify expand-magnifier hidden'), mag);
  const handle = await evaluate(() => getComputedStyle(document.querySelector('[data-testid="playback-progressbar"] .progress-bar__slider')).display);
  check(T('seek handle visible'), handle !== 'none', handle);

  // 5. Right panel shadow: present, cast left only, below popovers
  const panel = await evaluate(() => {
    const sb = document.querySelector('.Root__right-sidebar');
    if (!sb || !sb.querySelector(':scope > .Root__right-sidebar-expanded')) return { skip: true };
    const c = getComputedStyle(sb);
    return { shadow: c.boxShadow !== 'none', clipped: c.clipPath !== 'none', z: +c.zIndex };
  });
  if (!panel.skip) check(T('right panel shadow, clipped to the left, z below popovers (7)'), panel.shadow && panel.clipped && panel.z < 7, JSON.stringify(panel));

  // Animated cover (Canvas) in the Now Playing panel: its bottom fade must match the panel, not Spotify's black
  const canvas = await evaluate(() => {
    if (!document.querySelector('#Desktop_PanelContainer_Id video')) return null;
    const scrim = document.querySelector('#Desktop_PanelContainer_Id div:has(> div > video) > div:not(:has(video)) > div:nth-child(2)');
    return scrim ? getComputedStyle(scrim).backgroundImage : null;
  });
  if (canvas) check(T('animated cover: bottom fade matches the panel'), !/oklch/.test(canvas) && (wantDark ? /34, 34, 34/ : /238, 243, 250/).test(canvas), canvas.slice(0, 80));

  // 6. Home carousels: no edge fades
  await go('/');
  const fades = await evaluate(() => [...document.querySelectorAll('#main-view [style*="--scrollAnimationRangeStart"]')]
    .every((e) => getComputedStyle(e, '::after').display === 'none' && getComputedStyle(e, '::before').display === 'none'));
  check(T('home carousels: edge fades hidden'), fades);

  // 7. Lyrics, both views: /lyrics page and the cinema overlay opened by the Lyrics button
  const lyricsState = () => evaluate((wantDark) => {
    const lines = [...document.querySelectorAll('[style*="--lyrics-color-active"] [dir="auto"]')]
      .filter((e) => e.getBoundingClientRect().width > 0 && !e.closest('[data-testid="lyrics-npv-section"]'));
    const cin = document.querySelector('[style*="--cinema-mode-bg-color-from"]');
    const host = cin?.closest('[data-overlayscrollbars="host"]')
      ?? document.querySelector('#main-view .main-view-container__scroll-node');
    const vp = host.firstElementChild;
    // zero lines means Spotify rendered no lyrics at all (none for this track, or still loading), so there is nothing of ours to test
    const noLyrics = lines.length === 0;
    return {
      noLyrics,
      lines: lines.length,
      fontOk: lines.length > 0 && lines.every((e) => getComputedStyle(e).fontSize === '30px'),
      cinema: !!cin,
      cinemaFillCleared: !cin || !/rgb\(/.test(getComputedStyle(cin.firstElementChild).backgroundImage.replace(/rgba\(0, 0, 0, 0\)/g, '')),
      backdrop: /gradient/.test(getComputedStyle(cin ? host : document.querySelector('#main-view')).backgroundImage),
      scrollbarPx: vp.offsetWidth - vp.clientWidth,
      // no outline/rounded corners on the cinema layers (the outline used to hang over the toolbar above)
      framed: !!cin && [host, host.parentElement].some((e) => getComputedStyle(e).outlineStyle !== 'none' || getComputedStyle(e).borderRadius !== '0px'),
      // light backdrop in light mode, dark in dark mode
      tone: ((cin ? host : document.querySelector('#main-view')), (/rgb\((\d+)/.exec(getComputedStyle(cin ? host : document.querySelector('#main-view')).backgroundImage.replace(/rgba\([^)]*\)/g, '')) || [0, -1])[1] > 128) === !wantDark,
    };
  }, wantDark);
  await go('/lyrics');
  const lp = await lyricsState();
  if (lp.noLyrics) console.log(`SKIP  ${T('lyrics page')}: the playing track has no lyrics`);
  else check(T('lyrics page: backdrop in the mode\'s tone, 30px lines, no scrollbar'), lp.backdrop && lp.tone && lp.fontOk && lp.scrollbarPx === 0, JSON.stringify(lp));
  await go('/collection/tracks');
  await evaluate(() => document.querySelector('[data-testid="lyrics-button"]').click());
  await sleep(2500);
  const lc = await lyricsState();
  if (lc.noLyrics) console.log(`SKIP  ${T('lyrics cinema')}: the playing track has no lyrics`);
  else check(T('lyrics cinema (Lyrics button): backdrop in the mode\'s tone, cover fill cleared, 30px lines, no scrollbar, no outline/rounded corners'),
    lc.cinema && lc.cinemaFillCleared && lc.backdrop && lc.tone && lc.fontOk && lc.scrollbarPx === 0 && !lc.framed, JSON.stringify(lc));
  await evaluate(() => document.querySelector('[data-testid="lyrics-button"]').click());
  await sleep(1000);
}

const only = process.argv[2]; // optional: dark | light | crash — run just that part
const timeOrigin = () => evaluate(() => performance.timeOrigin);
const startOrigin = await timeOrigin();
const wasDark = await evaluate(() => document.documentElement.dataset.wmpotifyDarkMode === 'true');
try {
  if (!only || only === 'dark') await suite('dark');
  if (!only || only === 'light') await suite('light');
} finally {
  await evaluate((dark) => {
    if (dark) document.documentElement.dataset.wmpotifyDarkMode = 'true';
    else delete document.documentElement.dataset.wmpotifyDarkMode;
  }, wasDark);
}
check('no spurious reload while Spicetify is healthy (whole run so far)', (await timeOrigin()) === startOrigin);

// 7b. Player controls survive the theme's own Stop button. Stop ends the session and Spotify rebuilds the
//     control groups; the theme's Repeat/Stop buttons and the moved volume bar used to be lost for good
//     (empty pill, bare grey volume line). NOTE: this stops playback, then starts the artist back up.
if (!only || only === 'player') {
  const controls = () => evaluate(() => {
    const gc = document.querySelector('[data-testid="general-controls"]');
    const left = gc?.children[0], right = gc?.lastElementChild;
    const vol = document.querySelector('[data-testid="volume-bar"]');
    const shown = (e) => !!e && e.getBoundingClientRect().width > 0;
    return {
      repeat: shown(document.getElementById('wmpotify-repeat-button')) && left.contains(document.getElementById('wmpotify-repeat-button')),
      stop: shown(document.getElementById('wmpotify-stop-button')) && left.contains(document.getElementById('wmpotify-stop-button')),
      volume: shown(vol) && right.contains(vol),
      mute: shown(vol?.querySelector('[data-testid="volume-bar-toggle-mute-button"]')),
      handle: shown(vol?.querySelector('.progress-bar__slider')),
      groupId: left && [...document.querySelectorAll('*')].indexOf(left),
    };
  });
  const before = await controls();
  check('player: repeat, stop, volume bar present before Stop', before.repeat && before.stop && before.volume && before.mute && before.handle, JSON.stringify(before));
  await evaluate(() => document.getElementById('wmpotify-stop-button').click());
  await sleep(5000);
  await evaluate(() => Spicetify.Player.playUri('spotify:artist:6yR6M6V6I7GhhYf6A7Wif9'));
  await sleep(6000);
  const afterStop = await controls();
  check('player: repeat, stop, volume bar back after Stop + resume', afterStop.repeat && afterStop.stop && afterStop.volume && afterStop.mute && afterStop.handle, JSON.stringify(afterStop));
  const works = await evaluate(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const rep = document.getElementById('wmpotify-repeat-button');
    if (!rep || !document.querySelector('[data-testid="volume-bar-toggle-mute-button"]')) return { repeatClickWorks: false, muteWorks: false, volumeRestored: false, missing: true };
    const was = rep.getAttribute('aria-checked');
    rep.click(); await wait(1200);
    const changed = rep.getAttribute('aria-checked') !== was;
    rep.click(); await wait(800); rep.click(); await wait(800); // cycle back to off
    const mute = document.querySelector('[data-testid="volume-bar-toggle-mute-button"]');
    const v0 = Spicetify.Player.getVolume();
    mute.click(); await wait(1000);
    const muted = Spicetify.Player.getVolume() !== v0;
    mute.click(); await wait(1000);
    return { repeatClickWorks: changed, muteWorks: muted, volumeRestored: Math.abs(Spicetify.Player.getVolume() - v0) < 0.02 };
  });
  check('player: restored buttons actually work (repeat toggles, mute toggles and restores)', works.repeatClickWorks && works.muteWorks && works.volumeRestored, JSON.stringify(works));
}

// 8. Spicetify startup-crash recovery (compat), on the real crash. A page load in a hidden window usually
//    kills Spicetify's init (see compat). Expect: nothing reloads while hidden; once the window is visible
//    compat reloads and the theme comes back.
const { windowId, bounds: original } = (await browser.send('Browser.getWindowForTarget', { targetId: target.id })).result;
const setWindow = (windowState) => browser.send('Browser.setWindowBounds', { windowId, bounds: { windowState } });
// Puts the window back exactly as it was found (and makes it visible). A maximised window that is covered
// by other windows reports "fullscreen" with the menu-bar offset still in its bounds; that is "maximized".
const restoreWindow = async () => {
  await setWindow('normal');
  const { left, top, width, height, windowState } = original;
  if (windowState === 'normal') await browser.send('Browser.setWindowBounds', { windowId, bounds: { left, top, width, height } });
  else await setWindow(windowState === 'fullscreen' && top > 0 ? 'maximized' : windowState);
};
if (!only || only === 'crash') try {
  await setWindow('normal'); // a maximised/fullscreen window can't be minimised directly
  await setWindow('minimized');
  await sleep(1500);
  let died = false;
  for (let attempt = 0; attempt < 6 && !died; attempt++) {
    await cdp('Page.reload');
    await sleep(12000); // UI is up in ~1s; a healthy init fires webpackLoaded about a second later
    died = await evaluate(() => !!document.querySelector('[data-testid="now-playing-bar"]')
      && Spicetify.Events.webpackLoaded.callbacks !== undefined);
  }
  if (!died) {
    console.log('SKIP  crash recovery: Spicetify init survived 6 hidden reloads, nothing to recover from');
  } else {
    const origin = await timeOrigin();
    await sleep(20000);
    const hidden = await evaluate(() => ({ hidden: document.hidden, origin: performance.timeOrigin }));
    check('crash recovery: no reload while the window is hidden', hidden.hidden && hidden.origin === origin, JSON.stringify(hidden));
    await restoreWindow();
    let reloaded = false;
    for (let t = 0; t < 40 && !reloaded; t++) {
      await sleep(1000);
      try { reloaded = (await timeOrigin()) !== origin; } catch { /* mid-navigation */ }
    }
    check('crash recovery: reloads once the window is visible', reloaded);
    const after = await waitForInit();
    const counter = await evaluate(() => localStorage.getItem('wmpotify-compat-recovery'));
    check('crash recovery: theme is back, attempt counter cleared', after.done && !after.err && counter === null,
      JSON.stringify({ ...after, counter }));
  }
} finally {
  await restoreWindow();
}

page.close();
browser.close();
console.log(failures.length ? `\n${failures.length} FAILED:\n  ${failures.join('\n  ')}` : '\nALL PASS');
process.exit(failures.length ? 1 : 0);
