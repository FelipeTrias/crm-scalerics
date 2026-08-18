import { Component, effect, inject, input, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Api, mensajeDeError } from '../../nucleo/api';
import { colorCompra, colorContacto, enlaceWhatsapp, fechaCorta, moneda } from '../../nucleo/formato';
import type { FichaCliente, Pedido } from '../../nucleo/modelos';
import { Sesion } from '../../nucleo/sesion';
import { RegistrarContacto } from './registrar-contacto';

@Component({
  selector: 'app-cliente',
  imports: [RouterLink, RegistrarContacto],
  template: `
    @if (cargando()) {
      <p class="vacio">Cargando ficha...</p>
    } @else if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
      <p><a class="boton secundario" routerLink="/clientes">Volver a la cartera</a></p>
    } @else if (ficha(); as f) {
      <header class="cabecera">
        <div class="identidad">
          <h2>{{ f.cliente.nombre_fantasia || f.cliente.razon_social }}</h2>
          <p class="secundario">{{ f.cliente.razon_social }}</p>
          <div class="marcas">
            <span class="estado" [class]="f.cliente.estado">{{ f.cliente.estado }}</span>
            <span class="chip" [class]="colorContacto(f.cliente.dias_sin_contacto)">
              {{ f.cliente.dias_sin_contacto }}<span class="u">d</span> sin contacto
            </span>
            @if (f.cliente.dias_sin_compra === null) {
              <span class="chip neutro">nunca compr&oacute;</span>
            } @else {
              <span class="chip" [class]="colorCompra(f.cliente.dias_sin_compra)">
                {{ f.cliente.dias_sin_compra }}<span class="u">d</span> sin comprar
              </span>
            }
          </div>
        </div>
        <div class="botonera">
          <a class="boton secundario" [routerLink]="['/clientes', f.cliente.id, 'editar']">Editar</a>
          <button type="button" class="boton grande" (click)="modal().abrir()">Registrar contacto</button>
        </div>
      </header>

      <div class="columnas">
        <section class="caja bloque">
          <h3>Datos</h3>
          <dl class="datos">
            <dt>RUT</dt><dd>{{ f.cliente.rut || '—' }}</dd>
            <dt>Direcci&oacute;n</dt><dd>{{ f.cliente.direccion || '—' }}</dd>
            <dt>Ciudad</dt><dd>{{ f.cliente.ciudad || '—' }}</dd>
            <dt>Rubro</dt><dd>{{ f.cliente.rubro || '—' }}</dd>
            <dt>Vendedor</dt><dd>{{ f.cliente.vendedor_nombre }}</dd>
          </dl>
          @if (f.cliente.notas) {
            <p class="notas">{{ f.cliente.notas }}</p>
          }
        </section>

        <section class="caja bloque">
          <h3>Contactos</h3>
          @if (f.contactos.length === 0) {
            <p class="apagado">Sin contactos cargados.</p>
          } @else {
            <ul class="contactos">
              @for (c of f.contactos; track c.id) {
                <li>
                  <div>
                    <div class="principal">
                      {{ c.nombre }}
                      @if (c.es_principal) { <span class="marca-principal">principal</span> }
                    </div>
                    <div class="secundario">{{ c.cargo || 'Sin cargo' }} · {{ c.telefono || 'sin tel&eacute;fono' }}</div>
                  </div>
                  @if (enlaceDe(c.whatsapp, f); as url) {
                    <a class="boton whatsapp compacto" [href]="url" target="_blank" rel="noopener">WhatsApp</a>
                  }
                </li>
              }
            </ul>
          }
        </section>
      </div>

      <section class="caja bloque">
        <div class="cabecera-bloque">
          <h3>Pedidos <span class="apagado num">({{ pedidos().length }})</span></h3>
          <a class="boton" [routerLink]="['/clientes', f.cliente.id, 'pedido']">Registrar pedido</a>
        </div>

        @if (pedidos().length === 0) {
          <p class="apagado">Este cliente todav&iacute;a no compr&oacute; nada.</p>
        } @else {
          <ul class="pedidos">
            @for (p of pedidos(); track p.id) {
              <li [class.anulado]="p.estado === 'anulado' || p.estado === 'perdido'">
                <div class="cabecera-pedido">
                  <div>
                    <span class="principal num">{{ moneda(p.total) }}</span>
                    <span class="estado-pedido" [class]="p.estado">{{ p.estado }}</span>
                  </div>
                  <span class="secundario num">{{ fechaCorta(p.fecha) }}</span>
                </div>
                <ul class="items">
                  @for (i of p.items; track i.producto_id) {
                    <li>
                      <span class="cant num">{{ i.cantidad }} &times;</span>
                      <span>{{ i.nombre }} <span class="secundario">({{ i.unidad }})</span></span>
                      <span class="num sub">{{ moneda(i.cantidad * i.precio_unitario) }}</span>
                    </li>
                  }
                </ul>
              </li>
            }
          </ul>
        }
      </section>

      <section class="caja bloque">
        <h3>Bit&aacute;cora <span class="apagado num">({{ f.interacciones.length }})</span></h3>
        @if (f.interacciones.length === 0) {
          <p class="apagado">Todav&iacute;a no hay contactos registrados con este cliente.</p>
        } @else {
          <ol class="linea">
            @for (i of f.interacciones; track i.id) {
              <li>
                <div class="fecha num">{{ fechaCorta(i.fecha) }}</div>
                <div class="detalle">
                  <div class="principal">
                    <span class="tipo">{{ i.tipo }}</span>
                    @if (i.resultado) { — {{ i.resultado }} }
                  </div>
                  @if (i.notas) { <p class="notas">{{ i.notas }}</p> }
                  @if (i.proxima_accion) {
                    <p class="proxima">
                      Pr&oacute;xima: {{ i.proxima_accion }}
                      @if (i.proxima_accion_fecha) { · {{ fechaCorta(i.proxima_accion_fecha) }} }
                    </p>
                  }
                  <div class="secundario">Registr&oacute;: {{ i.usuario_nombre }}</div>
                </div>
              </li>
            }
          </ol>
        }
      </section>

      <app-registrar-contacto [clienteId]="f.cliente.id" (registrado)="cargar()" />
    }
  `,
  styles: `
    .cabecera {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      align-items: flex-start;
      gap: 12px;
      margin-bottom: 14px;
    }

    .identidad p {
      margin: 2px 0 8px;
    }

    .marcas {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }

    .botonera {
      display: flex;
      gap: 8px;
    }

    .boton.grande {
      min-height: 52px;
      padding: 0 22px;
      font-size: 1rem;
    }

    .boton.compacto {
      min-height: 36px;
      padding: 0 12px;
      font-size: 0.8rem;
      text-decoration: none;
    }

    .columnas {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      margin-bottom: 12px;
    }

    .bloque {
      padding: 14px;
    }

    .bloque h3 {
      margin-bottom: 10px;
      font-size: 0.95rem;
    }

    .datos {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 4px 14px;
      margin: 0;
      font-size: 0.88rem;
    }

    .datos dt {
      color: var(--texto-suave);
    }

    .datos dd {
      margin: 0;
    }

    .notas {
      margin: 10px 0 0;
      padding-top: 10px;
      border-top: 1px solid var(--borde);
      font-size: 0.88rem;
      color: var(--texto-suave);
    }

    .contactos {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .contactos li {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 10px;
    }

    .marca-principal {
      margin-left: 4px;
      padding: 1px 6px;
      border-radius: 4px;
      background: var(--azul-suave);
      color: var(--azul-700);
      font-size: 0.66rem;
      font-weight: 650;
      text-transform: uppercase;
    }

    .cabecera-bloque {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 10px;
      margin-bottom: 10px;
    }

    .cabecera-bloque h3 {
      margin: 0;
    }

    .pedidos {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .pedidos > li {
      padding: 10px;
      border: 1px solid var(--borde);
      border-radius: var(--radio);
    }

    /* Un pedido anulado no cuenta como compra: tiene que verse distinto */
    .pedidos > li.anulado {
      opacity: 0.6;
    }

    .pedidos > li.anulado .cabecera-pedido .principal {
      text-decoration: line-through;
    }

    .cabecera-pedido {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 10px;
      margin-bottom: 6px;
    }

    .cabecera-pedido .principal {
      font-size: 1rem;
      margin-right: 6px;
    }

    .estado-pedido {
      display: inline-block;
      padding: 1px 8px;
      border-radius: 4px;
      font-size: 0.7rem;
      font-weight: 650;
      text-transform: uppercase;
    }

    .estado-pedido.entregado {
      background: var(--verde-suave);
      color: #1d6b3c;
    }

    .estado-pedido.confirmado {
      background: var(--azul-suave);
      color: var(--azul-700);
    }

    /* Un presupuesto todavia no es una venta: amarillo, esta en el aire */
    .estado-pedido.presupuesto {
      background: var(--amarillo-suave);
      color: #8a6500;
    }

    .estado-pedido.perdido,
    .estado-pedido.anulado {
      background: var(--gris-100);
      color: var(--gris-700);
    }

    .items {
      display: flex;
      flex-direction: column;
      gap: 2px;
      margin: 0;
      padding: 0;
      list-style: none;
      font-size: 0.84rem;
    }

    .items li {
      display: flex;
      gap: 8px;
    }

    .items .cant {
      min-width: 44px;
      color: var(--texto-suave);
      text-align: right;
    }

    .items .sub {
      margin-left: auto;
      white-space: nowrap;
    }

    .linea {
      display: flex;
      flex-direction: column;
      gap: 0;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .linea li {
      display: grid;
      grid-template-columns: 92px 1fr;
      gap: 12px;
      padding: 10px 0;
      border-bottom: 1px solid #eef1f6;
    }

    .linea li:last-child {
      border-bottom: 0;
    }

    .linea .fecha {
      color: var(--texto-suave);
      font-size: 0.82rem;
      padding-top: 1px;
    }

    .tipo {
      text-transform: capitalize;
    }

    .proxima {
      margin: 4px 0 0;
      font-size: 0.82rem;
      color: var(--azul-700);
      font-weight: 550;
    }

    .linea .notas {
      margin: 4px 0 0;
      padding: 0;
      border: 0;
    }

    @media (max-width: 760px) {
      .columnas {
        grid-template-columns: 1fr;
      }

      .botonera {
        width: 100%;
      }

      .botonera .boton {
        flex: 1;
      }

      .linea li {
        grid-template-columns: 1fr;
        gap: 2px;
      }
    }
  `,
})
export class ClienteFicha {
  private readonly api = inject(Api);
  protected readonly sesion = inject(Sesion);

  /** Llega por withComponentInputBinding desde la ruta /clientes/:id */
  readonly id = input.required<string>();

  protected readonly modal = viewChild.required(RegistrarContacto);

  protected readonly colorContacto = colorContacto;
  protected readonly colorCompra = colorCompra;
  protected readonly fechaCorta = fechaCorta;
  protected readonly moneda = moneda;

  protected readonly ficha = signal<FichaCliente | null>(null);
  protected readonly pedidos = signal<Pedido[]>([]);
  protected readonly cargando = signal(true);
  protected readonly error = signal('');

  constructor() {
    // Se recarga sola si se navega de un cliente a otro sin salir de la ruta.
    effect(() => {
      const id = this.id();
      if (typeof window !== 'undefined') void this.cargar(id);
    });
  }

  /** Mensaje ya redactado para retomar contacto, segun hace cuanto que no compra. */
  protected enlaceDe(whatsapp: string | null, f: FichaCliente): string | null {
    const nombre = f.contactos.find((c) => c.whatsapp === whatsapp)?.nombre.split(' ')[0] ?? '';
    const dias = f.cliente.dias_sin_compra;
    const cuanto = dias === null ? 'hace un tiempo' : `hace ${dias} dias`;
    return enlaceWhatsapp(
      whatsapp,
      `Hola ${nombre}, como va? Soy de Scalerics. Vi que no les mandamos insumos ${cuanto} ` +
        `y queria saber como andan de stock para dejarles una cotizacion al dia. ` +
        `Te paso a visitar esta semana?`,
    );
  }

  protected async cargar(id = this.id()): Promise<void> {
    this.cargando.set(true);
    this.error.set('');
    try {
      // Dos pedidos en paralelo: la ficha y el historial de compras.
      const [ficha, pedidos] = await Promise.all([
        this.api.get<FichaCliente>(`/clientes/${id}`),
        this.api.get<{ pedidos: Pedido[] }>(`/clientes/${id}/pedidos`),
      ]);
      this.ficha.set(ficha);
      this.pedidos.set(pedidos.pedidos);
    } catch (e) {
      this.error.set(mensajeDeError(e, 'No se pudo cargar el cliente'));
    } finally {
      this.cargando.set(false);
    }
  }
}
