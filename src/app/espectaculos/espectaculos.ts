import { Component } from '@angular/core';
import { Espectaculos as EspectaculosService } from '../espectaculos';

@Component({
  selector: 'app-espectaculos',
  imports: [],
  templateUrl: './espectaculos.html',
  styleUrl: './espectaculos.css',
})
export class Espectaculos {
  escenarios: any = [];

  constructor(private espectaculoService: EspectaculosService) {}

  getEscenarios() {
    this.espectaculoService.getEscenarios().subscribe({
      next: (response) => {
        this.escenarios = response
      },
      error: (error) => {
        console.error('Error al obtener los escenarios:', error);
      }
    });
  }

  getEspectaculos(escenario: any) {
    this.espectaculoService.getEspectaculos(escenario).subscribe({
      next: (response: any) => {
        escenario.espectaculos = response
      },
      error: (error: any) => {
        console.error('Error al obtener los espectaculos:', error);
      }
    });
  }

}
