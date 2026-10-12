"use client";

import { useState } from "react";

/**
 * Ruta relativa, no una URL absoluta. El sitio y la API comparten dominio: el
 * behavior /api/* de la distribucion de CloudFront enruta a API Gateway. Para
 * el navegador es el mismo origen, asi que no hay CORS ni preflight.
 *
 * El efecto secundario es mejor que el principal: el bundle deja de contener
 * un dominio, y por lo tanto deja de depender del ambiente donde se construyo.
 * El mismo build sirve en cualquier despliegue.
 */
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "/api/resumir";

interface Resumen {
  id: string;
  url: string;
  title: string;
  summary: string;
  createdAt: string;
}

export default function Home() {
  const [url, setUrl] = useState("");
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    setError(null);
    setResumen(null);
    setCargando(true);

    try {
      const respuesta = await fetch(API_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });

      const cuerpo = await respuesta.json();

      if (!respuesta.ok) {
        // El backend devuelve { error } con un mensaje util en 400 y 422, que
        // son los casos atribuibles a la URL que mando el usuario.
        setError(cuerpo.error ?? `El servidor respondio ${respuesta.status}.`);
        return;
      }

      setResumen(cuerpo);
    } catch {
      // Cae aca si no hubo respuesta: sin red, CORS mal configurado, o la API
      // caida. El error de CORS no es distinguible desde JavaScript.
      setError("No se pudo contactar al servidor.");
    } finally {
      setCargando(false);
    }
  }

  return (
    <main>
      <header>
        <h1>Resumidor de artículos</h1>
        <p>
          Pegá la URL de un artículo y te devuelve un resumen de tres o cuatro
          oraciones, generado con Claude en AWS Bedrock.
        </p>
      </header>

      <form onSubmit={enviar}>
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://ejemplo.com/articulo"
          required
          disabled={cargando}
          aria-label="URL del artículo"
        />
        <button type="submit" disabled={cargando || url.trim() === ""}>
          {cargando ? "Resumiendo…" : "Resumir"}
        </button>
      </form>

      {cargando && (
        <p className="estado" role="status">
          Descargando el artículo y generando el resumen. Suele tardar unos
          segundos.
        </p>
      )}

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {resumen && (
        <article>
          <h2>{resumen.title}</h2>
          <p className="resumen">{resumen.summary}</p>
          <footer>
            <a href={resumen.url} target="_blank" rel="noreferrer noopener">
              Ver el artículo original
            </a>
            <time dateTime={resumen.createdAt}>
              {new Date(resumen.createdAt).toLocaleString("es-AR")}
            </time>
          </footer>
        </article>
      )}
    </main>
  );
}
