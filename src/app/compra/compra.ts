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
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { CompraService } from './compra.service';
import {
  EntradaCompra,
  PaymentIntentResponse,
  PaymentResult,
  ReservaResponse,
  ColaEstado,
} from './compra.models';

@Component({
  selector: 'app-compra',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './compra.html',
  styleUrl: './compra.css',
})
export class CompraComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('paymentElementHost') paymentElementHost?: ElementRef<HTMLDivElement>;

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly compraService = inject(CompraService);
  private readonly platformId = inject(PLATFORM_ID);

  entradas = signal<EntradaCompra[]>([]);
  seleccionadas = signal<number[]>([]);
  reserva = signal<ReservaResponse | null>(null);
  paymentIntent = signal<PaymentIntentResponse | null>(null);
  resultadoPago = signal<PaymentResult | null>(null);
  colaEstado = signal<ColaEstado | null>(null);

  cargando = signal(true);
  reservando = signal(false);
  procesandoPago = signal(false);
  error = signal('');

  private espectaculoId = 0;

  private stripe: any = null;
  private elements: any = null;
  private paymentElement: any = null;

  private queueAccessToken = '';

  private colaTimerId: ReturnType<typeof setTimeout> | null = null;

  private permitirSalida = false;
  private destroyed = false;

  private beforeUnloadListener: ((event: BeforeUnloadEvent) => void) | null = null;
  private popstateListener: ((event: PopStateEvent) => void) | null = null;

  async ngOnInit() {
    this.espectaculoId = Number(this.route.snapshot.paramMap.get('espectaculoId') ?? 0);

    if (!this.espectaculoId || Number.isNaN(this.espectaculoId)) {
      this.error.set('No se ha indicado un espectáculo válido.');
      this.cargando.set(false);
      return;
    }

    if (this.isBrowser()) {
      /*
       * Si el usuario recargó o cerró la pestaña con una reserva activa,
       * intentamos limpiarla al volver a entrar.
       *
       * Ojo: esto depende de cómo CompraService guarde la reserva activa.
       * Lo ideal es que use sessionStorage y no localStorage para evitar
       * interferencias entre pestañas.
       */
      if (this.compraService.tieneReservaActiva()) {
        try {
          await firstValueFrom(this.compraService.cancelarPago());
        } catch (error) {
          console.error('Error cancelando reserva anterior:', error);
        } finally {
          this.compraService.limpiaReservaActiva();
        }
      }

      this.setupExitHandlers();
    }

    await this.cargarEntradas();
  }

  ngAfterViewInit() {
    const paymentIntent = this.paymentIntent();

    if (paymentIntent && this.isBrowser()) {
      void this.mountStripeElement(paymentIntent);
    }
  }

  ngOnDestroy() {
    this.destroyed = true;
    this.clearColaTimer();
    this.unmountPaymentElement();
    this.removeExitHandlers();
  }

  private isBrowser() {
    return isPlatformBrowser(this.platformId);
  }

  private setupExitHandlers() {
    if (!this.isBrowser()) {
      return;
    }

    this.beforeUnloadListener = (event: BeforeUnloadEvent) => {
      if (!this.debeProtegerSalida()) {
        return;
      }

      /*
       * Importante:
       * No cancelamos aquí la reserva.
       *
       * beforeunload no es fiable para peticiones HTTP y, además,
       * si cancelásemos aquí, podríamos borrar la reserva aunque el usuario
       * pulse "Cancelar" y decida quedarse en la página.
       *
       * Para cierres/recargas, la reserva debe caducar en backend por TTL.
       */
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', this.beforeUnloadListener);

    /*
     * Creamos un estado artificial para poder interceptar el botón atrás.
     */
    window.history.pushState({ compraGuard: true }, '', window.location.href);

    this.popstateListener = () => {
      void this.handlePopstate();
    };

    window.addEventListener('popstate', this.popstateListener);
  }

  private async handlePopstate() {
    if (!this.isBrowser()) {
      return;
    }

    if (!this.debeProtegerSalida()) {
      this.permitirSalida = true;
      this.removePopstateListener();
      window.history.back();
      return;
    }

    const confirmar = window.confirm('¿Seguro que quieres salir? Se cancelará la reserva.');

    if (!confirmar) {
      window.history.pushState({ compraGuard: true }, '', window.location.href);
      return;
    }

    const cancelada = await this.handleCancelReserva({
      permitirSalidaDespues: true,
      recargarEntradas: false,
    });

    if (cancelada) {
      this.removePopstateListener();
      window.history.back();
    } else {
      window.history.pushState({ compraGuard: true }, '', window.location.href);
    }
  }

  private removeExitHandlers() {
    this.removeBeforeUnloadListener();
    this.removePopstateListener();
  }

  private removeBeforeUnloadListener() {
    if (!this.isBrowser()) {
      return;
    }

    if (this.beforeUnloadListener) {
      window.removeEventListener('beforeunload', this.beforeUnloadListener);
      this.beforeUnloadListener = null;
    }
  }

  private removePopstateListener() {
    if (!this.isBrowser()) {
      return;
    }

    if (this.popstateListener) {
      window.removeEventListener('popstate', this.popstateListener);
      this.popstateListener = null;
    }
  }

  private debeProtegerSalida() {
    return !this.permitirSalida && !!(this.reserva() || this.paymentIntent());
  }

  isSelected(entradaId: number) {
    return this.seleccionadas().includes(entradaId);
  }

  toggleEntrada(entradaId: number, checked: boolean) {
    if (this.paymentIntent() || this.reservando() || this.procesandoPago()) {
      return;
    }

    if (checked) {
      this.seleccionadas.set([...new Set([...this.seleccionadas(), entradaId])]);
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
    if (this.reservando() || this.procesandoPago() || this.paymentIntent()) {
      return;
    }

    const entradasSeleccionadas = [...new Set(this.seleccionadas())];

    if (entradasSeleccionadas.length === 0) {
      this.error.set('Selecciona al menos una entrada para continuar.');
      return;
    }

    this.error.set('');
    this.resultadoPago.set(null);
    this.reservando.set(true);
    this.permitirSalida = false;

    let reservaCreada = false;

    try {
      const reserva = await firstValueFrom(
        this.compraService.reservarEntradas(entradasSeleccionadas, this.queueAccessToken)
      );

      if (this.destroyed) {
        return;
      }

      reservaCreada = true;
      this.reserva.set(reserva);

      /*
       * Marcamos la reserva activa justo después de reservar.
       * Así también cubrimos el caso en el que falle createPaymentIntent().
       */
      this.compraService.marcaReservaActiva();

      const paymentIntent = await firstValueFrom(this.compraService.createPaymentIntent());

      if (this.destroyed) {
        return;
      }

      this.paymentIntent.set(paymentIntent);

      const mounted = await this.mountStripeElement(paymentIntent);

      if (!mounted) {
        await this.cancelarReservaSilenciosamente();
        this.resetPaymentState();
      }
    } catch (error) {
      if (reservaCreada) {
        await this.cancelarReservaSilenciosamente();
        this.resetPaymentState();
      }

      this.error.set(this.toMessage(error));
    } finally {
      this.reservando.set(false);
    }
  }

  async confirmarPago() {
    if (this.procesandoPago()) {
      return;
    }

    if (!this.isBrowser()) {
      this.error.set('El pago solo puede confirmarse desde el navegador.');
      return;
    }

    if (!this.stripe || !this.elements) {
      this.error.set('El formulario de Stripe aún no está listo.');
      return;
    }

    this.error.set('');
    this.procesandoPago.set(true);

    try {
      /*
       * Recomendado por Stripe con Payment Element.
       * Valida el formulario antes de confirmar.
       */
      if (this.elements.submit) {
        const submitResult = await this.elements.submit();

        if (submitResult?.error) {
          this.error.set(submitResult.error.message ?? 'Revisa los datos del pago.');
          return;
        }
      }

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

      const paymentIntentId = result.paymentIntent?.id;

      if (!paymentIntentId) {
        this.error.set('Stripe no ha devuelto un identificador de pago válido.');
        return;
      }

      const estado = await firstValueFrom(this.compraService.confirmarPago(paymentIntentId));

      if (this.destroyed) {
        return;
      }

      this.resultadoPago.set(estado);

      if (estado.status === 'succeeded') {
        this.compraService.limpiaReservaActiva();

        this.permitirSalida = true;
        this.unmountPaymentElement();

        this.reserva.set(null);
        this.paymentIntent.set(null);
        this.seleccionadas.set([]);

        await this.cargarEntradas();
      }
    } catch (error) {
      this.error.set(this.toMessage(error));
    } finally {
      this.procesandoPago.set(false);
    }
  }

  async cancelarReserva() {
    if (this.reservando() || this.procesandoPago()) {
      return;
    }

    await this.handleCancelReserva({
      permitirSalidaDespues: false,
      recargarEntradas: true,
    });
  }

  async irAlCatalogo(event: Event) {
    event.preventDefault();

    if (this.debeProtegerSalida()) {
      const confirmar = this.isBrowser()
        ? window.confirm('¿Seguro que quieres salir? Se cancelará la reserva.')
        : true;

      if (!confirmar) {
        return;
      }

      const cancelada = await this.handleCancelReserva({
        permitirSalidaDespues: true,
        recargarEntradas: false,
      });

      if (!cancelada) {
        return;
      }
    }

    this.permitirSalida = true;
    this.removeExitHandlers();

    await this.router.navigate(['/']);
  }

  private async handleCancelReserva(options: {
    permitirSalidaDespues: boolean;
    recargarEntradas: boolean;
  }): Promise<boolean> {
    this.error.set('');

    try {
      await firstValueFrom(this.compraService.cancelarPago());

      if (this.destroyed) {
        return true;
      }

      this.compraService.limpiaReservaActiva();
      this.resetPaymentState();

      this.permitirSalida = options.permitirSalidaDespues;

      if (options.recargarEntradas) {
        await this.cargarEntradas();
      }

      return true;
    } catch (error) {
      this.error.set(this.toMessage(error));
      this.permitirSalida = false;
      return false;
    }
  }

  private async cancelarReservaSilenciosamente() {
    try {
      await firstValueFrom(this.compraService.cancelarPago());
    } catch (error) {
      console.error('Error cancelando reserva de forma silenciosa:', error);
    } finally {
      this.compraService.limpiaReservaActiva();
    }
  }

  private async cargarEntradas() {
    if (this.destroyed) {
      return;
    }

    this.cargando.set(true);

    try {
      const entradas = await firstValueFrom(
        this.compraService.getEntradasDisponibles(this.espectaculoId, this.queueAccessToken)
      );

      if (this.destroyed) {
        return;
      }

      this.entradas.set(entradas);
    } catch (error) {
      if (this.isQueueRequiredError(error)) {
        await this.entrarEnCola();
      } else {
        this.error.set(this.toMessage(error));
      }
    } finally {
      this.cargando.set(false);
    }
  }

  private async entrarEnCola() {
    try {
      const estado = await firstValueFrom(this.compraService.entrarEnCola(this.espectaculoId));

      if (this.destroyed) {
        return;
      }

      await this.actualizarCola(estado);
      this.startColaPolling();
    } catch (error) {
      this.error.set(this.toMessage(error));
    }
  }

  private startColaPolling() {
    this.clearColaTimer();

    const poll = async () => {
      if (this.destroyed || this.colaEstado()?.turnoActivo) {
        return;
      }

      try {
        /*
         * Idealmente, estadoCola debería identificar al usuario con cookie,
         * sesión o token de cola en el backend.
         *
         * Si tu CompraService acepta el queueAccessToken, pásalo también aquí.
         */
        const estado = await firstValueFrom(this.compraService.estadoCola(this.espectaculoId));

        if (this.destroyed) {
          return;
        }

        await this.actualizarCola(estado);

        if (!this.destroyed && !this.colaEstado()?.turnoActivo) {
          this.colaTimerId = setTimeout(poll, 3000);
        }
      } catch (error) {
        this.error.set(this.toMessage(error));
        this.clearColaTimer();
      }
    };

    this.colaTimerId = setTimeout(poll, 3000);
  }

  private async actualizarCola(estado: ColaEstado) {
    this.colaEstado.set(estado);

    if (estado.accessToken) {
      this.queueAccessToken = estado.accessToken;
    }

    if (estado.turnoActivo) {
      this.clearColaTimer();
      await this.cargarEntradas();
    }
  }

  private clearColaTimer() {
    if (this.colaTimerId) {
      clearTimeout(this.colaTimerId);
      this.colaTimerId = null;
    }
  }

  private async mountStripeElement(paymentIntent: PaymentIntentResponse): Promise<boolean> {
    if (!this.isBrowser()) {
      return false;
    }

    const host = await this.waitForHost();

    if (!host) {
      this.error.set('No se ha podido cargar el contenedor del formulario de pago.');
      return false;
    }

    this.unmountPaymentElement();

    const stripeFactory = (window as Window & { Stripe?: (key: string) => any }).Stripe;

    if (!stripeFactory) {
      this.error.set('No se ha cargado Stripe.js.');
      return false;
    }

    try {
      this.stripe = stripeFactory(paymentIntent.publicKey);

      this.elements = this.stripe.elements({
        clientSecret: paymentIntent.clientSecret,
        appearance: {
          theme: 'stripe',
        },
      });

      this.paymentElement = this.elements.create('payment');
      this.paymentElement.mount(host);

      return true;
    } catch (error) {
      this.unmountPaymentElement();
      this.error.set(this.toMessage(error));
      return false;
    }
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

    /*
     * Importante:
     * Al cancelar manualmente, el usuario sigue en la pantalla.
     * Por eso no dejamos permitirSalida en true salvo que se indique explícitamente.
     */
  }

  private async waitForHost(): Promise<HTMLDivElement | null> {
    for (let attempt = 0; attempt < 10; attempt++) {
      const host = this.paymentElementHost?.nativeElement;

      if (host) {
        return host;
      }

      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    return null;
  }

  private isQueueRequiredError(error: unknown) {
    const httpError = error as {
      status?: number;
      error?: {
        code?: string;
        message?: string;
      };
      message?: string;
    };

    const code = httpError?.error?.code;
    const message = this.toMessage(error).toLowerCase();

    /*
     * Lo ideal es que el backend devuelva un código estable:
     * { code: 'QUEUE_REQUIRED', message: '...' }
     *
     * Mantengo el fallback por texto para no romper tu implementación actual.
     */
    return (
      code === 'QUEUE_REQUIRED' ||
      code === 'QUEUE_TURN_REQUIRED' ||
      message.includes('cola') ||
      message.includes('turno')
    );
  }

  private toMessage(error: unknown) {
    const httpError = error as {
      error?: {
        message?: string;
      };
      message?: string;
    };

    return httpError?.error?.message ?? httpError?.message ?? 'Ha ocurrido un error inesperado.';
  }
}