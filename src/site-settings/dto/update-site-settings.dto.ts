import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class UpdateSiteSettingsDto {
  @ApiPropertyOptional({
    example: '11987654321',
    description: 'Número WhatsApp exibido na página de contato (somente dígitos, sem DDI)',
  })
  @IsOptional()
  @IsString()
  whatsapp?: string;

  @ApiPropertyOptional({
    example: 'contato@imobiliaria.com',
    description: 'E-mail de contato exibido na página de contato',
  })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional({
    example: '1132104500',
    description: 'Telefone fixo ou celular de contato (somente dígitos)',
  })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({
    example: 'Seg–Sex: 9h às 18h | Sáb: 9h às 13h',
    description: 'Horário de atendimento exibido na página de contato',
  })
  @IsOptional()
  @IsString()
  hours?: string;
}
