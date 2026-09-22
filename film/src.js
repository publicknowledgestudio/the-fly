const MAN = /*MANIFEST*/null;
(() => {
  // The whole film is a scroll timeline: scroll position (in viewport heights) is the story clock.
  // Every frame, render() derives the scene from the smoothed scroll position; live things
  // (the fly, the hunting hand, eyes, parallax, swats, sound) run on top of it.
  const W = 2048, H = 1152, FPS = 8;
  const $ = (id) => document.getElementById(id);
  const stage = $("stage"), cam = $("cam"), world = $("world"), views = $("views"), flat = $("flat"), screen = $("screen");
  const WS = 1.05; // #world overscan
  const ws = (p) => ({ x: W / 2 + (p.x - W / 2) * WS, y: H / 2 + (p.y - H / 2) * WS });     // world → viewer
  const wsInv = (p) => ({ x: W / 2 + (p.x - W / 2) / WS, y: H / 2 + (p.y - H / 2) / WS });  // viewer → world
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const pct = (v) => (v * 100).toFixed(4) + "%";
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const win = (u, a, b) => u >= a && u < b;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let SW = stage.clientWidth, S = SW / W;
  stage.classList.add("textured");

  // ================================================================== layered views
  const V = {};
  for (const [key, setup] of Object.entries(MAN.setups)) {
    const view = document.createElement("div"); view.className = "view"; view.dataset.setup = key;
    const layers = setup.layers.map((L) => {
      const el = document.createElement("div"); el.className = "layer";
      const pal = document.createElement("div"); pal.className = "pal"; el.append(pal);
      const imgs = {};
      for (const p of setup.pages) {
        const img = new Image(); img.src = `a/${key}-${L.id}-${p}.webp`; img.alt = ""; img.decoding = "async";
        Object.assign(img.style, { left: pct(L.x / W), top: pct(L.y / H), width: pct(L.w / W), opacity: p === setup.pages[0] ? 1 : 0 });
        pal.append(img); imgs[p] = img;
      }
      view.append(el);
      return { ...L, el, imgs };
    });
    const pupils = (setup.pupils || []).map((p) => {
      const host = layers.find((l) => l.id === (p.layer || "person"));
      const d = document.createElement("div"); d.className = "pupil";
      Object.assign(d.style, { left: pct((p.x - p.r) / W), top: pct((p.y - p.r) / H), width: pct((2 * p.r) / W) });
      host.el.append(d);
      return { ...p, el: d, ox: 0, oy: 0 };
    });
    views.append(view);
    V[key] = { key, view, layers, pupils, anchors: setup.anchors, pages: setup.pages };
  }

  // ================================================================== the hunting hand (laptop shot) — sprites
  const HAND = MAN.extras.hand, handEl = $("hand"), handImgs = {};
  for (const pose of ["hover", "slap"]) {
    const R = HAND[pose], box = document.createElement("div"); box.className = "pose"; box.dataset.pose = pose;
    const set = { p2: [], arm: [] };
    for (const page of ["p1", "p2"]) {
      const arm = new Image(); arm.src = `a/hand-${pose}-arm-${page}.webp`; arm.alt = "";
      Object.assign(arm.style, { left: `${R.arm.x - R.palm[0]}px`, top: `${R.wrist - R.palm[1]}px`, width: `${R.arm.w}px` });
      const top = new Image(); top.src = `a/hand-${pose}-top-${page}.webp`; top.alt = "";
      Object.assign(top.style, { left: `${-R.palm[0]}px`, top: `${-R.palm[1]}px`, width: `${R.w}px` });
      if (page === "p2") { arm.style.opacity = top.style.opacity = "0"; set.p2.push(arm, top); }
      set.arm.push(arm); box.append(arm, top);
    }
    handEl.append(box); handImgs[pose] = set;
  }

  let heatKey = "", heatVal = 0;
  function setHeat(heat, p3 = 0) {
    const k = `${heat.toFixed(3)}|${p3}`; if (k === heatKey) return; heatKey = k; heatVal = heat;
    for (const v of Object.values(V)) {
      const w = { p1: 1 - heat, p2: heat, p3 };
      if (!v.pages.includes("p2")) { w.p1 += w.p2; w.p2 = 0; }
      const base = v.pages[0];
      for (const l of v.layers) for (const [p, img] of Object.entries(l.imgs)) img.style.opacity = String(p === base ? 1 : clamp(w[p] ?? 0, 0, 1));
      for (const pu of v.pupils) pu.el.style.backgroundColor = heat > 0.5 ? "#320D41" : "#2A1630";
    }
    for (const set of Object.values(handImgs)) set.p2.forEach((i) => (i.style.opacity = String(heat)));
  }

  // ================================================================== what is on screen (diffed)
  let current = null, shownFlat = null, shownSeq = null, wantFlat = null;
  const flatCache = {};
  const decodeFlat = (name) => { if (!flatCache[name]) { const i = new Image(); i.src = `a/${name}.webp`; flatCache[name] = i.decode().then(() => i, () => i); } return flatCache[name]; };
  function viewOn(key) {
    if (current === key && !shownFlat && !shownSeq) return;
    for (const v of Object.values(V)) v.view.classList.toggle("on", v.key === key);
    current = key; flat.classList.remove("on"); shownFlat = null; seqsOff();
    screen.classList.toggle("on", key === "C"); placeScreen();
  }
  function flatOn(name) {
    if (shownFlat === name) return;
    flat.src = `a/${name}.webp`; flat.classList.add("on"); shownFlat = name; seqsOff();
    for (const v of Object.values(V)) v.view.classList.remove("on"); current = null; screen.classList.remove("on");
  }
  function allOff() {
    if (!current && !shownFlat && !shownSeq) return;
    for (const v of Object.values(V)) v.view.classList.remove("on"); current = null;
    flat.classList.remove("on"); shownFlat = null; seqsOff(); screen.classList.remove("on");
  }

  // ================================================================== in-between frames, driven by scroll
  const vids = {};
  function vid(name) {
    if (vids[name]) return vids[name];
    const v = document.createElement("video"); v.className = "seqv"; v.muted = true; v.playsInline = true; v.preload = "auto"; v.src = `a/seq-${name}.mp4`;
    world.insertBefore(v, screen);
    const s = (vids[name] = { name, v, ready: false, want: 0, shown: -1, busy: false, onShown: null, n: (MAN.seqs || {})[name] || 1 });
    v.addEventListener("loadeddata", () => { s.ready = true; pump(s); }, { once: true });
    return s;
  }
  const seek = (v, t) => new Promise((r) => { const to = setTimeout(r, 350); v.addEventListener("seeked", () => { clearTimeout(to); r(); }, { once: true }); v.currentTime = t; });
  async function pump(s) {
    if (s.busy || !s.ready) return;
    s.busy = true;
    while (s.want !== s.shown) { const f = s.want; await seek(s.v, (f + 0.5) / FPS); s.shown = f; s.onShown && s.onShown(s); }
    s.busy = false;
  }
  function seqsOff() { for (const s of Object.values(vids)) s.v.classList.remove("on"); shownSeq = null; }
  // frame `frac` (0..1 of from..to) of sequence `name` — in the DOM, or as the eye's texture
  function seqAt(name, frac, { from = 0, to = 1, target = "dom" } = {}) {
    const s = vid(name), lo = Math.floor(from * (s.n - 1)), hi = Math.ceil(to * (s.n - 1));
    s.want = Math.round(lerp(lo, hi, clamp(frac, 0, 1)));
    if (target === "dom") {
      if (shownSeq !== name) {
        for (const v of Object.values(V)) v.view.classList.remove("on"); current = null; screen.classList.remove("on");
        seqsOff(); shownSeq = name; flat.classList.remove("on"); shownFlat = null;
      }
      s.onShown = (x) => { if (shownSeq === x.name) x.v.classList.add("on"); };
      if (s.shown >= 0) s.v.classList.add("on");
    } else s.onShown = (x) => { if (eyeSrc === x) eye.source(x.v, true); };
    pump(s);
  }

  // ================================================================== the live screen (laptop shot)
  const SR = MAN.extras.screenRect, screenShift = { x: 0, y: 0 };
  Object.assign(screen.style, { width: SR.w + "px", height: SR.h + "px" });
  function placeScreen() {
    const q = V.C.anchors.screen, s = (p) => [p[0] * S, p[1] * S];
    const [x0, y0] = s(q.tl), [x1, y1] = s(q.tr), [x2, y2] = s(q.br), [x3, y3] = s(q.bl);
    const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3, dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
    const den = dx1 * dy2 - dx2 * dy1, a13 = (dx3 * dy2 - dx2 * dy3) / den, a23 = (dx1 * dy3 - dx3 * dy1) / den;
    const a11 = x1 - x0 + a13 * x1, a21 = x3 - x0 + a23 * x3, a12 = y1 - y0 + a13 * y1, a22 = y3 - y0 + a23 * y3;
    screen.style.transform = `translate(${screenShift.x}px, ${screenShift.y}px) matrix3d(${a11 / SR.w},${a12 / SR.w},0,${a13 / SR.w},${a21 / SR.h},${a22 / SR.h},0,${a23 / SR.h},0,0,1,0,${x0},${y0},0,1)`;
  }
  const ESSAY = "Most afternoons ask nothing of us but attention. The light moves across the wall at its own pace; the coffee cools; the sentence you are writing waits patiently for its verb. I have come to believe that a well-kept desk is not about order at all, but about permission — permission to stay with one thing until it is finished. Interruptions are not the enemy. They are simply the world, reminding us that it is also here, and also busy, and not especially interested in our plans.";
  const DREAMWORDS = ["fly", "ceiling", "stairs", "water", "again", "hallway", "moon", "your", "teeth", "falling", "exam", "window", "still", "buzzing", "nobody", "hexagon", "late", "kitchen"];
  const TITLES = ["On Keeping Still", "On Keeping Awake", "On Being Kept", "On Keeping Flies", "On Kept Stillness"];
  const essay = ESSAY.split(" ");
  let typedN = 180, typing = false, words = 2431, dreamTick = 0, dreamNow = 0.3;
  setInterval(() => {
    if (!typing) return;
    const text = essay.join(" ");
    typedN = typedN >= text.length ? 160 : typedN + 1;
    $("typed").textContent = text.slice(0, typedN);
    if (text[typedN] === " ") $("words").textContent = (++words).toLocaleString("en-GB") + " words";
    if (++dreamTick % Math.round(40 - 22 * dreamNow) === 0) {           // it never reads the same twice
      for (let i = 0; i < 1 + Math.round(dreamNow * 3); i++) essay[Math.floor(Math.random() * essay.length)] = DREAMWORDS[Math.floor(Math.random() * DREAMWORDS.length)];
      if (Math.random() < 0.35) document.querySelector(".doc .page h1").textContent = TITLES[Math.floor(Math.random() * TITLES.length)];
      if (Math.random() < 0.3) words = Math.round(words * (0.6 + Math.random() * 0.8));
    }
  }, 70);
  $("typed").textContent = ESSAY.slice(0, typedN);

  // ================================================================== fly vision (WebGL compound eye)
  let eyeSrc = null;
  const eye = (() => {
    const cv = $("eye");
    const gl = cv.getContext("webgl", { antialias: false, premultipliedAlpha: false });
    const noop = { on() {}, off() {}, source() {}, draw() {}, amt: 0, active: false };
    if (!gl) return noop;
    const vs = `attribute vec2 p; varying vec2 vUv; void main(){ vUv = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }`;
    const fs = `precision highp float;
      uniform sampler2D uT0, uT1; uniform float uMix, uAmt, uTime; uniform vec2 uRes, uMouse; varying vec2 vUv;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float hexd(vec2 p){ p = abs(p); return max(dot(p, normalize(vec2(1.0, 1.7320508))), p.x); }
      vec3 samp(vec2 uv){ uv = abs(mod(uv + 1.0, 2.0) - 1.0); return mix(texture2D(uT0, uv).rgb, texture2D(uT1, uv).rgb, uMix); }
      void main(){
        float A = uAmt, asp = uRes.x / uRes.y;
        vec2 q = (vUv - 0.5) * vec2(asp, 1.0);
        q *= 1.0 + A * 0.45 * dot(q, q);                                   // lens bulge
        float cells = mix(0.3, 3.2, A * A);                                // ~20 facets; many tiny ones while dazed
        vec2 P = q * cells, r = vec2(1.0, 1.7320508), h = r * 0.5;
        vec2 a = mod(P, r) - h, b = mod(P - h, r) - h;
        vec2 gv = dot(a, a) < dot(b, b) ? a : b, id = P - gv;
        vec2 c = id / cells, l = gv / cells;
        float hs = hash(id);
        float ang = A * (0.35 * sin(uTime * 0.7 + hs * 6.283) + 0.25 * (hs - 0.5));
        l = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * l;
        float an = atan(l.y, l.x), rr = length(l), seg = 1.0471976;
        float af = abs(mod(an, seg) - seg * 0.5);
        l = mix(l, rr * vec2(cos(af), sin(af)), A * (0.12 + 0.6 * step(0.74, hs)));   // some facets fold into kaleidoscopes
        vec2 s = c * mix(1.0, 0.5, A) + l * mix(1.0, 1.9, A) + uMouse * 0.14 * A + (vec2(hs, fract(hs * 7.31)) - 0.5) * 0.05 * A;
        vec2 uv = s / vec2(asp, 1.0) + 0.5;
        vec2 ca = normalize(l + 1e-5) * 0.005 * A;
        vec3 col = vec3(samp(uv + ca).r, samp(uv).g, samp(uv - ca).b);
        float d = hexd(gv);
        col *= 1.0 - 0.16 * A * hs;
        col *= 1.0 - 0.38 * A * smoothstep(0.28, 0.5, d);
        col = mix(col, vec3(0.165, 0.086, 0.188), smoothstep(0.5 - 0.07 * A, 0.5, d) * A * 0.9);
        col *= 1.0 - 0.4 * A * smoothstep(0.35, 0.95, length(vUv - 0.5) * 1.6);
        col = floor(col * 10.0 + 0.5 + (hash(gl_FragCoord.xy + fract(uTime) * 97.0) - 0.5) * 0.9) / 10.0;
        gl_FragColor = vec4(col, 1.0);
      }`;
    const sh = (type, src) => { const o = gl.createShader(type); gl.shaderSource(o, src); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(o)); return o; };
    const prog = gl.createProgram(); gl.attachShader(prog, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { console.error(gl.getProgramInfoLog(prog)); return noop; }
    gl.useProgram(prog);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p"); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const U = (n) => gl.getUniformLocation(prog, n);
    const u = { t0: U("uT0"), t1: U("uT1"), mix: U("uMix"), amt: U("uAmt"), time: U("uTime"), res: U("uRes"), mouse: U("uMouse") };
    const tex = [gl.createTexture(), gl.createTexture()];
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    for (const t of tex) { gl.bindTexture(gl.TEXTURE_2D, t); for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, 1, 1, 0, gl.RGB, gl.UNSIGNED_BYTE, new Uint8Array([20, 10, 23])); }
    const upload = (i, el) => { gl.bindTexture(gl.TEXTURE_2D, tex[i]); try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, el); } catch (e) { console.error(e); } };
    let src = [null, null], mix = 0, fading = false;
    const E = {
      amt: 1, active: false,
      on() { if (!E.active) { E.active = true; cv.classList.add("on"); } },
      off() { if (E.active) { E.active = false; cv.classList.remove("on"); } },
      source(el, live = false) {
        if (src[0] === el) { if (live) upload(0, el); return; }
        if (src[1] === el) { if (live) upload(1, el); return; }
        if (!src[0]) { src[0] = el; upload(0, el); return; }
        src[1] = el; upload(1, el); mix = 0; fading = true;
      },
      draw(t, mouse, dt) {
        if (!E.active) return;
        const dpr = Math.min(devicePixelRatio || 1, 1.5), w = Math.round(cv.clientWidth * dpr), h = Math.round(cv.clientHeight * dpr);
        if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
        if (fading) { mix = Math.min(1, mix + dt * 4); if (mix >= 1) { src[0] = src[1]; tex.reverse(); src[1] = null; mix = 0; fading = false; } }
        gl.viewport(0, 0, w, h);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex[0]); gl.uniform1i(u.t0, 0);
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, tex[1]); gl.uniform1i(u.t1, 1);
        gl.uniform1f(u.mix, mix); gl.uniform1f(u.amt, E.amt); gl.uniform1f(u.time, t); gl.uniform2f(u.res, w, h); gl.uniform2f(u.mouse, mouse.x, mouse.y);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      },
    };
    return E;
  })();
  async function eyeImage(name) { const img = await decodeFlat(name); if (eyeSrc === name) eye.source(img); }

  // ================================================================== sound (through a dream bus)
  const sfx = {}, G = {};
  let actx = null, buzzGain = null, buzzPan = null, lp = null, wetG = null, dryG = null;
  const NAMES = ["buzz-loop", "room-loop", "typing-loop", "dream-pad", "swish", "thwack", "key-dead", "boot", "error", "swell"];
  function impulse(ctx, secs = 3.2) {
    const n = Math.floor(ctx.sampleRate * secs), b = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.6); }
    return b;
  }
  function initAudio() {
    for (const n of NAMES) { const a = new Audio(`a/${n}.mp3`); a.preload = "auto"; a.loop = n.endsWith("-loop") || n === "dream-pad"; a.preservesPitch = false; sfx[n] = a; }
    try {
      actx = new (window.AudioContext || window.webkitAudioContext)();
      const bus = actx.createGain(); lp = actx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 16000;
      dryG = actx.createGain(); wetG = actx.createGain(); wetG.gain.value = 0.2;
      const conv = actx.createConvolver(); conv.buffer = impulse(actx);
      bus.connect(dryG).connect(lp); bus.connect(conv).connect(wetG).connect(lp); lp.connect(actx.destination);
      for (const n of NAMES) {
        const src = actx.createMediaElementSource(sfx[n]), g = (G[n] = actx.createGain());
        g.gain.value = 0; src.connect(g);
        if (n === "buzz-loop") { buzzGain = g; buzzPan = actx.createStereoPanner ? actx.createStereoPanner() : null; (buzzPan ? g.connect(buzzPan) : g).connect(bus); }
        else g.connect(bus);
      }
    } catch (e) { actx = null; }
    for (const n of ["buzz-loop", "room-loop", "typing-loop", "dream-pad"]) sfx[n].play().catch(() => {});
    dreamAudio(dreamNow);
  }
  const setGain = (n, v) => { v = clamp(v, 0, 1.2); if (G[n] && actx) G[n].gain.setTargetAtTime(v, actx.currentTime, 0.08); else if (sfx[n]) sfx[n].volume = clamp(v, 0, 1); };
  const once = (n, v = 1, rate = 1) => { const a = sfx[n]; if (!a) return; try { a.currentTime = 0; a.playbackRate = rate * dreamRate; if (G[n] && actx) G[n].gain.value = v; else a.volume = clamp(v, 0, 1); a.play().catch(() => {}); } catch (e) {} };
  const vol = setGain;
  let burstUntil = 0, buzzHold = 0, dreamRate = 1;
  const buzzBurst = (ms) => { burstUntil = performance.now() + ms; };
  function dreamAudio(d) {  // d: 0 = awake … 1 = deep dream
    if (!actx) return;
    const t = actx.currentTime;
    lp.frequency.setTargetAtTime(lerp(16000, 2300, Math.pow(d, 1.6)), t, 0.4);
    wetG.gain.setTargetAtTime(0.12 + 0.55 * d, t, 0.4); dryG.gain.setTargetAtTime(1 - 0.45 * d, t, 0.4);
    dreamRate = d > 0.9 ? 0.86 : 1;
    for (const n of ["room-loop", "typing-loop", "buzz-loop", "dream-pad"]) sfx[n].playbackRate = dreamRate;
    setGain("dream-pad", 0.05 + 0.5 * d * d);
  }

  // ================================================================== the fly (you)
  const flyEl = $("fly"), [wl, wr, bd] = flyEl.querySelectorAll("img"), RIG = MAN.extras.flyRig;
  const place = (img, p) => Object.assign(img.style, { left: pct(p.x / RIG.w), top: pct(p.y / RIG.h), width: pct(p.w / RIG.w) });
  place(wl, RIG.wingL); place(wr, RIG.wingR); place(bd, RIG.body);
  wl.style.transformOrigin = `${pct(RIG.wingL.pivot[0] / RIG.wingL.w)} ${pct(RIG.wingL.pivot[1] / RIG.wingL.h)}`;
  wr.style.transformOrigin = `${pct(RIG.wingR.pivot[0] / RIG.wingR.w)} ${pct(RIG.wingR.pivot[1] / RIG.wingR.h)}`;
  const fly = { x: W * 1.1, y: H * 0.2, vx: 0, vy: 0, tilt: 0, landed: false, stillSince: 0, stunned: 0 };
  const trail = [], ghosts = [0.3, 0.2, 0.13, 0.07].map((o) => { const g = flyEl.cloneNode(true); g.id = ""; g.classList.add("ghost"); g.dataset.o = o; stage.insertBefore(g, flyEl); return g; });
  const shadows = {};
  for (const [key, v] of Object.entries(V)) { const sh = new Image(); sh.src = "a/fly-body.webp"; sh.className = "flyshadow"; sh.alt = ""; v.layers[0].el.append(sh); shadows[key] = sh; }
  let flyCtl = { mode: "hidden" };  // set by the timeline: free | goal | hidden | exit
  let pointer = null, lastMove = 0;
  const toCanvas = (e) => { const r = stage.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H }; };
  addEventListener("pointermove", (e) => { pointer = toCanvas(e); lastMove = performance.now(); });
  stage.addEventListener("pointerleave", () => { pointer = null; });
  function dodge(fromX, fromY, power = 1) {
    const dx = fly.x - fromX, dy = fly.y - fromY, m = Math.hypot(dx, dy) || 1;
    fly.vx += (dx / m) * 95 * power; fly.vy += (dy / m) * 65 * power - 30;
    fly.stunned = performance.now() + 500; fly.landed = false;
  }

  // ================================================================== the hunting hand — behaviour
  // The hand stalks the fly. When the fly settles on something, it slaps the spot the fly was on.
  const ELBOW = { x: 1300, y: 1260 }, REST = { x: 1120, y: 880 };
  const hand = { active: false, x: REST.x, y: REST.y, k: 0.3, slap: null, cooldown: 0, final: null, slaps: 0, cool: 350 };
  function slapAt(spotViewer) {
    if (hand.slap || !hand.active || hand.final) return;
    const spot = wsInv(spotViewer);
    hand.slap = { t0: performance.now(), spot: { x: clamp(spot.x, 640, 1860), y: clamp(spot.y, 330, 1060) }, hit: false };
    once("swish", 0.7, 1.1);
  }
  function drawHand(now) {
    handEl.classList.toggle("on", hand.active);
    if (!hand.active) return;
    let k = 0.3 * (0.8 + 0.4 * (hand.y / H)), pose = "hover";
    if (hand.final) {                                          // scroll-driven wind-up over the fly on the screen
      const f = hand.final, s = wsInv(f.spot);
      hand.x = lerp(hand.x, s.x + 40, 0.25); hand.y = lerp(hand.y, s.y - 60 - 260 * f.u, 0.25);
      k *= 1 + 1.1 * f.u; pose = f.u > 0.85 ? "slap" : "hover";
    } else if (hand.slap) {                                     // wind up → strike → hold → recover
      const t = now - hand.slap.t0, sp = hand.slap.spot;
      if (t < 130) { hand.x = lerp(hand.x, sp.x + 30, 0.35); hand.y = lerp(hand.y, sp.y - 130, 0.35); k *= 1.18; }
      else if (t < 210) { hand.x = lerp(hand.x, sp.x, 0.6); hand.y = lerp(hand.y, sp.y, 0.6); pose = "slap"; }
      else if (t < 420) {
        hand.x = sp.x; hand.y = sp.y; pose = "slap"; k *= 0.96;
        if (!hand.slap.hit) {
          hand.slap.hit = true; hand.slaps++;
          once("thwack", 0.45, 1.35); stage.classList.remove("bump"); void stage.offsetWidth; stage.classList.add("bump");
          const gh = handEl.cloneNode(true); gh.id = ""; gh.className = "ghosthand"; world.append(gh);
          gh.animate([{ opacity: 0.4, filter: "blur(0px)" }, { opacity: 0, filter: "blur(6px)" }], { duration: 1600, easing: "ease-out" }).onfinish = () => gh.remove();
          const v = ws(sp); dodge(v.x, v.y + 40, 1.6);           // the fly was here a moment ago — it isn't now
        }
      } else if (t < 650) { hand.x = lerp(hand.x, REST.x, 0.08); hand.y = lerp(hand.y, REST.y, 0.08); }
      else { hand.slap = null; hand.cooldown = now + hand.cool; }
    } else {                                                    // stalk
      const f = wsInv(fly), far = flyCtl.mode === "hidden" || Math.hypot(f.x - hand.x, f.y - hand.y) > 900;
      const tx = far ? REST.x : clamp(f.x + 30, 640, 1860), ty = far ? REST.y : clamp(f.y + 90, 330, 1060);
      hand.x = lerp(hand.x, tx, 0.045); hand.y = lerp(hand.y, ty, 0.045);
      if (fly.landed && now - fly.stillSince > 260 && now > hand.cooldown) slapAt({ x: fly.x, y: fly.y });
    }
    hand.k = lerp(hand.k, k, 0.3);
    const R = HAND[pose], dx = ELBOW.x - hand.x, dy = ELBOW.y - hand.y, len = Math.hypot(dx, dy);
    const ang = Math.atan2(dy, dx) - Math.PI / 2;
    const armLen = Math.max(40, len / hand.k - (R.wrist - R.palm[1]) + 60);
    handImgs[pose].arm.forEach((a) => { a.style.height = `${armLen}px`; });
    for (const b of handEl.children) b.classList.toggle("on", b.dataset.pose === pose);
    handEl.style.transform = `translate(${hand.x * S}px, ${hand.y * S}px) rotate(${ang}rad) scale(${hand.k * S})`;
  }

  // ================================================================== fx
  function bzz(x, y, big = false) {
    const el = $("bzz");
    el.style.width = big ? "44%" : "24%";
    el.style.left = pct(clamp(x / W - (big ? 0.22 : 0.12), 0.01, big ? 0.55 : 0.75));
    el.style.top = pct(clamp(y / H - 0.12, 0.02, 0.8));
    el.animate([{ opacity: 0, transform: "scale(.8) rotate(-6deg)" }, { opacity: 1, transform: "scale(1) rotate(-2deg)", offset: 0.15 }, { opacity: 1, transform: "scale(1.02) rotate(1deg)", offset: 0.75 }, { opacity: 0, transform: "scale(1.05) rotate(3deg)" }], { duration: big ? 1200 : 900, easing: "steps(10)" });
  }
  const sayEl = $("say"); let sayKey = "";
  function caption(c) {
    const k = c ? [c[0], c[3]].join("|") : "";
    if (c && k === sayKey) { sayEl.style.top = pct(c[2] / H); return; }
    if (k === sayKey) return; sayKey = k;
    if (!c) { sayEl.classList.remove("on"); return; }
    const [text, x, y, style] = c;
    sayEl.textContent = text; sayEl.style.left = pct(x / W); sayEl.style.top = pct(y / H);
    sayEl.classList.toggle("light", style === true); sayEl.classList.toggle("soul", style === "soul"); sayEl.classList.add("on");
  }
  let againN = -1;
  function againTo(n) {
    if (n === againN) return; againN = n;
    const box = $("again"); box.replaceChildren();
    for (let i = 0; i < n; i++) { const s = document.createElement("span"); s.textContent = "Again."; box.append(s); }
  }

  // ================================================================== swats (clicks in the desk and close-up shots)
  let swatting = false;
  async function swat(name) {
    if (swatting) return; swatting = true;
    once("swish", 0.8);
    const s = vid(name), f = ws({ x: W / 2, y: H * 0.35 }); let dodged = false;
    const lo = Math.floor(0.35 * (s.n - 1)), hi = s.n - 1;
    for (const v of Object.values(V)) v.view.classList.remove("on"); seqsOff(); flat.classList.remove("on");
    for (const dir of [1, -1]) {
      for (let i = dir > 0 ? lo : hi; dir > 0 ? i <= hi : i >= lo; i += dir) {
        await seek(s.v, (i + 0.5) / FPS); s.v.classList.add("on");
        if (!dodged && dir > 0 && i >= lo + (hi - lo) * 0.6) { dodged = true; dodge(f.x, f.y + 120, 1.3); }
        await sleep(1000 / 34);
      }
    }
    s.v.classList.remove("on"); s.shown = -1;
    current = null; shownFlat = null; shownSeq = null;   // let the timeline redraw what belongs here
    swatting = false;
  }

  // ================================================================== the timeline
  const faceOf = (key) => { const f = V[key]?.anchors?.face; return ws(f ? { x: f.x + f.w / 2, y: f.y + f.h / 2 } : { x: W / 2, y: H / 3 }); };
  const scrC = () => { const q = V.C.anchors.screen; return ws({ x: (q.tl[0] + q.br[0]) / 2, y: (q.tl[1] + q.br[1]) / 2 }); };
  const SPOTS = () => [ws({ x: 1765, y: 800 }), ws({ x: 1080, y: 905 }), { x: scrC().x + 90, y: scrC().y - 40 }]; // mug, keyboard, screen
  let slapsAtSeg = 0;
  // [name, length in viewport heights, render(u) → what this moment looks like]
  const SEG = [
    ["a-calm", 1.3, (u) => ({ view: "A", heat: 0, fly: u < 0.04 ? { mode: "goal", x: W * 1.08, y: H * 0.18 } : { mode: "free" }, eyes: "near", typing: 0.3, click: "A-swat-p1", cam: 1 + 0.02 * u })],
    ["a-to-b", 1.8, (u) => ({ seq: ["A-to-B-p1", u, 0.08], fly: { mode: "free" }, typing: 0.2 })],
    ["b-look", 1.2, (u) => ({ seq: ["B-lookup-p1", u, 0.15], fly: { mode: "free" } })],
    ["b-dont", 0.9, (u) => ({ flat: "B-wary-p1", cap: win(u, 0.08, 0.92) ? ["…don't.", 1420, 300] : null, fly: { mode: "free" } })],
    ["c-hunt1", 1.9, (u) => {
      const need = hand.slaps - slapsAtSeg < 1 && u > 0.55;            // nudge the story: land on the screen
      return { view: "C", heat: 0, hand: true, cool: 1200, screen: "doc", typing: hand.slap ? 0 : 0.35,
        fly: need ? { mode: "goal", x: scrC().x + 60, y: scrC().y - 30, land: true } : { mode: "free" } };
    }],
    ["b-circle", 1.5, (u) => {
      const f = faceOf("B"), a = -Math.PI / 2 + u * Math.PI * 2.4, x = f.x + Math.cos(a) * 560, y = f.y - 40 + Math.sin(a) * 260;
      const cap = Math.cos(a) < -0.8 ? ["Left.", 380, 330] : Math.cos(a) > 0.8 ? ["Right.", 1680, 330] : null;
      return { view: "B", heat: lerp(0.08, 0.35, u), eyes: "track", fly: { mode: "goal", x, y }, cap, click: "B-swat" };
    }],
    ["c-hunt2", 2.4, (u) => {
      const got = hand.slaps - slapsAtSeg, k = Math.min(2, Math.floor(u / 0.3));
      const need = got <= k && u > 0.12 + 0.3 * k, spot = SPOTS()[k];
      return { view: "C", heat: clamp(lerp(0.35, 0.8, u) + 0.06 * got, 0, 1), hand: true, cool: 350, screen: "doc", typing: hand.slap ? 0 : 0.3,
        again: Math.min(3, got), fly: need ? { mode: "goal", x: spot.x, y: spot.y, land: true } : { mode: "free" } };
    }],
    ["d-stare", 0.8, (u) => ({ flat: "D-master-p2", cam: 1 + 0.06 * u, room: 0.12 })],
    ["d-raise", 1.4, (u) => ({ seq: ["D-raise-p2", u, 0.1], cam: 1.06, room: 0.12, cap: u > 0.8 ? ["Okay.", 640, 250, true] : null })],
    ["c-final", 1.4, (u) => {
      const s = { x: scrC().x, y: scrC().y - 20 };
      return { view: "C", heat: 1, hand: true, screen: "doc", room: 0.1, fly: { mode: "goal", x: s.x, y: s.y, land: true, lock: u > 0.35 },
        final: { spot: s, u: sstep(0.45, 1, u) } };
    }],
    ["thwack", 1.0, (u) => (u < 0.7 ? { seq: ["D-slam-p2", u / 0.7, 0, 0.74] } : { black: 1 })],
    ["eye-screen", 1.8, (u) => ({ eye: u < 0.4 ? "C-press-p3" : u < 0.62 ? "C-boot-p3" : "C-error-p3", amt: lerp(1.7, 1, sstep(0, 0.3, u)) })],
    ["eye-soul", 1.4, (u) => ({ eye: ["A-soul-p3", u, 0.05], amt: 1 })],
    // the facets close on him, dead over the laptop — then the fly drifts back and the room falls away
    ["eye-close", 1.3, (u) => ({ eye: "E1-close", amt: 1 - sstep(0.2, 0.95, u) })],
    ["pullback", 3.0, (u) => ({ seq: ["E-pullback-p3", sstep(0.02, 0.97, u)], fly: { mode: "free" }, flyScale: 1.5, props: u,
      cap: win(u, 0.52, 0.9) ? ["\u2026I hate you.", 1080, 250 - 140 * sstep(0.52, 0.9, u), "soul"] : null })],
    ["end", 1.0, (u) => ({ seq: ["E-pullback-p3", 1], fly: u < 0.3 ? { mode: "free" } : { mode: "exit" }, end: sstep(0.2, 0.75, u) })],
  ];
  let acc = 0;
  const SEGS = SEG.map(([name, len, fn]) => { const s = { name, from: acc, to: acc + len, fn }; acc += len; return s; });
  const TOTAL = acc;
  const DREAM_AT = (seg) => { const i = SEGS.indexOf(seg); return i < SEGS.findIndex((x) => x.name === "b-circle") ? 0.3 : i < SEGS.findIndex((x) => x.name === "eye-screen") ? 0.6 : 1; };
  const segAt = (t) => SEGS.find((s) => t >= s.from && t < s.to) || SEGS[SEGS.length - 1];
  const at = (name, u) => { const s = SEGS.find((x) => x.name === name); return s.from + (s.to - s.from) * u; };
  // one-shot cues, fired when scrolling forward past them
  const CUES = [
    [at("a-calm", 0.05), () => bzz(W * 0.8, H * 0.2)],
    [at("c-hunt1", 0), () => { slapsAtSeg = hand.slaps; }],
    [at("b-circle", 0.02), () => bzz(W * 0.5, H * 0.35, true)],
    [at("c-hunt2", 0), () => { slapsAtSeg = hand.slaps; }],
    [at("c-final", 0.3), () => { buzzBurst(700); bzz(scrC().x, scrC().y + 60, true); }],
    [at("thwack", 0.7), () => { once("thwack", 1); stage.classList.add("shake"); setTimeout(() => stage.classList.remove("shake"), 450); $("thwack").animate([{ opacity: 1, transform: "scale(1.1) rotate(-4deg)" }, { opacity: 1, transform: "scale(1) rotate(-2deg)", offset: 0.6 }, { opacity: 0 }], { duration: 480, easing: "steps(4)" }); }],
    [at("eye-screen", 0.12), () => once("key-dead", 0.9)],
    [at("eye-screen", 0.26), () => once("key-dead", 0.9)],
    [at("eye-screen", 0.4), () => once("boot", 0.6)],
    [at("eye-screen", 0.62), () => once("error", 0.8)],
    [at("eye-screen", 0.0), () => once("swell", 0.8)],
    [at("pullback", 0.02), () => once("swell", 0.7)],
  ];
  $("track").style.height = `${(TOTAL + 1) * 100}vh`;
  const prog = $("progress");
  for (const p of [at("b-circle", 0), at("eye-screen", 0)]) { const i = document.createElement("i"); i.style.left = pct(p / TOTAL); prog.append(i); }

  // ================================================================== render one frame of the timeline
  let tS = 0, tPrev = 0, clickAction = null, eyesMode = "rest", camTarget = 1, lastScene = "", propsU = -1, flyScale = 1, hazeSet = false;
  function render() {
    const raw = clamp(scrollY / innerHeight, 0, TOTAL - 1e-4);
    tS += (raw - tS) * (Math.abs(raw - tS) > 3 ? 1 : 0.2);
    if (tS - tPrev < 1.2) for (const [ct, fn] of CUES) if (tPrev < ct && tS >= ct) fn();   // only when scrolled through, not jumped past
    tPrev = tS;
    const seg = segAt(tS), u = (tS - seg.from) / (seg.to - seg.from), sp = seg.fn(u);
    const d = DREAM_AT(seg);
    if (d !== dreamNow || !hazeSet) { hazeSet = true; dreamNow = d; dreamAudio(d); $("haze").style.opacity = String(0.35 + 0.65 * d); $("bloom").style.opacity = String(0.15 + 0.45 * d); }
    const sceneKey = sp.view || sp.flat || (sp.seq && sp.seq[0]) || (sp.eye && "eye") || (sp.black && "black") || "";
    if (sceneKey !== lastScene) {                                // cuts melt, like in a dream
      if (lastScene && !swatting) world.animate([{ filter: "blur(10px) brightness(1.18) saturate(1.3)", transform: "scale(1.085)" }, { filter: "blur(0px) brightness(1) saturate(1)", transform: "scale(1.05)" }], { duration: 560, easing: "ease-out" });
      lastScene = sceneKey;
    }
    propsU = sp.props ?? -1; flyScale = sp.flyScale || 1;
    if (!swatting) {
      if (sp.view) { wantFlat = null; viewOn(sp.view); setHeat(sp.heat ?? 0); eye.off(); }
      else if (sp.flat) { const want = (wantFlat = sp.flat); decodeFlat(want).then(() => { if (wantFlat === want) flatOn(want); }); eye.off(); }
      else if (sp.seq) { wantFlat = null; const [name, f, from = 0, to = 1] = sp.seq; seqAt(name, f, { from, to }); eye.off(); }
      else if (sp.eye) {
        wantFlat = null; allOff(); eye.on(); eye.amt = sp.amt;
        if (typeof sp.eye === "string") { if (eyeSrc !== sp.eye) { eyeSrc = sp.eye; eyeImage(sp.eye); } }
        else { const [name, f, from = 0] = sp.eye; eyeSrc = vid(name); seqAt(name, f, { from, target: "eye" }); }
      } else if (sp.black) { wantFlat = null; allOff(); eye.off(); }
    }
    $("black").classList.toggle("on", !!sp.black);
    const endA = sp.end || 0; $("end").style.opacity = String(endA); $("end").classList.toggle("on", endA > 0.5);
    if (sp.screen) screen.dataset.mode = sp.screen;
    caption(sp.cap);
    againTo(sp.again || 0);
    typing = (sp.typing || 0) > 0;
    vol("typing-loop", sp.typing || 0); vol("room-loop", sp.room ?? 0.5);
    buzzHold = sp.eye ? 0.5 : 0;
    flyCtl = sp.fly || { mode: "hidden" };
    hand.active = !!sp.hand; hand.final = sp.final || null; hand.cool = sp.cool || 350;
    if (!hand.active) { hand.slap = null; hand.x = REST.x; hand.y = REST.y; }
    eyesMode = sp.eyes || "rest";
    clickAction = sp.click || (sp.hand ? "slap" : null);
    camTarget = sp.cam || 1;
    prog.querySelector(".done").style.width = pct(tS / TOTAL);
  }

  // ================================================================== clicks
  stage.addEventListener("pointerdown", (e) => {
    if (e.target.closest("#progress") || !started) return;
    pointer = toCanvas(e); lastMove = performance.now();
    if (clickAction === "slap") slapAt({ x: fly.x, y: fly.y });
    else if (clickAction === "A-swat-p1") swat("A-swat-p1");
    else if (clickAction === "B-swat") swat(heatVal > 0.5 ? "B-swat-p2" : "B-swat-p1");
    else if (eye.active) buzzBurst(250);
  });
  // drag the progress line to jump anywhere in the film
  const jump = (e) => { const r = prog.getBoundingClientRect(); scrollTo({ top: clamp((e.clientX - r.left) / r.width, 0, 1) * TOTAL * innerHeight, behavior: "instant" }); };
  prog.addEventListener("pointerdown", (e) => { e.stopPropagation(); prog.setPointerCapture(e.pointerId); jump(e); });
  prog.addEventListener("pointermove", (e) => { if (e.buttons) jump(e); });

  // ================================================================== frame loop
  let par = { x: 0, y: 0 }, camC = 1, last = performance.now();
  function tick(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now; const t = now / 1000;
    if (started) render();
    // --- fly
    const m = flyCtl.mode;
    let tx, ty, k = 0.14;
    if (m === "goal") { tx = flyCtl.x + (flyCtl.land ? 0 : Math.sin(t * 2.1) * 30); ty = flyCtl.y + (flyCtl.land ? 0 : Math.cos(t * 2.7) * 24); k = 0.1; }
    else if (m === "exit") { tx = W * 1.3; ty = -H * 0.2; k = 0.05; }
    else if (pointer) { tx = pointer.x; ty = pointer.y; }
    else { tx = W * 0.5 + Math.sin(t * 0.7) * W * 0.28; ty = H * 0.3 + Math.sin(t * 1.3) * H * 0.12; }
    const stunned = now < fly.stunned && !flyCtl.lock;
    if (!stunned) { fly.vx += ((tx - fly.x) * k - fly.vx) * 0.5; fly.vy += ((ty - fly.y) * k - fly.vy) * 0.5; } else { fly.vx *= 0.9; fly.vy *= 0.9; }
    fly.x += fly.vx; fly.y += fly.vy;
    const speed = Math.hypot(fly.vx, fly.vy);
    const still = m === "goal" ? flyCtl.land && Math.hypot(tx - fly.x, ty - fly.y) < 14 : m === "free" && pointer && now - lastMove > 420;
    const landedNow = !stunned && still && speed < 2.5;
    if (landedNow && !fly.landed) fly.stillSince = now;
    fly.landed = landedNow;
    const visible = m !== "hidden";
    const jit = fly.landed || reduce ? 0 : 5 + Math.min(speed, 40) * 0.15;
    const jx = Math.sin(t * 37) * jit + Math.sin(t * 61) * jit * 0.5, jy = Math.cos(t * 43) * jit;
    fly.tilt += ((fly.landed ? 0 : clamp(fly.vx * 0.9, -26, 26)) - fly.tilt) * 0.2;
    flyEl.classList.toggle("on", visible && started);
    flyEl.classList.toggle("flying", !fly.landed); flyEl.classList.toggle("landed", fly.landed);
    const fw = SW * 0.034;
    const flyT = (x, y, r) => `translate3d(${x * S - fw / 2}px, ${y * S - fw * 0.375}px, 0) rotate(${r}deg) scale(${flyScale})`;
    flyEl.style.transform = flyT(fly.x + jx, fly.y + jy, fly.tilt);
    trail.unshift({ x: fly.x + jx, y: fly.y + jy, r: fly.tilt }); trail.length = Math.min(trail.length, 24);
    ghosts.forEach((g, i) => {                                  // the fly's echo trail
      const h = trail[(i + 1) * 5] || trail[trail.length - 1], on = visible && started && dreamNow > 0.25 && !fly.landed;
      g.classList.toggle("on", on); g.style.opacity = on ? String(g.dataset.o * (0.6 + dreamNow * 0.6)) : "0";
      if (h) g.style.transform = flyT(h.x, h.y, h.r);
    });
    for (const [key, sh] of Object.entries(shadows)) {         // a giant fly shadow crossing the painted wall
      const on = key === current && visible && started;
      sh.style.opacity = on ? String(0.06 + 0.16 * dreamNow) : "0";
      if (on) { const w0 = wsInv({ x: fly.x, y: fly.y }), sw = 240; sh.style.width = `${sw * S}px`; sh.style.transform = `translate(${(w0.x - 170 - sw / 2) * S}px, ${(w0.y + 200) * S}px) rotate(${fly.tilt - 12}deg)`; }
    }
    if (buzzGain && actx) {
      const lvl = now < burstUntil ? 0.95 : buzzHold ? buzzHold : visible && !fly.landed ? Math.min(0.9, 0.25 + speed * 0.02) : 0;
      buzzGain.gain.setTargetAtTime(lvl, actx.currentTime, 0.06);
      if (buzzPan) buzzPan.pan.setTargetAtTime(clamp(eye.active ? par.x : (fly.x / W - 0.5) * 1.8, -1, 1), actx.currentTime, 0.05);
    }
    // --- hand
    drawHand(now);
    // --- parallax + camera
    const px = pointer ? (pointer.x / W - 0.5) * 2 : Math.sin(t * 0.2) * 0.3, py = pointer ? (pointer.y / H - 0.5) * 2 : 0;
    par.x += (px - par.x) * 0.06; par.y += (py - par.y) * 0.06;
    const AMP = SW * 0.022 * (reduce ? 0 : 1);
    if (current) for (const l of V[current].layers) {
      const kk = l.depth - 0.35;
      l.el.style.transform = `translate3d(${-par.x * kk * AMP}px, ${-par.y * kk * AMP * 0.45}px, 0)` + (l.id === "person" ? ` scale(1, ${1 + (reduce ? 0 : Math.sin(t * 1.6) * 0.003)})` : "");
    }
    const drift = reduce ? 0 : 1, dx = -par.x * SW * 0.006 * drift, dy = -par.y * SW * 0.003 * drift, dtf = `translate3d(${dx}px, ${dy}px, 0)`;
    flat.style.transform = dtf; document.querySelectorAll(".seqv.on").forEach((v) => (v.style.transform = dtf));
    const kd = current === "C" ? 0.1 : null;
    const nx = kd == null ? dx : -par.x * kd * AMP, ny = kd == null ? dy : -par.y * kd * AMP * 0.45;
    if (Math.abs(nx - screenShift.x) + Math.abs(ny - screenShift.y) > 0.3) { screenShift.x = nx; screenShift.y = ny; placeScreen(); }
    handEl.style.translate = `${nx}px ${ny}px`;
    camC += (camTarget - camC) * 0.08;
    const fl = reduce ? 0 : dreamNow;                           // the camera floats, weightless
    cam.style.transform = `translate(${Math.sin(t * 0.13) * SW * 0.004 * fl}px, ${Math.sin(t * 0.17 + 1) * SW * 0.003 * fl}px) rotate(${Math.sin(t * 0.09) * 0.5 * fl}deg) scale(${camC * (1 + 0.006 * fl * Math.sin(t * 0.21))})`;
    // weightless props drifting past the lens in the pull-back: [id, width, x0, y0, x1, y1, spin, speed]
    const PROPS = [["prop-mug", 0.17, -0.05, 0.78, 0.62, -0.1, 40, 1.0], ["prop-books", 0.12, 1.02, 0.18, 0.02, 0.3, -25, 0.7], ["prop-pencils", 0.06, 0.82, 0.95, 0.55, 0.4, 70, 0.45]];
    for (const [id, wFrac, x0, y0, x1, y1, rot, spd] of PROPS) {
      const el = $(id);
      if (propsU < 0) { el.style.opacity = "0"; continue; }
      const k2 = clamp(propsU * (0.7 + spd * 0.5), 0, 1), x = lerp(x0, x1, k2) + Math.sin(t * 0.5 + wFrac * 40) * 0.01, y = lerp(y0, y1, k2) + Math.cos(t * 0.4 + wFrac * 30) * 0.012;
      el.style.width = pct(wFrac); el.style.opacity = String(sstep(0, 0.12, propsU) * (1 - sstep(0.88, 1, propsU)));
      el.style.transform = `translate(${x * SW}px, ${y * SW * 9 / 16}px) rotate(${rot * k2 + Math.sin(t * 0.3) * 6}deg)`;
    }
    // --- eyes
    if (current && V[current].pupils.length) {
      const f0 = faceOf(current), near = Math.hypot(fly.x - f0.x, fly.y - f0.y) < W * 0.2;
      const track = eyesMode === "track" || (eyesMode === "near" && near);
      for (const p of V[current].pupils) {
        let ox = 0, oy = 0;
        if (track && flyCtl.mode !== "hidden") {
          const vx = fly.x - p.x, vy = fly.y - p.y, mm = Math.hypot(vx, vy) || 1, g = Math.min(1, mm / 300);
          ox = vx / mm * g * p.r * 0.75; oy = vy / mm * g * p.r * 0.6;
        }
        p.ox += (ox - p.ox) * 0.3; p.oy += (oy - p.oy) * 0.3;
        const blink = (Math.floor(t * 10) % 47) === 0;
        p.el.style.transform = `translate(${p.ox * S}px, ${p.oy * S}px) scaleY(${blink ? 0.15 : 1})`;
      }
    }
    eye.draw(t, { x: par.x, y: -par.y }, dt);
    requestAnimationFrame(tick);
  }
  new ResizeObserver(() => { SW = stage.clientWidth; S = SW / W; placeScreen(); }).observe(stage);

  // ================================================================== start
  document.documentElement.classList.add("locked");
  const essential = [...document.querySelectorAll(".layer img, .hand img")].map((i) => i.decode().catch(() => {}));
  ["B-wary-p1", "D-master-p2", "C-press-p3", "C-boot-p3", "C-error-p3", "B-glare-p3"].forEach(decodeFlat);
  for (const n of Object.keys(MAN.seqs || {})) vid(n);
  let loaded = 0;
  essential.forEach((p) => p.then(() => { loaded++; if (loaded < essential.length) $("go").textContent = `Painting the room… ${Math.round(loaded / essential.length * 100)}%`; }));
  viewOn("A"); setHeat(0);
  let ready = false, started = false;
  Promise.all(essential).then(() => { ready = true; $("go").textContent = "Click to begin"; });
  requestAnimationFrame(tick);
  function start() {
    if (started || !ready) return; started = true;
    initAudio(); $("title").classList.add("gone");
    document.documentElement.classList.remove("locked");
    prog.classList.add("on");
    const hideHint = () => { if (scrollY > innerHeight * 0.3) { $("hint").style.opacity = "0"; removeEventListener("scroll", hideHint); } };
    addEventListener("scroll", hideHint, { passive: true });
  }
  $("title").addEventListener("click", start);
  $("title").addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") start(); });
  $("end").addEventListener("click", () => scrollTo({ top: 0, behavior: "smooth" }));
})();
