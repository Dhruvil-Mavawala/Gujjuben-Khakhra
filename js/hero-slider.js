// hero-slider.js — Auto-advancing carousel with dots + arrows

(function () {
  const slides    = document.querySelectorAll(".slide");
  const dots      = document.querySelectorAll(".dot");
  const prevBtn   = document.getElementById("arrow-prev");
  const nextBtn   = document.getElementById("arrow-next");

  if (!slides.length) return;

  let current  = 0;
  let timer    = null;
  const DELAY  = 4500; // ms between auto-advances

  // ── Go to a specific slide ────────────────────
  function goTo(index) {
    slides[current].classList.remove("active");
    dots[current].classList.remove("active");

    current = (index + slides.length) % slides.length;

    slides[current].classList.add("active");
    dots[current].classList.add("active");
  }

  // ── Auto-advance ──────────────────────────────
  function startTimer() {
    clearInterval(timer);
    timer = setInterval(() => goTo(current + 1), DELAY);
  }

  // ── Dot clicks ────────────────────────────────
  dots.forEach(dot => {
    dot.addEventListener("click", () => {
      goTo(parseInt(dot.dataset.index));
      startTimer(); // reset timer on manual nav
    });
  });

  // ── Arrow clicks ──────────────────────────────
  if (prevBtn) prevBtn.addEventListener("click", () => { goTo(current - 1); startTimer(); });
  if (nextBtn) nextBtn.addEventListener("click", () => { goTo(current + 1); startTimer(); });

  // ── Keyboard navigation ───────────────────────
  document.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft")  { goTo(current - 1); startTimer(); }
    if (e.key === "ArrowRight") { goTo(current + 1); startTimer(); }
  });

  // ── Touch / swipe support ─────────────────────
  const slider = document.getElementById("hero-slider");
  if (slider) {
    let touchStartX = 0;
    slider.addEventListener("touchstart", e => { touchStartX = e.touches[0].clientX; }, { passive: true });
    slider.addEventListener("touchend",   e => {
      const diff = touchStartX - e.changedTouches[0].clientX;
      if (Math.abs(diff) > 50) {
        goTo(diff > 0 ? current + 1 : current - 1);
        startTimer();
      }
    }, { passive: true });
  }

  // ── Pause on hover ────────────────────────────
  if (slider) {
    slider.addEventListener("mouseenter", () => clearInterval(timer));
    slider.addEventListener("mouseleave", startTimer);
  }

  // ── Start ─────────────────────────────────────
  startTimer();
})();
