import { ApiProperty } from '@nestjs/swagger';
import { SunPosition } from '@prisma/client';

export class ApartmentDetailsDto {
  @ApiProperty({ nullable: true })
  floor!: number | null;

  @ApiProperty()
  hasElevator!: boolean;

  @ApiProperty()
  hasBalcony!: boolean;

  @ApiProperty({ enum: SunPosition })
  sunPosition!: SunPosition;

  @ApiProperty({ nullable: true })
  hasPool!: boolean | null;
}
