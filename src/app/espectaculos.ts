import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { API_BASE_URL } from './api.config';

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

  
  getNumeroDeEntradas(espectaculo: any){
    return this.http.get(`${API_BASE_URL}/busqueda/getNumeroDeEntradas?espectaculoId=${espectaculo.id}`, { withCredentials: true });
  }

  getEntradasLibres(espectaculo: any){
    return this.http.get(`${API_BASE_URL}/busqueda/getEntradasLibres?espectaculoId=${espectaculo.id}`, { withCredentials: true });
  }

  getNumeroDeEntradasComoDto(espectaculo: any){
    return this.http.get(`${API_BASE_URL}/busqueda/getNumeroDeEntradasComoDto?espectaculoId=${espectaculo.id}`, { withCredentials: true });
  }
  
}
