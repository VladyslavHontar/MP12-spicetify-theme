// WMPotify skin — Windows 7 / WMP12 look on top of WMPotify's own "aero" style. CSS only, no DOM work.
// Remove this extension to get stock WMPotify back. Needs wmpotify-compat.js (restored class names).
// Needs WMPotify's Style = Aero (set automatically on first run; changeable in WMPotify Properties → General);
// with another style the frame/palette rules below simply don't match. Light and dark are both covered — pick with the theme's "Dark mode"
// setting. "Follow system setting" is useless on macOS: Spotify forces prefers-color-scheme to dark.
// Regression check: ../dev/check.mjs
(function wmpotifySkin() {
  // First run: WMPotify defaults to its Windows XP look, but this skin is built on its Aero style. Set it only
  // while the user has not picked one (WMPotify Properties -> General -> Style). This script runs before the
  // theme is injected, so the theme reads it on this very launch.
  try { if (!localStorage.wmpotifyStyle) localStorage.wmpotifyStyle = 'aero'; } catch { /* storage unavailable */ }

  // "Now Playing" (wmpvis) defaults, once: album art + bars across the whole stage, coloured by the scheme.
  try {
    if (!localStorage.wmpotifyVisShowAlbumArt && !localStorage.wmpotifyMp12Vis) {
      Object.assign(localStorage, { wmpotifyMp12Vis: '1', wmpotifyVisShowAlbumArt: '1', wmpotifyVisUseSchemeColors: '1', wmpotifyVisAutoSizeBars: '1' });
    }
  } catch { /* storage unavailable */ }

  const AERO = ':root[data-wmpotify-style="aero"]';
  const LIGHT = `${AERO}:not([data-wmpotify-dark-mode])`;
  const DARK = `${AERO}[data-wmpotify-dark-mode]`;

  // ---- Sprites -------------------------------------------------------------------------------------
  // WMPotify is a WMP11 theme: its toolbar, tabs and back/forward are black-glass images. It draws the
  // tabs and back/forward from fixed-size sprites held in CSS variables and has all the state logic
  // (hover / pressed / current page) on top of them, so the light frame only has to swap the images.
  const svg = (w, h, body) =>
    `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`)}")`;
  const vgrad = (stops) =>
    `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">${stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('')}</linearGradient></defs>`;

  // 59x35, back orb centred at x=15 and forward at x=44 — same geometry as the theme's sprite.
  const nav = ({ top, bottom, ring, arrow }) => {
    const orb = (cx, dir) =>
      `<circle cx="${cx}" cy="17.5" r="11.5" fill="url(#g)" stroke="${ring}"/>` +
      `<ellipse cx="${cx}" cy="12" rx="8" ry="4.5" fill="#fff" opacity=".55"/>` +
      `<path d="M${cx + 5 * dir} 17.5H${cx - 4.5 * dir}M${cx - 0.5 * dir} 13l${-4.5 * dir} 4.5 ${4.5 * dir} 4.5" fill="none" stroke="${arrow}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`;
    return svg(59, 35, vgrad([[0, top], [1, bottom]]) + orb(15, 1) + orb(44, -1));
  };

  // 66x36, used by the theme as border-image with slice 6 4 2 4: a glassy button the height of the bar.
  const tab = ([a, b, c, d], edge) => svg(66, 36,
    vgrad([[0, a], [0.5, b], [0.5, c], [1, d]]) +
    `<rect x=".5" y="3.5" width="65" height="31" rx="2.5" fill="url(#g)" stroke="${edge}"/>` +
    `<rect x="1.5" y="4.5" width="63" height="29" rx="1.5" fill="none" stroke="#fff" stroke-opacity=".75"/>`);

  // 19x36 "»" tab overflow button
  const overflow = (bg = '') => svg(19, 36, bg +
    `<path d="M5.5 14.5l3.5 3.5-3.5 3.5M10.5 14.5l3.5 3.5-3.5 3.5" fill="none" stroke="#1e395b" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`);

  // The WMP "now playing" backdrop, shared by both lyrics views and the lyrics preview card.
  const NOW_PLAYING_BG = `
    radial-gradient(ellipse 80% 55% at 50% 115%, rgba(40, 110, 220, .5), transparent 70%),
    radial-gradient(ellipse 60% 35% at 50% -10%, rgba(90, 160, 255, .18), transparent 70%),
    linear-gradient(#000 0%, #050b1a 55%, #0a1a3a 100%)`;

  const style = document.createElement('style');
  style.id = 'wmpotify-skin-css';
  style.textContent = `
    /* ================= Palette — softer than stock. The one place to tune colours. ================= */
    ${LIGHT} {
      --spice-text: #1c2530;              /* stock #000 */
      --spice-accent: #2f7fd6;            /* stock #00befd: playing track, active icons */
      --spice-button: #2f7fd6;
      --spice-button-active: #2f7fd6;
      --spice-rgb-text: 28, 37, 48;
      --spice-rgb-accent: 47, 127, 214;
      --spice-rgb-button: 47, 127, 214;
      --spice-rgb-button-active: 47, 127, 214;
    }
    /* Dark keeps the theme's #222 surfaces: that value is hard-coded in several theme rules (entity
       header fill among them), so shifting --spice-main leaves bands of a slightly different grey. */
    ${DARK} {
      --spice-text: #d6dce5;              /* stock #e0e4ec */
      /* aero paints the player's track name / time dark blue with a white "text on glass" glow; there is
         no glass behind it on macOS, so on the dark bar that is a white smudge */
      --basic-pb-text: #d6dce5;
      --aero-text-glow: none;
      --spice-accent: #5aa7ee;
      --spice-button: #5aa7ee;
      --spice-button-active: #5aa7ee;
      --spice-rgb-accent: 90, 167, 238;
      --spice-rgb-button: 90, 167, 238;
      --spice-rgb-button-active: 90, 167, 238;
    }

    /* ================= WMP12 frame (light mode): pale-blue Aero glass instead of black ============= */
    ${LIGHT} {
      --tab-label-text: #1e395b;
      --tab-label-text-active: #1e395b;
      --nav: ${nav({ top: '#fafdff', bottom: '#c4d9f1', ring: '#7f9fc8', arrow: '#1f5fae' })};
      --nav-hover: ${nav({ top: '#ffffff', bottom: '#a9d0f7', ring: '#3d8fe0', arrow: '#0f55b0' })};
      --nav-pressed: ${nav({ top: '#b9d3ee', bottom: '#8fb7e3', ring: '#346fb5', arrow: '#0b3f86' })};
      --nav-disabled: ${nav({ top: '#f4f7fb', bottom: '#dfe7f1', ring: '#b7c4d6', arrow: '#aab6c6' })};
      --tab-hover: ${tab(['#ffffff', '#edf4fc', '#dfeaf8', '#e6effa'], '#a5bddb')};
      --tab-pressed: ${tab(['#dce8f6', '#cfdff2', '#c0d5ee', '#c9dbf1'], '#7f9fc9')};
      --tab-active: ${tab(['#f2f8ff', '#d9e8fa', '#c3daf6', '#cfe2f8'], '#7fa6d8')};
      --tab-active-hover: ${tab(['#f8fbff', '#e2eefc', '#cde1f8', '#d9e9fb'], '#5f97d8')};
      --tab-active-pressed: ${tab(['#cfe0f5', '#bcd3ef', '#a9c6ea', '#b5cfee'], '#5f89c2')};
      --overflow: ${overflow()};
      --overflow-hover: ${overflow('<rect x=".5" y="6.5" width="18" height="23" rx="2.5" fill="#eef5fd" stroke="#a5bddb"/>')};
    }
    /* the page background shows through the 1px seam between title strip and toolbar */
    ${LIGHT} body { background-color: #d6e3f3 !important; }
    /* the title strip has a near-black hairline outline */
    ${LIGHT} #wmpotify-title-bar { outline-color: #a9bcd3 !important; }
    ${LIGHT} #wmpotify-title-bar::before {
      border-image: none !important;
      background: linear-gradient(#c4d6ec, #d6e3f3) !important;
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, .7);
    }
    ${LIGHT} #wmpotify-title-text {
      color: #1b2a3d !important;
      text-shadow: 0 0 6px #fff, 0 0 10px #fff, 0 0 14px rgba(255, 255, 255, .8) !important;
    }
    ${LIGHT} .Root__globalNav { background-color: #dfe9f5 !important; }
    ${LIGHT} .Root__globalNav::before {
      border-image: none !important;
      background: linear-gradient(#f7fafd 0%, #e9f0f9 49%, #dbe6f3 50%, #e4ecf7 100%) !important;
      box-shadow: inset 0 1px 0 #fff, inset 0 -1px 0 #a9bcd3;
    }
    ${LIGHT} .Root__globalNav .wmpotify-user-label { color: #1e395b !important; text-shadow: none !important; }
    /* separator after the Now Playing tab */
    ${LIGHT} #wmpotify-tabs-container > button[data-identifier="now-playing"]:first-child::after {
      background: linear-gradient(to right, #b9c9dd 1px, #fdfeff 1px) !important;
      -webkit-mask: linear-gradient(transparent 12%, #000 35%, #000 65%, transparent 88%);
    }
    /* user button: a compact glass button instead of a box the full height of the bar */
    ${LIGHT} .main-topBar-topbarContentRight > button:last-child::before {
      border-image: none !important;
      top: 6px !important;
      height: 24px !important;
      background: linear-gradient(#fdfeff, #dfeaf7);
      border-radius: 3px;
      box-shadow: inset 0 0 0 1px #9db5d4, inset 0 0 0 2px rgba(255, 255, 255, .7);
    }
    ${LIGHT} .main-topBar-topbarContentRight > button:last-child:hover::before { background: linear-gradient(#ffffff, #cfe3fa); box-shadow: inset 0 0 0 1px #5f97d8, inset 0 0 0 2px rgba(255, 255, 255, .7); }
    ${LIGHT} .main-topBar-topbarContentRight > button:last-child:active::before { background: linear-gradient(#cfe0f5, #b5cfee); }
    /* "Add to Liked Songs" (+) next to the track name: the theme paints every icon in the bar white for its
       black WMP11 bar, which is invisible on the pale light bar. Navy is what the theme itself uses for icons
       on a light bar (its Basic style). Only the unchecked state: the "liked" check is drawn separately. */
    ${LIGHT} .main-nowPlayingBar-left button[aria-checked="false"] svg { color: #1e395b !important; }
    ${LIGHT} .main-nowPlayingBar-left button[aria-checked="false"]:hover svg { color: #2f7fd6 !important; }
    /* Ad break: Like / Dislike (thumbs) and the disabled Previous / Next are plain icon buttons, white from the
       same rule. Play/Pause keeps its own white-on-dark glyph. */
    ${LIGHT} [data-testid="player-controls"] button:not([data-testid="control-button-playpause"]) svg { color: #1e395b !important; }

    /* ================= Compact entity header (playlist / album / liked songs) ====================== */
    #main-view .main-entityHeader-container.main-entityHeader-containerNormal { min-height: 0 !important; height: auto !important; max-height: none !important; }
    #main-view .main-entityHeader-contentWrapper { padding-top: 16px !important; padding-bottom: 12px !important; min-height: 0 !important; height: auto !important; align-items: center !important; }
    #main-view .main-entityHeader-imageContainer { width: 128px !important; height: 128px !important; min-width: 128px !important; margin-inline-end: 16px !important; }
    #main-view .main-entityHeader-image { width: 128px !important; height: 128px !important; }
    #main-view .main-entityHeader-title h1 { font-size: 36px !important; line-height: 1.15 !important; letter-spacing: -0.5px !important; margin: 2px 0 6px !important; }

    /* ================= Right panel: constant shadow on its left edge =============================== */
    /* z-index 3: above the main view scrollbar (z 2), below popovers/menus (z 7). */
    .Root__right-sidebar:has(> .Root__right-sidebar-expanded) {
      position: relative;
      z-index: 3 !important;
      /* wide enough to reach past the ~16px main-view scrollbar track onto the content */
      box-shadow: -30px 0 60px -10px rgba(0, 0, 0, .65), -4px 0 10px rgba(0, 0, 0, .45), -1px 0 0 rgba(0, 0, 0, .5) !important;
      /* cast it to the left only — the blur must not spill up onto the toolbar or down onto the player */
      clip-path: inset(0 0 0 -80px);
    }

    /* ================= Now Playing panel with an animated cover (Canvas) ============================ */
    /* Spotify fades the looping video into oklch(0.18 0 0), a hard-coded near-black, and sets the title, artist
       and related videos over that fade. Light mode: those texts are dark, so they vanished into the black.
       Dark mode: the panel is #222, so the card ended in a visible step. Either way the fade must end in the
       panel's own colour (one variable per mode). The three scrim layers are siblings next to the video's box:
       top darkening, bottom fade, overall dimming. */
    ${LIGHT} { --mp12-panel-rgb: 238, 243, 250; }
    ${DARK}  { --mp12-panel-rgb: 34, 34, 34; }
    #Desktop_PanelContainer_Id div:has(> div > video) > div:not(:has(video)) > div:nth-child(1) {
      background-image: linear-gradient(rgba(var(--mp12-panel-rgb), .85) 0%, rgba(var(--mp12-panel-rgb), 0) 30%) !important; }
    #Desktop_PanelContainer_Id div:has(> div > video) > div:not(:has(video)) > div:nth-child(2) {
      background-image: linear-gradient(rgba(var(--mp12-panel-rgb), 0) 0%, rgba(var(--mp12-panel-rgb), 0) 38%, rgba(var(--mp12-panel-rgb), .9) 60%, rgb(var(--mp12-panel-rgb)) 76%) !important; }
    #Desktop_PanelContainer_Id div:has(> div > video) > div:not(:has(video)) > div:nth-child(3) {
      background-image: linear-gradient(rgba(var(--mp12-panel-rgb), .25) 0%, rgba(var(--mp12-panel-rgb), .1) 30%, rgba(var(--mp12-panel-rgb), .1) 70%, rgb(var(--mp12-panel-rgb)) 95%) !important; }

    /* ================= Lyrics: WMP "now playing" look, dark in both modes ========================== */
    /* Anchored on Spotify's --lyrics-color-* vars, which drive active/inactive line colours. */
    [style*="--lyrics-color-active"] {
      --lyrics-color-active: #fff !important;
      --lyrics-color-inactive: rgba(150, 185, 230, .55) !important;
      --lyrics-color-passed: rgba(120, 140, 170, .45) !important;
      --lyrics-color-background: transparent !important;
      --lyrics-color-messaging: rgba(150, 185, 230, .8) !important;
    }
    /* Two lyrics views: the /lyrics page (inside main) and the cinema overlay the Lyrics button opens
       (outside #main-view, container carries --cinema-mode-bg-color-*). Style both the same. */
    main [style*="--lyrics-color-active"],
    [style*="--cinema-mode-bg-color-from"] [style*="--lyrics-color-active"] { background: transparent !important; }
    [style*="--cinema-mode-bg-color-from"] {
      --cinema-mode-bg-color-from: transparent !important;
      --cinema-mode-bg-color-to: transparent !important;
    }
    [style*="--cinema-mode-bg-color-from"] > div:first-child { background: transparent !important; }
    main [style*="--lyrics-color-active"] [dir="auto"],
    [style*="--cinema-mode-bg-color-from"] [style*="--lyrics-color-active"] [dir="auto"] {
      font-family: "Segoe UI", "Lucida Grande", sans-serif !important;
      font-size: 30px !important;
      font-weight: 600 !important;
      line-height: 1.35 !important;
      text-shadow: 0 0 10px rgba(80, 160, 255, .55), 0 1px 2px #000;
      transition: color .25s, text-shadow .25s;
    }
    #main-view:has(main [style*="--lyrics-color-active"]),
    #main-view:has(main [style*="--lyrics-color-active"]) .main-view-container,
    #main-view:has(main [style*="--lyrics-color-active"]) .main-view-container__scroll-node,
    /* painted on the cinema scroll host (not the fixed-height layer) so it doesn't end when scrolling */
    [data-overlayscrollbars="host"]:has([style*="--cinema-mode-bg-color-from"]),
    [data-testid="lyrics-npv-section"] { background: ${NOW_PLAYING_BG} !important; }
    #main-view:has(main [style*="--lyrics-color-active"]) .main-topBar-background { background: #000 !important; }
    /* No scrollbar on the lyrics screens: in light mode it is a pale Aero bar down the side of a dark
       backdrop. Lyrics follow the song and still scroll with the wheel. */
    [data-overlayscrollbars="host"]:has([style*="--cinema-mode-bg-color-from"]) > [data-overlayscrollbars-viewport]::-webkit-scrollbar,
    #main-view:has(main [style*="--lyrics-color-active"]) .main-view-container__scroll-node > [data-overlayscrollbars-viewport]::-webkit-scrollbar { display: none !important; }
    #main-view:has(main [style*="--lyrics-color-active"]) .main-view-container__scroll-node > .os-scrollbar { display: none !important; }

    /* ---- Light mode: lyrics on pale Aero glass instead of the dark "now playing" screen ---- */
    ${LIGHT} [style*="--lyrics-color-active"] {
      --lyrics-color-active: #0b2a5b !important;
      --lyrics-color-inactive: rgba(30, 57, 91, .45) !important;
      --lyrics-color-passed: rgba(30, 57, 91, .25) !important;
      --lyrics-color-messaging: rgba(30, 57, 91, .65) !important;
    }
    ${LIGHT} main [style*="--lyrics-color-active"] [dir="auto"],
    ${LIGHT} [style*="--cinema-mode-bg-color-from"] [style*="--lyrics-color-active"] [dir="auto"] {
      text-shadow: 0 0 8px rgba(255, 255, 255, .95), 0 1px 0 rgba(255, 255, 255, .85) !important;
    }
    ${LIGHT} #main-view:has(main [style*="--lyrics-color-active"]),
    ${LIGHT} #main-view:has(main [style*="--lyrics-color-active"]) .main-view-container,
    ${LIGHT} #main-view:has(main [style*="--lyrics-color-active"]) .main-view-container__scroll-node,
    ${LIGHT} [data-overlayscrollbars="host"]:has([style*="--cinema-mode-bg-color-from"]),
    ${LIGHT} [data-testid="lyrics-npv-section"] {
      background:
        radial-gradient(ellipse 80% 55% at 50% 118%, rgba(120, 170, 235, .45), transparent 70%),
        linear-gradient(#f9fbfe 0%, #eaf1fa 55%, #d8e6f6 100%) !important;
    }
    ${LIGHT} #main-view:has(main [style*="--lyrics-color-active"]) .main-topBar-background { background: #eaf1fa !important; }
    ${LIGHT} [data-testid="lyrics-npv-section"] { border-color: #a9bcd3; }
    ${LIGHT} [data-testid="lyrics-npv-section"] h2 { color: #1e395b !important; }
    /* the cinema overlay's toolbar is white (made for a dark screen) */
    ${LIGHT} .Root > div > div:has([style*="--cinema-mode-bg-color-from"]) svg { color: #1e395b !important; }
    /* Both modes. The cinema overlay and its scroll host carry an 8px black outline and rounded corners; the theme
       turns both off through a hashed class that 1.3.10 renamed. The outline overhangs the toolbar above it. */
    .Root > div > div:has([style*="--cinema-mode-bg-color-from"]),
    [data-overlayscrollbars="host"]:has([style*="--cinema-mode-bg-color-from"]) { outline: none !important; border-radius: 0 !important; }
    [data-testid="lyrics-npv-section"] { border: 1px solid #1d3a6e; }
    [data-testid="lyrics-npv-section"] h2 { color: #9cc4ff !important; }

    /* Now Playing stage (wmpvis): WMP12 look — a soft glass glow behind the art, a reflection under it, a caption. */
    #wmpvis { background: radial-gradient(ellipse at 50% 42%, #1b3556 0%, #0c1626 55%, #05080f 100%) !important; }
    ${LIGHT} #wmpvis { background: radial-gradient(ellipse at 50% 42%, #ffffff 0%, #e6eef9 55%, #c9d9ee 100%) !important; }
    #wmpvis .wmpvis-albumArt { -webkit-box-reflect: below 2px linear-gradient(transparent 70%, rgba(255,255,255,.22)); border-radius: 2px; box-shadow: 0 10px 40px rgba(0,0,0,.45); }
    #wmpvis .wmpvis-visBar { opacity: .5; }
    #wmpvis-caption { position: absolute; left: 24px; top: 20px; z-index: 3; pointer-events: none; color: #e8f0fa; text-shadow: 0 1px 6px rgba(0,0,0,.6); }
    #wmpvis-caption b { display: block; font: 600 22px/1.2 "Segoe UI", system-ui, sans-serif; }
    #wmpvis-caption span { font: 14px/1.4 "Segoe UI", system-ui, sans-serif; opacity: .8; }
    ${LIGHT} #wmpvis-caption { color: #1c2530; text-shadow: 0 1px 0 rgba(255,255,255,.8); }
  `;
  document.getElementById(style.id)?.remove();
  document.head.appendChild(style);

  // caption "title / artist" in the stage's corner, like WMP's Now Playing
  const caption = () => {
    const stage = document.getElementById('wmpvis');
    let el = document.getElementById('wmpvis-caption');
    if (!stage) return el?.remove();
    const m = Spicetify.Player?.data?.item?.metadata; if (!m) return;
    if (!el) { el = document.createElement('div'); el.id = 'wmpvis-caption'; el.append(document.createElement('b'), document.createElement('span')); stage.appendChild(el); }
    // write only on change: this runs from a MutationObserver, and an unconditional write re-triggers it forever
    const [t, a] = [m.title || '', m.artist_name || ''];
    if (el.firstChild.textContent !== t) el.firstChild.textContent = t;
    if (el.lastChild.textContent !== a) el.lastChild.textContent = a;
  };
  new MutationObserver(caption).observe(document.body, { childList: true, subtree: true });
  Spicetify.Player?.addEventListener?.('songchange', caption);
})();
