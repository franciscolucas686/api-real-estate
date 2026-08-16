import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { createHash, timingSafeEqual } from 'node:crypto';
import { ConfigService } from '../../config/config.service';
import { AdminSecretForbiddenError } from '../../common/errors';

@Injectable()
export class AdminSecretGuard implements CanActivate {
  constructor(private configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const secret = request.headers['x-admin-secret'];

    if (typeof secret !== 'string' || !this.matchesAdminSecret(secret)) {
      throw new AdminSecretForbiddenError();
    }

    return true;
  }

  /**
   * Comparação em tempo constante, como em `SessionsService.matches`.
   *
   * O `!==` que estava aqui sai do laço no primeiro byte diferente, então o tempo de
   * resposta cresce com o tamanho do prefixo acertado — é o canal que permite
   * descobrir um segredo caractere a caractere em vez de por força bruta. O ganho
   * prático é pequeno atrás da rede e do teto de 5/5min da rota, mas o custo de
   * fechar é uma linha, e o projeto já compara segredo assim em outro lugar.
   *
   * Passa pelo SHA-256 antes porque `timingSafeEqual` lança quando os buffers têm
   * tamanhos diferentes — e o tamanho vem do cliente. Comparar os digests iguala o
   * comprimento sem vazar o do segredo.
   */
  private matchesAdminSecret(presented: string): boolean {
    return timingSafeEqual(
      createHash('sha256').update(presented).digest(),
      createHash('sha256').update(this.configService.adminSecret).digest(),
    );
  }
}
