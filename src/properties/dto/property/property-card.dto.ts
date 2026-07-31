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
    description: 'Status da propriedade (PENDING, ACTIVE, INACTIVE)',
  })
  status!: PropertyStatus;

  @ApiProperty({ type: String, nullable: true })
  price!: string | null;

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

  /*
   * Fields below were added so a listing can be rendered without a second request per row.
   * `suites` in particular was already being selected in `findWithFilters` and silently
   * dropped in the map — a dead `select` paying a cost for nothing. The rest are columns on
   * the same table, so they add no join.
   *
   * Additive only: every existing consumer keeps working.
   */

  @ApiProperty({ nullable: true, description: 'Suítes. Já era selecionado e descartado.' })
  suites!: number | null;

  @ApiProperty({ nullable: true, description: 'Área total em m² — necessária para listas densas.' })
  totalArea!: number | null;

  @ApiProperty({ nullable: true, description: 'Área construída em m².' })
  builtArea!: number | null;

  @ApiProperty({ type: String, nullable: true, description: 'Valor do condomínio.' })
  condoFee!: string | null;

  @ApiProperty({
    description:
      'Data de criação. Sem ela não existe coluna "publicado em" nem ordenação por data no cliente.',
    example: '2026-07-18T00:00:00.000Z',
  })
  createdAt!: Date;

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
