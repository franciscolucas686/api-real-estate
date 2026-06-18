import { ApiProperty } from '@nestjs/swagger';

export class SiteSettingsDto {
  @ApiProperty({
    example: 'singleton',
    description: 'Identificador único (sempre "singleton" — registro único no sistema)',
  })
  id!: string;

  @ApiProperty({
    example: '11987654321',
    description: 'Número WhatsApp da página de contato (somente dígitos, sem DDI)',
  })
  whatsapp!: string;

  @ApiProperty({
    example: 'contato@imobiliaria.com',
    description: 'E-mail de contato',
  })
  email!: string;

  @ApiProperty({
    example: '1132104500',
    description: 'Telefone de contato (somente dígitos)',
  })
  phone!: string;

  @ApiProperty({
    example: 'Seg–Sex: 9h às 18h | Sáb: 9h às 13h',
    description: 'Horário de atendimento',
  })
  hours!: string;

  @ApiProperty({
    example: '2026-06-18T01:15:00.000Z',
    description: 'Data e hora da última atualização (ISO 8601)',
  })
  updatedAt!: Date;
}
