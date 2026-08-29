# Resumidor de articulos con IA

Pegas la URL de un articulo y te devuelve un resumen de 3-4 oraciones generado
con Claude en AWS Bedrock.

## Estado

**Fase 2 en curso: el backend corre en AWS.** El pipeline completo se ejecuta en
Lambda contra Bedrock y DynamoDB reales. Se desplego **a mano desde la consola**
para entender que hay debajo del template; falta exponerlo con API Gateway, y
falta reconciliar `template.yaml`, que todavia no se desplego nunca.

- [x] Fase 1 - Pipeline: extraccion -> resumen -> persistencia
- [ ] Fase 2 - Deploy a AWS
  - [x] Bedrock, DynamoDB, IAM y Lambda creados a mano por consola
  - [ ] API Gateway
  - [ ] `template.yaml` corregido y desplegado con SAM
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

## Prerrequisitos de cuenta

`template.yaml` describe recursos, pero hay estado en la cuenta de AWS que **no
es un recurso** y que ningun despliegue crea. Clonar el repo y correr
`sam deploy` en una cuenta nueva produce un stack que despliega bien y falla en
runtime.

- **Suscripcion al modelo.** La primera invocacion de un modelo de terceros
  dispara por detras una suscripcion de AWS Marketplace, que requiere
  `aws-marketplace:Subscribe`. El rol de ejecucion de la Lambda no tiene ese
  permiso, ni deberia tenerlo. Hay que invocar el modelo **una vez desde el
  Playground de Bedrock con un usuario admin**; despues la Lambda invoca sin
  necesitarlo nunca mas. Es una vez por cuenta.
- **Region.** Bedrock es regional, y Haiku 4.5 se sirve por un inference profile
  cross-region que enruta a us-east-1, us-east-2 y us-west-2. Los permisos IAM
  tienen que cubrir las tres regiones destino (`arn:aws:bedrock:*::...`), no
  solo la del stack, o el resultado son fallos intermitentes.
- **Cuentas nuevas.** Traen una verificacion inicial que bloquea Bedrock por un
  rato, y cuotas reducidas: el limite de concurrencia de Lambda arranca cerca de
  10 en vez de 1000, lo que ademas impide fijar `ReservedConcurrentExecutions`
  (AWS exige dejar 100 unidades sin reservar).

## Decisiones

**Claude Haiku 4.5, no Claude 3 Haiku.** El criterio original era costo y
velocidad; Haiku 4.5 es el modelo actual que cumple ese criterio.

El ID del modelo depende del endpoint y **no son intercambiables**:

| Endpoint | ID |
|---|---|
| `bedrock-runtime` (el que usamos) | `us.anthropic.claude-haiku-4-5-20251001-v1:0` |
| `bedrock-mantle` | `anthropic.claude-haiku-4-5` |

En el endpoint clasico el ID viaja **en la URL** (`/model/{id}/invoke`), asi que
un ID de la otra familia no da un error de validacion: da `not_found_error`. El
prefijo `us.` es el inference profile cross-region, que es la unica forma en que
se sirve Haiku 4.5.

**`@anthropic-ai/bedrock-sdk` en vez de `@aws-sdk/client-bedrock-runtime`.** Da
`messages.create()` con tipos de TypeScript en vez de armar el JSON del body a
mano. Esto sigue en pie.

**`AnthropicBedrock` en vez de `AnthropicBedrockMantle` (decision revertida).**
La eleccion original era Mantle, el endpoint de Bedrock que habla la Messages
API de forma nativa. No funciono: en una cuenta de AWS recien creada, Mantle
reconoce el modelo pero responde `permission_error` con
`"is not available for this account"` y una invitacion a contactar a AWS Sales.
Se descubrio al desplegar, no antes.

El cambio fueron dos lineas, porque los dos clientes salen del mismo paquete y
exponen la misma superficie. Eso corrige de paso la justificacion original: el
ahorro de no armar el JSON a mano lo daba el paquete, no Mantle. La diferencia
real entre los dos endpoints es el protocolo del cable y que tan rapido llegan
las capacidades nuevas, no la ergonomia del codigo.

Si Mantle se habilita mas adelante, volver son esas mismas dos lineas mas el
cambio de ID y de permisos IAM (`bedrock-mantle:CreateInference` sobre
`arn:aws:bedrock-mantle:REGION:CUENTA:project/default`).

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

**`template.yaml` no refleja todavia lo que se comprobo que funciona.** El
despliegue manual dejo tres diferencias, ninguna visible leyendo el YAML y las
tres habrian aparecido recien en el primer `sam deploy`:

- **`xhr-sync-worker.js` no viaja en el bundle.** jsdom hace
  `require.resolve("./xhr-sync-worker.js")` en el top level del modulo, para
  poder lanzar un proceso hijo si alguien usa XHR sincrono. Un bundler borra la
  estructura de archivos, el resolve falla, y Lambda muere en el arranque con
  `Runtime.ImportModuleError` antes de ejecutar una linea propia. La solucion
  manual fue compilar ese worker como su propio bundle y ponerlo en el zip al
  lado de `handler.js`. En SAM hace falta pasar el `BuildMethod` a `makefile`,
  o sacar jsdom.
- **El `BedrockModelId` por defecto es el ID de Mantle**, que el endpoint
  clasico no conoce. Ver la tabla en "Decisiones".
- **`DynamoDBCrudPolicy` concede diez acciones**; la app usa una (`PutItem`).
  Ademas concede sobre `table/{nombre}/index/*`, y la tabla no tiene indices.
  Conviene reemplazarla por un `Statement` explicito, como ya hace el bloque de
  Bedrock en el mismo archivo.

Ademas:

- **`ReservedConcurrentExecutions` no esta en el template.** Es el unico limite
  duro real contra un gasto descontrolado: los budgets de AWS solo avisan, y con
  varias horas de retraso. Hoy no se puede fijar por la cuota de cuenta nueva.
- jsdom es una dependencia pesada: impacta el tamano del bundle y el arranque en
  frio. Ahora tiene un segundo motivo, el worker de arriba. `linkedom` es mucho
  mas liviano, no lanza procesos hijos y Readability funciona igual.
- CORS esta en `*` y el endpoint no va a tener autenticacion. Restringir al
  dominio del frontend en la fase 3.
- Sin tests automatizados todavia.
