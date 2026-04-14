import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreateHouseDto {
  @ApiProperty({ example: 2, description: 'Número de andares' })
  @IsInt({ message: 'Andares deve ser um número inteiro' })
  @Min(1, { message: 'Andares deve ser no mínimo 1' })
  @Type(() => Number)
  floors!: number;

  @ApiPropertyOptional({ example: true, description: 'Se está em condomínio' })
  @IsOptional()
  @IsBoolean({ message: 'isInCondominium deve ser um booleano' })
  isInCondominium?: boolean;

  @ApiPropertyOptional({ example: 'Condomínio Alphaville', description: 'Nome do condomínio' })
  @IsOptional()
  @IsString({ message: 'Nome do condomínio deve ser uma string' })
  condominiumName?: string;

  @ApiPropertyOptional({
    example: 'Piscina, Churrasqueira, Academia',
    description: 'Comodidades do condomínio',
  })
  @IsOptional()
  @IsString({ message: 'Comodidades do condomínio deve ser uma string' })
  condominiumAmenities?: string;
}
