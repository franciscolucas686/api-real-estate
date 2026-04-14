import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class SetMainImageDto {
  @ApiProperty({
    example: 'd3f5c93e-6db1-4c6c-9b53-26b8d8db8f09',
    description: 'ID da imagem a ser definida como principal',
  })
  @IsString({ message: 'ID da imagem deve ser uma string' })
  @MinLength(1, { message: 'ID da imagem é obrigatório' })
  imageId!: string;
}
