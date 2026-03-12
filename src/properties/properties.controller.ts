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
import { CreatePropertyDto } from './dto/create-property.dto';
import { FilterPropertyDto } from './dto/filter-property.dto';
import { UpdatePropertyDto } from './dto/update-property.dto';
import { PropertyImagesService } from './property-images.service';
import { PropertiesService } from './properties.service';

@ApiTags('Properties')
@Controller('properties')
export class PropertiesController {
  constructor(
    private readonly propertiesService: PropertiesService,
    private readonly propertyImagesService: PropertyImagesService,
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
    @CurrentUser() user: CurrentUserDto,
  ) {
    if (!files?.length) {
      throw new BadRequestException('Nenhuma imagem foi enviada');
    }

    return this.propertyImagesService.uploadImages(propertyId, files);
  }

  @Patch(':propertyId/images/:imageId/set-main')
  @UseGuards(JwtGuard)
  @InvalidateCache('/properties')
  @ApiOperation({ summary: 'Definir imagem como principal' })
  @ApiParam({ name: 'propertyId', description: 'ID da propriedade' })
  @ApiParam({ name: 'imageId', description: 'ID da imagem' })
  @ApiResponse({ status: 200, description: 'Imagem definida como principal' })
  @ApiResponse({ status: 404, description: 'Imagem não encontrada' })
  @ApiResponse({ status: 401, description: 'Não autorizado' })
  async setMainImage(
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
    @Param('imageId', ParseUUIDPipe) imageId: string,
    @CurrentUser() user: CurrentUserDto,
  ) {
    return this.propertyImagesService.setMainImage(propertyId, imageId);
  }

  @Throttle({ default: { ttl: 3600, limit: 30 } })
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
}
