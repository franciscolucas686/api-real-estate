// Exemplo de como proteger rotas com JWT

import { Controller, Get, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtGuard } from '../auth/guards/jwt.guard';

@Controller('properties')
export class PropertiesController {
  /**
   * Rota protegida - apenas usuários autenticados podem acessar
   *
   * Requisição:
   * GET /properties
   * Cookie: accessToken=eyJhbGciOiJIUzI1NiIs...
   */
  @Get()
  @UseGuards(JwtGuard)
  getMyProperties(@CurrentUser() user: any) {
    const userId = user.id;

    // Buscar properties do usuário
    return [
      // Properties do usuário
    ];
  }

  /**
   * Rota pública - qualquer um pode acessar
   */
  @Get('available')
  getAvailableProperties() {
    // Buscar properties disponíveis
    return [];
  }
}

/*
EXEMPLO COMPLETO DE FLUXO DE AUTENTICAÇÃO:

1. Registrar novo usuário:
   POST /auth/register
   {
     "email": "user@example.com",
     "password": "senha123",
     "name": "Nome do Usuário"
   }
   
   Resposta:
   {
     "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
     "user": {
       "id": "uuid",
       "email": "user@example.com",
       "name": "Nome do Usuário",
       "createdAt": "2026-01-27T10:00:00Z"
     }
   }
   
   Cookies set:
   - accessToken (15 minutos, HTTP-only)
   - refreshToken (7 dias, HTTP-only)

2. Acessar rota protegida:
   GET /properties
   
   O navegador envia automaticamente:
   Cookie: accessToken=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...;
           refreshToken=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...;

3. Token expira (após 15 minutos):
   GET /properties
   Resposta: 401 Unauthorized
   
4. Renovar token:
   POST /auth/refresh
   
   Cookie: refreshToken=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...;
   
   Resposta:
   {
     "accessToken": "novo_token_aqui"
   }
   
   Novo cookie set:
   - accessToken (novo, 15 minutos)

5. Fazer logout:
   POST /auth/logout
   
   Cookie: accessToken=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...;
   
   Resposta:
   {
     "message": "Logout realizado com sucesso"
   }
   
   Cookies cleared:
   - accessToken
   - refreshToken
*/
