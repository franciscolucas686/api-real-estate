import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({
    example: 'francisco@email.com',
    description: 'Email do usuário',
  })
  @IsEmail({}, { message: 'Email inválido' })
  email: string;

  @ApiProperty({
    example: '12345678',
    description: 'Senha com no mínimo 6 caracteres',
    minLength: 6,
  })
  @IsString({ message: 'Senha deve ser uma string' })
  @MinLength(6, { message: 'Senha deve ter no mínimo 6 caracteres' })
  password: string;

  @ApiPropertyOptional({
    example: 'Francisco Lucas',
    description: 'Nome do usuário',
  })
  @IsOptional()
  @IsString({ message: 'Nome deve ser uma string' })
  name?: string;
}
