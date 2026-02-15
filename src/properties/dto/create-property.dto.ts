import { PropertyStatus, PropertyType } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class CreatePropertyDto {
  @IsString({ message: 'Título deve ser uma string' })
  @MinLength(3, { message: 'Título deve ter no mínimo 3 caracteres' })
  title: string;

  @IsString({ message: 'Descrição deve ser uma string' })
  @MinLength(10, { message: 'Descrição deve ter no mínimo 10 caracteres' })
  description: string;

  @IsEnum(PropertyType, { message: 'Tipo de propriedade inválido' })
  type: PropertyType;

  @IsEnum(PropertyStatus, { message: 'Status de propriedade inválido' })
  status: PropertyStatus;

  @IsNumber({}, { message: 'Preço deve ser um número' })
  @Min(0, { message: 'Preço não pode ser negativo' })
  @Type(() => Number)
  price: number;

  @IsOptional()
  @IsNumber({}, { message: 'Preço de aluguel deve ser um número' })
  @Min(0, { message: 'Preço de aluguel não pode ser negativo' })
  @Type(() => Number)
  rentPrice?: number;

  @IsOptional()
  @IsNumber({}, { message: 'Taxa de condomínio deve ser um número' })
  @Min(0, { message: 'Taxa de condomínio não pode ser negativa' })
  @Type(() => Number)
  condoFee?: number;

  @IsOptional()
  @IsNumber({}, { message: 'Área total deve ser um número' })
  @Min(0, { message: 'Área total não pode ser negativa' })
  @Type(() => Number)
  totalArea?: number;

  @IsOptional()
  @IsNumber({}, { message: 'Área construída deve ser um número' })
  @Min(0, { message: 'Área construída não pode ser negativa' })
  @Type(() => Number)
  builtArea?: number;

  @IsOptional()
  @IsNumber({}, { message: 'Quartos deve ser um número' })
  @Min(0, { message: 'Quartos não pode ser negativo' })
  @Type(() => Number)
  bedrooms?: number;

  @IsOptional()
  @IsNumber({}, { message: 'Banheiros deve ser um número' })
  @Min(0, { message: 'Banheiros não pode ser negativo' })
  @Type(() => Number)
  bathrooms?: number;

  @IsOptional()
  @IsNumber({}, { message: 'Vagas de garagem deve ser um número' })
  @Min(0, { message: 'Vagas de garagem não pode ser negativo' })
  @Type(() => Number)
  parkingSpaces?: number;

  @IsString({ message: 'Estado deve ser uma string' })
  @MinLength(2, { message: 'Estado deve ter no mínimo 2 caracteres' })
  state: string;

  @IsString({ message: 'Cidade deve ser uma string' })
  @MinLength(2, { message: 'Cidade deve ter no mínimo 2 caracteres' })
  city: string;

  @IsString({ message: 'Bairro deve ser uma string' })
  @MinLength(2, { message: 'Bairro deve ter no mínimo 2 caracteres' })
  neighborhood: string;

  @IsString({ message: 'Código deve ser uma string' })
  @MinLength(1, { message: 'Código deve ter no mínimo 1 carácter' })
  code: string;
}
