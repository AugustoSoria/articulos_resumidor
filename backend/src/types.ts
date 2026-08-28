/** Un registro tal como vive en DynamoDB. */
export interface Resumen {
  /** partition key */
  id: string;
  url: string;
  title: string;
  summary: string;
  /** ISO 8601 */
  createdAt: string;
  status: EstadoResumen;
}

/**
 * `pending` existe en el modelo de datos pero hoy es inalcanzable: el flujo es
 * sincrono, asi que escribimos el registro una sola vez, ya con el resultado.
 * Solo cobra sentido si en una fase futura la Lambda encola el trabajo y
 * responde 202 de inmediato. Ver README, seccion "Sincrono vs asincrono".
 */
export type EstadoResumen = "pending" | "done" | "error";

export interface Articulo {
  title: string;
  text: string;
}
