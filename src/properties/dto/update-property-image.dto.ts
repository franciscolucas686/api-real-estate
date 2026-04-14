import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, Min, MinLength } from 'class-validator';

export class UpdatePropertyImageDto {
  @ApiPropertyOptional({
    example: 'Vista panoramica da varanda',
    description: 'Descricao da imagem',
  })
  @IsOptional()
  @IsString({ message: 'Label deve ser uma string' })
  @MinLength(1, { message: 'Label deve ter no minimo 1 caractere' })
  label?: string;

  @ApiPropertyOptional({
    example: 0,
    description: 'Ordem de exibicao da imagem',
    minimum: 0,
  })
  @IsOptional()
  @IsInt({ message: 'Ordem deve ser um numero inteiro' })
  @Min(0, { message: 'Ordem nao pode ser negativa' })
  @Type(() => Number)
  order?: number;

  @ApiPropertyOptional({
    example: 'd3f5c93e-6db1-4c6c-9b53-26b8d8db8f09',
    description: 'ID do comodo associado (null para remover associacao)',
  })
  @IsOptional()
  @IsUUID('4', { message: 'ID do comodo deve ser um UUID valido' })
  roomId?: string | null;
}
