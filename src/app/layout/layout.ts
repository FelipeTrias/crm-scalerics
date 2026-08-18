import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Sesion } from '../nucleo/sesion';

/**
 * Armazon de la aplicacion.
 *
 * En escritorio la navegacion va arriba; en celular pasa a una barra fija
 * abajo, que es donde llega el pulgar. Los vendedores la usan parados en la
 * calle y con una sola mano.
 */
@Component({
  selector: 'app-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <header class="barra">
      <div class="logo" aria-hidden="true">S</div>
      <div class="marca">
        <strong>Scalerics</strong>
        <span>Insumos de limpieza</span>
      </div>
      <div class="usuario">
        <span class="nombre">{{ sesion.usuario()?.nombre }}</span>
        <button type="button" class="salir" (click)="salir()">Salir</button>
      </div>
    </header>

    <nav class="nav-escritorio">
      <a routerLink="/clientes" routerLinkActive="activo">Mi cartera</a>
      <a routerLink="/riesgo" routerLinkActive="activo">En riesgo</a>
      <a routerLink="/pipeline" routerLinkActive="activo">Pipeline</a>
      <a routerLink="/alertas" routerLinkActive="activo">Alertas</a>
      <a routerLink="/productos" routerLinkActive="activo">Catalogo</a>
      @if (sesion.esAdmin()) {
        <a routerLink="/panel" routerLinkActive="activo">Panel</a>
      }
    </nav>

    <main class="contenido">
      <router-outlet />
    </main>

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
      </a>
      <a routerLink="/pipeline" routerLinkActive="activo">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
          <path d="M4 19V9" />
          <path d="M10 19V5" />
          <path d="M16 19v-7" />
          <path d="M22 19H2" />
        </svg>
        Pipeline
      </a>
      <a routerLink="/alertas" routerLinkActive="activo">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
          <path d="M18 8a6 6 0 10-12 0c0 7-3 8-3 8h18s-3-1-3-8" />
          <path d="M10 21h4" />
        </svg>
        Alertas
      </a>
      @if (sesion.esAdmin()) {
        <a routerLink="/panel" routerLinkActive="activo">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
            <path d="M3 3h8v8H3z" />
            <path d="M13 3h8v5h-8z" />
            <path d="M13 12h8v9h-8z" />
            <path d="M3 15h8v6H3z" />
          </svg>
          Panel
        </a>
      }
    </nav>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      min-height: 100dvh;
    }

    .barra {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px var(--margen-lateral);
      background: var(--azul-900);
      color: #fff;
    }

    /* Espacio reservado: el logo real lo manda el cliente */
    .logo {
      display: grid;
      place-items: center;
      width: 34px;
      height: 34px;
      flex: none;
      border-radius: 50%;
      background: var(--azul-500);
      font-weight: 700;
    }

    .marca {
      display: flex;
      flex-direction: column;
      line-height: 1.15;
      margin-right: auto;
    }

    .marca strong {
      font-size: 0.95rem;
      font-weight: 650;
      letter-spacing: -0.01em;
    }

    .marca span {
      font-size: 0.7rem;
      color: #a9c2dd;
    }

    .usuario {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 0.82rem;
    }

    .usuario .nombre {
      color: #d6e4f2;
    }

    .salir {
      min-height: 36px;
      padding: 0 12px;
      border: 1px solid rgb(255 255 255 / 0.28);
      border-radius: 6px;
      background: transparent;
      color: #fff;
      font: inherit;
      font-size: 0.8rem;
      cursor: pointer;
    }

    .salir:hover {
      background: rgb(255 255 255 / 0.1);
    }

    .nav-escritorio {
      display: flex;
      gap: 2px;
      padding: 0 var(--margen-lateral);
      background: var(--azul-700);
    }

    .nav-escritorio a {
      padding: 9px 14px;
      color: #c8dcef;
      text-decoration: none;
      font-size: 0.85rem;
      font-weight: 550;
      border-bottom: 3px solid transparent;
    }

    .nav-escritorio a:hover {
      color: #fff;
    }

    .nav-escritorio a.activo {
      color: #fff;
      border-bottom-color: #fff;
    }

    .contenido {
      flex: 1;
      width: 100%;
      padding: 16px var(--margen-lateral) 24px;
    }

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

    @media (max-width: 760px) {
      .nav-escritorio {
        display: none;
      }

      .nav-celular {
        display: flex;
      }

      .marca span,
      .usuario .nombre {
        display: none;
      }

      /* En el celular se toca con el dedo: minimo 44px (CLAUDE.md seccion 7) */
      .salir {
        min-height: 44px;
        padding: 0 14px;
      }

      .barra {
        padding: 10px 12px;
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

  async salir(): Promise<void> {
    await this.sesion.cerrar();
    await this.router.navigate(['/login']);
  }
}
