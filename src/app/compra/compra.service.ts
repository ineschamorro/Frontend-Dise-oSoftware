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
      { withCredentials: true },
    );
  }

  confirmarPago(paymentIntentId: string) {
    const params = new HttpParams().set('paymentIntentId', paymentIntentId);
    return this.http.post<PaymentResult>(`${API_BASE_URL}/pagos/confirmar`, {}, { params, withCredentials: true });
  }

  cancelarPago() {
    return this.http.post<void>(`${API_BASE_URL}/pagos/cancelar`, {}, { withCredentials: true });
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
