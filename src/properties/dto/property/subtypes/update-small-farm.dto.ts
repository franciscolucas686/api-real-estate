import { PartialType } from '@nestjs/swagger';
import { CreateSmallFarmDto } from './create-small-farm.dto';

export class UpdateSmallFarmDto extends PartialType(CreateSmallFarmDto) {}
