import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsOptional, IsUUID } from 'class-validator';

export class AssignPropertyImagesToRoomDto {
  @ApiProperty({
    example: ['uuid1', 'uuid2'],
    description: 'IDs das imagens a serem associadas ao comodo',
    type: [String],
  })
  @IsArray({ message: 'IDs das imagens deve ser um array' })
  @IsUUID('4', { each: true, message: 'Cada ID deve ser um UUID valido' })
  imageIds!: string[];

  @ApiPropertyOptional({
    example: 'd3f5c93e-6db1-4c6c-9b53-26b8d8db8f09',
    description: 'ID do comodo (null para remover associacao)',
  })
  @IsOptional()
  @IsUUID('4', { message: 'ID do comodo deve ser um UUID valido' })
  roomId?: string | null;
}
