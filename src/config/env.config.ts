import 'dotenv/config';
import { z } from 'zod';

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

    CORS_ORIGIN: z.union([z.url(), z.literal('*')]).optional(),

    JWT_SECRET: z.string().min(32, 'JWT_SECRET deve ter no mínimo 32 caracteres'),

    JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET deve ter no mínimo 32 caracteres'),

    DATABASE_URL: z.url().optional(),

    R2_ACCOUNT_ID: z.string().optional(),
    R2_ACCESS_KEY_ID: z.string().optional(),
    R2_SECRET_ACCESS_KEY: z.string().optional(),
    R2_BUCKET_NAME: z.string().optional(),
    R2_PUBLIC_BASE_URL: z.string().url().optional(),

    ADMIN_SECRET: z.string().min(32, 'ADMIN_SECRET deve ter no mínimo 32 caracteres'),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production') {
      const requiredInProd = [
        'DATABASE_URL',
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
