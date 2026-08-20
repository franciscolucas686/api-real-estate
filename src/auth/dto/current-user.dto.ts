export class CurrentUserDto {
  id!: string;
  email!: string;
  name!: string | null;
  /** Sessão (dispositivo) que emitiu o token. Vazio em tokens anteriores às sessões. */
  sessionId!: string;
}
