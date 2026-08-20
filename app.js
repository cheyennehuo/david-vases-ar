document.addEventListener("DOMContentLoaded", () => {
  const target = document.querySelector("#image-target");
  const highlight = document.querySelector("#inscription-highlight");
  const panel = document.querySelector("#info-panel");
  const status = document.querySelector("#status");
  let panelTimer;

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
    status.textContent = "Target found";
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
    status.textContent = "Point the camera at the David Vases image";
    hideExperience();
  });

  document.querySelector("#ar-scene").addEventListener("arError", () => {
    status.textContent = "Camera could not start. Check camera permission and HTTPS.";
  });

  hideExperience();
});
