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
  rollingImpactCount: 6,
  rollingTimingSlots: 8,
  finalImpactVolume: 0.72,
  soundDuration: 1.48,
  landingImpactLead: 0,
  landingImpactAudioDelay: 40,
};

// Screen-space Ship tuning. CSS accepts any length/percentage values here.
const SHIP_SCREEN_CONFIG = {
  width: "60vw",
  maxWidth: "430px",
  centerX: "50%",
  centerY: "46%",
  backdropWidth: "min(82vw, 590px)",
  backdropHeight: "min(72vh, 680px)",
  entranceDuration: 720,
  rockingAmount: 1.55,
  rockingDistanceX: 7,
  rockingDistanceY: 6.5,
  rockingDuration: 4700,
  horizontalDriftDuration: 5200,
  verticalFloatDuration: 6100,
  organicWaveDuration: 7300,
  organicFloatDuration: 8700,
  cannonDelay: 2050,
  smokeDelay: 170,
  smokeDuration: 1850,
  smokeScale: 2.7,
  cannonVolume: 0.16,
  cannonPositions: [
    { x: 58.2, y: 86.9, angle: 7 },
    { x: 69.1, y: 84.8, angle: -5 },
  ],
};

// Screen-fixed Camel contextualisation tuning. Positions are percentages of
// the uncropped group photograph, and durations are milliseconds.
const CAMEL_AR_CONFIG = {
  targetIndex: 4,
  cutoutFadeInDuration: 350,
  cutoutInitialHoldDuration: 300,
  cutoutStartScale: 2.8,
  cutoutStartX: -14,
  cutoutStartY: 19,
  cutoutEndScale: 1,
  cutoutEndX: 0,
  cutoutEndY: 0,
  cutoutMoveDuration: 2000,
  cutoutMoveEasing: "cubic-bezier(0.45, 0, 0.25, 1)",
  camelSettledPause: 180,
  layerFadeDuration: 600,
  layerStaggerDelay: 1000,
  layerInitialBrightness: 0.82,
  layerInitialBlur: 2,
  layerInitialScale: 1.01,
  finalHoldDuration: 2000,
};

const CAMEL_PLAYBACK_STATE = Object.freeze({
  IDLE: "IDLE",
  PLAYING: "PLAYING",
  WAIT_FOR_CLEAR: "WAIT_FOR_CLEAR",
});

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

const scheduleCrystalImpact = (
  audioContext,
  output,
  time,
  strength,
  finalImpact = false,
  audioSession
) => {
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
  audioSession?.sources.add(tone);
  audioSession?.nodes.add(tone);
  audioSession?.nodes.add(toneGain);
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
  audioSession?.sources.add(noise);
  audioSession?.nodes.add(noise);
  audioSession?.nodes.add(noiseFilter);
  audioSession?.nodes.add(noiseGain);
  noise.start(time, Math.random() * 0.01);
  noise.stop(time + decay);
};

const playDiceRollSound = () => {
  const silentSession = { playLandingImpact: () => {}, cleanup: () => {} };
  if (!DICE_SOUND_CONFIG.enabled) return silentSession;
  const audioContext = getDiceAudioContext();
  if (!audioContext) return silentSession;

  const master = audioContext.createGain();
  const audioSession = {
    sources: new Set(),
    nodes: new Set([master]),
    cleanupTimer: undefined,
    cleaned: false,
    cleanup() {
      if (this.cleaned) return;
      this.cleaned = true;
      window.clearTimeout(this.cleanupTimer);
      this.sources.forEach((source) => {
        try { source.stop(); } catch (_) {}
      });
      this.nodes.forEach((node) => {
        try { node.disconnect(); } catch (_) {}
      });
      this.sources.clear();
      this.nodes.clear();
    },
  };
  master.gain.setValueAtTime(DICE_SOUND_CONFIG.masterVolume, audioContext.currentTime);
  master.connect(audioContext.destination);

  const start = audioContext.currentTime + 0.015;
  const rollingEnd = DICE_SOUND_CONFIG.soundDuration - 0.13;
  for (let index = 0; index < DICE_SOUND_CONFIG.rollingImpactCount; index += 1) {
    const progress = (index + 1) / DICE_SOUND_CONFIG.rollingTimingSlots;
    const slowingTime = Math.pow(progress, 1.62) * rollingEnd;
    const irregularity = (Math.random() - 0.5) * 0.035;
    const strength = 0.28 + Math.random() * 0.18 - progress * 0.055;
    scheduleCrystalImpact(
      audioContext,
      master,
      start + Math.max(0, slowingTime + irregularity),
      strength,
      false,
      audioSession
    );
  }

  let landingImpactPlayed = false;
  audioSession.cleanupTimer = window.setTimeout(
    () => audioSession.cleanup(),
    DICE_CONFIG.rollDuration + 300
  );
  audioSession.playLandingImpact = () => {
    if (audioSession.cleaned || landingImpactPlayed) return;
    landingImpactPlayed = true;
    scheduleCrystalImpact(
      audioContext,
      master,
      audioContext.currentTime + DICE_SOUND_CONFIG.landingImpactAudioDelay / 1000,
      DICE_SOUND_CONFIG.finalImpactVolume,
      true,
      audioSession
    );
  };
  return audioSession;
};

document.addEventListener("DOMContentLoaded", () => {
  const target = document.querySelector("#david-target");
  const helmetTarget = document.querySelector("#helmet-target");
  const diceTarget = document.querySelector("#dice-target");
  const shipTarget = document.querySelector("#ship-target");
  const camelTarget = document.querySelector("#camel-target");
  const shipOverlay = document.querySelector("#ship-screen-overlay");
  const shipButton = document.querySelector("#ship-screen-button");
  const shipMotion = document.querySelector("#ship-screen-motion");
  const shipEffects = document.querySelector("#ship-screen-effects");
  const camelOverlay = document.querySelector("#camel-screen-overlay");
  const camelCutoutImage = document.querySelector("#camel-cutout-image");
  const camelFigureLayers = Array.from(document.querySelectorAll(".camel-figure-layer"));
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
  let shipVisible = false;
  let camelVisible = false;
  let camelTargetVisible = false;
  let shipAutoFireTimer;
  let shipEffectTimers = [];
  let shipAudioContext;
  let shipFiring = false;
  let shipMotionAnimationFrame;
  let shipMotionStartTime;
  let camelPlayed = false;
  let camelPlaybackState = CAMEL_PLAYBACK_STATE.IDLE;
  let camelTimers = [];
  let camelFinalLayerTransitionEndHandler;

  const easeInOutCubic = (value) =>
    value < 0.5
      ? 4 * value * value * value
      : 1 - Math.pow(-2 * value + 2, 3) / 2;

  const clamp01 = (value) => Math.min(1, Math.max(0, value));

  const isCamelPlaybackLocked = () =>
    camelPlaybackState === CAMEL_PLAYBACK_STATE.PLAYING;

  const updateStatus = () => {
    status.classList.toggle("is-hidden", shipVisible);
    if (camelVisible) {
      status.textContent = "Tang Tomb Camel found";
    } else if (shipVisible) {
      status.textContent = "Mechanical Ship found — tap the ship to fire";
    } else if (diceVisible) {
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

  const setShipScreenLayout = () => {
    const config = SHIP_SCREEN_CONFIG;
    shipOverlay.style.setProperty("--ship-width", config.width);
    shipOverlay.style.setProperty("--ship-max-width", config.maxWidth);
    shipOverlay.style.setProperty("--ship-center-x", config.centerX);
    shipOverlay.style.setProperty("--ship-center-y", config.centerY);
    shipOverlay.style.setProperty("--ship-backdrop-width", config.backdropWidth);
    shipOverlay.style.setProperty("--ship-backdrop-height", config.backdropHeight);
    shipOverlay.style.setProperty("--ship-rock-angle", `${config.rockingAmount}deg`);
    shipOverlay.style.setProperty("--ship-rock-x", `${config.rockingDistanceX}px`);
    shipOverlay.style.setProperty("--ship-rock-y", `${config.rockingDistanceY}px`);
    shipOverlay.style.setProperty("--ship-rock-duration", `${config.rockingDuration}ms`);
    shipOverlay.style.setProperty("--ship-entrance-duration", `${config.entranceDuration}ms`);
  };

  const clearShipEffects = () => {
    shipEffectTimers.forEach(window.clearTimeout);
    shipEffectTimers = [];
    shipFiring = false;
    shipEffects.replaceChildren();
  };

  // Procedural cannon sound copied from Ship-AR-Prototype; visual firing never
  // depends on AudioContext permission.
  const playShipCannonSound = (fromUserGesture) => {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    if (!shipAudioContext) shipAudioContext = new AudioContextClass();
    if (shipAudioContext.state === "suspended") {
      if (!fromUserGesture) return;
      shipAudioContext.resume().then(() => playShipCannonSound(false)).catch(() => {});
      return;
    }
    const now = shipAudioContext.currentTime;
    const master = shipAudioContext.createGain();
    const compressor = shipAudioContext.createDynamicsCompressor();
    master.gain.setValueAtTime(SHIP_SCREEN_CONFIG.cannonVolume, now);
    master.gain.exponentialRampToValueAtTime(0.0001, now + 0.72);
    compressor.threshold.value = -18;
    compressor.knee.value = 12;
    compressor.ratio.value = 5;
    master.connect(compressor).connect(shipAudioContext.destination);
    const sampleCount = Math.floor(shipAudioContext.sampleRate * 0.58);
    const buffer = shipAudioContext.createBuffer(1, sampleCount, shipAudioContext.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < sampleCount; index += 1) {
      const time = index / shipAudioContext.sampleRate;
      const burst = Math.exp(-time * 15);
      const rumble = Math.sin(2 * Math.PI * (68 - time * 25) * time) * Math.exp(-time * 5.8);
      data[index] = ((Math.random() * 2 - 1) * burst * 0.72 + rumble * 0.7) * 0.72;
    }
    const source = shipAudioContext.createBufferSource();
    const lowpass = shipAudioContext.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.setValueAtTime(520, now);
    lowpass.frequency.exponentialRampToValueAtTime(120, now + 0.5);
    source.buffer = buffer;
    source.connect(lowpass).connect(master);
    source.start(now);
    source.stop(now + 0.6);
  };

  const createShipCannonEffect = (cannon, delay) => {
    const muzzle = document.createElement("span");
    muzzle.className = "ship-muzzle";
    muzzle.style.left = `${cannon.x}%`;
    muzzle.style.top = `${cannon.y}%`;
    muzzle.style.setProperty("--fire-angle", `${cannon.angle}deg`);
    const flash = document.createElement("span");
    flash.className = "ship-flash";
    flash.style.animationDelay = `${delay}ms`;
    muzzle.appendChild(flash);
    for (let index = 0; index < 6; index += 1) {
      const puff = document.createElement("span");
      puff.className = "ship-smoke-puff";
      puff.style.setProperty("--puff-size", `${13 + Math.random() * 9}px`);
      puff.style.setProperty("--puff-delay", `${delay + SHIP_SCREEN_CONFIG.smokeDelay + index * 42}ms`);
      puff.style.setProperty("--puff-opacity", (0.36 + Math.random() * 0.22).toFixed(2));
      puff.style.setProperty("--drift-x", `${30 + index * 7 + Math.random() * 8}px`);
      puff.style.setProperty("--drift-y", `${-17 + (index - 2.5) * 7 + Math.random() * 5}px`);
      puff.style.setProperty("--smoke-duration", `${SHIP_SCREEN_CONFIG.smokeDuration}ms`);
      puff.style.setProperty("--smoke-scale", SHIP_SCREEN_CONFIG.smokeScale + Math.random() * 0.45);
      muzzle.appendChild(puff);
    }
    shipEffects.appendChild(muzzle);
  };

  const fireShipCannons = (fromUserGesture) => {
    if (!shipVisible || shipFiring) return;
    clearShipEffects();
    shipFiring = true;
    SHIP_SCREEN_CONFIG.cannonPositions.forEach((cannon, index) => createShipCannonEffect(cannon, index * 35));
    playShipCannonSound(fromUserGesture);
    shipEffectTimers.push(window.setTimeout(clearShipEffects, SHIP_SCREEN_CONFIG.smokeDuration + 650));
  };

  const animateShipMotion = (now) => {
    if (!shipVisible) return;
    if (shipMotionStartTime === undefined) shipMotionStartTime = now;
    const elapsed = now - shipMotionStartTime;
    const fullTurn = Math.PI * 2;
    const organicWave = elapsed / SHIP_SCREEN_CONFIG.organicWaveDuration * fullTurn;
    const rotationWave =
      Math.sin(elapsed / SHIP_SCREEN_CONFIG.rockingDuration * fullTurn) * 0.88 +
      Math.sin(organicWave + 0.9) * 0.12;
    const horizontalWave =
      Math.sin(elapsed / SHIP_SCREEN_CONFIG.horizontalDriftDuration * fullTurn + 0.35) * 0.85 +
      Math.sin(organicWave + 1.7) * 0.15;
    const verticalWave =
      Math.sin(elapsed / SHIP_SCREEN_CONFIG.verticalFloatDuration * fullTurn + 1.1) * 0.82 +
      Math.sin(elapsed / SHIP_SCREEN_CONFIG.organicFloatDuration * fullTurn + 2.4) * 0.18;

    const angle = rotationWave * SHIP_SCREEN_CONFIG.rockingAmount;
    const x = horizontalWave * SHIP_SCREEN_CONFIG.rockingDistanceX;
    const y = verticalWave * SHIP_SCREEN_CONFIG.rockingDistanceY;
    shipMotion.style.transform =
      `translate3d(${x.toFixed(3)}px, ${y.toFixed(3)}px, 0) rotate(${angle.toFixed(3)}deg)`;
    shipMotionAnimationFrame = window.requestAnimationFrame(animateShipMotion);
  };

  const startShipMotion = () => {
    window.cancelAnimationFrame(shipMotionAnimationFrame);
    shipMotionStartTime = undefined;
    shipMotionAnimationFrame = window.requestAnimationFrame(animateShipMotion);
  };

  const resetShip = () => {
    clearTimeout(shipAutoFireTimer);
    clearShipEffects();
    window.cancelAnimationFrame(shipMotionAnimationFrame);
    shipMotionAnimationFrame = undefined;
    shipMotionStartTime = undefined;
    shipMotion.style.transform = "translate3d(0, 0, 0) rotate(0deg)";
    shipOverlay.classList.remove("is-active");
    shipOverlay.setAttribute("aria-hidden", "true");
  };

  const deactivateShip = () => {
    if (!shipVisible) return;
    shipVisible = false;
    resetShip();
    updateStatus();
  };

  const setCamelCutoutTransform = (scale, x, y) => {
    camelCutoutImage.style.transform =
      `translate3d(${x}%, ${y}%, 0) scale(${scale})`;
  };

  const clearCamelTimers = () => {
    camelTimers.forEach(window.clearTimeout);
    camelTimers = [];
    if (camelFinalLayerTransitionEndHandler) {
      const finalLayer = camelFigureLayers[camelFigureLayers.length - 1];
      if (finalLayer) {
        finalLayer.removeEventListener("transitionend", camelFinalLayerTransitionEndHandler);
      }
      camelFinalLayerTransitionEndHandler = undefined;
    }
  };

  const resetCamel = () => {
    clearCamelTimers();
    camelPlayed = false;
    camelOverlay.classList.remove("is-active");
    camelOverlay.setAttribute("aria-hidden", "true");
    camelCutoutImage.style.transition = "none";
    camelCutoutImage.style.opacity = "0";
    camelCutoutImage.style.filter = "brightness(1) drop-shadow(0 0 0 rgba(255, 255, 255, 0))";
    setCamelCutoutTransform(
      CAMEL_AR_CONFIG.cutoutStartScale,
      CAMEL_AR_CONFIG.cutoutStartX,
      CAMEL_AR_CONFIG.cutoutStartY
    );
    camelFigureLayers.forEach((layer) => {
      layer.style.transition = "none";
      layer.style.opacity = "0";
      layer.style.filter =
        `brightness(${CAMEL_AR_CONFIG.layerInitialBrightness}) ` +
        `blur(${CAMEL_AR_CONFIG.layerInitialBlur}px)`;
      layer.style.transform = `scale(${CAMEL_AR_CONFIG.layerInitialScale})`;
    });
  };

  const deactivateCamel = () => {
    // A different target must not interrupt a Camel sequence in progress.
    if (camelPlaybackState === CAMEL_PLAYBACK_STATE.PLAYING) return;
    if (!camelVisible && !camelPlayed) return;
    camelVisible = false;
    resetCamel();
    updateStatus();
  };

  const playCamel = () => {
    if (camelPlayed) return;
    camelPlayed = true;
    const config = CAMEL_AR_CONFIG;
    camelOverlay.classList.add("is-active");
    camelOverlay.setAttribute("aria-hidden", "false");
    setCamelCutoutTransform(config.cutoutStartScale, config.cutoutStartX, config.cutoutStartY);

    // Force the reset styles to paint before revealing the cutout directly.
    camelOverlay.getBoundingClientRect();
    camelCutoutImage.style.transition =
      `opacity ${config.cutoutFadeInDuration}ms ease-out`;
    camelCutoutImage.style.opacity = "1";

    const moveStart = config.cutoutFadeInDuration + config.cutoutInitialHoldDuration;
    camelTimers.push(window.setTimeout(() => {
      camelCutoutImage.style.transition =
        `transform ${config.cutoutMoveDuration}ms ${config.cutoutMoveEasing}`;
      setCamelCutoutTransform(config.cutoutEndScale, config.cutoutEndX, config.cutoutEndY);

      // No figure layer can start until the cutout move and settling pause end.
      camelTimers.push(window.setTimeout(() => {
        if (!camelVisible || !camelPlayed) return;
        camelFigureLayers.forEach((layer, index) => {
          camelTimers.push(window.setTimeout(() => {
            if (!camelVisible || !camelPlayed) return;
            layer.style.transition =
              `opacity ${config.layerFadeDuration}ms ease-out, ` +
              `filter ${config.layerFadeDuration}ms ease-out, ` +
              `transform ${config.layerFadeDuration}ms ease-out`;
            layer.style.opacity = "1";
            layer.style.filter = "brightness(1) blur(0)";
            layer.style.transform = "scale(1)";

            // Start the final hold from layer 4's real transition completion,
            // rather than estimating the end of its fade with another timer.
            if (index === camelFigureLayers.length - 1) {
              camelFinalLayerTransitionEndHandler = (event) => {
                if (event.target !== layer || event.propertyName !== "opacity") return;
                layer.removeEventListener("transitionend", camelFinalLayerTransitionEndHandler);
                camelFinalLayerTransitionEndHandler = undefined;
                camelTimers.push(window.setTimeout(() => {
                  if (camelPlaybackState !== CAMEL_PLAYBACK_STATE.PLAYING) return;
                  if (camelTargetVisible) {
                    camelPlaybackState = CAMEL_PLAYBACK_STATE.WAIT_FOR_CLEAR;
                    return;
                  }

                  // The target was already cleared during playback, so there
                  // will be no later targetLost event to dismiss the overlay.
                  camelPlaybackState = CAMEL_PLAYBACK_STATE.IDLE;
                  camelVisible = false;
                  resetCamel();
                  updateStatus();
                }, config.finalHoldDuration));
              };
              layer.addEventListener("transitionend", camelFinalLayerTransitionEndHandler);
            }
          }, index * config.layerStaggerDelay));
        });
      }, config.cutoutMoveDuration + config.camelSettledPause));
    }, moveStart));
  };

  setShipScreenLayout();

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
  let currentDiceAudioSession;

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
    currentDiceAudioSession?.cleanup();
    currentDiceAudioSession = undefined;
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
    currentDiceAudioSession?.cleanup();
    const diceAudioSession = playDiceRollSound();
    currentDiceAudioSession = diceAudioSession;
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
    let landingImpactTriggered = false;

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
      if (
        !landingImpactTriggered &&
        now - startTime >= DICE_CONFIG.rollDuration - DICE_SOUND_CONFIG.landingImpactLead
      ) {
        landingImpactTriggered = true;
        diceAudioSession.playLandingImpact();
      }
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
    if (isCamelPlaybackLocked()) return;
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
    if (isCamelPlaybackLocked()) return;
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
    if (isCamelPlaybackLocked()) return;
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

  shipTarget.addEventListener("targetFound", () => {
    if (isCamelPlaybackLocked()) return;
    if (shipVisible) return;
    shipVisible = true;
    resetShip();
    shipVisible = true;
    shipOverlay.classList.add("is-active");
    shipOverlay.setAttribute("aria-hidden", "false");
    startShipMotion();
    updateStatus();
    shipAutoFireTimer = window.setTimeout(() => fireShipCannons(false), SHIP_SCREEN_CONFIG.cannonDelay);
  });

  shipTarget.addEventListener("targetLost", () => {
    // Once triggered, keep the stable screen overlay active through tracking
    // jitter. A different museum target explicitly closes it instead.
  });

  camelTarget.addEventListener("targetFound", () => {
    camelTargetVisible = true;
    if (camelPlaybackState !== CAMEL_PLAYBACK_STATE.IDLE) return;
    camelPlaybackState = CAMEL_PLAYBACK_STATE.PLAYING;
    camelVisible = true;
    updateStatus();
    playCamel();
  });

  camelTarget.addEventListener("targetLost", () => {
    camelTargetVisible = false;
    // Tracking jitter cannot alter an active playback. After completion, one
    // genuine clear event is required before Camel can be armed again.
    if (camelPlaybackState !== CAMEL_PLAYBACK_STATE.WAIT_FOR_CLEAR) return;
    camelPlaybackState = CAMEL_PLAYBACK_STATE.IDLE;
    camelVisible = false;
    resetCamel();
    updateStatus();
  });

  shipButton.addEventListener("click", () => {
    clearTimeout(shipAutoFireTimer);
    fireShipCannons(true);
  });

  // A clearly detected different museum target ends the Dice interaction,
  // without changing either target's existing visual or animation handlers.
  target.addEventListener("targetFound", deactivateDice);
  helmetTarget.addEventListener("targetFound", deactivateDice);
  shipTarget.addEventListener("targetFound", deactivateDice);
  camelTarget.addEventListener("targetFound", deactivateDice);
  target.addEventListener("targetFound", deactivateShip);
  helmetTarget.addEventListener("targetFound", deactivateShip);
  diceTarget.addEventListener("targetFound", deactivateShip);
  camelTarget.addEventListener("targetFound", deactivateShip);
  target.addEventListener("targetFound", deactivateCamel);
  helmetTarget.addEventListener("targetFound", deactivateCamel);
  diceTarget.addEventListener("targetFound", deactivateCamel);
  shipTarget.addEventListener("targetFound", deactivateCamel);

  document.querySelector("#ar-scene").addEventListener("arError", () => {
    status.textContent = "Camera could not start. Check camera permission and HTTPS.";
  });

  hideExperience();
  resetHelmet();
  resetDice();
  resetShip();
  resetCamel();
  updateStatus();
});
