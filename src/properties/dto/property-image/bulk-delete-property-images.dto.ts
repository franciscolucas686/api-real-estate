import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsUUID } from 'class-validator';

export class BulkDeletePropertyImagesDto {
  @ApiProperty({
    example: ['uuid1', 'uuid2'],
    description: 'IDs das imagens a serem deletadas',
    type: [String],
  })
  @IsArray({ message: 'imageIds deve ser um array' })
  @IsUUID('4', { each: true, message: 'Cada ID deve ser um UUID válido' })
  imageIds!: string[];
}
