import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { ConfigService } from '../../config/config.service';
import { AdminSecretForbiddenError } from '../../common/errors';

@Injectable()
export class AdminSecretGuard implements CanActivate {
  constructor(private configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const secret = request.headers['x-admin-secret'];

    if (!secret || secret !== this.configService.adminSecret) {
      throw new AdminSecretForbiddenError();
    }

    return true;
  }
}
