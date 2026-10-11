// Scene.activate starts an unawaited Scene.view in Foundry 14. A second view
// can therefore be refused while the canvas is loading. Canvas.draw has a
// native queue, so use it to finish an already busy transition before publishing
// the new active scene or releasing the MHD intermission.
export async function presentScene(scene, {activate = false, canvas = globalThis.canvas} = {}) {
  if (canvas?.initialized && canvas.loading) await canvas.draw(scene);
  else await scene.view();
  if (activate) await scene.activate();
  if (canvas?.initialized && (canvas.loading || canvas.scene?.id !== scene.id || !canvas.ready)) {
    await canvas.draw(scene);
  }
  if (canvas?.initialized && (canvas.loading || canvas.scene?.id !== scene.id || !canvas.ready)) {
    throw new Error('Scénu se nepodařilo připravit. Zopakujte přechod po dokončení načítání.');
  }
  return scene;
}
