import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import {
  EmailAlreadyExistsError,
  InvalidCredentialsError,
  UserNotFoundError,
} from '../common/errors';
import { ConfigService } from '../config/config.service';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { SessionsService } from './sessions.service';

/** Validade do refresh token, em dias. Desliza a cada rotação. */
const REFRESH_TOKEN_DAYS = 7;

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private sessionsService: SessionsService,
  ) {}

  async register(registerDto: RegisterDto, userAgent?: string | null) {
    const { email, password, name } = registerDto;

    const existingUser = await this.usersService.findByEmail(email);
    if (existingUser) {
      throw new EmailAlreadyExistsError();
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await this.usersService.create({
      email,
      password: hashedPassword,
      name,
    });

    const { accessToken, refreshToken } = await this.startSession(user.id, user.email, userAgent);

    return {
      accessToken,
      refreshToken,
      user,
    };
  }

  async login(loginDto: LoginDto, userAgent?: string | null) {
    const { email, password } = loginDto;

    const user = await this.usersService.findByEmail(email);
    if (!user) {
      throw new InvalidCredentialsError();
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new InvalidCredentialsError();
    }

    const { accessToken, refreshToken } = await this.startSession(user.id, user.email, userAgent);

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    };
  }

  /**
   * Rotaciona **apenas** a sessão apresentada. As outras sessões do usuário —
   * outros dispositivos — seguem intactas, que é o ponto do modelo de sessões.
   */
  async refreshToken(userId: string, sessionId: string) {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new UserNotFoundError();
    }

    const { accessToken, refreshToken, expiresAt } = this.signTokens(
      user.id,
      user.email,
      sessionId,
    );

    await this.sessionsService.rotate(sessionId, refreshToken, expiresAt);

    return { accessToken, refreshToken };
  }

  /** Encerra só o dispositivo que chamou. */
  async logout(sessionId: string) {
    await this.sessionsService.delete(sessionId);
    return { message: 'Logout realizado com sucesso' };
  }

  /** Encerra todos os dispositivos do usuário, incluindo o que chamou. */
  async logoutAll(userId: string) {
    const count = await this.sessionsService.deleteAllForUser(userId);
    return { message: 'Sessões encerradas em todos os dispositivos', count };
  }

  /**
   * Sorteia o id da sessão, assina os tokens com ele e só então grava a linha —
   * nessa ordem porque o `sid` precisa estar dentro dos tokens, o que permite uma
   * única escrita em vez de inserir e depois atualizar.
   */
  private async startSession(userId: string, email: string, userAgent?: string | null) {
    const sessionId = randomUUID();
    const { accessToken, refreshToken, expiresAt } = this.signTokens(userId, email, sessionId);

    await this.sessionsService.create({
      id: sessionId,
      userId,
      refreshToken,
      expiresAt,
      userAgent,
    });

    return { accessToken, refreshToken } as const;
  }

  /**
   * `sid` vai nos **dois** tokens: o refresh precisa dele para achar a linha por chave
   * primária, e o access precisa porque `POST /auth/logout` é guardado por `JwtGuard` e
   * tem que saber qual sessão apagar.
   *
   * `jti` vai só no refresh, e é o que torna cada rotação distinta: sem ele, duas emissões
   * no mesmo segundo produzem bytes idênticos (payload igual + `iat` em segundos), o que
   * tornava impossível afirmar em teste que o token mudou.
   */
  private signTokens(userId: string, email: string, sessionId: string) {
    const accessToken = this.jwtService.sign(
      { sub: userId, email, sid: sessionId },
      { secret: this.configService.jwtSecret, expiresIn: '15m' },
    );

    const refreshToken = this.jwtService.sign(
      { sub: userId, sid: sessionId, jti: randomUUID() },
      { secret: this.configService.jwtRefreshSecret, expiresIn: `${REFRESH_TOKEN_DAYS}d` },
    );

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_DAYS);

    return { accessToken, refreshToken, expiresAt } as const;
  }
}
