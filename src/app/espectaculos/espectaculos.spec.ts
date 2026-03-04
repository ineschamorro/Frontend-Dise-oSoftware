import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Espectaculos } from './espectaculos';

describe('Espectaculos', () => {
  let component: Espectaculos;
  let fixture: ComponentFixture<Espectaculos>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Espectaculos]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Espectaculos);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
