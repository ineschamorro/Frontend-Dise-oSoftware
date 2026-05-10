export interface EntradaCompra {
  id: number;
  descripcion: string;
  precio: number;
}

export interface ReservaResponse {
  precioTotal: number;
  numeroEntradas: number;
}

export interface PaymentIntentResponse {
  publicKey: string;
  clientSecret: string;
  paymentIntentId: string;
  amount: number;
  currency: string;
}

export interface PaymentResult {
  status: string;
  message: string;
  amount: number;
  currency: string;
  entradasConfirmadas: number;
}

export interface ColaEstado {
  requiereCola: boolean;
  taquillaAbierta: boolean;
  enCola: boolean;
  turnoActivo: boolean;
  posicion: number;
  personasDelante: number;
  segundosTurnoRestantes: number;
  accessToken?: string;
  aperturaTaquilla?: string;
  entradasAgotadas?: boolean;
  message: string;
}
