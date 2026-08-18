import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

/**
 * Cliente de la API.
 *
 * La sesion viaja en una cookie httpOnly, asi que no hay ningun token que el
 * front tenga que guardar ni mandar a mano. Tampoco hay filtrado por vendedor
 * de este lado: cada endpoint ya devuelve solo lo que el usuario puede ver.
 */
@Injectable({ providedIn: 'root' })
export class Api {
  private readonly http = inject(HttpClient);

  private parametros(filtros?: Record<string, string | number | boolean | undefined | null>): HttpParams {
    let params = new HttpParams();
    for (const [clave, valor] of Object.entries(filtros ?? {})) {
      if (valor !== undefined && valor !== null && valor !== '') {
        params = params.set(clave, String(valor));
      }
    }
    return params;
  }

  get<T>(ruta: string, filtros?: Record<string, string | number | boolean | undefined | null>): Promise<T> {
    return firstValueFrom(
      this.http.get<T>('/api' + ruta, { params: this.parametros(filtros), withCredentials: true }),
    );
  }

  post<T>(ruta: string, cuerpo: unknown): Promise<T> {
    return firstValueFrom(this.http.post<T>('/api' + ruta, cuerpo, { withCredentials: true }));
  }

  patch<T>(ruta: string, cuerpo: unknown): Promise<T> {
    return firstValueFrom(this.http.patch<T>('/api' + ruta, cuerpo, { withCredentials: true }));
  }

  borrar<T>(ruta: string): Promise<T> {
    return firstValueFrom(this.http.delete<T>('/api' + ruta, { withCredentials: true }));
  }
}

/**
 * Saca el mensaje que mando el servidor. La API siempre responde
 * { error: "..." } en castellano, asi que se muestra tal cual;
 * el texto generico es solo para cuando ni siquiera hubo respuesta.
 */
export function mensajeDeError(error: unknown, generico = 'No se pudo completar la operacion'): string {
  if (error instanceof HttpErrorResponse) {
    const cuerpo = error.error as { error?: string } | null;
    if (cuerpo?.error) return cuerpo.error;
    if (error.status === 0) return 'No hay conexion con el servidor';
  }
  return generico;
}
