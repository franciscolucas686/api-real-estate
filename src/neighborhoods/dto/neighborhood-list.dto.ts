import { ApiProperty } from '@nestjs/swagger';

export class NeighborhoodItemDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  displayName!: string;
}
