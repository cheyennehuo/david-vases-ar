// Helmet exploded-view tuning. Coordinates are relative to the target width.
// Fragment order: crown, face guard, left cheek guard, right cheek guard.
const HELMET_ANIMATION = {
  initialHold: 500,
  highlightDuration: 180,
  explodeDuration: 700,
  explodedHold: 1500,
  returnDuration: 800,
  loopHold: 500,
  highlightScale: 1.035,
  highlightColor: "#ffe08a",
  fragments: [
    { x: 0.00, y: 0.22, z: 0.06, baseZ: 0.020 },
    { x: 0.00, y: -0.18, z: 0.10, baseZ: 0.021 },
    { x: -0.20, y: -0.08, z: 0.07, baseZ: 0.022 },
    { x: 0.20, y: -0.08, z: 0.08, baseZ: 0.023 },
  ],
};

// Geometry and motion values carried over from the standalone prototype.
// Material values are intentionally AR-specific: WebAR's transparent canvas
// cannot provide the camera video as a transmission/refraction buffer.
const DICE_CONFIG = {
  rollDuration: 1650,
  bounceHeight: 0.16,
  shellOpacity: 0.5,
  innerOpacity: 0.11,
  edgeOpacity: 0.2,
  roughness: 0.11,
  rotationSpeed: { xTurns: 3, yTurns: 4, zTurns: 3 },
  cornerRadius: 0.16,
  cornerSegments: 8,
  arScale: 0.45,
  overlayY: -0.25,
  idleRotation: {
    x: 25 * Math.PI / 180,
    y: 45 * Math.PI / 180,
    z: 0,
  },
  entranceDuration: 620,
};

// Procedural Web Audio controls. All levels are intentionally conservative.
const DICE_SOUND_CONFIG = {
  enabled: true,
  masterVolume: 0.12,
  impactCount: 7,
  finalImpactVolume: 0.72,
  soundDuration: 1.48,
};

let diceAudioContext;
let diceNoiseBuffer;

const getDiceAudioContext = () => {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return undefined;
  if (!diceAudioContext) diceAudioContext = new AudioContextClass();
  if (diceAudioContext.state === "suspended") diceAudioContext.resume();
  return diceAudioContext;
};

const getDiceNoiseBuffer = (audioContext) => {
  if (diceNoiseBuffer) return diceNoiseBuffer;
  const length = Math.ceil(audioContext.sampleRate * 0.07);
  diceNoiseBuffer = audioContext.createBuffer(1, length, audioContext.sampleRate);
  const samples = diceNoiseBuffer.getChannelData(0);
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = Math.random() * 2 - 1;
  }
  return diceNoiseBuffer;
};

const scheduleCrystalImpact = (audioContext, output, time, strength, finalImpact = false) => {
  const decay = finalImpact ? 0.085 : 0.045 + Math.random() * 0.018;

  const tone = audioContext.createOscillator();
  const toneGain = audioContext.createGain();
  tone.type = "sine";
  tone.frequency.setValueAtTime(
    (finalImpact ? 1550 : 1850) + Math.random() * 650,
    time
  );
  tone.frequency.exponentialRampToValueAtTime(
    (finalImpact ? 1050 : 1350) + Math.random() * 350,
    time + decay
  );
  toneGain.gain.setValueAtTime(Math.max(0.0001, strength * 0.34), time);
  toneGain.gain.exponentialRampToValueAtTime(0.0001, time + decay);
  tone.connect(toneGain).connect(output);
  tone.start(time);
  tone.stop(time + decay + 0.01);

  const noise = audioContext.createBufferSource();
  const noiseFilter = audioContext.createBiquadFilter();
  const noiseGain = audioContext.createGain();
  noise.buffer = getDiceNoiseBuffer(audioContext);
  noiseFilter.type = "bandpass";
  noiseFilter.frequency.setValueAtTime(2600 + Math.random() * 1500, time);
  noiseFilter.Q.setValueAtTime(finalImpact ? 1.1 : 1.5, time);
  noiseGain.gain.setValueAtTime(Math.max(0.0001, strength * 0.22), time);
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, time + decay * 0.72);
  noise.connect(noiseFilter).connect(noiseGain).connect(output);
  noise.start(time, Math.random() * 0.01);
  noise.stop(time + decay);
};

const playDiceRollSound = () => {
  if (!DICE_SOUND_CONFIG.enabled) return;
  const audioContext = getDiceAudioContext();
  if (!audioContext) return;

  const master = audioContext.createGain();
  master.gain.setValueAtTime(DICE_SOUND_CONFIG.masterVolume, audioContext.currentTime);
  master.connect(audioContext.destination);

  const start = audioContext.currentTime + 0.015;
  const rollingEnd = DICE_SOUND_CONFIG.soundDuration - 0.13;
  for (let index = 0; index < DICE_SOUND_CONFIG.impactCount; index += 1) {
    const progress = (index + 1) / (DICE_SOUND_CONFIG.impactCount + 1);
    const slowingTime = Math.pow(progress, 1.62) * rollingEnd;
    const irregularity = (Math.random() - 0.5) * 0.035;
    const strength = 0.28 + Math.random() * 0.18 - progress * 0.055;
    scheduleCrystalImpact(
      audioContext,
      master,
      start + Math.max(0, slowingTime + irregularity),
      strength
    );
  }

  scheduleCrystalImpact(
    audioContext,
    master,
    start + DICE_SOUND_CONFIG.soundDuration - 0.06,
    DICE_SOUND_CONFIG.finalImpactVolume,
    true
  );
  window.setTimeout(() => master.disconnect(), (DICE_SOUND_CONFIG.soundDuration + 0.3) * 1000);
};

document.addEventListener("DOMContentLoaded", () => {
  const target = document.querySelector("#david-target");
  const helmetTarget = document.querySelector("#helmet-target");
  const diceTarget = document.querySelector("#dice-target");
  const diceOverlayCanvas = document.querySelector("#dice-overlay-canvas");
  const helmetFragments = Array.from(document.querySelectorAll(".helmet-fragment"));
  const highlight = document.querySelector("#inscription-highlight");
  const panel = document.querySelector("#info-panel");
  const status = document.querySelector("#status");
  const diceUi = document.querySelector("#dice-ui");
  const diceResult = document.querySelector("#dice-result");
  const dicePrompt = document.querySelector("#dice-prompt");
  let panelTimer;
  let helmetAnimationFrame;
  let helmetStartTime;
  let davidVisible = false;
  let helmetVisible = false;
  let diceVisible = false;

  const easeInOutCubic = (value) =>
    value < 0.5
      ? 4 * value * value * value
      : 1 - Math.pow(-2 * value + 2, 3) / 2;

  const clamp01 = (value) => Math.min(1, Math.max(0, value));

  const updateStatus = () => {
    if (diceVisible) {
      status.textContent = "Dice found";
    } else if (davidVisible && helmetVisible) {
      status.textContent = "David Vases and Helmet found";
    } else if (davidVisible) {
      status.textContent = "Target found";
    } else if (helmetVisible) {
      status.textContent = "Helmet found";
    } else {
      status.textContent = "Point the camera at a museum target";
    }
  };

  const setFragmentAppearance = (fragment, scale, highlighted) => {
    fragment.object3D.scale.setScalar(scale);
    const mesh = fragment.getObject3D("mesh");
    if (!mesh || !mesh.material) return;

    mesh.material.color.set(highlighted ? HELMET_ANIMATION.highlightColor : "#ffffff");
    mesh.material.opacity = highlighted ? 0.92 : 1;
  };

  const resetHelmet = () => {
    window.cancelAnimationFrame(helmetAnimationFrame);
    helmetAnimationFrame = undefined;
    helmetStartTime = undefined;

    helmetFragments.forEach((fragment, index) => {
      fragment.object3D.position.set(0, 0, HELMET_ANIMATION.fragments[index].baseZ);
      setFragmentAppearance(fragment, 1, false);
    });
  };

  const createRoundedBoxGeometry = (width, height, depth, segments, radius) => {
    const source = new THREE.BoxGeometry(width, height, depth, segments, segments, segments);
    const sourcePosition = source.getAttribute("position");
    const half = new THREE.Vector3(width / 2, height / 2, depth / 2);
    const inner = half.clone().subScalar(radius);
    const point = new THREE.Vector3();
    const corner = new THREE.Vector3();

    for (let index = 0; index < sourcePosition.count; index += 1) {
      point.fromBufferAttribute(sourcePosition, index);
      corner.set(
        THREE.MathUtils.clamp(point.x, -inner.x, inner.x),
        THREE.MathUtils.clamp(point.y, -inner.y, inner.y),
        THREE.MathUtils.clamp(point.z, -inner.z, inner.z)
      );
      point.sub(corner).normalize().multiplyScalar(radius).add(corner);
      sourcePosition.setXYZ(index, point.x, point.y, point.z);
    }

    // Weld coincident BoxGeometry vertices so normals remain smooth around corners.
    const positions = [];
    const indices = [];
    const vertexMap = new Map();
    const sourceIndex = source.getIndex();
    const count = sourceIndex ? sourceIndex.count : sourcePosition.count;
    for (let index = 0; index < count; index += 1) {
      const oldIndex = sourceIndex ? sourceIndex.getX(index) : index;
      point.fromBufferAttribute(sourcePosition, oldIndex);
      const key = `${Math.round(point.x * 1e5)},${Math.round(point.y * 1e5)},${Math.round(point.z * 1e5)}`;
      let newIndex = vertexMap.get(key);
      if (newIndex === undefined) {
        newIndex = positions.length / 3;
        vertexMap.set(key, newIndex);
        positions.push(point.x, point.y, point.z);
      }
      indices.push(newIndex);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    source.dispose();
    return geometry;
  };

  const diceOverlayRenderer = new THREE.WebGLRenderer({
    canvas: diceOverlayCanvas,
    alpha: true,
    antialias: true,
  });
  diceOverlayRenderer.setClearColor(0x000000, 0);
  diceOverlayRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const diceOverlayScene = new THREE.Scene();
  const diceOverlayCamera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  diceOverlayCamera.position.set(0, 0, 5);
  diceOverlayCamera.lookAt(0, 0, 0);

  diceOverlayScene.add(new THREE.HemisphereLight(0xeaf8ff, 0x243038, 1.8));
  const diceKeyLight = new THREE.DirectionalLight(0xffffff, 2.4);
  diceKeyLight.position.set(-3, 5, 5);
  diceOverlayScene.add(diceKeyLight);
  const diceRimLight = new THREE.DirectionalLight(0x9edfff, 1.5);
  diceRimLight.position.set(4, 1, -2);
  diceOverlayScene.add(diceRimLight);

  const resizeDiceOverlay = () => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    diceOverlayRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    diceOverlayRenderer.setSize(width, height, false);
    diceOverlayCamera.aspect = width / height;
    diceOverlayCamera.updateProjectionMatrix();
  };
  resizeDiceOverlay();
  window.addEventListener("resize", resizeDiceOverlay);
  window.addEventListener("orientationchange", resizeDiceOverlay);

  const dice = new THREE.Group();
  dice.position.set(0, DICE_CONFIG.overlayY, 0);
  diceOverlayScene.add(dice);

  const bodyGeometry = createRoundedBoxGeometry(
    2,
    2,
    2,
    DICE_CONFIG.cornerSegments,
    DICE_CONFIG.cornerRadius
  );
  const bodyMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xe6f4f6,
    emissive: 0x101719,
    emissiveIntensity: 0.12,
    transparent: true,
    opacity: DICE_CONFIG.shellOpacity,
    transmission: 0,
    metalness: 0,
    roughness: DICE_CONFIG.roughness,
    clearcoat: 1,
    clearcoatRoughness: 0.07,
    reflectivity: 1,
    side: THREE.DoubleSide,
    depthTest: true,
    depthWrite: false,
  });
  const diceBody = new THREE.Mesh(bodyGeometry, bodyMaterial);
  diceBody.visible = true;
  diceBody.renderOrder = 1;
  dice.add(diceBody);

  const innerCrystalMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xbadadd,
    emissive: 0x10191b,
    emissiveIntensity: 0.1,
    roughness: 0.18,
    metalness: 0,
    transmission: 0,
    transparent: true,
    opacity: DICE_CONFIG.innerOpacity,
    depthTest: true,
    depthWrite: false,
    side: THREE.BackSide,
  });
  const innerCrystal = new THREE.Mesh(bodyGeometry, innerCrystalMaterial);
  innerCrystal.scale.setScalar(0.955);
  innerCrystal.renderOrder = 0;
  innerCrystal.visible = true;
  dice.add(innerCrystal);

  const edgeHighlightMaterial = new THREE.ShaderMaterial({
    uniforms: {
      edgeColor: { value: new THREE.Color(0xdffaff) },
      edgeOpacity: { value: 0 },
    },
    vertexShader: `
      varying vec3 vViewNormal;
      varying vec3 vViewPosition;
      void main() {
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        vViewPosition = viewPosition.xyz;
        vViewNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * viewPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 edgeColor;
      uniform float edgeOpacity;
      varying vec3 vViewNormal;
      varying vec3 vViewPosition;
      void main() {
        vec3 viewDirection = normalize(-vViewPosition);
        float fresnel = pow(1.0 - abs(dot(normalize(vViewNormal), viewDirection)), 2.35);
        gl_FragColor = vec4(edgeColor, fresnel * edgeOpacity);
      }
    `,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
  });
  const edgeHighlight = new THREE.Mesh(bodyGeometry, edgeHighlightMaterial);
  edgeHighlight.scale.setScalar(1.018);
  edgeHighlight.renderOrder = 2;
  dice.add(edgeHighlight);

  const pipLayouts = {
    1: [[0, 0]],
    2: [[-1, 1], [1, -1]],
    3: [[-1, 1], [0, 0], [1, -1]],
    4: [[-1, 1], [1, 1], [-1, -1], [1, -1]],
    5: [[-1, 1], [1, 1], [0, 0], [-1, -1], [1, -1]],
    6: [[-1, 1], [1, 1], [-1, 0], [1, 0], [-1, -1], [1, -1]],
  };

  const makeEngravingTexture = (value) => {
    const size = 512;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");
    for (const [u, v] of pipLayouts[value]) {
      const x = size / 2 + u * 120;
      const y = size / 2 - v * 120;
      context.strokeStyle = "rgba(236, 245, 245, 0.48)";
      context.lineWidth = 6;
      context.beginPath();
      context.arc(x - 2, y - 2, 38, 0, Math.PI * 2);
      context.stroke();
      context.strokeStyle = "rgba(46, 54, 57, 0.62)";
      context.lineWidth = 5;
      context.beginPath();
      context.arc(x + 2, y + 2, 38, 0, Math.PI * 2);
      context.stroke();
      const groove = context.createRadialGradient(x - 2, y - 2, 1, x, y, 11);
      groove.addColorStop(0, "rgba(40, 48, 51, 0.68)");
      groove.addColorStop(0.55, "rgba(67, 75, 77, 0.55)");
      groove.addColorStop(0.78, "rgba(231, 240, 240, 0.42)");
      groove.addColorStop(1, "rgba(42, 50, 53, 0.28)");
      context.fillStyle = groove;
      context.beginPath();
      context.arc(x, y, 11, 0, Math.PI * 2);
      context.fill();
    }
    const texture = new THREE.CanvasTexture(canvas);
    if ("colorSpace" in texture && THREE.SRGBColorSpace) texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    return texture;
  };

  const engravingFaces = [];
  const addFace = (value, position, rotation, normal) => {
    const material = new THREE.MeshPhysicalMaterial({
      map: makeEngravingTexture(value),
      color: 0xc4cbcb,
      transparent: true,
      opacity: 0.72,
      roughness: 0.34,
      metalness: 0,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      side: THREE.DoubleSide,
    });
    const engraving = new THREE.Mesh(new THREE.PlaneGeometry(1.72, 1.72), material);
    engraving.renderOrder = 3;
    engraving.position.copy(position);
    engraving.rotation.copy(rotation);
    dice.add(engraving);
    engravingFaces.push({ material, normal: normal.clone() });
  };

  addFace(4, new THREE.Vector3(0, 1.006, 0), new THREE.Euler(-Math.PI / 2, 0, 0), new THREE.Vector3(0, 1, 0));
  addFace(3, new THREE.Vector3(0, -1.006, 0), new THREE.Euler(Math.PI / 2, 0, 0), new THREE.Vector3(0, -1, 0));
  addFace(6, new THREE.Vector3(-1.006, 0, 0), new THREE.Euler(0, -Math.PI / 2, 0), new THREE.Vector3(-1, 0, 0));
  addFace(1, new THREE.Vector3(1.006, 0, 0), new THREE.Euler(0, Math.PI / 2, 0), new THREE.Vector3(1, 0, 0));
  addFace(2, new THREE.Vector3(0, 0, 1.006), new THREE.Euler(0, 0, 0), new THREE.Vector3(0, 0, 1));
  addFace(5, new THREE.Vector3(0, 0, -1.006), new THREE.Euler(0, Math.PI, 0), new THREE.Vector3(0, 0, -1));

  const faceNormals = {
    1: new THREE.Vector3(1, 0, 0), 2: new THREE.Vector3(0, 0, 1),
    3: new THREE.Vector3(0, -1, 0), 4: new THREE.Vector3(0, 1, 0),
    5: new THREE.Vector3(0, 0, -1), 6: new THREE.Vector3(-1, 0, 0),
  };
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const worldNormal = new THREE.Vector3();
  const cameraDirection = new THREE.Vector3();
  const cameraWorldPosition = new THREE.Vector3();
  const diceWorldPosition = new THREE.Vector3();
  const diceWorldQuaternion = new THREE.Quaternion();
  let diceRolling = false;
  let diceReady = false;
  let entranceOpacity = 0;
  let diceAnimationFrame;

  const easeOutQuint = (value) => 1 - Math.pow(1 - value, 5);
  const presentationQuaternion = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(
      DICE_CONFIG.idleRotation.x,
      DICE_CONFIG.idleRotation.y,
      DICE_CONFIG.idleRotation.z,
      "XYZ"
    )
  );
  const presentationTop = new THREE.Vector3(0, 1, 0);
  const resultPresentationQuaternions = {};
  for (let value = 1; value <= 6; value += 1) {
    const resultToTop = new THREE.Quaternion().setFromUnitVectors(
      faceNormals[value],
      presentationTop
    );
    // Apply the same three-quarter camera-facing tilt as the opening pose after
    // putting the selected result face into the local top position.
    resultPresentationQuaternions[value] = presentationQuaternion
      .clone()
      .multiply(resultToTop);
  }

  const hideDiceUi = () => {
    diceUi.classList.remove("is-visible");
    diceUi.setAttribute("aria-hidden", "true");
    diceResult.textContent = "";
    dicePrompt.textContent = "";
  };

  const showDiceUi = (result, prompt) => {
    diceResult.textContent = result;
    dicePrompt.textContent = prompt;
    diceUi.classList.add("is-visible");
    diceUi.setAttribute("aria-hidden", "false");
  };

  const resetDice = () => {
    window.cancelAnimationFrame(diceAnimationFrame);
    diceAnimationFrame = undefined;
    diceRolling = false;
    diceReady = false;
    dice.position.set(0, DICE_CONFIG.overlayY, 0);
    dice.rotation.set(
      DICE_CONFIG.idleRotation.x,
      DICE_CONFIG.idleRotation.y,
      DICE_CONFIG.idleRotation.z,
      "XYZ"
    );
    dice.scale.setScalar(DICE_CONFIG.arScale);
    entranceOpacity = 0;
    bodyMaterial.opacity = 0;
    bodyMaterial.visible = true;
    diceBody.visible = true;
    innerCrystalMaterial.opacity = 0;
    edgeHighlightMaterial.uniforms.edgeOpacity.value = 0;
    dice.visible = false;
    diceOverlayCanvas.classList.remove("is-active");
    diceOverlayCanvas.setAttribute("aria-hidden", "true");
    hideDiceUi();
  };

  const deactivateDice = () => {
    if (!diceVisible) return;
    diceVisible = false;
    resetDice();
    updateStatus();
  };

  const enterDice = () => {
    diceOverlayCanvas.classList.add("is-active");
    diceOverlayCanvas.setAttribute("aria-hidden", "false");
    const startTime = performance.now();
    const entranceStartY = DICE_CONFIG.overlayY - 0.28;
    dice.position.set(0, entranceStartY, 0);
    dice.rotation.set(
      DICE_CONFIG.idleRotation.x,
      DICE_CONFIG.idleRotation.y,
      DICE_CONFIG.idleRotation.z,
      "XYZ"
    );
    dice.scale.setScalar(DICE_CONFIG.arScale * 0.42);
    bodyMaterial.visible = true;
    dice.visible = true;
    diceBody.visible = true;
    innerCrystal.visible = true;
    edgeHighlight.visible = true;
    bodyMaterial.opacity = 0;
    innerCrystalMaterial.opacity = 0;
    edgeHighlightMaterial.uniforms.edgeOpacity.value = 0;
    entranceOpacity = 0;

    const animateEntrance = (now) => {
      if (!diceVisible) return;
      const linear = clamp01((now - startTime) / DICE_CONFIG.entranceDuration);
      const eased = easeOutQuint(linear);
      entranceOpacity = eased;
      dice.scale.setScalar(DICE_CONFIG.arScale * (0.42 + 0.58 * eased));
      dice.position.y = THREE.MathUtils.lerp(entranceStartY, DICE_CONFIG.overlayY, eased);
      bodyMaterial.opacity = DICE_CONFIG.shellOpacity * eased;
      innerCrystalMaterial.opacity = DICE_CONFIG.innerOpacity * eased;
      edgeHighlightMaterial.uniforms.edgeOpacity.value = DICE_CONFIG.edgeOpacity * eased;

      if (linear < 1) {
        diceAnimationFrame = window.requestAnimationFrame(animateEntrance);
      } else {
        dice.position.set(0, DICE_CONFIG.overlayY, 0);
        dice.scale.setScalar(DICE_CONFIG.arScale);
        dice.visible = true;
        diceBody.visible = true;
        bodyMaterial.visible = true;
        bodyMaterial.opacity = DICE_CONFIG.shellOpacity;
        innerCrystalMaterial.opacity = DICE_CONFIG.innerOpacity;
        edgeHighlightMaterial.uniforms.edgeOpacity.value = DICE_CONFIG.edgeOpacity;
        entranceOpacity = 1;
        diceReady = true;
        showDiceUi("", "TAP TO ROLL");
      }
    };
    diceAnimationFrame = window.requestAnimationFrame(animateEntrance);
  };

  const rollDice = () => {
    if (!diceVisible || !diceReady || diceRolling) return;
    playDiceRollSound();
    diceRolling = true;
    diceReady = false;
    hideDiceUi();
    const value = Math.floor(Math.random() * 6) + 1;
    const startTime = performance.now();
    const startQuaternion = dice.quaternion.clone();
    const targetQuaternion = resultPresentationQuaternions[value];
    const interpolated = new THREE.Quaternion();
    const spin = new THREE.Quaternion();
    const spinEuler = new THREE.Euler(0, 0, 0, "XYZ");

    const animateRoll = (now) => {
      if (!diceVisible) return;
      const linear = clamp01((now - startTime) / DICE_CONFIG.rollDuration);
      const eased = easeOutQuint(linear);
      const remaining = 1 - eased;
      interpolated.slerpQuaternions(startQuaternion, targetQuaternion, eased);
      spinEuler.set(
        DICE_CONFIG.rotationSpeed.xTurns * Math.PI * 2 * remaining,
        DICE_CONFIG.rotationSpeed.yTurns * Math.PI * 2 * remaining,
        DICE_CONFIG.rotationSpeed.zTurns * Math.PI * 2 * remaining
      );
      spin.setFromEuler(spinEuler);
      dice.quaternion.copy(interpolated).multiply(spin);
      dice.position.y =
        DICE_CONFIG.overlayY + Math.sin(Math.PI * linear) * DICE_CONFIG.bounceHeight;
      if (linear < 1) {
        diceAnimationFrame = window.requestAnimationFrame(animateRoll);
      } else {
        dice.quaternion.copy(targetQuaternion);
        dice.position.y = DICE_CONFIG.overlayY;
        diceRolling = false;
        diceReady = true;
        showDiceUi(`YOU ROLLED: ${value}`, "TAP TO ROLL AGAIN");
      }
    };
    diceAnimationFrame = window.requestAnimationFrame(animateRoll);
  };

  const handleDicePointer = (event) => {
    if (!diceVisible || !diceReady || diceRolling) return;
    const rect = diceOverlayCanvas.getBoundingClientRect();
    pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    raycaster.setFromCamera(pointer, diceOverlayCamera);
    if (raycaster.intersectObject(dice, true).length > 0) rollDice();
  };
  diceOverlayCanvas.addEventListener("pointerup", handleDicePointer);

  const updateEngravingVisibility = () => {
    if (diceVisible) {
      dice.getWorldPosition(diceWorldPosition);
      dice.getWorldQuaternion(diceWorldQuaternion);
      diceOverlayCamera.getWorldPosition(cameraWorldPosition);
      cameraDirection.copy(cameraWorldPosition).sub(diceWorldPosition).normalize();
      for (const face of engravingFaces) {
        worldNormal.copy(face.normal).applyQuaternion(diceWorldQuaternion);
        const facing = worldNormal.dot(cameraDirection);
        let opacity;
        if (facing > 0.35) opacity = THREE.MathUtils.lerp(0.68, 0.92, (facing - 0.35) / 0.65);
        else if (facing > -0.12) opacity = THREE.MathUtils.lerp(0.3, 0.68, (facing + 0.12) / 0.47);
        else opacity = THREE.MathUtils.lerp(0.045, 0.12, Math.max(0, (facing + 1) / 0.88));
        const visibleOpacity = opacity * entranceOpacity;
        face.material.opacity = THREE.MathUtils.lerp(face.material.opacity, visibleOpacity, 0.16);
      }
    }
  };

  const renderDiceOverlay = () => {
    updateEngravingVisibility();
    diceOverlayRenderer.render(diceOverlayScene, diceOverlayCamera);
    window.requestAnimationFrame(renderDiceOverlay);
  };
  window.requestAnimationFrame(renderDiceOverlay);

  const animateHelmet = (now) => {
    if (!helmetVisible) return;
    if (helmetStartTime === undefined) helmetStartTime = now;

    const highlightTotal =
      HELMET_ANIMATION.highlightDuration * HELMET_ANIMATION.fragments.length;
    const explodeStart = HELMET_ANIMATION.initialHold + highlightTotal;
    const explodedHoldStart = explodeStart + HELMET_ANIMATION.explodeDuration;
    const returnStart = explodedHoldStart + HELMET_ANIMATION.explodedHold;
    const loopEnd = returnStart + HELMET_ANIMATION.returnDuration + HELMET_ANIMATION.loopHold;
    const elapsed = (now - helmetStartTime) % loopEnd;

    let movement = 0;
    if (elapsed >= explodeStart && elapsed < explodedHoldStart) {
      movement = easeInOutCubic(
        clamp01((elapsed - explodeStart) / HELMET_ANIMATION.explodeDuration)
      );
    } else if (elapsed >= explodedHoldStart && elapsed < returnStart) {
      movement = 1;
    } else if (elapsed >= returnStart) {
      movement = 1 - easeInOutCubic(
        clamp01((elapsed - returnStart) / HELMET_ANIMATION.returnDuration)
      );
    }

    helmetFragments.forEach((fragment, index) => {
      const offset = HELMET_ANIMATION.fragments[index];
      const highlightStart =
        HELMET_ANIMATION.initialHold + index * HELMET_ANIMATION.highlightDuration;
      const highlightProgress = clamp01(
        (elapsed - highlightStart) / HELMET_ANIMATION.highlightDuration
      );
      const isHighlighting = highlightProgress > 0 && highlightProgress < 1;
      const pulse = Math.sin(highlightProgress * Math.PI);

      fragment.object3D.position.set(
        offset.x * movement,
        offset.y * movement,
        offset.baseZ + offset.z * movement + pulse * 0.008
      );
      setFragmentAppearance(
        fragment,
        1 + pulse * (HELMET_ANIMATION.highlightScale - 1),
        isHighlighting
      );
    });

    helmetAnimationFrame = window.requestAnimationFrame(animateHelmet);
  };

  const hideExperience = () => {
    window.clearTimeout(panelTimer);
    panel.classList.remove("is-visible");
    panel.setAttribute("aria-hidden", "true");
    highlight.removeAttribute("animation__fadein");
    highlight.setAttribute("visible", false);
    highlight.setAttribute("material", "opacity", 0);
  };

  target.addEventListener("targetFound", () => {
    hideExperience();
    davidVisible = true;
    updateStatus();
    highlight.setAttribute("visible", true);
    highlight.setAttribute(
      "animation__fadein",
      "property: material.opacity; from: 0; to: 0.45; dur: 450; easing: easeOutQuad"
    );

    panelTimer = window.setTimeout(() => {
      panel.classList.add("is-visible");
      panel.setAttribute("aria-hidden", "false");
    }, 500);
  });

  target.addEventListener("targetLost", () => {
    davidVisible = false;
    updateStatus();
    hideExperience();
  });

  helmetTarget.addEventListener("targetFound", () => {
    helmetVisible = true;
    updateStatus();
    resetHelmet();
    helmetAnimationFrame = window.requestAnimationFrame(animateHelmet);
  });

  helmetTarget.addEventListener("targetLost", () => {
    helmetVisible = false;
    updateStatus();
    resetHelmet();
  });

  diceTarget.addEventListener("targetFound", () => {
    if (diceVisible) return;
    diceVisible = true;
    updateStatus();
    resetDice();
    diceVisible = true;
    enterDice();
  });

  diceTarget.addEventListener("targetLost", () => {
    // Deliberately keep the camera-relative Dice active. Image-target pose
    // jitter and brief target loss must not interrupt the unlocked experience.
  });

  // A clearly detected different museum target ends the Dice interaction,
  // without changing either target's existing visual or animation handlers.
  target.addEventListener("targetFound", deactivateDice);
  helmetTarget.addEventListener("targetFound", deactivateDice);

  document.querySelector("#ar-scene").addEventListener("arError", () => {
    status.textContent = "Camera could not start. Check camera permission and HTTPS.";
  });

  hideExperience();
  resetHelmet();
  resetDice();
  updateStatus();
});
