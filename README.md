# CRM Scalerics

CRM comercial para **Scalerics**, empresa uruguaya que vende insumos de limpieza a otras empresas.

**En producción:** https://crm-scalerics.felipetrias.workers.dev

---

## El problema

Scalerics tiene cuatro vendedores en la calle. Cada uno maneja su cartera en un Excel propio, y
algunos directamente en el celular. Eso genera dos problemas que no son el mismo: el dueño no tiene
forma de saber qué está pasando —los lunes le dicen de palabra que "está todo en proceso"— y, sobre
todo, **la cartera de clientes hoy es propiedad del vendedor, no de la empresa**. Cuando alguien
renuncia se lleva los contactos, el historial de lo conversado y, con eso, al cliente.

Ese es el problema que resuelve este sistema, y todas las decisiones de diseño se ordenan alrededor
de él. Los datos viven en un solo lugar y son de la empresa: cuando un vendedor se va, su cartera se
reasigna a otro en una operación, y **todo lo que anotó durante años queda**. Además el sistema
avisa solo cuando un cliente se está enfriando, que es el otro reclamo que apareció textual en la
reunión: *"tengo clientes que compraban todos los meses y hace medio año no compran y nadie se dio
cuenta"*.

---

## Capturas

| | |
|---|---|
| ![Clientes en riesgo](docs/capturas/riesgo.png) | ![Cartera](docs/capturas/cartera.png) |
| **Clientes en riesgo** — ordenados por gravedad, con las dos métricas y el botón de WhatsApp | **Mi cartera** — tabla densa, buscador y semáforo de contacto |
| ![Ficha de cliente](docs/capturas/ficha.png) | ![Panel](docs/capturas/panel.png) |
| **Ficha de cliente** — datos, contactos y bitácora completa | **Panel del dueño** — la reunión de los lunes, con números |

![En el celular](docs/capturas/celular.png)

*En el celular la tabla se convierte en tarjetas y la navegación pasa a una barra inferior.*

---

## Lo que resuelve, punto por punto

| Lo que pidió el cliente | Cómo se resolvió |
|---|---|
| *"Si un vendedor se va, se lleva los contactos"* | Reasignación de cartera en una operación. La bitácora **no** se reasigna: sigue a nombre de quien la registró |
| *"Yo no tengo idea de qué está pasando"* | Panel con clientes, actividad de la semana y presupuestos, abierto por vendedor |
| *"Siempre está todo en proceso, nunca sé bien"* | Pipeline con seis etapas cerradas, con cantidad y monto por columna |
| *"Hace medio año no compran y nadie se dio cuenta"* | Dos métricas independientes: días sin contacto y **días sin compra** |
| *"Que me avise"* | Un cron diario a las 8:00 genera las alertas y las deja en la app |
| *"Que salga por WhatsApp"* | Botón que abre WhatsApp con el mensaje ya redactado (ver [Alcance](#alcance)) |
| *"Que lo use gente que no es muy de la computadora"* | Registrar un contacto son 4 campos y un solo toque obligatorio |
| *"Que ande en el celular"* | Diseñado primero para 390px de ancho |
| Colores azul y gris | Paleta de la empresa en toda la aplicación |

---

## Cómo está hecho

Todo corre dentro de **un solo Worker de Cloudflare**:

```
Worker "crm-scalerics"
├── /*        → Angular 22 (SSR + assets estáticos)
├── /api/*    → API propia en TypeScript, 21 endpoints
└── cron      → motor de alertas, todos los días a las 8:00
        │
        └── binding DB → Cloudflare D1 (SQLite)
```

| Pieza | Por qué |
|---|---|
| **Angular 22** | Componentes standalone y signals. Sin `NgModule` ni `*ngIf` |
| **Cloudflare Workers** | Un solo despliegue para front, API y tareas programadas. Sin servidor que mantener |
| **Cloudflare D1** | SQLite gestionado, en la misma plataforma. Sin conexiones ni pool que administrar |
| **Cron Triggers** | Las alertas no necesitan un proceso aparte corriendo |
| **Cero dependencias en el backend** | Autenticación, router y hash de contraseñas están escritos sobre APIs web estándar |

### Por qué el backend no es .NET

El desarrollador viene de .NET, y era la opción natural. No se pudo, por un motivo concreto:
Cloudflare Workers corre **V8 isolates**, que ejecutan JavaScript, TypeScript y WebAssembly. No hay
CLR. La única forma de correr .NET en Cloudflare es a través de Containers, que requiere plan pago e
infraestructura adicional.

Para el alcance de esta prueba, resolverlo nativo en la plataforma era más barato y más rápido que
montar una segunda infraestructura para el API.

### Decisiones que vale la pena mirar

**El filtro por rol vive en el servidor.** Cada consulta SQL incluye la condición de alcance según
el usuario del token. Un vendedor no recibe del API ni un solo registro que no sea suyo, aunque
fuerce los parámetros a mano. Si el filtro estuviera en Angular, cualquiera abre las herramientas de
desarrollo y ve la cartera completa — que es exactamente el problema que había que resolver. Hay un
script que lo comprueba:

```bash
bash scripts/verificar-seguridad.sh https://crm-scalerics.felipetrias.workers.dev
```

42 comprobaciones: sesión ausente, tokens adulterados, lectura y escritura de datos ajenos,
operaciones reservadas al dueño y aislamiento de las carteras en los listados.

**"Días sin contacto" no se guarda como columna.** Se calcula con `MAX(fecha)` sobre la bitácora.
Guardarlo desnormalizado obliga a mantenerlo sincronizado y tarde o temprano se desincroniza.

**"Días sin compra" es una métrica distinta.** Un cliente puede tener una visita de la semana pasada
y no comprar hace ocho meses. Con una sola métrica ese caso no aparece en ningún lado. Como no hay
tabla de pedidos —la facturación está fuera de alcance— se usa como referencia la oportunidad ganada
más reciente.

**Nada se borra.** Los clientes se dan de baja lógicamente. La bitácora es el activo que la empresa
no quiere perder.

---

## Cómo levantarlo

Requiere **Node 22.22.3 o superior** (Angular 22 no compila con Node 20) y una cuenta de Cloudflare.

```bash
npm ci
```

```bash
npx wrangler login
```

Crear la base y aplicar el esquema y los datos de prueba:

```bash
npx wrangler d1 create scalerics-crm
```

Copiar el `database_id` que devuelve a `wrangler.jsonc`, con el binding llamado `DB`, y después:

```bash
npx wrangler d1 execute scalerics-crm --local --file=./db/schema.sql
```

```bash
npx wrangler d1 execute scalerics-crm --local --file=./db/seed.sql
```

Definir el secreto que firma las sesiones. En local, un archivo `.dev.vars` en la raíz:

```
JWT_SECRET=algo-largo-y-aleatorio-solo-para-desarrollo
```

Y levantar:

```bash
npm run preview
```

Queda en `http://localhost:8788`. **`ng serve` no sirve para probar la API**: no pasa por el punto de
entrada del Worker, así que no hay `/api` ni base de datos.

### Desplegar

```bash
npx wrangler secret put JWT_SECRET
```

```bash
npm run deploy
```

Ese comando compila Angular y publica el Worker. El despliegue tarda unos segundos en propagarse:
si se prueba inmediatamente, puede responder todavía la versión anterior.

### Regenerar los datos de prueba

```bash
node db/generar-seed.ts
```

Reescribe `db/seed.sql` con fechas relativas a hoy, así los datos no envejecen.

---

## Credenciales de demo

Contraseña `demo1234` para todos.

| Rol | Email | Ve |
|---|---|---|
| Dueño | `gustavo@scalerics.com.uy` | Los 40 clientes, el panel y la reasignación de cartera |
| Vendedor | `martin@scalerics.com.uy` | Sus 10 clientes |
| Vendedor | `lucia@scalerics.com.uy` | Sus 8 clientes |
| Vendedor | `rodrigo@scalerics.com.uy` | Sus 10 clientes |
| Vendedor | `valeria@scalerics.com.uy` | Sus 12 clientes |

Los datos son ficticios pero del rubro: hoteles, sanatorios, colegios, restaurantes y clubes de
Montevideo y Canelones, con 204 interacciones y 61 oportunidades repartidas.

---

## Estado actual

### Funciona

- Login con contraseña, sesión en cookie `httpOnly` firmada
- Clientes: alta, edición, baja lógica, buscador
- Contactos por cliente, con contacto principal
- Bitácora de interacciones con alta rápida
- Cartera por vendedor, con el filtro aplicado en el servidor
- **Reasignación de cartera** y baja de vendedores
- Pipeline de seis etapas con montos por columna
- **Clientes en riesgo** por las dos métricas
- Motor de alertas con cron diario
- Panel del dueño
- Todo funciona en celular

### No funciona todavía

- **El envío automático de WhatsApp.** El botón abre la conversación con el mensaje escrito, pero
  hay que apretar enviar. El motivo está explicado abajo
- El historial de cambios de etapa. Por eso "presupuestos enviados" en el panel es una aproximación:
  cuenta las oportunidades que pasaron de "contactado"
- Recuperación de contraseña
- Adjuntar archivos a una interacción

---

## Alcance

### Fuera de alcance por decisión

Facturación, stock, integración contable, aplicación nativa, geolocalización, firma digital,
multiempresa, comisiones, importación de Excel y generación de PDF. Ninguna de esas cosas resuelve
el problema que se planteó, y todas alargan el plazo.

### WhatsApp: qué se puede y qué no

El envío automático de mensajes **no se implementó**, y no es una limitación técnica del sistema.
Requiere la API de WhatsApp Business de Meta: verificación de la empresa, un número dedicado y
plantillas de mensaje aprobadas por Meta. Son trámites con plazos de días que no dependen del
desarrollo.

Lo que sí está hecho:

- El cron genera las alertas de verdad, todos los días a las 8:00 de la mañana
- La alerta aparece en la aplicación, con el cliente y hace cuánto que no compra
- Un botón abre WhatsApp con el número del contacto principal y **el mensaje ya redactado**, con los
  días reales metidos en el texto

En la práctica el vendedor toca el botón y aprieta enviar. Cuando la empresa complete el trámite con
Meta, el paso que falta es conectar el envío: el resto ya está.

---

## Roadmap

**Fase 1 — antes de la temporada alta de octubre**
Cargar los clientes reales, poner el logo de la empresa, capacitar a los vendedores y ajustar los
umbrales de las alertas según cómo compra cada rubro.

**Fase 2 — cuando esté el trámite con Meta**
Envío automático de WhatsApp. Recordatorios de la próxima acción agendada.

**Fase 3**
Historial de cambios de etapa, para medir cuánto tarda una oportunidad en cada instancia. Metas por
vendedor. Informe mensual por email al dueño.

**Fase 4**
Registro de pedidos, que convierte "días sin compra" de una aproximación en un dato exacto, y abre
la puerta a sugerir reposición según el consumo de cada cliente.

---

## Documentación

- [`CLAUDE.md`](CLAUDE.md) — contexto del proyecto, modelo de datos y trampas conocidas
- [`docs/arquitectura.md`](docs/arquitectura.md) — decisiones técnicas y por qué
- [`docs/requerimientos.md`](docs/requerimientos.md) — el pedido del cliente y cómo se tradujo
- [`db/schema.sql`](db/schema.sql) — esquema de la base, comentado
