/* =====================================================================
   EstateStudioLabs — Daybreak — interactions
   WebGL dreamy sky · custom cursor · scroll-linked Zillow-cost chart ·
   retained demo engine (IDX / CMA / speed-to-lead).
   ===================================================================== */
(function () {
  'use strict';
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fmt = (n) => '$' + Math.round(n).toLocaleString('en-US');
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  /* =================================================================
     1 · DREAMY SKY — WebGL gradient-mesh shader (Three.js)
     ================================================================= */
  (function sky() {
    const canvas = $('#sky');
    if (!canvas || typeof THREE === 'undefined') return;        // CSS fallback stays
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, powerPreference: 'low-power' });
    } catch (e) { return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));

    const scene = new THREE.Scene();
    const camera = new THREE.Camera();
    const uniforms = {
      uTime: { value: 0 },
      uAspect: { value: 1 },
      uMouse: { value: new THREE.Vector2(0.5, 0.4) },
      uScroll: { value: 0 }
    };
    const material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position, 1.0); }`,
      fragmentShader: `
        precision highp float;
        varying vec2 vUv;
        uniform float uTime; uniform float uAspect; uniform vec2 uMouse; uniform float uScroll;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
        float noise(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.0-2.0*f);
          return mix(mix(hash(i+vec2(0,0)),hash(i+vec2(1,0)),u.x),
                     mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x), u.y); }
        float fbm(vec2 p){ float v=0.0, a=0.5; mat2 m=mat2(1.6,1.2,-1.2,1.6);
          for(int i=0;i<5;i++){ v+=a*noise(p); p=m*p; a*=0.5; } return v; }
        void main(){
          vec2 uv = vUv;
          vec2 p = uv * 2.1; p.x *= uAspect;
          float t = uTime * 0.058;                 // livelier drift
          // pointer warps the flow so the texture visibly shifts under the cursor
          vec2 mp = vec2(uMouse.x * uAspect, uMouse.y);
          vec2 toM = vec2(uv.x * uAspect, uv.y) - mp;
          float md = length(toM);
          vec2 warp = toM * 0.10 / (md + 0.18);
          vec2 q = vec2(fbm(p + warp + t), fbm(p + warp + vec2(5.2,1.3) - t));
          float f = fbm(p + q*1.7 + warp + vec2(t*0.5, -t*0.3));
          // vibrant sky-blue palette
          vec3 cTop   = vec3(0.36,0.66,0.99);
          vec3 cMid   = vec3(0.72,0.88,1.00);
          vec3 cLav   = vec3(0.69,0.74,0.99);
          vec3 cPeach = vec3(0.99,0.88,0.78);
          vec3 col = mix(cTop, cMid, smoothstep(-0.1,1.05,uv.y));
          col = mix(col, cLav, f*0.55);
          col = mix(col, cPeach, smoothstep(0.5,1.05,uv.y)*(0.25+0.5*q.x));
          col += 0.08*smoothstep(0.45,0.92,f);
          // soft luminous bloom that glides under the cursor
          float glow = smoothstep(0.42,0.0,md);
          col += vec3(0.10,0.13,0.16)*glow;
          col += 0.06*smoothstep(0.16,0.0,md);
          gl_FragColor = vec4(clamp(col,0.0,1.0), 1.0);
        }`
    });
    scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));

    function resize() {
      const w = window.innerWidth, h = window.innerHeight;
      renderer.setSize(w, h, false);
      uniforms.uAspect.value = w / h;
    }
    resize();
    window.addEventListener('resize', resize, { passive: true });

    const mouseT = { x: 0.5, y: 0.45 };          // target the glow eases toward
    if (!reduceMotion) {
      window.addEventListener('pointermove', (e) => {
        mouseT.x = e.clientX / window.innerWidth;
        mouseT.y = 1 - e.clientY / window.innerHeight;
      }, { passive: true });
    }
    const updateScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      uniforms.uScroll.value = clamp(window.scrollY / (max || 1), 0, 1);
    };
    updateScroll();
    window.addEventListener('scroll', updateScroll, { passive: true });

    let raf, running = true;
    const start = performance.now();
    function frame(now) {
      uniforms.uTime.value = (now - start) / 1000;
      uniforms.uMouse.value.x = lerp(uniforms.uMouse.value.x, mouseT.x, 0.06);
      uniforms.uMouse.value.y = lerp(uniforms.uMouse.value.y, mouseT.y, 0.06);
      renderer.render(scene, camera);
      if (running && !reduceMotion) raf = requestAnimationFrame(frame);
    }
    if (reduceMotion) { renderer.render(scene, camera); }
    else { raf = requestAnimationFrame(frame); }
    document.addEventListener('visibilitychange', () => {
      running = !document.hidden;
      if (running && !reduceMotion) raf = requestAnimationFrame(frame);
      else cancelAnimationFrame(raf);
    });
  })();

  /* =================================================================
     2 · CUSTOM CURSOR — smooth follower that pops at links
     ================================================================= */
  (function cursorPop() {
    if (reduceMotion || window.matchMedia('(hover: none)').matches) return;
    const pop = $('.cursor-pop'), label = $('.cursor-pop__label');
    if (!pop) return;
    let mx = window.innerWidth / 2, my = window.innerHeight / 2, px = mx, py = my;
    window.addEventListener('pointermove', (e) => { mx = e.clientX; my = e.clientY; }, { passive: true });
    function loop() {
      px = lerp(px, mx, 0.22); py = lerp(py, my, 0.22);
      pop.style.transform = `translate3d(${px}px, ${py}px, 0)`;
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);

    // Only elements with an explicit, meaningful data-cursor label pop.
    // Everything else just shows the native pointer/hand — no unhelpful "Open".
    document.addEventListener('pointerover', (e) => {
      const t = e.target.closest('[data-cursor]');
      if (!t) return;
      const txt = (t.getAttribute('data-cursor') || '').trim();
      if (txt.length < 2) return;
      label.textContent = txt; pop.classList.add('is-on');
    });
    document.addEventListener('pointerout', (e) => {
      const t = e.target.closest('[data-cursor]');
      if (!t) return;
      if (e.relatedTarget && t.contains(e.relatedTarget)) return;
      pop.classList.remove('is-on');
    });
  })();

  /* =================================================================
     3 · NAV
     ================================================================= */
  const nav = $('#nav');
  const footerEl = $('.footer');
  const onScroll = () => {
    nav.classList.toggle('is-scrolled', window.scrollY > 12);
    if (footerEl) {
      // when the floating bar overlaps the dark footer, go extra-transparent/liquid
      nav.classList.toggle('nav--on-dark', footerEl.getBoundingClientRect().top <= nav.getBoundingClientRect().bottom);
    }
  };
  onScroll(); window.addEventListener('scroll', onScroll, { passive: true });
  const toggle = $('#navToggle'), drawer = $('#navDrawer');
  toggle.addEventListener('click', () => {
    const open = toggle.classList.toggle('is-open');
    drawer.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', open); drawer.setAttribute('aria-hidden', !open);
  });
  $$('#navDrawer a').forEach((a) => a.addEventListener('click', () => {
    toggle.classList.remove('is-open'); drawer.classList.remove('is-open');
    toggle.setAttribute('aria-expanded', false); drawer.setAttribute('aria-hidden', true);
  }));

  /* =================================================================
     4 · REVEAL + conversion bars + stat counters
     ================================================================= */
  function countUp(el) {
    const to = +el.dataset.count, pre = el.dataset.prefix || '', suf = el.dataset.suffix || '';
    if (reduceMotion || to === 0) { el.textContent = pre + to + suf; return; }
    const dur = 1100, start = performance.now();
    const step = (now) => {
      const p = Math.min((now - start) / dur, 1), e = 1 - Math.pow(1 - p, 3);
      el.textContent = pre + Math.round(to * e) + suf;
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      e.target.classList.add('is-in');
      $$('.convbars__fill', e.target).forEach((b) => { b.style.width = (b.dataset.pct || 50) + '%'; });
      $$('.stat__num', e.target).forEach(countUp);
      io.unobserve(e.target);
    });
  }, { threshold: 0.16, rootMargin: '0px 0px -8% 0px' });
  $$('.reveal').forEach((el) => io.observe(el));

  /* =================================================================
     5 · SCROLL-LINKED ZILLOW-COST CHART
     ================================================================= */
  (function costChart() {
    const rail = $('#cost .cost__rail'), svg = $('#costSvg');
    if (!rail || !svg) return;
    // viewBox geometry
    const PADL = 72, PADR = 48, BASE = 240, TOP = 40, BOT = 440, W = 1000;
    const plotW = W - PADL - PADR;
    const YEARS = 5;
    const lossArr = [0, 18, 36, 54, 72, 90];      // $k handed to Zillow, cumulative (money gone)
    const gainArr = [0, 16, 40, 70, 98, 122];     // $k commissions your owned site earns, compounding
    const maxMag = 125;
    const scale = (BASE - TOP) / maxMag;
    const xFor = (i) => PADL + (i / YEARS) * plotW;
    const lossY = (v) => BASE + v * scale;
    const gainY = (v) => BASE - v * scale;

    // grid + labels
    const grid = $('#costGrid'); let g = '';
    for (let k = 30; k <= 120; k += 30) {
      g += `<line class="grid-line" x1="${PADL}" y1="${gainY(k)}" x2="${W - PADR}" y2="${gainY(k)}"/>`;
      g += `<line class="grid-line" x1="${PADL}" y1="${lossY(k)}" x2="${W - PADR}" y2="${lossY(k)}"/>`;
    }
    g += `<line class="grid-base" x1="${PADL}" y1="${BASE}" x2="${W - PADR}" y2="${BASE}"/>`;
    for (let i = 1; i <= YEARS; i++) {
      g += `<text class="grid-label" x="${xFor(i)}" y="${BASE + 22}" text-anchor="middle">Y${i}</text>`;
    }
    grid.innerHTML = g;

    // build full paths
    const linePath = (arr, yf) => arr.map((v, i) => `${i ? 'L' : 'M'} ${xFor(i).toFixed(1)} ${yf(v).toFixed(1)}`).join(' ');
    const areaPath = (arr, yf) =>
      `M ${xFor(0)} ${BASE} ` + arr.map((v, i) => `L ${xFor(i).toFixed(1)} ${yf(v).toFixed(1)}`).join(' ') + ` L ${xFor(YEARS)} ${BASE} Z`;
    $('#lossLine').setAttribute('d', linePath(lossArr, lossY));
    $('#gainLine').setAttribute('d', linePath(gainArr, gainY));
    $('#lossArea').setAttribute('d', areaPath(lossArr, lossY));
    $('#gainArea').setAttribute('d', areaPath(gainArr, gainY));

    // reveal clip
    const NS = 'http://www.w3.org/2000/svg';
    const defs = svg.querySelector('defs');
    const cp = document.createElementNS(NS, 'clipPath');
    cp.setAttribute('id', 'costReveal'); cp.setAttribute('clipPathUnits', 'userSpaceOnUse');
    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('x', '0'); rect.setAttribute('y', '0'); rect.setAttribute('height', '460'); rect.setAttribute('width', '0');
    cp.appendChild(rect); defs.appendChild(cp);
    $('#costClipWrap').setAttribute('clip-path', 'url(#costReveal)');

    const sweep = $('#costSweep'), lossDot = $('#lossDot'), gainDot = $('#gainDot');
    const elLoss = $('#costLoss'), elGain = $('#costGain'), elYear = $('#costYear'), verdict = $('#costVerdict');

    const valAt = (arr, yf) => {           // interpolate value + y at fractional progress
      const t = clamp(progress, 0, 1) * YEARS, i = Math.min(Math.floor(t), YEARS - 1), f = t - i;
      const v = lerp(arr[i], arr[i + 1], f);
      return { v, y: yf(v) };
    };
    let progress = 0;

    function render() {
      const x = xFor(clamp(progress, 0, 1) * YEARS);
      rect.setAttribute('width', x.toFixed(1));
      sweep.setAttribute('x1', x); sweep.setAttribute('x2', x);
      const L = valAt(lossArr, lossY), G = valAt(gainArr, gainY);
      lossDot.setAttribute('cx', x); lossDot.setAttribute('cy', L.y);
      gainDot.setAttribute('cx', x); gainDot.setAttribute('cy', G.y);
      elLoss.textContent = fmt(L.v * 1000);
      elGain.textContent = fmt(G.v * 1000);
      elYear.textContent = clamp(Math.ceil(progress * YEARS) || 1, 1, YEARS);
      const apart = Math.round((L.v + G.v) * 1000);
      verdict.innerHTML = progress > 0.04
        ? `That's <strong>${fmt(apart)}</strong> apart so far.`
        : `After 5 years you'd be <strong>$178,000</strong> apart.`;
    }

    function update() {
      // viewport-relative: rail top hits 0 when pinned, -span when fully scrolled
      const rect = rail.getBoundingClientRect();
      const span = rail.offsetHeight - window.innerHeight;
      progress = clamp(-rect.top / (span || 1), 0, 1);
      render();
    }
    if (reduceMotion) { progress = 1; render(); }
    else {
      update();
      window.addEventListener('scroll', update, { passive: true });
      window.addEventListener('resize', update, { passive: true });
    }
  })();

  /* =================================================================
     6 · IDX listing search
     ================================================================= */
  const LISTINGS = {
    austin: [
      { price: 1850000, beds: 4, bath: 4, sqft: 3820, addr: 'Westlake Dr, Austin TX', tag: 'New' },
      { price: 720000, beds: 3, bath: 2, sqft: 1980, addr: 'E 6th St, Austin TX', tag: 'Hot' },
      { price: 599000, beds: 3, bath: 2, sqft: 1640, addr: 'Mueller, Austin TX', tag: 'Open Sun' },
      { price: 1290000, beds: 4, bath: 3, sqft: 2900, addr: 'Travis Heights, Austin TX', tag: 'New' },
      { price: 449000, beds: 2, bath: 2, sqft: 1180, addr: 'East Austin, TX', tag: 'Price ↓' }
    ],
    phoenix: [
      { price: 540000, beds: 4, bath: 3, sqft: 2410, addr: 'Arcadia, Phoenix AZ', tag: 'Hot' },
      { price: 389000, beds: 3, bath: 2, sqft: 1720, addr: 'Tempe, AZ', tag: 'New' },
      { price: 765000, beds: 4, bath: 3, sqft: 3010, addr: 'Paradise Valley, AZ', tag: 'Open Sat' },
      { price: 299000, beds: 2, bath: 2, sqft: 1090, addr: 'Mesa, AZ', tag: 'First home' },
      { price: 1100000, beds: 5, bath: 4, sqft: 3900, addr: 'Camelback, Phoenix AZ', tag: 'Luxury' }
    ],
    miami: [
      { price: 2250000, beds: 4, bath: 5, sqft: 3600, addr: 'Coral Gables, Miami FL', tag: 'Waterfront' },
      { price: 880000, beds: 3, bath: 3, sqft: 2100, addr: 'Brickell, Miami FL', tag: 'New' },
      { price: 615000, beds: 2, bath: 2, sqft: 1340, addr: 'Wynwood, Miami FL', tag: 'Hot' },
      { price: 1450000, beds: 4, bath: 4, sqft: 2950, addr: 'Coconut Grove, FL', tag: 'Open Sun' },
      { price: 470000, beds: 3, bath: 2, sqft: 1500, addr: 'Little Havana, FL', tag: 'Price ↓' }
    ]
  };
  const HOME_IMGS = [
    'https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=680&q=80&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1570129477492-45c003edd2be?w=680&q=80&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1576941089067-2de3c901e126?w=680&q=80&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=680&q=80&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=680&q=80&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1605276374104-dee2a0ed3cd6?w=680&q=80&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=680&q=80&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1599809275671-b5942cabc7a2?w=680&q=80&auto=format&fit=crop'
  ];
  const CITY_OFFSET = { austin: 0, phoenix: 3, miami: 5 };
  const idxResults = $('#idxResults'), idxCount = $('#idxCount');
  function renderIDX() {
    if (!idxResults) return;
    const city = $('#idxCity').value, beds = +$('#idxBeds').value, maxP = +$('#idxPrice').value;
    const off = CITY_OFFSET[city] || 0;
    const matches = LISTINGS[city].filter((l) => l.beds >= beds && l.price <= maxP);
    idxCount.textContent = matches.length;
    idxResults.innerHTML = matches.map((l, i) => `
      <article class="listing" style="animation-delay:${i * 70}ms">
        <div class="listing__img">
          <img loading="lazy" src="${HOME_IMGS[(off + i) % HOME_IMGS.length]}" alt="${l.addr}" onerror="this.style.display='none'" />
          <span class="listing__tag">${l.tag}</span>
        </div>
        <div class="listing__body">
          <p class="listing__price">${fmt(l.price)}</p>
          <p class="listing__meta">${l.beds} bd · ${l.bath} ba · ${l.sqft.toLocaleString()} sqft</p>
          <p class="listing__addr">${l.addr}</p>
        </div>
      </article>`).join('') || `<p class="idx__count">No homes match, <em>but the searcher is still captured.</em></p>`;
  }
  ['#idxCity', '#idxBeds', '#idxPrice'].forEach((s) => { const el = $(s); if (el) el.addEventListener('change', renderIDX); });
  $('#idxSearch') && $('#idxSearch').addEventListener('click', renderIDX);
  renderIDX();

  /* =================================================================
     7 · CMA — instant home value
     ================================================================= */
  function hashStr(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function runCMA() {
    // deterministic: the same address always returns the same estimate
    const addr = ($('#cmaAddr').value || 'home').trim().toLowerCase();
    const base = 420000 + (hashStr(addr) % 760) * 1000;   // stable $420k–$1.18M
    animateValue($('#cmaEst'), base);
    $('#cmaLow').textContent = fmt(base * 0.94);
    $('#cmaHigh').textContent = fmt(base * 1.07);
    $('#cmaCaptured').hidden = false;
  }
  let valRAF;
  function animateValue(el, to) {
    if (!el) return;
    if (reduceMotion) { el.textContent = fmt(to); return; }
    cancelAnimationFrame(valRAF);
    const from = parseInt((el.textContent || '0').replace(/[^0-9]/g, ''), 10) || 0;
    const start = performance.now(), dur = 600;
    const step = (now) => {
      const p = Math.min((now - start) / dur, 1), eased = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt(from + (to - from) * eased);
      if (p < 1) valRAF = requestAnimationFrame(step);
    };
    valRAF = requestAnimationFrame(step);
  }
  $('#cmaBtn') && $('#cmaBtn').addEventListener('click', runCMA);

  /* =================================================================
     8 · SPEED-TO-LEAD animation
     ================================================================= */
  const speedSteps = $$('#speedFlow .speed__step');
  let timers = [];
  function playSpeed() {
    timers.forEach(clearTimeout); timers = [];
    speedSteps.forEach((s) => s.classList.remove('is-on'));
    speedSteps.forEach((s, i) => timers.push(setTimeout(() => s.classList.add('is-on'), reduceMotion ? 0 : 500 + i * 750)));
  }
  $('#speedReplay') && $('#speedReplay').addEventListener('click', playSpeed);

  /* DEMO TABS */
  $$('.demo__pill').forEach((pill) => pill.addEventListener('click', () => {
    const key = pill.dataset.demo;
    $$('.demo__pill').forEach((p) => { p.classList.toggle('is-active', p === pill); p.setAttribute('aria-selected', p === pill); });
    $$('.demo__panel').forEach((pan) => pan.classList.toggle('is-active', pan.dataset.demo === key));
    if (key === 'speed') playSpeed();
  }));
  const speedPanel = $('.demo__panel[data-demo="speed"]');
  const speedIO = new IntersectionObserver((es) => es.forEach((e) => {
    if (e.isIntersecting && $('.demo__pill.is-active') && $('.demo__pill.is-active').dataset.demo === 'speed') playSpeed();
  }), { threshold: 0.4 });
  if (speedPanel) speedIO.observe(speedPanel);

  /* =================================================================
     9 · FAQ single-open + Calendly slots
     ================================================================= */
  $$('.acc').forEach((d) => d.addEventListener('toggle', () => {
    if (d.open) $$('.acc').forEach((o) => { if (o !== d) o.open = false; });
  }));
  $$('.slot').forEach((s) => s.addEventListener('click', () => {
    $$('.slot').forEach((o) => o.classList.remove('is-on')); s.classList.add('is-on');
  }));
})();
