import { ApiProperty } from '@nestjs/swagger';
import { WaterSource } from '@prisma/client';
import { IsBoolean, IsEnum } from 'class-validator';

export class CreateSmallFarmDto {
  @ApiProperty({ example: true, description: 'Se tem casa' })
  @IsBoolean({ message: 'hasHouse deve ser um booleano' })
  hasHouse!: boolean;

  @ApiProperty({ example: false, description: 'Se tem piscina' })
  @IsBoolean({ message: 'hasPool deve ser um booleano' })
  hasPool!: boolean;

  @ApiProperty({ example: false, description: 'Se tem lago' })
  @IsBoolean({ message: 'hasLake deve ser um booleano' })
  hasLake!: boolean;

  @ApiProperty({ example: true, description: 'Se tem árvores frutíferas' })
  @IsBoolean({ message: 'hasFruitTrees deve ser um booleano' })
  hasFruitTrees!: boolean;

  @ApiProperty({
    enum: WaterSource,
    example: WaterSource.WELL,
    description: 'Fonte de água (WELL, SPRING, MAINS)',
  })
  @IsEnum(WaterSource, { message: 'Fonte de água inválida' })
  waterSource!: WaterSource;
}
