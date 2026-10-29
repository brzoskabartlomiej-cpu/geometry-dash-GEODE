/**
 * Rainbow Cube - reference mod for Geo Dash.
 *
 * Shows how a mod can touch the presentation every frame without needing access
 * to the renderer: it only publishes a palette override.
 */
export default function setup(ctx) {
  let hue = 0;

  ctx.hooks.onFrame(({ dt }) => {
    hue = (hue + dt * 0.35) % 1;
    ctx.game.setPalette({
      primary: hsl(hue, 0.85, 0.62),
      detail: hsl((hue + 0.5) % 1, 0.9, 0.7),
    });
  });

  ctx.hooks.onComplete(() => {
    ctx.ui.toast("rainbow clear!");
  });
}

function hsl(h, s, l) {
  const f = (n) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    return l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
  };
  return [f(0), f(8), f(4), 1];
}
