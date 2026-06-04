import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AdminSecretGuard } from '../auth/guards/admin-secret.guard';
import { CreateWhatsappNumberDto, UpdateWhatsappNumberDto } from './dto';
import { WhatsappService } from './whatsapp.service';

@Controller('whatsapp-numbers')
@UseGuards(AdminSecretGuard)
export class WhatsappController {
  constructor(private readonly whatsappService: WhatsappService) {}

  @Post()
  create(@Body() createWhatsappNumberDto: CreateWhatsappNumberDto) {
    return this.whatsappService.create(createWhatsappNumberDto);
  }

  @Get()
  findAll() {
    return this.whatsappService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.whatsappService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateWhatsappNumberDto: UpdateWhatsappNumberDto) {
    return this.whatsappService.update(id, updateWhatsappNumberDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string) {
    await this.whatsappService.remove(id);
  }
}
