import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BusinessType, PropertyType, SaleType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
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

  @ApiProperty({ example: '750000.00', description: 'Preço de venda do imóvel' })
  @IsString({ message: 'Preço deve ser uma string' })
  @Matches(/^\d+(\.\d{1,2})?$/, {
    message: 'Preço deve ser um número decimal válido (ex: 750000.00)',
  })
  price!: string;

  @ApiPropertyOptional({
    example: '3500.00',
    description: 'Preço de aluguel (quando aplicável)',
  })
  @IsOptional()
  @IsString({ message: 'Preço de aluguel deve ser uma string' })
  @Matches(/^\d+(\.\d{1,2})?$/, {
    message: 'Preço de aluguel deve ser um número decimal válido (ex: 3500.00)',
  })
  rentPrice?: string;

  @ApiPropertyOptional({ example: '700.00', description: 'Taxa de condomínio' })
  @IsOptional()
  @IsString({ message: 'Taxa de condomínio deve ser uma string' })
  @Matches(/^\d+(\.\d{1,2})?$/, {
    message: 'Taxa de condomínio deve ser um número decimal válido (ex: 700.00)',
  })
  condoFee?: string;

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

  @ApiPropertyOptional({
    example: 1,
    description: 'Quantidade de suítes (não pode ser maior que o número de banheiros)',
    minimum: 0,
  })
  @IsOptional()
  @IsNumber({}, { message: 'Suítes deve ser um número' })
  @Min(0, { message: 'Suítes não pode ser negativo' })
  @Type(() => Number)
  suites?: number;

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

  @ApiProperty({
    enum: BusinessType,
    example: BusinessType.SALE,
    description: 'Tipo de negócio (RENT ou SALE)',
  })
  @IsEnum(BusinessType, { message: 'Tipo de negócio inválido. Use RENT ou SALE' })
  businessType!: BusinessType;

  @ApiPropertyOptional({
    enum: SaleType,
    isArray: true,
    example: [SaleType.DIRECT, SaleType.FINANCING],
    description: 'Tipos de venda (obrigatório se SALE, vazio se RENT)',
  })
  @IsOptional()
  @IsArray({ message: 'saleTypes deve ser um array' })
  @IsEnum(SaleType, {
    each: true,
    message: 'Tipo de venda inválido. Use DIRECT, FINANCING ou EXCHANGE',
  })
  saleTypes?: SaleType[];

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
