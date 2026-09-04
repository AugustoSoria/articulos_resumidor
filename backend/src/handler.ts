import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import { ErrorDeExtraccion } from "./extract";
import { procesarUrl } from "./pipeline";

const CABECERAS = {
  // El charset es redundante segun la RFC 8259 (JSON siempre es UTF-8) y los
  // navegadores lo decodifican bien sin el. Va explicito igual porque
  // PowerShell 5.1 asume Latin-1 cuando falta, y rompe los acentos al probar
  // desde la terminal.
  "content-type": "application/json; charset=utf-8",
};

// Nota: aca no va ninguna cabecera CORS. El CORS lo resuelve API Gateway con
// su CorsConfiguration, y cuando esa configuracion existe **ignora** las
// cabeceras CORS que devuelva la integracion. Ponerlas aca no romperia nada,
// pero haria creer que el CORS se controla desde el codigo, y no es asi.

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
