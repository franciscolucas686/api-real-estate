import { IsString, MinLength } from 'class-validator';

export class SetMainImageDto {
  @IsString({ message: 'ID da imagem deve ser uma string' })
  @MinLength(1, { message: 'ID da imagem é obrigatório' })
  imageId: string;
}
