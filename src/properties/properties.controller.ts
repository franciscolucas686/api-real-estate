import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
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
import { JwtGuard } from '../auth/guards/jwt.guard';
import { CreatePropertyDto } from './dto/create-property.dto';
import { FilterPropertyDto } from './dto/filter-property.dto';
import { UpdatePropertyDto } from './dto/update-property.dto';
import { PropertiesService } from './properties.service';

@Controller('properties')
export class PropertiesController {
  constructor(private readonly propertiesService: PropertiesService) {}

  @Post()
  @UseGuards(JwtGuard)
  async create(@Body() createPropertyDto: CreatePropertyDto, @CurrentUser() user: any) {
    return this.propertiesService.create(createPropertyDto, user.id);
  }

  @Get()
  async findAll(
    @Query('skip') skip?: string,
    @Query('take') take?: string,
    @Query('type') type?: string,
    @Query('status') status?: string,
    @Query('businessType') businessType?: string,
    @Query('city') city?: string,
    @Query('neighborhood') neighborhood?: string,
    @Query('state') state?: string,
    @Query('minPrice') minPrice?: string,
    @Query('maxPrice') maxPrice?: string,
    @Query('minBedrooms') minBedrooms?: string,
    @Query('maxBedrooms') maxBedrooms?: string,
    @Query('minBathrooms') minBathrooms?: string,
    @Query('maxBathrooms') maxBathrooms?: string,
    @Query('minTotalArea') minTotalArea?: string,
    @Query('maxTotalArea') maxTotalArea?: string,
    @Query('minBuiltArea') minBuiltArea?: string,
    @Query('maxBuiltArea') maxBuiltArea?: string,
    @Query('minParkingSpaces') minParkingSpaces?: string,
    @Query('maxParkingSpaces') maxParkingSpaces?: string,
    @Query('search') search?: string,
  ) {
    const hasFilters = [
      type,
      status,
      businessType,
      city,
      neighborhood,
      state,
      minPrice,
      maxPrice,
      minBedrooms,
      maxBedrooms,
      minBathrooms,
      maxBathrooms,
      minTotalArea,
      maxTotalArea,
      minBuiltArea,
      maxBuiltArea,
      minParkingSpaces,
      maxParkingSpaces,
      search,
    ].some((filter) => filter !== undefined);

    const filterDto: FilterPropertyDto = {
      skip: skip ? parseInt(skip) : 0,
      take: take ? parseInt(take) : 10,
    };

    if (hasFilters) {
      if (type) filterDto.type = type as any;
      if (status) filterDto.status = status as any;
      if (businessType) filterDto.businessType = businessType as any;
      if (city) filterDto.city = city;
      if (neighborhood) filterDto.neighborhood = neighborhood;
      if (state) filterDto.state = state;
      if (minPrice) filterDto.minPrice = parseFloat(minPrice);
      if (maxPrice) filterDto.maxPrice = parseFloat(maxPrice);
      if (minBedrooms) filterDto.minBedrooms = parseInt(minBedrooms);
      if (maxBedrooms) filterDto.maxBedrooms = parseInt(maxBedrooms);
      if (minBathrooms) filterDto.minBathrooms = parseInt(minBathrooms);
      if (maxBathrooms) filterDto.maxBathrooms = parseInt(maxBathrooms);
      if (minTotalArea) filterDto.minTotalArea = parseFloat(minTotalArea);
      if (maxTotalArea) filterDto.maxTotalArea = parseFloat(maxTotalArea);
      if (minBuiltArea) filterDto.minBuiltArea = parseFloat(minBuiltArea);
      if (maxBuiltArea) filterDto.maxBuiltArea = parseFloat(maxBuiltArea);
      if (minParkingSpaces) filterDto.minParkingSpaces = parseInt(minParkingSpaces);
      if (maxParkingSpaces) filterDto.maxParkingSpaces = parseInt(maxParkingSpaces);
      if (search) filterDto.search = search;

      return this.propertiesService.findWithFilters(filterDto);
    }

    return this.propertiesService.findAll(filterDto.skip, filterDto.take);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.propertiesService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(JwtGuard)
  async update(
    @Param('id') id: string,
    @Body() updatePropertyDto: UpdatePropertyDto,
    @CurrentUser() user: any,
  ) {
    return this.propertiesService.update(id, updatePropertyDto, user.id);
  }

  @Delete(':id')
  @UseGuards(JwtGuard)
  async remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.propertiesService.remove(id, user.id);
  }

  @Post(':id/images')
  @UseGuards(JwtGuard)
  @UseInterceptors(FilesInterceptor('images', 20))
  async uploadImages(
    @Param('id') propertyId: string,
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser() user: any,
  ) {
    if (!files || files.length === 0) {
      throw new BadRequestException('Nenhuma imagem foi enviada');
    }

    if (files.length > 20) {
      throw new BadRequestException('Máximo de 20 imagens permitidas');
    }

    const property = await this.propertiesService.findOne(propertyId);
    if (!property) {
      throw new BadRequestException('Propriedade não encontrada');
    }

    return this.propertiesService.uploadImages(propertyId, files);
  }

  @Delete(':propertyId/images/:imageId')
  @UseGuards(JwtGuard)
  async deleteImage(
    @Param('propertyId') propertyId: string,
    @Param('imageId') imageId: string,
    @CurrentUser() user: any,
  ) {
    return this.propertiesService.deleteImage(imageId, user.id);
  }
}
