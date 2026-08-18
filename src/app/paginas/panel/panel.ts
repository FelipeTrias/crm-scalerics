import { Component, afterNextRender, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Api, mensajeDeError } from '../../nucleo/api';

interface Resumen {
  clientes_totales: number;
  clientes_activos: number;
  prospectos: number;
  monto_en_pipeline: number;
  interacciones_semana: number;
  alertas_pendientes: number;
  clientes_en_riesgo: number;
}

interface PorVendedor {
  id: number;
  nombre: string;
  clientes: number;
  interacciones_semana: number;
  presupuestos_en_curso: number;
  presupuestos_enviados: number;
  monto_vendido: number;
}

interface PorEstado {
  estado: string;
  cantidad: number;
  monto_total: number;
}

interface RiesgoVendedor {
  vendedor_id: number;
  vendedor_nombre: string;
  clientes_en_riesgo: number;
}

/**
 * Panel del dueño.
 *
 * Es la reunion de los lunes con numeros en vez de "esta todo en proceso".
 * Sin graficos: cifras grandes y legibles, que es lo que se pidio.
 */
@Component({
  selector: 'app-panel',
  imports: [RouterLink],
  template: `
    <div class="titulo">
      <h2>Panel</h2>
      <span class="apagado">Toda la empresa</span>
    </div>

    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    }

    @if (cargando()) {
      <p class="vacio">Cargando panel...</p>
    } @else if (resumen(); as r) {
      <div class="cifras">
        <div class="cifra">
          <span class="valor num">{{ r.clientes_totales }}</span>
          <span class="etiqueta">Clientes</span>
          <span class="detalle apagado">{{ r.clientes_activos }} activos &middot; {{ r.prospectos }} prospectos</span>
        </div>

        <a class="cifra alerta" routerLink="/riesgo">
          <span class="valor num">{{ r.clientes_en_riesgo }}</span>
          <span class="etiqueta">En riesgo</span>
          <span class="detalle">Ver la lista &rarr;</span>
        </a>

        <div class="cifra">
          <span class="valor num">{{ moneda(r.monto_en_pipeline) }}</span>
          <span class="etiqueta">Presupuestado</span>
          <span class="detalle apagado">Esperando respuesta</span>
        </div>

        <div class="cifra">
          <span class="valor num">{{ r.interacciones_semana }}</span>
          <span class="etiqueta">Contactos de la semana</span>
          <span class="detalle apagado">&Uacute;ltimos 7 d&iacute;as</span>
        </div>
      </div>

      <section class="caja bloque">
        <h3>Por vendedor</h3>
        <div class="desplazable">
          <table>
            <thead>
              <tr>
                <th>Vendedor</th>
                <th>Clientes</th>
                <th>En riesgo</th>
                <th>Contactos semana</th>
                <th>Presup. en curso</th>
                <th>Presup. enviados</th>
                <th>Vendido</th>
              </tr>
            </thead>
            <tbody>
              @for (v of porVendedor(); track v.id) {
                <tr>
                  <td class="principal">{{ v.nombre }}</td>
                  <td class="num">{{ v.clientes }}</td>
                  <td class="num">
                    <span class="chip" [class]="riesgoDe(v.id) > 0 ? 'rojo' : 'verde'">{{ riesgoDe(v.id) }}</span>
                  </td>
                  <td class="num" [class.cero]="v.interacciones_semana === 0">{{ v.interacciones_semana }}</td>
                  <td class="num">{{ v.presupuestos_en_curso }}</td>
                  <td class="num">{{ v.presupuestos_enviados }}</td>
                  <td class="num plata">{{ moneda(v.monto_vendido) }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <p class="nota apagado">
          "Presup. enviados" cuenta todos los presupuestos que emiti&oacute; cada vendedor,
          hayan terminado en venta o no.
        </p>
      </section>

      <section class="caja bloque">
        <h3>Pedidos por estado</h3>
        <div class="etapas">
          @for (e of ESTADOS; track e.valor) {
            <div class="etapa">
              <span class="nombre-etapa">{{ e.texto }}</span>
              <span class="valor-etapa num">{{ estadoDe(e.valor).cantidad }}</span>
              <span class="monto-etapa num apagado">{{ moneda(estadoDe(e.valor).monto_total) }}</span>
            </div>
          }
        </div>
      </section>
    }
  `,
  styles: `
    .titulo {
      display: flex;
      align-items: baseline;
      gap: 10px;
      margin-bottom: 12px;
    }

    .error {
      margin-bottom: 12px;
    }

    .cifras {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 10px;
      margin-bottom: 12px;
    }

    .cifra {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: 14px;
      background: var(--superficie);
      border: 1px solid var(--borde);
      border-radius: var(--radio);
      color: inherit;
      text-decoration: none;
    }

    .cifra .valor {
      font-size: 1.9rem;
      font-weight: 700;
      line-height: 1.05;
      letter-spacing: -0.02em;
    }

    .cifra .detalle {
      font-size: 0.75rem;
    }

    a.cifra.alerta {
      border-left: 4px solid var(--rojo);
    }

    a.cifra.alerta .valor {
      color: var(--rojo);
    }

    a.cifra.alerta .detalle {
      color: var(--azul-700);
      font-weight: 600;
    }

    a.cifra:hover {
      background: var(--gris-100);
    }

    .bloque {
      padding: 14px;
      margin-bottom: 12px;
    }

    .bloque h3 {
      margin-bottom: 10px;
      font-size: 0.95rem;
    }

    .plata {
      font-weight: 650;
    }

    /* Un cero en contactos de la semana es justo el dato que hay que ver */
    .cero {
      color: var(--rojo);
      font-weight: 700;
    }

    .nota {
      margin: 10px 0 0;
      font-size: 0.75rem;
    }

    .etapas {
      display: grid;
      grid-template-columns: repeat(6, 1fr);
      gap: 8px;
    }

    .etapa {
      display: flex;
      flex-direction: column;
      gap: 1px;
      padding: 10px;
      background: var(--gris-100);
      border-radius: var(--radio);
    }

    .nombre-etapa {
      font-size: 0.7rem;
      font-weight: 650;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--gris-700);
    }

    .valor-etapa {
      font-size: 1.4rem;
      font-weight: 700;
      line-height: 1.1;
    }

    .monto-etapa {
      font-size: 0.72rem;
    }

    @media (max-width: 900px) {
      .cifras {
        grid-template-columns: repeat(2, 1fr);
      }

      .etapas {
        grid-template-columns: repeat(2, 1fr);
      }
    }
  `,
})
export class Panel {
  private readonly api = inject(Api);

  protected readonly ESTADOS = [
    { valor: 'presupuesto', texto: 'Presupuesto' },
    { valor: 'confirmado', texto: 'Confirmado' },
    { valor: 'entregado', texto: 'Entregado' },
    { valor: 'perdido', texto: 'Perdido' },
    { valor: 'anulado', texto: 'Anulado' },
  ] as const;

  protected readonly resumen = signal<Resumen | null>(null);
  protected readonly porVendedor = signal<PorVendedor[]>([]);
  protected readonly porEstado = signal<PorEstado[]>([]);
  protected readonly riesgoPorVendedor = signal<RiesgoVendedor[]>([]);
  protected readonly cargando = signal(true);
  protected readonly error = signal('');

  constructor() {
    afterNextRender(() => void this.cargar());
  }

  protected moneda(valor: number): string {
    return '$ ' + Math.round(valor).toLocaleString('es-UY');
  }

  protected estadoDe(estado: string): PorEstado {
    return this.porEstado().find((e) => e.estado === estado) ?? { estado, cantidad: 0, monto_total: 0 };
  }

  protected riesgoDe(vendedorId: number): number {
    return this.riesgoPorVendedor().find((r) => r.vendedor_id === vendedorId)?.clientes_en_riesgo ?? 0;
  }

  private async cargar(): Promise<void> {
    this.cargando.set(true);
    this.error.set('');
    try {
      const r = await this.api.get<{
        resumen: Resumen;
        por_vendedor: PorVendedor[];
        por_estado: PorEstado[];
        riesgo_por_vendedor: RiesgoVendedor[];
      }>('/dashboard');
      this.resumen.set(r.resumen);
      this.porVendedor.set(r.por_vendedor);
      this.porEstado.set(r.por_estado);
      this.riesgoPorVendedor.set(r.riesgo_por_vendedor);
    } catch (e) {
      this.error.set(mensajeDeError(e, 'No se pudo cargar el panel'));
    } finally {
      this.cargando.set(false);
    }
  }
}
