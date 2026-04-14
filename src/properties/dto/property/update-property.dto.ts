import { ApiPropertyOptional } from '@nestjs/swagger';
import { PropertyStatus, PropertyType } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { CreatePropertyDto } from './create-property.dto';

export class UpdatePropertyDto implements Partial<CreatePropertyDto> {
  @ApiPropertyOptional({ example: 'Casa Moderna no Brooklin' })
  @IsOptional()
  @IsString({ message: 'Título deve ser uma string' })
  @MinLength(3, { message: 'Título deve ter no mínimo 3 caracteres' })
  title?: string;

  @ApiPropertyOptional({ example: 'Casa com acabamento premium e área gourmet' })
  @IsOptional()
  @IsString({ message: 'Descrição deve ser uma string' })
  @MinLength(10, { message: 'Descrição deve ter no mínimo 10 caracteres' })
  description?: string;

  @ApiPropertyOptional({ enum: PropertyType, example: PropertyType.HOUSE })
  @IsOptional()
  @IsEnum(PropertyType, { message: 'Tipo de propriedade inválido' })
  type?: PropertyType;

  @ApiPropertyOptional({ enum: PropertyStatus, example: PropertyStatus.AVAILABLE })
  @IsOptional()
  @IsEnum(PropertyStatus, { message: 'Status de propriedade inválido' })
  status?: PropertyStatus;

  @ApiPropertyOptional({ example: 750000, minimum: 0 })
  @IsOptional()
  @IsNumber({}, { message: 'Preço deve ser um número' })
  @Min(0, { message: 'Preço não pode ser negativo' })
  @Type(() => Number)
  price?: number;

  @ApiPropertyOptional({ example: 3500, minimum: 0 })
  @IsOptional()
  @IsNumber({}, { message: 'Preço de aluguel deve ser um número' })
  @Min(0, { message: 'Preço de aluguel não pode ser negativo' })
  @Type(() => Number)
  rentPrice?: number;

  @ApiPropertyOptional({ example: 700, minimum: 0 })
  @IsOptional()
  @IsNumber({}, { message: 'Taxa de condomínio deve ser um número' })
  @Min(0, { message: 'Taxa de condomínio não pode ser negativa' })
  @Type(() => Number)
  condoFee?: number;

  @ApiPropertyOptional({ example: 250, minimum: 0 })
  @IsOptional()
  @IsNumber({}, { message: 'Área total deve ser um número' })
  @Min(0, { message: 'Área total não pode ser negativa' })
  @Type(() => Number)
  totalArea?: number;

  @ApiPropertyOptional({ example: 180, minimum: 0 })
  @IsOptional()
  @IsNumber({}, { message: 'Área construída deve ser um número' })
  @Min(0, { message: 'Área construída não pode ser negativa' })
  @Type(() => Number)
  builtArea?: number;

  @ApiPropertyOptional({ example: 3, minimum: 0 })
  @IsOptional()
  @IsNumber({}, { message: 'Quartos deve ser um número' })
  @Min(0, { message: 'Quartos não pode ser negativo' })
  @Type(() => Number)
  bedrooms?: number;

  @ApiPropertyOptional({ example: 2, minimum: 0 })
  @IsOptional()
  @IsNumber({}, { message: 'Banheiros deve ser um número' })
  @Min(0, { message: 'Banheiros não pode ser negativo' })
  @Type(() => Number)
  bathrooms?: number;

  @ApiPropertyOptional({ example: 2, minimum: 0 })
  @IsOptional()
  @IsNumber({}, { message: 'Vagas de garagem deve ser um número' })
  @Min(0, { message: 'Vagas de garagem não pode ser negativo' })
  @Type(() => Number)
  parkingSpaces?: number;

  @ApiPropertyOptional({ example: 'SP', minLength: 2 })
  @IsOptional()
  @IsString({ message: 'Estado deve ser uma string' })
  @MinLength(2, { message: 'Estado deve ter no mínimo 2 caracteres' })
  state?: string;

  @ApiPropertyOptional({ example: 'São Paulo', minLength: 2 })
  @IsOptional()
  @IsString({ message: 'Cidade deve ser uma string' })
  @MinLength(2, { message: 'Cidade deve ter no mínimo 2 caracteres' })
  city?: string;

  @ApiPropertyOptional({ example: 'Brooklin', minLength: 2 })
  @IsOptional()
  @IsString({ message: 'Bairro deve ser uma string' })
  @MinLength(2, { message: 'Bairro deve ter no mínimo 2 caracteres' })
  neighborhood?: string;

  @ApiPropertyOptional({ example: 'PROP001', minLength: 1 })
  @IsOptional()
  @IsString({ message: 'Código deve ser uma string' })
  @MinLength(1, { message: 'Código deve ter no mínimo 1 carácter' })
  code?: string;
}
