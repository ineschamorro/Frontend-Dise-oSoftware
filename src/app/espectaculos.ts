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
    return this.http.get(`http://localhost:8080/busqueda/getEspectaculos?${escenario.id}`);
  }
  
}
