import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { USER_API_BASE_URL } from '../api.config';
import { PasswordRulesComponent } from '../password-rules/password-rules';
import { PasswordValidationService } from '../password-validation.service';

@Component({
  selector: 'app-reset-password',
  imports: [CommonModule, FormsModule, RouterLink, PasswordRulesComponent],
  templateUrl: './reset-password.html',
  styleUrl: './reset-password.css',
})
export class ResetPasswordComponent implements OnInit {
  token = signal('');
  validating = signal(true);
  validToken = signal(false);
  password = signal('');
  confirmPassword = signal('');
  showPassword = signal(false);
  showConfirmPassword = signal(false);
  loading = signal(false);
  message = signal('');
  error = signal('');

  passwordValid = computed(() => this.passwordValidation.isValid({
    password: this.password(),
    confirmPassword: this.confirmPassword(),
    username: '',
    nombre: '',
    apellidos: '',
    email: '',
    fechaNacimiento: '',
  }));

  constructor(
    private route: ActivatedRoute,
    private http: HttpClient,
    private passwordValidation: PasswordValidationService,
  ) {}

  ngOnInit() {
    const token = this.route.snapshot.queryParamMap.get('token') || '';
    this.token.set(token);

    if (!token) {
      this.validating.set(false);
      this.validToken.set(false);
      this.error.set('El enlace no es válido o ha caducado.');
      return;
    }

    this.http.get<{ valid: boolean }>(
      `${USER_API_BASE_URL}/password-reset/validate?token=${encodeURIComponent(token)}`,
      { withCredentials: true },
    ).subscribe({
      next: (response) => {
        this.validToken.set(response.valid);
        this.validating.set(false);
        if (!response.valid) {
          this.error.set('El enlace no es válido o ha caducado.');
        }
      },
      error: () => {
        this.validToken.set(false);
        this.validating.set(false);
        this.error.set('El enlace no es válido o ha caducado.');
      },
    });
  }

  submit() {
    if (!this.passwordValid()) {
      this.error.set('No se pudo establecer la contraseña. Verifique la política de seguridad.');
      return;
    }

    this.loading.set(true);
    this.error.set('');
    this.message.set('');

    this.http.post<{ message: string }>(
      `${USER_API_BASE_URL}/password-reset/confirm`,
      {
        token: this.token(),
        newPassword: this.password(),
        confirmPassword: this.confirmPassword(),
      },
      { withCredentials: true },
    ).subscribe({
      next: (response) => {
        this.message.set(response.message);
        this.password.set('');
        this.confirmPassword.set('');
        this.validToken.set(false);
        this.loading.set(false);
      },
      error: (error) => {
        this.error.set(error?.error?.message || 'No se pudo establecer la contraseña. Verifique la política de seguridad.');
        this.loading.set(false);
      },
    });
  }
}
