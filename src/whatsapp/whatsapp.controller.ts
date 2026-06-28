import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { CreateWhatsappNumberDto, UpdateWhatsappNumberDto } from './dto';
import { WhatsappService } from './whatsapp.service';

const WHATSAPP_NUMBER_EXAMPLE = {
  id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  number: '11987654321',
  label: 'Atendimento Sul',
  isActive: true,
  order: 0,
  createdAt: '2026-06-01T10:00:00.000Z',
  updatedAt: '2026-06-01T10:00:00.000Z',
};

@ApiTags('whatsapp')
@Controller('whatsapp-numbers')
@UseGuards(JwtGuard)
@ApiSecurity('cookie')
export class WhatsappController {
  constructor(private readonly whatsappService: WhatsappService) {}

  @Post()
  @ApiOperation({
    summary: 'Criar novo número WhatsApp',
    description:
      'Adiciona um número WhatsApp ao pool distribuído para imóveis. ' +
      'Cada imóvel recebe deterministicamente um número do pool via hash do seu ID.',
  })
  @ApiBody({
    type: CreateWhatsappNumberDto,
    examples: {
      completo: {
        summary: 'Com label e ordem',
        value: { number: '11987654321', label: 'Atendimento Sul', isActive: true, order: 0 },
      },
      minimo: {
        summary: 'Apenas o número (mínimo obrigatório)',
        value: { number: '11987654321' },
      },
    },
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Número criado com sucesso',
    content: {
      'application/json': {
        example: WHATSAPP_NUMBER_EXAMPLE,
      },
    },
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Número inválido (não numérico ou fora de 8–15 dígitos) ou já cadastrado',
    content: {
      'application/json': {
        example: {
          statusCode: 400,
          message: ['Número deve conter apenas dígitos e ter entre 8 e 15 caracteres'],
          error: 'Bad Request',
        },
      },
    },
  })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Não autenticado' })
  create(@Body() createWhatsappNumberDto: CreateWhatsappNumberDto) {
    return this.whatsappService.create(createWhatsappNumberDto);
  }

  @Get()
  @ApiOperation({
    summary: 'Listar todos os números WhatsApp',
    description:
      'Retorna todos os números cadastrados, ordenados por `order` e depois por `createdAt`.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Lista retornada com sucesso',
    content: {
      'application/json': {
        example: [
          WHATSAPP_NUMBER_EXAMPLE,
          {
            ...WHATSAPP_NUMBER_EXAMPLE,
            id: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
            number: '11912345678',
            label: 'Atendimento Norte',
            order: 1,
          },
        ],
      },
    },
  })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Não autenticado' })
  findAll() {
    return this.whatsappService.findAll();
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Atualizar número WhatsApp',
    description:
      'Atualiza parcialmente um número WhatsApp. Todos os campos são opcionais — envie apenas os que deseja alterar.',
  })
  @ApiParam({
    name: 'id',
    description: 'UUID do número WhatsApp',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @ApiBody({
    type: UpdateWhatsappNumberDto,
    examples: {
      desativar: {
        summary: 'Desativar número (remove do pool de imóveis sem excluir)',
        value: { isActive: false },
      },
      reordenar: {
        summary: 'Alterar ordem de exibição',
        value: { order: 2 },
      },
      atualizarLabel: {
        summary: 'Renomear label',
        value: { label: 'Atendimento Centro' },
      },
    },
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Número atualizado com sucesso',
    content: {
      'application/json': {
        example: {
          ...WHATSAPP_NUMBER_EXAMPLE,
          isActive: false,
          updatedAt: '2026-06-18T05:00:00.000Z',
        },
      },
    },
  })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Não autenticado' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Número não encontrado' })
  update(@Param('id') id: string, @Body() updateWhatsappNumberDto: UpdateWhatsappNumberDto) {
    return this.whatsappService.update(id, updateWhatsappNumberDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Deletar número WhatsApp',
    description:
      'Remove permanentemente um número do sistema. ' +
      'Imóveis que usavam esse número receberão automaticamente outro número ativo do pool na próxima requisição.',
  })
  @ApiParam({
    name: 'id',
    description: 'UUID do número WhatsApp',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @ApiResponse({
    status: HttpStatus.NO_CONTENT,
    description: 'Número removido com sucesso (sem corpo de resposta)',
  })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Não autenticado' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Número não encontrado' })
  async remove(@Param('id') id: string) {
    await this.whatsappService.remove(id);
  }
}
