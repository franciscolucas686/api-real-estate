import { ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { SaleType } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsArray, IsEnum, IsOptional, ValidateNested } from 'class-validator';
import { CreatePropertyDto } from './create-property.dto';
import {
  UpdateApartmentDto,
  UpdateCountryHouseDto,
  UpdateHouseDto,
  UpdateLandDto,
  UpdateSmallFarmDto,
} from './subtypes';

export class UpdatePropertyDto extends PartialType(
  OmitType(CreatePropertyDto, ['house', 'apartment', 'land', 'smallFarm', 'countryHouse'] as const),
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

  @ApiPropertyOptional({ type: UpdateHouseDto, description: 'Atualizar dados específicos de casa' })
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateHouseDto)
  house?: UpdateHouseDto;

  @ApiPropertyOptional({
    type: UpdateApartmentDto,
    description: 'Atualizar dados específicos de apartamento',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateApartmentDto)
  apartment?: UpdateApartmentDto;

  @ApiPropertyOptional({
    type: UpdateLandDto,
    description: 'Atualizar dados específicos de terreno',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateLandDto)
  land?: UpdateLandDto;

  @ApiPropertyOptional({
    type: UpdateSmallFarmDto,
    description: 'Atualizar dados específicos de chácara',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateSmallFarmDto)
  smallFarm?: UpdateSmallFarmDto;

  @ApiPropertyOptional({
    type: UpdateCountryHouseDto,
    description: 'Atualizar dados específicos de sítio/casa de campo',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateCountryHouseDto)
  countryHouse?: UpdateCountryHouseDto;
}
