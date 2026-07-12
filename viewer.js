/* =====================================================================
 *  viewer.js — 3D FSAE chassis viewer for the hero.
 *  Self-contained. Safe to edit. If anything here fails, the hero
 *  silently falls back to the blueprint SVG watermark.
 *
 *  TUNE THESE  ▸ everything you'd normally want to change is in CONFIG.
 * ===================================================================== */
(function () {
  'use strict';

  const CONFIG = {
    model:        'assets/chassis.glb',   // the model file
    three:        './assets/three.module.js',
    loader:       './assets/GLTFLoader.js',

    edgeColor:    0x9ff8e6,   // bright teal edges
    faceColor:    0x2a6f66,   // brighter teal tube bodies
    emissive:     0x0f3d38,   // inner glow so tubes never go muddy
    edgeAngle:    18,         // degrees — lower = more edges drawn
    edgeOpacity:  0.95,
    faceOpacity:  1.0,

    autoRotate:   true,
    rotateSpeed:  0.22,       // radians/sec of idle spin
    resumeDelay:  2500,       // ms of no input before auto-rotate resumes
    dragSpeed:    0.006,      // mouse sensitivity
    zoom:         false,      // wheel zoom OFF by design (never hijack page scroll)

    // camera: front-3/4 view
    fitSize:      1.7,       // model is scaled to this many world units
    camDist:      3.4,
    startYaw:     0.85,
    startPitch:   0.28,
    minPitch:    -0.55,
    maxPitch:     1.15,
    fov:          32,
  };

  const mount = document.getElementById('heroModel');
  if (!mount) return;

  const reduced = window.matchMedia &&
                  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Bail out gracefully — the SVG watermark stays visible.
  function fail(why) {
    if (window.console && console.warn) console.warn('[viewer] ' + why + ' — using SVG fallback.');
    mount.classList.add('viewer-failed');
  }

  // Don't pay for 3D on tiny screens / no WebGL.
  function hasWebGL() {
    try {
      const c = document.createElement('canvas');
      return !!(window.WebGLRenderingContext &&
               (c.getContext('webgl') || c.getContext('experimental-webgl')));
    } catch (e) { return false; }
  }
  if (!hasWebGL()) return fail('no WebGL');

  // Lazy-load: only build the scene when the hero is actually on screen.
  function whenVisible(cb) {
    if (typeof IntersectionObserver === 'undefined') return cb();
    const io = new IntersectionObserver(function (entries) {
      if (entries.some(e => e.isIntersecting)) { io.disconnect(); cb(); }
    }, { rootMargin: '200px' });
    io.observe(mount);
  }

  whenVisible(function () {
    Promise.all([
      import(CONFIG.three),
      import(CONFIG.loader)
    ]).then(function (mods) {
      boot(mods[0], mods[1].GLTFLoader);
    }).catch(function (e) {
      fail('could not load three.js (' + e.message + ')');
    });
  });

  function boot(THREE, GLTFLoader) {
    const scene  = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(CONFIG.fov, 1, 0.1, 100);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);

    // lights — enough to give the tubes form without washing out the edges
    scene.add(new THREE.AmbientLight(0xffffff, 0.85));
    const key  = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(2, 3, 2);
    const rim  = new THREE.DirectionalLight(0x9ff8e6, 1.1); rim.position.set(-3, -1, -2);
    const fill = new THREE.DirectionalLight(0x5eead4, 0.7); fill.position.set(0, -3, 1);
    scene.add(key, rim, fill);

    const pivot = new THREE.Group();
    scene.add(pivot);

    // fixed camera; the pivot does all the rotating
    camera.position.set(0, 0.30, CONFIG.camDist);
    camera.lookAt(0, 0, 0);

    let yaw = CONFIG.startYaw, pitch = CONFIG.startPitch;
    let spinning = CONFIG.autoRotate && !reduced;
    let lastInput = 0, ready = false;

    new GLTFLoader().load(CONFIG.model, function (gltf) {
      const root = gltf.scene;

      root.traverse(function (o) {
        if (!o.isMesh) return;

        // dark tube bodies
        o.material = new THREE.MeshStandardMaterial({
          color: CONFIG.faceColor,
          emissive: CONFIG.emissive,
          emissiveIntensity: 1.0,
          metalness: 0.3,
          roughness: 0.42,
          transparent: CONFIG.faceOpacity < 1,
          opacity: CONFIG.faceOpacity,
        });

        // glowing teal edges, computed in 3D so tubes read correctly from any angle
        const edges = new THREE.LineSegments(
          new THREE.EdgesGeometry(o.geometry, CONFIG.edgeAngle),
          new THREE.LineBasicMaterial({
            color: CONFIG.edgeColor,
            transparent: true,
            opacity: CONFIG.edgeOpacity,
          })
        );
        o.add(edges);
      });

      // center + scale to fit the frame regardless of model units
      const box = new THREE.Box3().setFromObject(root);
      const size = box.getSize(new THREE.Vector3());
      const mid  = box.getCenter(new THREE.Vector3());
      root.position.sub(mid);
      const fit = CONFIG.fitSize / Math.max(size.x, size.y, size.z);
      root.scale.setScalar(fit);

      pivot.add(root);
      ready = true;
      mount.classList.add('viewer-ready');   // fades the SVG fallback out
    }, undefined, function (e) {
      fail('model failed to load');
    });

    /* ---------- interaction: drag to orbit, pause spin, resume when idle ---------- */
    let dragging = false, px = 0, py = 0;

    function down(x, y) { dragging = true; px = x; py = y; spinning = false; lastInput = performance.now(); mount.classList.add('grabbing'); }
    function move(x, y) {
      if (!dragging) return;
      yaw   += (x - px) * CONFIG.dragSpeed;
      pitch += (y - py) * CONFIG.dragSpeed;
      pitch = Math.max(CONFIG.minPitch, Math.min(CONFIG.maxPitch, pitch));
      px = x; py = y; lastInput = performance.now();
    }
    function up() { dragging = false; lastInput = performance.now(); mount.classList.remove('grabbing'); }

    mount.addEventListener('mousedown', e => { e.preventDefault(); down(e.clientX, e.clientY); });
    window.addEventListener('mousemove', e => move(e.clientX, e.clientY));
    window.addEventListener('mouseup', up);

    // touch: drag to orbit, but never swallow a vertical page scroll
    mount.addEventListener('touchstart', e => {
      if (e.touches.length === 1) down(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });
    mount.addEventListener('touchmove', e => {
      if (!dragging || e.touches.length !== 1) return;
      const t = e.touches[0];
      const dx = Math.abs(t.clientX - px), dy = Math.abs(t.clientY - py);
      if (dy > dx) { up(); return; }        // user is scrolling the page — let them
      e.preventDefault();
      move(t.clientX, t.clientY);
    }, { passive: false });
    mount.addEventListener('touchend', up, { passive: true });

    // CONFIG.zoom is false: we deliberately do NOT bind wheel events.

    /* ---------- resize ---------- */
    function resize() {
      const w = mount.clientWidth, h = mount.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(resize).observe(mount);
    else window.addEventListener('resize', resize);
    resize();

    /* ---------- render loop (pauses when off-screen) ---------- */
    let visible = true, prev = performance.now();
    if (typeof IntersectionObserver !== 'undefined') {
      new IntersectionObserver(es => { visible = es[0].isIntersecting; })
        .observe(mount);
    }

    function frame(now) {
      requestAnimationFrame(frame);
      if (!visible || !ready) { prev = now; return; }

      const dt = Math.min((now - prev) / 1000, 0.05);
      prev = now;

      if (!dragging && !spinning && CONFIG.autoRotate && !reduced &&
          now - lastInput > CONFIG.resumeDelay) {
        spinning = true;
      }
      if (spinning) yaw += CONFIG.rotateSpeed * dt;

      pivot.rotation.y = yaw;
      pivot.rotation.x = pitch;

      renderer.render(scene, camera);
    }
    requestAnimationFrame(frame);
  }
})();
