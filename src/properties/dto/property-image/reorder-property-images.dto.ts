import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsInt, IsOptional, IsUUID, Min, ValidateNested } from 'class-validator';

export class PropertyImageOrderItemDto {
  @ApiProperty({ example: 'd3f5c93e-6db1-4c6c-9b53-26b8d8db8f09' })
  @IsUUID('4', { message: 'ID da imagem deve ser um UUID valido' })
  imageId!: string;

  @ApiProperty({ example: 0, minimum: 0 })
  @IsInt({ message: 'Ordem deve ser um numero inteiro' })
  @Min(0, { message: 'Ordem nao pode ser negativa' })
  @Type(() => Number)
  order!: number;

  @ApiPropertyOptional({
    example: 'd3f5c93e-6db1-4c6c-9b53-26b8d8db8f09',
    description:
      'ID do comodo a associar. null para desassociar. Omitir para manter o comodo atual.',
  })
  @IsOptional()
  @IsUUID('4', { message: 'roomId deve ser um UUID valido' })
  roomId?: string | null;
}

export class ReorderPropertyImagesDto {
  @ApiProperty({
    type: [PropertyImageOrderItemDto],
    description: 'Lista de imagens com suas novas ordens e, opcionalmente, associacao de comodo',
  })
  @IsArray({ message: 'Items deve ser um array' })
  @ValidateNested({ each: true })
  @Type(() => PropertyImageOrderItemDto)
  items!: PropertyImageOrderItemDto[];
}
