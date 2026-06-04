import { PartialType } from '@nestjs/mapped-types';
import { CreateWhatsappNumberDto } from './create-whatsapp-number.dto';

export class UpdateWhatsappNumberDto extends PartialType(CreateWhatsappNumberDto) {}
