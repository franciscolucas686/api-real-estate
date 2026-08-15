import { JwtService } from '@nestjs/jwt';
import { AppThrottlerGuard } from './app-throttler.guard';
import { TooManyRequestsError } from '../errors';

const JWT_SECRET = 'segredo-de-teste-com-pelo-menos-32-caracteres';

/**
 * Instancia o guard sem passar pelo DI do Nest: `getTracker` só depende do
 * JwtService e do ConfigService, e o resto da máquina do ThrottlerGuard
 * (storage, reflector, options) não participa desta decisão.
 */
function buildGuard() {
  const jwtService = new JwtService({ secret: JWT_SECRET });
  const configService = { jwtSecret: JWT_SECRET };

  const guard = Object.create(AppThrottlerGuard.prototype) as AppThrottlerGuard;
  Object.assign(guard, { jwtService, configService });

  return {
    jwtService,
    getTracker: (req: Record<string, unknown>) =>
      (
        guard as unknown as { getTracker: (r: Record<string, unknown>) => Promise<string> }
      ).getTracker(req),
  };
}

describe('AppThrottlerGuard', () => {
  it('lança TooManyRequestsError em vez do ThrottlerException padrão', async () => {
    const guard = Object.create(AppThrottlerGuard.prototype) as AppThrottlerGuard;

    await expect(
      (
        guard as unknown as { throwThrottlingException: () => Promise<void> }
      ).throwThrottlingException(),
    ).rejects.toThrow(TooManyRequestsError);
  });

  it('expõe status 429 e code estável', async () => {
    const guard = Object.create(AppThrottlerGuard.prototype) as AppThrottlerGuard;

    await expect(
      (
        guard as unknown as { throwThrottlingException: () => Promise<void> }
      ).throwThrottlingException(),
    ).rejects.toMatchObject({
      statusCode: 429,
      code: 'TOO_MANY_REQUESTS',
    });
  });

  describe('getTracker', () => {
    it('chaveia pelo id do usuário quando o cookie accessToken é válido', async () => {
      const { jwtService, getTracker } = buildGuard();
      const accessToken = jwtService.sign({ sub: 'user-123', email: 'a@b.com' });

      await expect(getTracker({ cookies: { accessToken }, ips: ['203.0.113.7'] })).resolves.toBe(
        'user:user-123',
      );
    });

    it('cai no IP real da cadeia X-Forwarded-For quando não há cookie', async () => {
      const { getTracker } = buildGuard();

      await expect(
        getTracker({ cookies: {}, ips: ['203.0.113.7', '10.0.0.1'], ip: '10.0.0.1' }),
      ).resolves.toBe('ip:203.0.113.7');
    });

    it('usa req.ip quando a cadeia de proxy está vazia', async () => {
      const { getTracker } = buildGuard();

      await expect(getTracker({ cookies: undefined, ips: [], ip: '198.51.100.4' })).resolves.toBe(
        'ip:198.51.100.4',
      );
    });

    it('cai no IP quando o token está assinado com outro segredo', async () => {
      const { getTracker } = buildGuard();
      const forjado = new JwtService({ secret: 'outro-segredo-com-32-caracteres-aqui' }).sign({
        sub: 'invasor',
      });

      await expect(
        getTracker({ cookies: { accessToken: forjado }, ips: ['203.0.113.7'] }),
      ).resolves.toBe('ip:203.0.113.7');
    });

    it('cai no IP quando o token expirou — o caso de POST /auth/refresh', async () => {
      const { jwtService, getTracker } = buildGuard();
      const expirado = jwtService.sign({ sub: 'user-123' }, { expiresIn: '-1s' });

      await expect(
        getTracker({ cookies: { accessToken: expirado }, ips: ['203.0.113.7'] }),
      ).resolves.toBe('ip:203.0.113.7');
    });
  });
});
