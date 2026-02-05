import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CurrentUserDto } from '../auth/dto/current-user.dto';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { CreatePropertyDto } from './dto/create-property.dto';
import { FilterPropertyDto } from './dto/filter-property.dto';
import { UpdatePropertyDto } from './dto/update-property.dto';
import { PropertiesService } from './properties.service';
import { Throttle } from '@nestjs/throttler';

@Controller('properties')
export class PropertiesController {
  constructor(private readonly propertiesService: PropertiesService) {}

  //@Throttle({ default: { ttl: 3600, limit: 20 } }) - Limite de 20 cadastros a cada hora
  // será aplicado após o cadastro massivo de properties no app
  @Post()
  @HttpCode(201)
  @UseGuards(JwtGuard)
  async create(@Body() createPropertyDto: CreatePropertyDto, @CurrentUser() user: CurrentUserDto) {
    return this.propertiesService.create(createPropertyDto, user.id);
  }

  @Throttle({ default: { ttl: 60, limit: 60 } })
  @Get()
  async findAll(@Query() filters: FilterPropertyDto) {
    return this.propertiesService.findAll(filters);
  }

  @Throttle({ default: { ttl: 60, limit: 120 } })
  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.propertiesService.findOne(id);
  }

  @Throttle({ default: { ttl: 3600, limit: 60 } })
  @Patch(':id')
  @UseGuards(JwtGuard)
  async update(@Param('id') id: string, @Body() updatePropertyDto: UpdatePropertyDto) {
    return this.propertiesService.update(id, updatePropertyDto);
  }

  @Throttle({ default: { ttl: 60, limit: 30 } })
  @Delete(':id')
  @HttpCode(204)
  @UseGuards(JwtGuard)
  async remove(@Param('id') id: string, @CurrentUser() user: CurrentUserDto) {
    await this.propertiesService.remove(id, user.id);
  }

  // @Throttle({ default: { ttl: 1800, limit: 20 } }) - Limite de 20 uploads a cada 30 minutos
  // será aplicado após o cadastro massivo de properties no app
  @Post(':id/images')
  @HttpCode(201)
  @UseGuards(JwtGuard)
  @UseInterceptors(
    FilesInterceptor('images', 20, {
      limits: { files: 20 },
    }),
  )
  async uploadImages(
    @Param('id') propertyId: string,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    if (!files?.length) {
      throw new BadRequestException('Nenhuma imagem foi enviada');
    }

    return this.propertiesService.uploadImages(propertyId, files);
  }

  @Patch(':propertyId/images/:imageId/set-main')
  @UseGuards(JwtGuard)
  async setMainImage(@Param('propertyId') propertyId: string, @Param('imageId') imageId: string) {
    return this.propertiesService.setMainImage(propertyId, imageId);
  }

  @Throttle({ default: { ttl: 3600, limit: 30 } })
  @Delete(':imageId')
  @HttpCode(204)
  @UseGuards(JwtGuard)
  async deleteImage(@Param('imageId') imageId: string, @CurrentUser() user: CurrentUserDto) {
    await this.propertiesService.deleteImage(imageId, user.id);
  }
}
