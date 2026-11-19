// WMPotify compat — makes WMPotify 1.2.7 work on Spotify 1.3.10 / Spicetify 2.46.7. Nothing cosmetic here
// (look-and-feel lives in wmpotify-skin.js).
//   1. Re-adds the legacy Spicetify class names Spotify 1.3.10 dropped (css-map gap), anchored on ids /
//      data-testid rather than hashed classes, so the theme's own selectors and layout work again.
//   2. A few CSS fixes for things 1.3.10 does differently.
//   3. Recovers from a Spicetify startup crash that leaves the app with no theme at all.
//   4. Puts the theme's Repeat/Stop buttons and the volume bar back after Spotify rebuilds the player controls
//      (see reattachPlayerControls).
// Regression check: ../dev/check.mjs
(function wmpotifyCompat() {
  const NPB = '[data-testid="now-playing-bar"]';

  // --- 3. Spicetify startup crash -------------------------------------------------------------------
  // spicetifyWrapper eagerly requires every registered webpack module at startup. If it gets to that late
  // — which it does when the page loads in a hidden/occluded window, where its 50ms polls are throttled to
  // 1s — lazily loaded modules are already registered, one of them needs a chunk that isn't there yet, and
  // it throws "Cannot read properties of undefined (reading 'call')". Nothing catches that, so the rest of
  // Spicetify's init never runs: no Spicetify.showNotification, Marketplace never starts, no theme.
  // Measured here: 5 of 6 reloads in a hidden window died this way; visible loads did not.
  //
  // Detection is by state, not by catching the rejection: extensions are deferred behind the app, so the
  // crash is usually over before any listener of ours exists. Spicetify.Events.webpackLoaded fires at the
  // very end of the phase that dies (about a second after the UI appears) and never fires if it died.
  // Recovery is a reload while the window is visible — reloading a hidden window just crashes again — so a
  // dead start heals the moment the window is looked at. At most twice per 5 minutes; the counter lives in
  // localStorage because Marketplace clears sessionStorage on every load.
  const RECOVERY = 'wmpotify-compat-recovery'; // "<attempts>:<timestamp of the last one>"
  const webpackLoaded = window.Spicetify?.Events?.webpackLoaded;
  if (webpackLoaded) {
    let spicetifyUp = false;
    webpackLoaded.on(() => { spicetifyUp = true; localStorage.removeItem(RECOVERY); });
    let uiSince = 0;
    const watchdog = setInterval(() => {
      if (spicetifyUp) return clearInterval(watchdog);
      if (!uiSince) { if (document.querySelector(NPB)) uiSince = Date.now(); return; }
      if (Date.now() - uiSince < 15000 || document.hidden) return;
      clearInterval(watchdog);
      const [n, at] = (localStorage.getItem(RECOVERY) || '0:0').split(':').map(Number);
      const attempts = Date.now() - at < 5 * 60000 ? n : 0;
      if (attempts >= 2) return;
      localStorage.setItem(RECOVERY, `${attempts + 1}:${Date.now()}`);
      location.reload();
    }, 1000);
  }

  // --- 1. Legacy class names ------------------------------------------------------------------------
  // [selector, legacy class, climb N parents]
  const MAP = [
    ['.Root', 'Root__top-container'],
    ['#global-nav-bar', 'Root__globalNav'],
    ['#main-view', 'Root__main-view'],
    ['.main-globalNav-historyButtonsWrapper > div:has(> button)', 'main-globalNav-historyButtons'],
    ['#global-nav-bar form', 'main-globalNav-searchContainer', 2],
    ['#global-nav-bar form', 'main-globalNav-searchSection', 3],
    // old: topbarContentRight > [actionButtons > buttons] + user button
    ['.main-globalNav-contentRight > .main-actionButtons', 'main-topBar-topbarContentRight'],
    ['.main-globalNav-contentRight > .main-actionButtons > div:has(> button)', 'main-actionButtons'],
    [NPB, 'Root__now-playing-bar', 1],
    [NPB, 'main-nowPlayingBar-nowPlayingBar'],
    [`${NPB} > div`, 'main-nowPlayingBar-container'],
    [`${NPB} > div > div:nth-child(1)`, 'main-nowPlayingBar-left'],
    [`${NPB} > div > div:nth-child(2)`, 'main-nowPlayingBar-center'],
    [`${NPB} > div > div:nth-child(3)`, 'main-nowPlayingBar-right'],
    [`${NPB} > div > div:nth-child(3) > div`, 'main-nowPlayingBar-extraControls'],
    ['[data-testid="cover-art-container"]', 'main-nowPlayingWidget-coverArt'],
    ['[data-testid="now-playing-widget-v2"] > div:nth-child(2)', 'main-nowPlayingWidget-trackInfo'],
    ['[data-testid="cover-art-container"] img', 'cover-art', 1],
    ['[data-testid="now-playing-widget-v2"] [data-testid="context-item-link"]', 'main-trackInfo-name', 3],
    ['.Root__right-sidebar-peek', 'Root__right-sidebar', 1],
    // Sticky "▶ Title" strip: with this class the theme overlays it on the list (position:absolute), which
    // is what its 29px offset for the sticky column header assumes.
    ['[data-testid="topbar-content"] > span', 'main-entityHeader-topbarTitle'],
    // cover-colour fill + dark overlay behind playlist/album headers; theme sets these to background:none
    ['[data-testid="entity-header"] > div:not(.main-entityHeader-contentWrapper)', 'main-entityHeader-backgroundColor'],
    ['[data-testid="entity-header"] + div[style*="background-color"]', 'main-actionBarBackground-background'],
    // filter box "expand" magnifier; theme hides it (it draws its own aero magnifier)
    ['[role="search"] > button', 'x-filterBox-expandButton'],
    ['[data-testid="player-controls"]', 'player-controls'],
    ['[data-testid="general-controls"]', 'player-controls__buttons'],
    ['[data-testid="general-controls"] > div:first-child', 'player-controls__left'],
    ['[data-testid="general-controls"] > div:last-child', 'player-controls__right'],
    ['[data-testid="playback-position"]', 'playback-bar', 1],
  ];

  // State classes: [selector, legacy class, predicate] — added when true, removed when false.
  const STATE = [
    // Spotify adds one hashed class to topbar-content when the sticky title fades in.
    ['[data-testid="topbar-content"]', 'main-entityHeader-topbarContentFadeIn',
      (el) => [...el.classList].some((c) => !c.startsWith('main-'))],
  ];

  // Nodes the theme injects into the player controls once, at startup: its own Repeat and Stop buttons into
  // .player-controls__left, and Spotify's volume bar, moved into .player-controls__right. When Spotify
  // rebuilds those two groups (the theme's Stop button does it: it ends the session and the whole now-playing
  // bar remounts), they go away with the old groups, and the volume bar can't come back by itself: React
  // still considers the detached node its own and never renders another. The nodes are remembered here and
  // put back into the new groups as soon as those exist — the same thing the theme did the first time.
  const kept = { repeat: null, stop: null, volume: null };
  function reattachPlayerControls() {
    const left = document.querySelector('.player-controls__left');
    const right = document.querySelector('.player-controls__right');
    if (left) {
      kept.repeat ||= document.getElementById('wmpotify-repeat-button');
      kept.stop ||= document.getElementById('wmpotify-stop-button');
      for (const el of [kept.repeat, kept.stop]) if (el && !el.isConnected) left.appendChild(el); // repeat first, as the theme does
    }
    if (right) {
      // only a volume bar the theme has already moved here (not the one still in Spotify's own extra controls)
      kept.volume ||= right.querySelector(':scope > [data-testid="volume-bar"]');
      if (kept.volume && !kept.volume.isConnected) right.appendChild(kept.volume);
    }
  }

  function apply() {
    for (const [sel, cls, up = 0] of MAP) {
      for (let el of document.querySelectorAll(sel)) {
        for (let i = 0; i < up && el; i++) el = el.parentElement;
        if (el && !el.classList.contains(cls)) el.classList.add(cls);
      }
    }
    for (const [sel, cls, on] of STATE) {
      for (const el of document.querySelectorAll(sel)) {
        const want = on(el);
        if (want !== el.classList.contains(cls)) el.classList.toggle(cls, want);
      }
    }
    reattachPlayerControls();
  }

  // --- 2. CSS fixes ---------------------------------------------------------------------------------
  const style = document.createElement('style');
  style.id = 'wmpotify-compat-css';
  style.textContent = `
    /* When the theme shows the topbar strip (bg faded in), show its title too, so it's never an empty band.
       Don't display:none the topbar here — Spotify stops computing the fade-in while it's hidden. */
    #main-view .main-topBar-container [data-testid="topbar-content"],
    #main-view .main-topBar-container [data-testid="topbar-content"] > * { opacity: 1 !important; visibility: visible !important; transform: none !important; }

    /* Seek handle: 1.3.10 hides it with display:none (theme only overrides visibility) */
    [data-testid="playback-progressbar"] .progress-bar__slider { display: block !important; }

    /* Carousel edge fades: Spotify's dark ::before/::after, made for its dark UI, show up as stray grey
       shadows at the shelf edges under the theme */
    #main-view [style*="--scrollAnimationRangeStart"]::before,
    #main-view [style*="--scrollAnimationRangeStart"]::after { display: none !important; }
  `;
  document.head.appendChild(style);

  // No requestAnimationFrame: it never fires while the window is hidden/occluded, which left the theme
  // without its classes when Spotify started in the background. MutationObserver callbacks are already
  // batched per microtask, and apply() only writes when a class is missing, so it converges.
  apply();
  new MutationObserver(apply).observe(document.documentElement, {
    childList: true, subtree: true, attributes: true, attributeFilter: ['class'],
  });
})();
