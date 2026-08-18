import { AngularAppEngine, createRequestHandler } from '@angular/ssr';
import { manejarApi } from './api/index';
import type { Entorno } from './api/tipos';

const angularApp = new AngularAppEngine({
  allowedHosts: ['localhost', 'crm-scalerics.felipetrias.workers.dev'],
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
};
