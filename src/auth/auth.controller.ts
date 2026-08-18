import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
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
import type { Request, Response } from 'express';
import { ConfigService } from '../config/config.service';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { CurrentUserDto } from './dto/current-user.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { AdminSecretGuard } from './guards/admin-secret.guard';
import { JwtRefreshGuard } from './guards/jwt-refresh.guard';
import { JwtGuard } from './guards/jwt.guard';
import { OptionalJwtGuard } from './guards/optional-jwt.guard';

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
  // Declarado só para desmarcar o "required". O @nestjs/swagger documenta todo parâmetro
  // `@Headers()` automaticamente e crava `required: true` (o `?` do TypeScript some na
  // compilação, então a lib não tem como saber que é opcional) — e a doc passava a exigir
  // de quem consome a API um header que o cliente HTTP já manda sozinho.
  @ApiHeader({
    name: 'user-agent',
    description:
      'Enviado automaticamente pelo cliente HTTP. Serve apenas como rótulo do dispositivo na ' +
      'sessão criada — não é exigido e não afeta a autenticação.',
    required: false,
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
  // Mesmo motivo do `register` acima: sem isto a doc pede um header que ninguém precisa enviar.
  @ApiHeader({
    name: 'user-agent',
    description:
      'Enviado automaticamente pelo cliente HTTP. Serve apenas como rótulo do dispositivo na ' +
      'sessão criada — não é exigido e não afeta a autenticação.',
    required: false,
  })
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

  /**
   * Auth-aware, e não `JwtGuard`, pelo mesmo motivo de `GET /properties/status-counts`: o
   * frontend pergunta pela sessão em **toda** página (o nav decide entre "Entrar" e "Dashboard"),
   * e enquanto esta rota respondia 401 a quem nunca logou, cada visita anônima virava
   * `401 → POST /auth/refresh → 401`. Aquele refresh é garantidamente inútil — não há cookie para
   * renovar — e cai num balde de 30/5min por IP, cuja vítima ao estourar é o operador logado.
   *
   * O cliente não pode decidir isso sozinho: os cookies são `httpOnly`, então o JS não enxerga se
   * há sessão. Quem enxerga é este handler, e por isso é ele quem responde a pergunta "vale a pena
   * tentar renovar?". Três ramos:
   *
   * - `user` populado → o perfil, como sempre.
   * - Sem `user` **mas com cookie de refresh** → 401. O access token expirou e a renovação tem o
   *   que renovar; `apiFetch` refresca e repete, exatamente como antes.
   * - Sem `user` e sem cookie de refresh → 200 com `null`. Anônimo de verdade, e nada a tentar.
   *
   * O ramo do meio é o que impede a regressão óbvia: sem ele, um usuário com access token expirado
   * seria informado de que é anônimo e deslogado em silêncio.
   *
   * `res.json(null)` explícito porque um `return null` de handler faz o Nest responder com corpo
   * **vazio**, e aí o `response.json()` do cliente estoura ao tentar parseá-lo. 204 seria pior
   * ainda: o cliente o mapeia para `undefined`, que o React Query recusa como data.
   */
  @Get('me')
  @UseGuards(OptionalJwtGuard)
  @ApiOperation({
    summary: 'Obter perfil da sessão atual',
    description:
      'Devolve o perfil quando há sessão válida. Sem sessão nenhuma responde 200 com `null`, ' +
      'para que um visitante anônimo não dispare uma tentativa de refresh inútil. Responde 401 ' +
      'apenas quando existe cookie de refresh, ou seja, quando renovar de fato pode resolver.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Perfil recuperado, ou `null` quando não há sessão',
    schema: {
      example: {
        id: 'uuid',
        email: 'user@example.com',
        name: 'Lucas',
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Access token ausente ou expirado, mas há cookie de refresh — renove e repita',
  })
  getProfile(
    @CurrentUser() user: CurrentUserDto | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    if (!user) {
      if (request.cookies?.refreshToken) {
        throw new UnauthorizedException();
      }

      response.json(null);
      return;
    }

    response.json({
      id: user.id,
      email: user.email,
      name: user.name,
    });
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
