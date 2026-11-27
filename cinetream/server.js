// Arranque de Cinetream. El servidor está escrito en TypeScript (servidor.ts y los demás .ts):
// Node 22.18 o más nuevo lo ejecuta directo, sin compilar.
if (!process.features?.typescript) {
  console.error(`Cinetream necesita Node 22.18 o más nuevo (este es ${process.version}). En Render: Environment → NODE_VERSION = 22.`);
  process.exit(1);
}
await import('./servidor.ts');
