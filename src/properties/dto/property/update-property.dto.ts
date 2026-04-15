import { OmitType, PartialType } from '@nestjs/swagger';
import { CreatePropertyDto } from './create-property.dto';

export class UpdatePropertyDto extends PartialType(
  OmitType(CreatePropertyDto, ['house', 'apartment', 'land', 'smallFarm', 'countryHouse'] as const),
) {}
