import {
  RefreshTokenExpiredError,
  RefreshTokenMismatchError,
  RefreshTokenMissingError,
} from '../../common/errors';
import { JwtRefreshStrategy } from './jwt-refresh.strategy';

describe('JwtRefreshStrategy', () => {
  const mockConfigService = { jwtRefreshSecret: 'refresh-secret-value' };
  let mockSessionsService: { findById: jest.Mock; matches: jest.Mock };
  let strategy: JwtRefreshStrategy;

  const createRequest = (token: string) => ({ cookies: { refreshToken: token } }) as never;

  const session = (overrides: Partial<Record<string, unknown>> = {}) => ({
    id: 'session-1',
    userId: 'user-1',
    refreshTokenHash: 'hash',
    expiresAt: new Date(Date.now() + 1000 * 60),
    ...overrides,
  });

  beforeEach(() => {
    mockSessionsService = { findById: jest.fn(), matches: jest.fn().mockReturnValue(true) };
    strategy = new JwtRefreshStrategy(mockConfigService as never, mockSessionsService as never);
  });

  it('lança RefreshTokenMissingError quando a sessão não existe (logout ou logout-all)', async () => {
    mockSessionsService.findById.mockResolvedValue(null);

    await expect(
      strategy.validate(createRequest('token'), { sub: 'user-1', sid: 'session-1' }),
    ).rejects.toThrow(RefreshTokenMissingError);
  });

  // Token anterior à migração para sessões: assinatura válida, mas sem `sid`. O portador
  // precisa refazer o login em vez de receber um 500 por consulta com id indefinido.
  it('lança RefreshTokenMissingError quando o payload não tem sid', async () => {
    await expect(
      strategy.validate(createRequest('token'), { sub: 'user-1' } as never),
    ).rejects.toThrow(RefreshTokenMissingError);

    expect(mockSessionsService.findById).not.toHaveBeenCalled();
  });

  it('lança RefreshTokenMissingError quando a sessão pertence a outro usuário', async () => {
    mockSessionsService.findById.mockResolvedValue(session({ userId: 'outro-usuario' }));

    await expect(
      strategy.validate(createRequest('token'), { sub: 'user-1', sid: 'session-1' }),
    ).rejects.toThrow(RefreshTokenMissingError);
  });

  it('lança RefreshTokenMismatchError quando o token não corresponde ao hash salvo', async () => {
    mockSessionsService.findById.mockResolvedValue(session());
    mockSessionsService.matches.mockReturnValue(false);

    await expect(
      strategy.validate(createRequest('token-diferente'), { sub: 'user-1', sid: 'session-1' }),
    ).rejects.toThrow(RefreshTokenMismatchError);
  });

  it('lança RefreshTokenExpiredError quando a sessão expirou', async () => {
    mockSessionsService.findById.mockResolvedValue(
      session({ expiresAt: new Date(Date.now() - 1000) }),
    );

    await expect(
      strategy.validate(createRequest('token'), { sub: 'user-1', sid: 'session-1' }),
    ).rejects.toThrow(RefreshTokenExpiredError);
  });

  it('retorna id do usuário e da sessão quando o token é válido', async () => {
    mockSessionsService.findById.mockResolvedValue(session());

    const result = await strategy.validate(createRequest('token'), {
      sub: 'user-1',
      sid: 'session-1',
    });

    expect(result).toEqual({ id: 'user-1', sessionId: 'session-1' });
  });
});
