import { Component, signal, Signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Espectaculos as EspectaculosService } from '../espectaculos';

@Component({
  selector: 'app-espectaculos',
  imports: [CommonModule],
  templateUrl: './espectaculos.html',
  styleUrl: './espectaculos.css',
})
export class Espectaculos {
    escenarios = signal<any[]>([]);
    escenarioSeleccionado = signal<any | null>(null);
    espectaculoSeleccionado = signal<any | null>(null);
    entradasSeleccionadas = signal<any[]>([]);
    cargandoEscenarios = signal(false);
    cargandoEspectaculos = signal(false);
    cargandoEntradas = signal(false);

	constructor(private espectaculoService: EspectaculosService, private router: Router){}

	getEscenarios(){
		if (this.cargandoEscenarios()) return;
		
		this.cargandoEscenarios.set(true);
		this.espectaculoService.getEscenarios().subscribe(
            (response: any) => {
                this.escenarios.set(response);
                this.escenarioSeleccionado.set(null);
                this.espectaculoSeleccionado.set(null);
                this.entradasSeleccionadas.set([]);
                this.cargandoEscenarios.set(false);
            },
            (error: any) => {
                console.error('Error', error);
                this.cargandoEscenarios.set(false);
            }
        );
	}

    getEspectaculos(escenario: any){
        if (this.cargandoEspectaculos()) return;
        
        this.cargandoEspectaculos.set(true);
        this.escenarioSeleccionado.set(escenario);
        this.espectaculoSeleccionado.set(null);
        this.entradasSeleccionadas.set([]);
        
		this.espectaculoService.getEspectaculos(escenario).subscribe(
            (response: any) => {
                escenario.espectaculos = response;
                this.cargandoEspectaculos.set(false);
            },
            (error: any) => {
                console.error('Error', error);
                this.cargandoEspectaculos.set(false);
            }
        );
	}
/*
    getNumeroDeEntradas(espectaculo: any){
        if (this.cargandoEntradas()) return;
        
        this.cargandoEntradas.set(true);
        this.espectaculoSeleccionado.set(espectaculo);
        this.entradasSeleccionadas.set([]);
        
		this.espectaculoService.getNumeroDeEntradas(espectaculo).subscribe(
            (response: any) => {
                this.entradasSeleccionadas.set(response);
                this.getEntradasLibres(espectaculo);
                this.cargandoEntradas.set(false);
            },
            (error: any) => {
                console.error('Error', error);
                this.cargandoEntradas.set(false);
            }
        );
	}
*/

getNumeroDeEntradas(espectaculo: any){
        if (this.cargandoEntradas()) return;
        
        this.cargandoEntradas.set(true);
        this.espectaculoSeleccionado.set(espectaculo);
        this.entradasSeleccionadas.set([]);
        
		this.espectaculoService.getNumeroDeEntradasComoDto(espectaculo).subscribe(
            (response: any) => {
                espectaculo.entradas=response;
                this.cargandoEntradas.set(false);
            },
            (error: any) => {
                console.error('Error', error);
                this.cargandoEntradas.set(false);
            }
        );
	}
    
    irAComprarEntradas(){
        this.router.navigate(['/comprar']);
    }
/*
    getEntradasLibres(espectaculo: any){
		this.espectaculoService.getEntradasLibres(espectaculo).subscribe(
            (response: any) => {
                espectaculo.entradasLibres = response;
            },
            (error: any) => {
                console.error('Error', error);
                this.cargandoEntradas.set(false);
            }
        );
	}
*/
}
