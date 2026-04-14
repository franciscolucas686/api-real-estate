import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class UpdatePropertyRoomDto {
  @ApiPropertyOptional({
    example: 'Quarto Principal',
    description: 'Nome do comodo',
    minLength: 1,
  })
  @IsOptional()
  @IsString({ message: 'Nome do comodo deve ser uma string' })
  @MinLength(1, { message: 'Nome do comodo deve ter no minimo 1 caractere' })
  name?: string;

  @ApiPropertyOptional({
    example: 1,
    description: 'Ordem de exibicao do comodo',
    minimum: 0,
  })
  @IsOptional()
  @IsInt({ message: 'Ordem deve ser um numero inteiro' })
  @Min(0, { message: 'Ordem nao pode ser negativa' })
  @Type(() => Number)
  order?: number;
}
