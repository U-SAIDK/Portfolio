/**
 * Hero robot widget — a small procedural Three.js character that tracks
 * the cursor. Lazy-loaded: Three.js (~600KB) is only fetched on desktop
 * viewports (>=1100px) and only once the widget scrolls into view, so it
 * never costs anything on mobile or below the fold.
 *
 * Motion model: every rotation/position eases toward its target with
 * frame-rate-independent exponential damping (see `damp`) instead of a
 * fixed per-frame multiplier, so it looks the same at 60Hz and 144Hz.
 * When the cursor is idle (or off-window) the head/torso drift through a
 * slow layered-sine "look around" instead of freezing in place, and a
 * light blink/breathing cycle keeps it feeling alive rather than posed.
 */
(function () {
  'use strict';
  if (window.innerWidth < 1100) return;

  var widget = document.getElementById('robot-widget');
  if (!widget) return;

  var loadObserver = new IntersectionObserver(function (entries) {
    if (!entries[0].isIntersecting) return;
    loadObserver.disconnect();
    var script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/three@0.158.0/build/three.min.js';
    script.onload = initRobot;
    document.head.appendChild(script);
  }, { threshold: 0.01 });
  loadObserver.observe(widget);

  function initRobot() {
    if (typeof THREE === 'undefined') return;

    /* ── helpers ─────────────────────────────────────────── */
    var T = THREE;
    var PI = Math.PI;

    // Frame-rate-independent exponential smoothing (Freya Holmér's
    // "exact damping"): reaches the same position regardless of dt size,
    // so motion stays consistent across refresh rates and after tab-switch
    // hitches. Higher lambda = snappier / lower = heavier.
    function damp(current, target, lambda, dt) {
      return target + (current - target) * Math.exp(-lambda * dt);
    }
    function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
    function mix(a, b, t) { return a + (b - a) * t; }
    function mesh(geo, mat) {
      var m = new T.Mesh(geo, mat);
      m.castShadow = true;
      return m;
    }

    /* ── container ───────────────────────────────────────── */
    var el = document.getElementById('robot-widget');
    if (!el) return;
    var CW = el.clientWidth || 340;
    var CH = el.clientHeight || 460;

    /* ── renderer ────────────────────────────────────────── */
    var renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(CW, CH);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    renderer.domElement.style.cssText = 'display:block;pointer-events:none;';
    el.appendChild(renderer.domElement);

    /* ── scene / camera ──────────────────────────────────── */
    var scene = new T.Scene();
    var camera = new T.PerspectiveCamera(46, CW / CH, 0.1, 100);
    camera.position.set(0, 0.5, 6.2);
    camera.lookAt(0, 0.5, 0);

    /* ── pointer tracking ─────────────────────────────────
       mx/my are the raw cursor target in [-1, 1] viewport space. When the
       pointer hasn't moved in a while (or has left the window), idleFactor
       fades in and the robot drifts through a slow ambient wander instead
       of holding a frozen pose. */
    var mx = 0, my = 0;
    var lastMoveAt = -Infinity;
    var pointerInWindow = false;
    var IDLE_DELAY = 2.2;   // seconds of stillness before wander kicks in
    var IDLE_FADE = 1.4;    // seconds to blend fully into wander

    window.addEventListener('mousemove', function (e) {
      mx = (e.clientX / window.innerWidth) * 2 - 1;
      my = -(e.clientY / window.innerHeight) * 2 + 1;
      lastMoveAt = clock ? clock.getElapsedTime() : 0;
      pointerInWindow = true;
    }, { passive: true });
    document.addEventListener('mouseleave', function () { pointerInWindow = false; }, { passive: true });
    window.addEventListener('blur', function () { pointerInWindow = false; }, { passive: true });

    /* ── lights ──────────────────────────────────────────── */
    scene.add(new T.AmbientLight(0x1a1a2e, 3.5));

    var keyLight = new T.DirectionalLight(0x7c6cf7, 4.5);
    keyLight.position.set(-4, 6, 5);
    keyLight.castShadow = true;
    scene.add(keyLight);

    var fillLight = new T.DirectionalLight(0x22d3ee, 2.4);
    fillLight.position.set(4, 3, 2);
    scene.add(fillLight);

    var rimLight = new T.DirectionalLight(0xffffff, 1.6);
    rimLight.position.set(0, 8, -5);
    scene.add(rimLight);

    var chestPointLight = new T.PointLight(0x34d399, 3.0, 4.5);
    chestPointLight.position.set(0, 0.2, 1.1);
    scene.add(chestPointLight);

    /* ── materials ───────────────────────────────────────── */
    var mBlack = new T.MeshStandardMaterial({ color: 0x080810, metalness: 0.92, roughness: 0.07 });
    var mDark = new T.MeshStandardMaterial({ color: 0x0f0f1e, metalness: 0.80, roughness: 0.18 });
    var mBlue = new T.MeshStandardMaterial({ color: 0x22d3ee, emissive: 0x22d3ee, emissiveIntensity: 0.8, metalness: 0.2, roughness: 0.2 });
    var mViolet = new T.MeshStandardMaterial({ color: 0xfb7185, emissive: 0xfb7185, emissiveIntensity: 0.7, metalness: 0.2, roughness: 0.2 });
    var mEye = new T.MeshStandardMaterial({ color: 0x22d3ee, emissive: 0x22d3ee, emissiveIntensity: 4.0, roughness: 0.0, metalness: 0.0 });
    var mReact = new T.MeshStandardMaterial({ color: 0x34d399, emissive: 0x34d399, emissiveIntensity: 3.5, roughness: 0.0, metalness: 0.0 });

    /* ── env map for reflections ─────────────────────────── */
    try {
      var pmrem = new T.PMREMGenerator(renderer);
      pmrem.compileEquirectangularShader();
      var envScene = new T.Scene();
      envScene.background = new T.Color(0x0c0c20);
      scene.environment = pmrem.fromScene(envScene).texture;
      pmrem.dispose();
    } catch (_) { /* PMREM unsupported on this GPU/driver — reflections just fall back to flat shading */ }

    /* ── robot root ──────────────────────────────────────── */
    var robot = new T.Group();
    scene.add(robot);

    /* HEAD */
    var headG = new T.Group();
    headG.position.set(0, 2.04, 0);
    robot.add(headG);

    var headM = mesh(new T.SphereGeometry(0.42, 32, 24), mBlack.clone());
    headM.scale.set(1, 0.92, 0.88);
    headG.add(headM);

    var visor = new T.Mesh(
      new T.CylinderGeometry(0.435, 0.435, 0.13, 32, 1, true, -PI * 0.55, PI * 1.1),
      new T.MeshStandardMaterial({ color: 0x001020, metalness: 0.1, roughness: 0.04, transparent: true, opacity: 0.88, side: T.FrontSide })
    );
    visor.rotation.x = PI / 2;
    headG.add(visor);

    // Eyes — kept as separate meshes (rather than one) so each can blink
    // independently later if desired, and so the scale-based blink below
    // doesn't distort their horizontal spacing.
    function makeEye(xOff) {
      var g = new T.SphereGeometry(0.056, 16, 8);
      g.scale(2.9, 0.55, 0.5);
      var m = new T.Mesh(g, mEye);
      m.position.set(xOff, 0.04, 0.375);
      return m;
    }
    var leftEye = makeEye(-0.13);
    var rightEye = makeEye(0.13);
    headG.add(leftEye, rightEye);

    // Antenna stem
    var antStem = mesh(new T.CylinderGeometry(0.024, 0.042, 0.24, 8), mBlue.clone());
    antStem.position.set(0, 0.53, 0);
    headG.add(antStem);

    // Antenna tip (pulsing amber)
    var antTipMat = new T.MeshStandardMaterial({ color: 0xfbbf24, emissive: 0xfbbf24, emissiveIntensity: 4.0, roughness: 0.0, metalness: 0.0 });
    var antTip = new T.Mesh(new T.SphereGeometry(0.042, 8, 8), antTipMat);
    antTip.position.set(0, 0.66, 0);
    headG.add(antTip);

    // Neck
    var neck = mesh(new T.CylinderGeometry(0.10, 0.15, 0.24, 16), mDark.clone());
    neck.position.set(0, -0.43, 0);
    headG.add(neck);

    /* UPPER TORSO */
    var torsoG = new T.Group();
    torsoG.position.set(0, 1.1, 0);
    robot.add(torsoG);

    var chest = mesh(new T.BoxGeometry(1.0, 0.84, 0.54), mBlack.clone());
    torsoG.add(chest);

    var panel = new T.Mesh(
      new T.BoxGeometry(0.60, 0.42, 0.04),
      new T.MeshStandardMaterial({ color: 0x080814, metalness: 0.95, roughness: 0.04 })
    );
    panel.position.set(0, 0.06, 0.285);
    torsoG.add(panel);

    var reactor = new T.Mesh(new T.SphereGeometry(0.092, 16, 16), mReact);
    reactor.position.set(0, 0.06, 0.31);
    torsoG.add(reactor);

    var reactRing = new T.Mesh(new T.TorusGeometry(0.135, 0.019, 8, 32), mBlue.clone());
    reactRing.position.set(0, 0.06, 0.30);
    torsoG.add(reactRing);

    // Shoulder pads
    function makeShoulder(side) {
      var sg = new T.Group();
      sg.position.set(side * 0.77, 0.18, 0);
      var pad = mesh(new T.SphereGeometry(0.25, 16, 12), mBlack.clone());
      pad.scale.set(1, 0.70, 0.70);
      sg.add(pad);
      var stripe = new T.Mesh(new T.TorusGeometry(0.21, 0.026, 6, 24, PI), mBlue.clone());
      stripe.rotation.z = PI / 2;
      stripe.position.z = 0.04;
      sg.add(stripe);
      return sg;
    }
    torsoG.add(makeShoulder(-1));
    torsoG.add(makeShoulder(1));

    // Collar
    var collar = mesh(new T.CylinderGeometry(0.17, 0.21, 0.17, 16), mDark.clone());
    collar.position.set(0, 0.49, 0);
    torsoG.add(collar);

    /* ABDOMEN */
    var abdG = new T.Group();
    abdG.position.set(0, 0.72, 0);
    robot.add(abdG);

    abdG.add(mesh(new T.CylinderGeometry(0.37, 0.33, 0.30, 16), mDark.clone()));

    var belt = new T.Mesh(new T.TorusGeometry(0.38, 0.032, 6, 32), mViolet.clone());
    belt.rotation.x = PI / 2;
    belt.position.y = -0.10;
    abdG.add(belt);

    /* HIPS */
    var hips = mesh(new T.BoxGeometry(0.82, 0.25, 0.40), mBlack.clone());
    hips.position.set(0, 0.48, 0);
    robot.add(hips);

    /* ARMS */
    function makeArm(side) {
      var ag = new T.Group();
      ag.position.set(side * 0.76, 1.22, 0);
      ag.rotation.z = side * -0.10;

      var ua = mesh(new T.CapsuleGeometry(0.115, 0.40, 8, 12), mBlack.clone());
      ua.position.set(0, -0.23, 0);
      ag.add(ua);

      var elbow = new T.Mesh(new T.SphereGeometry(0.125, 12, 10), mDark.clone());
      elbow.position.set(0, -0.52, 0);
      ag.add(elbow);

      var fa = mesh(new T.CapsuleGeometry(0.093, 0.36, 8, 12), mBlack.clone());
      fa.position.set(0, -0.80, 0.04);
      ag.add(fa);

      var fring = new T.Mesh(new T.TorusGeometry(0.105, 0.017, 6, 20), mBlue.clone());
      fring.position.set(0, -0.72, 0.04);
      ag.add(fring);

      var hand = mesh(new T.SphereGeometry(0.118, 12, 10), mBlack.clone());
      hand.scale.set(1, 0.76, 0.76);
      hand.position.set(0, -1.07, 0.04);
      ag.add(hand);

      return ag;
    }
    var leftArm = makeArm(-1);
    var rightArm = makeArm(1);
    robot.add(leftArm, rightArm);

    /* LEGS */
    function makeLeg(side) {
      var lg = new T.Group();
      lg.position.set(side * 0.28, 0.38, 0);

      var thigh = mesh(new T.CapsuleGeometry(0.138, 0.40, 8, 12), mBlack.clone());
      thigh.position.y = -0.25;
      lg.add(thigh);

      var knee = new T.Mesh(new T.SphereGeometry(0.145, 12, 10), mDark.clone());
      knee.position.y = -0.54;
      lg.add(knee);

      var shin = mesh(new T.CapsuleGeometry(0.108, 0.40, 8, 12), mBlack.clone());
      shin.position.y = -0.87;
      lg.add(shin);

      var stripe = new T.Mesh(new T.BoxGeometry(0.042, 0.20, 0.15), mViolet.clone());
      stripe.position.set(0, -0.85, 0.12);
      lg.add(stripe);

      var foot = mesh(new T.BoxGeometry(0.23, 0.10, 0.36), mBlack.clone());
      foot.position.set(0.02 * side, -1.20, 0.07);
      lg.add(foot);

      return lg;
    }
    robot.add(makeLeg(-1), makeLeg(1));

    /* Ground contact shadow — scales/fades with bob height as a cheap
       depth cue (a real projected shadow would need a receiving plane
       and cost more, this reads convincingly at this widget's size). */
    var shadowDisc = new T.Mesh(
      new T.CircleGeometry(0.70, 32),
      new T.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false })
    );
    shadowDisc.rotation.x = -PI / 2;
    shadowDisc.position.y = -0.82;
    robot.add(shadowDisc);

    /* ── animation state ─────────────────────────────────── */
    var hRot = { x: 0, y: 0 };
    var tRot = { x: 0, y: 0 };
    var aL = 0, aR = 0, lean = 0;
    var blinkAt = 2 + Math.random() * 3;
    var clock = new T.Clock();
    clock.start();

    /* ── render loop — pauses when widget off-screen or tab hidden ── */
    var robotVisible = true;
    var visibilityObserver = new IntersectionObserver(function (entries) { robotVisible = entries[0].isIntersecting; }, { threshold: 0 });
    visibilityObserver.observe(el);
    document.addEventListener('visibilitychange', function () { robotVisible = !document.hidden; });

    (function loop() {
      requestAnimationFrame(loop);
      if (!robotVisible) return;

      // Clamp dt so a backgrounded tab/GC pause can't make the robot leap
      // to its target instead of easing there.
      var dt = Math.min(clock.getDelta(), 1 / 20);
      var t = clock.getElapsedTime();

      // Idle wander: blends in the longer the cursor stays still or off-window.
      var idleT = pointerInWindow ? (t - lastMoveAt - IDLE_DELAY) : Infinity;
      var idleFactor = clamp(idleT / IDLE_FADE, 0, 1);
      var idleX = Math.sin(t * 0.21) * 0.5 + Math.sin(t * 0.13 + 1.3) * 0.5;
      var idleY = Math.sin(t * 0.17 + 2.1) * 0.4;
      var targetX = mix(mx, idleX, idleFactor);
      var targetY = mix(my, idleY, idleFactor);

      var breathe = Math.sin(t * 0.9) * 0.01;
      robot.position.y = Math.sin(t * 1.18) * 0.013;
      robot.scale.y = 1 + breathe * 0.4;

      hRot.y = damp(hRot.y, targetX * 0.55, 6, dt);
      hRot.x = damp(hRot.x, targetY * 0.30, 6, dt);
      tRot.y = damp(tRot.y, targetX * 0.22, 4, dt);
      tRot.x = damp(tRot.x, targetY * 0.14, 4, dt);
      aL = damp(aL, targetX * 0.12 + targetY * 0.09, 3.5, dt);
      aR = damp(aR, targetX * -0.12 + targetY * 0.09, 3.5, dt);
      var dist = Math.sqrt(targetX * targetX + targetY * targetY);
      lean = damp(lean, (1 - clamp(dist, 0, 1)) * 0.06, 3.5, dt);

      headG.rotation.y = hRot.y + Math.sin(t * 0.72) * 0.008;
      headG.rotation.x = -hRot.x;
      torsoG.rotation.y = tRot.y;
      torsoG.rotation.x = -tRot.x;
      leftArm.rotation.z = 0.10 + aL * 0.5;
      leftArm.rotation.x = aL;
      rightArm.rotation.z = -0.10 + aR * 0.5;
      rightArm.rotation.x = aR;
      robot.rotation.x = lean;

      // Blink — quick eyelid-style scale down/up rather than a linear fade.
      if (t >= blinkAt) {
        var sinceBlink = t - blinkAt;
        var BLINK_DURATION = 0.14;
        if (sinceBlink < BLINK_DURATION) {
          var phase = sinceBlink / BLINK_DURATION; // 0 -> 1
          var closeAmount = Math.sin(phase * PI); // 0 -> 1 -> 0
          var scaleY = 1 - closeAmount * 0.9;
          leftEye.scale.y = scaleY;
          rightEye.scale.y = scaleY;
        } else {
          leftEye.scale.y = rightEye.scale.y = 1;
          blinkAt = t + 2.5 + Math.random() * 3.5;
        }
      }

      var pulse = 0.5 + Math.sin(t * 3.1) * 0.35;
      mReact.emissiveIntensity = 2.8 + pulse;
      chestPointLight.intensity = 2.2 + pulse * 0.6;
      antTipMat.emissiveIntensity = 2.0 + Math.sin(t * 4.2) * 1.0;

      var groundedness = 1 - clamp(Math.abs(robot.position.y) * 4, 0, 0.35);
      shadowDisc.scale.setScalar(groundedness);
      shadowDisc.material.opacity = 0.28 * groundedness;

      renderer.render(scene, camera);
    }());

    /* ── resize ── */
    window.addEventListener('resize', function () {
      CW = el.clientWidth || 340;
      CH = el.clientHeight || 460;
      camera.aspect = CW / CH;
      camera.updateProjectionMatrix();
      renderer.setSize(CW, CH);
    }, { passive: true });
  } /* end initRobot */
}());
