import { timingSafeEqual } from "node:crypto";

/**
 * Authorizer de la HTTP API. Deja pasar solo los requests que llegaron por
 * CloudFront, que es quien le agrega el header con el secreto en el tramo
 * CloudFront -> API Gateway. El navegador nunca ve ese valor.
 *
 * Esto NO limita cuanto se puede usar la API: cualquiera puede pegarle a
 * CloudFront y recibir el header. Lo que impide es saltearse CloudFront
 * llamando directo a execute-api.
 *
 * Si el header falta, API Gateway responde 401 sin siquiera invocar esta
 * funcion, porque es la fuente de identidad declarada en el template.
 */

const SECRETO = Buffer.from(process.env.SECRETO_ORIGEN ?? "");

interface EventoAuthorizer {
  headers?: Record<string, string | undefined>;
}

export async function handler(
  event: EventoAuthorizer,
): Promise<{ isAuthorized: boolean }> {
  // HTTP API entrega los nombres de header en minusculas.
  const recibido = Buffer.from(event.headers?.["x-origen-cloudfront"] ?? "");

  // timingSafeEqual y no ===: una comparacion comun corta en el primer byte
  // distinto, y medir cuanto tarda en responder permite adivinar el secreto
  // de a un caracter. Exige largos iguales, por eso el chequeo previo.
  const autorizado =
    SECRETO.length > 0 &&
    recibido.length === SECRETO.length &&
    timingSafeEqual(recibido, SECRETO);

  return { isAuthorized: autorizado };
}
