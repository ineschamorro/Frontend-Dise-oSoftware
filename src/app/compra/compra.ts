import { CommonModule, isPlatformBrowser } from '@angular/common';
import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  PLATFORM_ID,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { CompraService } from './compra.service';
import {
  EntradaCompra,
  PaymentIntentResponse,
  PaymentResult,
  ReservaResponse,
} from './compra.models';

@Component({
  selector: 'app-compra',
  imports: [CommonModule, RouterLink],
  templateUrl: './compra.html',
  styleUrl: './compra.css',
})
export class CompraComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('paymentElementHost') paymentElementHost?: ElementRef<HTMLDivElement>;

  private readonly route = inject(ActivatedRoute);
  private readonly compraService = inject(CompraService);
  private readonly platformId = inject(PLATFORM_ID);

  entradas = signal<EntradaCompra[]>([]);
  seleccionadas = signal<number[]>([]);
  reserva = signal<ReservaResponse | null>(null);
  paymentIntent = signal<PaymentIntentResponse | null>(null);
  resultadoPago = signal<PaymentResult | null>(null);
  cargando = signal(true);
  reservando = signal(false);
  procesandoPago = signal(false);
  error = signal('');

  private espectaculoId = 0;
  private stripe: any = null;
  private elements: any = null;
  private paymentElement: any = null;

  async ngOnInit() {
    this.espectaculoId = Number(this.route.snapshot.paramMap.get('espectaculoId') ?? 0);
    if (!this.espectaculoId) {
      this.error.set('No se ha indicado un espectaculo valido.');
      this.cargando.set(false);
      return;
    }
    await this.cargarEntradas();
  }

  ngAfterViewInit() {
    if (this.paymentIntent() && isPlatformBrowser(this.platformId)) {
      void this.mountStripeElement(this.paymentIntent()!);
    }
  }

  ngOnDestroy() {
    this.unmountPaymentElement();
  }

  isSelected(entradaId: number) {
    return this.seleccionadas().includes(entradaId);
  }

  toggleEntrada(entradaId: number, checked: boolean) {
    if (this.paymentIntent()) {
      return;
    }
    if (checked) {
      this.seleccionadas.set([...this.seleccionadas(), entradaId]);
      return;
    }
    this.seleccionadas.set(this.seleccionadas().filter((id) => id !== entradaId));
  }

  totalSeleccionado() {
    const seleccion = new Set(this.seleccionadas());
    return this.entradas()
      .filter((entrada) => seleccion.has(entrada.id))
      .reduce((total, entrada) => total + entrada.precio, 0);
  }

  formatEuros(amount: number | undefined) {
    return ((amount ?? 0) / 100).toFixed(2);
  }

  async prepararPago() {
    if (this.seleccionadas().length === 0) {
      this.error.set('Selecciona al menos una entrada para continuar.');
      return;
    }

    this.error.set('');
    this.resultadoPago.set(null);
    this.reservando.set(true);

    try {
      const reserva = await firstValueFrom(this.compraService.reservarEntradas(this.seleccionadas()));
      this.reserva.set(reserva);
      const paymentIntent = await firstValueFrom(this.compraService.createPaymentIntent());
      this.paymentIntent.set(paymentIntent);
      await this.mountStripeElement(paymentIntent);
    } catch (error) {
      this.error.set(this.toMessage(error));
    } finally {
      this.reservando.set(false);
    }
  }

  async confirmarPago() {
    if (!this.stripe || !this.elements) {
      this.error.set('El formulario de Stripe aun no esta listo.');
      return;
    }

    this.error.set('');
    this.procesandoPago.set(true);

    try {
      const result = await this.stripe.confirmPayment({
        elements: this.elements,
        confirmParams: {
          return_url: `${window.location.origin}/comprar/resultado`,
        },
        redirect: 'if_required',
      });

      if (result.error) {
        this.error.set(result.error.message ?? 'No se ha podido confirmar el pago.');
        return;
      }

      if (result.paymentIntent?.id) {
        const estado = await firstValueFrom(this.compraService.confirmarPago(result.paymentIntent.id));
        this.resultadoPago.set(estado);
        if (estado.status === 'succeeded') {
          this.unmountPaymentElement();
          this.paymentIntent.set(null);
          this.reserva.set(null);
          this.seleccionadas.set([]);
          await this.cargarEntradas();
        }
      }
    } catch (error) {
      this.error.set(this.toMessage(error));
    } finally {
      this.procesandoPago.set(false);
    }
  }

  async cancelarReserva() {
    this.error.set('');
    try {
      await firstValueFrom(this.compraService.cancelarPago());
      this.resetPaymentState();
      await this.cargarEntradas();
    } catch (error) {
      this.error.set(this.toMessage(error));
    }
  }

  private async cargarEntradas() {
    this.cargando.set(true);
    try {
      const entradas = await firstValueFrom(this.compraService.getEntradasDisponibles(this.espectaculoId));
      this.entradas.set(entradas);
    } catch (error) {
      this.error.set(this.toMessage(error));
    } finally {
      this.cargando.set(false);
    }
  }

  private async mountStripeElement(paymentIntent: PaymentIntentResponse) {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    await this.waitForHost();
    this.unmountPaymentElement();

    const stripeFactory = (window as Window & { Stripe?: (key: string) => any }).Stripe;
    if (!stripeFactory) {
      this.error.set('No se ha cargado Stripe.js.');
      return;
    }

    this.stripe = stripeFactory(paymentIntent.publicKey);
    this.elements = this.stripe.elements({
      clientSecret: paymentIntent.clientSecret,
      appearance: {
        theme: 'stripe',
      },
    });
    this.paymentElement = this.elements.create('payment');
    this.paymentElement.mount(this.paymentElementHost?.nativeElement);
  }

  private unmountPaymentElement() {
    if (this.paymentElement?.destroy) {
      this.paymentElement.destroy();
    } else if (this.paymentElement?.unmount) {
      this.paymentElement.unmount();
    }
    this.paymentElement = null;
    this.elements = null;
    this.stripe = null;
  }

  private resetPaymentState() {
    this.unmountPaymentElement();
    this.reserva.set(null);
    this.paymentIntent.set(null);
    this.resultadoPago.set(null);
  }

  private async waitForHost() {
    for (let attempt = 0; attempt < 10; attempt++) {
      if (this.paymentElementHost?.nativeElement) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  private toMessage(error: unknown) {
    const httpError = error as { error?: { message?: string }; message?: string };
    return httpError?.error?.message ?? httpError?.message ?? 'Ha ocurrido un error inesperado.';
  }
}
