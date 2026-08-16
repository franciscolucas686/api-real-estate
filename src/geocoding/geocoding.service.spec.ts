import { GeocodingService } from './geocoding.service';

describe('GeocodingService — espaçamento das chamadas ao Nominatim', () => {
  let service: GeocodingService;
  let disparos: number[];

  beforeEach(() => {
    jest.useFakeTimers();
    service = new GeocodingService();
    disparos = [];

    global.fetch = jest.fn(() => {
      disparos.push(Date.now());
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([{ lat: '-23.5', lon: '-46.6' }]),
      } as Response);
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  /**
   * A versão anterior guardava `lastCall` e só o atualizava depois do await: três
   * chamadas concorrentes liam o mesmo valor velho, dormiam o mesmo tempo e saíam
   * juntas. Ela atrasava a rajada em vez de espaçá-la, que é o que a política de 1
   * req/s do Nominatim proíbe — e a punição é bloqueio por IP.
   */
  it('espaça chamadas concorrentes em 1s cada, em vez de soltá-las juntas', async () => {
    const pendentes = Promise.all([
      service.geocode('Centro', 'São Paulo', 'SP'),
      service.geocode('Moema', 'São Paulo', 'SP'),
      service.geocode('Lapa', 'São Paulo', 'SP'),
    ]);

    await jest.advanceTimersByTimeAsync(3000);
    await pendentes;

    expect(disparos).toHaveLength(3);
    expect(disparos[1] - disparos[0]).toBeGreaterThanOrEqual(1000);
    expect(disparos[2] - disparos[1]).toBeGreaterThanOrEqual(1000);
  });

  it('não atrasa uma chamada isolada quando a janela já passou', async () => {
    const inicio = Date.now();

    await service.geocode('Centro', 'São Paulo', 'SP');

    expect(disparos[0] - inicio).toBe(0);
  });
});
