import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '../../config/config.service';
import {
  RefreshTokenExpiredError,
  RefreshTokenMismatchError,
  RefreshTokenMissingError,
} from '../../common/errors';
import { SessionsService } from '../sessions.service';

export interface JwtRefreshPayload {
  sub: string;
  sid: string;
}

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
  constructor(
    private configService: ConfigService,
    private sessionsService: SessionsService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (request: Request) => {
          return request?.cookies?.refreshToken;
        },
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.jwtRefreshSecret,
      passReqToCallback: true,
    });
  }

  /**
   * A busca é pela sessão (`sid`), não pelo usuário: um token só vale para a linha que o
   * emitiu, então outro dispositivo ter rotacionado não diz nada sobre este.
   *
   * Um refresh token emitido antes da migração para sessões não tem `sid` e cai no
   * primeiro ramo — o portador refaz o login, que é o comportamento pretendido.
   */
  async validate(request: Request, payload: JwtRefreshPayload) {
    const token = request?.cookies?.refreshToken;
    const session = payload.sid ? await this.sessionsService.findById(payload.sid) : null;

    // Sessão revogada (logout, logout-all) ou token sem `sid`. `userId` divergente cai
    // aqui de propósito: um `sid` válido com `sub` de outro usuário é token forjado, e
    // responder "não existe" é o que não confirma a existência da sessão.
    if (!session || session.userId !== payload.sub) {
      throw new RefreshTokenMissingError();
    }

    if (!this.sessionsService.matches(session, token)) {
      throw new RefreshTokenMismatchError();
    }

    if (session.expiresAt < new Date()) {
      throw new RefreshTokenExpiredError();
    }

    return { id: payload.sub, sessionId: session.id };
  }
}
