import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { CompraService } from './compra.service';
import { PaymentResult } from './compra.models';

@Component({
  selector: 'app-compra-resultado',
  imports: [CommonModule, RouterLink],
  templateUrl: './compra-resultado.html',
  styleUrl: './compra-resultado.css',
})
export class CompraResultadoComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly compraService = inject(CompraService);

  cargando = signal(true);
  error = signal('');
  resultado = signal<PaymentResult | null>(null);

  async ngOnInit() {
    const paymentIntentId = this.route.snapshot.queryParamMap.get('payment_intent');
    if (!paymentIntentId) {
      this.error.set('No se ha recibido un identificador de pago válido.');
      this.cargando.set(false);
      return;
    }

    try {
      const resultado = await firstValueFrom(this.compraService.confirmarPago(paymentIntentId));
      this.resultado.set(resultado);
      if (resultado.status === 'succeeded') {
        this.compraService.limpiaReservaActiva();
      }
    } catch (error) {
      this.error.set(this.toMessage(error));
    } finally {
      this.cargando.set(false);
    }
  }

  async liberarReservas() {
    try {
      await firstValueFrom(this.compraService.cancelarPago());
      this.compraService.limpiaReservaActiva();
      this.resultado.set(null);
      this.error.set('Reservas liberadas. Ya puedes volver a intentarlo.');
    } catch (error) {
      this.error.set(this.toMessage(error));
    }
  }

  formatEuros(amount: number | undefined) {
    return ((amount ?? 0) / 100).toFixed(2);
  }

  private toMessage(error: unknown) {
    const httpError = error as { error?: { message?: string }; message?: string };
    return httpError?.error?.message ?? httpError?.message ?? 'Ha ocurrido un error inesperado.';
  }
}
