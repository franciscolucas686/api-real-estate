import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BusinessType, PropertyType, SaleType } from '@prisma/client';

export class PropertyImageDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  url!: string;

  @ApiProperty({ nullable: true })
  label!: string | null;

  @ApiProperty()
  order!: number;

  @ApiProperty({ nullable: true })
  roomId!: string | null;

  @ApiProperty()
  createdAt!: Date;
}

export class PropertyRoomDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  order!: number;

  @ApiProperty({ type: [PropertyImageDto] })
  images!: PropertyImageDto[];

  @ApiProperty()
  createdAt!: Date;
}

export class PropertySaleTypeDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: SaleType })
  type!: SaleType;
}

export class GalleryDto {
  @ApiProperty({ type: [PropertyImageDto] })
  unassigned!: PropertyImageDto[];

  @ApiProperty({ type: [PropertyRoomDto] })
  rooms!: PropertyRoomDto[];
}

export class PropertyDetailDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  code!: string;

  @ApiProperty({ enum: PropertyType })
  type!: PropertyType;

  @ApiProperty({ enum: BusinessType })
  businessType!: BusinessType;

  @ApiProperty({ type: [PropertySaleTypeDto] })
  saleTypes!: PropertySaleTypeDto[];

  @ApiProperty({ type: String })
  price!: string;

  @ApiProperty({ type: String, nullable: true })
  rentPrice!: string | null;

  @ApiProperty({ type: String, nullable: true })
  condoFee!: string | null;

  @ApiProperty()
  city!: string;

  @ApiProperty()
  state!: string;

  @ApiProperty()
  neighborhood!: string;

  @ApiProperty()
  description!: string;

  @ApiProperty({ nullable: true })
  totalArea!: number | null;

  @ApiProperty({ nullable: true })
  builtArea!: number | null;

  @ApiProperty({ nullable: true })
  bedrooms!: number | null;

  @ApiProperty({ nullable: true })
  bathrooms!: number | null;

  @ApiProperty({ nullable: true })
  parkingSpaces!: number | null;

  @ApiProperty({ type: GalleryDto })
  gallery!: GalleryDto;

  @ApiPropertyOptional()
  house?: Record<string, unknown>;

  @ApiPropertyOptional()
  apartment?: Record<string, unknown>;

  @ApiPropertyOptional()
  land?: Record<string, unknown>;

  @ApiPropertyOptional()
  smallfarm?: Record<string, unknown>;

  @ApiPropertyOptional()
  countryhouse?: Record<string, unknown>;

  @ApiProperty({ nullable: true })
  whatsappContact!: string | null;

  @ApiProperty()
  userId!: string;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
