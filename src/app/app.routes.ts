import { Routes } from '@angular/router';
import { CompraComponent } from './compra/compra';
import { CompraResultadoComponent } from './compra/compra-resultado';
import { Espectaculos } from './espectaculos/espectaculos';

export const routes: Routes = [
  { path: '', component: Espectaculos },
  { path: 'comprar/resultado', component: CompraResultadoComponent },
  { path: 'comprar/:espectaculoId', component: CompraComponent },
];
