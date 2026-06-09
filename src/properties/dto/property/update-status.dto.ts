import { ApiProperty } from '@nestjs/swagger';
import { PropertyStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdatePropertyStatusDto {
  @ApiProperty({
    enum: PropertyStatus,
    description: 'Novo status da propriedade',
  })
  @IsEnum(PropertyStatus, { message: 'Status inválido' })
  status!: PropertyStatus;
}
