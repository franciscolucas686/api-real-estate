import { ApiProperty } from '@nestjs/swagger';
import { BusinessType, PropertyStatus, PropertyType } from '@prisma/client';

export class PreviewImageDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  url!: string;
}

export class PropertyCardDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  code!: string;

  @ApiProperty({ enum: PropertyType })
  type!: PropertyType;

  @ApiProperty({ enum: BusinessType })
  businessType!: BusinessType;

  @ApiProperty({
    enum: PropertyStatus,
    description: 'Status da propriedade (DRAFT, PENDING, ACTIVE, INACTIVE)',
  })
  status!: PropertyStatus;

  @ApiProperty({ type: String })
  price!: string;

  @ApiProperty({ type: String, nullable: true })
  rentPrice!: string | null;

  @ApiProperty()
  city!: string;

  @ApiProperty()
  state!: string;

  @ApiProperty()
  neighborhood!: string;

  @ApiProperty({ nullable: true })
  bedrooms!: number | null;

  @ApiProperty({ nullable: true })
  bathrooms!: number | null;

  @ApiProperty({ nullable: true })
  parkingSpaces!: number | null;

  @ApiProperty({ type: [PreviewImageDto] })
  previewImages!: PreviewImageDto[];
}

export class PropertyListResponseDto {
  @ApiProperty({ type: [PropertyCardDto] })
  data!: PropertyCardDto[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  skip!: number;

  @ApiProperty()
  take!: number;
}
