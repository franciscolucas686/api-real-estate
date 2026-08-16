import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { ConfigService } from '../config/config.service';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { CurrentUserDto } from './dto/current-user.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { AdminSecretGuard } from './guards/admin-secret.guard';
import { JwtRefreshGuard } from './guards/jwt-refresh.guard';
import { JwtGuard } from './guards/jwt.guard';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private configService: ConfigService,
  ) {}

  /**
   * Opções compartilhadas pelos dois cookies e pelo logout — que precisa repetir
   * `domain` e `sameSite` exatamente, ou o `clearCookie` não casa com o cookie
   * emitido e a sessão não é limpa de fato.
   */
  private cookieOptions() {
    const domain = this.configService.cookieDomain;

    return {
      httpOnly: true,
      secure: this.configService.isProduction(),
      sameSite: 'lax' as const,
      // Normalmente ausente, e isso é o correto — inclusive com o app no apex e a API
      // em `api.`. Quem emite o cookie é esta API, então host-only já o prende ao host
      // para onde os `fetch` vão; o browser o anexa, e `lax` não atrapalha porque
      // subdomínios do mesmo domínio registrável são o mesmo *site*. Definir `domain`
      // aqui não conserta nada e amplia a exposição: o cookie de sessão passaria a
      // acompanhar requisições ao apex, ao www e a todo subdomínio futuro.
      //
      // Só faz sentido se um dia o cookie precisar chegar a um host DIFERENTE do que
      // o emitiu (uma segunda API, por exemplo).
      ...(domain && { domain }),
    };
  }

  /**
   * Rótulo de diagnóstico da sessão, não identidade — nada depende dele. Truncado
   * porque o User-Agent é texto arbitrário vindo do cliente e vai para uma coluna
   * sem limite; 255 é folgado para qualquer navegador real.
   */
  private static readonly USER_AGENT_MAX_LENGTH = 255;

  private truncateUserAgent(userAgent?: string): string | null {
    if (!userAgent) return null;
    return userAgent.slice(0, AuthController.USER_AGENT_MAX_LENGTH);
  }

  private setAuthCookies(response: Response, accessToken: string, refreshToken: string): void {
    const options = this.cookieOptions();

    response.cookie('accessToken', accessToken, {
      ...options,
      maxAge: 15 * 60 * 1000,
    });

    response.cookie('refreshToken', refreshToken, {
      ...options,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
  }

  /**
   * Tira as opções do mesmo `cookieOptions()` de propósito: o navegador casa o cookie a
   * apagar por nome + domínio + path, então um clear que discorde do set não limpa nada.
   */
  private clearAuthCookies(response: Response): void {
    const options = this.cookieOptions();
    response.clearCookie('accessToken', options);
    response.clearCookie('refreshToken', options);
  }

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { ttl: 5 * 60 * 1000, limit: 5 } })
  @UseGuards(AdminSecretGuard)
  @ApiOperation({ summary: 'Registrar novo usuário' })
  @ApiHeader({
    name: 'x-admin-secret',
    description: 'Chave de acesso administrativo necessária para criar usuários',
    required: true,
  })
  @ApiBody({ type: RegisterDto })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Usuário registrado com sucesso',
    schema: {
      example: {
        user: { id: 'uuid', email: 'user@example.com', name: 'João' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Email já cadastrado' })
  @ApiResponse({ status: 403, description: 'Acesso não autorizado' })
  async register(
    @Body() registerDto: RegisterDto,
    @Res({ passthrough: true }) response: Response,
    @Headers('user-agent') userAgent?: string,
  ) {
    const { accessToken, refreshToken, user } = await this.authService.register(
      registerDto,
      this.truncateUserAgent(userAgent),
    );

    this.setAuthCookies(response, accessToken, refreshToken);

    return {
      user,
    };
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 5 * 60 * 1000, limit: 5 } })
  @ApiOperation({ summary: 'Fazer login' })
  @ApiBody({ type: LoginDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Login realizado com sucesso',
    schema: {
      example: {
        user: { id: 'uuid', email: 'user@example.com', name: 'João' },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Email ou senha inválidos' })
  async login(
    @Body() loginDto: LoginDto,
    @Res({ passthrough: true }) response: Response,
    @Headers('user-agent') userAgent?: string,
  ) {
    const { accessToken, refreshToken, user } = await this.authService.login(
      loginDto,
      this.truncateUserAgent(userAgent),
    );

    this.setAuthCookies(response, accessToken, refreshToken);

    return {
      user,
    };
  }

  @Post('refresh')
  @UseGuards(JwtRefreshGuard)
  @HttpCode(HttpStatus.OK)
  // Chaveado por IP, não por usuário: o access token está expirado justamente por
  // isso a rota foi chamada, então `AppThrottlerGuard.getTracker` cai no balde de IP.
  // 10/5min era apertado demais para um NAT corporativo ou uma operadora móvel, onde
  // várias sessões legítimas dividem o mesmo endereço.
  @Throttle({ default: { ttl: 5 * 60 * 1000, limit: 30 } })
  @ApiOperation({ summary: 'Atualizar token de acesso' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Token atualizado com sucesso',
    schema: {
      example: {},
    },
  })
  @ApiResponse({ status: 401, description: 'Refresh token inválido' })
  async refresh(
    @CurrentUser() user: CurrentUserDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { accessToken, refreshToken } = await this.authService.refreshToken(
      user.id,
      user.sessionId,
    );

    this.setAuthCookies(response, accessToken, refreshToken);

    return {};
  }

  @Get('me')
  @UseGuards(JwtGuard)
  @ApiOperation({ summary: 'Obter perfil do usuário autenticado' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Perfil recuperado com sucesso',
    schema: {
      example: {
        id: 'uuid',
        email: 'user@example.com',
        name: 'Lucas',
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Não autorizado' })
  async getProfile(@CurrentUser() user: CurrentUserDto) {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
    };
  }

  @Post('logout')
  @UseGuards(JwtGuard)
  @HttpCode(HttpStatus.OK)
  @ApiSecurity('cookie')
  @ApiOperation({
    summary: 'Fazer logout',
    description:
      'Encerra apenas a sessão deste dispositivo. As sessões abertas em outros ' +
      'dispositivos continuam válidas — use POST /auth/logout-all para derrubar todas.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Logout realizado com sucesso',
    content: {
      'application/json': { example: { message: 'Logout realizado com sucesso' } },
    },
  })
  @ApiResponse({ status: 401, description: 'Não autorizado' })
  async logout(
    @CurrentUser() user: CurrentUserDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.authService.logout(user.sessionId);

    this.clearAuthCookies(response);

    return { message: 'Logout realizado com sucesso' };
  }

  @Post('logout-all')
  @UseGuards(JwtGuard)
  @HttpCode(HttpStatus.OK)
  @ApiSecurity('cookie')
  @ApiOperation({
    summary: 'Sair de todos os dispositivos',
    description:
      'Apaga todas as sessões do usuário, inclusive a que fez a chamada. Todo refresh ' +
      'token emitido para esta conta deixa de valer imediatamente. É a ação a usar ' +
      'quando se suspeita que uma sessão vazou.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Sessões encerradas',
    content: {
      'application/json': {
        example: { message: 'Sessões encerradas em todos os dispositivos', count: 3 },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Não autorizado' })
  async logoutAll(
    @CurrentUser() user: CurrentUserDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.logoutAll(user.id);

    this.clearAuthCookies(response);

    return result;
  }
}
