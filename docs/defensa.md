# CRM Scalerics — material para la defensa

Todo lo que hay, por qué está así, con qué se hizo, cómo se despliega, y las preguntas que
probablemente te hagan con la respuesta preparada.

**En producción:** https://crm-scalerics.felipetrias.workers.dev
**Version desplegada:** `91c1afd2-e8f8-4373-aaf1-d8e459836383`

---

## 1. En una frase

Un CRM donde la cartera de clientes es **de la empresa y no del vendedor**, que avisa solo cuando un
cliente se está enfriando, y que funciona en el celular de alguien que está parado en la calle.

---

## 2. El problema, y cómo lo leí

El pedido literal era "un sistema donde estén los clientes cargados". El problema real está en la
primera frase de la carta:

> *"Si un vendedor se va, se lleva los contactos y perdemos el cliente."*

Eso no es "falta un Excel mejor". Es que **hoy la cartera es propiedad del vendedor**. Todas las
decisiones del sistema se ordenan alrededor de eso.

### Un matiz que cambió el diseño

El cliente pidió dos cosas que suenan iguales y no lo son:

- *"que me avise cuando hace mucho que no se contacta a alguien"* → **días sin contacto**
- *"compraban todos los meses y hace medio año no compran"* → **días sin compra**

Un cliente puede tener una visita de la semana pasada y no comprar hace ocho meses. Con una sola
métrica ese caso no aparece en ningún lado — y es el que él describió con más énfasis.

Hay tres clientes en los datos exactamente en esa situación, para poder mostrarlo:

| Cliente | Sin contacto | Sin compra |
|---|---|---|
| Super La Canasta | 4 días | **238 días** |
| Hotel Costa Azul | 6 días | **214 días** |
| Sabores del Plata | 11 días | **191 días** |

---

## 3. Qué tiene

### Pantallas

| Pantalla | Qué hace |
|---|---|
| **Login** | Email y contraseña, sesión en cookie firmada |
| **Mi cartera** | Tabla densa en escritorio, tarjetas en celular. Buscador. Semáforo de días |
| **Ficha del cliente** | Datos, contactos, historial de pedidos y bitácora completa |
| **Registrar contacto** | Modal de 4 campos, todo a botones. ~3 segundos |
| **Registrar pedido** | Buscás productos, cantidades, el total se arma solo |
| **En riesgo** | Los 13 en peligro, ordenados por gravedad, con WhatsApp y "Ya lo atendí" |
| **Pedidos** | Tablero por estado, con montos reales y antigüedad de cada presupuesto |
| **Catálogo** | 30 productos con precios (solo escritorio) |
| **Panel** | Solo el dueño: la reunión de los lunes con números |

### Funciones

- Clientes: alta, edición, baja lógica, buscador
- Contactos por cliente, con uno principal (el del botón de WhatsApp)
- Bitácora de llamadas, visitas, WhatsApp y emails
- Catálogo de productos con precios de lista
- **Presupuestos y pedidos con renglones** (producto, cantidad, precio)
- **Reasignación de cartera** entre vendedores + baja de vendedores
- Alertas automáticas por inactividad, con cron diario
- Panel del dueño con métricas por vendedor
- Filtro por rol aplicado en el servidor

### Los números

```
40 clientes        62 contactos       204 interacciones
30 productos      187 pedidos         558 renglones
24 presupuestos abiertos              13 clientes en riesgo
 5 usuarios (1 dueño + 4 vendedores)  18 alertas generadas

24 endpoints        8 tablas          10 pantallas
45 comprobaciones de seguridad, todas pasando
~8.300 líneas de código propio        25 commits
```

---

## 4. Las decisiones, y por qué

Estas son las que vale la pena defender. Cada una tiene un motivo concreto.

### El filtro por rol vive en el servidor

Cada consulta SQL incluye la condición de alcance según el usuario del token:

- `rol = 'admin'` → ve todo
- `rol = 'vendedor'` → siempre `AND vendedor_id = ?` con el id **del token**, no del request

Si el filtro estuviera en Angular, cualquiera abre las herramientas de desarrollo y se lleva la
cartera completa. El problema quedaría igual, pero disimulado.

Detalles que suelen escaparse y acá están cubiertos:

- **El detalle lleva el mismo filtro que el listado.** El bug clásico es filtrar bien la lista y
  dejar `/clientes/:id` abierto
- **El `vendedor_id` de un alta nunca sale del cuerpo del pedido** para un vendedor: sale del token
- **Al leer un registro ajeno se responde 404, no 403.** Un 403 confirmaría que existe

Hay un script que lo comprueba, y se puede apuntar a producción:

```bash
bash scripts/verificar-seguridad.sh https://crm-scalerics.felipetrias.workers.dev
```

### Las métricas se calculan, no se guardan

`ultima_interaccion` y `dias_sin_contacto` no son columnas. Salen de `MAX(fecha)` sobre la bitácora.

Guardarlas desnormalizadas obliga a mantenerlas sincronizadas en cada alta, cada borrado y cada
corrección. Tarde o temprano se desincronizan y nadie se entera.

**Se puede mostrar en vivo:** registrás una visita y los días del cliente pasan a 0 sin que se
ejecute ningún `UPDATE` sobre la tabla de clientes.

### Un presupuesto es un pedido que todavía no se confirmó

```
presupuesto  →  confirmado  →  entregado
     ↓              ↓
  perdido        anulado
```

Al principio había **dos** entidades: "oportunidades" (título libre + monto tipeado a mano) y
"pedidos" (renglones reales). Se pisaban, y el monto de la oportunidad no salía de ningún lado: en el
tablero había presupuestos de $123.000 para clientes que compran $20.000.

Se fusionaron en una. El vendedor arma la lista de productos **una sola vez** y después solo cambia
el estado. Y el monto de cada columna sale de multiplicar cantidades por precios.

### El precio se congela en el renglón

Si el hipoclorito sube de $380 a $420, un pedido de enero sigue diciendo $380. El renglón **copia**
el precio al momento de la venta, no apunta al catálogo. Si apuntara, actualizar una lista de precios
reescribiría todo el historial de ventas.

### El total del pedido no se guarda

Sale de `SUM(cantidad × precio_unitario)`. Mismo criterio que los días: no guardar lo que se puede
derivar. Como los precios ya quedaron congelados en los renglones, la suma es estable.

### Qué se mueve al reasignar una cartera

| | Se mueve | Por qué |
|---|---|---|
| Clientes | Sí | Es el objetivo |
| Presupuestos y pedidos confirmados | Sí | Hay que trabajarlos |
| Pedidos ya cerrados | **No** | Es el histórico de quién vendió qué |
| **Interacciones** | **Nunca** | La bitácora no se reescribe |

Ese último punto es el argumento del sistema: **la cartera se reasigna, el historial queda.** El que
recibe los clientes hereda también todo lo que el anterior anotó durante años.

Además, dar de baja a un vendedor que todavía tiene cartera devuelve **409** con el número de
clientes pendientes. Obliga al orden correcto: primero reasignar, después dar de baja.

### El motor de alertas no repite

Dos reglas, no una:

1. No crea una alerta si ya hay una **pendiente** para ese cliente y motivo
2. Tampoco si generó una en los **últimos 7 días**, sin importar su estado

La segunda es la que importa. Sin ella, apenas el vendedor marca una alerta como atendida el cron se
la vuelve a crear al día siguiente, y termina ignorándolas todas.

### Una sola pantalla para el riesgo

Al principio había dos: "En riesgo" (consulta en vivo) y "Alertas" (registro del cron). Mostraban los
mismos clientes con números iguales. Para alguien que no es de la computadora, eso es una pantalla de
más.

Se unificaron: la lista se calcula en vivo, y lo que antes era "marcar la alerta" ahora es el botón
**"Ya lo atendí"** de cada fila, que la esconde una semana. El cron sigue corriendo, y lo que deja se
ve como el cartel **"nuevo"** y como el contador rojo del menú.

### "Está por cerrar" se resolvió con la fecha, no con un estado

El cliente nombró tres cosas: *"si es un contacto nuevo, si ya se le pasó precio, si está por
cerrar"*. La tentación era agregar un estado "por cerrar".

No se hizo, por dos motivos:

1. En este negocio no hay fase de negociación. Le pasás precio por $20.000 de detergente y te dice sí
   o no
2. **Una etiqueta que hay que mantener a mano, nadie la mantiene.** En dos semanas ninguna estaría
   actualizada y el dato mentiría — que es el problema del Excel

En cambio, el tablero muestra la **antigüedad** de cada presupuesto con semáforo: verde hasta 15
días, amarillo hasta 45, rojo después. De los 24 presupuestos abiertos, **11 están en rojo**. Eso
responde "cuál está por cerrar" con un dato que el sistema ya tenía y nadie tiene que mantener.

### Registrar un contacto tiene que costar nada

Un solo campo obligatorio: el tipo. Todo lo demás puede quedar vacío.

Es a propósito y va contra el instinto de validar todo: **es preferible un registro incompleto a que
el vendedor no registre nada.** Si el formulario reclama campos parado en la calle, deja de usarse.

Además: cinco opciones de resultado, no diez. La lista original distinguía *"pidió muestra"* de
*"solo consulta de precios"* de *"pidió presupuesto"* — matices que le importan a quien diseñó el
sistema, no a quien lo usa. Para el vendedor son todos "todavía no compró".

### Nada se borra

Los clientes se dan de baja lógicamente (`eliminado = 1`) y todos los listados filtran por eso. La
bitácora es el activo que la empresa no quiere perder.

---

## 5. Con qué está hecho

Todo corre dentro de **un solo Worker de Cloudflare**:

```
Worker "crm-scalerics"
├── /*        → Angular 22 (SSR + assets estáticos)
├── /api/*    → API propia en TypeScript, 24 endpoints
└── cron      → motor de alertas, todos los días a las 8:00
        │
        └── binding DB → Cloudflare D1 (SQLite)
```

| Pieza | Por qué |
|---|---|
| **Angular 22** | Componentes standalone y signals. Sin `NgModule` ni `*ngIf` |
| **Cloudflare Workers** | Un solo despliegue para front, API y tareas programadas. Sin servidor que mantener |
| **Cloudflare D1** | SQLite gestionado, misma plataforma. Sin conexiones ni pool que administrar |
| **Cron Triggers** | Las alertas no necesitan un proceso aparte corriendo |
| **Cero dependencias propias** | Auth, router y hash escritos sobre APIs web estándar |

### Cero dependencias en el backend

`package.json` solo tiene Angular, `rxjs` y `tslib`. **Ninguna librería de terceros para la API.**

No es purismo: muchos paquetes de npm asumen Node y dependen de `fs`, `path` o `crypto` de Node, que
no existen en Workers. Además:

- **Hash de contraseñas:** PBKDF2 con `crypto.subtle`, nativo. 100.000 iteraciones, SHA-256, salt de
  16 bytes por usuario. Formato `pbkdf2$iteraciones$salt$hash`
- **JWT:** HMAC-SHA256 con `crypto.subtle`. Firmar y verificar un HS256 son veinte líneas
- **Router:** 24 endpoints no justifican una librería. Una tabla de rutas y ~90 líneas

El módulo de contraseñas lo usan **el login del Worker y el generador de datos de prueba**. Un solo
lugar define el formato: si el seed definiera el suyo, el login no podría validar esos hashes.

### Por qué el backend no es .NET

El desarrollador viene de .NET y era la opción natural. Cloudflare Workers corre **V8 isolates**, que
ejecutan JavaScript, TypeScript y WebAssembly. **No hay CLR.**

La única forma de correr .NET en Cloudflare es a través de Containers, que requiere plan pago e
infraestructura adicional. Para el alcance de esta prueba, resolverlo nativo en la plataforma era más
barato y más rápido que montar una segunda infraestructura solo para el API.

### El modelo de datos

Ocho tablas:

```
usuarios ──┬─< clientes ──┬─< contactos
           │              ├─< interacciones >── usuarios
           │              └─< pedidos ──< pedido_items >── productos
           └─< alertas >── clientes
```

Convenciones: fechas como texto ISO 8601 (`datetime('now')`), que es lo que SQLite ordena y compara
bien. Estados y etapas como `CHECK` en la base, además de validarse en el API.

---

## 6. Cómo se levanta y cómo se despliega

### Requisitos

**Node 22.22.3 o superior.** Con Node 20 no compila: Angular 22 lo rechaza. Y una cuenta de
Cloudflare.

### Local

```bash
npm ci
npx wrangler login
npx wrangler d1 create scalerics-crm
```

Copiar el `database_id` a `wrangler.jsonc` con el binding llamado `DB`, y después:

```bash
npx wrangler d1 execute scalerics-crm --local --file=./db/schema.sql
npx wrangler d1 execute scalerics-crm --local --file=./db/seed.sql
```

Crear `.dev.vars` en la raíz con el secreto que firma las sesiones:

```
JWT_SECRET=algo-largo-y-aleatorio-solo-para-desarrollo
```

Y levantar:

```bash
npm run preview
```

Queda en `http://localhost:8787`. **`ng serve` no sirve para probar la API**: no pasa por el punto de
entrada del Worker, así que no hay `/api` ni base de datos.

### Producción

```bash
npx wrangler secret put JWT_SECRET
npm run deploy
```

`npm run deploy` compila Angular y publica el Worker. **El despliegue tarda unos segundos en
propagarse**: si probás inmediatamente, puede responder todavía la versión anterior. Me pasó dos
veces — desplegá con margen, no cinco minutos antes de la demo.

### Regenerar los datos de prueba

```bash
node db/generar-seed.ts
```

Reescribe `db/seed.sql` con fechas **relativas a hoy** (`date('now','-N days')`), así los datos no
envejecen. Después hay que aplicarlo con `wrangler d1 execute`.

### Verificar el cron

Corre a las 11:00 UTC = 8:00 de Montevideo (Uruguay es UTC-3 todo el año, sin horario de verano).
**En local nunca dispara**: `wrangler dev` no ejecuta cron triggers. En producción:

```bash
npx wrangler tail --format pretty
```

Aparece un `Alertas generadas: {...}` cuando corre. Mientras tanto, el dueño tiene un botón para
forzarlo.

### Credenciales de demo

Contraseña `demo1234` para todos.

| Rol | Email | Ve |
|---|---|---|
| Dueño | `gustavo@scalerics.com.uy` | Los 40 clientes, el panel, el catálogo, la reasignación |
| Vendedor | `martin@scalerics.com.uy` | Sus 10 clientes |
| Vendedor | `lucia@scalerics.com.uy` | Sus 8 |
| Vendedor | `rodrigo@scalerics.com.uy` | Sus 10 |
| Vendedor | `valeria@scalerics.com.uy` | Sus 12 |

---

## 7. Preguntas que te van a hacer

### "¿Cómo garantizás que un vendedor no vea la cartera de otro?"

El filtro está en la consulta SQL del servidor, no en el front. Y hay un script con 45 comprobaciones
que lo verifica: sesión ausente, tokens adulterados, lectura y escritura de datos ajenos, operaciones
reservadas al dueño, y aislamiento de las carteras en los listados.

**Mostralo corriendo.** Vale más que decirlo.

Lo más contundente: agarrás el token de un vendedor, le editás el payload para ponerte `rol: admin`,
lo reenviás → **401**. La firma HMAC deja de validar. Nadie se autoasciende editando la cookie.

### "¿Qué pasa si un vendedor renuncia?"

Es el momento fuerte de la demo. Como el dueño:

1. Intentás dar de baja a Martín → **409**: *"Ese vendedor todavía tiene 10 clientes asignados.
   Reasigná su cartera antes de darlo de baja."*
2. Reasignás su cartera a Lucía → **10 clientes y 9 pedidos** en una operación
3. Ahora sí lo das de baja, y con la sesión cerrada ya no puede entrar
4. **Abrís un cliente que era de Martín**: figura con Lucía, pero la bitácora sigue diciendo
   "registró: Martin Píriz"

Ahí está todo el argumento: la cartera se reasignó, el historial quedó en la empresa.

### "¿Por qué no .NET?"

V8 isolates, no hay CLR. Containers requiere plan pago. Ver sección 5.

### "¿El WhatsApp funciona?"

Con honestidad: **el envío automático no**, y no es una limitación del sistema.

Requiere la API de WhatsApp Business de Meta: verificación de la empresa, número dedicado y
plantillas de mensaje aprobadas por Meta. Son trámites con plazos de días que no dependen del
desarrollo.

Lo que sí está hecho: el cron genera las alertas de verdad todos los días a las 8, la alerta aparece
en la app, y un botón abre WhatsApp con el número del contacto principal y **el mensaje ya redactado,
con los días reales metidos en el texto**. El vendedor toca el botón y aprieta enviar.

Cuando la empresa complete el trámite, el paso que falta es conectar el envío. El resto ya está.

> El cuñado tenía razón en que "se puede hacer" — pero requiere que la empresa haga un trámite con
> Meta, no que el programador escriba más código.

### "¿Cómo lo probaste?"

- **45 comprobaciones de seguridad** automatizadas, en un script que apunta a local o a producción
- Verificación manual en el navegador de cada pantalla, a 375px y a 1280px, midiendo áreas táctiles
  y desborde horizontal
- Cada endpoint probado con sus casos negativos: datos inválidos, permisos, registros inexistentes

**Lo que no hay:** tests unitarios ni de integración automatizados. Es la deuda más grande y está
documentada.

### "¿Y si crece? ¿escala?"

Workers y D1 escalan solos para este tamaño — hablamos de 4 vendedores y unos miles de clientes. D1
tiene límites de tamaño por base que están lejísimos de este caso.

Lo que **no** escala es el proceso: no hay migraciones, no hay CI, y el despliegue es manual. Si el
sistema crece, eso es lo primero que hay que resolver.

### "¿Por qué SQLite y no Postgres?"

Porque está en la misma plataforma que el resto y no hay que administrar nada: ni conexiones, ni
pool, ni un servidor de base. Para el volumen de una empresa con 4 vendedores, SQLite sobra.

Si algún día hace falta Postgres, Cloudflare tiene Hyperdrive — pero sería resolver un problema que
todavía no existe.

### "¿Por qué SSR si es una aplicación privada?"

Buena observación. El SSR viene del andamio de `create-cloudflare` y **no aporta nada acá**: no hay
contenido público que indexar.

Lo que sí importa es una consecuencia: durante el SSR el Worker **no tiene la cookie** del usuario,
así que los datos se cargan en el navegador (`afterNextRender`) y los guards deciden ahí. Si el guard
consultara en el servidor, todos terminarían en el login.

### "¿Qué harías distinto con más tiempo?"

Por orden:

1. **Tests automatizados.** El script de seguridad cubre lo crítico, pero no hay tests de la lógica
2. **Sistema de migraciones.** Hoy el esquema se aplica a mano y ya hizo falta un archivo de
   migración suelto
3. **CI**, para que el despliegue no dependa de que alguien corra un comando
4. **Historial de cambios de estado**, para medir cuánto tarda un presupuesto en cerrarse
5. **Registro de pedidos conectado a stock**, si en algún momento entra inventario

### "¿Cuánto cuesta operarlo?"

Workers y D1 tienen plan gratuito con límites generosos para este volumen. Para una empresa de 4
vendedores, probablemente entre en el plan gratis o en el de USD 5/mes. Vale confirmarlo en la
consola de Cloudflare antes de prometerlo.

### "¿Y los backups?"

**Acá sé honesto: no configuré ni verifiqué backups.** D1 ofrece recuperación a un punto en el tiempo
según la documentación de Cloudflare, pero no lo probé ni lo dejé configurado. Es un pendiente real
antes de cargar datos de producción.

### "¿Qué pasa si se pierde el JWT_SECRET?"

Se genera uno nuevo con `wrangler secret put` y todas las sesiones abiertas se invalidan — nadie
pierde datos, solo hay que volver a entrar. El secreto no está en el código ni en el repositorio:
`.dev.vars` está en `.gitignore` y en producción vive como secret de Cloudflare.

### "¿Por qué borrado lógico?"

Porque la bitácora del cliente es justamente el activo que la empresa no quiere perder. Un `DELETE`
físico se llevaría el historial de años de conversaciones.

### "¿Cambiaste de idea en el medio?"

Sí, y conviene contarlo — el historial de 25 commits lo muestra. Dos cambios grandes:

1. **Se agregaron productos y pedidos**, que al principio estaban fuera de alcance. El motivo: "días
   sin compra" era una aproximación (usaba la oportunidad ganada más reciente) y con pedidos reales
   pasó a ser un hecho. Eso convirtió el reclamo más fuerte del cliente de estimación en dato
2. **Se fusionaron oportunidades y pedidos, y alertas con clientes en riesgo.** En los dos casos
   había dos conceptos parecidos, y el cliente pidió explícitamente que lo pudiera usar "gente que no
   es muy de la computadora"

Es un argumento a favor, no en contra: el sistema se simplificó a medida que se entendió mejor el
problema.

---

## 8. Lo que NO tiene, y por qué

Fuera de alcance **por decisión**, no por olvido:

Facturación, stock, integración contable, aplicación nativa, geolocalización, firma digital,
multiempresa, comisiones, importación de Excel y generación de PDF.

Ninguna resuelve el problema que se planteó, y todas alargan el plazo. La temporada alta arranca en
octubre.

**Un pedido no es una factura**: no hay impuestos, remito ni cuenta corriente. Es el registro
comercial de que hubo una venta, con qué y cuándo.

---

## 9. Los puntos débiles (que los sepas antes de que te los digan)

| Debilidad | Qué decir |
|---|---|
| **Sin tests automatizados** más allá del script de seguridad | Es la deuda más grande. La verificación fue manual y sistemática, pero manual |
| **Sin CI** | El despliegue es manual con `npm run deploy` |
| **Sin sistema de migraciones** | El esquema se aplica a mano; ya hubo que crear dos archivos de migración sueltos |
| **Backups no configurados** | Pendiente real antes de datos de producción |
| **Sin recuperación de contraseña** | El dueño da de alta y resetea. Para 5 usuarios alcanza |
| **Sin historial de cambios de estado** | No se puede medir cuánto tarda un presupuesto en cerrarse |
| **`alertas.dias_sin_contacto` guarda días sin compra** cuando el tipo es `sin_compra` | Nombre heredado del esquema original. Renombrarlo implicaba una migración a mitad del proyecto |
| **El límite por vendedor está en el API, no en la base** | Un endpoint nuevo mal escrito podría saltearlo. La red de contención es el script, que hay que acordarse de correr |
| **El logo es un placeholder** | El cliente lo iba a mandar por WhatsApp y no llegó. El espacio está reservado |

---

## 10. Guion sugerido para la demo

1. **Entrá como Martín (vendedor).** "Mi cartera": 10 clientes. Esto es lo que ve un vendedor
2. **Escribí `/panel` en la URL** → *"El panel de control es solo para el administrador"*, sin un solo
   dato. El servidor es el que corta
3. **Salí y entrá como Gustavo (el dueño).** Ahora son 40 clientes y aparece el Panel
4. **En riesgo** — los 13. Señalá Super La Canasta: **4 días sin contacto, 238 sin comprar**. "A este
   lo llamaron la semana pasada y no compra hace ocho meses. Hoy nadie se enteraba"
5. **Tocá el botón de WhatsApp** — se abre con el mensaje redactado y los días reales
6. **Pedidos** — los 24 presupuestos, y **11 en rojo** por antigüedad. "Estos están muertos y nadie
   lo había dicho"
7. **Abrí un cliente → Registrar pedido.** Buscás, tocás, ajustás cantidad, el total se arma. Guardás
   y los días sin compra de ese cliente pasan a 0
8. **Registrar contacto** — cronometralo. Tres segundos
9. **El momento fuerte:** se va Martín. 409 → reasignás → das de baja → abrís un cliente y la
   bitácora sigue diciendo "registró: Martin Píriz"
10. **Abrilo en el celular.** Tarjetas, barra inferior, botones grandes
11. **Cerrá con el script de seguridad** corriendo contra producción: 45 OK, 0 fallas

---

## 11. Cosas concretas para citar

- El cron es `"0 11 * * *"` — 11:00 UTC = 8:00 de Montevideo, porque **Uruguay es UTC-3 todo el año**
  (no tiene horario de verano desde 2015)
- Semáforo de contacto: **verde < 30 días, amarillo 30-60, rojo > 60**
- Umbrales de alerta: **60 días sin contacto, 180 días sin comprar**
- Antigüedad de presupuesto: **verde < 15 días, amarillo 15-45, rojo > 45**
- "Ya lo atendí" silencia al cliente **7 días**
- Contraseñas: **PBKDF2, SHA-256, 100.000 iteraciones**, salt de 16 bytes por usuario
- Sesión: **JWT HS256** en cookie `httpOnly`, `Secure`, `SameSite=Lax`, 7 días
- Áreas táctiles: **mínimo 44px**
- El ancho del contenido está acotado a **1280px** centrados
