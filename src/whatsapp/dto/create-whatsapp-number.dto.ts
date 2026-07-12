import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, Matches, Min } from 'class-validator';

export class CreateWhatsappNumberDto {
  @ApiProperty({
    example: '11987654321',
    description: 'Número WhatsApp (somente dígitos, entre 8 e 15 caracteres)',
    pattern: '^\\d{8,15}$',
  })
  @IsString()
  @Matches(/^\d{8,15}$/, {
    message: 'Número deve conter apenas dígitos e ter entre 8 e 15 caracteres',
  })
  number: string;

  @ApiPropertyOptional({
    example: true,
    description: 'Define se o número está ativo e será distribuído para imóveis',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    example: 0,
    description: 'Ordem de exibição na listagem (menor valor = exibido primeiro)',
    minimum: 0,
    default: 0,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}
