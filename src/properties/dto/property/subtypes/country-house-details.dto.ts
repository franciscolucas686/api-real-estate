import { ApiProperty } from '@nestjs/swagger';

export class CountryHouseDetailsDto {
  @ApiProperty()
  hasRiver!: boolean;

  @ApiProperty()
  hasSpring!: boolean;
}
