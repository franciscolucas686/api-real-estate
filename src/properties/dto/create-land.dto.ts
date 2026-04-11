import { ApiProperty } from '@nestjs/swagger';
import { Topography, Zoning } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class CreateLandDto {
  @ApiProperty({
    enum: Zoning,
    example: Zoning.RESIDENTIAL,
    description: 'Zoneamento (RESIDENTIAL, COMMERCIAL, MIXED)',
  })
  @IsEnum(Zoning, { message: 'Zoneamento inválido' })
  zoning!: Zoning;

  @ApiProperty({
    enum: Topography,
    example: Topography.FLAT,
    description: 'Topografia (FLAT, ACCLIVITY, DECLIVITY)',
  })
  @IsEnum(Topography, { message: 'Topografia inválida' })
  topography!: Topography;
}
