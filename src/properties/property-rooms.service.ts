import { Injectable } from '@nestjs/common';
import { PropertyRoom } from '@prisma/client';
import {
  ImageNotBelongToPropertyError,
  PropertyNotFoundError,
  RoomNotBelongToPropertyError,
  RoomNotFoundError,
} from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';
import {
  AssignPropertyImagesToRoomDto,
  CreatePropertyRoomDto,
  ReorderPropertyRoomsDto,
  UpdatePropertyRoomDto,
} from './dto';

@Injectable()
export class PropertyRoomsService {
  constructor(private readonly prisma: PrismaService) {}

  async createRoom(propertyId: string, dto: CreatePropertyRoomDto): Promise<PropertyRoom> {
    await this.ensurePropertyExists(propertyId);

    const order = dto.order ?? (await this.getNextRoomOrder(propertyId));

    return this.prisma.propertyRoom.create({
      data: {
        propertyId,
        name: dto.name,
        order,
      },
    });
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

  async reorderRooms(propertyId: string, dto: ReorderPropertyRoomsDto): Promise<PropertyRoom[]> {
    await this.ensurePropertyExists(propertyId);

    const roomIds = dto.items.map((item) => item.roomId);
    const rooms = await this.prisma.propertyRoom.findMany({
      where: { id: { in: roomIds }, propertyId },
    });

    if (rooms.length !== roomIds.length) {
      throw new RoomNotBelongToPropertyError('um ou mais comodos', propertyId);
    }

    await this.prisma.$transaction(
      dto.items.map((item) =>
        this.prisma.propertyRoom.update({
          where: { id: item.roomId },
          data: { order: item.order },
        }),
      ),
    );

    return this.prisma.propertyRoom.findMany({
      where: { propertyId },
      orderBy: { order: 'asc' },
    });
  }

  async assignImagesToRoom(propertyId: string, dto: AssignPropertyImagesToRoomDto): Promise<void> {
    await this.ensurePropertyExists(propertyId);

    if (dto.roomId) {
      await this.ensureRoomBelongsToProperty(dto.roomId, propertyId);
    }

    const images = await this.prisma.propertyImage.findMany({
      where: { id: { in: dto.imageIds }, propertyId },
    });

    if (images.length !== dto.imageIds.length) {
      throw new ImageNotBelongToPropertyError('uma ou mais imagens', propertyId);
    }

    await this.prisma.propertyImage.updateMany({
      where: { id: { in: dto.imageIds } },
      data: { roomId: dto.roomId ?? null },
    });
  }

  async findRoomsByProperty(propertyId: string): Promise<PropertyRoom[]> {
    return this.prisma.propertyRoom.findMany({
      where: { propertyId },
      orderBy: { order: 'asc' },
      include: {
        images: {
          orderBy: { order: 'asc' },
        },
      },
    });
  }

  private async ensurePropertyExists(propertyId: string): Promise<void> {
    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
    });
    if (!property) {
      throw new PropertyNotFoundError(propertyId);
    }
  }

  private async ensureRoomBelongsToProperty(roomId: string, propertyId: string): Promise<void> {
    const room = await this.prisma.propertyRoom.findUnique({
      where: { id: roomId },
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
    });
    return (lastRoom?.order ?? -1) + 1;
  }
}
