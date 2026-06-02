import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NeighborhoodItemDto } from './dto';

@Injectable()
export class NeighborhoodsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(city?: string, state?: string): Promise<NeighborhoodItemDto[]> {
    return this.prisma.neighborhood.findMany({
      where: {
        ...(city && { city: { equals: city, mode: 'insensitive' } }),
        ...(state && { state: { equals: state, mode: 'insensitive' } }),
      },
      select: { displayName: true, city: true, state: true },
      orderBy: { displayName: 'asc' },
    });
  }
}
