import {
  BadRequestException,
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
import {
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CurrentUserDto } from '../auth/dto/current-user.dto';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { CacheKey, CacheTTL, InvalidateCache } from '../common/decorators/cache.decorator';
import {
  BulkDeletePropertyImagesDto,
  CreatePropertyDto,
  CreatePropertyRoomDto,
  FilterPropertyDto,
  ReorderPropertyImagesDto,
  ReorderPropertyRoomsDto,
  UpdatePropertyDto,
  UpdatePropertyImageDto,
  UpdatePropertyRoomDto,
} from './dto';
import { PropertyImagesService } from './property-images.service';
import { PropertyRoomsService } from './property-rooms.service';
import { PropertiesService } from './properties.service';

@ApiTags('Properties')
@Controller('properties')
export class PropertiesController {
  constructor(
    private readonly propertiesService: PropertiesService,
    private readonly propertyImagesService: PropertyImagesService,
    private readonly propertyRoomsService: PropertyRoomsService,
  ) {}

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

  @Throttle({ default: { ttl: 60, limit: 60 } })
  @Get()
  @CacheTTL(300_000)
  @CacheKey('properties-list')
  @ApiOperation({ summary: 'Listar propriedades com filtros' })
  @ApiResponse({ status: 200, description: 'Lista de propriedades retornada' })
  @ApiResponse({ status: 400, description: 'Filtros inválidos' })
  async findAll(@Query() filters: FilterPropertyDto) {
    return this.propertiesService.findAll(filters);
  }

  @Throttle({ default: { ttl: 60, limit: 120 } })
  @Get(':id')
  @CacheTTL(600_000)
  @CacheKey('properties-detail')
  @ApiOperation({ summary: 'Obter detalhes de uma propriedade' })
  @ApiParam({ name: 'id', description: 'ID da propriedade' })
  @ApiResponse({ status: 200, description: 'Propriedade encontrada' })
  @ApiResponse({ status: 404, description: 'Propriedade não encontrada' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.propertiesService.findOne(id);
  }

  @Throttle({ default: { ttl: 3600, limit: 60 } })
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
    @CurrentUser() user: CurrentUserDto,
  ) {
    return this.propertiesService.update(id, updatePropertyDto);
  }

  @Throttle({ default: { ttl: 60, limit: 30 } })
  @Delete(':id')
  @HttpCode(204)
  @UseGuards(JwtGuard)
  @InvalidateCache('/properties')
  @ApiOperation({ summary: 'Deletar propriedade' })
  @ApiParam({ name: 'id', description: 'ID da propriedade' })
  @ApiResponse({ status: 204, description: 'Propriedade deletada' })
  @ApiResponse({ status: 404, description: 'Propriedade não encontrada' })
  @ApiResponse({ status: 401, description: 'Não autorizado' })
  async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: CurrentUserDto) {
    await this.propertiesService.remove(id, user.id);
  }

  @Post(':propertyId/images')
  @HttpCode(201)
  @UseGuards(JwtGuard)
  @InvalidateCache('/properties')
  @UseInterceptors(
    FilesInterceptor('images', 20, {
      limits: { files: 20 },
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
    @CurrentUser() user: CurrentUserDto,
  ) {
    if (!files?.length) {
      throw new BadRequestException('Nenhuma imagem foi enviada');
    }

    const result = await this.propertyImagesService.uploadImages(propertyId, files);

    if (roomId) {
      const imageIds = result.images.map((img) => img.id);
      await this.propertyRoomsService.assignImagesToRoom(propertyId, { imageIds, roomId });
    }

    return result;
  }

  @Throttle({ default: { ttl: 3600, limit: 30 } })
  @Delete(':propertyId/images')
  @HttpCode(204)
  @UseGuards(JwtGuard)
  @InvalidateCache('/properties')
  @ApiOperation({ summary: 'Deletar múltiplas imagens de uma propriedade' })
  @ApiParam({ name: 'propertyId', description: 'ID da propriedade' })
  @ApiBody({ type: BulkDeletePropertyImagesDto })
  @ApiResponse({ status: 204, description: 'Imagens deletadas' })
  @ApiResponse({ status: 400, description: 'Uma ou mais imagens não pertencem à propriedade' })
  @ApiResponse({ status: 401, description: 'Não autorizado' })
  async bulkDeleteImages(
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
    @Body() dto: BulkDeletePropertyImagesDto,
    @CurrentUser() user: CurrentUserDto,
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
    @CurrentUser() user: CurrentUserDto,
  ) {
    await this.propertyImagesService.deleteImage(imageId, user.id);
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
    @CurrentUser() user: CurrentUserDto,
  ) {
    return this.propertyRoomsService.createRoom(propertyId, dto);
  }

  @Get(':propertyId/rooms')
  @ApiOperation({ summary: 'Listar comodos da propriedade com imagens' })
  @ApiParam({ name: 'propertyId', description: 'ID da propriedade' })
  @ApiResponse({ status: 200, description: 'Lista de comodos' })
  async findRooms(@Param('propertyId', ParseUUIDPipe) propertyId: string) {
    return this.propertyRoomsService.findRoomsByProperty(propertyId);
  }

  @Patch(':propertyId/rooms/reorder')
  @UseGuards(JwtGuard)
  @InvalidateCache('/properties')
  @ApiOperation({ summary: 'Reordenar comodos' })
  @ApiParam({ name: 'propertyId', description: 'ID da propriedade' })
  @ApiBody({ type: ReorderPropertyRoomsDto })
  @ApiResponse({ status: 200, description: 'Comodos reordenados' })
  @ApiResponse({ status: 401, description: 'Não autorizado' })
  async reorderRooms(
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
    @Body() dto: ReorderPropertyRoomsDto,
    @CurrentUser() user: CurrentUserDto,
  ) {
    return this.propertyRoomsService.reorderRooms(propertyId, dto);
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
    @CurrentUser() user: CurrentUserDto,
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
    @CurrentUser() user: CurrentUserDto,
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
    @CurrentUser() user: CurrentUserDto,
  ) {
    return this.propertyImagesService.reorderImages(propertyId, dto);
  }

  @Patch(':propertyId/images/:imageId')
  @UseGuards(JwtGuard)
  @InvalidateCache('/properties')
  @ApiOperation({ summary: 'Atualizar metadados da imagem' })
  @ApiParam({ name: 'propertyId', description: 'ID da propriedade' })
  @ApiParam({ name: 'imageId', description: 'ID da imagem' })
  @ApiBody({ type: UpdatePropertyImageDto })
  @ApiResponse({ status: 200, description: 'Imagem atualizada' })
  @ApiResponse({ status: 404, description: 'Imagem não encontrada' })
  @ApiResponse({ status: 401, description: 'Não autorizado' })
  async updateImage(
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
    @Param('imageId', ParseUUIDPipe) imageId: string,
    @Body() dto: UpdatePropertyImageDto,
    @CurrentUser() user: CurrentUserDto,
  ) {
    const { roomId, ...imageData } = dto;

    if (roomId !== undefined) {
      await this.propertyRoomsService.assignImagesToRoom(propertyId, {
        imageIds: [imageId],
        roomId,
      });
    }

    return this.propertyImagesService.updateImage(propertyId, imageId, imageData);
  }
}
