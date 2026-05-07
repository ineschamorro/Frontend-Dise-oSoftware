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
  constructor(private http: HttpClient) {}

  getEntradasDisponibles(espectaculoId: number, queueAccessToken?: string) {
    const headers = queueAccessToken ? new HttpHeaders({ 'X-Queue-Access': queueAccessToken }) : undefined;
    return this.http.get<EntradaCompra[]>(
      `${API_BASE_URL}/busqueda/getEntradasDisponibles?espectaculoId=${espectaculoId}`,
      { withCredentials: true, headers },
    );
  }

  reservarEntradas(entradaIds: number[], queueAccessToken?: string) {
    const headers = queueAccessToken ? new HttpHeaders({ 'X-Queue-Access': queueAccessToken }) : undefined;
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
    return this.http.post<ColaEstado>(`${API_BASE_URL}/colas/join?espectaculoId=${espectaculoId}`, {}, { withCredentials: true });
  }

  estadoCola(espectaculoId: number) {
    return this.http.get<ColaEstado>(`${API_BASE_URL}/colas/status?espectaculoId=${espectaculoId}`, { withCredentials: true });
  }
}
