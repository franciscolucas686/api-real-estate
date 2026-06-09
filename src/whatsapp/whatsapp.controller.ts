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
import { ApiBody, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AdminSecretGuard } from '../auth/guards/admin-secret.guard';
import { CreateWhatsappNumberDto, UpdateWhatsappNumberDto } from './dto';
import { WhatsappService } from './whatsapp.service';

@ApiTags('whatsapp')
@Controller('whatsapp-numbers')
@UseGuards(AdminSecretGuard)
export class WhatsappController {
  constructor(private readonly whatsappService: WhatsappService) {}

  @Post()
  @ApiOperation({
    summary: 'Criar novo número WhatsApp',
    description: 'Cria um novo número WhatsApp gerenciado para ser exibido em propriedades',
  })
  @ApiBody({ type: CreateWhatsappNumberDto })
  @ApiResponse({
    status: 201,
    description: 'Número WhatsApp criado com sucesso',
  })
  @ApiResponse({
    status: 400,
    description: 'Número inválido ou já existe',
  })
  @ApiResponse({
    status: 403,
    description: 'Acesso negado - requer admin secret',
  })
  create(@Body() createWhatsappNumberDto: CreateWhatsappNumberDto) {
    return this.whatsappService.create(createWhatsappNumberDto);
  }

  @Get()
  @ApiOperation({
    summary: 'Listar todos os números WhatsApp',
    description:
      'Retorna lista de todos os números WhatsApp cadastrados, ordenados por ordem de exibição',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de números WhatsApp retornada com sucesso',
  })
  @ApiResponse({
    status: 403,
    description: 'Acesso negado - requer admin secret',
  })
  findAll() {
    return this.whatsappService.findAll();
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Obter número WhatsApp por ID',
    description: 'Retorna os detalhes de um número WhatsApp específico',
  })
  @ApiParam({ name: 'id', description: 'ID do número WhatsApp' })
  @ApiResponse({
    status: 200,
    description: 'Número WhatsApp encontrado',
  })
  @ApiResponse({
    status: 403,
    description: 'Acesso negado - requer admin secret',
  })
  @ApiResponse({
    status: 404,
    description: 'Número WhatsApp não encontrado',
  })
  findOne(@Param('id') id: string) {
    return this.whatsappService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Atualizar número WhatsApp',
    description: 'Atualiza informações de um número WhatsApp (número, label, status ativo, ordem)',
  })
  @ApiParam({ name: 'id', description: 'ID do número WhatsApp' })
  @ApiBody({ type: UpdateWhatsappNumberDto })
  @ApiResponse({
    status: 200,
    description: 'Número WhatsApp atualizado com sucesso',
  })
  @ApiResponse({
    status: 400,
    description: 'Dados inválidos',
  })
  @ApiResponse({
    status: 403,
    description: 'Acesso negado - requer admin secret',
  })
  @ApiResponse({
    status: 404,
    description: 'Número WhatsApp não encontrado',
  })
  update(@Param('id') id: string, @Body() updateWhatsappNumberDto: UpdateWhatsappNumberDto) {
    return this.whatsappService.update(id, updateWhatsappNumberDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Deletar número WhatsApp',
    description: 'Remove um número WhatsApp do sistema',
  })
  @ApiParam({ name: 'id', description: 'ID do número WhatsApp' })
  @ApiResponse({
    status: 204,
    description: 'Número WhatsApp deletado com sucesso',
  })
  @ApiResponse({
    status: 403,
    description: 'Acesso negado - requer admin secret',
  })
  @ApiResponse({
    status: 404,
    description: 'Número WhatsApp não encontrado',
  })
  async remove(@Param('id') id: string) {
    await this.whatsappService.remove(id);
  }
}
