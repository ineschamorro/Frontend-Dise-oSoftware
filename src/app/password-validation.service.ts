import { Injectable } from '@angular/core';

export interface PasswordValidationInput {
  password: string;
  confirmPassword: string;
  username?: string;
  nombre?: string;
  apellidos?: string;
  email?: string;
  fechaNacimiento?: string;
}

export interface PasswordRule {
  id: string;
  label: string;
  valid: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class PasswordValidationService {
  getRules(input: PasswordValidationInput): PasswordRule[] {
    const password = input.password || '';

    return [
      { id: 'length', label: 'Al menos 12 caracteres', valid: password.length >= 12 },
      { id: 'uppercase', label: 'Una letra mayuscula', valid: /[A-Z]/.test(password) },
      { id: 'lowercase', label: 'Una letra minuscula', valid: /[a-z]/.test(password) },
      { id: 'number', label: 'Un numero', valid: /\d/.test(password) },
      { id: 'symbol', label: 'Un simbolo', valid: /[^A-Za-z0-9]/.test(password) },
      {
        id: 'match',
        label: 'Las contraseñas coinciden',
        valid: password.length > 0 && password === (input.confirmPassword || ''),
      },
      {
        id: 'personal',
        label: 'No contiene nombre, apellidos, alias ni email',
        valid: !this.containsPersonalInfo(input),
      },
      {
        id: 'spaces',
        label: 'No empieza ni termina con espacios',
        valid: password.length === 0 || password === password.trim(),
      },
      {
        id: 'control',
        label: 'No contiene caracteres de control',
        valid: !/[\x00-\x1F\x7F]/.test(password),
      },
      {
        id: 'obvious',
        label: 'No usa patrones faciles como 123456, qwerty o admin',
        valid: !this.containsObviousPattern(password),
      },
      {
        id: 'birth-year',
        label: 'No contiene tu ano de nacimiento',
        valid: !this.containsBirthYear(input),
      },
    ];
  }

  getStrength(rules: PasswordRule[]) {
    const validCount = rules.filter((rule) => rule.valid).length;
    const score = Math.round((validCount / rules.length) * 100);

    if (score < 50) {
      return { score, label: 'Debil', level: 'weak' };
    }
    if (score < 85) {
      return { score, label: 'Media', level: 'medium' };
    }
    return { score, label: 'Fuerte', level: 'strong' };
  }

  isValid(input: PasswordValidationInput) {
    return this.getRules(input).every((rule) => rule.valid);
  }

  private containsPersonalInfo(input: PasswordValidationInput) {
    const password = this.normalize(input.password);
    const values = [
      input.nombre,
      input.apellidos,
      input.username,
      input.email?.split('@')[0],
      ...(input.email?.split('@')[0]?.split(/[._\-+]/) || []),
    ];

    return values.some((value) => this.containsValue(password, value));
  }

  private containsValue(password: string, value?: string) {
    const normalizedValue = this.normalize(value || '');

    if (normalizedValue.length >= 3 && password.includes(normalizedValue)) {
      return true;
    }

    return normalizedValue
      .split(/\s+/)
      .some((part) => part.length >= 3 && password.includes(part));
  }

  private containsObviousPattern(value: string) {
    const password = this.normalize(value);

    return password.includes('123456')
      || password.includes('123456789')
      || password.includes('abcdef')
      || password.includes('qwerty')
      || password.includes('asdfgh')
      || password.includes('password')
      || password.includes('contrasena')
      || password.includes('admin')
      || password.includes('usuario')
      || password.includes('entradas')
      || password.includes('esientradas')
      || /(.)\1{7,}/.test(password);
  }

  private containsBirthYear(input: PasswordValidationInput) {
    const birthYear = input.fechaNacimiento?.slice(0, 4);

    return !!birthYear && this.normalize(input.password).includes(birthYear);
  }

  private normalize(value: string) {
    return value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }
}
