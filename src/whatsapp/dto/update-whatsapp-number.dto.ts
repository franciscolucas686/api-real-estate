import { PartialType } from '@nestjs/swagger';
import { CreateWhatsappNumberDto } from './create-whatsapp-number.dto';

export class UpdateWhatsappNumberDto extends PartialType(CreateWhatsappNumberDto) {}
