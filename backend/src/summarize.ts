import { AnthropicBedrockMantle } from "@anthropic-ai/bedrock-sdk";
import { config } from "./config";
import type { Articulo } from "./types";

/**
 * Cliente de Bedrock. Se crea a nivel de modulo a proposito: en Lambda, el
 * modulo se evalua una vez por contenedor, asi que el cliente y su pool de
 * conexiones se reusan entre invocaciones en vez de rearmarse cada vez.
 *
 * Las credenciales las resuelve el SDK de AWS solo (rol de ejecucion en Lambda,
 * `~/.aws/credentials` o variables de entorno en local).
 */
const client = new AnthropicBedrockMantle({ awsRegion: config.bedrockRegion });

const SYSTEM_PROMPT = `Sos un asistente que resume articulos en espanol rioplatense neutro.
Devolves unicamente el resumen: sin preambulo, sin titulo, sin vinetas, sin comillas.
El resumen tiene entre 3 y 4 oraciones y cubre la tesis central y las conclusiones del articulo.
Te limitas a lo que dice el texto; si el texto no alcanza para resumir, lo decis en una oracion.`;

export class ErrorDeResumen extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ErrorDeResumen";
  }
}

export async function resumirArticulo(articulo: Articulo): Promise<string> {
  // Recortamos antes de mandar: el costo se paga por token de entrada, y un
  // articulo largo no mejora un resumen de 3 oraciones.
  const texto = articulo.text.slice(0, config.maxCaracteresArticulo);

  const respuesta = await client.messages.create({
    model: config.modelId,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Titulo: ${articulo.title}\n\nArticulo:\n${texto}`,
      },
    ],
  });

  // `content` es un array de bloques discriminados por `.type`; hay que
  // estrechar el tipo antes de tocar `.text`.
  const resumen = respuesta.content
    .filter((bloque) => bloque.type === "text")
    .map((bloque) => bloque.text)
    .join("")
    .trim();

  if (!resumen) {
    throw new ErrorDeResumen(
      `El modelo no devolvio texto (stop_reason: ${respuesta.stop_reason}).`,
    );
  }

  return resumen;
}
