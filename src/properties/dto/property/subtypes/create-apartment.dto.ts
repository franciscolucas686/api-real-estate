import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SunPosition } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, Min } from 'class-validator';

export class CreateApartmentDto {
  @ApiPropertyOptional({
    example: true,
    description: 'Se é térreo. Quando true, o campo floor é automaticamente definido como 0.',
  })
  @IsOptional()
  @IsBoolean({ message: 'isGroundFloor deve ser um booleano' })
  isGroundFloor?: boolean;

  @ApiPropertyOptional({
    example: 5,
    description: 'Andar do apartamento. Ignorado quando isGroundFloor é true (floor será 0).',
  })
  @IsOptional()
  @IsInt({ message: 'Andar deve ser um número inteiro' })
  @Min(0, { message: 'Andar não pode ser negativo' })
  @Type(() => Number)
  floor?: number;

  @ApiProperty({ example: true, description: 'Se tem elevador' })
  @IsBoolean({ message: 'hasElevator deve ser um booleano' })
  hasElevator!: boolean;

  @ApiProperty({ example: true, description: 'Se tem varanda' })
  @IsBoolean({ message: 'hasBalcony deve ser um booleano' })
  hasBalcony!: boolean;

  @ApiProperty({
    enum: SunPosition,
    example: SunPosition.MORNING,
    description: 'Posição do sol (MORNING ou AFTERNOON)',
  })
  @IsEnum(SunPosition, { message: 'Posição do sol inválida' })
  sunPosition!: SunPosition;

  @ApiPropertyOptional({ example: true, description: 'Se tem piscina' })
  @IsOptional()
  @IsBoolean({ message: 'hasPool deve ser um booleano' })
  hasPool?: boolean;
}
