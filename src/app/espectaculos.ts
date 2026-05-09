import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { forkJoin, map, of, switchMap } from 'rxjs';
import { API_BASE_URL } from './api.config';

export interface EspectaculoResultado {
  id: number;
  artista: string;
  fecha: string;
  escenario: string;
  altaDemanda?: boolean;
  aperturaTaquilla?: string;
}

export interface EntradaDisponible {
  id: number;
  descripcion: string;
  precio: number;
}

export interface ColaEstado {
  requiereCola: boolean;
  taquillaAbierta: boolean;
  enCola: boolean;
  turnoActivo: boolean;
  posicion: number;
  personasDelante: number;
  segundosTurnoRestantes: number;
  accessToken?: string;
  aperturaTaquilla?: string;
  entradasAgotadas?: boolean;
  message: string;
}

@Injectable({
  providedIn: 'root',
})
export class Espectaculos {
  private static readonly QUEUE_CLIENT_KEY = 'esi.queue.client';

  constructor(private http: HttpClient) {}

  getEscenarios(){
    return this.http.get(`${API_BASE_URL}/busqueda/getEscenarios`, { withCredentials: true });
  }

  getEspectaculos(escenario: any){
    return this.http.get(`${API_BASE_URL}/busqueda/getEspectaculos/${escenario.id}`, { withCredentials: true });
  }

  buscarEspectaculos(termino: string) {
    const query = termino.trim();

    if (!query) {
      return this.getTodosLosEspectaculos();
    }

    const porArtista = this.http.get<EspectaculoResultado[]>(
      `${API_BASE_URL}/busqueda/getEspectaculos?artista=${encodeURIComponent(query)}`,
      { withCredentials: true },
    );

    const porRecinto = this.http.get<any[]>(`${API_BASE_URL}/busqueda/getEscenarios`, { withCredentials: true }).pipe(
      switchMap((escenarios) => {
        const escenariosFiltrados = escenarios.filter((escenario) =>
          String(escenario?.nombre || '').toLowerCase().includes(query.toLowerCase()),
        );

        if (escenariosFiltrados.length === 0) {
          return of([] as EspectaculoResultado[]);
        }

        return forkJoin(
          escenariosFiltrados.map((escenario) =>
            this.http.get<EspectaculoResultado[]>(
              `${API_BASE_URL}/busqueda/getEspectaculos/${escenario.id}`,
              { withCredentials: true },
            ),
          ),
        ).pipe(map((grupos) => grupos.flat()));
      }),
    );

    return forkJoin([porArtista, porRecinto]).pipe(
      map(([artista, recinto]) => this.sinDuplicados([...artista, ...recinto])),
    );
  }

  getEntradasDisponibles(espectaculoId: number, queueAccessToken?: string) {
    const headers = this.queueHeaders(queueAccessToken);
    return this.http.get<EntradaDisponible[]>(
      `${API_BASE_URL}/busqueda/getEntradasDisponibles?espectaculoId=${espectaculoId}`,
      { withCredentials: true, headers },
    );
  }

  entrarEnCola(espectaculoId: number) {
    return this.http.post<ColaEstado>(
      `${API_BASE_URL}/colas/join?espectaculoId=${espectaculoId}`,
      {},
      { withCredentials: true, headers: this.queueHeaders() },
    );
  }

  estadoCola(espectaculoId: number) {
    return this.http.get<ColaEstado>(
      `${API_BASE_URL}/colas/status?espectaculoId=${espectaculoId}`,
      { withCredentials: true, headers: this.queueHeaders() },
    );
  }

  salirDeCola(espectaculoId: number) {
    return this.http.delete<void>(
      `${API_BASE_URL}/colas/leave?espectaculoId=${espectaculoId}`,
      { withCredentials: true, headers: this.queueHeaders() },
    );
  }

  
  getNumeroDeEntradas(espectaculo: any){
    return this.http.get(`${API_BASE_URL}/busqueda/getNumeroDeEntradas?espectaculoId=${espectaculo.id}`, { withCredentials: true });
  }

  getEntradasLibres(espectaculo: any){
    return this.http.get(`${API_BASE_URL}/busqueda/getEntradasLibres?espectaculoId=${espectaculo.id}`, { withCredentials: true });
  }

  getNumeroDeEntradasComoDto(espectaculo: any){
    return this.http.get(`${API_BASE_URL}/busqueda/getNumeroDeEntradasComoDto?espectaculoId=${espectaculo.id}`, { withCredentials: true });
  }

  private getTodosLosEspectaculos() {
    return this.http.get<any[]>(`${API_BASE_URL}/busqueda/getEscenarios`, { withCredentials: true }).pipe(
      switchMap((escenarios) => {
        if (escenarios.length === 0) {
          return of([] as EspectaculoResultado[]);
        }

        return forkJoin(
          escenarios.map((escenario) =>
            this.http.get<EspectaculoResultado[]>(
              `${API_BASE_URL}/busqueda/getEspectaculos/${escenario.id}`,
              { withCredentials: true },
            ),
          ),
        ).pipe(map((grupos) => this.sinDuplicados(grupos.flat())));
      }),
    );
  }

  private sinDuplicados(espectaculos: EspectaculoResultado[]) {
    const vistos = new Set<number>();

    return espectaculos.filter((espectaculo) => {
      if (vistos.has(espectaculo.id)) {
        return false;
      }

      vistos.add(espectaculo.id);
      return true;
    });
  }

  private queueHeaders(queueAccessToken?: string) {
    let headers = new HttpHeaders({ 'X-Queue-Client': this.queueClientId() });
    if (queueAccessToken) {
      headers = headers.set('X-Queue-Access', queueAccessToken);
    }
    return headers;
  }

  private queueClientId() {
    if (typeof window === 'undefined') {
      return 'server';
    }

    const existing = window.sessionStorage.getItem(Espectaculos.QUEUE_CLIENT_KEY);
    if (existing) {
      return existing;
    }

    const generated = window.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    window.sessionStorage.setItem(Espectaculos.QUEUE_CLIENT_KEY, generated);
    return generated;
  }
  
}
