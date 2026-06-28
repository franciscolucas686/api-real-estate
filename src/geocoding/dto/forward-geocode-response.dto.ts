import { ApiProperty } from '@nestjs/swagger';

export class ForwardGeocodeResponseDto {
  @ApiProperty({ example: -23.5614 })
  latitude!: number;

  @ApiProperty({ example: -46.6557 })
  longitude!: number;
}
