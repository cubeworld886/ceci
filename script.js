/* ===========================================
   MIDNIGHT PLAYER — Professional script.js
   - 4 tracks playlist
   - Cover + backdrop crossfade
   - Palette sync (extract from cover; fallback safe)
   - WebAudio visualizer (real) + elegant fallback
   - Seek drag w/ pointer capture + keyboard controls
   - Micro-interactions: UI "alive" states
   =========================================== */

(() => {
  "use strict";

  /* ---------- DOM helpers ---------- */
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

  /* ---------- Required DOM (matches your HTML) ---------- */
  const audio = $("#audio");                     // :contentReference[oaicite:3]{index=3}
  const coverWrap = $("#coverWrap");             // :contentReference[oaicite:4]{index=4}
  const coverImg = $("#coverImg");               // :contentReference[oaicite:5]{index=5}

  const trackTitle = $("#trackTitle");           // :contentReference[oaicite:6]{index=6}
  const trackArtist = $("#trackArtist");         // :contentReference[oaicite:7]{index=7}
  const chipIndex = $("#chipIndex");             // :contentReference[oaicite:8]{index=8}
  const chipState = $("#chipState");             // :contentReference[oaicite:9]{index=9}
  const chipMode = $("#chipMode");               // :contentReference[oaicite:10]{index=10}

  const timeNow = $("#timeNow");                 // :contentReference[oaicite:11]{index=11}
  const timeTotal = $("#timeTotal");             // :contentReference[oaicite:12]{index=12}

  const seek = $("#seek");                       // :contentReference[oaicite:13]{index=13}
  const seekFill = $("#seekFill");               // :contentReference[oaicite:14]{index=14}
  const seekKnob = $("#seekKnob");               // :contentReference[oaicite:15]{index=15}

  const btnPrev = $("#btnPrev");                 // :contentReference[oaicite:16]{index=16}
  const btnPlay = $("#btnPlay");                 // :contentReference[oaicite:17]{index=17}
  const btnNext = $("#btnNext");                 // :contentReference[oaicite:18]{index=18}
  const playIcon = $("#playIcon");               // :contentReference[oaicite:19]{index=19}
  const pauseIcon = $("#pauseIcon");             // :contentReference[oaicite:20]{index=20}

  const vol = $("#vol");                         // :contentReference[oaicite:21]{index=21}

  const trackListEl = $("#trackList");           // :contentReference[oaicite:22]{index=22}
  const footStatus = $("#footStatus");           // :contentReference[oaicite:23]{index=23}

  const btnThemePulse = $("#btnThemePulse");     // :contentReference[oaicite:24]{index=24}

  const barsHost = $("#bars");                   // :contentReference[oaicite:25]{index=25}
  const backdropA = $(".backdrop__img--a");      // :contentReference[oaicite:26]{index=26}
  const backdropB = $(".backdrop__img--b");      // :contentReference[oaicite:27]{index=27}

  /* ---------- Tracks (EDIT THESE PATHS) ---------- */
  // Pon aquí tus 4 canciones y 4 imágenes.
  // Recomendación: usa rutas relativas desde index.html
  const TRACKS = [
    { title: "Me Haces Feliz",   artist: "Serbia", src: "track1.mp3", cover: "cover1.jpeg" },
    { title: "Campo de Fuerza",   artist: "Zoé", src: "track2.mp3", cover: "cover2.jpeg" },
    { title: "No Te Des Por Vencida", artist: "Serbia", src: "track3.mp3", cover: "cover3.jpeg" },
    { title: "Francés Limón",  artist: "Enanitos Verdes", src: "track4.mp3", cover: "cover4.jpeg" },
  ];

  /* ---------- Theme vars ---------- */
  const root = document.documentElement;
  const cssVar = (k) => getComputedStyle(root).getPropertyValue(k).trim();
  const setVar = (k, v) => root.style.setProperty(k, v);

  /* ---------- Color utils (small + fast) ---------- */
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
    `#${[r, g, b].map((n) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, "0")).join("")}`;

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

  // “Goth polish”: deeper + slightly more saturated
  const gothify = (hex, satBoost = 0.18, lightShift = -0.12) => {
    const rgb = hexToRgb(hex);
    if (!rgb) return hex;
    let [h, s, l] = rgbToHsl(rgb.r, rgb.g, rgb.b);
    s = clamp01(s + satBoost);
    l = clamp01(l + lightShift);
    const [rr, gg, bb] = hslToRgb(h, s, l);
    return rgbToHex(rr, gg, bb);
  };

  /* ---------- Palette extraction (fast quantize) ---------- */
  const extractPalette = async (url) => {
    // If cover hosted without CORS, canvas read may fail -> fallback gracefully
    try {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.decoding = "async";

      await new Promise((res, rej) => {
        img.onload = res;
        img.onerror = rej;
        img.src = url;
      });

      const c = document.createElement("canvas");
      const ctx = c.getContext("2d", { willReadFrequently: true });

      const W = 96, H = 96;
      c.width = W; c.height = H;
      ctx.drawImage(img, 0, 0, W, H);

      const data = ctx.getImageData(0, 0, W, H).data;

      const buckets = new Map();
      const minLum = 18, maxLum = 235;

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
        if (a < 200) continue;

        const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        if (lum < minLum || lum > maxLum) continue;

        const qr = (r >> 4) << 4;
        const qg = (g >> 4) << 4;
        const qb = (b >> 4) << 4;
        const key = (qr << 16) | (qg << 8) | qb;

        const v = buckets.get(key);
        if (v) v.count++;
        else buckets.set(key, { r: qr, g: qg, b: qb, count: 1 });
      }

      if (!buckets.size) return null;

      const sorted = Array.from(buckets.values()).sort((a, b) => b.count - a.count);

      const pick = [];
      for (const c of sorted) {
        if (!pick.length) pick.push(c);
        else {
          const [h1] = rgbToHsl(pick[0].r, pick[0].g, pick[0].b);
          const [h2] = rgbToHsl(c.r, c.g, c.b);
          const dh = Math.min(Math.abs(h1 - h2), 1 - Math.abs(h1 - h2));
          if (dh > 0.08) { pick.push(c); break; }
        }
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

      return { a1, a2 };
    } catch {
      return null;
    }
  };

  const applyTheme = (accent, accent2) => {
    if (accent) setVar("--accent", accent);
    if (accent2) setVar("--accent2", accent2);

    // Optional: steer bg1 based on accent hue (subtle, keeps it "synced")
    const rgb = hexToRgb(accent || cssVar("--accent") || "#c51b55");
    if (rgb) {
      let [h, s] = rgbToHsl(rgb.r, rgb.g, rgb.b);
      s = clamp01(s * 0.55);
      const [rr, gg, bb] = hslToRgb(h, s, 0.10);
      setVar("--bg1", rgbToHex(rr, gg, bb));
    }
  };

  /* ---------- Backdrop crossfade (uses .is-on in your CSS) ---------- */
  let backdropFlip = false;
  const setBackdrop = (url) => {
    const on = backdropFlip ? backdropA : backdropB;
    const off = backdropFlip ? backdropB : backdropA;
    backdropFlip = !backdropFlip;

    on.style.backgroundImage = `url("${url}")`;
    on.classList.add("is-on");     // :contentReference[oaicite:28]{index=28}
    off.classList.remove("is-on");
  };

  /* ---------- Visualizer (WebAudio) ---------- */
  let audioCtx = null, analyser = null, srcNode = null, freq = null;
  let vizRAF = 0, fallbackRAF = 0;
  let vizRunning = false;

  const ensureAudioGraph = async () => {
    if (audioCtx && analyser && srcNode) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.82;

    srcNode = audioCtx.createMediaElementSource(audio);
    srcNode.connect(analyser);
    analyser.connect(audioCtx.destination);

    freq = new Uint8Array(analyser.frequencyBinCount);

    // Build bars only once
    if (!barsHost.childElementCount) {
      const N = 28;
      for (let i = 0; i < N; i++) {
        const bar = document.createElement("div");
        bar.className = "bar"; // styled in your CSS :contentReference[oaicite:29]{index=29}
        bar.style.height = `${12 + (i % 5)}px`;
        barsHost.appendChild(bar);
      }
    }
  };

  const stopViz = () => {
    vizRunning = false;
    cancelAnimationFrame(vizRAF);
    cancelAnimationFrame(fallbackRAF);

    // settle to a nice idle pose
    const bars = $$(".bar", barsHost);
    bars.forEach((b, i) => (b.style.height = `${12 + (i % 5)}px`));
  };

  const tickViz = () => {
    if (!vizRunning || !analyser) return;
    analyser.getByteFrequencyData(freq);

    const bars = $$(".bar", barsHost);
    const n = Math.min(bars.length, freq.length);

    // Use mid band for "rock energy"
    for (let i = 0; i < n; i++) {
      const v = freq[i] / 255;             // 0..1
      const shaped = Math.pow(v, 0.85);    // punchier
      const h = 10 + shaped * 58;
      bars[i].style.height = `${h.toFixed(1)}px`;
    }

    vizRAF = requestAnimationFrame(tickViz);
  };

  const tickFallback = () => {
    if (!vizRunning) return;
    const bars = $$(".bar", barsHost);
    const t = performance.now() * 0.002;

    bars.forEach((b, i) => {
      const wave = (Math.sin(t + i * 0.45) * 0.5 + 0.5);
      const jitter = (Math.sin(t * 1.7 + i) * 0.12);
      const h = 12 + (wave + jitter) * 52;
      b.style.height = `${h.toFixed(1)}px`;
    });

    fallbackRAF = requestAnimationFrame(tickFallback);
  };

  const startViz = () => {
    if (vizRunning) return;
    vizRunning = true;

    if (analyser && freq) tickViz();
    else tickFallback();
  };

  /* ---------- Player state ---------- */
  const state = {
    i: 0,
    seeking: false,
    wasPlayingBeforeSeek: false,
    progressRAF: 0,
    lastProgressPaint: 0,
  };

  const setChipState = (s) => (chipState.textContent = s);
  const setFoot = (s) => (footStatus.textContent = s);

  const setPlayIcons = (playing) => {
    playIcon.classList.toggle("hidden", playing);   // hidden class exists :contentReference[oaicite:30]{index=30}
    pauseIcon.classList.toggle("hidden", !playing);
  };

  const setSeekUI = (pct) => {
    const p = clamp01(pct);
    seekFill.style.width = `${(p * 100).toFixed(3)}%`;
    seekKnob.style.left = `${(p * 100).toFixed(3)}%`;
  };

  const markActiveTrack = () => {
    $$(".track", trackListEl).forEach((row) => {
      const isActive = Number(row.dataset.index) === state.i;
      row.classList.toggle("is-active", isActive);

      const pill = $(".track__pill", row);
      if (!pill) return;
      if (!isActive) pill.textContent = "PLAY";
      else pill.textContent = audio.paused ? "READY" : "LIVE";
    });
  };

  /* ---------- Playlist rendering ---------- */
  const renderPlaylist = () => {
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

      row.addEventListener("click", () => {
        if (state.i !== i) loadTrack(i, { autoplay: true });
        else togglePlay();
      });

      trackListEl.appendChild(row);
    });

    markActiveTrack();
  };

  /* ---------- Transitions (cover swap uses your CSS animation) ---------- */
  const animateCoverSwap = () => {
    coverWrap.classList.add("is-swap"); // triggers coverSwap keyframes :contentReference[oaicite:31]{index=31}
    window.setTimeout(() => coverWrap.classList.remove("is-swap"), 560);
  };

  /* ---------- Track loading ---------- */
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
      const on = () => {
        audio.removeEventListener("loadedmetadata", on);
        res();
      };
      audio.addEventListener("loadedmetadata", on, { once: true });
    });

  const loadTrack = async (index, { autoplay = false } = {}) => {
    state.i = (index + TRACKS.length) % TRACKS.length;
    const t = TRACKS[state.i];

    chipIndex.textContent = `${pad2(state.i + 1)}/${pad2(TRACKS.length)}`;
    setChipState("LOADING");
    setFoot("Loading");
    chipMode.textContent = "HI-FI";

    trackTitle.textContent = t.title;
    trackArtist.textContent = t.artist;

    // preload cover for clean transitions
    await preloadImage(t.cover);

    animateCoverSwap();
    coverImg.src = t.cover;
    setBackdrop(t.cover);

    // theme palette sync
    const pal = await extractPalette(t.cover);
    if (pal) applyTheme(pal.a1, pal.a2);

    // audio
    const resumeAfter = !audio.paused;
    audio.src = t.src;
    audio.load();

    await waitMeta();

    timeTotal.textContent = fmtTime(audio.duration);
    timeNow.textContent = fmtTime(0);
    setSeekUI(0);

    setChipState("READY");
    setFoot("Ready");
    markActiveTrack();

    if (autoplay || resumeAfter) await safePlay();
  };

  /* ---------- Play/pause (safe with autoplay restrictions) ---------- */
  const safePlay = async () => {
    try {
      await ensureAudioGraph();
      if (audioCtx && audioCtx.state === "suspended") await audioCtx.resume();
      await audio.play();
    } catch {
      // Browser needs user gesture
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

  const syncPlayState = () => {
    const playing = !audio.paused && !audio.ended;
    setPlayIcons(playing);
    setChipState(playing ? "PLAYING" : "PAUSED");
    setFoot(playing ? "Live" : "Ready");
    markActiveTrack();

    if (playing) startViz();
    else stopViz();
  };

  /* ---------- Progress (smooth + throttled paint) ---------- */
  const stopProgressRAF = () => cancelAnimationFrame(state.progressRAF);

  const tickProgress = () => {
    if (!state.seeking) {
      const now = performance.now();
      // paint at ~30fps for smoothness without waste
      if (now - state.lastProgressPaint > 33) {
        state.lastProgressPaint = now;

        if (Number.isFinite(audio.duration) && audio.duration > 0) {
          const pct = audio.currentTime / audio.duration;
          setSeekUI(pct);
          timeNow.textContent = fmtTime(audio.currentTime);
        } else {
          setSeekUI(0);
          timeNow.textContent = "0:00";
        }
      }
    }
    state.progressRAF = requestAnimationFrame(tickProgress);
  };

  /* ---------- Seek (pointer capture for premium feel) ---------- */
  const clientXToPct = (x) => {
    const r = seek.getBoundingClientRect();
    if (r.width <= 0) return 0;
    return clamp01((x - r.left) / r.width);
  };

  const seekToPct = (pct) => {
    if (!Number.isFinite(audio.duration) || audio.duration <= 0) return;
    audio.currentTime = pct * audio.duration;
    setSeekUI(pct);
    timeNow.textContent = fmtTime(audio.currentTime);
  };

  const bindSeek = () => {
    const onDown = (e) => {
      state.seeking = true;
      state.wasPlayingBeforeSeek = !audio.paused;

      // pause for stable UX while dragging
      audio.pause();

      seek.setPointerCapture?.(e.pointerId);
      seekToPct(clientXToPct(e.clientX));
      syncPlayState();
    };

    const onMove = (e) => {
      if (!state.seeking) return;
      seekToPct(clientXToPct(e.clientX));
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
  };

  /* ---------- Volume ---------- */
  const bindVolume = () => {
    audio.volume = Number(vol.value);
    vol.addEventListener("input", () => {
      audio.volume = Number(vol.value);
    });
  };

  /* ---------- Keyboard ---------- */
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

  /* ---------- Cover tilt (already styled for transform) ---------- */
  const bindCoverTilt = () => {
    const max = 7; // degrees
    const ease = (t) => 1 - Math.pow(1 - t, 3);

    const onMove = (e) => {
      const r = coverWrap.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;

      const dx = clamp((e.clientX - cx) / (r.width / 2), -1, 1);
      const dy = clamp((e.clientY - cy) / (r.height / 2), -1, 1);

      const rx = -max * ease(Math.abs(dy)) * Math.sign(dy);
      const ry =  max * ease(Math.abs(dx)) * Math.sign(dx);

      coverWrap.style.transform = `perspective(900px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg)`;
    };

    const reset = () => {
      coverWrap.style.transform = "perspective(900px) rotateX(0deg) rotateY(0deg)";
    };

    coverWrap.addEventListener("pointermove", onMove);
    coverWrap.addEventListener("pointerleave", reset);
    coverWrap.addEventListener("blur", reset);
  };

  /* ---------- Theme pulse (micro “alive” burst) ---------- */
  const bindPulse = () => {
    btnThemePulse.addEventListener("click", () => {
      root.animate(
        [
          { filter: "brightness(1) saturate(1)" },
          { filter: "brightness(1.08) saturate(1.25)" },
          { filter: "brightness(1) saturate(1)" },
        ],
        { duration: 420, easing: "cubic-bezier(.2,.9,.12,1)" }
      );

      // tiny accent nudge
      const a = cssVar("--accent") || "#c51b55";
      const b = cssVar("--accent2") || "#7a3cff";
      applyTheme(gothify(a, 0.06, -0.02), gothify(b, 0.04, -0.02));

      setFoot("Pulse");
      window.setTimeout(() => setFoot((!audio.paused && !audio.ended) ? "Live" : "Ready"), 520);
    });
  };

  /* ---------- Button bindings ---------- */
  const bindControls = () => {
    btnPlay.addEventListener("click", togglePlay);
    btnPrev.addEventListener("click", prev);
    btnNext.addEventListener("click", next);

    // ensure audio graph created on first user gesture (autoplay policies)
    const prime = async () => {
      try {
        await ensureAudioGraph();
        if (audioCtx && audioCtx.state === "suspended") await audioCtx.resume();
      } catch {}
      window.removeEventListener("pointerdown", prime, true);
      window.removeEventListener("keydown", prime, true);
    };
    window.addEventListener("pointerdown", prime, true);
    window.addEventListener("keydown", prime, true);
  };

  /* ---------- Audio events ---------- */
  const bindAudioEvents = () => {
    audio.addEventListener("play", syncPlayState);
    audio.addEventListener("pause", syncPlayState);
    audio.addEventListener("ended", () => {
      setChipState("ENDED");
      setFoot("Ended");
      markActiveTrack();
      // tasteful auto-next
      window.setTimeout(() => loadTrack(state.i + 1, { autoplay: true }), 380);
    });

    audio.addEventListener("loadedmetadata", () => {
      timeTotal.textContent = fmtTime(audio.duration);
    });

    audio.addEventListener("error", () => {
      setChipState("ERROR");
      setFoot("Audio error");
      syncPlayState();
    });
  };

  /* ---------- Init ---------- */
  const init = async () => {
    // basic
    renderPlaylist();
    bindControls();
    bindSeek();
    bindVolume();
    bindKeyboard();
    bindCoverTilt();
    bindPulse();
    bindAudioEvents();

    // build bars for idle presence even before play
    if (!barsHost.childElementCount) {
      const N = 28;
      for (let i = 0; i < N; i++) {
        const bar = document.createElement("div");
        bar.className = "bar";
        bar.style.height = `${12 + (i % 5)}px`;
        barsHost.appendChild(bar);
      }
    }

    // idle fallback motion (subtle, not noisy)
    vizRunning = true;
    tickFallback();
    window.setTimeout(() => { vizRunning = false; stopViz(); }, 900);

    // initial track
    chipIndex.textContent = `01/${pad2(TRACKS.length)}`;
    setChipState("STOPPED");
    chipMode.textContent = "HI-FI";
    timeNow.textContent = "0:00";
    timeTotal.textContent = "0:00";
    setSeekUI(0);

    await loadTrack(0, { autoplay: false });

    // start continuous progress paint
    stopProgressRAF();
    state.lastProgressPaint = 0;
    tickProgress();
  };

  init();
})();
