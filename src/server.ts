import { AngularAppEngine, createRequestHandler } from '@angular/ssr';
import { manejarApi } from './api/index';
import { generarAlertas } from './api/motor-alertas';
import type { Entorno } from './api/tipos';

const angularApp = new AngularAppEngine({
  // Si se agrega un dominio, va aca tambien. Sin esto Angular responde
  // 'Header "host" with value "..." is not allowed.' y la app no carga.
  // 127.0.0.1 esta porque wrangler dev anuncia esa forma, no "localhost".
  allowedHosts: ['localhost', '127.0.0.1', 'crm-scalerics.felipetrias.workers.dev'],
});

/**
 * Handler que usa el Angular CLI (dev-server y build). No sacar el export
 * nombrado: si desaparece, `ng serve` deja de funcionar.
 */
export const reqHandler = createRequestHandler(async (req) => {
  const res = await angularApp.handle(req);

  return res ?? new Response('Page not found.', { status: 404 });
});

/**
 * Punto de entrada del Worker.
 *
 * createRequestHandler de Angular solo recibe el Request, nunca el env, asi que
 * no hay forma de llegar al binding de D1 desde adentro del SSR. Por eso el
 * Worker exporta su propio fetch: atiende /api/* con el env completo y le
 * delega todo lo demas a Angular.
 *
 * Ojo: `ng serve` no pasa por aca. Para probar la API hay que usar
 * `npm run preview`, que hace build y levanta wrangler dev.
 */
export default {
  async fetch(request: Request, env: Entorno, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/')) {
      return manejarApi(request, env, ctx);
    }

    // El handler de Angular solo acepta el Request: no necesita env ni ctx.
    const res = await reqHandler(request);
    return res ?? new Response('Page not found.', { status: 404 });
  },

  /**
   * Cron diario. Montevideo es UTC-3 todo el año (Uruguay no tiene horario de
   * verano desde 2015), asi que "0 11 * * *" son las 8:00 de la maniana:
   * el vendedor se entera al arrancar el dia, no a media tarde.
   */
  async scheduled(_event: ScheduledController, env: Entorno, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      generarAlertas(env.DB).then(
        (r) => console.log('Alertas generadas:', JSON.stringify(r)),
        (e) => console.error('Fallo la generacion de alertas', e),
      ),
    );
  },
};
