import { ApiExtraModels, ApiProperty, ApiPropertyOptional, getSchemaPath } from '@nestjs/swagger';
import { BusinessType, PropertyStatus, PropertyType, SaleType } from '@prisma/client';
import {
  ApartmentDetailsDto,
  CountryHouseDetailsDto,
  HouseDetailsDto,
  LandDetailsDto,
  SmallFarmDetailsDto,
} from './subtypes';

export class PropertyImageDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  url!: string;

  @ApiProperty({ nullable: true })
  label!: string | null;

  @ApiProperty()
  order!: number;
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
}

export class PropertySaleTypeDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: SaleType })
  type!: SaleType;
}

export class PropertyLocationDto {
  @ApiProperty({ nullable: true, type: Number })
  latitude!: number | null;

  @ApiProperty({ nullable: true, type: Number })
  longitude!: number | null;

  @ApiProperty()
  neighborhood!: string;

  @ApiProperty()
  city!: string;

  @ApiProperty()
  state!: string;
}

/**
 * Contato privado do proprietário do imóvel.
 *
 * Só existe na resposta para quem está autenticado — quem decide é `ownerContactFor`
 * (`src/properties/property-visibility.ts`), chamado por `PropertiesService.findOne`.
 */
export class PropertyOwnerDto {
  @ApiProperty({ example: 'Maria Silva', description: 'Nome do proprietário' })
  name!: string;

  @ApiProperty({
    example: '11987654321',
    description: 'WhatsApp do proprietário, somente dígitos e sem DDI',
  })
  phone!: string;
}

export class GalleryDto {
  @ApiPropertyOptional({ type: [PropertyImageDto] })
  unassigned?: PropertyImageDto[];

  @ApiProperty({ type: [PropertyRoomDto] })
  rooms!: PropertyRoomDto[];
}

@ApiExtraModels(
  HouseDetailsDto,
  ApartmentDetailsDto,
  LandDetailsDto,
  SmallFarmDetailsDto,
  CountryHouseDetailsDto,
)
export class PropertyDetailDto {
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

  @ApiProperty({ type: [PropertySaleTypeDto] })
  saleTypes!: PropertySaleTypeDto[];

  @ApiProperty({ type: String, nullable: true })
  price!: string | null;

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
  suites!: number | null;

  @ApiProperty({ nullable: true })
  parkingSpaces!: number | null;

  @ApiProperty({ type: GalleryDto })
  gallery!: GalleryDto;

  @ApiProperty({
    nullable: true,
    oneOf: [
      { $ref: getSchemaPath(HouseDetailsDto) },
      { $ref: getSchemaPath(ApartmentDetailsDto) },
      { $ref: getSchemaPath(LandDetailsDto) },
      { $ref: getSchemaPath(SmallFarmDetailsDto) },
      { $ref: getSchemaPath(CountryHouseDetailsDto) },
    ],
    description: 'Type-specific details matched to the root type field.',
  })
  details!:
    | HouseDetailsDto
    | ApartmentDetailsDto
    | LandDetailsDto
    | SmallFarmDetailsDto
    | CountryHouseDetailsDto
    | null;

  @ApiProperty({ nullable: true, type: PropertyLocationDto })
  /** null indica que as coordenadas ainda não foram resolvidas.
      O frontend deve ocultar o componente de mapa quando null. */
  location!: PropertyLocationDto | null;

  @ApiProperty({ nullable: true })
  whatsappContact!: string | null;

  /**
   * O contato do proprietário, ou `null`.
   *
   * **`null` funde dois casos de propósito**: "você não pode ver" (chamada anônima) e "ainda
   * não foi preenchido" (imóvel anterior à migração que criou as colunas). Quem chama não
   * precisa distinguir os dois, e um campo só é um campo só a esquecer.
   *
   * Aninhado, ao contrário da entrada (`ownerName`/`ownerPhone`, planos em
   * `CreatePropertyDto`, porque espelham coluna). A saída espelha a fronteira de acesso —
   * mesma assimetria que `gallery`, `location` e `details` já têm aqui.
   */
  @ApiProperty({
    nullable: true,
    type: PropertyOwnerDto,
    description:
      'Contato privado do proprietário. `null` para chamadas anônimas — este campo NUNCA é ' +
      'serializado sem autenticação — e também `null` quando o imóvel ainda não tem os dados.',
  })
  owner!: PropertyOwnerDto | null;

  @ApiProperty()
  userId!: string;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
