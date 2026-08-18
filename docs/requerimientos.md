# Requerimientos

## El pedido, textual

Lo que el cliente escribió, sin editar:

> Nosotros vendemos insumos de limpieza a empresas, tenemos 4 vendedores en la calle y hoy cada uno
> maneja su cartera en un excel propio, algunos ni eso, tienen todo en el celular. El problema es que
> yo no tengo idea de qué está pasando. **Si un vendedor se va, se lleva los contactos y perdemos el
> cliente.**
>
> Lo que necesito es un sistema donde estén todos los clientes cargados, con los datos de contacto, y
> que se pueda ir anotando cada vez que se los llama o se los visita. Que cada vendedor vea su
> cartera, y que yo pueda entrar y ver todo, quién está haciendo qué, cuántos presupuestos mandó cada
> uno, esas cosas.
>
> También quiero saber en qué está cada oportunidad, o sea si es un contacto nuevo, si ya se le pasó
> precio, si está por cerrar. Hoy eso me lo dicen de palabra en la reunión de los lunes y siempre
> está todo "en proceso", nunca sé bien.
>
> Ah y algo importante, que me avise cuando hace mucho que no se contacta a alguien. **Tengo clientes
> que compraban todos los meses y hace medio año no compran y nadie se dio cuenta.** Si eso pudiera
> salir por whatsapp directo al vendedor sería ideal, mi cuñado me dijo que eso se puede hacer.
>
> Lo tiene que poder usar gente que no es muy de la computadora, tiene que ser simple, tipo el excel
> que usamos ahora pero mejor. Que también ande en el celular porque están todo el día afuera.
>
> Los colores de la empresa son azul y gris, te paso el logo por whatsapp.
>
> Necesito tenerlo andando lo antes posible porque en octubre arranca la temporada fuerte.

---

## Lectura del pedido

El pedido literal es "un sistema donde estén los clientes cargados". El problema real es otro, y
aparece en la primera frase: **la cartera de clientes hoy es propiedad del vendedor, no de la
empresa.**

Eso cambia las prioridades. Un CRM que solo guarde clientes y anotaciones resuelve la mitad. Lo que
cierra el problema es que los datos sean de la empresa y que se puedan mover de un vendedor a otro
sin perder el historial.

### Un matiz que cambia el diseño

El cliente pide dos cosas que suenan iguales y no lo son:

- *"que me avise cuando hace mucho que no se contacta a alguien"* → **días sin contacto**
- *"compraban todos los meses y hace medio año no compran"* → **días sin compra**

Un cliente puede tener una visita de la semana pasada y no comprar hace ocho meses. Si el sistema
midiera solo el contacto, ese cliente no aparecería en ninguna alerta — y es el caso que el dueño
describió con más énfasis.

Por eso el sistema mide las dos cosas por separado. En los datos de prueba hay tres clientes
exactamente en esa situación, para poder mostrarlo.

---

## Requerimientos funcionales

| # | Requerimiento | Origen | Estado |
|---|---|---|---|
| R1 | Registro de clientes con datos de contacto | "todos los clientes cargados" | ✅ |
| R2 | Varios contactos por cliente, con uno principal | "los datos de contacto" | ✅ |
| R3 | Bitácora de llamadas y visitas | "ir anotando cada vez que se los llama" | ✅ |
| R4 | Cada vendedor ve solo su cartera | "que cada vendedor vea su cartera" | ✅ |
| R5 | El dueño ve todo | "que yo pueda entrar y ver todo" | ✅ |
| R6 | Presupuestos enviados por vendedor | "cuántos presupuestos mandó cada uno" | ⚠️ aproximado |
| R7 | Etapa de cada oportunidad | "si ya se le pasó precio, si está por cerrar" | ✅ |
| R8 | Alerta por falta de contacto | "que me avise cuando hace mucho que no se contacta" | ✅ |
| R9 | Alerta por falta de compra | "hace medio año no compran" | ✅ |
| R10 | Aviso por WhatsApp al vendedor | "que salga por whatsapp" | ⚠️ parcial |
| R11 | Reasignación de cartera | "si un vendedor se va, se lleva los contactos" | ✅ |
| R12 | Uso en celular | "están todo el día afuera" | ✅ |
| R13 | Simple para gente poco técnica | "no es muy de la computadora" | ✅ |
| R14 | Colores de la empresa | "azul y gris" | ✅ |

**R6 aproximado:** no se guarda el historial de cambios de etapa, así que se cuentan las
oportunidades que superaron la etapa "contactado". El panel muestra también el número exacto de
presupuestos en curso.

**R10 parcial:** el envío automático requiere la API de WhatsApp Business de Meta, con verificación
de empresa y plantillas aprobadas. El botón abre la conversación con el mensaje redactado; falta
apretar enviar.

**R11 no estaba pedido explícitamente** como funcionalidad, pero es la respuesta directa a la primera
frase del pedido. Se agregó al alcance por eso.

---

## Requerimientos no funcionales

| # | Requerimiento | Cómo se cumple |
|---|---|---|
| N1 | Un vendedor no puede acceder a datos de otro | Filtro en la consulta SQL del servidor, verificado por script |
| N2 | Registrar una interacción en menos de 15 segundos | Modal de 4 campos, un solo obligatorio. Medido: ~3 segundos |
| N3 | Usable con una mano, parado | Áreas táctiles de 44px, navegación inferior en celular |
| N4 | Densidad de información | Filas compactas, 12 clientes visibles sin scroll en escritorio |
| N5 | Vocabulario del negocio | "cartera", "presupuesto enviado", "visita". Nada de jerga técnica |
| N6 | Las contraseñas no se guardan en claro | PBKDF2 con `crypto.subtle`, 100.000 iteraciones, salt por usuario |

---

## Fuera de alcance

Facturación, stock, integración contable, aplicación nativa, geolocalización, firma digital,
multiempresa, comisiones, importación de Excel y generación de PDF.

Ninguna resuelve el problema planteado y todas alargan el plazo. La temporada alta arranca en
octubre.
