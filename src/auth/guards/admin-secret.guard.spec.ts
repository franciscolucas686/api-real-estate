import { ExecutionContext } from '@nestjs/common';
import { AdminSecretGuard } from './admin-secret.guard';
import { AdminSecretForbiddenError } from '../../common/errors';

describe('AdminSecretGuard', () => {
  const mockConfigService = { adminSecret: 'super-secret-value' };
  let guard: AdminSecretGuard;

  const createContext = (headers: Record<string, string>): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ headers }),
      }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    guard = new AdminSecretGuard(mockConfigService as never);
  });

  it('lança AdminSecretForbiddenError quando o header está ausente', () => {
    expect(() => guard.canActivate(createContext({}))).toThrow(AdminSecretForbiddenError);
  });

  it('lança AdminSecretForbiddenError quando o header tem valor errado', () => {
    expect(() => guard.canActivate(createContext({ 'x-admin-secret': 'wrong-value' }))).toThrow(
      AdminSecretForbiddenError,
    );
  });

  it('retorna true quando o header bate com o adminSecret configurado', () => {
    expect(guard.canActivate(createContext({ 'x-admin-secret': 'super-secret-value' }))).toBe(true);
  });
});
