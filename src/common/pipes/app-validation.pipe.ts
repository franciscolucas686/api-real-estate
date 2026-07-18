import { BadRequestException, ValidationError, ValidationPipe } from '@nestjs/common';

// Mirrors ValidationPipe's internal (private) flattenValidationErrors, so nested
// DTO errors (@ValidateNested()) keep the same "parent.field" message format —
// only difference from the default is that we also attach a stable `code`.
function flattenValidationErrors(errors: ValidationError[], parentPath?: string): string[] {
  return errors.flatMap((error) => {
    if (!error.children?.length) {
      return error.constraints ? Object.values(error.constraints) : [];
    }
    const path = parentPath ? `${parentPath}.${error.property}` : error.property;
    return error.children.flatMap((child) =>
      child.children?.length
        ? flattenValidationErrors([child], path)
        : Object.values(child.constraints ?? {}).map((message) => `${path}.${message}`),
    );
  });
}

/**
 * The single ValidationPipe config used both by the real app (src/main.ts) and by
 * e2e specs that build their own Nest application instance — keeps the VALIDATION_ERROR
 * `code` contract exercised in both.
 */
export function createAppValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    exceptionFactory: (errors: ValidationError[]) => {
      const message = flattenValidationErrors(errors);
      return new BadRequestException({
        message,
        error: 'Bad Request',
        code: 'VALIDATION_ERROR',
      });
    },
  });
}
