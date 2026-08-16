import { Injectable } from '@nestjs/common';
import { Session } from '@prisma/client';
import { createHash, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Dono exclusivo da tabela `Session` — nenhum outro serviço fala com ela.
 *
 * Existe porque o refresh token morava numa coluna do `User`, o que dava **uma** sessão
 * viva por usuário: celular e desktop logados se derrubavam a cada rotação. Aqui cada
 * dispositivo tem a própria linha e rotaciona sem tocar nas demais.
 *
 * O token nunca é gravado em claro — ver `hashToken`.
 */
@Injectable()
export class SessionsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * O `id` vem pronto do chamador em vez de ser gerado aqui: ele precisa entrar no
   * payload dos tokens (claim `sid`) *antes* de a linha existir, então quem assina
   * sorteia o id, assina, e só então grava — uma escrita em vez de insert + update.
   */
  async create(params: {
    id: string;
    userId: string;
    refreshToken: string;
    expiresAt: Date;
    userAgent?: string | null;
  }): Promise<Session> {
    return this.prisma.session.create({
      data: {
        id: params.id,
        userId: params.userId,
        refreshTokenHash: this.hashToken(params.refreshToken),
        expiresAt: params.expiresAt,
        userAgent: params.userAgent ?? null,
      },
    });
  }

  async findById(id: string): Promise<Session | null> {
    return this.prisma.session.findUnique({ where: { id } });
  }

  /**
   * Troca o token desta sessão e desliza a expiração. Não toca em nenhuma outra
   * linha do usuário — é esta a propriedade que todo o modelo existe para garantir.
   */
  async rotate(id: string, refreshToken: string, expiresAt: Date): Promise<Session> {
    return this.prisma.session.update({
      where: { id },
      data: {
        refreshTokenHash: this.hashToken(refreshToken),
        expiresAt,
        lastUsedAt: new Date(),
      },
    });
  }

  /** Logout deste dispositivo. `deleteMany` para ser idempotente — sair duas vezes não é erro. */
  async delete(id: string): Promise<void> {
    await this.prisma.session.deleteMany({ where: { id } });
  }

  /** "Sair de todos os dispositivos". */
  async deleteAllForUser(userId: string): Promise<number> {
    const { count } = await this.prisma.session.deleteMany({ where: { userId } });
    return count;
  }

  async deleteExpired(): Promise<number> {
    const { count } = await this.prisma.session.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    return count;
  }

  /**
   * Comparação em tempo constante entre o token apresentado e o hash guardado.
   *
   * Os dois lados são sempre 64 caracteres hex (SHA-256), então `timingSafeEqual` nunca
   * lança por tamanho diferente — que é a única forma de ele falhar.
   */
  matches(session: Session, refreshToken: string): boolean {
    return timingSafeEqual(
      Buffer.from(this.hashToken(refreshToken), 'hex'),
      Buffer.from(session.refreshTokenHash, 'hex'),
    );
  }

  /**
   * SHA-256, não bcrypt: o valor guardado é um JWT assinado, já de alta entropia — não há
   * dicionário a proteger, e um hash caro pesaria em toda rotação de token. O que isto
   * resolve é o dump de banco, que antes entregava sessões utilizáveis por até 7 dias.
   */
  private hashToken(refreshToken: string): string {
    return createHash('sha256').update(refreshToken).digest('hex');
  }
}
