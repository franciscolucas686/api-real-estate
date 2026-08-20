import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({
    example: 'admin@imobiliaria.com',
    description: 'Email do usuário. Este exemplo é o usuário que `npm run db:seed:dev` cria.',
  })
  @IsEmail({}, { message: 'Email inválido' })
  email!: string;

  @ApiProperty({
    example: 'Admin@123',
    description: 'Senha do usuário, mínimo de 6 caracteres. Este exemplo é a senha do seed.',
    minLength: 6,
  })
  @IsString({ message: 'Senha deve ser uma string' })
  @MinLength(6, { message: 'Senha deve ter no mínimo 6 caracteres' })
  password!: string;
}
