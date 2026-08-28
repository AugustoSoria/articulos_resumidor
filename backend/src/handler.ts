import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import { ErrorDeExtraccion } from "./extract";
import { procesarUrl } from "./pipeline";

const CABECERAS = {
  "content-type": "application/json",
  // Fase 3: restringir al dominio real del frontend en vez de "*".
  "access-control-allow-origin": "*",
};

function responder(status: number, cuerpo: unknown): APIGatewayProxyResultV2 {
  return { statusCode: status, headers: CABECERAS, body: JSON.stringify(cuerpo) };
}

export async function handler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  let url: unknown;
  try {
    url = JSON.parse(event.body ?? "{}").url;
  } catch {
    return responder(400, { error: "El cuerpo no es JSON valido." });
  }

  if (typeof url !== "string" || url.trim() === "") {
    return responder(400, { error: 'Falta el campo "url".' });
  }

  try {
    const resumen = await procesarUrl(url.trim());
    return responder(200, resumen);
  } catch (error) {
    if (error instanceof ErrorDeExtraccion) {
      // Culpa de la URL que mandaron, no nuestra.
      return responder(422, { error: error.message });
    }
    console.error("[handler] fallo inesperado:", error);
    return responder(500, { error: "No se pudo generar el resumen." });
  }
}
