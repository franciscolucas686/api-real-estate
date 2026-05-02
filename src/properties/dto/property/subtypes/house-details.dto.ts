import { ApiProperty } from '@nestjs/swagger';

export class HouseDetailsDto {
  @ApiProperty({ nullable: true })
  floors!: number | null;

  @ApiProperty()
  isInCondominium!: boolean;

  @ApiProperty({ nullable: true })
  condominiumName!: string | null;

  @ApiProperty({ nullable: true })
  condominiumAmenities!: string | null;
}
