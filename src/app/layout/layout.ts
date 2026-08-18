import { Component, afterNextRender, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Api } from '../nucleo/api';
import { Sesion } from '../nucleo/sesion';

/**
 * Armazon de la aplicacion.
 *
 * En escritorio la navegacion es una barra lateral con icono y nombre. En
 * celular NO se convierte en un cajon lateral: pasa a una barra fija abajo,
 * que es donde llega el pulgar. Los vendedores la usan parados en la calle y
 * con una sola mano; un menu lateral obligaria a dos toques y a estirar el
 * dedo hasta arriba para abrirlo.
 *
 * Los nombres son los del negocio: "Mi cartera", "Pedidos", "Catalogo".
 * Nada de "pipeline" ni "dashboard".
 */
@Component({
  selector: 'app-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <aside class="lateral">
      <div class="marca">
        <div class="logo" aria-hidden="true">S</div>
        <div class="nombre">
          <strong>Scalerics</strong>
          <span>Insumos de limpieza</span>
        </div>
      </div>

      <nav>
        <a routerLink="/clientes" routerLinkActive="activo">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true">
            <path d="M3 7h18v12H3z" />
            <path d="M8 7V5h8v2" />
          </svg>
          Mi cartera
        </a>
        <a routerLink="/riesgo" routerLinkActive="activo">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true">
            <path d="M12 4l9 16H3z" />
            <path d="M12 10v4" />
            <path d="M12 17h.01" />
          </svg>
          En riesgo
          @if (avisos() > 0) {
            <span class="contador">{{ avisos() }}</span>
          }
        </a>
        <a routerLink="/pedidos" routerLinkActive="activo">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true">
            <path d="M8 4h9a2 2 0 012 2v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6a2 2 0 012-2h1z" />
            <path d="M9 3h6v3H9z" />
            <path d="M9 11h6" />
            <path d="M9 15h4" />
          </svg>
          Pedidos
        </a>
        <a routerLink="/productos" routerLinkActive="activo">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true">
            <path d="M4 7l8-4 8 4v10l-8 4-8-4z" />
            <path d="M4 7l8 4 8-4" />
            <path d="M12 11v10" />
          </svg>
          Cat&aacute;logo
        </a>
        @if (sesion.esAdmin()) {
          <a routerLink="/panel" routerLinkActive="activo">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true">
              <path d="M4 19V9" />
              <path d="M10 19V5" />
              <path d="M16 19v-7" />
              <path d="M22 19H2" />
            </svg>
            Panel
          </a>
        }
      </nav>
    </aside>

    <div class="principal">
      <header class="barra">
        <div class="marca-chica">
          <div class="logo" aria-hidden="true">S</div>
          <strong>Scalerics</strong>
        </div>
        <div class="usuario">
          <span class="nombre-usuario">{{ sesion.usuario()?.nombre }}</span>
          <button type="button" class="salir" (click)="salir()">Salir</button>
        </div>
      </header>

      <main class="contenido">
        <router-outlet />
      </main>
    </div>

    <nav class="nav-celular">
      <a routerLink="/clientes" routerLinkActive="activo">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
          <path d="M3 7h18v12H3z" />
          <path d="M8 7V5h8v2" />
        </svg>
        Cartera
      </a>
      <a routerLink="/riesgo" routerLinkActive="activo">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
          <path d="M12 4l9 16H3z" />
          <path d="M12 10v4" />
          <path d="M12 17h.01" />
        </svg>
        En riesgo
        @if (avisos() > 0) {
          <span class="punto" aria-label="hay avisos nuevos"></span>
        }
      </a>
      <a routerLink="/pedidos" routerLinkActive="activo">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
          <path d="M8 4h9a2 2 0 012 2v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6a2 2 0 012-2h1z" />
          <path d="M9 3h6v3H9z" />
          <path d="M9 11h6" />
        </svg>
        Pedidos
      </a>
      @if (sesion.esAdmin()) {
        <a routerLink="/panel" routerLinkActive="activo">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
            <path d="M4 19V9" />
            <path d="M10 19V5" />
            <path d="M16 19v-7" />
            <path d="M22 19H2" />
          </svg>
          Panel
        </a>
      }
    </nav>
  `,
  styles: `
    :host {
      display: grid;
      grid-template-columns: 232px 1fr;
      min-height: 100dvh;
    }

    /* ─────────────────────── Barra lateral ─────────────────────── */

    .lateral {
      position: sticky;
      top: 0;
      display: flex;
      flex-direction: column;
      gap: 6px;
      height: 100dvh;
      padding: 14px 10px;
      background: var(--azul-900);
      color: #fff;
      overflow-y: auto;
    }

    .marca {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 4px 8px 14px;
    }

    /* Espacio reservado: el logo real lo manda el cliente */
    .logo {
      display: grid;
      place-items: center;
      width: 36px;
      height: 36px;
      flex: none;
      border-radius: 50%;
      background: var(--azul-500);
      font-weight: 700;
    }

    .marca .nombre {
      display: flex;
      flex-direction: column;
      line-height: 1.15;
      min-width: 0;
    }

    .marca strong {
      font-size: 0.98rem;
      font-weight: 650;
      letter-spacing: -0.01em;
    }

    .marca span {
      font-size: 0.7rem;
      color: #a9c2dd;
    }

    .lateral nav {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .lateral nav a {
      display: flex;
      align-items: center;
      gap: 10px;
      min-height: 44px;
      padding: 0 10px;
      border-radius: var(--radio);
      color: #c8dcef;
      text-decoration: none;
      font-size: 0.9rem;
      font-weight: 550;
    }

    .lateral nav a:hover {
      background: rgb(255 255 255 / 0.08);
      color: #fff;
    }

    .lateral nav a.activo {
      background: var(--azul-500);
      color: #fff;
      font-weight: 650;
    }

    .lateral nav svg {
      width: 19px;
      height: 19px;
      flex: none;
    }

    .contador {
      margin-left: auto;
      min-width: 22px;
      padding: 1px 6px;
      border-radius: 999px;
      background: var(--rojo);
      color: #fff;
      font-size: 0.7rem;
      font-weight: 700;
      text-align: center;
      font-variant-numeric: tabular-nums;
    }

    .punto {
      position: absolute;
      top: 8px;
      margin-left: 26px;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--rojo);
    }

    .nav-celular a {
      position: relative;
    }

    /* ─────────────────────── Columna principal ─────────────────────── */

    .principal {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }

    .barra {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 10px;
      padding: 10px var(--margen-lateral);
      background: var(--superficie);
      border-bottom: 1px solid var(--borde);
    }

    .marca-chica {
      display: none;
      align-items: center;
      gap: 8px;
      margin-right: auto;
    }

    .marca-chica .logo {
      width: 32px;
      height: 32px;
      font-size: 0.9rem;
    }

    .usuario {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 0.85rem;
    }

    .nombre-usuario {
      color: var(--texto-suave);
    }

    .salir {
      min-height: 36px;
      padding: 0 12px;
      border: 1px solid var(--borde);
      border-radius: 6px;
      background: var(--superficie);
      color: var(--texto);
      font: inherit;
      font-size: 0.82rem;
      font-weight: 600;
      cursor: pointer;
    }

    .salir:hover {
      background: var(--gris-100);
    }

    .contenido {
      flex: 1;
      width: 100%;
      padding: 16px var(--margen-lateral) 24px;
    }

    /* ─────────────────────── Celular ─────────────────────── */

    .nav-celular {
      display: none;
      position: sticky;
      bottom: 0;
      border-top: 1px solid var(--borde);
      background: var(--superficie);
    }

    .nav-celular a {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 2px;
      min-height: var(--alto-nav);
      text-decoration: none;
      color: var(--gris-700);
      font-size: 0.68rem;
      font-weight: 600;
    }

    .nav-celular a.activo {
      color: var(--azul-700);
    }

    .nav-celular svg {
      width: 20px;
      height: 20px;
    }

    @media (max-width: 900px) {
      :host {
        grid-template-columns: 1fr;
      }

      .lateral {
        display: none;
      }

      .nav-celular {
        display: flex;
      }

      /* Sin barra lateral, la marca vuelve al encabezado */
      .barra {
        padding: 10px 12px;
        background: var(--azul-900);
        border-bottom: 0;
        color: #fff;
      }

      .marca-chica {
        display: flex;
      }

      .nombre-usuario {
        display: none;
      }

      .salir {
        min-height: 44px;
        padding: 0 14px;
        border-color: rgb(255 255 255 / 0.28);
        background: transparent;
        color: #fff;
      }

      .salir:hover {
        background: rgb(255 255 255 / 0.1);
      }

      .contenido {
        padding: 12px 12px 20px;
      }
    }
  `,
})
export class Layout {
  protected readonly sesion = inject(Sesion);
  private readonly router = inject(Router);
  private readonly api = inject(Api);

  /**
   * Avisos que dejo el cron sin mirar. Es lo unico que "llega" al vendedor sin
   * que vaya a buscarlo, hasta que se pueda mandar el WhatsApp automatico.
   */
  protected readonly avisos = signal(0);

  constructor() {
    afterNextRender(() => void this.contarAvisos());
  }

  private async contarAvisos(): Promise<void> {
    try {
      const r = await this.api.get<{ alertas: unknown[] }>('/alertas');
      this.avisos.set(r.alertas.length);
    } catch {
      // Un contador que falla no tiene que romper la navegacion.
      this.avisos.set(0);
    }
  }

  async salir(): Promise<void> {
    await this.sesion.cerrar();
    await this.router.navigate(['/login']);
  }
}
