import { Component, ElementRef, Inject, OnDestroy, OnInit, PLATFORM_ID, ViewChild, computed, signal } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import {
    EntradaDisponible,
    EspectaculoResultado,
    ColaEstado,
    Espectaculos as EspectaculosService,
} from '../espectaculos';
import { USER_API_BASE_URL } from '../api.config';
import { PasswordRulesComponent } from '../password-rules/password-rules';
import { PasswordValidationService } from '../password-validation.service';
import { CompraService } from '../compra/compra.service';
import { PaymentIntentResponse, PaymentResult, ReservaResponse } from '../compra/compra.models';

@Component({
  selector: 'app-espectaculos',
  imports: [CommonModule, FormsModule, PasswordRulesComponent],
  templateUrl: './espectaculos.html',
  styleUrl: './espectaculos.css',
})
export class Espectaculos implements OnInit, OnDestroy {
    @ViewChild('paymentElementHost') paymentElementHost?: ElementRef<HTMLDivElement>;
    private static readonly AUTH_STORAGE_KEY = 'esi.auth.session';

    authModalOpen = signal(false);
    accountPanelOpen = signal(false);
    isLoggedIn = signal(false);
    userDisplayName = signal('');
    authMode = signal<'login' | 'register'>('login');
    registerNombre = signal('');
    registerApellidos = signal('');
    registerUsername = signal('');
    registerFechaNacimiento = signal('');
    authEmail = signal('');
    authPassword = signal('');
    authPasswordRepeat = signal('');
    showPassword = signal(false);
    showPasswordRepeat = signal(false);
    authMessage = signal('');
    authError = signal('');
    authSubmitting = signal(false);
    entradasOpen = signal(true);
    perfilOpen = signal(false);
    configOpen = signal(false);
    searchTerm = signal('');
    searchDate = signal('');
    searchDateText = signal('');
    searchFocused = signal(false);
    searchTouched = signal(false);
    searchLoading = signal(false);
    searchError = signal('');
    appliedSearchTerm = signal('');
    appliedSearchDate = signal('');
    resultsDateText = signal('');
    resultadosBusqueda = signal<EspectaculoResultado[]>([]);
    espectaculosExplora = signal<EspectaculoResultado[]>([]);
    exploraLoading = signal(false);
    exploraError = signal('');
    espectaculoActivo = signal<EspectaculoResultado | null>(null);
    entradasDisponibles = signal<EntradaDisponible[]>([]);
    entradasLoading = signal(false);
    entradasError = signal('');
    entradasSeleccionadasCompra = signal<number[]>([]);
    entradaOrden = signal<'default' | 'priceAsc' | 'visibility'>('default');
    filtroZona = signal('');
    filtroPlanta = signal('');
    filtroFila = signal('');
    filtroButaca = signal('');
    reservaActual = signal<ReservaResponse | null>(null);
    paymentIntent = signal<PaymentIntentResponse | null>(null);
    resultadoPago = signal<PaymentResult | null>(null);
    reservandoCompra = signal(false);
    procesandoPago = signal(false);
    compraError = signal('');
    reservaSeconds = signal(0);
    colaEstado = signal<ColaEstado | null>(null);
    colaLoading = signal(false);
    colaError = signal('');
    queueAccessToken = signal('');
    colaTurnoSeconds = signal(0);
    passwordValid = computed(() => this.passwordValidation.isValid(this.passwordValidationInput()));
    sugerenciasBusqueda = computed(() => {
        const termino = this.normalizeText(this.searchTerm());
        if (termino.length < 1) {
            return [];
        }

        return this.filtrarPorFecha(this.espectaculosExplora())
            .filter((espectaculo) => {
                const texto = this.normalizeText([
                    espectaculo.artista,
                    espectaculo.escenario,
                    espectaculo.fecha,
                ].join(' '));
                return texto.includes(termino);
            })
            .slice(0, 6);
    });
    espectaculosExploraAgrupados = computed(() => this.groupByArtist(this.espectaculosExplora()));
    entradasFiltradas = computed(() => {
        let entradas = this.entradasDisponibles().filter((entrada) => {
            const detalle = this.detalleEntrada(entrada);
            return (!this.filtroZona() || detalle.zona === this.filtroZona())
                && (!this.filtroPlanta() || detalle.planta === this.filtroPlanta())
                && (!this.filtroFila() || detalle.fila === this.filtroFila())
                && (!this.filtroButaca() || detalle.butaca === this.filtroButaca());
        });

        if (this.entradaOrden() === 'priceAsc') {
            entradas = [...entradas].sort((a, b) => a.precio - b.precio);
        } else if (this.entradaOrden() === 'visibility') {
            entradas = [...entradas].sort((a, b) => this.visibilityRank(a) - this.visibilityRank(b));
        }

        return entradas;
    });
    zonasDisponibles = computed(() => this.uniqueEntradaValues('zona'));
    plantasDisponibles = computed(() => this.uniqueEntradaValues('planta'));
    filasDisponibles = computed(() => this.uniqueEntradaValues('fila'));
    butacasDisponibles = computed(() => this.uniqueEntradaValues('butaca'));
    escenarios = signal<any[]>([]);
    escenarioSeleccionado = signal<any | null>(null);
    espectaculoSeleccionado = signal<any | null>(null);
    entradasSeleccionadas = signal<any[]>([]);
    cargandoEscenarios = signal(false);
    cargandoEspectaculos = signal(false);
    cargandoEntradas = signal(false);
    private readonly authGenericError = 'No se ha podido completar la solicitud. Revisa los datos e intentalo de nuevo.';

	constructor(
        private espectaculoService: EspectaculosService,
        private router: Router,
        private http: HttpClient,
        private passwordValidation: PasswordValidationService,
        private compraService: CompraService,
        @Inject(PLATFORM_ID) private platformId: object
    ){}

    private reservaTimerId: ReturnType<typeof setInterval> | null = null;
    private colaTimerId: ReturnType<typeof setInterval> | null = null;
    private colaTurnoTimerId: ReturnType<typeof setInterval> | null = null;
    private stripe: any = null;
    private elements: any = null;
    private paymentElement: any = null;

    ngOnInit(){
        this.restoreAuthSession();
        this.cargarSesion();
        this.cargarExplora();
    }

    ngOnDestroy(){
        this.clearReservaTimer();
        this.clearColaTimer();
        this.clearColaTurnoTimer();
        this.unmountPaymentElement();
    }

    cargarExplora(){
        this.exploraLoading.set(true);
        this.exploraError.set('');

        this.espectaculoService.buscarEspectaculos('').subscribe({
            next: (resultados) => {
                this.espectaculosExplora.set(resultados);
                this.exploraLoading.set(false);
            },
            error: () => {
                this.espectaculosExplora.set([]);
                this.exploraError.set('No se han podido cargar los espectaculos destacados.');
                this.exploraLoading.set(false);
            },
        });
    }

    abrirAuthModal(mode: 'login' | 'register'){
        this.authMode.set(mode);
        this.authModalOpen.set(true);
        this.accountPanelOpen.set(false);
        this.authMessage.set('');
        this.authError.set('');
    }

    cerrarAuthModal(){
        this.authModalOpen.set(false);
    }

    irARecuperarPassword(){
        this.cerrarAuthModal();
        this.router.navigate(['/forgot-password']);
    }

    abrirCuenta(){
        if (!this.isLoggedIn()) {
            this.abrirAuthModal('login');
            return;
        }

        this.accountPanelOpen.set(true);
    }

    cerrarCuenta(){
        this.accountPanelOpen.set(false);
    }

    cerrarSesion(){
        this.http.post(`${USER_API_BASE_URL}/users/logout`, {}, { withCredentials: true }).subscribe({
            next: () => {},
            error: () => {},
        });
        this.isLoggedIn.set(false);
        this.userDisplayName.set('');
        this.accountPanelOpen.set(false);
        this.authEmail.set('');
        this.authPassword.set('');
        this.authPasswordRepeat.set('');
        this.clearStoredAuthSession();
    }

    private cargarSesion(){
        this.http.get<{ nombre?: string; email?: string; username?: string }>(
            `${USER_API_BASE_URL}/users/me`,
            { withCredentials: true },
        ).subscribe({
            next: (user) => {
                this.isLoggedIn.set(true);
                this.userDisplayName.set(user.nombre || user.username || this.formatDisplayName(user.email || ''));
            },
            error: () => {
                this.isLoggedIn.set(false);
                this.userDisplayName.set('');
            },
        });
    }

    buscarDesdeBarra(){
        this.searchTouched.set(true);
        this.searchFocused.set(false);
        this.searchLoading.set(true);
        this.searchError.set('');
        const normalizedSearchDate = this.normalizeDateText(this.searchDateText());
        this.searchDateText.set(normalizedSearchDate);
        this.searchDate.set(this.parseDateText(normalizedSearchDate));
        this.resultsDateText.set(normalizedSearchDate);
        this.appliedSearchTerm.set(this.searchTerm().trim());
        this.appliedSearchDate.set(this.searchDate());
        this.espectaculoActivo.set(null);
        this.entradasDisponibles.set([]);
        this.entradasError.set('');

        this.espectaculoService.buscarEspectaculos(this.searchTerm()).subscribe({
            next: (resultados) => {
                this.resultadosBusqueda.set(this.filtrarPorFecha(resultados));
                this.searchLoading.set(false);
            },
            error: () => {
                this.resultadosBusqueda.set([]);
                this.searchError.set('No se han podido cargar los espectaculos. Comprueba que esientradas este arrancado en localhost:8080.');
                this.searchLoading.set(false);
            },
        });
    }

    verEntradas(espectaculo: EspectaculoResultado){
        this.searchTouched.set(true);
        this.searchLoading.set(false);
        this.searchError.set('');
        this.resetCompraState();
        this.clearColaTimer();
        this.clearColaTurnoTimer();
        this.colaEstado.set(null);
        this.colaError.set('');
        this.queueAccessToken.set('');
        this.espectaculoActivo.set(espectaculo);
        this.entradasDisponibles.set([]);
        this.entradasError.set('');

        if (espectaculo.altaDemanda) {
            this.entradasLoading.set(false);
            this.colaEstado.set({
                requiereCola: true,
                taquillaAbierta: this.isTaquillaOpen(espectaculo),
                enCola: false,
                turnoActivo: false,
                posicion: 0,
                personasDelante: 0,
                segundosTurnoRestantes: 0,
                aperturaTaquilla: espectaculo.aperturaTaquilla,
                message: 'Este espectaculo requiere cola virtual.',
            });
            return;
        }

        this.cargarEntradasConTurno(espectaculo);
    }

    entrarEnColaActual() {
        const espectaculo = this.espectaculoActivo();
        if (!espectaculo) {
            return;
        }
        void this.entrarEnCola(espectaculo);
    }

    formatAperturaTaquilla(value: string | undefined) {
        if (!value) {
            return 'fecha no configurada';
        }
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            return value;
        }
        return new Intl.DateTimeFormat('es-ES', {
            day: '2-digit',
            month: 'long',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        }).format(date);
    }

    colaTurnoTiempo() {
        const minutes = Math.floor(this.colaTurnoSeconds() / 60).toString().padStart(2, '0');
        const seconds = (this.colaTurnoSeconds() % 60).toString().padStart(2, '0');

        return `${minutes}:${seconds}`;
    }

    private isTaquillaOpen(espectaculo: EspectaculoResultado) {
        if (!espectaculo.aperturaTaquilla) {
            return true;
        }
        const apertura = new Date(espectaculo.aperturaTaquilla);
        return Number.isNaN(apertura.getTime()) || apertura.getTime() <= Date.now();
    }

    private cargarEntradasConTurno(espectaculo: EspectaculoResultado) {
        this.entradasLoading.set(true);
        this.espectaculoService.getEntradasDisponibles(espectaculo.id, this.queueAccessToken()).subscribe({
            next: (entradas) => {
                this.entradasDisponibles.set(entradas);
                this.resetEntradaFilters();
                this.entradasLoading.set(false);
            },
            error: () => {
                this.entradasError.set('No se han podido cargar las entradas disponibles para este espectaculo.');
                this.entradasLoading.set(false);
            },
        });
    }

    private async entrarEnCola(espectaculo: EspectaculoResultado) {
        this.colaLoading.set(true);
        this.entradasLoading.set(false);
        try {
            const estado = await firstValueFrom(this.espectaculoService.entrarEnCola(espectaculo.id));
            this.actualizarEstadoCola(estado);
            this.startColaPolling(espectaculo);
        } catch (error) {
            this.colaError.set(this.getHttpErrorMessage(error));
        } finally {
            this.colaLoading.set(false);
        }
    }

    private startColaPolling(espectaculo: EspectaculoResultado) {
        this.clearColaTimer();
        this.colaTimerId = setInterval(async () => {
            try {
                const estado = await firstValueFrom(this.espectaculoService.estadoCola(espectaculo.id));
                this.actualizarEstadoCola(estado);
            } catch (error) {
                this.colaError.set(this.getHttpErrorMessage(error));
                this.clearColaTimer();
            }
        }, 3000);
    }

    private actualizarEstadoCola(estado: ColaEstado) {
        this.colaEstado.set(estado);
        if (estado.accessToken) {
            this.queueAccessToken.set(estado.accessToken);
        }
        if (estado.turnoActivo) {
            this.clearColaTimer();
            this.startColaTurnoTimer(estado.segundosTurnoRestantes);
            const espectaculo = this.espectaculoActivo();
            if (espectaculo && this.entradasDisponibles().length === 0 && !this.entradasLoading()) {
                this.cargarEntradasConTurno(espectaculo);
            }
            return;
        }
        this.clearColaTurnoTimer();
        this.entradasDisponibles.set([]);
        this.entradasSeleccionadasCompra.set([]);
        this.queueAccessToken.set('');
        this.resetCompraState();
    }

    private async salirDeColaActual() {
        const espectaculo = this.espectaculoActivo();
        if (!espectaculo) {
            return;
        }
        try {
            await firstValueFrom(this.espectaculoService.salirDeCola(espectaculo.id));
        } catch {
            // Best-effort cleanup on navigation.
        }
    }

    private clearColaTimer() {
        if (this.colaTimerId) {
            clearInterval(this.colaTimerId);
            this.colaTimerId = null;
        }
    }

    private startColaTurnoTimer(initialSeconds: number) {
        this.clearColaTurnoTimer();
        this.colaTurnoSeconds.set(Math.max(Math.floor(initialSeconds), 0));
        this.colaTurnoTimerId = setInterval(() => {
            const next = this.colaTurnoSeconds() - 1;
            this.colaTurnoSeconds.set(Math.max(next, 0));
            if (next <= 0) {
                this.clearColaTurnoTimer();
                this.entradasDisponibles.set([]);
                this.entradasSeleccionadasCompra.set([]);
                this.queueAccessToken.set('');
                this.entradasError.set('Tu turno de la cola virtual ha caducado. Vuelve a entrar en la cola para seleccionar entradas.');
            }
        }, 1000);
    }

    private clearColaTurnoTimer() {
        if (this.colaTurnoTimerId) {
            clearInterval(this.colaTurnoTimerId);
            this.colaTurnoTimerId = null;
        }
        this.colaTurnoSeconds.set(0);
    }

    abrirEspectaculoExplora(espectaculo: EspectaculoResultado){
        const artista = this.baseArtistName(espectaculo.artista);
        const artistaKey = this.baseArtistKey(espectaculo.artista);
        this.searchTerm.set(artista);
        this.searchDate.set('');
        this.searchDateText.set('');
        this.resultsDateText.set('');
        this.appliedSearchTerm.set(artista);
        this.appliedSearchDate.set('');
        this.searchTouched.set(true);
        this.searchFocused.set(false);
        this.searchLoading.set(false);
        this.searchError.set('');
        this.espectaculoActivo.set(null);
        this.entradasDisponibles.set([]);
        this.entradasError.set('');
        this.resultadosBusqueda.set(
            this.espectaculosExplora().filter((item) => this.baseArtistKey(item.artista) === artistaKey),
        );
    }

    limpiarFecha(){
        this.searchDate.set('');
        this.searchDateText.set('');
        this.resultsDateText.set('');
        if (this.searchTouched()) {
            this.buscarDesdeBarra();
        }
    }

    onSearchDateTextChange(value: string){
        const text = this.formatDateText(value);
        this.searchDateText.set(text);
        this.searchDate.set(this.parseDateText(text));
    }

    setSearchDateFromPicker(value: string){
        this.searchDate.set(value);
        this.searchDateText.set(this.isoToDateText(value));
    }

    onResultsDateTextChange(value: string){
        const text = this.formatDateText(value);
        this.resultsDateText.set(text);
        this.searchDate.set(this.parseDateText(text));
    }

    setResultsDateFromPicker(value: string){
        this.searchDate.set(value);
        this.resultsDateText.set(this.isoToDateText(value));
    }

    volverInicio(){
        void this.salirDeColaActual();
        this.clearColaTimer();
        this.clearColaTurnoTimer();
        this.searchTerm.set('');
        this.searchDate.set('');
        this.searchDateText.set('');
        this.resultsDateText.set('');
        this.appliedSearchTerm.set('');
        this.appliedSearchDate.set('');
        this.searchFocused.set(false);
        this.searchTouched.set(false);
        this.searchLoading.set(false);
        this.searchError.set('');
        this.resultadosBusqueda.set([]);
        this.espectaculoActivo.set(null);
        this.entradasDisponibles.set([]);
        this.entradasLoading.set(false);
        this.entradasError.set('');
        this.resetCompraState();
        this.colaEstado.set(null);
        this.colaError.set('');
        this.queueAccessToken.set('');
        this.cargarExplora();
    }

    volverAResultados(){
        void this.salirDeColaActual();
        this.clearColaTimer();
        this.clearColaTurnoTimer();
        this.resetCompraState();
        this.espectaculoActivo.set(null);
        this.entradasDisponibles.set([]);
        this.entradasLoading.set(false);
        this.entradasError.set('');
        this.colaEstado.set(null);
        this.colaError.set('');
        this.queueAccessToken.set('');
        this.resetEntradaFilters();
    }

    seleccionarSugerencia(espectaculo: EspectaculoResultado){
        this.searchTerm.set(espectaculo.artista);
        this.searchTouched.set(true);
        this.searchFocused.set(false);
        this.searchDateText.set(this.isoToDateText(this.searchDate()));
        this.resultsDateText.set(this.isoToDateText(this.searchDate()));
        this.appliedSearchTerm.set(espectaculo.artista);
        this.appliedSearchDate.set(this.searchDate());
        this.resultadosBusqueda.set(this.filtrarPorFecha([espectaculo]));
        this.verEntradas(espectaculo);
    }

    formatFecha(fecha: string){
        const date = new Date(fecha);

        if (Number.isNaN(date.getTime())) {
            return { mes: '--', dia: '--', semana: '', hora: '' };
        }

        return {
            mes: new Intl.DateTimeFormat('es-ES', { month: 'short' }).format(date).replace('.', '').toUpperCase(),
            dia: new Intl.DateTimeFormat('es-ES', { day: '2-digit' }).format(date),
            semana: new Intl.DateTimeFormat('es-ES', { weekday: 'short' }).format(date).replace('.', ''),
            hora: new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' }).format(date),
        };
    }

    formatEuros(precio: number){
        return new Intl.NumberFormat('es-ES', {
            style: 'currency',
            currency: 'EUR',
        }).format(precio / 100);
    }

    tipoUbicacion(entrada: EntradaDisponible){
        const descripcion = entrada.descripcion.toLowerCase();

        if (descripcion.includes('zona')) {
            return 'Zona';
        }

        if (descripcion.includes('planta') || descripcion.includes('fila') || descripcion.includes('columna')) {
            return 'Asiento numerado';
        }

        return 'Entrada';
    }

    isEntradaSeleccionada(entradaId: number) {
        return this.entradasSeleccionadasCompra().includes(entradaId);
    }

    toggleEntradaCompra(entrada: EntradaDisponible) {
        if (this.paymentIntent()) {
            return;
        }

        const entradaId = entrada.id;
        if (this.isEntradaSeleccionada(entradaId)) {
            this.entradasSeleccionadasCompra.set(
                this.entradasSeleccionadasCompra().filter((id) => id !== entradaId),
            );
            return;
        }

        this.entradasSeleccionadasCompra.set([...this.entradasSeleccionadasCompra(), entradaId]);
    }

    totalSeleccionado() {
        const seleccion = new Set(this.entradasSeleccionadasCompra());

        return this.entradasDisponibles()
            .filter((entrada) => seleccion.has(entrada.id))
            .reduce((total, entrada) => total + entrada.precio, 0);
    }

    aplicarFechaResultados(){
        const normalizedDate = this.normalizeDateText(this.resultsDateText());
        this.resultsDateText.set(normalizedDate);
        this.searchDate.set(this.parseDateText(normalizedDate));
        this.searchDateText.set(normalizedDate);
        this.buscarDesdeBarra();
    }

    reservaTiempo() {
        const minutes = Math.floor(this.reservaSeconds() / 60).toString().padStart(2, '0');
        const seconds = (this.reservaSeconds() % 60).toString().padStart(2, '0');

        return `${minutes}:${seconds}`;
    }

    async reservarYPagar() {
        if (!this.isLoggedIn()) {
            this.compraError.set('Para comprar entradas necesitas iniciar sesion o registrarte.');
            this.abrirAuthModal('login');
            return;
        }

        if (this.entradasSeleccionadasCompra().length === 0) {
            this.compraError.set('Selecciona al menos una entrada para continuar.');
            return;
        }

        this.compraError.set('');
        this.resultadoPago.set(null);
        this.reservandoCompra.set(true);

        try {
            const reserva = await firstValueFrom(
                this.compraService.reservarEntradas(this.entradasSeleccionadasCompra(), this.queueAccessToken()),
            );
            this.reservaActual.set(reserva);
            this.startReservaTimer();

            const paymentIntent = await firstValueFrom(this.compraService.createPaymentIntent());
            this.paymentIntent.set(paymentIntent);
            await this.mountStripeElement(paymentIntent);
        } catch (error) {
            this.compraError.set(this.getHttpErrorMessage(error));
        } finally {
            this.reservandoCompra.set(false);
        }
    }

    async confirmarPago() {
        if (!this.stripe || !this.elements) {
            this.compraError.set('El formulario de pago aun no esta listo.');
            return;
        }

        this.compraError.set('');
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
                this.compraError.set(result.error.message ?? 'No se ha podido confirmar el pago.');
                return;
            }

            if (result.paymentIntent?.id) {
                const estado = await firstValueFrom(this.compraService.confirmarPago(result.paymentIntent.id));
                this.resultadoPago.set(estado);
                if (estado.status === 'succeeded') {
                    this.resetCompraState(false);
                    await this.recargarEntradasActivas();
                    this.cargarExplora();
                }
            }
        } catch (error) {
            this.compraError.set(this.getHttpErrorMessage(error));
        } finally {
            this.procesandoPago.set(false);
        }
    }

    async cancelarReserva(caducada = false) {
        this.compraError.set('');

        try {
            await firstValueFrom(this.compraService.cancelarPago());
            this.resetCompraState();
            await this.recargarEntradasActivas();
            if (caducada) {
                this.compraError.set('La reserva ha caducado y las entradas se han liberado.');
            }
        } catch (error) {
            this.compraError.set(this.getHttpErrorMessage(error));
        }
    }

    private async recargarEntradasActivas() {
        const espectaculo = this.espectaculoActivo();
        if (!espectaculo) {
            return;
        }

        const entradas = await firstValueFrom(this.espectaculoService.getEntradasDisponibles(espectaculo.id, this.queueAccessToken()));
        this.entradasDisponibles.set(entradas);
    }

    private startReservaTimer() {
        this.clearReservaTimer();
        this.reservaSeconds.set(10 * 60);
        this.reservaTimerId = setInterval(() => {
            const next = this.reservaSeconds() - 1;
            this.reservaSeconds.set(Math.max(next, 0));
            if (next <= 0) {
                void this.cancelarReserva(true);
            }
        }, 1000);
    }

    private clearReservaTimer() {
        if (this.reservaTimerId) {
            clearInterval(this.reservaTimerId);
            this.reservaTimerId = null;
        }
    }

    private async mountStripeElement(paymentIntent: PaymentIntentResponse) {
        if (!isPlatformBrowser(this.platformId)) {
            return;
        }

        await this.waitForPaymentHost();
        this.unmountPaymentElement();

        const stripeFactory = (window as Window & { Stripe?: (key: string) => any }).Stripe;
        if (!stripeFactory) {
            this.compraError.set('No se ha cargado Stripe.js.');
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

    private async waitForPaymentHost() {
        for (let attempt = 0; attempt < 10; attempt++) {
            if (this.paymentElementHost?.nativeElement) {
                return;
            }
            await new Promise((resolve) => setTimeout(resolve, 0));
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

    private resetCompraState(clearResultado = true) {
        this.clearReservaTimer();
        this.unmountPaymentElement();
        this.entradasSeleccionadasCompra.set([]);
        this.reservaActual.set(null);
        this.paymentIntent.set(null);
        if (clearResultado) {
            this.resultadoPago.set(null);
        }
        this.compraError.set('');
        this.reservaSeconds.set(0);
    }

    private resetEntradaFilters(){
        this.entradaOrden.set('default');
        this.filtroZona.set('');
        this.filtroPlanta.set('');
        this.filtroFila.set('');
        this.filtroButaca.set('');
    }

    private uniqueEntradaValues(field: 'zona' | 'planta' | 'fila' | 'butaca'){
        return Array.from(
            new Set(
                this.entradasDisponibles()
                    .map((entrada) => this.detalleEntrada(entrada)[field])
                    .filter((value): value is string => !!value),
            ),
        ).sort((a, b) => Number(a) - Number(b));
    }

    private detalleEntrada(entrada: EntradaDisponible){
        const descripcion = entrada.descripcion;

        return {
            zona: this.matchValue(descripcion, /zona\s+(\d+)/i),
            planta: this.matchValue(descripcion, /planta\s+(\d+)/i),
            fila: this.matchValue(descripcion, /fila\s+(\d+)/i),
            butaca: this.matchValue(descripcion, /columna\s+(\d+)/i),
        };
    }

    private matchValue(value: string, pattern: RegExp){
        return value.match(pattern)?.[1] ?? '';
    }

    private formatDateText(value: string){
        const digits = value.replace(/\D/g, '').slice(0, 8);
        const day = digits.slice(0, 2);
        const month = digits.slice(2, 4);
        const year = digits.slice(4, 8);

        if (digits.length <= 2) {
            return digits.length === 2 ? `${day}/` : day;
        }
        if (digits.length <= 4) {
            return digits.length === 4 ? `${day}/${month}/` : `${day}/${month}`;
        }
        return `${day}/${month}/${year}`;
    }

    private parseDateText(value: string){
        return this.dateTextToIso(this.normalizeDateText(value));
    }

    private normalizeDateText(value: string){
        const trimmed = value.trim();
        if (/^\d{8}$/.test(trimmed)) {
            return this.formatDateText(trimmed);
        }
        return trimmed;
    }

    private dateTextToIso(value: string){
        const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        if (!match) {
            return '';
        }

        const [, day, month, year] = match;
        return `${year}-${month}-${day}`;
    }

    private isoToDateText(value: string){
        const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!match) {
            return '';
        }

        const [, year, month, day] = match;
        return `${day}/${month}/${year}`;
    }

    private visibilityRank(entrada: EntradaDisponible){
        const detalle = this.detalleEntrada(entrada);

        if (detalle.zona) {
            return Number(detalle.zona);
        }
        if (detalle.planta) {
            return Number(detalle.planta) * 100 + Number(detalle.fila || 0) * 10 + Number(detalle.butaca || 0);
        }

        return entrada.precio;
    }

    private getHttpErrorMessage(error: unknown) {
        const httpError = error as { error?: { message?: string } | string; message?: string };
        if (typeof httpError?.error === 'string') {
            return httpError.error;
        }

        return httpError?.error?.message ?? httpError?.message ?? 'Ha ocurrido un error inesperado.';
    }

    private filtrarPorFecha(resultados: EspectaculoResultado[]){
        if (!this.searchDate()) {
            return resultados;
        }

        return resultados.filter((resultado) => resultado.fecha?.startsWith(this.searchDate()));
    }

    private normalizeText(value: string){
        return value
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .trim();
    }

    private groupByArtist(espectaculos: EspectaculoResultado[]){
        const grouped = new Map<string, EspectaculoResultado>();

        for (const espectaculo of espectaculos) {
            const key = this.baseArtistKey(espectaculo.artista);
            if (!grouped.has(key)) {
                grouped.set(key, { ...espectaculo, artista: this.baseArtistName(espectaculo.artista) });
            }
        }

        return Array.from(grouped.values());
    }

    private baseArtistKey(artista: string){
        return this.normalizeText(this.baseArtistName(artista));
    }

    private baseArtistName(artista: string){
        return artista.split(/\s+-\s+/)[0].trim();
    }

    passwordsMatch(){
        return this.authPassword() === this.authPasswordRepeat();
    }

    canRegister(){
        return this.registerNombre().trim().length > 0
            && this.registerApellidos().trim().length > 0
            && this.authEmail().trim().length > 0
            && this.authPassword().length > 0
            && this.authPasswordRepeat().length > 0
            && this.passwordValid();
    }

    submitAuth(){
        this.authMessage.set('');
        this.authError.set('');

        if (this.authMode() === 'register' && !this.canRegister()) {
            this.authError.set(this.authGenericError);
            return;
        }

        this.authSubmitting.set(true);
        const request = this.authMode() === 'login'
            ? this.http.post(`${USER_API_BASE_URL}/users/login`, {
                name: this.authEmail().trim(),
                pwd: this.authPassword(),
            }, { withCredentials: true })
            : this.http.post(`${USER_API_BASE_URL}/users/register`, {
                nombre: this.registerNombre().trim(),
                apellidos: this.registerApellidos().trim(),
                email: this.authEmail().trim(),
                username: this.registerUsername().trim() || null,
                fechaNacimiento: this.registerFechaNacimiento() || null,
                password: this.authPassword(),
                confirmPassword: this.authPasswordRepeat(),
            }, { withCredentials: true });

        request.subscribe({
            next: () => {
                this.authError.set('');
                this.authSubmitting.set(false);
                this.completeLogin();
            },
            error: () => {
                this.authError.set(this.authGenericError);
                this.authMessage.set('');
                this.authSubmitting.set(false);
            },
        });
    }

    private passwordValidationInput(){
        return {
            password: this.authPassword(),
            confirmPassword: this.authPasswordRepeat(),
            username: this.registerUsername(),
            nombre: this.registerNombre(),
            apellidos: this.registerApellidos(),
            email: this.authEmail(),
            fechaNacimiento: this.registerFechaNacimiento(),
        };
    }

    private completeLogin(){
        this.isLoggedIn.set(true);
        const displayName = this.getDisplayName();
        this.userDisplayName.set(displayName);
        this.storeAuthSession(displayName, this.authEmail().trim());
        this.authPassword.set('');
        this.authPasswordRepeat.set('');
        this.cerrarAuthModal();
    }

    private restoreAuthSession(){
        if (!this.isBrowser()) {
            return;
        }

        const rawSession = localStorage.getItem(Espectaculos.AUTH_STORAGE_KEY);
        if (!rawSession) {
            return;
        }

        try {
            const session = JSON.parse(rawSession) as { displayName?: string; email?: string };
            if (!session.displayName || !session.email) {
                this.clearStoredAuthSession();
                return;
            }

            this.isLoggedIn.set(true);
            this.userDisplayName.set(session.displayName);
            this.authEmail.set(session.email);
        } catch {
            this.clearStoredAuthSession();
        }
    }

    private storeAuthSession(displayName: string, email: string){
        if (!this.isBrowser()) {
            return;
        }

        localStorage.setItem(Espectaculos.AUTH_STORAGE_KEY, JSON.stringify({ displayName, email }));
    }

    private clearStoredAuthSession(){
        if (!this.isBrowser()) {
            return;
        }

        localStorage.removeItem(Espectaculos.AUTH_STORAGE_KEY);
    }

    private isBrowser(){
        return isPlatformBrowser(this.platformId);
    }

    private getAuthErrorMessage(error: any){
        if (typeof error?.error === 'string') {
            return error.error;
        }

        return error?.error?.message || 'No se ha podido completar la operacion.';
    }

    private getDisplayName(){
        const email = this.authEmail().trim();
        return this.formatDisplayName(email);
    }

    private formatDisplayName(email: string){
        const localPart = email.split('@')[0] || 'Mi cuenta';
        return localPart
            .split(/[._\-+]/)
            .filter(Boolean)
            .map(part => part.charAt(0).toUpperCase() + part.slice(1))
            .join(' ');
    }

	getEscenarios(){
		if (this.cargandoEscenarios()) return;
		
		this.cargandoEscenarios.set(true);
		this.espectaculoService.getEscenarios().subscribe(
            (response: any) => {
                this.escenarios.set(response);
                this.escenarioSeleccionado.set(null);
                this.espectaculoSeleccionado.set(null);
                this.entradasSeleccionadas.set([]);
                this.cargandoEscenarios.set(false);
            },
            (error: any) => {
                console.error('Error', error);
                this.cargandoEscenarios.set(false);
            }
        );
	}

    getEspectaculos(escenario: any){
        if (this.cargandoEspectaculos()) return;
        
        this.cargandoEspectaculos.set(true);
        this.escenarioSeleccionado.set(escenario);
        this.espectaculoSeleccionado.set(null);
        this.entradasSeleccionadas.set([]);
        
		this.espectaculoService.getEspectaculos(escenario).subscribe(
            (response: any) => {
                escenario.espectaculos = response;
                this.cargandoEspectaculos.set(false);
            },
            (error: any) => {
                console.error('Error', error);
                this.cargandoEspectaculos.set(false);
            }
        );
	}
/*
    getNumeroDeEntradas(espectaculo: any){
        if (this.cargandoEntradas()) return;
        
        this.cargandoEntradas.set(true);
        this.espectaculoSeleccionado.set(espectaculo);
        this.entradasSeleccionadas.set([]);
        
		this.espectaculoService.getNumeroDeEntradas(espectaculo).subscribe(
            (response: any) => {
                this.entradasSeleccionadas.set(response);
                this.getEntradasLibres(espectaculo);
                this.cargandoEntradas.set(false);
            },
            (error: any) => {
                console.error('Error', error);
                this.cargandoEntradas.set(false);
            }
        );
	}
*/

getNumeroDeEntradas(espectaculo: any){
        if (this.cargandoEntradas()) return;
        
        this.cargandoEntradas.set(true);
        this.espectaculoSeleccionado.set(espectaculo);
        this.entradasSeleccionadas.set([]);
        
		this.espectaculoService.getNumeroDeEntradasComoDto(espectaculo).subscribe(
            (response: any) => {
                espectaculo.entradas=response;
                this.cargandoEntradas.set(false);
            },
            (error: any) => {
                console.error('Error', error);
                this.cargandoEntradas.set(false);
            }
        );
	}
    
    irAComprarEntradas(espectaculo: any){
        this.router.navigate(['/comprar', espectaculo.id]);
    }
/*
    getEntradasLibres(espectaculo: any){
		this.espectaculoService.getEntradasLibres(espectaculo).subscribe(
            (response: any) => {
                espectaculo.entradasLibres = response;
            },
            (error: any) => {
                console.error('Error', error);
                this.cargandoEntradas.set(false);
            }
        );
	}
*/
}
