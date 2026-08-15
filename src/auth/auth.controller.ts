import { Body, Controller, Get, HttpCode, HttpStatus, Post, Res, UseGuards } from '@nestjs/common';
import { ApiBody, ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
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

  private setAuthCookies(response: Response, accessToken: string, refreshToken: string): void {
    response.cookie('accessToken', accessToken, {
      httpOnly: true,
      secure: this.configService.isProduction(),
      sameSite: 'lax',
      maxAge: 15 * 60 * 1000,
    });

    response.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: this.configService.isProduction(),
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
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
  async register(@Body() registerDto: RegisterDto, @Res({ passthrough: true }) response: Response) {
    const { accessToken, refreshToken, user } = await this.authService.register(registerDto);

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
  async login(@Body() loginDto: LoginDto, @Res({ passthrough: true }) response: Response) {
    const { accessToken, refreshToken, user } = await this.authService.login(loginDto);

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
    const { accessToken, refreshToken } = await this.authService.refreshToken(user.id);

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
  @ApiOperation({ summary: 'Fazer logout' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Logout realizado com sucesso',
    schema: {
      example: {
        message: 'Logout realizado com sucesso',
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Não autorizado' })
  async logout(
    @CurrentUser() user: CurrentUserDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const userId = user.id;
    await this.authService.logout(userId);

    const cookieOptions = {
      httpOnly: true,
      secure: this.configService.isProduction(),
      sameSite: 'lax' as const,
    };
    response.clearCookie('accessToken', cookieOptions);
    response.clearCookie('refreshToken', cookieOptions);

    return { message: 'Logout realizado com sucesso' };
  }
}
