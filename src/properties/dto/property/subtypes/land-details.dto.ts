import { ApiProperty } from '@nestjs/swagger';
import { Topography, Zoning } from '@prisma/client';

export class LandDetailsDto {
  @ApiProperty({ enum: Zoning })
  zoning!: Zoning;

  @ApiProperty({ enum: Topography })
  topography!: Topography;
}
