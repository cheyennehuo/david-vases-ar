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

document.addEventListener("DOMContentLoaded", () => {
  const target = document.querySelector("#david-target");
  const helmetTarget = document.querySelector("#helmet-target");
  const helmetFragments = Array.from(document.querySelectorAll(".helmet-fragment"));
  const highlight = document.querySelector("#inscription-highlight");
  const panel = document.querySelector("#info-panel");
  const status = document.querySelector("#status");
  let panelTimer;
  let helmetAnimationFrame;
  let helmetStartTime;
  let davidVisible = false;
  let helmetVisible = false;

  const easeInOutCubic = (value) =>
    value < 0.5
      ? 4 * value * value * value
      : 1 - Math.pow(-2 * value + 2, 3) / 2;

  const clamp01 = (value) => Math.min(1, Math.max(0, value));

  const updateStatus = () => {
    if (davidVisible && helmetVisible) {
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

  document.querySelector("#ar-scene").addEventListener("arError", () => {
    status.textContent = "Camera could not start. Check camera permission and HTTPS.";
  });

  hideExperience();
  resetHelmet();
  updateStatus();
});
