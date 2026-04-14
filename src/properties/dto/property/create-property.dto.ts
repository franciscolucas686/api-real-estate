import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BusinessCode, PropertyStatus, PropertyType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  CreateApartmentDto,
  CreateCountryHouseDto,
  CreateHouseDto,
  CreateLandDto,
  CreateSmallFarmDto,
} from './subtypes';

export class CreatePropertyDto {
  @ApiProperty({ example: 'Casa Moderna no Brooklin', description: 'Título da propriedade' })
  @IsString({ message: 'Título deve ser uma string' })
  @MinLength(3, { message: 'Título deve ter no mínimo 3 caracteres' })
  title!: string;

  @ApiProperty({
    example: 'Casa com 3 quartos, 2 banheiros e garagem para 2 carros',
    description: 'Descrição detalhada da propriedade',
  })
  @IsString({ message: 'Descrição deve ser uma string' })
  @MinLength(10, { message: 'Descrição deve ter no mínimo 10 caracteres' })
  description!: string;

  @ApiProperty({ enum: PropertyType, example: PropertyType.HOUSE, description: 'Tipo do imóvel' })
  @IsEnum(PropertyType, { message: 'Tipo de propriedade inválido' })
  type!: PropertyType;

  @ApiProperty({
    enum: PropertyStatus,
    example: PropertyStatus.AVAILABLE,
    description: 'Status atual do imóvel',
  })
  @IsEnum(PropertyStatus, { message: 'Status de propriedade inválido' })
  status!: PropertyStatus;

  @ApiProperty({ example: 750000, description: 'Preço de venda do imóvel', minimum: 0 })
  @IsNumber({}, { message: 'Preço deve ser um número' })
  @Min(0, { message: 'Preço não pode ser negativo' })
  @Type(() => Number)
  price!: number;

  @ApiPropertyOptional({
    example: 3500,
    description: 'Preço de aluguel (quando aplicável)',
    minimum: 0,
  })
  @IsOptional()
  @IsNumber({}, { message: 'Preço de aluguel deve ser um número' })
  @Min(0, { message: 'Preço de aluguel não pode ser negativo' })
  @Type(() => Number)
  rentPrice?: number;

  @ApiPropertyOptional({ example: 700, description: 'Taxa de condomínio', minimum: 0 })
  @IsOptional()
  @IsNumber({}, { message: 'Taxa de condomínio deve ser um número' })
  @Min(0, { message: 'Taxa de condomínio não pode ser negativa' })
  @Type(() => Number)
  condoFee?: number;

  @ApiPropertyOptional({ example: 250, description: 'Área total em m²', minimum: 0 })
  @IsOptional()
  @IsNumber({}, { message: 'Área total deve ser um número' })
  @Min(0, { message: 'Área total não pode ser negativa' })
  @Type(() => Number)
  totalArea?: number;

  @ApiPropertyOptional({ example: 180, description: 'Área construída em m²', minimum: 0 })
  @IsOptional()
  @IsNumber({}, { message: 'Área construída deve ser um número' })
  @Min(0, { message: 'Área construída não pode ser negativa' })
  @Type(() => Number)
  builtArea?: number;

  @ApiPropertyOptional({ example: 3, description: 'Quantidade de quartos', minimum: 0 })
  @IsOptional()
  @IsNumber({}, { message: 'Quartos deve ser um número' })
  @Min(0, { message: 'Quartos não pode ser negativo' })
  @Type(() => Number)
  bedrooms?: number;

  @ApiPropertyOptional({ example: 2, description: 'Quantidade de banheiros', minimum: 0 })
  @IsOptional()
  @IsNumber({}, { message: 'Banheiros deve ser um número' })
  @Min(0, { message: 'Banheiros não pode ser negativo' })
  @Type(() => Number)
  bathrooms?: number;

  @ApiPropertyOptional({ example: 2, description: 'Quantidade de vagas de garagem', minimum: 0 })
  @IsOptional()
  @IsNumber({}, { message: 'Vagas de garagem deve ser um número' })
  @Min(0, { message: 'Vagas de garagem não pode ser negativo' })
  @Type(() => Number)
  parkingSpaces?: number;

  @ApiProperty({ example: 'SP', description: 'UF da propriedade', minLength: 2 })
  @IsString({ message: 'Estado deve ser uma string' })
  @MinLength(2, { message: 'Estado deve ter no mínimo 2 caracteres' })
  state!: string;

  @ApiProperty({ example: 'São Paulo', description: 'Cidade da propriedade', minLength: 2 })
  @IsString({ message: 'Cidade deve ser uma string' })
  @MinLength(2, { message: 'Cidade deve ter no mínimo 2 caracteres' })
  city!: string;

  @ApiProperty({ example: 'Brooklin', description: 'Bairro da propriedade', minLength: 2 })
  @IsString({ message: 'Bairro deve ser uma string' })
  @MinLength(2, { message: 'Bairro deve ter no mínimo 2 caracteres' })
  neighborhood!: string;

  @ApiProperty({ example: 'PROP001', description: 'Código único da propriedade', minLength: 1 })
  @IsString({ message: 'Código deve ser uma string' })
  @MinLength(1, { message: 'Código deve ter no mínimo 1 carácter' })
  code!: string;

  @ApiProperty({
    enum: BusinessCode,
    example: BusinessCode.SALE_DIRECT,
    description: 'Tipo de negócio da propriedade',
  })
  @IsEnum(BusinessCode, { message: 'Tipo de negócio inválido' })
  businessType!: BusinessCode;

  @ApiPropertyOptional({ type: CreateHouseDto, description: 'Dados específicos de casa' })
  @IsOptional()
  @ValidateNested()
  @Type(() => CreateHouseDto)
  house?: CreateHouseDto;

  @ApiPropertyOptional({
    type: CreateApartmentDto,
    description: 'Dados específicos de apartamento',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => CreateApartmentDto)
  apartment?: CreateApartmentDto;

  @ApiPropertyOptional({ type: CreateLandDto, description: 'Dados específicos de terreno' })
  @IsOptional()
  @ValidateNested()
  @Type(() => CreateLandDto)
  land?: CreateLandDto;

  @ApiPropertyOptional({ type: CreateSmallFarmDto, description: 'Dados específicos de chácara' })
  @IsOptional()
  @ValidateNested()
  @Type(() => CreateSmallFarmDto)
  smallFarm?: CreateSmallFarmDto;

  @ApiPropertyOptional({
    type: CreateCountryHouseDto,
    description: 'Dados específicos de sítio/casa de campo',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => CreateCountryHouseDto)
  countryHouse?: CreateCountryHouseDto;
}
