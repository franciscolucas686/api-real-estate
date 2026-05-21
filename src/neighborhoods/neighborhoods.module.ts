import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { NeighborhoodsController } from './neighborhoods.controller';
import { NeighborhoodsService } from './neighborhoods.service';

@Module({
  imports: [PrismaModule],
  controllers: [NeighborhoodsController],
  providers: [NeighborhoodsService],
})
export class NeighborhoodsModule {}
