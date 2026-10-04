/**
 * Hero robot widget — a procedural Three.js character that tracks the
 * cursor and fronts the portfolio assistant (see chat.js). Lazy-loaded:
 * Three.js (~600KB) is only fetched on desktop viewports (>=1100px) and
 * only once the widget scrolls into view, so it never costs anything on
 * mobile or below the fold.
 *
 * Look: everything is still built from primitives (no model download),
 * but shaded physically — clear-coated shell panels, brushed-metal
 * joints and a glass visor, all lit by a small procedural "studio"
 * environment so the surfaces have something real to reflect.
 *
 * Motion model: every rotation/position eases toward its target with
 * frame-rate-independent exponential damping (see `damp`) instead of a
 * fixed per-frame multiplier, so it looks the same at 60Hz and 144Hz.
 * When the cursor is idle (or off-window) the head/torso drift through a
 * slow layered-sine "look around" instead of freezing in place, and a
 * light blink/breathing cycle keeps it feeling alive rather than posed.
 *
 * Chat reactions: chat.js dispatches `uk-chat` on <html> with a state
 * (open / thinking / speaking / closed). The robot waves when the panel
 * opens, tilts its head and turns its eyes amber while an answer is
 * being fetched, and animates its mouth while the answer is typed out.
 */
(function () {
  'use strict';
  if (window.innerWidth < 1100) return;
  // CSS already hides #robot-widget under reduced-motion (animations.css),
  // but without this the full Three.js scene would still load and render
  // invisibly — wasted bandwidth, CPU and battery for zero visible result.
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

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

    // Box with rounded edges, built by extruding a rounded rectangle with
    // a bevel. Hard-edged BoxGeometry is the single biggest "this is a
    // primitive" tell: real moulded parts always have a radius that
    // catches a highlight.
    function roundedBox(w, h, d, r) {
      var bevel = Math.min(r, d / 2 - 0.001);
      var iw = w - bevel * 2, ih = h - bevel * 2;
      var cr = Math.max(0.001, r - bevel);
      var x = -iw / 2, y = -ih / 2;
      var s = new T.Shape();
      s.moveTo(x + cr, y);
      s.lineTo(x + iw - cr, y);
      s.quadraticCurveTo(x + iw, y, x + iw, y + cr);
      s.lineTo(x + iw, y + ih - cr);
      s.quadraticCurveTo(x + iw, y + ih, x + iw - cr, y + ih);
      s.lineTo(x + cr, y + ih);
      s.quadraticCurveTo(x, y + ih, x, y + ih - cr);
      s.lineTo(x, y + cr);
      s.quadraticCurveTo(x, y, x + cr, y);
      var g = new T.ExtrudeGeometry(s, {
        depth: d - bevel * 2, bevelEnabled: true, bevelThickness: bevel,
        bevelSize: bevel, bevelSegments: 5, curveSegments: 10,
      });
      g.center();
      return g;
    }

    /* ── container ───────────────────────────────────────── */
    // The canvas goes in its own layer so the launcher buttons that
    // share #robot-widget stay above it and keep their pointer events.
    var el = document.getElementById('robot-canvas') || document.getElementById('robot-widget');
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
    renderer.toneMappingExposure = 1.05;
    renderer.domElement.style.cssText = 'display:block;pointer-events:none;';
    el.appendChild(renderer.domElement);

    /* ── scene / camera ──────────────────────────────────── */
    // A longer lens from further back than before: less perspective
    // distortion, so the proportions read as a product shot rather than
    // a wide-angle toy, and it leaves headroom for the speech bubble.
    var scene = new T.Scene();
    var camera = new T.PerspectiveCamera(36, CW / CH, 0.1, 100);
    camera.position.set(0, 1.16, 7.1);
    camera.lookAt(0, 1.08, 0);

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

    /* ── studio environment ──────────────────────────────── */
    // Glossy and metallic surfaces only look real if they have something
    // to reflect. This builds a tiny virtual photo studio — a dim room
    // with a few bright softboxes — and bakes it into a prefiltered
    // environment map. No HDRI download; it costs one offscreen render.
    try {
      var pmrem = new T.PMREMGenerator(renderer);
      var envScene = new T.Scene();
      envScene.background = new T.Color(0x0b0d16);

      var softbox = function (w, h, color, pos, lookAt) {
        // toneMapped:false + values above 1 so the panels stay "brighter
        // than white" in the HDR bake and produce crisp highlights.
        var m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ color: color, side: T.DoubleSide, toneMapped: false }));
        m.position.set(pos[0], pos[1], pos[2]);
        m.lookAt(lookAt[0], lookAt[1], lookAt[2]);
        envScene.add(m);
      };
      softbox(7, 7, new T.Color(3.4, 3.4, 3.6), [0, 7, 1], [0, 0, 0]);          // overhead key
      softbox(3, 7, new T.Color(4.2, 3.9, 3.6), [-7, 2.5, 3], [0, 1, 0]);       // warm strip, camera left
      softbox(2.5, 6, new T.Color(0.5, 2.6, 3.2), [7, 2, 2], [0, 1, 0]);        // cyan strip, camera right
      softbox(8, 3, new T.Color(2.0, 1.5, 3.6), [0, 3, -7], [0, 1, 0]);         // violet rim, behind
      softbox(9, 5, new T.Color(0.55, 0.6, 0.75), [0, 1, 8], [0, 1, 0]);        // broad dim front fill
      softbox(14, 14, new T.Color(0.16, 0.17, 0.22), [0, -4, 0], [0, 0, 0]);    // floor bounce

      scene.environment = pmrem.fromScene(envScene, 0.035).texture;
      pmrem.dispose();
      envScene.traverse(function (o) { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
    } catch (_) { /* PMREM unsupported on this GPU/driver — materials fall back to direct lighting only */ }

    /* ── lights ──────────────────────────────────────────── */
    // The environment map does most of the shading; these add direction
    // (a key that casts the ground shadow) and the coloured rims that tie
    // the robot to the site's cyan / violet palette.
    scene.add(new T.HemisphereLight(0xdfe6ff, 0x1a1c2a, 0.55));

    var keyLight = new T.DirectionalLight(0xfff4e8, 2.1);
    keyLight.position.set(-1.4, 9, 3.2);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.left = -2.4;
    keyLight.shadow.camera.right = 2.4;
    keyLight.shadow.camera.top = 3.6;
    keyLight.shadow.camera.bottom = -1.6;
    keyLight.shadow.camera.near = 1;
    keyLight.shadow.camera.far = 18;
    keyLight.shadow.bias = -0.0006;
    keyLight.shadow.normalBias = 0.02;
    keyLight.shadow.radius = 5;
    scene.add(keyLight);

    var fillLight = new T.DirectionalLight(0x22d3ee, 0.9);
    fillLight.position.set(4.5, 2.5, 3);
    scene.add(fillLight);

    var rimLight = new T.DirectionalLight(0x8b7cff, 2.4);
    rimLight.position.set(2.5, 4.5, -5);
    scene.add(rimLight);

    var rimLight2 = new T.DirectionalLight(0xffffff, 1.2);
    rimLight2.position.set(-3.5, 3, -4.5);
    scene.add(rimLight2);

    var chestPointLight = new T.PointLight(0x34d399, 1.6, 3.2, 2);
    chestPointLight.position.set(0, 1.18, 0.75);
    scene.add(chestPointLight);

    // Faint glow from the face onto the collar and chest.
    var facePointLight = new T.PointLight(0x22d3ee, 0.9, 1.8, 2);
    facePointLight.position.set(0, 2.0, 0.7);
    scene.add(facePointLight);

    /* ── materials ───────────────────────────────────────── */
    // Shared instances (not clones): fewer shader programs and uniforms
    // to upload, and the theme switch only has to touch a handful.

    // Outer armour: satin automotive paint — a rough-ish base under a
    // glossy clear coat, which is what gives moulded shells their soft
    // body colour with a sharp highlight on top.
    var mShell = new T.MeshPhysicalMaterial({ color: 0xe8ebf3, metalness: 0.08, roughness: 0.42, clearcoat: 1.0, clearcoatRoughness: 0.12, envMapIntensity: 1.0 });
    // Secondary armour panels, darker for a two-tone read.
    var mShellDark = new T.MeshPhysicalMaterial({ color: 0x232838, metalness: 0.55, roughness: 0.36, clearcoat: 0.8, clearcoatRoughness: 0.2, envMapIntensity: 1.1 });
    // Exposed mechanics: machined, slightly brushed metal.
    var mMetal = new T.MeshStandardMaterial({ color: 0x9aa3b5, metalness: 1.0, roughness: 0.28, envMapIntensity: 1.15 });
    var mMetalDark = new T.MeshStandardMaterial({ color: 0x2b303d, metalness: 0.95, roughness: 0.38, envMapIntensity: 1.0 });
    // Flexible bellows at the neck, waist and joints.
    var mRubber = new T.MeshStandardMaterial({ color: 0x0c0e14, metalness: 0.0, roughness: 0.82, envMapIntensity: 0.5 });
    // Visor / chest window: black glass.
    var mGlass = new T.MeshPhysicalMaterial({ color: 0x04060b, metalness: 0.3, roughness: 0.04, clearcoat: 1.0, clearcoatRoughness: 0.02, envMapIntensity: 1.5 });

    // Emissives. toneMapped:false keeps LEDs saturated instead of letting
    // ACES wash bright cyan toward white.
    var mEye = new T.MeshBasicMaterial({ color: 0x4be3ff, toneMapped: false });
    var mMouth = new T.MeshBasicMaterial({ color: 0x4be3ff, toneMapped: false, transparent: true, opacity: 0.9 });
    var mBlue = new T.MeshStandardMaterial({ color: 0x22d3ee, emissive: 0x22d3ee, emissiveIntensity: 1.6, metalness: 0.2, roughness: 0.3 });
    var mViolet = new T.MeshStandardMaterial({ color: 0x8b7cff, emissive: 0x7c6cf7, emissiveIntensity: 1.5, metalness: 0.2, roughness: 0.3 });
    var mReact = new T.MeshStandardMaterial({ color: 0x34d399, emissive: 0x1fd08a, emissiveIntensity: 1.4, roughness: 0.1, metalness: 0.0 });
    var antTipMat = new T.MeshStandardMaterial({ color: 0xfbbf24, emissive: 0xfbbf24, emissiveIntensity: 3.0, roughness: 0.1, metalness: 0.0 });

    var EYE_IDLE = new T.Color(0x4be3ff);
    var EYE_THINK = new T.Color(0xfbbf24);
    var EYE_SPEAK = new T.Color(0x5df2c0);

    /* ── robot root ──────────────────────────────────────── */
    var robot = new T.Group();
    scene.add(robot);

    /* HEAD */
    var headG = new T.Group();
    headG.position.set(0, 2.06, 0);
    robot.add(headG);

    var HEAD_SCALE = [1.06, 0.94, 0.96];

    var skull = mesh(new T.SphereGeometry(0.44, 48, 36), mShell);
    skull.scale.set(HEAD_SCALE[0], HEAD_SCALE[1], HEAD_SCALE[2]);
    headG.add(skull);

    // Visor: a band of black glass sitting just proud of the skull. Cut
    // from the same sphere (phi sweeps around +z, the direction the robot
    // faces) so it follows the head's curvature exactly.
    var visor = new T.Mesh(
      new T.SphereGeometry(0.452, 48, 24, PI / 2 - 1.12, 2.24, 1.02, 0.86),
      mGlass
    );
    visor.scale.set(HEAD_SCALE[0], HEAD_SCALE[1], HEAD_SCALE[2]);
    headG.add(visor);

    // Thin metal bezel framing the visor's top and bottom edges.
    function visorTrim(theta) {
      var r = 0.455 * Math.sin(theta);
      var trim = new T.Mesh(new T.TorusGeometry(r, 0.008, 8, 48, 2.3), mMetal);
      trim.rotation.x = PI / 2;
      trim.rotation.z = -(PI / 2 + 1.15);
      trim.position.y = 0.455 * Math.cos(theta) * HEAD_SCALE[1];
      trim.scale.set(HEAD_SCALE[0], HEAD_SCALE[2], 1);
      return trim;
    }
    headG.add(visorTrim(1.02), visorTrim(1.88));

    // Eyes — separate meshes so the scale-based blink below doesn't
    // distort their horizontal spacing. Each sits on the visor surface,
    // rotated to face outward along the head's curve.
    function makeEye(side) {
      var g = new T.Group();
      var lens = new T.Mesh(new T.CapsuleGeometry(0.036, 0.075, 6, 16), mEye);
      lens.rotation.z = PI / 2;
      lens.scale.z = 0.35;
      g.add(lens);
      g.position.set(side * 0.155, 0.035, 0.418);
      g.rotation.y = side * 0.34;
      return g;
    }
    var leftEye = makeEye(-1);
    var rightEye = makeEye(1);
    headG.add(leftEye, rightEye);

    // Mouth: a row of LED bars on the visor. Flat line at rest; they
    // become an equaliser while the assistant "speaks".
    var mouthBars = [];
    var mouthG = new T.Group();
    mouthG.position.set(0, -0.125, 0.442);
    for (var mb = 0; mb < 5; mb++) {
      var bar = new T.Mesh(new T.BoxGeometry(0.02, 0.012, 0.006), mMouth);
      bar.position.x = (mb - 2) * 0.034;
      // Follow the visor's curvature so the outer bars don't float.
      bar.position.z = -Math.abs(mb - 2) * 0.006;
      mouthBars.push(bar);
      mouthG.add(bar);
    }
    headG.add(mouthG);

    // Ear pods: machined caps with a glowing ring.
    function makeEar(side) {
      var g = new T.Group();
      g.position.set(side * 0.455, 0, 0);
      g.rotation.z = side * -PI / 2;
      var pod = mesh(new T.CylinderGeometry(0.115, 0.135, 0.07, 32), mMetalDark);
      g.add(pod);
      var cap = mesh(new T.CylinderGeometry(0.07, 0.085, 0.04, 32), mMetal);
      cap.position.y = 0.05;
      g.add(cap);
      var ring = new T.Mesh(new T.TorusGeometry(0.1, 0.01, 8, 40), mBlue);
      ring.rotation.x = PI / 2;
      ring.position.y = 0.036;
      g.add(ring);
      return g;
    }
    headG.add(makeEar(-1), makeEar(1));

    // Antenna: base collar, slim mast, glowing tip.
    var antBase = mesh(new T.CylinderGeometry(0.045, 0.062, 0.05, 20), mMetalDark);
    antBase.position.set(0, 0.425, 0);
    headG.add(antBase);
    var antStem = mesh(new T.CylinderGeometry(0.012, 0.018, 0.24, 12), mMetal);
    antStem.position.set(0, 0.56, 0);
    headG.add(antStem);
    var antTip = new T.Mesh(new T.SphereGeometry(0.04, 20, 16), antTipMat);
    antTip.position.set(0, 0.7, 0);
    headG.add(antTip);

    // Neck: a metal core inside a stack of rubber bellows rings.
    var neckCore = mesh(new T.CylinderGeometry(0.1, 0.12, 0.3, 20), mMetalDark);
    neckCore.position.set(0, -0.48, 0);
    headG.add(neckCore);
    for (var nr = 0; nr < 3; nr++) {
      var neckRing = mesh(new T.TorusGeometry(0.125 + nr * 0.012, 0.03, 10, 28), mRubber);
      neckRing.rotation.x = PI / 2;
      neckRing.position.set(0, -0.41 - nr * 0.065, 0);
      headG.add(neckRing);
    }

    /* UPPER TORSO */
    var torsoG = new T.Group();
    torsoG.position.set(0, 1.1, 0);
    robot.add(torsoG);

    var chest = mesh(roundedBox(1.04, 0.86, 0.6, 0.2), mShell);
    torsoG.add(chest);

    // Darker flank panels break up the chest into separate plates.
    function makeFlank(side) {
      var p = mesh(roundedBox(0.12, 0.6, 0.5, 0.05), mShellDark);
      p.position.set(side * 0.5, -0.04, 0);
      return p;
    }
    torsoG.add(makeFlank(-1), makeFlank(1));

    // Recessed glass window housing the reactor.
    var panel = new T.Mesh(roundedBox(0.6, 0.42, 0.05, 0.09), mGlass);
    panel.position.set(0, 0.07, 0.288);
    torsoG.add(panel);

    var panelFrame = new T.Mesh(roundedBox(0.66, 0.48, 0.03, 0.11), mMetalDark);
    panelFrame.position.set(0, 0.07, 0.282);
    torsoG.add(panelFrame);

    var reactor = new T.Mesh(new T.SphereGeometry(0.085, 24, 20), mReact);
    reactor.scale.z = 0.45;
    reactor.position.set(0, 0.07, 0.318);
    torsoG.add(reactor);

    var reactBezel = new T.Mesh(new T.TorusGeometry(0.118, 0.016, 10, 40), mMetal);
    reactBezel.position.set(0, 0.07, 0.318);
    torsoG.add(reactBezel);

    var reactRing = new T.Mesh(new T.TorusGeometry(0.158, 0.008, 8, 48), mBlue);
    reactRing.position.set(0, 0.07, 0.316);
    torsoG.add(reactRing);

    // Status LEDs in the window's corner.
    var statusLeds = [];
    for (var sl = 0; sl < 3; sl++) {
      var led = new T.Mesh(new T.CircleGeometry(0.011, 12), new T.MeshBasicMaterial({ color: 0x4be3ff, toneMapped: false, transparent: true }));
      led.position.set(0.17 + sl * 0.035, -0.08, 0.3145);
      statusLeds.push(led);
      torsoG.add(led);
    }

    // Lower chest vent slats.
    for (var vs = 0; vs < 3; vs++) {
      var slat = new T.Mesh(roundedBox(0.3, 0.018, 0.02, 0.008), mMetalDark);
      slat.position.set(0, -0.25 - vs * 0.04, 0.297);
      torsoG.add(slat);
    }

    // Collar ring where the neck bellows meet the chest.
    var collar = mesh(new T.CylinderGeometry(0.2, 0.25, 0.1, 28), mMetalDark);
    collar.position.set(0, 0.46, 0);
    torsoG.add(collar);
    var collarRing = new T.Mesh(new T.TorusGeometry(0.205, 0.012, 8, 40), mMetal);
    collarRing.rotation.x = PI / 2;
    collarRing.position.set(0, 0.51, 0);
    torsoG.add(collarRing);

    // Shoulders: a metal ball joint under a shell pauldron.
    function makeShoulder(side) {
      var sg = new T.Group();
      sg.position.set(side * 0.62, 0.22, 0);
      var joint = mesh(new T.SphereGeometry(0.17, 24, 18), mMetal);
      sg.add(joint);
      var pad = mesh(new T.SphereGeometry(0.235, 32, 16, 0, PI * 2, 0, PI * 0.56), mShell);
      pad.scale.set(1.05, 0.9, 1.0);
      pad.position.set(side * 0.03, 0.03, 0);
      pad.rotation.z = side * -0.38;
      sg.add(pad);
      var stripe = new T.Mesh(new T.TorusGeometry(0.2, 0.011, 8, 32, PI), mBlue);
      stripe.rotation.y = PI / 2;
      stripe.rotation.x = side * -0.38;
      stripe.position.set(side * 0.03, 0.035, 0);
      sg.add(stripe);
      return sg;
    }
    torsoG.add(makeShoulder(-1), makeShoulder(1));

    /* ABDOMEN — segmented bellows so the waist reads as flexible */
    var abdG = new T.Group();
    abdG.position.set(0, 0.6, 0);
    robot.add(abdG);

    abdG.add(mesh(new T.CylinderGeometry(0.27, 0.3, 0.26, 24), mMetalDark));
    for (var ar = 0; ar < 3; ar++) {
      var seg = mesh(new T.TorusGeometry(0.31 + (ar === 1 ? 0.01 : 0), 0.05, 12, 36), mRubber);
      seg.rotation.x = PI / 2;
      seg.scale.set(1, 0.78, 1);
      seg.position.y = 0.085 - ar * 0.085;
      abdG.add(seg);
    }

    /* HIPS */
    var hips = mesh(roundedBox(0.84, 0.26, 0.46, 0.1), mShell);
    hips.position.set(0, 0.4, 0);
    robot.add(hips);

    var belt = new T.Mesh(roundedBox(0.86, 0.035, 0.475, 0.012), mViolet);
    belt.position.set(0, 0.49, 0);
    robot.add(belt);

    var pelvis = mesh(roundedBox(0.3, 0.2, 0.4, 0.07), mShellDark);
    pelvis.position.set(0, 0.3, 0.02);
    robot.add(pelvis);

    /* ARMS — shoulder pivot → upper arm → elbow pivot → forearm → hand.
       Two real pivots per arm so it can raise and wave, not just swing. */
    function makeArm(side) {
      var ag = new T.Group();
      ag.position.set(side * 0.66, 1.3, 0);

      var ua = mesh(new T.CapsuleGeometry(0.105, 0.3, 8, 20), mShell);
      ua.position.set(side * 0.06, -0.3, 0);
      ag.add(ua);

      var elbowG = new T.Group();
      elbowG.position.set(side * 0.06, -0.56, 0);
      ag.add(elbowG);

      var elbow = mesh(new T.SphereGeometry(0.105, 20, 16), mMetal);
      elbowG.add(elbow);
      var elbowCap = mesh(new T.CylinderGeometry(0.06, 0.06, 0.225, 20), mMetalDark);
      elbowCap.rotation.x = PI / 2;
      elbowG.add(elbowCap);

      // Forearm flares toward the wrist like a gauntlet.
      var fa = mesh(new T.CylinderGeometry(0.085, 0.112, 0.36, 24), mShell);
      fa.position.set(0, -0.26, 0);
      elbowG.add(fa);
      var faTop = mesh(new T.SphereGeometry(0.085, 20, 12, 0, PI * 2, 0, PI / 2), mShell);
      faTop.position.set(0, -0.08, 0);
      elbowG.add(faTop);

      var cuff = new T.Mesh(new T.TorusGeometry(0.113, 0.012, 8, 32), mBlue);
      cuff.rotation.x = PI / 2;
      cuff.position.set(0, -0.4, 0);
      elbowG.add(cuff);

      var wrist = mesh(new T.CylinderGeometry(0.06, 0.07, 0.07, 18), mMetalDark);
      wrist.position.set(0, -0.475, 0);
      elbowG.add(wrist);

      // Hand: palm plus three fingers and a thumb, slightly curled.
      var hand = new T.Group();
      hand.position.set(0, -0.56, 0);
      elbowG.add(hand);

      var palm = mesh(roundedBox(0.15, 0.13, 0.085, 0.035), mShellDark);
      palm.position.y = -0.02;
      hand.add(palm);

      for (var f = -1; f <= 1; f++) {
        var finger = mesh(new T.CapsuleGeometry(0.02, 0.075, 4, 10), mMetalDark);
        finger.position.set(f * 0.045, -0.135, 0.012);
        finger.rotation.x = -0.22;
        hand.add(finger);
      }
      var thumb = mesh(new T.CapsuleGeometry(0.021, 0.055, 4, 10), mMetalDark);
      thumb.position.set(side * -0.085, -0.05, 0.03);
      thumb.rotation.z = side * -0.7;
      hand.add(thumb);

      ag.userData.elbow = elbowG;
      ag.userData.hand = hand;
      return ag;
    }
    var leftArm = makeArm(-1);
    var rightArm = makeArm(1);
    robot.add(leftArm, rightArm);

    /* LEGS */
    function makeLeg(side) {
      var lg = new T.Group();
      lg.position.set(side * 0.24, 0.28, 0);

      var hipJoint = mesh(new T.SphereGeometry(0.135, 20, 16), mMetal);
      lg.add(hipJoint);

      var thigh = mesh(new T.CapsuleGeometry(0.135, 0.3, 8, 20), mShell);
      thigh.position.y = -0.27;
      lg.add(thigh);

      var knee = mesh(new T.SphereGeometry(0.115, 20, 16), mMetal);
      knee.position.y = -0.54;
      lg.add(knee);
      var kneeCap = mesh(roundedBox(0.17, 0.15, 0.08, 0.035), mShellDark);
      kneeCap.position.set(0, -0.54, 0.105);
      lg.add(kneeCap);

      // Shin widens toward the ankle, like a boot.
      var shin = mesh(new T.CylinderGeometry(0.1, 0.135, 0.42, 24), mShell);
      shin.position.y = -0.82;
      lg.add(shin);
      var shinTop = mesh(new T.SphereGeometry(0.1, 20, 12, 0, PI * 2, 0, PI / 2), mShell);
      shinTop.position.y = -0.61;
      lg.add(shinTop);

      var stripe = new T.Mesh(roundedBox(0.03, 0.2, 0.02, 0.009), mViolet);
      stripe.position.set(0, -0.82, 0.125);
      stripe.rotation.x = 0.083;
      lg.add(stripe);

      var ankle = mesh(new T.CylinderGeometry(0.085, 0.085, 0.06, 18), mMetalDark);
      ankle.position.y = -1.06;
      lg.add(ankle);

      var foot = mesh(roundedBox(0.25, 0.11, 0.42, 0.05), mShell);
      foot.position.set(side * 0.01, -1.135, 0.07);
      lg.add(foot);
      var sole = mesh(roundedBox(0.26, 0.035, 0.43, 0.015), mRubber);
      sole.position.set(side * 0.01, -1.19, 0.07);
      lg.add(sole);

      return lg;
    }
    robot.add(makeLeg(-1), makeLeg(1));

    /* GROUND — three stacked cues that together sell "standing on
       something": a real cast shadow from the key light, a soft contact
       blob directly under the feet (ambient occlusion the shadow map
       can't provide), and a faint projector ring. */
    var GROUND_Y = -0.93;

    var shadowCatcher = new T.Mesh(new T.PlaneGeometry(7, 7), new T.ShadowMaterial({ opacity: 0.26 }));
    shadowCatcher.rotation.x = -PI / 2;
    shadowCatcher.position.y = GROUND_Y;
    shadowCatcher.receiveShadow = true;
    scene.add(shadowCatcher);

    function radialTexture(stops) {
      var c = document.createElement('canvas');
      c.width = c.height = 128;
      var ctx = c.getContext('2d');
      var grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
      stops.forEach(function (s) { grad.addColorStop(s[0], s[1]); });
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 128, 128);
      var tex = new T.CanvasTexture(c);
      tex.colorSpace = T.SRGBColorSpace;
      return tex;
    }

    var shadowDisc = new T.Mesh(
      new T.PlaneGeometry(2.1, 2.1),
      new T.MeshBasicMaterial({
        map: radialTexture([[0, 'rgba(0,0,0,0.55)'], [0.45, 'rgba(0,0,0,0.22)'], [1, 'rgba(0,0,0,0)']]),
        transparent: true, opacity: 0.6, depthWrite: false,
      })
    );
    shadowDisc.rotation.x = -PI / 2;
    shadowDisc.scale.y = 0.62; // shallower front-to-back: feet are side by side
    shadowDisc.position.y = GROUND_Y + 0.004;
    scene.add(shadowDisc);

    var padRing = new T.Mesh(
      new T.RingGeometry(0.86, 0.885, 96),
      new T.MeshBasicMaterial({ color: 0x4be3ff, transparent: true, opacity: 0.4, toneMapped: false, depthWrite: false, side: T.DoubleSide })
    );
    padRing.rotation.x = -PI / 2;
    padRing.position.y = GROUND_Y + 0.006;
    scene.add(padRing);

    var padGlow = new T.Mesh(
      new T.PlaneGeometry(2.6, 2.6),
      new T.MeshBasicMaterial({
        map: radialTexture([[0, 'rgba(75,227,255,0)'], [0.55, 'rgba(75,227,255,0.10)'], [0.68, 'rgba(124,108,247,0.20)'], [0.8, 'rgba(124,108,247,0)'], [1, 'rgba(0,0,0,0)']]),
        transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false,
      })
    );
    padGlow.rotation.x = -PI / 2;
    padGlow.position.y = GROUND_Y + 0.002;
    scene.add(padGlow);

    /* ── theme ───────────────────────────────────────────── */
    // Same robot, relit per theme. On the light page it needs a firm
    // ground shadow and restrained glow; on the dark page shadows are
    // invisible anyway, so the rims and the projector ring do the work
    // of separating it from the background.
    function applyTheme() {
      var dark = document.documentElement.getAttribute('data-theme') === 'dark';
      renderer.toneMappingExposure = dark ? 1.12 : 1.02;
      shadowCatcher.material.opacity = dark ? 0.5 : 0.2;
      shadowDisc.material.opacity = dark ? 0.75 : 0.55;
      padRing.userData.base = dark ? 0.75 : 0.42;
      padRing.material.opacity = padRing.userData.base;
      padGlow.material.opacity = dark ? 1.0 : 0.55;
      rimLight.intensity = dark ? 3.2 : 2.0;
      rimLight2.intensity = dark ? 1.8 : 1.0;
      // A slightly cooler, dimmer shell on dark keeps it from blowing out
      // against a near-black page.
      mShell.color.set(dark ? 0xd3d8e6 : 0xeceff6);
      mShell.envMapIntensity = dark ? 0.85 : 1.0;
    }
    applyTheme();
    document.documentElement.addEventListener('uk-themechange', applyTheme);
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
