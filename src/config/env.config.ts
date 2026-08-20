import { z } from 'zod';

/**
 * Trata `VAR=""` como "não definida".
 *
 * Num arquivo `.env` não existe forma de escrever `undefined`: quem quer deixar uma
 * variável de fora escreve `VAR=""` ou apaga a linha, e o `dotenv` entrega string vazia
 * para o primeiro caso. Sem isto, `.optional()` só cobre a linha apagada — a string vazia
 * chega ao validador e é reprovada por não casar com o formato.
 *
 * Foi assim que o `COOKIE_DOMAIN=""` do `.env.example` derrubava o boot com
 * "deve começar com ponto", logo abaixo de um comentário mandando deixá-lo vazio. O
 * `superRefine` de produção já tratava vazio como ausente (`if (!env[key])`), então esta
 * função é o que faz as duas metades do schema concordarem.
 */
const optionalEnv = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === '' ? undefined : value), schema.optional());

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

    PORT: z
      .string()
      .default('3000')
      .transform((val) => Number(val))
      .refine((val) => !isNaN(val), {
        message: 'PORT deve ser um número válido',
      }),

    CORS_ORIGIN: optionalEnv(z.union([z.url(), z.literal('*')])),
    // Onde a SPA vive. O módulo `share` redireciona para lá depois de servir as OG tags
    // ao crawler. Opcional de propósito: em produção o `CORS_ORIGIN` do fly.toml já é
    // esse mesmo endereço e serve de fallback, então nenhuma variável nova precisa ser
    // criada lá. Em desenvolvimento ela é necessária, porque o `CORS_ORIGIN` de
    // `.env.development` aponta para a porta da própria API (3000), não para o Vite (5173).
    APP_PUBLIC_URL: optionalEnv(z.url()),

    /**
     * Domínio dos cookies de sessão, com ponto inicial (`.seudominio.com`).
     *
     * **Deixe vazio.** O padrão host-only é o correto mesmo com o app no apex e a API
     * em `api.` — quem emite o cookie é esta API, então host-only já o prende ao host
     * para onde as requisições vão, e `sameSite: 'lax'` não bloqueia nada porque
     * subdomínios do mesmo domínio registrável são o mesmo *site*.
     *
     * Preencher só amplia a exposição: o cookie de sessão passaria a acompanhar
     * requisições ao apex, ao www e a qualquer subdomínio futuro, nenhum dos quais
     * precisa dele. Existe para o caso de o cookie um dia precisar alcançar um host
     * diferente do que o emitiu.
     */
    COOKIE_DOMAIN: optionalEnv(
      z
        .string()
        .regex(/^\.[a-z0-9.-]+$/i, 'COOKIE_DOMAIN deve começar com ponto, ex: .seudominio.com'),
    ),

    JWT_SECRET: z.string().min(32, 'JWT_SECRET deve ter no mínimo 32 caracteres'),

    JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET deve ter no mínimo 32 caracteres'),

    DATABASE_URL: optionalEnv(z.url()),

    R2_ACCOUNT_ID: optionalEnv(z.string()),
    R2_ACCESS_KEY_ID: optionalEnv(z.string()),
    R2_SECRET_ACCESS_KEY: optionalEnv(z.string()),
    R2_BUCKET_NAME: optionalEnv(z.string()),
    R2_PUBLIC_BASE_URL: optionalEnv(z.string().url()),
    R2_ENDPOINT: optionalEnv(z.string().url()),

    ADMIN_SECRET: z.string().min(32, 'ADMIN_SECRET deve ter no mínimo 32 caracteres'),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production') {
      const requiredInProd = [
        'DATABASE_URL',
        // Ausente, o `enableCors` de `main.ts` cai no default `*` do pacote `cors`, que
        // com `credentials: true` o navegador recusa: o app sobe, o site carrega e
        // nenhum imóvel aparece — erro visível só no console de quem visita. Falhar no
        // boot, com o nome da variável, é o diagnóstico que essa falha não tem.
        'CORS_ORIGIN',
        'R2_ACCOUNT_ID',
        'R2_ACCESS_KEY_ID',
        'R2_SECRET_ACCESS_KEY',
        'R2_BUCKET_NAME',
        'R2_PUBLIC_BASE_URL',
        'ADMIN_SECRET',
      ] as const;

      requiredInProd.forEach((key) => {
        if (!env[key]) {
          ctx.addIssue({
            code: 'custom',
            message: `${key} é obrigatório em produção`,
            path: [key],
          });
        }
      });

      if (env.CORS_ORIGIN === '*') {
        ctx.addIssue({
          code: 'custom',
          message:
            'CORS_ORIGIN="*" não é permitido em produção (incompatível com credentials: true)',
          path: ['CORS_ORIGIN'],
        });
      }
    }
  });

export type EnvConfig = z.infer<typeof envSchema>;

export function validateEnvConfig(): EnvConfig {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    console.error('❌ Erro nas variáveis de ambiente:');
    console.error(z.treeifyError(parsed.error));
    throw new Error('Configuração inválida.');
  }

  return parsed.data;
}
