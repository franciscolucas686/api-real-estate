import { Body, Controller, Get, HttpStatus, Patch, UseGuards } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { SiteSettingsDto, UpdateSiteSettingsDto } from './dto';
import { SiteSettingsService } from './site-settings.service';

@ApiTags('site-settings')
@Controller('site-settings')
export class SiteSettingsController {
  constructor(private readonly siteSettingsService: SiteSettingsService) {}

  @Get()
  @ApiOperation({
    summary: 'Obter configurações do site',
    description:
      'Retorna as configurações globais do site (WhatsApp, e-mail, Instagram, horário de atendimento). ' +
      'Este endpoint é público — não requer autenticação, pois os dados são exibidos na página de contato para todos os visitantes.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Configurações retornadas com sucesso',
    type: SiteSettingsDto,
    content: {
      'application/json': {
        example: {
          id: 'singleton',
          whatsapp: '11987654321',
          email: 'contato@imobiliaria.com',
          instagram: 'francinegestora',
          hours: 'Seg–Sex: 9h às 18h | Sáb: 9h às 13h',
          updatedAt: '2026-06-18T01:15:00.000Z',
        },
      },
    },
  })
  findOrDefault() {
    return this.siteSettingsService.findOrDefault();
  }

  @Patch()
  @UseGuards(JwtGuard)
  @ApiSecurity('cookie')
  @ApiOperation({
    summary: 'Atualizar configurações do site',
    description:
      'Atualiza parcialmente as configurações globais do site. ' +
      'Todos os campos são opcionais — envie apenas os que deseja alterar. ' +
      'Requer autenticação JWT via cookie `accessToken`.',
  })
  @ApiBody({
    type: UpdateSiteSettingsDto,
    examples: {
      atualizarTodos: {
        summary: 'Atualizar todos os campos',
        value: {
          whatsapp: '11987654321',
          email: 'contato@imobiliaria.com',
          instagram: 'francinegestora',
          hours: 'Seg–Sex: 9h às 18h | Sáb: 9h às 13h',
        },
      },
      atualizarWhatsapp: {
        summary: 'Atualizar apenas o WhatsApp',
        value: {
          whatsapp: '11999990000',
        },
      },
      limparInstagram: {
        summary: 'Limpar o Instagram',
        description: 'String vazia é o valor de "não configurado" — omitir o campo mantém o atual.',
        value: {
          instagram: '',
        },
      },
      atualizarHorario: {
        summary: 'Atualizar apenas o horário',
        value: {
          hours: 'Seg–Sex: 8h às 17h',
        },
      },
    },
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Configurações atualizadas com sucesso',
    type: SiteSettingsDto,
    content: {
      'application/json': {
        example: {
          id: 'singleton',
          whatsapp: '11999990000',
          email: 'contato@imobiliaria.com',
          instagram: 'francinegestora',
          hours: 'Seg–Sex: 9h às 18h | Sáb: 9h às 13h',
          updatedAt: '2026-06-18T03:00:00.000Z',
        },
      },
    },
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Handle de Instagram fora do formato aceito',
    content: {
      'application/json': {
        example: {
          statusCode: 400,
          code: 'VALIDATION_ERROR',
          message: [
            'Instagram deve conter apenas letras, números, ponto e underline (até 30 caracteres), sem "@"',
          ],
        },
      },
    },
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Não autenticado — cookie `accessToken` ausente ou expirado',
    content: {
      'application/json': {
        example: {
          statusCode: 401,
          message: 'Unauthorized',
        },
      },
    },
  })
  upsert(@Body() dto: UpdateSiteSettingsDto) {
    return this.siteSettingsService.upsert(dto);
  }
}
