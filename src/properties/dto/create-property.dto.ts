import { PropertyStatus, PropertyType } from '@prisma/client';

export class CreatePropertyDto {
  title: string;
  description: string;
  type: PropertyType;
  status: PropertyStatus;

  price: number;
  rentPrice?: number;
  condoFee?: number;

  totalArea?: number;
  builtArea?: number;

  bedrooms?: number;
  bathrooms?: number;
  parkingSpaces?: number;

  state: string;
  city: string;
  neighborhood: string;
  code: string;
}
