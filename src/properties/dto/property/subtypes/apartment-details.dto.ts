import { ApiProperty } from '@nestjs/swagger';
import { SunPosition } from '@prisma/client';

export class ApartmentDetailsDto {
  @ApiProperty()
  floor!: number;

  @ApiProperty({ nullable: true })
  isGroundFloor!: boolean | null;

  @ApiProperty()
  hasElevator!: boolean;

  @ApiProperty()
  hasBalcony!: boolean;

  @ApiProperty({ enum: SunPosition })
  sunPosition!: SunPosition;

  @ApiProperty({ nullable: true })
  hasPool!: boolean | null;
}
