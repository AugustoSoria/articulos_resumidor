import { randomUUID } from "node:crypto";
import { ErrorDeExtraccion, extraerArticulo } from "./extract";
import { guardarResumen } from "./store";
import { resumirArticulo } from "./summarize";
import type { Resumen } from "./types";

/**
 * El flujo completo, sin nada de HTTP. Lo usan tanto la Lambda como el script
 * local: manteniendo esto separado del handler, se puede probar el sistema
 * entero sin levantar API Gateway.
 */
export async function procesarUrl(url: string): Promise<Resumen> {
  const id = randomUUID();
  const createdAt = new Date().toISOString();

  try {
    const articulo = await extraerArticulo(url);
    const summary = await resumirArticulo(articulo);

    const registro: Resumen = {
      id,
      url,
      title: articulo.title,
      summary,
      createdAt,
      status: "done",
    };
    await guardarResumen(registro);
    return registro;
  } catch (error) {
    // Guardamos tambien los fallos: sin esto no hay forma de ver despues que
    // dominios rompen la extraccion.
    const registro: Resumen = {
      id,
      url,
      title: "",
      summary: error instanceof Error ? error.message : String(error),
      createdAt,
      status: "error",
    };
    await guardarResumen(registro).catch((fallo) =>
      console.error("[pipeline] no se pudo guardar el error:", fallo),
    );
    throw error;
  }
}

export { ErrorDeExtraccion };
