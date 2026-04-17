import { ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { SaleType } from '@prisma/client';
import { IsArray, IsEnum, IsOptional } from 'class-validator';
import { CreatePropertyDto } from './create-property.dto';

export class UpdatePropertyDto extends PartialType(
  OmitType(CreatePropertyDto, ['house', 'apartment', 'land', 'smallFarm', 'countryHouse', 'saleTypes'] as const),
) {
  @ApiPropertyOptional({
    enum: SaleType,
    isArray: true,
    example: [SaleType.DIRECT],
    description: 'Tipos de venda (substitui existentes)',
  })
  @IsOptional()
  @IsArray({ message: 'saleTypes deve ser um array' })
  @IsEnum(SaleType, { each: true, message: 'Tipo de venda inválido' })
  saleTypes?: SaleType[];
}
