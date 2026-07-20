import { AppThrottlerGuard } from './app-throttler.guard';
import { TooManyRequestsError } from '../errors';

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
});
