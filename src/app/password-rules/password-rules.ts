import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { PasswordValidationService } from '../password-validation.service';

@Component({
  selector: 'app-password-rules',
  imports: [CommonModule],
  templateUrl: './password-rules.html',
  styleUrl: './password-rules.css',
})
export class PasswordRulesComponent {
  @Input() password = '';
  @Input() confirmPassword = '';
  @Input() username = '';
  @Input() nombre = '';
  @Input() apellidos = '';
  @Input() email = '';
  @Input() fechaNacimiento = '';

  constructor(private passwordValidation: PasswordValidationService) {}

  get rules() {
    return this.passwordValidation.getRules({
      password: this.password,
      confirmPassword: this.confirmPassword,
      username: this.username,
      nombre: this.nombre,
      apellidos: this.apellidos,
      email: this.email,
      fechaNacimiento: this.fechaNacimiento,
    });
  }

  get strength() {
    return this.passwordValidation.getStrength(this.rules);
  }
}
