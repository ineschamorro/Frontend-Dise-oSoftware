import { CommonModule } from '@angular/common';
import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { USER_API_BASE_URL } from '../api.config';

@Component({
  selector: 'app-forgot-password',
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './forgot-password.html',
  styleUrl: './forgot-password.css',
})
export class ForgotPasswordComponent {
  email = signal('');
  loading = signal(false);
  message = signal('');
  error = signal('');

  constructor(private http: HttpClient) {}

  submit() {
    this.loading.set(true);
    this.message.set('');
    this.error.set('');

    this.http.post<{ message: string }>(
      `${USER_API_BASE_URL}/password-reset/request`,
      { email: this.email().trim() },
      { withCredentials: true },
    ).subscribe({
      next: (response) => {
        this.message.set(response.message);
        this.loading.set(false);
      },
      error: () => {
        this.message.set('Si el correo existe, enviaremos instrucciones para restablecer la contraseña.');
        this.loading.set(false);
      },
    });
  }
}
