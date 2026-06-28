import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class ForwardGeocodeDto {
  @ApiProperty({ example: 'Jardins', description: 'Nome do bairro' })
  @IsString()
  neighborhood!: string;

  @ApiProperty({ example: 'São Paulo', description: 'Cidade' })
  @IsString()
  city!: string;

  @ApiProperty({ example: 'SP', description: 'Sigla do estado' })
  @IsString()
  state!: string;
}
