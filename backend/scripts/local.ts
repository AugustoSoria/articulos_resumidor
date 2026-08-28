/**
 * Corre el pipeline contra una URL real, sin desplegar nada.
 *
 *   npm run local -- https://ejemplo.com/articulo
 *   npm run local -- --solo-extraccion https://ejemplo.com/articulo
 *
 * `--solo-extraccion` frena antes de llamar a Bedrock, asi que no necesita
 * credenciales de AWS. Es el primer eslabon que conviene verificar.
 */
import { extraerArticulo } from "../src/extract";
import { procesarUrl } from "../src/pipeline";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const soloExtraccion = args.includes("--solo-extraccion");
  const url = args.find((a) => !a.startsWith("--"));

  if (!url) {
    console.error("Uso: npm run local -- [--solo-extraccion] <url>");
    process.exit(1);
  }

  if (soloExtraccion) {
    const articulo = await extraerArticulo(url);
    console.log("Titulo:", articulo.title);
    console.log("Caracteres:", articulo.text.length);
    console.log("---");
    console.log(articulo.text.slice(0, 600), "...");
    return;
  }

  const inicio = Date.now();
  const resumen = await procesarUrl(url);
  console.log(JSON.stringify(resumen, null, 2));
  console.log(`\n(${Date.now() - inicio} ms)`);
}

main().catch((error) => {
  console.error("\nFALLO:", error instanceof Error ? error.message : error);
  process.exit(1);
});
