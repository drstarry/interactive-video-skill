/**
 * Responsive canvas helper.
 *
 * Maintains a VW×VH virtual coordinate space so all existing render
 * functions work unchanged, while the canvas scales to fit any container.
 */

export const VW = 1920;
export const VH = 1080;

/**
 * Size the canvas to fill its container, with DPR-aware rendering.
 * All drawing after this call uses VW×VH virtual coordinates.
 */
export function setupCanvas(canvas, container) {
  const dpr = window.devicePixelRatio || 1;
  const style = getComputedStyle(container);
  const padX = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
  const padY = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
  const availW = container.clientWidth - padX;
  const availH = container.clientHeight - padY;

  // Fit within available space maintaining aspect ratio
  let cssW = availW;
  let cssH = cssW * (VH / VW);
  if (availH > 0 && cssH > availH) {
    cssH = availH;
    cssW = cssH * (VW / VH);
  }

  canvas.style.width = cssW + 'px';
  canvas.style.height = cssH + 'px';
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);

  const ctx = canvas.getContext('2d');
  const scale = (cssW * dpr) / VW;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);

  return ctx;
}

/** Virtual canvas dimensions as an object — useful for code that expects { width, height }. */
export const virtualCanvas = { width: VW, height: VH };

/**
 * Attach a ResizeObserver that re-renders on container resize.
 * Returns a cleanup function.
 */
export function onResize(canvas, container, callback) {
  const ro = new ResizeObserver(() => {
    setupCanvas(canvas, container);
    callback();
  });
  ro.observe(container);
  return () => ro.disconnect();
}
