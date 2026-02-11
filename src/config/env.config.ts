export interface EnvConfig {
  NODE_ENV: 'development' | 'production' | 'test';
  PORT: number;
  JWT_SECRET: string;
  JWT_REFRESH_SECRET: string;
  CORS_ORIGIN: string;
  DATABASE_URL?: string;
  CLOUDINARY_CLOUD_NAME: string;
  CLOUDINARY_API_KEY: string;
  CLOUDINARY_API_SECRET: string;
  WHATSAPP_A: string;
  WHATSAPP_B: string;
}

export function validateEnvConfig(): EnvConfig {
  const requiredEnvVars = [
    'JWT_SECRET',
    'JWT_REFRESH_SECRET',
    'CLOUDINARY_CLOUD_NAME',
    'CLOUDINARY_API_KEY',
    'CLOUDINARY_API_SECRET',
    'WHATSAPP_A',
    'WHATSAPP_B',
  ];

  const missingEnvVars = requiredEnvVars.filter((envVar) => !process.env[envVar]);

  if (missingEnvVars.length > 0) {
    throw new Error(
      `Variáveis de ambiente obrigatórias não configuradas: ${missingEnvVars.join(', ')}`,
    );
  }

  return {
    NODE_ENV: (process.env.NODE_ENV as EnvConfig['NODE_ENV']) || 'development',
    PORT: parseInt(process.env.PORT || '3000', 10),
    JWT_SECRET: process.env.JWT_SECRET!,
    JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET!,
    CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:3000',
    DATABASE_URL: process.env.DATABASE_URL,
    CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME!,
    CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY!,
    CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET!,
    WHATSAPP_A: process.env.WHATSAPP_A!,
    WHATSAPP_B: process.env.WHATSAPP_B!,
  };
}
