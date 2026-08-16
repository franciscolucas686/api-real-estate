import { Injectable } from '@nestjs/common';
import { Prisma, PropertyRoom } from '@prisma/client';
import {
  PropertyNotFoundError,
  RoomNameAlreadyExistsError,
  RoomNotBelongToPropertyError,
  RoomNotFoundError,
} from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePropertyRoomDto, UpdatePropertyRoomDto } from './dto';

@Injectable()
export class PropertyRoomsService {
  constructor(private readonly prisma: PrismaService) {}

  async createRoom(propertyId: string, dto: CreatePropertyRoomDto): Promise<PropertyRoom> {
    await this.ensurePropertyExists(propertyId);

    const order = dto.order ?? (await this.getNextRoomOrder(propertyId));

    try {
      return await this.prisma.propertyRoom.create({
        data: {
          propertyId,
          name: dto.name,
          order,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new RoomNameAlreadyExistsError(dto.name);
      }
      throw error;
    }
  }

  async updateRoom(
    propertyId: string,
    roomId: string,
    dto: UpdatePropertyRoomDto,
  ): Promise<PropertyRoom> {
    await this.ensureRoomBelongsToProperty(roomId, propertyId);

    return this.prisma.propertyRoom.update({
      where: { id: roomId },
      data: dto,
    });
  }

  async deleteRoom(propertyId: string, roomId: string): Promise<void> {
    await this.ensureRoomBelongsToProperty(roomId, propertyId);

    await this.prisma.propertyRoom.delete({
      where: { id: roomId },
    });
  }

  private async ensurePropertyExists(propertyId: string): Promise<void> {
    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
      select: { id: true },
    });
    if (!property) {
      throw new PropertyNotFoundError(propertyId);
    }
  }

  private async ensureRoomBelongsToProperty(roomId: string, propertyId: string): Promise<void> {
    const room = await this.prisma.propertyRoom.findUnique({
      where: { id: roomId },
      select: { propertyId: true },
    });

    if (!room) {
      throw new RoomNotFoundError(roomId);
    }

    if (room.propertyId !== propertyId) {
      throw new RoomNotBelongToPropertyError(roomId, propertyId);
    }
  }

  private async getNextRoomOrder(propertyId: string): Promise<number> {
    const lastRoom = await this.prisma.propertyRoom.findFirst({
      where: { propertyId },
      orderBy: { order: 'desc' },
      select: { order: true },
    });
    return (lastRoom?.order ?? -1) + 1;
  }
}
