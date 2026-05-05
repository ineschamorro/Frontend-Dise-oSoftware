import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { forkJoin, map, of, switchMap } from 'rxjs';
import { API_BASE_URL } from './api.config';

export interface EspectaculoResultado {
  id: number;
  artista: string;
  fecha: string;
  escenario: string;
}

export interface EntradaDisponible {
  id: number;
  descripcion: string;
  precio: number;
}

@Injectable({
  providedIn: 'root',
})
export class Espectaculos {

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

  getEntradasDisponibles(espectaculoId: number) {
    return this.http.get<EntradaDisponible[]>(
      `${API_BASE_URL}/busqueda/getEntradasDisponibles?espectaculoId=${espectaculoId}`,
      { withCredentials: true },
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
  
}
