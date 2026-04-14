import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID, MinLength } from 'class-validator';

export class SetMainPropertyImageDto {
  @ApiProperty({
    example: 'd3f5c93e-6db1-4c6c-9b53-26b8d8db8f09',
    description: 'ID da imagem a ser definida como principal',
  })
  @IsString({ message: 'ID da imagem deve ser uma string' })
  @IsUUID('4', { message: 'ID da imagem deve ser um UUID valido' })
  @MinLength(1, { message: 'ID da imagem é obrigatório' })
  imageId!: string;
}
