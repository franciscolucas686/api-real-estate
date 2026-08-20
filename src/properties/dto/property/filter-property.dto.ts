import { ApiPropertyOptional } from '@nestjs/swagger';
import { BusinessType, PropertyStatus, PropertyType, SaleType } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class FilterPropertyDto {
  @ApiPropertyOptional({
    enum: PropertyType,
    isArray: true,
    example: [PropertyType.HOUSE, PropertyType.APARTMENT],
    description: 'Filtrar por tipos de propriedade',
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? [value] : value))
  @IsArray()
  @IsEnum(PropertyType, { each: true })
  types?: PropertyType[];

  @ApiPropertyOptional({ enum: BusinessType, example: BusinessType.SALE })
  @IsOptional()
  @IsEnum(BusinessType)
  businessType?: BusinessType;

  @ApiPropertyOptional({
    enum: SaleType,
    isArray: true,
    example: [SaleType.DIRECT],
    description: 'Filtrar por tipos de venda',
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? [value] : value))
  @IsArray()
  @IsEnum(SaleType, { each: true })
  saleTypes?: SaleType[];

  @ApiPropertyOptional({ example: '123456' })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiPropertyOptional({ example: 'São Paulo' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ example: 'Brooklin' })
  @IsOptional()
  @IsString()
  neighborhood?: string;

  @ApiPropertyOptional({ example: 'SP' })
  @IsOptional()
  @IsString()
  state?: string;

  @ApiPropertyOptional({ example: '100000.00', minimum: 0 })
  @IsOptional()
  @Type(() => String)
  @Matches(/^\d+(\.\d{1,2})?$/, {
    message: 'Preço mínimo deve ser um número decimal válido (ex: 100000.00)',
  })
  minPrice?: string;

  @ApiPropertyOptional({ example: '1200000.00', minimum: 0 })
  @IsOptional()
  @Type(() => String)
  @Matches(/^\d+(\.\d{1,2})?$/, {
    message: 'Preço máximo deve ser um número decimal válido (ex: 1200000.00)',
  })
  maxPrice?: string;

  @ApiPropertyOptional({ example: 1, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minBedrooms?: number;

  @ApiPropertyOptional({ example: 5, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxBedrooms?: number;

  @ApiPropertyOptional({ example: 1, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minBathrooms?: number;

  @ApiPropertyOptional({ example: 4, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxBathrooms?: number;

  @ApiPropertyOptional({ example: 40, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minTotalArea?: number;

  @ApiPropertyOptional({ example: 500, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxTotalArea?: number;

  @ApiPropertyOptional({ example: 30, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minBuiltArea?: number;

  @ApiPropertyOptional({ example: 350, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxBuiltArea?: number;

  @ApiPropertyOptional({ example: 1, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minParkingSpaces?: number;

  @ApiPropertyOptional({ example: 4, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxParkingSpaces?: number;

  @ApiPropertyOptional({
    enum: PropertyStatus,
    example: PropertyStatus.ACTIVE,
    description: 'Filtrar por status do imóvel',
  })
  @IsOptional()
  @IsEnum(PropertyStatus)
  status?: PropertyStatus;

  @ApiPropertyOptional({
    example: 'campolim',
    maxLength: 80,
    description:
      'Busca textual livre: casa (case-insensitive) com código, cidade, estado ou bairro. É o ' +
      'único campo que cruza mais de uma coluna — `code`, `city`, `state` e `neighborhood` ' +
      'continuam existindo para filtrar um campo específico.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  q?: string;

  @ApiPropertyOptional({
    enum: ['newest', 'oldest', 'price_asc', 'price_desc', 'area_desc'],
    example: 'price_asc',
    default: 'newest',
    description:
      'Ordenação. `newest` (padrão) e `oldest` por data de criação; `price_asc`/`price_desc` por ' +
      'preço; `area_desc` por área total. Em ordenações por preço, imóveis sem `price` (apenas ' +
      'aluguel) vão para o fim — o valor deles está em `rentPrice`.',
  })
  @IsOptional()
  @IsEnum(['newest', 'oldest', 'price_asc', 'price_desc', 'area_desc'] as const)
  sort?: 'newest' | 'oldest' | 'price_asc' | 'price_desc' | 'area_desc';

  @ApiPropertyOptional({ example: 0, minimum: 0, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @Transform(({ value }) => (value === undefined ? 0 : value))
  @IsNumber()
  @Min(0)
  skip?: number;

  @ApiPropertyOptional({ example: 10, minimum: 1, maximum: 100, default: 10 })
  @IsOptional()
  @Type(() => Number)
  @Transform(({ value }) => (value === undefined ? 10 : value))
  @IsNumber()
  @Min(1)
  @Max(100)
  take?: number;
}
