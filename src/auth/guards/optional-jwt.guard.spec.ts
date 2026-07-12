import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { OptionalJwtGuard } from './optional-jwt.guard';

describe('OptionalJwtGuard', () => {
  let guard: OptionalJwtGuard;
  const mockContext = {} as ExecutionContext;

  beforeEach(() => {
    guard = new OptionalJwtGuard();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('retorna true mesmo quando o Passport rejeita (sem cookie/token inválido)', async () => {
    jest
      .spyOn(AuthGuard('jwt').prototype, 'canActivate')
      .mockRejectedValue(new UnauthorizedException());

    await expect(guard.canActivate(mockContext)).resolves.toBe(true);
  });

  it('retorna true quando o Passport autentica com sucesso', async () => {
    jest.spyOn(AuthGuard('jwt').prototype, 'canActivate').mockResolvedValue(true);

    await expect(guard.canActivate(mockContext)).resolves.toBe(true);
  });
});
