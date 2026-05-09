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

interface AccountTicket {
    id: string;
    entradaId: number;
    artista: string;
    escenario: string;
    fecha: string;
    descripcion: string;
    precio: number;
    purchasedAt: string;
}

interface UserProfile {
    id?: number;
    nombre?: string;
    apellidos?: string;
    email?: string;
    username?: string;
    fechaNacimiento?: string;
    twoFactorEnabled?: boolean;
    rol?: string;
}

interface LoginResponse {
    twoFactorRequired?: boolean;
    twoFactorChallengeToken?: string;
    user?: UserProfile;
}

interface TwoFactorSetupResponse {
    qrUrl: string;
    secretKey: string;
}

interface EntradaSeleccionadaCompra {
    entradaId: number;
    descripcion: string;
    precio: number;
    espectaculoId: number;
    artista: string;
    escenario: string;
    fecha: string;
}

@Component({
  selector: 'app-espectaculos',
  imports: [CommonModule, FormsModule, PasswordRulesComponent],
  templateUrl: './espectaculos.html',
  styleUrl: './espectaculos.css',
})
export class Espectaculos implements OnInit, OnDestroy {
    @ViewChild('paymentElementHost') paymentElementHost?: ElementRef<HTMLDivElement>;
    private static readonly AUTH_STORAGE_KEY = 'esi.auth.session';
    private static readonly TICKETS_STORAGE_PREFIX = 'esi.account.tickets:';

    authModalOpen = signal(false);
    accountPanelOpen = signal(false);
    isLoggedIn = signal(false);
    userDisplayName = signal('');
    authMode = signal<'login' | 'register' | 'twoFactor' | 'registerTwoFactor'>('login');
    registerNombre = signal('');
    registerApellidos = signal('');
    registerUsername = signal('');
    registerFechaNacimiento = signal('');
    registerEnableTwoFactor = signal(false);
    authEmail = signal('');
    authPassword = signal('');
    authPasswordRepeat = signal('');
    showPassword = signal(false);
    showPasswordRepeat = signal(false);
    authMessage = signal('');
    authError = signal('');
    authSubmitting = signal(false);
    accountDeleting = signal(false);
    accountDeleteError = signal('');
    accountDeleteConfirmOpen = signal(false);
    twoFactorCode = signal('');
    twoFactorChallengeToken = signal('');
    entradasOpen = signal(true);
    accountTicketsMode = signal<'upcoming' | 'past'>('upcoming');
    accountTickets = signal<AccountTicket[]>([]);
    perfilOpen = signal(false);
    profileEditing = signal(false);
    profileSaving = signal(false);
    profileMessage = signal('');
    profileError = signal('');
    profileNombre = signal('');
    profileApellidos = signal('');
    profileEmail = signal('');
    profileUsername = signal('');
    profileFechaNacimiento = signal('');
    profileRol = signal('');
    profileTwoFactorEnabled = signal(false);
    twoFactorSetupOpen = signal(false);
    twoFactorSetupLoading = signal(false);
    twoFactorQrUrl = signal('');
    twoFactorSecretKey = signal('');
    twoFactorSetupCode = signal('');
    twoFactorMessage = signal('');
    twoFactorError = signal('');
    pendingRegisterProfile = signal<UserProfile | null>(null);
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
    exploraStats = signal<Record<number, { precioMinimo: number | null; disponibilidad: number | null }>>({});
    espectaculoActivo = signal<EspectaculoResultado | null>(null);
    entradasDisponibles = signal<EntradaDisponible[]>([]);
    entradasLoading = signal(false);
    entradasError = signal('');
    entradasSeleccionadasCompra = signal<EntradaSeleccionadaCompra[]>([]);
    entradasReservadasCompra = signal<EntradaSeleccionadaCompra[]>([]);
    entradaOrden = signal<'default' | 'priceAsc' | 'visibility'>('default');
    exploraOrden = signal<
    'default'
    | 'dateAsc'
    | 'dateDesc'
    | 'priceAsc'
    | 'priceDesc'
    | 'availabilityDesc'
    | 'availabilityAsc'
    >('default');
    filtroZona = signal('');
    filtroPlanta = signal('');
    filtroFila = signal('');
    filtroButaca = signal('');
    reservaActual = signal<ReservaResponse | null>(null);
    reservaOwnerKey = signal('');
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
    numeroEspectaculosSeleccionados = computed(() => new Set(this.entradasSeleccionadasCompra().map((entrada) => entrada.espectaculoId)).size);
    numeroEspectaculosReservados = computed(() => new Set(this.entradasReservadasCompra().map((entrada) => entrada.espectaculoId)).size);
    nombresEntradasReserva = computed(() => this.entradasReservadasCompra()
        .map((entrada) => `${entrada.artista}: ${entrada.descripcion}`)
        .join(', '));
    accountTicketsFiltered = computed(() => {
        const now = Date.now();
        return this.accountTickets()
            .filter((ticket) => {
                const eventTime = new Date(ticket.fecha).getTime();
                const isPast = !Number.isNaN(eventTime) && eventTime < now;
                return this.accountTicketsMode() === 'past' ? isPast : !isPast;
            })
            .sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());
    });
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
    espectaculosExploraAgrupados = computed(() => {
    const espectaculos = this.groupByArtist(this.espectaculosExplora());

    switch (this.exploraOrden()) {
        case 'dateAsc':
            return this.sortByNullableNumber(
                espectaculos,
                (espectaculo) => this.fechaExploraValue(espectaculo, 'asc'),
                'asc',
            );

        case 'dateDesc':
            return this.sortByNullableNumber(
                espectaculos,
                (espectaculo) => this.fechaExploraValue(espectaculo, 'desc'),
                'desc',
            );

        case 'priceAsc':
            return this.sortByNullableNumber(
                espectaculos,
                (espectaculo) => this.precioExploraValue(espectaculo),
                'asc',
            );

        case 'priceDesc':
            return this.sortByNullableNumber(
                espectaculos,
                (espectaculo) => this.precioExploraValue(espectaculo),
                'desc',
            );

        case 'availabilityDesc':
            return this.sortByNullableNumber(
                espectaculos,
                (espectaculo) => this.disponibilidadExploraValue(espectaculo),
                'desc',
            );

        case 'availabilityAsc':
            return this.sortByNullableNumber(
                espectaculos,
                (espectaculo) => this.disponibilidadExploraValue(espectaculo),
                'asc',
            );

        default:
            return espectaculos;
    }
    });
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
        this.loadAccountTickets();
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
        this.exploraStats.set({});

        this.espectaculoService.buscarEspectaculos('').subscribe({
            next: (resultados) => {
                this.espectaculosExplora.set(resultados);
                this.exploraLoading.set(false);
                void this.cargarStatsExplora(resultados);
            },
            error: () => {
                this.espectaculosExplora.set([]);
                this.exploraStats.set({});
                this.exploraError.set('No se han podido cargar los espectaculos destacados.');
                this.exploraLoading.set(false);
            },
        });
    }

    private async cargarStatsExplora(espectaculos: EspectaculoResultado[]) {
    const stats: Record<number, { precioMinimo: number | null; disponibilidad: number | null }> = {};

    await Promise.all(
        espectaculos.map(async (espectaculo) => {
            try {
                const entradas = await firstValueFrom(
                    this.espectaculoService.getEntradasDisponibles(espectaculo.id, '')
                );

                if (!entradas || entradas.length === 0) {
                    stats[espectaculo.id] = {
                        precioMinimo: null,
                        disponibilidad: 0,
                    };
                    return;
                }

                stats[espectaculo.id] = {
                    precioMinimo: Math.min(...entradas.map((entrada) => entrada.precio)),
                    disponibilidad: entradas.length,
                };
            } catch {
                stats[espectaculo.id] = {
                    precioMinimo: null,
                    disponibilidad: null,
                };
            }
        })
    );

    this.exploraStats.set(stats);
    }

    abrirAuthModal(mode: 'login' | 'register'){
        this.authMode.set(mode);
        this.authModalOpen.set(true);
        this.accountPanelOpen.set(false);
        this.authMessage.set('');
        this.authError.set('');
        this.twoFactorCode.set('');
        this.twoFactorChallengeToken.set('');
        this.resetAuthTwoFactorSetup();
    }

    cerrarAuthModal(){
        this.authModalOpen.set(false);
        if (this.authMode() === 'twoFactor' || this.authMode() === 'registerTwoFactor') {
            this.authMode.set('login');
        }
        this.twoFactorCode.set('');
        this.twoFactorChallengeToken.set('');
        this.pendingRegisterProfile.set(null);
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

        this.loadAccountTickets();
        this.cargarSesion();
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
        this.clearLocalAccountState();
    }

    solicitarEliminarCuenta(){
        if (this.accountDeleting()) {
            return;
        }
        this.accountDeleteError.set('');
        this.accountDeleteConfirmOpen.set(true);
    }

    cancelarEliminarCuenta(){
        if (this.accountDeleting()) {
            return;
        }
        this.accountDeleteConfirmOpen.set(false);
    }

    eliminarCuenta(){
        if (this.accountDeleting()) {
            return;
        }
        this.accountDeleteConfirmOpen.set(false);
        this.accountDeleting.set(true);
        this.accountDeleteError.set('');
        this.http.delete(`${USER_API_BASE_URL}/users/me`, { withCredentials: true }).subscribe({
            next: () => {
                this.accountDeleting.set(false);
                this.clearLocalAccountState();
            },
            error: () => {
                this.accountDeleting.set(false);
                this.accountDeleteError.set('No se ha podido eliminar la cuenta. Vuelve a iniciar sesión e intentalo de nuevo.');
            },
        });
    }

    private clearLocalAccountState(){
        this.limpiarReservaLocalSinCancelar();
        this.isLoggedIn.set(false);
        this.userDisplayName.set('');
        this.accountPanelOpen.set(false);
        this.authEmail.set('');
        this.authPassword.set('');
        this.authPasswordRepeat.set('');
        this.clearStoredAuthSession();
        this.accountTickets.set([]);
        this.clearProfileForm();
        this.accountDeleteError.set('');
        this.accountDeleteConfirmOpen.set(false);
    }

    private cargarSesion(){
        this.http.get<UserProfile>(
            `${USER_API_BASE_URL}/users/me`,
            { withCredentials: true },
        ).subscribe({
            next: (user) => {
                this.isLoggedIn.set(true);
                this.userDisplayName.set(user.nombre || user.username || this.formatDisplayName(user.email || ''));
                this.authEmail.set(user.email || this.authEmail());
                this.setProfileForm(user);
                this.descartarReservaSiNoEsDeLaCuentaActual();
                this.loadAccountTickets();
            },
            error: () => {
                this.isLoggedIn.set(false);
                this.userDisplayName.set('');
            },
        });
    }

    openProfile() {
        this.perfilOpen.set(true);
        this.profileMessage.set('');
        this.profileError.set('');
        this.twoFactorMessage.set('');
        this.twoFactorError.set('');
        this.cargarSesion();
    }

    startProfileEdit() {
        this.profileEditing.set(true);
        this.profileMessage.set('');
        this.profileError.set('');
    }

    cancelProfileEdit() {
        this.profileEditing.set(false);
        this.profileMessage.set('');
        this.profileError.set('');
        this.cargarSesion();
    }

    saveProfile() {
        this.profileSaving.set(true);
        this.profileMessage.set('');
        this.profileError.set('');

        this.http.put<UserProfile>(`${USER_API_BASE_URL}/users/me`, {
            nombre: this.profileNombre().trim(),
            apellidos: this.profileApellidos().trim(),
            email: this.profileEmail().trim(),
            username: this.profileUsername().trim() || null,
            fechaNacimiento: this.profileFechaNacimiento() || null,
        }, { withCredentials: true }).subscribe({
            next: (profile) => {
                this.setProfileForm(profile);
                this.authEmail.set(profile.email || '');
                this.userDisplayName.set(profile.nombre || profile.username || this.formatDisplayName(profile.email || ''));
                this.profileEditing.set(false);
                this.profileSaving.set(false);
                this.profileMessage.set('Perfil actualizado correctamente.');
                this.loadAccountTickets();
            },
            error: () => {
                this.profileSaving.set(false);
                this.profileError.set('No se ha podido actualizar el perfil. Revisa los datos.');
            },
        });
    }

    startTwoFactorSetup() {
        this.twoFactorSetupLoading.set(true);
        this.twoFactorSetupOpen.set(false);
        this.twoFactorQrUrl.set('');
        this.twoFactorSecretKey.set('');
        this.twoFactorSetupCode.set('');
        this.twoFactorMessage.set('');
        this.twoFactorError.set('');

        this.http.post<TwoFactorSetupResponse>(
            `${USER_API_BASE_URL}/users/2fa/setup`,
            {},
            { withCredentials: true },
        ).subscribe({
            next: (setup) => {
                this.twoFactorQrUrl.set(setup.qrUrl);
                this.twoFactorSecretKey.set(setup.secretKey);
                this.twoFactorSetupOpen.set(true);
                this.twoFactorSetupLoading.set(false);
            },
            error: () => {
                this.twoFactorSetupLoading.set(false);
                this.twoFactorError.set('No se ha podido iniciar la configuración 2FA.');
            },
        });
    }

    confirmTwoFactorSetup() {
        const code = this.twoFactorSetupCode().trim();
        if (!/^\d{6}$/.test(code)) {
            this.twoFactorError.set('Introduce un código de 6 dígitos.');
            return;
        }

        this.twoFactorSetupLoading.set(true);
        this.twoFactorMessage.set('');
        this.twoFactorError.set('');

        this.http.post<UserProfile>(
            `${USER_API_BASE_URL}/users/2fa/verify`,
            { code },
            { withCredentials: true },
        ).subscribe({
            next: (profile) => {
                this.setProfileForm(profile);
                this.twoFactorSetupLoading.set(false);
                this.twoFactorSetupOpen.set(false);
                this.twoFactorQrUrl.set('');
                this.twoFactorSecretKey.set('');
                this.twoFactorSetupCode.set('');
                this.twoFactorMessage.set('Doble factor activado correctamente.');
            },
            error: () => {
                this.twoFactorSetupLoading.set(false);
                this.twoFactorError.set('Código 2FA inválido. Revisa la app autenticadora.');
            },
        });
    }

    disableTwoFactor() {
        this.twoFactorSetupLoading.set(true);
        this.twoFactorMessage.set('');
        this.twoFactorError.set('');

        this.http.post<UserProfile>(
            `${USER_API_BASE_URL}/users/2fa/disable`,
            {},
            { withCredentials: true },
        ).subscribe({
            next: (profile) => {
                this.setProfileForm(profile);
                this.twoFactorSetupLoading.set(false);
                this.twoFactorSetupOpen.set(false);
                this.twoFactorMessage.set('Doble factor desactivado.');
            },
            error: () => {
                this.twoFactorSetupLoading.set(false);
                this.twoFactorError.set('No se ha podido desactivar el doble factor.');
            },
        });
    }

    buscarDesdeBarra(){
        this.pausarPagoSinCancelarReserva();
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
        this.pausarPagoSinCancelarReserva();
        this.searchTouched.set(true);
        this.searchLoading.set(false);
        this.searchError.set('');
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

    openAccountTickets(mode: 'upcoming' | 'past') {
        this.entradasOpen.set(true);
        this.accountTicketsMode.set(mode);
        this.loadAccountTickets();
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
        this.quitarSeleccionDelEspectaculoActivo();
        this.queueAccessToken.set('');
        if (!this.reservaActual() && !this.paymentIntent()) {
            this.resetCompraState(true, false);
        }
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
                this.quitarSeleccionDelEspectaculoActivo();
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
        this.pausarPagoSinCancelarReserva();
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
        this.pausarPagoSinCancelarReserva();
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
        if (!this.reservaActual() && !this.paymentIntent()) {
            this.resetCompraState(true, false);
        }
        this.colaEstado.set(null);
        this.colaError.set('');
        this.queueAccessToken.set('');
        this.cargarExplora();
    }

    volverAResultados(){
        this.pausarPagoSinCancelarReserva();
        void this.salirDeColaActual();
        this.clearColaTimer();
        this.clearColaTurnoTimer();
        if (!this.reservaActual() && !this.paymentIntent()) {
            this.resetCompraState(true, false);
        }
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

    precioExplora(espectaculo: EspectaculoResultado): number | null {
        return this.precioExploraValue(espectaculo);
    }

    disponibilidadExplora(espectaculo: EspectaculoResultado): number | null {
        return this.disponibilidadExploraValue(espectaculo);
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
        return this.entradasSeleccionadasCompra().some((entrada) => entrada.entradaId === entradaId);
    }

    toggleEntradaCompra(entrada: EntradaDisponible) {
        if (this.reservandoCompra() || this.procesandoPago()) {
            return;
        }

        const espectaculo = this.espectaculoActivo();
        if (!espectaculo) {
            return;
        }

        const entradaId = entrada.id;
        if (this.isEntradaSeleccionada(entradaId)) {
            this.entradasSeleccionadasCompra.set(
                this.entradasSeleccionadasCompra().filter((seleccionada) => seleccionada.entradaId !== entradaId),
            );
        } else {
            this.entradasSeleccionadasCompra.set(this.uniqueEntradasSeleccionadas([
                ...this.entradasSeleccionadasCompra(),
                {
                    entradaId,
                    descripcion: entrada.descripcion,
                    precio: entrada.precio,
                    espectaculoId: espectaculo.id,
                    artista: espectaculo.artista,
                    escenario: espectaculo.escenario,
                    fecha: espectaculo.fecha,
                },
            ]));
        }

        if (this.paymentIntent()) {
            this.unmountPaymentElement();
            this.paymentIntent.set(null);
        }
    }

    totalSeleccionado() {
        return this.entradasSeleccionadasCompra()
            .reduce((total, entrada) => total + entrada.precio, 0);
    }

    aplicarFechaResultados(){
        const normalizedDate = this.normalizeDateText(this.resultsDateText());
        this.resultsDateText.set(normalizedDate);
        this.searchDate.set(this.parseDateText(normalizedDate));
        this.searchDateText.set(normalizedDate);
        this.buscarDesdeBarra();
    }

    borrarFechaResultados(): void {
        this.searchDate.set('');
        this.searchDateText.set('');
        this.resultsDateText.set('');
        this.appliedSearchDate.set('');

        this.buscarDesdeBarra();
    }

    reservaTiempo() {
        const minutes = Math.floor(this.reservaSeconds() / 60).toString().padStart(2, '0');
        const seconds = (this.reservaSeconds() % 60).toString().padStart(2, '0');

        return `${minutes}:${seconds}`;
    }

    async reservarYPagar() {
        if (this.reservandoCompra() || this.procesandoPago()) {
            return;
        }

        if (!this.isLoggedIn()) {
            this.compraError.set('Para comprar entradas necesitas iniciar sesión o registrarte.');
            this.abrirAuthModal('login');
            return;
        }

        const seleccion = this.entradasSeleccionadasCompra();
        if (seleccion.length === 0) {
            this.compraError.set('Selecciona al menos una entrada para continuar.');
            return;
        }

        this.compraError.set('');
        this.resultadoPago.set(null);
        this.reservandoCompra.set(true);

        const reservadasIds = new Set(this.entradasReservadasCompra().map((entrada) => entrada.entradaId));
        const entradasPendientes = seleccion.filter((entrada) => !reservadasIds.has(entrada.entradaId));

        try {
            const ownerKey = this.currentReservationOwnerKey();
            let reserva = this.reservaActual();

            if (entradasPendientes.length > 0) {
                reserva = await firstValueFrom(
                    this.compraService.reservarEntradas(
                        entradasPendientes.map((entrada) => entrada.entradaId),
                        this.queueAccessToken(),
                    ),
                );

                this.reservaOwnerKey.set(ownerKey);
                this.compraService.marcaReservaActiva(ownerKey);
                this.reservaActual.set(reserva);
                this.entradasReservadasCompra.set(this.uniqueEntradasSeleccionadas([
                    ...this.entradasReservadasCompra(),
                    ...entradasPendientes,
                ]));
                this.startReservaTimer();
            }

            if (!reserva) {
                this.compraError.set('No hay ninguna reserva activa para pagar.');
                return;
            }

            this.unmountPaymentElement();
            this.paymentIntent.set(null);

            const paymentIntent = await firstValueFrom(this.compraService.createPaymentIntent());
            this.paymentIntent.set(paymentIntent);
            await this.mountStripeElement(paymentIntent);
        } catch (error) {
            this.compraError.set(this.getHttpErrorMessage(error));
        } finally {
            this.reservandoCompra.set(false);
        }
    }

    reservarYPagarYScroll(): void {
        void this.reservarYPagar().finally(() => {
            setTimeout(() => {
                document.querySelector('.payment-box')?.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start',
                });
            }, 150);
        });
    }

    scrollArribaEntradas(): void {
        document.getElementById('ticket-panel-top')?.scrollIntoView({
            behavior: 'smooth',
            block: 'start',
        });
    }

    scrollAbajoEntradas(): void {
    const target =
        document.querySelector('.payment-box') ||
        document.querySelector('.reserve-status') ||
        document.querySelector('.seat-grid');

    if (target) {
        target.scrollIntoView({
            behavior: 'smooth',
            block: 'end',
        });
        return;
    }

    window.scrollTo({
        top: document.documentElement.scrollHeight,
        behavior: 'smooth',
    });
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
                    this.savePurchasedTickets();
                    this.compraService.limpiaReservaActiva(this.reservaOwnerKey() || this.currentReservationOwnerKey());
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


    private pausarPagoSinCancelarReserva() {
        if (!this.paymentIntent()) {
            return;
        }

        this.unmountPaymentElement();
        this.paymentIntent.set(null);
        this.resultadoPago.set(null);
        this.procesandoPago.set(false);
    }

    private buscarEspectaculoSeleccionado(entrada: EntradaSeleccionadaCompra): EspectaculoResultado | null {
        return this.espectaculosExplora().find((espectaculo) => espectaculo.id === entrada.espectaculoId)
            ?? this.resultadosBusqueda().find((espectaculo) => espectaculo.id === entrada.espectaculoId)
            ?? null;
    }

    private espectaculoDesdeSeleccion(entrada: EntradaSeleccionadaCompra): EspectaculoResultado {
        return {
            id: entrada.espectaculoId,
            artista: entrada.artista,
            escenario: entrada.escenario,
            fecha: entrada.fecha,
            altaDemanda: false,
            aperturaTaquilla: undefined,
        } as EspectaculoResultado;
    }

    async continuarPagoReservaActiva() {
        if (!this.reservaActual()) {
            return;
        }

        const reservadasIds = new Set(this.entradasReservadasCompra().map((entrada) => entrada.entradaId));
        const hayEntradasPendientes = this.entradasSeleccionadasCompra().some((entrada) => !reservadasIds.has(entrada.entradaId));
        if (hayEntradasPendientes) {
            await this.reservarYPagar();
            document.querySelector('.payment-box')?.scrollIntoView({
                behavior: 'smooth',
                block: 'start',
            });
            return;
        }

        const primeraEntrada = this.entradasReservadasCompra()[0] ?? this.entradasSeleccionadasCompra()[0];
        if (primeraEntrada && !this.espectaculoActivo()) {
            const espectaculo = this.buscarEspectaculoSeleccionado(primeraEntrada) ?? this.espectaculoDesdeSeleccion(primeraEntrada);
            this.searchTouched.set(true);
            this.searchLoading.set(false);
            this.searchError.set('');
            this.espectaculoActivo.set(espectaculo);
            this.entradasDisponibles.set([]);
            this.entradasError.set('');
            this.resetEntradaFilters();
            this.cargarEntradasConTurno(espectaculo);
        }

        if (this.paymentIntent()) {
            await this.mountStripeElement(this.paymentIntent()!);
            document.querySelector('.payment-box')?.scrollIntoView({
                behavior: 'smooth',
                block: 'start',
            });
            return;
        }

        this.compraError.set('');
        this.reservandoCompra.set(true);

        try {
            const paymentIntent = await firstValueFrom(this.compraService.createPaymentIntent());
            this.paymentIntent.set(paymentIntent);
            await this.mountStripeElement(paymentIntent);
            document.querySelector('.payment-box')?.scrollIntoView({
                behavior: 'smooth',
                block: 'start',
            });
        } catch (error) {
            this.compraError.set(this.getHttpErrorMessage(error));
        } finally {
            this.reservandoCompra.set(false);
        }
    }

    async cancelarReserva(caducada = false) {
        this.compraError.set('');

        try {
            await firstValueFrom(this.compraService.cancelarPago());
            this.compraService.limpiaReservaActiva(this.reservaOwnerKey() || this.currentReservationOwnerKey());
            this.entradasReservadasCompra.set([]);
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

    private resetCompraState(clearResultado = true, clearSelected = true) {
        this.clearReservaTimer();
        this.unmountPaymentElement();
        if (clearSelected) {
            this.entradasSeleccionadasCompra.set([]);
            this.entradasReservadasCompra.set([]);
        }
        this.reservaActual.set(null);
        this.reservaOwnerKey.set('');
        this.paymentIntent.set(null);
        if (clearResultado) {
            this.resultadoPago.set(null);
        }
        this.compraError.set('');
        this.reservaSeconds.set(0);
    }


    private uniqueEntradasSeleccionadas(entradas: EntradaSeleccionadaCompra[]) {
        const map = new Map<number, EntradaSeleccionadaCompra>();

        for (const entrada of entradas) {
            map.set(entrada.entradaId, entrada);
        }

        return Array.from(map.values());
    }

    private currentReservationOwnerKey() {
        return this.authEmail().trim().toLowerCase() || 'anonymous';
    }

    private descartarReservaSiNoEsDeLaCuentaActual() {
        const owner = this.reservaOwnerKey();
        if (!owner || owner === this.currentReservationOwnerKey()) {
            return;
        }
        this.limpiarReservaLocalSinCancelar();
        this.compraError.set('Has cambiado de cuenta. La reserva anterior no se muestra en esta sesión.');
    }

    private limpiarReservaLocalSinCancelar() {
        const owner = this.reservaOwnerKey();
        if (owner) {
            this.compraService.limpiaReservaActiva(owner);
        }
        this.resetCompraState();
    }

    private quitarSeleccionDelEspectaculoActivo() {
        const espectaculo = this.espectaculoActivo();
        if (!espectaculo) {
            return;
        }
        this.entradasSeleccionadasCompra.set(
            this.entradasSeleccionadasCompra().filter((entrada) => entrada.espectaculoId !== espectaculo.id),
        );
    }

    private setProfileForm(user: UserProfile) {
        this.profileNombre.set(user.nombre || '');
        this.profileApellidos.set(user.apellidos || '');
        this.profileEmail.set(user.email || '');
        this.profileUsername.set(user.username || '');
        this.profileFechaNacimiento.set(user.fechaNacimiento || '');
        this.profileRol.set(user.rol || '');
        this.profileTwoFactorEnabled.set(!!user.twoFactorEnabled);
    }

    private clearProfileForm() {
        this.profileNombre.set('');
        this.profileApellidos.set('');
        this.profileEmail.set('');
        this.profileUsername.set('');
        this.profileFechaNacimiento.set('');
        this.profileRol.set('');
        this.profileTwoFactorEnabled.set(false);
        this.profileEditing.set(false);
        this.profileSaving.set(false);
        this.profileMessage.set('');
        this.profileError.set('');
        this.twoFactorSetupOpen.set(false);
        this.twoFactorSetupLoading.set(false);
        this.twoFactorQrUrl.set('');
        this.twoFactorSecretKey.set('');
        this.twoFactorSetupCode.set('');
        this.twoFactorMessage.set('');
        this.twoFactorError.set('');
    }

    private resetAuthTwoFactorSetup() {
        this.twoFactorSetupOpen.set(false);
        this.twoFactorSetupLoading.set(false);
        this.twoFactorQrUrl.set('');
        this.twoFactorSecretKey.set('');
        this.twoFactorSetupCode.set('');
        this.twoFactorMessage.set('');
        this.twoFactorError.set('');
    }

    private savePurchasedTickets() {
        const seleccionadas = this.entradasReservadasCompra().length > 0 ? this.entradasReservadasCompra() : this.entradasSeleccionadasCompra();
        if (seleccionadas.length === 0) {
            return;
        }

        const purchasedAt = new Date().toISOString();
        const newTickets = seleccionadas.map((entrada) => ({
            id: `${entrada.entradaId}-${purchasedAt}`,
            entradaId: entrada.entradaId,
            artista: entrada.artista,
            escenario: entrada.escenario,
            fecha: entrada.fecha,
            descripcion: entrada.descripcion,
            precio: entrada.precio,
            purchasedAt,
        }));

        const tickets = [...newTickets, ...this.readAccountTickets()];
        this.accountTickets.set(tickets);
        this.writeAccountTickets(tickets);
    }

    private loadAccountTickets() {
        this.accountTickets.set(this.readAccountTickets());
    }

    private readAccountTickets() {
        if (!this.isBrowser()) {
            return [];
        }

        const raw = localStorage.getItem(this.accountTicketsStorageKey());
        if (!raw) {
            return [];
        }

        try {
            const tickets = JSON.parse(raw) as AccountTicket[];
            return Array.isArray(tickets) ? tickets : [];
        } catch {
            return [];
        }
    }

    private writeAccountTickets(tickets: AccountTicket[]) {
        if (!this.isBrowser()) {
            return;
        }

        localStorage.setItem(this.accountTicketsStorageKey(), JSON.stringify(tickets));
    }

    private accountTicketsStorageKey() {
        const email = this.authEmail().trim().toLowerCase() || 'local';
        return `${Espectaculos.TICKETS_STORAGE_PREFIX}${email}`;
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

    private sortByNullableNumber(
    espectaculos: EspectaculoResultado[],
    getValue: (espectaculo: EspectaculoResultado) => number | null,
    direction: 'asc' | 'desc',
) {
    return [...espectaculos].sort((a, b) => {
        const aValue = getValue(a);
        const bValue = getValue(b);

        if (aValue === null && bValue === null) {
            return 0;
        }

        if (aValue === null) {
            return 1;
        }

        if (bValue === null) {
            return -1;
        }

        return direction === 'asc' ? aValue - bValue : bValue - aValue;
    });
}

private fechaExploraValue(espectaculo: EspectaculoResultado, mode: 'asc' | 'desc'): number | null {
    const fechas = this.eventosExploraPorArtista(espectaculo)
        .map((item) => new Date(item.fecha).getTime())
        .filter((value) => !Number.isNaN(value));

    if (fechas.length === 0) {
        return null;
    }

    return mode === 'asc' ? Math.min(...fechas) : Math.max(...fechas);
}

private precioExploraValue(espectaculo: EspectaculoResultado): number | null {
    const precios = this.eventosExploraPorArtista(espectaculo)
        .map((item) => this.exploraStats()[item.id]?.precioMinimo)
        .filter((value): value is number => typeof value === 'number' && !Number.isNaN(value));

    if (precios.length === 0) {
        return null;
    }

    return Math.min(...precios);
}

private disponibilidadExploraValue(espectaculo: EspectaculoResultado): number | null {
    const disponibilidades = this.eventosExploraPorArtista(espectaculo)
        .map((item) => this.exploraStats()[item.id]?.disponibilidad)
        .filter((value): value is number => typeof value === 'number' && !Number.isNaN(value));

    if (disponibilidades.length === 0) {
        return null;
    }

    return disponibilidades.reduce((total, value) => total + value, 0);
}

private eventosExploraPorArtista(espectaculo: EspectaculoResultado) {
    const artistaKey = this.baseArtistKey(espectaculo.artista);

    return this.espectaculosExplora().filter(
        (item) => this.baseArtistKey(item.artista) === artistaKey,
    );
}

private precioEventoValue(espectaculo: EspectaculoResultado): number | null {
    const item = espectaculo as EspectaculoResultado & {
        precioMinimo?: number;
        precioDesde?: number;
        precio?: number;
        minPrecio?: number;
        entradaMasBarata?: number;
    };

    return this.firstNumber(
        item.precioMinimo,
        item.precioDesde,
        item.minPrecio,
        item.entradaMasBarata,
        item.precio,
    );
}

private disponibilidadEventoValue(espectaculo: EspectaculoResultado): number | null {
    const item = espectaculo as EspectaculoResultado & {
        entradasDisponibles?: number;
        entradasLibres?: number;
        libres?: number;
        disponibilidad?: number;
        entradas?: {
            libres?: number;
            disponibles?: number;
            total?: number;
        };
    };

    return this.firstNumber(
        item.entradasDisponibles,
        item.entradasLibres,
        item.libres,
        item.disponibilidad,
        item.entradas?.libres,
        item.entradas?.disponibles,
        item.entradas?.total,
    );
    }

    private firstNumber(...values: Array<number | undefined | null>) {
        const value = values.find((item) => typeof item === 'number' && !Number.isNaN(item));
        return value ?? null;
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

        if (this.authMode() === 'twoFactor') {
            this.submitTwoFactorLogin();
            return;
        }

        if (this.authMode() === 'registerTwoFactor') {
            this.confirmRegisterTwoFactorSetup();
            return;
        }

        if (this.authMode() === 'register' && !this.canRegister()) {
            this.authError.set(this.authGenericError);
            return;
        }

        this.authSubmitting.set(true);
        if (this.authMode() === 'login') {
            this.http.post<LoginResponse>(`${USER_API_BASE_URL}/users/login`, {
                name: this.authEmail().trim(),
                pwd: this.authPassword(),
            }, { withCredentials: true }).subscribe({
                next: (response) => {
                    this.authError.set('');
                    this.authSubmitting.set(false);
                    if (response.twoFactorRequired) {
                        this.twoFactorChallengeToken.set(response.twoFactorChallengeToken || '');
                        this.authMode.set('twoFactor');
                        this.authPassword.set('');
                        this.authMessage.set('Introduce el código de tu app autenticadora.');
                        return;
                    }
                    this.completeLogin(response.user);
                },
                error: () => {
                    this.authError.set(this.authGenericError);
                    this.authMessage.set('');
                    this.authSubmitting.set(false);
                },
            });
            return;
        }

        this.http.post<UserProfile>(`${USER_API_BASE_URL}/users/register`, {
                nombre: this.registerNombre().trim(),
                apellidos: this.registerApellidos().trim(),
                email: this.authEmail().trim(),
                username: this.registerUsername().trim() || null,
                fechaNacimiento: this.registerFechaNacimiento() || null,
                password: this.authPassword(),
                confirmPassword: this.authPasswordRepeat(),
            }, { withCredentials: true }).subscribe({
            next: (response) => {
                this.authError.set('');
                this.authSubmitting.set(false);
                if (this.registerEnableTwoFactor()) {
                    this.beginRegisterTwoFactorSetup(response);
                    return;
                }
                this.completeLogin(response);
            },
            error: () => {
                this.authError.set(this.authGenericError);
                this.authMessage.set('');
                this.authSubmitting.set(false);
            },
        });
    }

    private beginRegisterTwoFactorSetup(profile: UserProfile) {
        this.pendingRegisterProfile.set(profile);
        this.setProfileForm(profile);
        this.authMode.set('registerTwoFactor');
        this.authMessage.set('');
        this.authError.set('');
        this.resetAuthTwoFactorSetup();
        this.twoFactorSetupLoading.set(true);

        this.http.post<TwoFactorSetupResponse>(
            `${USER_API_BASE_URL}/users/2fa/setup`,
            {},
            { withCredentials: true },
        ).subscribe({
            next: (setup) => {
                this.twoFactorQrUrl.set(setup.qrUrl);
                this.twoFactorSecretKey.set(setup.secretKey);
                this.twoFactorSetupOpen.set(true);
                this.twoFactorSetupLoading.set(false);
            },
            error: () => {
                this.twoFactorSetupLoading.set(false);
                this.authError.set('La cuenta se ha creado, pero no se ha podido preparar el 2FA.');
            },
        });
    }

    private confirmRegisterTwoFactorSetup() {
        const code = this.twoFactorSetupCode().trim();
        if (!/^\d{6}$/.test(code)) {
            this.authError.set('Introduce un código de 6 dígitos.');
            return;
        }

        this.authSubmitting.set(true);
        this.authError.set('');
        this.http.post<UserProfile>(
            `${USER_API_BASE_URL}/users/2fa/verify`,
            { code },
            { withCredentials: true },
        ).subscribe({
            next: (profile) => {
                this.authSubmitting.set(false);
                this.resetAuthTwoFactorSetup();
                this.completeLogin(profile);
            },
            error: () => {
                this.authSubmitting.set(false);
                this.authError.set('Código 2FA inválido. Revisa la app autenticadora.');
            },
        });
    }

    private submitTwoFactorLogin() {
        const code = this.twoFactorCode().trim();
        if (!this.twoFactorChallengeToken() || !/^\d{6}$/.test(code)) {
            this.authError.set('Introduce un código de 6 dígitos.');
            return;
        }

        this.authSubmitting.set(true);
        this.http.post<UserProfile>(
            `${USER_API_BASE_URL}/users/2fa/login/verify`,
            {
                challengeToken: this.twoFactorChallengeToken(),
                code,
            },
            { withCredentials: true },
        ).subscribe({
            next: (profile) => {
                this.authSubmitting.set(false);
                this.authError.set('');
                this.authMessage.set('');
                this.completeLogin(profile);
            },
            error: () => {
                this.authSubmitting.set(false);
                this.authError.set('Código 2FA inválido o caducado.');
                this.authMessage.set('');
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

    private completeLogin(user?: UserProfile){
        this.isLoggedIn.set(true);
        if (user) {
            this.setProfileForm(user);
            this.authEmail.set(user.email || this.authEmail());
        }
        const displayName = user?.nombre || user?.username || this.getDisplayName();
        this.userDisplayName.set(displayName);
        this.storeAuthSession(displayName, user?.email || this.authEmail().trim());
        this.descartarReservaSiNoEsDeLaCuentaActual();
        this.authPassword.set('');
        this.authPasswordRepeat.set('');
        this.registerEnableTwoFactor.set(false);
        this.twoFactorCode.set('');
        this.twoFactorChallengeToken.set('');
        this.pendingRegisterProfile.set(null);
        this.cerrarAuthModal();
        this.cargarSesion();
    }

    private restoreAuthSession(){
        if (!this.isBrowser()) {
            return;
        }

        const rawSession = sessionStorage.getItem(Espectaculos.AUTH_STORAGE_KEY);
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

        sessionStorage.setItem(Espectaculos.AUTH_STORAGE_KEY, JSON.stringify({ displayName, email }));
    }

    private clearStoredAuthSession(){
        if (!this.isBrowser()) {
            return;
        }

        sessionStorage.removeItem(Espectaculos.AUTH_STORAGE_KEY);
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

}
