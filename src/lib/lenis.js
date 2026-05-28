import Lenis from '@studio-freight/lenis';

export const initLenis = () => {
  const lenis = new Lenis({
    smoothWheel: true,
    duration: 1.2,
  });

  function raf(time) {
    lenis.raf(time);
    requestAnimationFrame(raf);
  }

  requestAnimationFrame(raf);
};