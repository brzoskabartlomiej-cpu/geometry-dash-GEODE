/**
 * Practice Mode - reference mod for Geo Dash.
 *
 * Shows how to use the death hook and the respawn override. Mods are plain ES
 * modules: `mod.json` holds the manifest, the entry file exports `setup(ctx)`.
 */
export default function setup(ctx) {
  ctx.log("practice mode active");

  ctx.hooks.onDeath(({ x, progress }) => {
    // respawn a little before the death spot so the player can retry the part
    const respawn = Math.max(0, Math.floor(x) - 2);
    ctx.game.setRespawnX(respawn);
    ctx.storage.set("lastRespawn", respawn);
    if (progress > 1) ctx.ui.toast(`respawn at ${Math.round(progress)}%`);
  });

  ctx.hooks.onComplete(() => {
    ctx.game.setRespawnX(null);
  });
}
