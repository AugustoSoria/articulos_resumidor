# Resumidor de articulos con IA

Pegas la URL de un articulo y te devuelve un resumen de 3-4 oraciones generado
con Claude en AWS Bedrock.

## Estado

**Fase 1 (actual): backend, verificable localmente.** El pipeline completo
existe y se puede correr desde la consola. Todavia no esta desplegado ni tiene
frontend.

- [x] Fase 1 - Pipeline: extraccion -> resumen -> persistencia
- [ ] Fase 2 - Deploy a AWS con SAM
- [ ] Fase 3 - Frontend en Next.js

## Arquitectura

```
Next.js (fase 3)
    |  POST { url }
    v
API Gateway (HTTP API)
    |
    v
Lambda  --1--> fetch(url) --> jsdom --> Readability --> { title, text }
        --2--> Bedrock (Claude Haiku 4.5) --> resumen
        --3--> DynamoDB (put)
    |
    v
{ id, url, title, summary, createdAt, status }
```

## Estructura

```
template.yaml            Infra: Lambda + HTTP API + DynamoDB + permisos IAM
backend/
  src/
    handler.ts           Entrada de Lambda. Solo HTTP: parseo, codigos, errores.
    pipeline.ts          El flujo completo, sin nada de HTTP.
    extract.ts           Validacion de URL + fetch + Readability.
    summarize.ts         Llamada a Bedrock.
    store.ts             Escritura en DynamoDB.
    config.ts            Variables de entorno en un solo lugar.
    types.ts             Forma del registro.
  scripts/
    local.ts             Corre el pipeline sin desplegar nada.
```

`handler.ts` y `pipeline.ts` estan separados a proposito: el pipeline no sabe
que existe HTTP, y por eso el script local puede ejercitar el sistema entero sin
levantar API Gateway.

## Correrlo local

```bash
cd backend
npm install
```

**Sin credenciales de AWS** (verifica fetch + Readability):

```bash
npm run local -- --solo-extraccion https://en.wikipedia.org/wiki/Serverless_computing
```

**Con credenciales de AWS** (agrega la llamada a Bedrock):

```bash
npm run local -- https://en.wikipedia.org/wiki/Serverless_computing
```

Sin `TABLE_NAME` en el entorno, el paso de DynamoDB se saltea y avisa. Asi se
puede probar el resumen sin crear la tabla.

## Decisiones

**Claude Haiku 4.5, no Claude 3 Haiku.** El criterio original era costo y
velocidad; Haiku 4.5 es el modelo actual que cumple ese criterio. En Bedrock el
ID lleva prefijo: `anthropic.claude-haiku-4-5`. Un ID first-party pelado da 400.

**`@anthropic-ai/bedrock-sdk` en vez de `@aws-sdk/client-bedrock-runtime`.** El
cliente `AnthropicBedrockMantle` habla la misma Messages API que la API de
Anthropic, con tipos de TypeScript, en vez de armar el JSON del body a mano.

**Validacion de URL antes del fetch.** La Lambda busca una URL que eligio un
desconocido. Sin filtro, cualquiera puede pedirle que pegue contra
`169.254.169.254` (metadatos de EC2) o contra IPs privadas y le devuelva el
contenido: eso es SSRF. `extract.ts` bloquea el literal del host. Queda
pendiente el caso de un dominio publico que resuelve a IP privada (DNS
rebinding), que exige validar la IP resuelta antes de conectar.

**Los errores tambien se guardan.** Un registro con `status: "error"` deja
rastro de que dominios rompen la extraccion. Sin eso, los fallos son invisibles.

## Sincrono vs asincrono

El campo `status` admite `pending`, pero **hoy ese valor es inalcanzable**: el
flujo es sincrono, escribimos el registro una sola vez y ya con el resultado
final. Nadie lee nunca un `pending`.

Eso no quiere decir que el campo sobre. Quiere decir que el modelo de datos esta
describiendo una arquitectura que todavia no construimos. El limite real: API
Gateway corta a los 30 segundos, y `fetch` + jsdom + Bedrock encadenados pueden
acercarse en un articulo largo o un sitio lento.

La version asincrona seria: la Lambda valida, escribe `pending`, encola el
trabajo y responde 202 con el `id`; un worker procesa y actualiza a `done`; el
frontend consulta por `id`. Es mas robusto y mas caro en complejidad. Decision
para la fase 2 o 3, cuando haya numeros de latencia reales para justificarla.

## Pendientes conocidos

- El permiso IAM de Bedrock en `template.yaml` usa la ARN clasica de
  `foundation-model`. Confirmar contra la doc de Bedrock que cubre el endpoint
  Mantle antes del deploy de fase 2.
- jsdom es una dependencia pesada: impacta el tamano del bundle y el arranque en
  frio. Si molesta, `linkedom` es mucho mas liviano y Readability funciona igual.
- CORS esta en `*`. Restringir al dominio del frontend en la fase 3.
- Sin tests automatizados todavia.
