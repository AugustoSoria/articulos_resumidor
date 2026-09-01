import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import type { Articulo } from "./types";

const TIMEOUT_FETCH_MS = 10_000;
const MAX_BYTES_HTML = 5_000_000;
const MIN_CARACTERES_UTILES = 200;

/** Error atribuible a la URL que mando el usuario, no a un bug nuestro. */
export class ErrorDeExtraccion extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ErrorDeExtraccion";
  }
}

/**
 * Valida la URL antes de que la Lambda la busque.
 *
 * Esto no es cosmetico: la Lambda hace un fetch a una URL que eligio un
 * desconocido desde internet. Sin este filtro, cualquiera puede pedirle que
 * pegue contra IPs internas o contra el endpoint de metadatos de EC2
 * (169.254.169.254) y devolverle el contenido. Eso es SSRF.
 *
 * Limitacion conocida: solo miramos el literal del host. Un dominio publico que
 * resuelve a una IP privada (DNS rebinding) pasa este filtro. La defensa
 * completa exige resolver el DNS y validar la IP antes de conectar.
 */
export function validarUrl(entrada: string): URL {
  let url: URL;
  try {
    url = new URL(entrada);
  } catch {
    throw new ErrorDeExtraccion("La URL no tiene un formato valido.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ErrorDeExtraccion("Solo se aceptan URLs http o https.");
  }

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");

  const bloqueado =
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host === "::1" ||
    host === "0.0.0.0" ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /^f[cd][0-9a-f]{2}:/.test(host);

  if (bloqueado) {
    throw new ErrorDeExtraccion("Esa URL apunta a una direccion interna.");
  }

  return url;
}

async function descargarHtml(url: URL): Promise<string> {
  let respuesta: Response;
  try {
    respuesta = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_FETCH_MS),
      headers: {
        // Sin un User-Agent creible, muchos sitios devuelven 403.
        "user-agent":
          "Mozilla/5.0 (compatible; ResumidorBot/0.1; +https://github.com/tu-usuario/articulos-resumidor)",
        accept: "text/html,application/xhtml+xml",
      },
    });
  } catch (error) {
    const causa = error instanceof Error ? error.message : String(error);
    throw new ErrorDeExtraccion(`No se pudo acceder a la URL (${causa}).`);
  }

  if (!respuesta.ok) {
    throw new ErrorDeExtraccion(`El sitio respondio ${respuesta.status}.`);
  }

  const tipo = respuesta.headers.get("content-type") ?? "";
  if (!tipo.includes("html")) {
    throw new ErrorDeExtraccion(`La URL no devolvio HTML sino "${tipo}".`);
  }

  const declarado = Number(respuesta.headers.get("content-length") ?? 0);
  if (declarado > MAX_BYTES_HTML) {
    throw new ErrorDeExtraccion("La pagina es demasiado grande.");
  }

  const html = await respuesta.text();
  if (html.length > MAX_BYTES_HTML) {
    throw new ErrorDeExtraccion("La pagina es demasiado grande.");
  }
  return html;
}

/** Descarga la pagina y le saca el articulo con Readability. */
export async function extraerArticulo(urlEntrada: string): Promise<Articulo> {
  const url = validarUrl(urlEntrada);
  const html = await descargarHtml(url);

  const { document } = parseHTML(html);

  // linkedom no recibe una URL base como jsdom. Readability lee `baseURI` y
  // `documentURI` para resolver enlaces relativos, asi que se los damos a mano.
  // Sin esto no rompe, pero deja los enlaces del articulo sin resolver.
  Object.defineProperty(document, "baseURI", { value: url.toString() });
  Object.defineProperty(document, "documentURI", { value: url.toString() });

  // linkedom es un parser sin timers ni window real, asi que no hay nada que
  // cerrar despues: era la razon del `dom.window.close()` que estaba aca.
  // El cast es inevitable: el Document de linkedom no es el de lib.dom, y este
  // proyecto no carga los tipos del DOM (corre en Node, no en un navegador).
  const doc = document as unknown as ConstructorParameters<typeof Readability>[0];
  const articulo = new Readability(doc).parse();

  if (!articulo?.textContent) {
    throw new ErrorDeExtraccion("No se encontro contenido de articulo en esa pagina.");
  }

  const texto = articulo.textContent.replace(/\s+/g, " ").trim();
  if (texto.length < MIN_CARACTERES_UTILES) {
    throw new ErrorDeExtraccion("El articulo es demasiado corto para resumir.");
  }

  return {
    title: articulo.title?.trim() || url.hostname,
    text: texto,
  };
}
