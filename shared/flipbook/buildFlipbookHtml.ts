// Builds a single, self-contained HTML flipbook: page images (or their URLs),
// the StPageFlip library and the viewer code are all inlined.
//
// Ported from the Hightemp flipbook maker. The same function produces:
//  - the live preview on the Create page (browser, data URLs),
//  - the share link viewer /v/:slug (server, page URLs, loaded lazily),
//  - the downloaded .html file (server, embedded data URLs, works offline).
//
// The two inline <script> blocks never change between flipbooks (all data
// travels in a JSON block), so the server can allow them with CSP hashes; see
// viewerInlineScripts().

import { viewerColors } from "../theme";

export type PageImage = {
  /** Image URL or data URL */
  src: string;
  width: number;
  height: number;
};

export type FlipbookPdf =
  | { fileName: string; base64: string }
  | { fileName: string; url: string };

export type FlipbookHtmlOptions = {
  title: string;
  pages: PageImage[];
  showCover: boolean;
  /** When set, the flipbook shows a "Download PDF" button for this file. */
  pdf: FlipbookPdf | null;
  pageFlipSource: string;
  /** Small "Made with AM Flipbook" link, shown on free flipbooks. */
  badge?: { text: string; brand: string; href: string } | null;
  /** Diagonal text drawn over every page (used for the free preview). */
  overlayText?: string | null;
  /**
   * Page-turn sound as a data URL (shared/flipbook/page-flip-01a.mp3).
   * Embedded so downloads play it offline. Without it a rustle is synthesised.
   */
  sound?: string | null;
  /** Extra tags for <head> (Open Graph, favicon). Must already be escaped. */
  head?: string;
  lang?: string;
};

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

/**
 * JSON that is safe inside <script type="application/json">: escaping "<"
 * stops a "</script" in the data from ending the element early.
 */
function scriptJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

const ICONS = {
  first: '<path d="M11 17l-5-5 5-5M18 17l-5-5 5-5"/>',
  prev: '<path d="M15 18l-6-6 6-6"/>',
  next: '<path d="M9 18l6-6-6-6"/>',
  last: '<path d="M13 17l5-5-5-5M6 17l5-5-5-5"/>',
  zoomIn:
    '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5M11 8v6M8 11h6"/>',
  zoomOut: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5M8 11h6"/>',
  soundOn:
    '<path d="M11 5L6 9H3v6h3l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>',
  soundOff: '<path d="M11 5L6 9H3v6h3l5 4V5z"/><path d="M22 9l-6 6M16 9l6 6"/>',
  fullscreen:
    '<path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/>',
  download:
    '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
};

function icon(name: keyof typeof ICONS): string {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
}

function iconButton(id: string, name: keyof typeof ICONS, label: string, extraClass = "") {
  return `<button class="icon-btn ${extraClass}" id="${id}" type="button" title="${label}" aria-label="${label}">${icon(name)}</button>`;
}

function overlayCss(text: string): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="240">` +
    `<text x="180" y="130" text-anchor="middle" transform="rotate(-30 180 120)" ` +
    `font-family="Helvetica,Arial,sans-serif" font-size="30" font-weight="700" ` +
    `fill="#000" fill-opacity=".13" stroke="#fff" stroke-opacity=".18" stroke-width="1">` +
    `${escapeHtml(text)}</text></svg>`;
  return `.wm{position:absolute;inset:0;z-index:2;pointer-events:none;background-size:42% auto;
  background-image:url("data:image/svg+xml,${encodeURIComponent(svg)}")}`;
}

function styles(overlayText: string | null | undefined): string {
  const c = viewerColors;
  return `
*{box-sizing:border-box}
html,body{margin:0;height:100%}
body{display:flex;flex-direction:column;overflow:hidden;color:${c.text};
  background:radial-gradient(ellipse at 50% 38%,${c.backgroundCenter} 0%,${c.backgroundMid} 55%,${c.backgroundEdge} 100%);
  font:14px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  -webkit-tap-highlight-color:transparent}
button{font:inherit;color:inherit}
.topbar{display:flex;align-items:center;gap:10px;min-height:60px;padding:10px 14px 4px 20px}
.title{flex:1;min-width:0;margin:0;font-size:15px;font-weight:600;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pill{display:flex;align-items:center;gap:2px;padding:4px;border-radius:12px;
  background:rgba(255,255,255,.8);box-shadow:0 1px 3px rgba(20,30,40,.1),0 4px 14px rgba(20,30,40,.06)}
.icon-btn{display:inline-flex;align-items:center;justify-content:center;flex:none;
  width:38px;height:38px;padding:0;border:0;border-radius:9px;background:transparent;cursor:pointer}
.icon-btn:hover:not(:disabled){background:rgba(37,55,70,.08)}
.icon-btn:disabled{opacity:.3;cursor:default}
.icon-btn:focus-visible,.side:focus-visible,.primary:focus-visible,.badge:focus-visible{outline:2px solid ${c.accent};outline-offset:2px}
.icon-btn svg{width:20px;height:20px}
.icon-btn .off,.icon-btn.muted .on{display:none}
.icon-btn.muted .off{display:inline}
.primary{display:inline-flex;align-items:center;gap:8px;height:42px;padding:0 16px;border:0;border-radius:11px;
  background:${c.accent};color:#fff;font-weight:600;cursor:pointer;
  box-shadow:0 1px 3px rgba(20,20,60,.3),0 4px 14px rgba(20,20,60,.16)}
.primary:hover{background:${c.accentHover}}
.primary svg{width:18px;height:18px}
.stage{position:relative;flex:1;min-height:0;overflow:hidden}
.zoom{position:absolute;inset:14px 72px 10px;transform-origin:50% 50%}
.shift{position:absolute;inset:0;opacity:0;
  filter:drop-shadow(0 10px 22px rgba(20,32,44,.24)) drop-shadow(0 1px 2px rgba(20,32,44,.12))}
.ready .shift{opacity:1}
#book{width:100%;height:100%;min-width:0!important;min-height:0!important}
#book .stf__wrapper{width:100%;height:100%}
.page{background:#fff;overflow:hidden}
.page img{display:block;width:100%;height:100%;object-fit:contain;opacity:0;transition:opacity .2s;
  pointer-events:none;user-select:none;-webkit-user-select:none}
.page.loaded img{opacity:1}
.spin{position:absolute;left:50%;top:50%;width:26px;height:26px;margin:-13px 0 0 -13px;border-radius:50%;
  border:3px solid rgba(0,0,0,.08);border-top-color:${c.accent};animation:spin .9s linear infinite}
.page.loaded .spin{display:none}
@keyframes spin{to{transform:rotate(360deg)}}
.spread .page.--left::after,.spread .page.--right::after{content:"";position:absolute;inset:0;pointer-events:none;z-index:3}
.spread .page.--left::after{background:linear-gradient(to left,rgba(0,0,0,.17),rgba(0,0,0,.06) 2.5%,rgba(0,0,0,0) 9%)}
.spread .page.--right::after{background:linear-gradient(to right,rgba(0,0,0,.14),rgba(0,0,0,.05) 2.5%,rgba(0,0,0,0) 9%)}
.closing .stf__outerShadow{display:none!important}
.stack{position:absolute;pointer-events:none}
.stack::before,.stack::after{content:"";position:absolute;top:2px;bottom:2px;
  background:repeating-linear-gradient(90deg,#fff 0 1px,#cfd6dc 1px 2px);transition:width .3s}
.stack::before{right:100%;width:var(--before,0px);border-radius:2px 0 0 2px}
.stack::after{left:100%;width:var(--after,0px);border-radius:0 2px 2px 0}
.pan{position:absolute;inset:0;z-index:5;cursor:grab;touch-action:none}
.pan.dragging{cursor:grabbing}
.side{position:absolute;top:50%;z-index:6;display:flex;align-items:center;justify-content:center;
  width:46px;height:46px;margin-top:-23px;padding:0;border:0;border-radius:50%;cursor:pointer;
  background:rgba(255,255,255,.85);box-shadow:0 1px 3px rgba(20,30,40,.12),0 4px 14px rgba(20,30,40,.08)}
.side:hover:not(:disabled){background:#fff}
.side:disabled{opacity:0;pointer-events:none}
.side svg{width:24px;height:24px}
.side.prev{left:14px}
.side.next{right:14px}
.bottombar{position:relative;display:flex;flex-direction:column;align-items:center;gap:6px;padding:6px 14px 14px}
.pager{width:100%;max-width:640px}
.pager input{flex:1;min-width:40px;margin:0 8px;accent-color:${c.accent};cursor:pointer}
.count{min-width:92px;padding:0 6px 0 4px;text-align:center;font-variant-numeric:tabular-nums;color:${c.muted}}
.badge{position:absolute;left:16px;bottom:20px;display:inline-flex;align-items:center;gap:6px;padding:7px 12px;
  border-radius:999px;background:rgba(255,255,255,.9);color:${c.text};font-size:12px;text-decoration:none;
  box-shadow:0 1px 3px rgba(20,30,40,.1),0 4px 14px rgba(20,30,40,.06)}
.badge b{color:${c.accent}}
.badge:hover{background:#fff}
.narrow-only{display:none}
@media (max-width:1100px){.badge{position:static}}
@media (max-width:640px){
  .topbar{padding:8px 10px 2px 14px;min-height:54px}
  .primary span{display:none}
  .primary{padding:0 11px}
  .zoom{inset:10px 10px 6px}
  .side{display:none}
  .narrow-only{display:inline-flex}
  .bottombar{padding:4px 8px 10px}
  .count{min-width:72px}
  #first,#last{display:none}
}
${overlayText ? overlayCss(overlayText) : ""}
`;
}

// Runs inside the viewer. Plain ES2015, so it needs no build step. It must
// not depend on the flipbook: everything variable comes from the JSON block.
const VIEWER_SCRIPT = `
(function () {
  "use strict";
  var data = JSON.parse(document.getElementById("flipbook-data").textContent);
  var $ = function (id) { return document.getElementById(id); };
  var FLIP_MS = 800;
  var n = data.pages.length;
  var stage = $("stage"), zoomBox = $("zoom"), shift = $("shift"), stack = $("stack");
  var pan = $("pan"), slider = $("slider"), count = $("count");

  // ---- Book ---------------------------------------------------------------
  // Images are only loaded for pages near the one being read, so a long
  // flipbook opens quickly from a share link.
  var images = [], requested = [];
  var pages = data.pages.map(function (src, i) {
    var page = document.createElement("div");
    page.className = "page";
    var img = document.createElement("img");
    img.alt = "Page " + (i + 1);
    img.draggable = false;
    img.decoding = "async";
    img.onload = function () { page.classList.add("loaded"); };
    page.appendChild(img);
    var spinner = document.createElement("span");
    spinner.className = "spin";
    page.appendChild(spinner);
    if (data.overlay) {
      var mark = document.createElement("div");
      mark.className = "wm";
      page.appendChild(mark);
    }
    images.push(img);
    return page;
  });
  function loadAround(index) {
    var from = Math.max(0, index - 4), to = Math.min(n - 1, index + 7);
    for (var i = from; i <= to; i++) {
      if (!requested[i]) { requested[i] = true; images[i].src = data.pages[i]; }
    }
  }
  loadAround(0);

  // Landscape pages are shown one at a time; side by side they get too small.
  var singlePage = data.width > data.height;
  var flip = new St.PageFlip($("book"), {
    width: data.width,
    height: data.height,
    size: "stretch",
    autoSize: false,
    minWidth: singlePage ? 100000 : 240,
    maxWidth: singlePage ? 100000 : 3000,
    minHeight: 100,
    maxHeight: 6000,
    usePortrait: true,
    showCover: data.showCover,
    flippingTime: FLIP_MS,
    maxShadowOpacity: 0.5,
    mobileScrollSupport: false
  });
  flip.loadFromHTML(pages);

  // Every page turns like paper, covers included. (By default the library
  // makes covers stiff boards whose 3D turn spills outside the book.)
  flip.getPageCollection().getPages().forEach(function (p) {
    p.setDensity("soft");
    p.setDrawingDensity("soft");
  });

  function currentSpread() {
    return flip.getPageCollection().getCurrentSpreadIndex();
  }
  function spreadAt(index) {
    var spreads = flip.getPageCollection().getSpread();
    return spreads[Math.max(0, Math.min(spreads.length - 1, index))];
  }
  // Same timing rule the library uses for its own animation.
  function flipMs(distance) {
    return Math.min(1, Math.max(0, distance) / 1000) * FLIP_MS;
  }

  // A lone cover sits in the middle, like a closed book. The book slides
  // there while the page turns.
  function centerFor(spreadIndex, ms) {
    var spread = spreadAt(spreadIndex);
    var pageWidth = flip.getRender().getRect().pageWidth;
    var x = 0;
    if (flip.getOrientation() === "landscape" && spread.length === 1) {
      x = spread[0] === n - 1 ? pageWidth / 2 : -pageWidth / 2;
    }
    shift.style.transition = "transform " + Math.round(ms) +
      "ms cubic-bezier(.45,.05,.3,1), opacity .4s ease";
    shift.style.transform = "translateX(" + x + "px)";
  }

  // Thin page edges beside the open pages; thicker when more pages lie there.
  function placeStack() {
    var rect = flip.getRender().getRect();
    var spread = spreadAt(currentSpread());
    var left = rect.left, width = rect.pageWidth * 2;
    if (flip.getOrientation() !== "landscape") {
      left += rect.pageWidth;
      width = rect.pageWidth;
    } else if (spread.length === 1) {
      width = rect.pageWidth;
      if (spread[0] !== n - 1) left += rect.pageWidth;
    }
    stack.style.left = left + "px";
    stack.style.top = rect.top + "px";
    stack.style.width = width + "px";
    stack.style.height = rect.height + "px";
    var before = spread[0], after = n - 1 - spread[spread.length - 1];
    stack.style.setProperty("--before", Math.min(6, Math.ceil(before / 3)) + "px");
    stack.style.setProperty("--after", Math.min(6, Math.ceil(after / 3)) + "px");
  }

  // Start the slide (and the sound) as soon as a turn begins, whether it
  // comes from a button, a click on the page or a drag that is let go.
  var controller = flip.getFlipController();
  var startFlip = controller.flip, releaseDrag = controller.stopMove;
  function onFlipStart(direction, ms) {
    playFlipSound();
    var target = currentSpread() + (direction === 1 ? -1 : 1);
    loadAround(spreadAt(target)[0]);
    centerFor(target, ms);
  }
  controller.flip = function (point) {
    startFlip.call(controller, point);
    if (controller.calc && controller.getState() === "flipping") {
      var rect = flip.getRender().getRect();
      onFlipStart(controller.calc.getDirection(), flipMs(2 * rect.pageWidth - rect.height / 10));
    }
  };
  controller.stopMove = function () {
    var calc = controller.calc, turning = false, direction = 0, ms = 0;
    if (calc) {
      var pos = calc.getPosition();
      turning = pos.x <= 0;
      direction = calc.getDirection();
      ms = flipMs(pos.x + flip.getRender().getRect().pageWidth);
    }
    releaseDrag.call(controller);
    if (turning) onFlipStart(direction, ms);
  };

  // When a turn ends on a cover shown alone, the library uses that cover as
  // both the turning sheet and the page underneath, so nothing hides the
  // outgoing page past the fold. Clip it to the spine side of the fold on
  // every frame, as a real page would look.
  var render = flip.getRender(), drawFrame = render.drawFrame, closingTurn = false;
  render.drawFrame = function () {
    drawFrame.call(render);
    var closing = false;
    try { closing = clipClosingPage(); } catch (e) {}
    // No page lies under a closing turn, so its shadow would fall on the
    // background; hide it for those frames.
    if (closing !== closingTurn) {
      closingTurn = closing;
      document.body.classList.toggle("closing", closing);
    }
  };
  function clipClosingPage() {
    var calc = controller.calc;
    if (!calc || flip.getOrientation() !== "landscape" ||
        !controller.flippingPage || controller.flippingPage !== controller.bottomPage) return false;
    // In the library's page coordinates the outgoing page spans x = 0 (spine)
    // to x = page width (outer edge), whichever way the book is turning.
    var forward = calc.getDirection() === 0;
    var page = forward ? render.rightPage : render.leftPage;
    if (!page) return true;
    var rect = render.getRect(), w = rect.pageWidth, h = rect.height;
    var fold = foldLine(calc.getBottomClipArea().filter(Boolean), w, h);
    if (!fold) return true;
    var points = spineSide(w, h, fold).map(function (p) {
      return (forward ? p.x : w - p.x) + "px " + p.y + "px";
    }).join(", ");
    var el = page.getElement();
    el.style.clipPath = "polygon(" + points + ")";
    el.style.webkitClipPath = el.style.clipPath;
    return true;
  }
  // The edge of the area past the fold that isn't part of the page border.
  function foldLine(area, w, h) {
    function edges(p) {
      return { l: Math.abs(p.x) < 0.5, r: Math.abs(p.x - w) < 0.5, t: Math.abs(p.y) < 0.5, b: Math.abs(p.y - h) < 0.5 };
    }
    for (var i = 0; i < area.length; i++) {
      var a = area[i], b = area[(i + 1) % area.length], ea = edges(a), eb = edges(b);
      var border = (ea.l && eb.l) || (ea.r && eb.r) || (ea.t && eb.t) || (ea.b && eb.b);
      if (!border && (Math.abs(a.x - b.x) > 0.01 || Math.abs(a.y - b.y) > 0.01)) return [a, b];
    }
    return null;
  }
  // The part of the page rectangle on the spine side of the fold line.
  function spineSide(w, h, fold) {
    var a = fold[0], b = fold[1];
    function side(p) { return (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x); }
    var keep = side({ x: 0, y: h / 2 }) >= 0 ? 1 : -1;
    var corners = [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }];
    var out = [];
    for (var i = 0; i < 4; i++) {
      var p = corners[i], q = corners[(i + 1) % 4];
      var sp = side(p) * keep, sq = side(q) * keep;
      if (sp >= 0) out.push(p);
      if ((sp >= 0) !== (sq >= 0)) {
        var t = sp / (sp - sq);
        out.push({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
      }
    }
    return out;
  }

  function refresh(ms) {
    document.body.classList.toggle("spread", flip.getOrientation() === "landscape");
    loadAround(spreadAt(currentSpread())[0]);
    centerFor(currentSpread(), ms);
    placeStack();
    updateControls();
  }
  flip.on("init", function () {
    refresh(0);
    requestAnimationFrame(function () { document.body.classList.add("ready"); });
  });
  flip.on("flip", function () { refresh(FLIP_MS / 2); });
  flip.on("changeOrientation", function () { refresh(0); });
  window.addEventListener("resize", function () {
    resetZoom(false);
    requestAnimationFrame(function () { refresh(0); });
  });

  // ---- Controls -----------------------------------------------------------
  slider.max = String(n);
  function updateControls() {
    var spread = spreadAt(currentSpread());
    var first = spread[0], last = spread[spread.length - 1];
    count.textContent = (first === last ? first + 1 : (first + 1) + "\\u2013" + (last + 1)) + " / " + n;
    slider.value = String(first + 1);
    ["first", "prev", "prev2"].forEach(function (id) { $(id).disabled = first === 0; });
    ["last", "next", "next2"].forEach(function (id) { $(id).disabled = last >= n - 1; });
  }
  function next() { resetZoom(true); flip.flipNext(); }
  function prev() { resetZoom(true); flip.flipPrev(); }
  function goTo(index) {
    resetZoom(true);
    var target = flip.getPageCollection().getSpreadIndexByPage(index);
    if (target === null || target === currentSpread()) { updateControls(); return; }
    loadAround(index);
    playFlipSound();
    flip.turnToPage(index);
  }
  $("next").onclick = $("next2").onclick = next;
  $("prev").onclick = $("prev2").onclick = prev;
  $("first").onclick = function () { goTo(0); };
  $("last").onclick = function () { goTo(n - 1); };
  slider.oninput = function () { count.textContent = slider.value + " / " + n; };
  slider.onchange = function () { goTo(Number(slider.value) - 1); };

  document.addEventListener("keydown", function (e) {
    if (e.target === slider || e.ctrlKey || e.metaKey || e.altKey) return;
    switch (e.key) {
      case "ArrowRight": case "PageDown": next(); break;
      case "ArrowLeft": case "PageUp": prev(); break;
      case "Home": goTo(0); break;
      case "End": goTo(n - 1); break;
      case "+": case "=": zoomBy(1); break;
      case "-": zoomBy(-1); break;
      case "Escape": resetZoom(true); return;
      default: return;
    }
    e.preventDefault();
  });

  // ---- Zoom ---------------------------------------------------------------
  var ZOOMS = [1, 1.5, 2, 3], zoomLevel = 0, panX = 0, panY = 0, lastWheelZoom = 0;
  function applyZoom(animate) {
    var z = ZOOMS[zoomLevel];
    var maxX = stage.clientWidth * (z - 1) / 2, maxY = stage.clientHeight * (z - 1) / 2;
    panX = Math.max(-maxX, Math.min(maxX, panX));
    panY = Math.max(-maxY, Math.min(maxY, panY));
    zoomBox.style.transition = animate ? "transform .25s ease" : "none";
    zoomBox.style.transform = z === 1 ? "" :
      "translate(" + panX + "px," + panY + "px) scale(" + z + ")";
    pan.hidden = z === 1;
    $("zoomOut").disabled = z === 1;
    $("zoomIn").disabled = zoomLevel === ZOOMS.length - 1;
  }
  function zoomBy(step) {
    var before = ZOOMS[zoomLevel];
    zoomLevel = Math.max(0, Math.min(ZOOMS.length - 1, zoomLevel + step));
    var z = ZOOMS[zoomLevel];
    panX = z === 1 ? 0 : panX * z / before;
    panY = z === 1 ? 0 : panY * z / before;
    applyZoom(true);
  }
  function resetZoom(animate) {
    if (zoomLevel === 0) return;
    zoomLevel = 0;
    panX = panY = 0;
    applyZoom(animate);
  }
  $("zoomIn").onclick = function () { zoomBy(1); };
  $("zoomOut").onclick = function () { zoomBy(-1); };

  var drag = null;
  pan.addEventListener("pointerdown", function (e) {
    drag = { x: e.clientX, y: e.clientY, panX: panX, panY: panY };
    pan.setPointerCapture(e.pointerId);
    pan.classList.add("dragging");
  });
  pan.addEventListener("pointermove", function (e) {
    if (!drag) return;
    panX = drag.panX + e.clientX - drag.x;
    panY = drag.panY + e.clientY - drag.y;
    applyZoom(false);
  });
  function endDrag() { drag = null; pan.classList.remove("dragging"); }
  pan.addEventListener("pointerup", endDrag);
  pan.addEventListener("pointercancel", endDrag);
  pan.addEventListener("dblclick", function () { resetZoom(true); });
  stage.addEventListener("wheel", function (e) {
    if (e.ctrlKey) {
      // Ctrl + wheel, or a trackpad pinch.
      e.preventDefault();
      if (Date.now() - lastWheelZoom > 250) {
        lastWheelZoom = Date.now();
        zoomBy(e.deltaY < 0 ? 1 : -1);
      }
    } else if (zoomLevel > 0) {
      e.preventDefault();
      panX -= e.deltaX;
      panY -= e.deltaY;
      applyZoom(false);
    }
  }, { passive: false });
  applyZoom(false);

  // ---- Page-turn sound (embedded in the page, so it works offline) --------
  // data.sound is the page-turn recording as a data URL. It is decoded with
  // the Web Audio API on the first tap or key press (browsers only allow
  // audio after one). Without it, a paper rustle is synthesised instead.
  var soundButton = $("sound"), soundOn = true, audio = null, sounds = null;
  var flipBuffer = null, waitingSince = 0;
  try { soundOn = localStorage.getItem("flipbook-sound") !== "off"; } catch (e) {}
  function showSoundState() {
    soundButton.classList.toggle("muted", !soundOn);
    soundButton.title = soundOn ? "Turn sound off" : "Turn sound on";
    soundButton.setAttribute("aria-label", soundButton.title);
    soundButton.setAttribute("aria-pressed", soundOn ? "false" : "true");
  }
  soundButton.onclick = function () {
    soundOn = !soundOn;
    try { localStorage.setItem("flipbook-sound", soundOn ? "on" : "off"); } catch (e) {}
    showSoundState();
  };
  showSoundState();

  // A short paper rustle: noise that swells and fades, with a little crackle.
  function makeSounds(ctx) {
    var list = [];
    for (var v = 0; v < 4; v++) {
      var rate = ctx.sampleRate, length = Math.floor(rate * 0.55);
      var buffer = ctx.createBuffer(1, length, rate), d = buffer.getChannelData(0);
      var smooth = 0, peak = 0, i;
      for (i = 0; i < length; i++) {
        var t = i / rate;
        var env = t < 0.07 ? t / 0.07 : Math.exp(-(t - 0.07) * 6.5);
        var white = Math.random() * 2 - 1;
        smooth += (white - smooth) * 0.18;
        var crackle = Math.random() < 0.0015 ? 2 + Math.random() * 3 : 1;
        d[i] = (white * 0.35 + smooth * 1.6) * env * crackle;
        peak = Math.max(peak, Math.abs(d[i]));
      }
      for (i = 0; i < length; i++) d[i] = d[i] / peak * 0.6;
      list.push(buffer);
    }
    return list;
  }
  function startAudio() {
    if (audio) return audio;
    var AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    audio = new AudioCtx();
    if (data.sound) {
      try {
        var bin = atob(data.sound.slice(data.sound.indexOf(",") + 1));
        var bytes = new Uint8Array(bin.length);
        for (var k = 0; k < bin.length; k++) bytes[k] = bin.charCodeAt(k);
        var decoded = function (buffer) {
          flipBuffer = buffer;
          // A turn started while decoding: play it now if it was just now.
          if (waitingSince && Date.now() - waitingSince < 400) playRecording();
          waitingSince = 0;
        };
        // Older Safari only supports the callback form.
        var promise = audio.decodeAudioData(bytes.buffer, decoded, function () { data.sound = null; });
        if (promise && promise.catch) promise.catch(function () { data.sound = null; });
      } catch (e) {
        data.sound = null;
      }
    }
    if (!data.sound) sounds = makeSounds(audio);
    return audio;
  }
  function warmUp() {
    if (soundOn) { try { startAudio(); } catch (e) {} }
  }
  document.addEventListener("pointerdown", warmUp, true);
  document.addEventListener("keydown", warmUp, true);

  function playRecording() {
    if (audio.state === "suspended") audio.resume();
    var source = audio.createBufferSource();
    source.buffer = flipBuffer;
    // A touch of variation so repeated turns don't sound identical.
    source.playbackRate.value = 0.96 + Math.random() * 0.08;
    var gain = audio.createGain();
    gain.gain.value = 0.9;
    source.connect(gain);
    gain.connect(audio.destination);
    source.start(audio.currentTime);
  }

  function playFlipSound() {
    if (!soundOn) return;
    try {
      if (!startAudio()) return;
      if (data.sound) {
        if (flipBuffer) playRecording();
        else waitingSince = Date.now();
        return;
      }
      if (!sounds) sounds = makeSounds(audio);
      if (audio.state === "suspended") audio.resume();
      var now = audio.currentTime;
      var source = audio.createBufferSource();
      source.buffer = sounds[Math.floor(Math.random() * sounds.length)];
      source.playbackRate.value = 0.85 + Math.random() * 0.3;
      var highpass = audio.createBiquadFilter();
      highpass.type = "highpass";
      highpass.frequency.value = 300;
      var band = audio.createBiquadFilter();
      band.type = "bandpass";
      band.Q.value = 0.7;
      band.frequency.setValueAtTime(900, now);
      band.frequency.exponentialRampToValueAtTime(3000, now + 0.3);
      var gain = audio.createGain();
      gain.gain.value = 0.8;
      source.connect(highpass);
      highpass.connect(band);
      band.connect(gain);
      gain.connect(audio.destination);
      source.start(now);
    } catch (e) {}
  }

  // ---- Full screen and PDF download ---------------------------------------
  var fullscreen = $("fullscreen");
  if (document.fullscreenEnabled) {
    fullscreen.onclick = function () {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen().catch(function () {});
    };
  } else {
    fullscreen.hidden = true;
  }

  var download = $("download");
  if (download && data.pdf) {
    var pdfUrl = data.pdf.url || null;
    download.onclick = function () {
      if (!pdfUrl) {
        var bin = atob(data.pdf.base64);
        var bytes = new Uint8Array(bin.length);
        for (var k = 0; k < bin.length; k++) bytes[k] = bin.charCodeAt(k);
        pdfUrl = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      }
      var a = document.createElement("a");
      a.href = pdfUrl;
      a.download = data.pdf.fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
    };
  }
})();
`;

const LIBRARY_BANNER = "/* StPageFlip 2.0.7 - MIT License - https://github.com/Nodlik/StPageFlip */\n";

/** The library as it appears inside its <script> element. */
function libraryScript(pageFlipSource: string): string {
  // A literal "</script" inside the library would end the element early.
  return LIBRARY_BANNER + pageFlipSource.replace(/<\/script/gi, "<\\/script");
}

/**
 * The exact text of every executable inline <script> in the viewer. They are
 * the same for every flipbook, so a server can allow them by hash in its
 * Content-Security-Policy.
 */
export function viewerInlineScripts(pageFlipSource: string): string[] {
  return [libraryScript(pageFlipSource), VIEWER_SCRIPT];
}

export function buildFlipbookHtml(options: FlipbookHtmlOptions): string {
  const first = options.pages[0];
  const title = options.title.trim() || "Flipbook";
  const data = {
    pages: options.pages.map((p) => p.src),
    width: first.width,
    height: first.height,
    showCover: options.showCover,
    pdf: options.pdf,
    overlay: options.overlayText ? true : false,
    sound: options.sound ?? null,
  };
  const downloadButton = options.pdf
    ? `<button class="primary" id="download" type="button" title="Download PDF">${icon("download")}<span>Download PDF</span></button>`
    : "";
  const soundIcons = `<span class="on">${icon("soundOn")}</span><span class="off">${icon("soundOff")}</span>`;
  const badge = options.badge
    ? `<a class="badge" href="${escapeHtml(options.badge.href)}" target="_blank" rel="noopener">${escapeHtml(options.badge.text)} <b>${escapeHtml(options.badge.brand)}</b></a>`
    : "";
  const [library, viewer] = viewerInlineScripts(options.pageFlipSource);

  return `<!doctype html>
<html lang="${escapeHtml(options.lang ?? "en")}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(title)}</title>
${options.head ?? ""}
<style>${styles(options.overlayText)}</style>
</head>
<body>
<header class="topbar">
<h1 class="title">${escapeHtml(title)}</h1>
<div class="pill">
${iconButton("zoomOut", "zoomOut", "Zoom out")}
${iconButton("zoomIn", "zoomIn", "Zoom in")}
<button class="icon-btn" id="sound" type="button">${soundIcons}</button>
${iconButton("fullscreen", "fullscreen", "Full screen")}
</div>
${downloadButton}
</header>
<main class="stage" id="stage">
<div class="zoom" id="zoom"><div class="shift" id="shift"><div class="stack" id="stack"></div><div id="book"></div></div></div>
<div class="pan" id="pan" hidden></div>
<button class="side prev" id="prev" type="button" title="Previous page" aria-label="Previous page">${icon("prev")}</button>
<button class="side next" id="next" type="button" title="Next page" aria-label="Next page">${icon("next")}</button>
</main>
<footer class="bottombar">
<nav class="pill pager" aria-label="Pages">
${iconButton("first", "first", "First page")}
${iconButton("prev2", "prev", "Previous page", "narrow-only")}
<input id="slider" type="range" min="1" max="1" value="1" aria-label="Page">
${iconButton("next2", "next", "Next page", "narrow-only")}
${iconButton("last", "last", "Last page")}
<span class="count" id="count" aria-live="polite"></span>
</nav>
${badge}
</footer>
<noscript><p style="text-align:center">Turn on JavaScript to view this flipbook.</p></noscript>
<script type="application/json" id="flipbook-data">${scriptJson(data)}</script>
<script>${library}</script>
<script>${viewer}</script>
</body>
</html>
`;
}
