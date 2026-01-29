import { Injectable } from '@nestjs/common';
import sharp from 'sharp';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePropertyDto } from './dto/create-property.dto';
import { FilterPropertyDto } from './dto/filter-property.dto';
import { UpdatePropertyDto } from './dto/update-property.dto';

@Injectable()
export class PropertiesService {
  constructor(
    private prisma: PrismaService,
    private cloudinary: CloudinaryService,
  ) {}

  async create(createPropertyDto: CreatePropertyDto, userId: string) {
    return this.prisma.property.create({
      data: {
        ...createPropertyDto,
        userId,
      },
    });
  }

  async findAll(skip = 0, take = 10) {
    const [properties, total] = await Promise.all([
      this.prisma.property.findMany({
        skip,
        take,
        where: {
          deletedAt: null,
        },
      }),
      this.prisma.property.count({
        where: {
          deletedAt: null,
        },
      }),
    ]);

    const propertiesWithImages = await Promise.all(
      properties.map(async (property) => {
        const images = await this.prisma.propertyImage.findMany({
          where: { propertyId: property.id },
        });
        return { ...property, images };
      }),
    );

    return {
      data: propertiesWithImages,
      total,
      skip,
      take,
    };
  }

  async findWithFilters(filters: FilterPropertyDto) {
    const { skip = 0, take = 10, ...filterParams } = filters;

    // Construir o objeto where com todos os filtros
    const where: any = {
      deletedAt: null,
    };

    // Filtros simples
    if (filterParams.type) {
      where.type = filterParams.type;
    }

    if (filterParams.status) {
      where.status = filterParams.status;
    }

    if (filterParams.city) {
      where.city = {
        contains: filterParams.city,
        mode: 'insensitive',
      };
    }

    if (filterParams.neighborhood) {
      where.neighborhood = {
        contains: filterParams.neighborhood,
        mode: 'insensitive',
      };
    }

    if (filterParams.state) {
      where.state = {
        contains: filterParams.state,
        mode: 'insensitive',
      };
    }

    // Filtro de busca por título ou descrição
    if (filterParams.search) {
      where.OR = [
        {
          title: {
            contains: filterParams.search,
            mode: 'insensitive',
          },
        },
        {
          description: {
            contains: filterParams.search,
            mode: 'insensitive',
          },
        },
      ];
    }

    // Filtros de preço
    if (filterParams.minPrice !== undefined || filterParams.maxPrice !== undefined) {
      where.price = {};
      if (filterParams.minPrice !== undefined) {
        where.price.gte = filterParams.minPrice;
      }
      if (filterParams.maxPrice !== undefined) {
        where.price.lte = filterParams.maxPrice;
      }
    }

    // Filtros de área
    if (filterParams.minTotalArea !== undefined || filterParams.maxTotalArea !== undefined) {
      where.totalArea = {};
      if (filterParams.minTotalArea !== undefined) {
        where.totalArea.gte = filterParams.minTotalArea;
      }
      if (filterParams.maxTotalArea !== undefined) {
        where.totalArea.lte = filterParams.maxTotalArea;
      }
    }

    if (filterParams.minBuiltArea !== undefined || filterParams.maxBuiltArea !== undefined) {
      where.builtArea = {};
      if (filterParams.minBuiltArea !== undefined) {
        where.builtArea.gte = filterParams.minBuiltArea;
      }
      if (filterParams.maxBuiltArea !== undefined) {
        where.builtArea.lte = filterParams.maxBuiltArea;
      }
    }

    // Filtros de dormitórios
    if (filterParams.minBedrooms !== undefined || filterParams.maxBedrooms !== undefined) {
      where.bedrooms = {};
      if (filterParams.minBedrooms !== undefined) {
        where.bedrooms.gte = filterParams.minBedrooms;
      }
      if (filterParams.maxBedrooms !== undefined) {
        where.bedrooms.lte = filterParams.maxBedrooms;
      }
    }

    // Filtros de banheiros
    if (filterParams.minBathrooms !== undefined || filterParams.maxBathrooms !== undefined) {
      where.bathrooms = {};
      if (filterParams.minBathrooms !== undefined) {
        where.bathrooms.gte = filterParams.minBathrooms;
      }
      if (filterParams.maxBathrooms !== undefined) {
        where.bathrooms.lte = filterParams.maxBathrooms;
      }
    }

    // Filtros de vagas de garagem
    if (
      filterParams.minParkingSpaces !== undefined ||
      filterParams.maxParkingSpaces !== undefined
    ) {
      where.parkingSpaces = {};
      if (filterParams.minParkingSpaces !== undefined) {
        where.parkingSpaces.gte = filterParams.minParkingSpaces;
      }
      if (filterParams.maxParkingSpaces !== undefined) {
        where.parkingSpaces.lte = filterParams.maxParkingSpaces;
      }
    }

    // Filtro de tipo de negócio
    if (filterParams.businessType) {
      where.businessTypes = {
        some: {
          businessType: {
            code: filterParams.businessType,
          },
        },
      };
    }

    const [properties, total] = await Promise.all([
      this.prisma.property.findMany({
        skip: parseInt(skip.toString()),
        take: parseInt(take.toString()),
        where,
        include: {
          businessTypes: {
            include: {
              businessType: true,
            },
          },
        },
      }),
      this.prisma.property.count({
        where,
      }),
    ]);

    const propertiesWithImages = await Promise.all(
      properties.map(async (property) => {
        const images = await this.prisma.propertyImage.findMany({
          where: { propertyId: property.id },
        });
        return { ...property, images };
      }),
    );

    return {
      data: propertiesWithImages,
      total,
      skip: parseInt(skip.toString()),
      take: parseInt(take.toString()),
    };
  }

  async findOne(id: string) {
    const property = await this.prisma.property.findUnique({
      where: { id },
    });

    if (!property) {
      return null;
    }

    const images = await this.prisma.propertyImage.findMany({
      where: { propertyId: id },
    });

    const user = await this.prisma.user.findUnique({
      where: { id: property.userId },
      select: {
        id: true,
        name: true,
        email: true,
      },
    });

    return {
      ...property,
      images,
      user,
    };
  }

  async update(id: string, updatePropertyDto: UpdatePropertyDto, userId: string) {
    const property = await this.prisma.property.findUnique({
      where: { id },
    });

    if (!property) {
      throw new Error('Propriedade não encontrada');
    }

    return this.prisma.property.update({
      where: { id },
      data: updatePropertyDto,
    });
  }

  async remove(id: string, userId: string) {
    const property = await this.prisma.property.findUnique({
      where: { id },
    });

    if (!property) {
      throw new Error('Propriedade não encontrada');
    }

    const images = await this.prisma.propertyImage.findMany({
      where: { propertyId: id },
    });

    for (const image of images) {
      const publicId = image.url.split('/').slice(-1)[0].split('.')[0];
      try {
        await this.cloudinary.deleteImage(`real-estate-properties/${publicId}`);
      } catch (error) {
        console.error('Erro ao deletar imagem do Cloudinary:', error);
      }
    }

    return this.prisma.property.update({
      where: { id },
      data: {
        deletedAt: new Date(),
      },
    });
  }

  async uploadImages(propertyId: string, files: Express.Multer.File[]): Promise<string[]> {
    if (!files || files.length === 0) {
      throw new Error('Nenhum arquivo enviado');
    }

    const uploadedUrls: string[] = [];

    for (const file of files) {
      try {
        const compressedBuffer = await sharp(file.buffer)
          .resize(1920, 1080, {
            fit: 'inside',
            withoutEnlargement: true,
          })
          .jpeg({ quality: 80 })
          .toBuffer();

        const url = await this.cloudinary.uploadImage(
          compressedBuffer,
          `${propertyId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        );

        await this.prisma.propertyImage.create({
          data: {
            propertyId,
            url,
          },
        });

        uploadedUrls.push(url);
      } catch (error) {
        console.error('Erro ao processar imagem:', error);
        throw error;
      }
    }

    return uploadedUrls;
  }

  async deleteImage(imageId: string, userId: string) {
    const image = await this.prisma.propertyImage.findUnique({
      where: { id: imageId },
    });

    if (!image) {
      throw new Error('Imagem não encontrada');
    }

    const property = await this.prisma.property.findUnique({
      where: { id: image.propertyId },
    });

    if (!property) {
      throw new Error('Propriedade não encontrada');
    }

    const publicId = image.url.split('/').slice(-1)[0].split('.')[0];

    try {
      await this.cloudinary.deleteImage(`real-estate-properties/${publicId}`);
    } catch (error) {
      console.error('Erro ao deletar imagem do Cloudinary:', error);
    }

    return this.prisma.propertyImage.delete({
      where: { id: imageId },
    });
  }
}
