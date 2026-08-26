import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { PropertyStatus } from '@prisma/client';
import {
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CurrentUserDto } from '../auth/dto/current-user.dto';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { OptionalJwtGuard } from '../auth/guards/optional-jwt.guard';
import { CacheKey, CacheTTL, InvalidateCache } from '../common/decorators/cache.decorator';
import { InvalidImageFileError, PropertyImageFileMissingError } from '../common/errors';
import {
  BulkDeletePropertyImagesDto,
  CreatePropertyDto,
  CreatePropertyRoomDto,
  FilterPropertyDto,
  PropertyListResponseDto,
  ReorderPropertyImagesDto,
  TrashPaginationDto,
  UpdatePropertyDto,
  UpdatePropertyRoomDto,
  UpdatePropertyStatusDto,
} from './dto';
import { PropertyImagesService } from './property-images.service';
import { PropertyRoomsService } from './property-rooms.service';
import { PropertyStatusCountsService } from './property-status-counts.service';
import { PropertiesService } from './properties.service';

/**
 * Teto de arquivos por requisição de upload — deliberadamente NÃO um teto de fotos
 * por imóvel, que não existe: `uploadImages` sempre anexa ao final e nada no código
 * conta quantas o imóvel já tem. Um imóvel com 50 ou 100 fotos é normal; o que muda
 * é que elas chegam em lotes.
 *
 * O frontend fatia nesse mesmo tamanho (`UPLOAD_BATCH_SIZE` em
 * `real-estate-app/src/features/properties/api/gallery-patch-service.ts`). Os dois
 * números precisam concordar — se este diminuir sem o outro acompanhar, o lote do
 * cliente passa a ser rejeitado com 400.
 */
export const UPLOAD_MAX_FILES_PER_REQUEST = 12;

/** ~15MB cobre foto de celular em resolução máxima com folga; acima disso é anômalo. */
export const UPLOAD_MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024;

/**
 * Recusa, pelo mimetype declarado, o que claramente não é imagem.
 *
 * **Não é controle de segurança** — o mimetype vem do cliente e pode mentir. Quem
 * garante que o conteúdo é imagem é o `sharp`, que decodifica e reencoda tudo para
 * JPEG em `PropertyImagesService.compressImage`; um arquivo com extensão mentirosa
 * morre lá. Isto aqui é ergonomia e economia: falha na hora, com o nome do arquivo,
 * antes de bufferizar 15MB de PDF à toa.
 */
export const imageFileFilter: MulterOptions['fileFilter'] = (_req, file, callback) => {
  if (!file.mimetype?.startsWith('image/')) {
    callback(new InvalidImageFileError(file.originalname), false);
    return;
  }

  callback(null, true);
};

@ApiTags('Properties')
@Controller('properties')
export class PropertiesController {
  constructor(
    private readonly propertiesService: PropertiesService,
    private readonly propertyImagesService: PropertyImagesService,
    private readonly propertyRoomsService: PropertyRoomsService,
    private readonly propertyStatusCountsService: PropertyStatusCountsService,
  ) {}

  @Get('status-counts')
  @UseGuards(OptionalJwtGuard)
  @CacheTTL(60_000)
  @CacheKey('property-status-counts')
  @ApiOperation({
    summary: 'Retorna contagem de imóveis por status',
    description:
      'Rota pública com autenticação opcional, no mesmo modelo de GET /properties. ' +
      'Chamadas anônimas recebem apenas a contagem de ACTIVE — é o número que a home ' +
      'do site exibe ("N imóveis disponíveis agora") e o único que faz sentido expor ' +
      'publicamente; o tamanho da fila de PENDING/INACTIVE é informação de operação. ' +
      'Chamadas autenticadas recebem os três status.',
  })
  @ApiResponse({
    status: 200,
    description: 'Contagem por status (três status para autenticados, só ACTIVE para anônimos)',
    content: {
      'application/json': {
        examples: {
          autenticado: { summary: 'Autenticado', value: { PENDING: 4, ACTIVE: 27, INACTIVE: 2 } },
          anonimo: { summary: 'Anônimo', value: { ACTIVE: 27 } },
        },
      },
    },
  })
  async getStatusCounts(@CurrentUser() user: CurrentUserDto | undefined) {
    const counts = await this.propertyStatusCountsService.getStatusCounts();

    if (user) return counts;

    return { [PropertyStatus.ACTIVE]: counts[PropertyStatus.ACTIVE] };
  }

  @Get('trash')
  @UseGuards(JwtGuard)
  @ApiSecurity('cookie')
  @ApiOperation({
    summary: 'Lista os imóveis na lixeira',
    description:
      'Imóveis excluídos (soft delete), do mais recentemente excluído para o mais antigo. ' +
      'Depois de 30 dias o job diário os remove em definitivo, junto com as fotos no R2 — ' +
      'o prazo restante é calculado pelo cliente a partir de `deletedAt`, e um imóvel ' +
      'vencido que o job ainda não recolheu continua listado (e restaurável) de propósito. ' +
      'Rota separada da listagem normal: aquela atende visitante anônimo, e um parâmetro ' +
      'que ampliasse o escopo por lá seria uma chance de vazar inventário.',
  })
  @ApiResponse({
    status: 200,
    type: PropertyListResponseDto,
    description: 'Página de imóveis excluídos, com deletedAt preenchido',
  })
  @ApiResponse({ status: 401, description: 'Não autenticado' })
  async findTrash(@Query() pagination: TrashPaginationDto) {
    return this.propertiesService.findDeleted(pagination.skip, pagination.take);
  }

  @Post()
  @HttpCode(201)
  @UseGuards(JwtGuard)
  @InvalidateCache('/properties')
  @ApiOperation({ summary: 'Criar nova propriedade' })
  @ApiBody({ type: CreatePropertyDto })
  @ApiResponse({ status: 201, description: 'Propriedade criada com sucesso' })
  @ApiResponse({ status: 401, description: 'Não autorizado' })
  @ApiResponse({ status: 400, description: 'Dados inválidos' })
  async create(@Body() createPropertyDto: CreatePropertyDto, @CurrentUser() user: CurrentUserDto) {
    return this.propertiesService.create(createPropertyDto, user.id);
  }

  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  @Get()
  @UseGuards(OptionalJwtGuard)
  @CacheTTL(300_000)
  @CacheKey('properties-list')
  @ApiOperation({
    summary: 'Listar propriedades com filtros',
    description:
      'Rota pública com autenticação opcional, no mesmo modelo de GET /properties/:id. ' +
      'Chamadas anônimas recebem apenas imóveis ACTIVE, independentemente do filtro ?status= ' +
      'enviado; chamadas autenticadas enxergam todos os status e podem filtrar por qualquer um.',
  })
  @ApiResponse({ status: 200, description: 'Lista de propriedades retornada' })
  @ApiResponse({ status: 400, description: 'Filtros inválidos' })
  async findAll(
    @Query() filters: FilterPropertyDto,
    @CurrentUser() user: CurrentUserDto | undefined,
  ) {
    return this.propertiesService.findAll(filters, !!user);
  }

  @Throttle({ default: { ttl: 60_000, limit: 120 } })
  @Get(':id')
  @UseGuards(OptionalJwtGuard)
  @ApiOperation({ summary: 'Obter detalhes de uma propriedade' })
  @ApiParam({ name: 'id', description: 'ID da propriedade' })
  @ApiResponse({ status: 200, description: 'Propriedade encontrada' })
  @ApiResponse({ status: 404, description: 'Propriedade não encontrada ou não publicada' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserDto | undefined,
  ) {
    return this.propertiesService.findOne(id, !!user);
  }

  // 120/hora por usuário: um operador editando fichas em sequência encostava nos 60.
  @Throttle({ default: { ttl: 3600_000, limit: 120 } })
  @Patch(':id')
  @UseGuards(JwtGuard)
  @InvalidateCache('/properties')
  @ApiOperation({ summary: 'Atualizar propriedade' })
  @ApiParam({ name: 'id', description: 'ID da propriedade' })
  @ApiBody({ type: UpdatePropertyDto })
  @ApiResponse({ status: 200, description: 'Propriedade atualizada' })
  @ApiResponse({ status: 404, description: 'Propriedade não encontrada' })
  @ApiResponse({ status: 401, description: 'Não autorizado' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updatePropertyDto: UpdatePropertyDto,
  ) {
    return this.propertiesService.update(id, updatePropertyDto);
  }

  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @Delete(':id')
  @HttpCode(204)
  @UseGuards(JwtGuard)
  @InvalidateCache('/properties')
  @ApiOperation({ summary: 'Deletar propriedade' })
  @ApiParam({ name: 'id', description: 'ID da propriedade' })
  @ApiResponse({ status: 204, description: 'Propriedade deletada' })
  @ApiResponse({ status: 404, description: 'Propriedade não encontrada' })
  @ApiResponse({ status: 401, description: 'Não autorizado' })
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.propertiesService.remove(id);
  }

  @Patch(':id/restore')
  @UseGuards(JwtGuard)
  @InvalidateCache('/properties')
  @ApiOperation({ summary: 'Restaurar propriedade deletada' })
  @ApiParam({ name: 'id', description: 'ID da propriedade' })
  @ApiResponse({ status: 200, description: 'Propriedade restaurada' })
  @ApiResponse({ status: 400, description: 'Propriedade não está deletada' })
  @ApiResponse({ status: 404, description: 'Propriedade não encontrada' })
  @ApiResponse({ status: 401, description: 'Não autorizado' })
  async restore(@Param('id', ParseUUIDPipe) id: string) {
    return this.propertiesService.restore(id);
  }

  @Patch(':id/status')
  @UseGuards(JwtGuard)
  @InvalidateCache('/properties')
  @ApiOperation({ summary: 'Atualizar status da propriedade' })
  @ApiParam({ name: 'id', description: 'ID da propriedade' })
  @ApiBody({ type: UpdatePropertyStatusDto })
  @ApiResponse({ status: 200, description: 'Status atualizado' })
  @ApiResponse({ status: 400, description: 'Transição de status inválida' })
  @ApiResponse({ status: 401, description: 'Não autorizado' })
  @ApiResponse({ status: 404, description: 'Propriedade não encontrada' })
  async updateStatus(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePropertyStatusDto) {
    return this.propertiesService.updateStatus(id, dto.status);
  }

  @Post(':propertyId/images')
  @HttpCode(201)
  @UseGuards(JwtGuard)
  @InvalidateCache('/properties')
  // Limite por REQUISIÇÃO, não por imóvel: não há teto de fotos por imóvel em
  // lugar nenhum, e o cliente envia 50 fotos em lotes de UPLOAD_BATCH_SIZE.
  //
  // O Multer bufferiza em memória todos os arquivos da requisição antes do handler
  // rodar, e eles ficam vivos até ela terminar — é esse buffer, não o Sharp, que
  // domina o pico de memória. Com 50 por requisição eram ~200MB só de origem, o
  // que não deixa margem para dois corretores subindo fotos ao mesmo tempo.
  //
  // fileSize é a proteção que não existia: sem ela um único arquivo de 200MB é
  // aceito e carregado inteiro na memória, derrubando o processo sozinho.
  @UseInterceptors(
    FilesInterceptor('images', UPLOAD_MAX_FILES_PER_REQUEST, {
      limits: { files: UPLOAD_MAX_FILES_PER_REQUEST, fileSize: UPLOAD_MAX_FILE_SIZE_BYTES },
      fileFilter: imageFileFilter,
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        images: {
          type: 'array',
          items: {
            type: 'string',
            format: 'binary',
          },
        },
        roomId: {
          type: 'string',
          format: 'uuid',
          description: 'ID do comodo para associar as imagens (opcional)',
        },
      },
      required: ['images'],
    },
  })
  @ApiOperation({ summary: 'Upload de imagens para propriedade' })
  @ApiParam({ name: 'propertyId', description: 'ID da propriedade' })
  @ApiResponse({ status: 201, description: 'Imagens enviadas com sucesso' })
  @ApiResponse({ status: 400, description: 'Nenhuma imagem foi enviada' })
  @ApiResponse({ status: 401, description: 'Não autorizado' })
  async uploadImages(
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
    @UploadedFiles() files: Express.Multer.File[],
    @Body('roomId') roomId: string | undefined,
  ) {
    if (!files?.length) {
      throw new PropertyImageFileMissingError();
    }

    return this.propertyImagesService.uploadImages(propertyId, files, roomId || undefined);
  }

  // Um teto horário num endpoint de lote anula o motivo de ele ser em lote: limpar
  // três galerias grandes numa tarde já batia nos 30/hora. 60/60s por usuário.
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  @Delete(':propertyId/images')
  @HttpCode(204)
  @UseGuards(JwtGuard)
  @InvalidateCache('/properties')
  @ApiOperation({ summary: 'Deletar múltiplas imagens de uma propriedade' })
  @ApiConsumes('application/json')
  @ApiParam({ name: 'propertyId', description: 'ID da propriedade' })
  @ApiBody({ type: BulkDeletePropertyImagesDto })
  @ApiResponse({ status: 204, description: 'Imagens deletadas' })
  @ApiResponse({ status: 400, description: 'Uma ou mais imagens não pertencem à propriedade' })
  @ApiResponse({ status: 401, description: 'Não autorizado' })
  async bulkDeleteImages(
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
    @Body() dto: BulkDeletePropertyImagesDto,
  ) {
    await this.propertyImagesService.bulkDeleteImages(propertyId, dto);
  }

  @Delete(':propertyId/images/:imageId')
  @HttpCode(204)
  @UseGuards(JwtGuard)
  @InvalidateCache('/properties')
  @ApiOperation({ summary: 'Deletar imagem de propriedade' })
  @ApiParam({ name: 'propertyId', description: 'ID da propriedade' })
  @ApiParam({ name: 'imageId', description: 'ID da imagem' })
  @ApiResponse({ status: 204, description: 'Imagem deletada' })
  @ApiResponse({ status: 404, description: 'Imagem não encontrada' })
  @ApiResponse({ status: 401, description: 'Não autorizado' })
  async deleteImage(
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
    @Param('imageId', ParseUUIDPipe) imageId: string,
  ) {
    await this.propertyImagesService.deleteImage(propertyId, imageId);
  }

  // === ROOM ENDPOINTS ===

  @Post(':propertyId/rooms')
  @HttpCode(201)
  @UseGuards(JwtGuard)
  @InvalidateCache('/properties')
  @ApiOperation({ summary: 'Criar comodo para propriedade' })
  @ApiParam({ name: 'propertyId', description: 'ID da propriedade' })
  @ApiBody({ type: CreatePropertyRoomDto })
  @ApiResponse({ status: 201, description: 'Comodo criado com sucesso' })
  @ApiResponse({ status: 404, description: 'Propriedade não encontrada' })
  @ApiResponse({ status: 401, description: 'Não autorizado' })
  async createRoom(
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
    @Body() dto: CreatePropertyRoomDto,
  ) {
    return this.propertyRoomsService.createRoom(propertyId, dto);
  }

  @Patch(':propertyId/rooms/:roomId')
  @UseGuards(JwtGuard)
  @InvalidateCache('/properties')
  @ApiOperation({ summary: 'Atualizar comodo' })
  @ApiParam({ name: 'propertyId', description: 'ID da propriedade' })
  @ApiParam({ name: 'roomId', description: 'ID do comodo' })
  @ApiBody({ type: UpdatePropertyRoomDto })
  @ApiResponse({ status: 200, description: 'Comodo atualizado' })
  @ApiResponse({ status: 404, description: 'Comodo não encontrado' })
  @ApiResponse({ status: 401, description: 'Não autorizado' })
  async updateRoom(
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
    @Param('roomId', ParseUUIDPipe) roomId: string,
    @Body() dto: UpdatePropertyRoomDto,
  ) {
    return this.propertyRoomsService.updateRoom(propertyId, roomId, dto);
  }

  @Delete(':propertyId/rooms/:roomId')
  @HttpCode(204)
  @UseGuards(JwtGuard)
  @InvalidateCache('/properties')
  @ApiOperation({ summary: 'Deletar comodo (imagens mantidas sem associacao)' })
  @ApiParam({ name: 'propertyId', description: 'ID da propriedade' })
  @ApiParam({ name: 'roomId', description: 'ID do comodo' })
  @ApiResponse({ status: 204, description: 'Comodo deletado' })
  @ApiResponse({ status: 404, description: 'Comodo não encontrado' })
  @ApiResponse({ status: 401, description: 'Não autorizado' })
  async deleteRoom(
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
    @Param('roomId', ParseUUIDPipe) roomId: string,
  ) {
    await this.propertyRoomsService.deleteRoom(propertyId, roomId);
  }

  // === IMAGE METADATA ENDPOINTS ===

  @Patch(':propertyId/images/reorder')
  @UseGuards(JwtGuard)
  @InvalidateCache('/properties')
  @ApiOperation({ summary: 'Reordenar imagens' })
  @ApiParam({ name: 'propertyId', description: 'ID da propriedade' })
  @ApiBody({ type: ReorderPropertyImagesDto })
  @ApiResponse({ status: 200, description: 'Imagens reordenadas' })
  @ApiResponse({ status: 401, description: 'Não autorizado' })
  async reorderImages(
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
    @Body() dto: ReorderPropertyImagesDto,
  ) {
    return this.propertyImagesService.reorderImages(propertyId, dto);
  }

  /*
   * Definir e remover a foto principal são duas rotas em vez de um `PATCH` com corpo
   * `{ isMain }`: sem corpo, nenhuma delas precisa de DTO, e o `imageId` no caminho já
   * diz sobre qual foto se fala nas duas direções.
   *
   * O segmento `/main` no fim é o que as mantém fora do alcance de
   * `DELETE :propertyId/images/:imageId` — uma rota `.../images/main` seria capturada
   * por aquela e morreria no `ParseUUIDPipe`, e só sobreviveria enquanto ninguém
   * reordenasse as declarações deste arquivo.
   */
  @Patch(':propertyId/images/:imageId/main')
  @UseGuards(JwtGuard)
  @ApiSecurity('cookie')
  @InvalidateCache('/properties')
  @ApiOperation({
    summary: 'Definir imagem como foto principal',
    description:
      'A foto principal abre o carrossel dos cards, da página de detalhes e é a capa do ' +
      'compartilhamento. Só existe uma por imóvel: definir uma rebaixa a anterior na mesma ' +
      'transação. Requer JWT.',
  })
  @ApiParam({ name: 'propertyId', description: 'ID da propriedade' })
  @ApiParam({ name: 'imageId', description: 'ID da imagem' })
  @ApiResponse({
    status: 200,
    description: 'Galeria do imóvel, ordenada por `order`, já com a nova principal marcada',
    content: {
      'application/json': {
        example: [
          {
            id: 'd3f5c93e-6db1-4c6c-9b53-26b8d8db8f09',
            propertyId: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
            roomId: null,
            url: 'https://cdn.exemplo.com/imovel/foto.jpg',
            label: null,
            order: 0,
            isMain: true,
            createdAt: '2026-08-25T12:00:00.000Z',
          },
        ],
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'A imagem existe, mas é de outro imóvel',
    content: {
      'application/json': {
        example: { statusCode: 400, code: 'IMAGE_NOT_BELONG_TO_PROPERTY', message: '...' },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Imagem não encontrada' })
  @ApiResponse({ status: 401, description: 'Não autorizado' })
  async setMainImage(
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
    @Param('imageId', ParseUUIDPipe) imageId: string,
  ) {
    return this.propertyImagesService.setMainImage(propertyId, imageId);
  }

  @Delete(':propertyId/images/:imageId/main')
  @UseGuards(JwtGuard)
  @ApiSecurity('cookie')
  @InvalidateCache('/properties')
  @ApiOperation({
    summary: 'Remover a marcação de foto principal',
    description:
      'Devolve o imóvel ao estado sem foto principal, em que cada tela volta a escolher a ' +
      'primeira foto pela regra de sempre. Idempotente: numa foto que não é a principal, não ' +
      'faz nada. Requer JWT.',
  })
  @ApiParam({ name: 'propertyId', description: 'ID da propriedade' })
  @ApiParam({ name: 'imageId', description: 'ID da imagem' })
  @ApiResponse({
    status: 200,
    description: 'Galeria do imóvel, ordenada por `order`, sem nenhuma foto principal',
    content: {
      'application/json': {
        example: [
          {
            id: 'd3f5c93e-6db1-4c6c-9b53-26b8d8db8f09',
            propertyId: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
            roomId: null,
            url: 'https://cdn.exemplo.com/imovel/foto.jpg',
            label: null,
            order: 0,
            isMain: false,
            createdAt: '2026-08-25T12:00:00.000Z',
          },
        ],
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'A imagem existe, mas é de outro imóvel',
    content: {
      'application/json': {
        example: { statusCode: 400, code: 'IMAGE_NOT_BELONG_TO_PROPERTY', message: '...' },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Imagem não encontrada' })
  @ApiResponse({ status: 401, description: 'Não autorizado' })
  async unsetMainImage(
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
    @Param('imageId', ParseUUIDPipe) imageId: string,
  ) {
    return this.propertyImagesService.unsetMainImage(propertyId, imageId);
  }
}
