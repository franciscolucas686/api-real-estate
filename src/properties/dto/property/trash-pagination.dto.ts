import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsNumber, IsOptional, Max, Min } from 'class-validator';

/**
 * Paginação de `GET /properties/trash`.
 *
 * DTO próprio, e não o `FilterPropertyDto`, porque a lixeira não aceita filtro nenhum
 * — e o `ValidationPipe` global roda com `forbidNonWhitelisted`, então reaproveitar
 * aquele faria a rota aceitar em silêncio parâmetros que ela ignora.
 */
export class TrashPaginationDto {
  @ApiPropertyOptional({ example: 0, minimum: 0, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @Transform(({ value }) => (value === undefined ? 0 : value))
  @IsNumber()
  @Min(0)
  skip?: number;

  @ApiPropertyOptional({ example: 20, minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @Transform(({ value }) => (value === undefined ? 20 : value))
  @IsNumber()
  @Min(1)
  @Max(100)
  take?: number;
}
