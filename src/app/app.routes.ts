import { Routes } from '@angular/router';
import { CompraComponent } from './compra/compra';
import { CompraResultadoComponent } from './compra/compra-resultado';
import { Espectaculos } from './espectaculos/espectaculos';
import { ForgotPasswordComponent } from './forgot-password/forgot-password';
import { ResetPasswordComponent } from './reset-password/reset-password';

export const routes: Routes = [
  { path: '', component: Espectaculos },
  { path: 'forgot-password', component: ForgotPasswordComponent },
  { path: 'reset-password', component: ResetPasswordComponent },
  { path: 'comprar/resultado', component: CompraResultadoComponent },
  { path: 'comprar/:espectaculoId', component: CompraComponent },
];
