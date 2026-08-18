import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches } from 'class-validator';

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
    example: 'francinegestora',
    description:
      'Perfil do Instagram da imobiliária — apenas o handle, sem "@" e sem URL. ' +
      'String vazia limpa o campo.',
    pattern: '^$|^[A-Za-z0-9._]{1,30}$',
  })
  @IsOptional()
  @IsString()
  // A alternativa `^$` não é decorativa: `@IsOptional()` só pula `undefined`/`null`, e a
  // string vazia é o valor documentado para "não configurado" — sem ela seria impossível
  // limpar o campo depois de preenchê-lo.
  @Matches(/^$|^[A-Za-z0-9._]{1,30}$/, {
    message:
      'Instagram deve conter apenas letras, números, ponto e underline (até 30 caracteres), sem "@"',
  })
  instagram?: string;

  @ApiPropertyOptional({
    example: 'Seg–Sex: 9h às 18h | Sáb: 9h às 13h',
    description: 'Horário de atendimento exibido na página de contato',
  })
  @IsOptional()
  @IsString()
  hours?: string;
}
