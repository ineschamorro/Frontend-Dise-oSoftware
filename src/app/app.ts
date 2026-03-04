import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Espectaculos } from './espectaculos/espectaculos';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Espectaculos],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly title = signal('esife');
}
