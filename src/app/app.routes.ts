import { Routes } from '@angular/router';
import { CompraComponent } from './compra/compra';
import { Espectaculos } from './espectaculos/espectaculos';

export const routes: Routes = [
    {path: "", component: Espectaculos},
    {path: "comprar", component: CompraComponent}
];
