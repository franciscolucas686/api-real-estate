import {
  RefreshTokenExpiredError,
  RefreshTokenMismatchError,
  RefreshTokenMissingError,
} from '../../common/errors';
import { JwtRefreshStrategy } from './jwt-refresh.strategy';

describe('JwtRefreshStrategy', () => {
  const mockConfigService = { jwtRefreshSecret: 'refresh-secret-value' };
  let mockUsersService: { findById: jest.Mock };
  let strategy: JwtRefreshStrategy;

  const createRequest = (token: string) => ({ cookies: { refreshToken: token } }) as never;

  beforeEach(() => {
    mockUsersService = { findById: jest.fn() };
    strategy = new JwtRefreshStrategy(mockConfigService as never, mockUsersService as never);
  });

  it('lança RefreshTokenMissingError quando o usuário não existe', async () => {
    mockUsersService.findById.mockResolvedValue(null);

    await expect(strategy.validate(createRequest('token'), { sub: 'user-1' })).rejects.toThrow(
      RefreshTokenMissingError,
    );
  });

  it('lança RefreshTokenMissingError quando o usuário não tem refreshToken salvo', async () => {
    mockUsersService.findById.mockResolvedValue({ id: 'user-1', refreshToken: null });

    await expect(strategy.validate(createRequest('token'), { sub: 'user-1' })).rejects.toThrow(
      RefreshTokenMissingError,
    );
  });

  it('lança RefreshTokenMismatchError quando o token não corresponde ao salvo', async () => {
    mockUsersService.findById.mockResolvedValue({ id: 'user-1', refreshToken: 'stored-token' });

    await expect(
      strategy.validate(createRequest('different-token'), { sub: 'user-1' }),
    ).rejects.toThrow(RefreshTokenMismatchError);
  });

  it('lança RefreshTokenExpiredError quando o token salvo expirou', async () => {
    mockUsersService.findById.mockResolvedValue({
      id: 'user-1',
      refreshToken: 'token',
      refreshTokenExpiresAt: new Date(Date.now() - 1000),
    });

    await expect(strategy.validate(createRequest('token'), { sub: 'user-1' })).rejects.toThrow(
      RefreshTokenExpiredError,
    );
  });

  it('retorna o payload quando o token é válido e não expirou', async () => {
    mockUsersService.findById.mockResolvedValue({
      id: 'user-1',
      refreshToken: 'token',
      refreshTokenExpiresAt: new Date(Date.now() + 1000 * 60),
    });

    const result = await strategy.validate(createRequest('token'), { sub: 'user-1' });

    expect(result).toEqual({ id: 'user-1' });
  });
});
