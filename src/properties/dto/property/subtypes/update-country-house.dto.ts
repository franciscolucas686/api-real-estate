import { PartialType } from '@nestjs/swagger';
import { CreateCountryHouseDto } from './create-country-house.dto';

export class UpdateCountryHouseDto extends PartialType(CreateCountryHouseDto) {}
