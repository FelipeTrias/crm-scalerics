# Arquitectura

## Forma general

Todo vive en **un solo Worker de Cloudflare**. No hay un servidor de front y otro de API: el mismo
despliegue atiende las tres cosas.

```
                        Worker "crm-scalerics"
                                 │
        ┌────────────────────────┼────────────────────────┐
        │                        │                        │
   fetch /api/*             fetch /*                  scheduled
        │                        │                        │
   API en TypeScript      Angular 22 (SSR)         Motor de alertas
   21 endpoints           + assets estáticos       (cron 0 11 * * *)
        │                                                 │
        └──────────────────┬──────────────────────────────┘
                           │
                    binding DB → Cloudflare D1 (SQLite)
```

El punto de entrada está en [`src/server.ts`](../src/server.ts): si el camino empieza con `/api/`
lo atiende la API con el `env` completo, y si no se lo delega a Angular.

Esto no es cosmético. `createRequestHandler` de Angular **solo recibe el `Request`**, nunca el `env`,
así que desde adentro del SSR no hay forma de llegar al binding de la base. Por eso el Worker exporta
su propio `fetch`.

---

## Decisiones y por qué

### 1. El filtro por rol vive en el servidor

Es la decisión central del proyecto.

Cada consulta arma su condición de alcance a partir del usuario del token, en
[`src/api/permisos.ts`](../src/api/permisos.ts):

- `rol = 'admin'` → sin condición extra; puede filtrar por vendedor si quiere
- `rol = 'vendedor'` → siempre `AND vendedor_id = ?` con el id del token

Si el filtro estuviera en Angular, cualquiera abre las herramientas de desarrollo y ve la cartera
completa. El problema quedaría igual pero disimulado.

Detalles que suelen escaparse y acá están cubiertos:

- El **detalle** lleva el mismo filtro que el listado. El bug clásico es filtrar bien la lista y
  dejar `/clientes/:id` abierto
- El `vendedor_id` de un alta **nunca** sale del cuerpo del pedido para un vendedor: sale del token
- Al leer un registro ajeno se responde **404**, no 403: un 403 confirmaría que existe

[`scripts/verificar-seguridad.sh`](../scripts/verificar-seguridad.sh) corre 42 comprobaciones sobre
todo esto y se puede apuntar a producción.

### 2. Cero dependencias en el backend

La autenticación, el router y el hash de contraseñas están escritos a mano sobre APIs web estándar.

No es purismo. Muchos paquetes de npm asumen Node y dependen de `fs`, `path` o `crypto` de Node, que
no existen en Workers. Además:

- **Hash:** PBKDF2 con `crypto.subtle`, nativo. 100.000 iteraciones, SHA-256, salt de 16 bytes por
  usuario. Formato `pbkdf2$iteraciones$salt$hash`
- **JWT:** HMAC-SHA256 con `crypto.subtle`. Firmar y verificar un HS256 son unas veinte líneas
- **Router:** 21 endpoints no justifican una librería. Una tabla de rutas y ~90 líneas alcanzan

El módulo de contraseñas ([`src/api/password.ts`](../src/api/password.ts)) lo usan **el login del
Worker y el generador del seed**. Un solo lugar define el formato: si el seed definiera el suyo, el
login no podría validar esos hashes.

### 3. Las métricas se calculan, no se guardan

`ultima_interaccion` y `dias_sin_contacto` no son columnas. Salen de `MAX(fecha)` sobre la bitácora,
con el índice `idx_interacciones_cliente` cubriendo la consulta.

Guardarlas desnormalizadas obliga a mantenerlas sincronizadas en cada alta, cada borrado y cada
corrección. Tarde o temprano se desincronizan y nadie se entera. Con 40 clientes y 200 interacciones
el costo de calcularlas es irrelevante.

Se puede ver funcionando: al registrar una visita, los días del cliente pasan a 0 sin que se ejecute
ningún `UPDATE` sobre la tabla `clientes`.

### 4. Dos métricas de riesgo, no una

`dias_sin_contacto` sale de la bitácora. `dias_sin_compra` sale de la oportunidad ganada más
reciente.

Como no hay tabla de pedidos —la facturación está fuera de alcance— la oportunidad ganada es la mejor
referencia disponible. Es una aproximación, y está documentada como tal.

La pantalla de riesgo ordena por la **peor de las dos**. Sin eso, un cliente que no compra hace ocho
meses pero fue visitado ayer quedaría al fondo de la lista, que es justo el caso que hay que ver.

Las dos reglas viven en [`src/api/reglas.ts`](../src/api/reglas.ts), que usan el listado, la pantalla
de riesgo, el panel y el cron. Si estuvieran copiadas, en algún momento una diría 60 y otra 90.

### 5. Qué se mueve al reasignar una cartera

| | Se mueve | Por qué |
|---|---|---|
| Clientes | Sí | Es el objetivo de la operación |
| Oportunidades abiertas | Sí | Hay que trabajarlas |
| Oportunidades cerradas | No | Es el histórico de quién vendió qué |
| **Interacciones** | **Nunca** | La bitácora no se reescribe |

Ese último punto es el argumento del sistema: la cartera se reasigna, el historial queda. El que
recibe los clientes hereda también todo lo que el anterior anotó.

Además, dar de baja a un vendedor que todavía tiene cartera devuelve **409** con el número de
clientes pendientes. Obliga al orden correcto: primero reasignar, después dar de baja. Si no, la
cartera queda colgando de alguien que ya no trabaja en la empresa.

### 6. El motor de alertas no repite

Dos reglas, no una:

1. No crea una alerta si ya hay una **pendiente** para ese cliente y tipo
2. Tampoco si generó una en los **últimos 7 días**, sin importar su estado

La segunda es la que importa. Sin ella, apenas el vendedor marca una alerta como vista el cron se la
vuelve a crear al día siguiente, y termina ignorándolas todas.

El índice único parcial de la base (`idx_alertas_sin_duplicar`) es el respaldo, no el mecanismo.

### 7. Los datos se cargan en el navegador, no en el SSR

Con SSR el render pasa por el Worker, que **no tiene la cookie** del usuario. Si el guard consultara
ahí, siempre daría "sin sesión" y todos terminarían en el login.

El servidor entrega el armazón y el navegador —que sí tiene la cookie— decide y carga. En el código
eso son `afterNextRender` para los datos e `isPlatformBrowser` en los guards.

Para un CRM privado no se pierde nada: no hay contenido público que indexar.

---

## Por qué no .NET

El desarrollador viene de .NET y era la opción natural. Cloudflare Workers corre **V8 isolates**, que
ejecutan JavaScript, TypeScript y WebAssembly. No hay CLR.

La única forma de correr .NET en Cloudflare es a través de Containers, que requiere plan pago e
infraestructura adicional. Para el alcance de esta prueba, resolverlo nativo en la plataforma era más
barato y más rápido que montar una segunda infraestructura solo para el API.

---

## Modelo de datos

Seis tablas. El detalle comentado está en [`db/schema.sql`](../db/schema.sql).

```
usuarios ──┬─< clientes ──┬─< contactos
           │              ├─< interacciones >── usuarios
           │              └─< oportunidades
           └─< alertas >── clientes
```

Convenciones:

- Fechas como texto ISO 8601 (`datetime('now')`), que es lo que SQLite ordena y compara bien
- Nada se borra físicamente: `clientes.eliminado = 1`, y todos los listados filtran por eso
- Los estados y etapas son `CHECK` en la base, además de validarse en el API

Una deuda conocida: en la tabla `alertas`, la columna `dias_sin_contacto` guarda los días **sin
comprar** cuando el tipo es `sin_compra`. El nombre quedó del esquema original. Renombrarla implica
una migración en local y remoto, y el proyecto no tiene sistema de migraciones.

---

## Lo que no está resuelto

- **Sin sistema de migraciones.** El esquema se aplica a mano con `wrangler d1 execute`. Para un
  proyecto de este tamaño alcanza; para uno que crece, no
- **Sin tests automatizados** más allá del script de seguridad. La verificación fue manual
- **Sin CI.** El despliegue se dispara a mano con `npm run deploy`
- **El límite de alcance por vendedor no está en la base**, está en el API. Un error de programación
  en un endpoint nuevo podría saltearlo. La red de contención es el script de verificación, que hay
  que acordarse de correr
