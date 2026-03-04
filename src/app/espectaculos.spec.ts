import { TestBed } from '@angular/core/testing';

import { Espectaculos } from './espectaculos';

describe('Espectaculos', () => {
  let service: Espectaculos;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(Espectaculos);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
