import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { R2Module } from '../r2/r2.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { PropertiesController } from './properties.controller';
import { PropertiesService } from './properties.service';
import { PropertyImagesService } from './property-images.service';
import { PropertyRoomsService } from './property-rooms.service';

@Module({
  imports: [PrismaModule, R2Module, WhatsappModule],
  controllers: [PropertiesController],
  providers: [PropertiesService, PropertyImagesService, PropertyRoomsService],
  exports: [PropertiesService],
})
export class PropertiesModule {}
