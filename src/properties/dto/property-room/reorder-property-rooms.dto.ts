import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsInt, IsUUID, Min, ValidateNested } from 'class-validator';

export class PropertyRoomOrderItemDto {
  @ApiProperty({ example: 'd3f5c93e-6db1-4c6c-9b53-26b8d8db8f09' })
  @IsUUID('4', { message: 'ID do comodo deve ser um UUID valido' })
  roomId!: string;

  @ApiProperty({ example: 0, minimum: 0 })
  @IsInt({ message: 'Ordem deve ser um numero inteiro' })
  @Min(0, { message: 'Ordem nao pode ser negativa' })
  @Type(() => Number)
  order!: number;
}

export class ReorderPropertyRoomsDto {
  @ApiProperty({
    type: [PropertyRoomOrderItemDto],
    description: 'Lista de comodos com suas novas ordens',
  })
  @IsArray({ message: 'Items deve ser um array' })
  @ValidateNested({ each: true })
  @Type(() => PropertyRoomOrderItemDto)
  items!: PropertyRoomOrderItemDto[];
}
