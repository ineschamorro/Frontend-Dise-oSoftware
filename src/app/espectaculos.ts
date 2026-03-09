import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

@Injectable({
  providedIn: 'root',
})
export class Espectaculos {

  constructor(private http: HttpClient) {}

  getEscenarios(){
    return this.http.get('http://localhost:8080/busqueda/getEscenarios');
  }

  getEspectaculos(escenario: any){
    return this.http.get(`http://localhost:8080/busqueda/getEspectaculos/${escenario.id}`);
  }

  
  getNumeroDeEntradas(espectaculo: any){
    return this.http.get(`http://localhost:8080/busqueda/getNumeroDeEntradas?espectaculoId=${espectaculo.id}`);
  }

  getEntradasLibres(espectaculo: any){
    return this.http.get(`http://localhost:8080/busqueda/getEntradasLibres?espectaculoId=${espectaculo.id}`);
  }

  getNumeroDeEntradasComoDto(espectaculo: any){
    return this.http.get(`http://localhost:8080/busqueda/getNumeroDeEntradasComoDto?espectaculoId=${espectaculo.id}`);
  }
  
}
