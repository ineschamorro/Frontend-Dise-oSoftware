import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { API_BASE_URL } from '../api.config';
import {
  EntradaCompra,
  PaymentIntentResponse,
  PaymentResult,
  ReservaResponse,
  ColaEstado,
} from './compra.models';

@Injectable({
  providedIn: 'root',
})
export class CompraService {
  private static readonly QUEUE_CLIENT_KEY = 'esi.queue.client';
  private static readonly ACTIVE_RESERVATION_KEY = 'esi.active.reservation.v2';

  constructor(private http: HttpClient) {}

  getEntradasDisponibles(espectaculoId: number, queueAccessToken?: string) {
    const headers = this.queueHeaders(queueAccessToken);
    return this.http.get<EntradaCompra[]>(
      `${API_BASE_URL}/busqueda/getEntradasDisponibles?espectaculoId=${espectaculoId}`,
      { withCredentials: true, headers },
    );
  }

  reservarEntradas(entradaIds: number[], queueAccessToken?: string) {
    const headers = this.queueHeaders(queueAccessToken);
    return this.http.put<ReservaResponse>(
      `${API_BASE_URL}/reservas/reservar-lote`,
      { entradaIds },
      { withCredentials: true, headers },
    );
  }

  createPaymentIntent() {
    return this.http.post<PaymentIntentResponse>(
      `${API_BASE_URL}/pagos/payment-intent`,
      {},
      { withCredentials: true, headers: this.queueHeaders() },
    );
  }

  confirmarPago(paymentIntentId: string) {
    const params = new HttpParams().set('paymentIntentId', paymentIntentId);
    return this.http.post<PaymentResult>(`${API_BASE_URL}/pagos/confirmar`, {}, { params, withCredentials: true, headers: this.queueHeaders() });
  }

  cancelarPago() {
    return this.http.post<void>(`${API_BASE_URL}/pagos/cancelar`, {}, { withCredentials: true, headers: this.queueHeaders() });
  }

  marcaReservaActiva() {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(CompraService.ACTIVE_RESERVATION_KEY, 'true');
      console.log('✓ Reserva marcada como activa');
    }
  }

  limpiaReservaActiva() {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(CompraService.ACTIVE_RESERVATION_KEY);
      console.log('✓ Reserva limpiada del localStorage');
    }
  }

  tieneReservaActiva(): boolean {
    if (typeof window === 'undefined') {
      return false;
    }
    const activa = window.localStorage.getItem(CompraService.ACTIVE_RESERVATION_KEY) === 'true';
    console.log('Verificando reserva activa:', activa);
    return activa;
  }

  cancelarPagoEnUnload() {
    // Usar sendBeacon para cancelar de forma confiable en beforeunload
    const url = `${API_BASE_URL}/pagos/cancelar?clientId=${encodeURIComponent(this.queueClientId())}`;
    try {
      navigator.sendBeacon(url, JSON.stringify({}));
      console.log('✓ Enviado beacon para cancelar pago');
    } catch (error) {
      console.error('Error enviando beacon:', error);
      // Intentar con fetch como fallback
      try {
        fetch(url, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
          keepalive: true,
        }).catch(() => {});
      } catch (e) {
        console.error('Error en fallback fetch:', e);
      }
    }
  }

  entrarEnCola(espectaculoId: number) {
    return this.http.post<ColaEstado>(
      `${API_BASE_URL}/colas/join?espectaculoId=${espectaculoId}`,
      {},
      { withCredentials: true, headers: this.queueHeaders() },
    );
  }

  estadoCola(espectaculoId: number) {
    return this.http.get<ColaEstado>(
      `${API_BASE_URL}/colas/status?espectaculoId=${espectaculoId}`,
      { withCredentials: true, headers: this.queueHeaders() },
    );
  }

  private queueHeaders(queueAccessToken?: string) {
    let headers = new HttpHeaders({ 'X-Queue-Client': this.queueClientId() });
    if (queueAccessToken) {
      headers = headers.set('X-Queue-Access', queueAccessToken);
    }
    return headers;
  }

  private queueClientId() {
    if (typeof window === 'undefined') {
      return 'server';
    }

    const existing = window.sessionStorage.getItem(CompraService.QUEUE_CLIENT_KEY);
    if (existing) {
      return existing;
    }

    const generated = window.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    window.sessionStorage.setItem(CompraService.QUEUE_CLIENT_KEY, generated);
    return generated;
  }
}
