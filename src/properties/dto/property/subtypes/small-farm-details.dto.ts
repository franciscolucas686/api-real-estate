import { ApiProperty } from '@nestjs/swagger';
import { WaterSource } from '@prisma/client';

export class SmallFarmDetailsDto {
  @ApiProperty()
  hasHouse!: boolean;

  @ApiProperty()
  hasPool!: boolean;

  @ApiProperty()
  hasLake!: boolean;

  @ApiProperty()
  hasFruitTrees!: boolean;

  @ApiProperty({ enum: WaterSource })
  waterSource!: WaterSource;
}
