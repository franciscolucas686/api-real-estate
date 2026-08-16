import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '../../config/config.service';
import { UsersService } from '../../users/users.service';

interface JwtPayload {
  sub: string;
  email: string;
  /** Id da sessão. Ausente em tokens emitidos antes da migração para sessões. */
  sid?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (request: Request) => {
          return request?.cookies?.accessToken;
        },
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.jwtSecret,
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.usersService.findById(payload.sub);
    return {
      id: payload.sub,
      email: payload.email,
      name: user?.name ?? null,
      // Propagado para que `POST /auth/logout` saiba qual sessão encerrar. Fica vazio
      // para um access token emitido antes da migração; o logout então não acha linha
      // nenhuma e é inofensivo, porque o refresh correspondente também já não vale.
      sessionId: payload.sid ?? '',
    };
  }
}
