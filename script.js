/* ===========================================
   MIDNIGHT PLAYER — Mobile-optimized script.js
   - Playlist: 4 tracks (fixed routes/names)
   - Cover + backdrop crossfade
   - Palette sync from cover (idle-time + cached)
   - WebAudio visualizer (only when playing, respects reduced-motion)
   - Mobile behavior: touch-first seek, tilt disabled on coarse pointers
   - Page visibility + AudioContext resume (iOS/Android friendly)
   - Media Session controls (lockscreen / headset buttons)
   =========================================== */

(() => {
  "use strict";

  /* ---------- Helpers ---------- */
  const $ = (q, r = document) => r.querySelector(q);
  const $$ = (q, r = document) => Array.from(r.querySelectorAll(q));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const clamp01 = (v) => clamp(v, 0, 1);
  const pad2 = (n) => String(n).padStart(2, "0");

  const fmtTime = (s) => {
    if (!Number.isFinite(s) || s < 0) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${String(sec).padStart(2, "0")}`;
  };

  const prefersReducedMotion = () =>
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const isCoarsePointer = () =>
    window.matchMedia && window.matchMedia("(pointer: coarse)").matches;

  const canHover = () =>
    window.matchMedia && window.matchMedia("(hover: hover)").matches;

  const idle = (fn, timeout = 450) => {
    // requestIdleCallback is great on mobile; fallback to a short timeout
    if ("requestIdleCallback" in window) {
      return window.requestIdleCallback(fn, { timeout });
    }
    return window.setTimeout(fn, Math.min(timeout, 300));
  };

  /* ---------- DOM (matches your HTML) ---------- */
  const audio = $("#audio");
  const coverWrap = $("#coverWrap");
  const coverImg = $("#coverImg");

  const trackTitle = $("#trackTitle");
  const trackArtist = $("#trackArtist");
  const chipIndex = $("#chipIndex");
  const chipState = $("#chipState");
  const chipMode = $("#chipMode");

  const timeNow = $("#timeNow");
  const timeTotal = $("#timeTotal");

  const seek = $("#seek");
  const seekFill = $("#seekFill");
  const seekKnob = $("#seekKnob");

  const btnPrev = $("#btnPrev");
  const btnPlay = $("#btnPlay");
  const btnNext = $("#btnNext");
  const playIcon = $("#playIcon");
  const pauseIcon = $("#pauseIcon");

  const vol = $("#vol");
  const trackListEl = $("#trackList");
  const footStatus = $("#footStatus");

  const btnThemePulse = $("#btnThemePulse");
  const barsHost = $("#bars");

  const backdropA = $(".backdrop__img--a");
  const backdropB = $(".backdrop__img--b");

  if (!audio) return;

  // Help mobile pointer interactions (especially iOS)
  if (seek) seek.style.touchAction = "none";

  // Encourage light network usage
  audio.preload = "metadata";

  /* ---------- Fixed playlist (as you requested) ---------- */
  const TRACKS = [
    { title: "Me Haces Feliz", artist: "Serbia", src: "track1.mp3", cover: "cover1.jpeg" },
    { title: "Campo de Fuerza", artist: "Zoé", src: "track2.mp3", cover: "cover2.jpeg" },
    { title: "No Te Des Por Vencida", artist: "Serbia", src: "track3.mp3", cover: "cover3.jpeg" },
    { title: "Francés Limón", artist: "Enanitos Verdes", src: "track4.mp3", cover: "cover4.jpeg" },
  ];

  /* ---------- CSS vars ---------- */
  const root = document.documentElement;
  const cssVar = (k) => getComputedStyle(root).getPropertyValue(k).trim();
  const setVar = (k, v) => root.style.setProperty(k, v);

  /* ---------- Color utils (fast + small) ---------- */
  const hexToRgb = (hex) => {
    const m = String(hex).trim().match(/^#?([0-9a-f]{6})$/i);
    if (!m) return null;
    const h = m[1];
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
    };
  };

  const rgbToHex = (r, g, b) =>
    `#${[r, g, b]
      .map((n) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, "0"))
      .join("")}`;

  const rgbToHsl = (r, g, b) => {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0, l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        default: h = (r - g) / d + 4;
      }
      h /= 6;
    }
    return [h, s, l];
  };

  const hslToRgb = (h, s, l) => {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    let r, g, b;
    if (s === 0) r = g = b = l;
    else {
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1 / 3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1 / 3);
    }
    return [r * 255, g * 255, b * 255];
  };

  // Dark + slightly saturated (goth polish)
  const gothify = (hex, satBoost = 0.18, lightShift = -0.12) => {
    const rgb = hexToRgb(hex);
    if (!rgb) return hex;
    let [h, s, l] = rgbToHsl(rgb.r, rgb.g, rgb.b);
    s = clamp01(s + satBoost);
    l = clamp01(l + lightShift);
    const [rr, gg, bb] = hslToRgb(h, s, l);
    return rgbToHex(rr, gg, bb);
  };

  /* ---------- Palette extraction (cached; idle-time) ---------- */
  const paletteCache = new Map(); // coverUrl -> {a1,a2} | null

  const extractPalette = async (url) => {
    if (paletteCache.has(url)) return paletteCache.get(url);

    // On low-motion preference, skip heavy work and keep current theme
    if (prefersReducedMotion()) {
      paletteCache.set(url, null);
      return null;
    }

    try {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.decoding = "async";
      await new Promise((res, rej) => {
        img.onload = res;
        img.onerror = rej;
        img.src = url;
      });

      // Small canvas for mobile perf
      const W = 80, H = 80;
      const c = document.createElement("canvas");
      c.width = W; c.height = H;
      const ctx = c.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, W, H);

      const data = ctx.getImageData(0, 0, W, H).data;

      const buckets = new Map();
      const minLum = 18, maxLum = 235;

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
        if (a < 200) continue;
        const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        if (lum < minLum || lum > maxLum) continue;

        // 16-level quantization per channel
        const qr = (r >> 4) << 4;
        const qg = (g >> 4) << 4;
        const qb = (b >> 4) << 4;
        const key = (qr << 16) | (qg << 8) | qb;

        const v = buckets.get(key);
        if (v) v.count++;
        else buckets.set(key, { r: qr, g: qg, b: qb, count: 1 });
      }

      if (!buckets.size) {
        paletteCache.set(url, null);
        return null;
      }

      const sorted = Array.from(buckets.values()).sort((a, b) => b.count - a.count);

      const pick = [];
      for (const c0 of sorted) {
        if (!pick.length) pick.push(c0);
        else {
          const [h1] = rgbToHsl(pick[0].r, pick[0].g, pick[0].b);
          const [h2] = rgbToHsl(c0.r, c0.g, c0.b);
          const dh = Math.min(Math.abs(h1 - h2), 1 - Math.abs(h1 - h2));
          if (dh > 0.08) { pick.push(c0); break; }
        }
        if (pick.length === 2) break;
      }

      if (pick.length === 1) {
        let [h, s, l] = rgbToHsl(pick[0].r, pick[0].g, pick[0].b);
        h = (h + 0.12) % 1;
        s = clamp01(s + 0.12);
        l = clamp01(l - 0.06);
        const [rr, gg, bb] = hslToRgb(h, s, l);
        pick.push({ r: rr, g: gg, b: bb });
      }

      const a1 = gothify(rgbToHex(pick[0].r, pick[0].g, pick[0].b));
      const a2 = gothify(rgbToHex(pick[1].r, pick[1].g, pick[1].b), 0.12, -0.10);

      const out = { a1, a2 };
      paletteCache.set(url, out);
      return out;
    } catch {
      paletteCache.set(url, null);
      return null;
    }
  };

  const applyTheme = (accent, accent2) => {
    if (accent) setVar("--accent", accent);
    if (accent2) setVar("--accent2", accent2);

    // keep background harmonized (subtle)
    const rgb = hexToRgb(accent || cssVar("--accent") || "#c51b55");
    if (rgb) {
      let [h, s] = rgbToHsl(rgb.r, rgb.g, rgb.b);
      s = clamp01(s * 0.55);
      const [rr, gg, bb] = hslToRgb(h, s, 0.10);
      setVar("--bg1", rgbToHex(rr, gg, bb));
    }
  };

  /* ---------- Backdrop crossfade ---------- */
  let backdropFlip = false;
  const setBackdrop = (url) => {
    const on = backdropFlip ? backdropA : backdropB;
    const off = backdropFlip ? backdropB : backdropA;
    backdropFlip = !backdropFlip;

    if (on) {
      on.style.backgroundImage = `url("${url}")`;
      on.classList.add("is-on");
    }
    if (off) off.classList.remove("is-on");
  };

  /* ---------- UI state ---------- */
  const state = {
    i: 0,
    seeking: false,
    wasPlayingBeforeSeek: false,
    rafProgress: 0,
    rafViz: 0,
    rafFallback: 0,
    vizRunning: false,
    progressRunning: false,
    lastPaint: 0,
    seekRect: null,
  };

  const setChipState = (s) => (chipState.textContent = s);
  const setFoot = (s) => (footStatus.textContent = s);

  const setPlayIcons = (playing) => {
    if (playIcon) playIcon.classList.toggle("hidden", playing);
    if (pauseIcon) pauseIcon.classList.toggle("hidden", !playing);
  };

  const setSeekUI = (pct) => {
    const p = clamp01(pct);
    if (seekFill) seekFill.style.width = `${(p * 100).toFixed(3)}%`;
    if (seekKnob) seekKnob.style.left = `${(p * 100).toFixed(3)}%`;
  };

  const markActiveTrack = () => {
    $$(".track", trackListEl).forEach((row) => {
      const active = Number(row.dataset.index) === state.i;
      row.classList.toggle("is-active", active);
      const pill = $(".track__pill", row);
      if (!pill) return;
      pill.textContent = !active ? "PLAY" : (audio.paused ? "READY" : "LIVE");
    });
  };

  /* ---------- Playlist ---------- */
  const renderPlaylist = () => {
    if (!trackListEl) return;
    trackListEl.innerHTML = "";
    TRACKS.forEach((t, i) => {
      const row = document.createElement("div");
      row.className = "track";
      row.dataset.index = String(i);

      row.innerHTML = `
        <div class="track__idx">${pad2(i + 1)}</div>
        <div>
          <div class="track__title"></div>
          <div class="track__artist"></div>
        </div>
        <div class="track__pill">PLAY</div>
      `;

      $(".track__title", row).textContent = t.title;
      $(".track__artist", row).textContent = t.artist;

      // Fast tap behavior
      row.addEventListener("click", () => {
        if (state.i !== i) loadTrack(i, { autoplay: true });
        else togglePlay();
      }, { passive: true });

      trackListEl.appendChild(row);
    });
    markActiveTrack();
  };

  /* ---------- Cover swap animation hook ---------- */
  const animateCoverSwap = () => {
    if (!coverWrap) return;
    coverWrap.classList.add("is-swap");
    window.setTimeout(() => coverWrap.classList.remove("is-swap"), 560);
  };

  const preloadImage = (url) =>
    new Promise((res) => {
      const img = new Image();
      img.decoding = "async";
      img.onload = () => res(true);
      img.onerror = () => res(false);
      img.src = url;
    });

  const waitMeta = () =>
    new Promise((res) => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) return res();
      const on = () => res();
      audio.addEventListener("loadedmetadata", on, { once: true });
    });

  /* ---------- Media Session (mobile lockscreen/headset controls) ---------- */
  const updateMediaSession = () => {
    if (!("mediaSession" in navigator)) return;
    try {
      const t = TRACKS[state.i];
      navigator.mediaSession.metadata = new MediaMetadata({
        title: t.title,
        artist: t.artist,
        album: " ",
        artwork: [
          { src: t.cover, sizes: "512x512", type: "image/jpeg" },
          { src: t.cover, sizes: "1024x1024", type: "image/jpeg" },
        ],
      });

      navigator.mediaSession.setActionHandler("play", () => safePlay());
      navigator.mediaSession.setActionHandler("pause", () => pause());
      navigator.mediaSession.setActionHandler("previoustrack", () => prev());
      navigator.mediaSession.setActionHandler("nexttrack", () => next());
      navigator.mediaSession.setActionHandler("seekto", (details) => {
        if (details && typeof details.seekTime === "number" && Number.isFinite(audio.duration)) {
          audio.currentTime = clamp(details.seekTime, 0, audio.duration);
          paintProgress(true);
        }
      });
    } catch {
      // ignore
    }
  };

  /* ---------- AudioGraph + Visualizer ---------- */
  let audioCtx = null, analyser = null, srcNode = null, freq = null;

  const ensureBars = () => {
    if (!barsHost || barsHost.childElementCount) return;
    const N = 26; // slightly fewer for mobile perf
    for (let i = 0; i < N; i++) {
      const bar = document.createElement("div");
      bar.className = "bar";
      bar.style.height = `${12 + (i % 5)}px`;
      bar.style.opacity = String(0.72 + (i / N) * 0.28);
      barsHost.appendChild(bar);
    }
  };

  const ensureAudioGraph = async () => {
    if (prefersReducedMotion()) return; // respect reduced motion: no analyser

    if (audioCtx && analyser && srcNode) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.84;

    srcNode = audioCtx.createMediaElementSource(audio);
    srcNode.connect(analyser);
    analyser.connect(audioCtx.destination);

    freq = new Uint8Array(analyser.frequencyBinCount);
    ensureBars();
  };

  const stopViz = () => {
    state.vizRunning = false;
    cancelAnimationFrame(state.rafViz);
    cancelAnimationFrame(state.rafFallback);

    // settle bars
    if (barsHost) {
      $$(".bar", barsHost).forEach((b, i) => (b.style.height = `${12 + (i % 5)}px`));
    }
  };

  const tickViz = () => {
    if (!state.vizRunning || !analyser || !freq) return;

    analyser.getByteFrequencyData(freq);
    const bars = $$(".bar", barsHost);
    const n = Math.min(bars.length, freq.length);

    for (let i = 0; i < n; i++) {
      const v = freq[i] / 255;               // 0..1
      const shaped = Math.pow(v, 0.88);      // punch without noise
      const h = 10 + shaped * 56;
      bars[i].style.height = `${h.toFixed(1)}px`;
    }

    state.rafViz = requestAnimationFrame(tickViz);
  };

  const tickFallback = () => {
    if (!state.vizRunning) return;
    const bars = $$(".bar", barsHost);
    const t = performance.now() * 0.002;
    for (let i = 0; i < bars.length; i++) {
      const wave = (Math.sin(t + i * 0.45) * 0.5 + 0.5);
      const jitter = (Math.sin(t * 1.6 + i) * 0.10);
      const h = 12 + (wave + jitter) * 50;
      bars[i].style.height = `${h.toFixed(1)}px`;
    }
    state.rafFallback = requestAnimationFrame(tickFallback);
  };

  const startViz = () => {
    if (prefersReducedMotion()) return;
    ensureBars();
    if (state.vizRunning) return;
    state.vizRunning = true;

    if (analyser && freq) tickViz();
    else tickFallback();
  };

  /* ---------- Progress painting (optimized) ---------- */
  const paintProgress = (force = false) => {
    if (state.seeking) return;

    const now = performance.now();
    if (!force && (now - state.lastPaint) < 50) return; // ~20fps is enough on mobile
    state.lastPaint = now;

    if (Number.isFinite(audio.duration) && audio.duration > 0) {
      const pct = audio.currentTime / audio.duration;
      setSeekUI(pct);
      if (timeNow) timeNow.textContent = fmtTime(audio.currentTime);
      if (timeTotal) timeTotal.textContent = fmtTime(audio.duration);
    } else {
      setSeekUI(0);
      if (timeNow) timeNow.textContent = "0:00";
    }
  };

  const stopProgressLoop = () => {
    state.progressRunning = false;
    cancelAnimationFrame(state.rafProgress);
  };

  const tickProgressLoop = () => {
    if (!state.progressRunning) return;
    paintProgress(false);
    state.rafProgress = requestAnimationFrame(tickProgressLoop);
  };

  const startProgressLoop = () => {
    if (state.progressRunning) return;
    state.progressRunning = true;
    state.lastPaint = 0;
    tickProgressLoop();
  };

  /* ---------- Player controls ---------- */
  const syncPlayState = () => {
    const playing = !audio.paused && !audio.ended;
    setPlayIcons(playing);
    setChipState(playing ? "PLAYING" : "PAUSED");
    setFoot(playing ? "Live" : "Ready");
    markActiveTrack();

    if (playing) {
      startViz();
      startProgressLoop();
    } else {
      stopViz();
      // Keep progress loop only if user is seeking
      if (!state.seeking) stopProgressLoop();
    }
  };

  const safePlay = async () => {
    try {
      await ensureAudioGraph();
      if (audioCtx && audioCtx.state === "suspended") await audioCtx.resume();
      await audio.play();
    } catch {
      // autoplay policies: require user gesture
    } finally {
      syncPlayState();
    }
  };

  const pause = () => {
    audio.pause();
    syncPlayState();
  };

  const togglePlay = async () => {
    if (audio.paused) await safePlay();
    else pause();
  };

  const prev = () => loadTrack(state.i - 1, { autoplay: !audio.paused });
  const next = () => loadTrack(state.i + 1, { autoplay: !audio.paused });

  /* ---------- Seek (touch-first, pointer capture) ---------- */
  const updateSeekRect = () => {
    if (!seek) return;
    state.seekRect = seek.getBoundingClientRect();
  };

  const clientXToPct = (x) => {
    const r = state.seekRect || seek.getBoundingClientRect();
    if (r.width <= 0) return 0;
    return clamp01((x - r.left) / r.width);
  };

  const seekToPct = (pct) => {
    if (!Number.isFinite(audio.duration) || audio.duration <= 0) return;
    audio.currentTime = pct * audio.duration;
    setSeekUI(pct);
    if (timeNow) timeNow.textContent = fmtTime(audio.currentTime);
  };

  const bindSeek = () => {
    if (!seek) return;
    updateSeekRect();

    const onDown = (e) => {
      state.seeking = true;
      state.wasPlayingBeforeSeek = !audio.paused;

      // Pause during drag for stable UX on mobile
      audio.pause();

      updateSeekRect();
      const pct = clientXToPct(e.clientX);
      seekToPct(pct);

      // Capture pointer if possible
      if (seek.setPointerCapture) {
        try { seek.setPointerCapture(e.pointerId); } catch {}
      }

      syncPlayState();
    };

    const onMove = (e) => {
      if (!state.seeking) return;
      const pct = clientXToPct(e.clientX);
      seekToPct(pct);
    };

    const onUp = async () => {
      if (!state.seeking) return;
      state.seeking = false;

      if (state.wasPlayingBeforeSeek) await safePlay();
      else syncPlayState();
    };

    seek.addEventListener("pointerdown", onDown);
    seek.addEventListener("pointermove", onMove);
    seek.addEventListener("pointerup", onUp);
    seek.addEventListener("pointercancel", onUp);

    // Recalc rect on resize/orientation change
    window.addEventListener("resize", () => updateSeekRect(), { passive: true });
    window.addEventListener("orientationchange", () => {
      window.setTimeout(updateSeekRect, 120);
    }, { passive: true });
  };

  /* ---------- Volume ---------- */
  const bindVolume = () => {
    if (!vol) return;
    audio.volume = Number(vol.value);
    vol.addEventListener("input", () => {
      audio.volume = Number(vol.value);
    }, { passive: true });
  };

  /* ---------- Cover tilt (disabled on mobile/coarse pointers) ---------- */
  const bindCoverTilt = () => {
    if (!coverWrap) return;
    if (isCoarsePointer() || !canHover()) return;

    const max = 7;
    const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

    const onMove = (e) => {
      const r = coverWrap.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;

      const dx = clamp((e.clientX - cx) / (r.width / 2), -1, 1);
      const dy = clamp((e.clientY - cy) / (r.height / 2), -1, 1);

      const rx = -max * easeOutCubic(Math.abs(dy)) * Math.sign(dy);
      const ry =  max * easeOutCubic(Math.abs(dx)) * Math.sign(dx);

      coverWrap.style.transform = `perspective(900px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg)`;
    };

    const reset = () => {
      coverWrap.style.transform = "perspective(900px) rotateX(0deg) rotateY(0deg)";
    };

    coverWrap.addEventListener("pointermove", onMove);
    coverWrap.addEventListener("pointerleave", reset);
    coverWrap.addEventListener("blur", reset);
  };

  /* ---------- Theme pulse ---------- */
  const bindPulse = () => {
    if (!btnThemePulse) return;

    btnThemePulse.addEventListener("click", () => {
      // lightweight animation (no layout trash)
      root.animate(
        [
          { filter: "brightness(1) saturate(1)" },
          { filter: "brightness(1.08) saturate(1.25)" },
          { filter: "brightness(1) saturate(1)" },
        ],
        { duration: 420, easing: "cubic-bezier(.2,.9,.12,1)" }
      );

      const a = cssVar("--accent") || "#c51b55";
      const b = cssVar("--accent2") || "#7a3cff";
      applyTheme(gothify(a, 0.06, -0.02), gothify(b, 0.04, -0.02));

      setFoot("Pulse");
      window.setTimeout(() => setFoot((!audio.paused && !audio.ended) ? "Live" : "Ready"), 520);
    }, { passive: true });
  };

  /* ---------- Buttons + gesture priming ---------- */
  const bindControls = () => {
    if (btnPlay) btnPlay.addEventListener("click", () => togglePlay(), { passive: true });
    if (btnPrev) btnPrev.addEventListener("click", () => prev(), { passive: true });
    if (btnNext) btnNext.addEventListener("click", () => next(), { passive: true });

    // Prime AudioContext on first user gesture (iOS/Android policies)
    const prime = async () => {
      try {
        await ensureAudioGraph();
        if (audioCtx && audioCtx.state === "suspended") await audioCtx.resume();
      } catch {}
      window.removeEventListener("pointerdown", prime, true);
      window.removeEventListener("touchstart", prime, true);
      window.removeEventListener("keydown", prime, true);
    };
    window.addEventListener("pointerdown", prime, true);
    window.addEventListener("touchstart", prime, true);
    window.addEventListener("keydown", prime, true);
  };

  /* ---------- Keyboard (kept, but mobile-safe) ---------- */
  const bindKeyboard = () => {
    window.addEventListener("keydown", (e) => {
      const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : "";
      if (tag === "input" || tag === "textarea") return;

      if (e.code === "Space") {
        e.preventDefault();
        togglePlay();
      } else if (e.code === "ArrowLeft") {
        e.preventDefault();
        prev();
      } else if (e.code === "ArrowRight") {
        e.preventDefault();
        next();
      }
    });
  };

  /* ---------- Load track ---------- */
  const loadTrack = async (index, { autoplay = false } = {}) => {
    state.i = (index + TRACKS.length) % TRACKS.length;
    const t = TRACKS[state.i];

    if (chipIndex) chipIndex.textContent = `${pad2(state.i + 1)}/${pad2(TRACKS.length)}`;
    setChipState("LOADING");
    setFoot("Loading");
    if (chipMode) chipMode.textContent = "HI-FI";

    if (trackTitle) trackTitle.textContent = t.title;
    if (trackArtist) trackArtist.textContent = t.artist;

    // Smooth cover swap: preload then animate
    await preloadImage(t.cover);

    animateCoverSwap();
    if (coverImg) coverImg.src = t.cover;
    setBackdrop(t.cover);

    // Apply palette in idle time so it doesn't hitch scrolling on mobile
    idle(async () => {
      const pal = await extractPalette(t.cover);
      if (pal) applyTheme(pal.a1, pal.a2);
    });

    // Audio source
    const resumeAfter = !audio.paused;
    audio.src = t.src;
    audio.load();

    await waitMeta();

    if (timeTotal) timeTotal.textContent = fmtTime(audio.duration);
    if (timeNow) timeNow.textContent = fmtTime(0);
    setSeekUI(0);

    setChipState("READY");
    setFoot("Ready");
    markActiveTrack();

    updateMediaSession();

    // Preload adjacent covers (lightweight)
    idle(() => {
      const nextI = (state.i + 1) % TRACKS.length;
      const prevI = (state.i - 1 + TRACKS.length) % TRACKS.length;
      preloadImage(TRACKS[nextI].cover);
      preloadImage(TRACKS[prevI].cover);
    }, 700);

    if (autoplay || resumeAfter) await safePlay();
  };

  /* ---------- Audio events ---------- */
  const bindAudioEvents = () => {
    audio.addEventListener("play", syncPlayState);
    audio.addEventListener("pause", syncPlayState);

    audio.addEventListener("timeupdate", () => paintProgress(false), { passive: true });

    audio.addEventListener("loadedmetadata", () => {
      if (timeTotal) timeTotal.textContent = fmtTime(audio.duration);
      paintProgress(true);
    });

    audio.addEventListener("ended", () => {
      setChipState("ENDED");
      setFoot("Ended");
      markActiveTrack();
      stopViz();
      // Auto-next with tasteful delay
      window.setTimeout(() => loadTrack(state.i + 1, { autoplay: true }), 360);
    });

    audio.addEventListener("error", () => {
      setChipState("ERROR");
      setFoot("Audio error");
      syncPlayState();
    });

    // If user leaves the tab/app, pause (mobile battery + UX)
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        if (!audio.paused) audio.pause();
        stopViz();
        stopProgressLoop();
      } else {
        // don't auto-play on return; just refresh UI
        paintProgress(true);
        syncPlayState();
      }
    });
  };

  /* ---------- Init ---------- */
  const init = async () => {
    renderPlaylist();
    bindControls();
    bindSeek();
    bindVolume();
    bindKeyboard();
    bindCoverTilt();
    bindPulse();
    bindAudioEvents();

    ensureBars();

    // Start in a calm state
    if (chipIndex) chipIndex.textContent = `01/${pad2(TRACKS.length)}`;
    setChipState("STOPPED");
    if (chipMode) chipMode.textContent = "HI-FI";
    if (timeNow) timeNow.textContent = "0:00";
    if (timeTotal) timeTotal.textContent = "0:00";
    setSeekUI(0);

    // Initial theme fallback
    applyTheme(cssVar("--accent") || "#c51b55", cssVar("--accent2") || "#7a3cff");

    await loadTrack(0, { autoplay: false });
    paintProgress(true);
  };

  init();
})();
