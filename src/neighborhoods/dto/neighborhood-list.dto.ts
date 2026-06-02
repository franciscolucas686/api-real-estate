import { ApiProperty } from '@nestjs/swagger';

export class NeighborhoodItemDto {
  @ApiProperty({ example: 'Brooklín' })
  displayName!: string;

  @ApiProperty({ example: 'São Paulo' })
  city!: string;

  @ApiProperty({ example: 'SP' })
  state!: string;
}
