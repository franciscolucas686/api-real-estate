import { IsBoolean, IsInt, IsOptional, IsString, Matches, Min } from 'class-validator';

export class CreateWhatsappNumberDto {
  @IsString()
  @Matches(/^\d{8,15}$/, {
    message: 'Número deve conter apenas dígitos e ter entre 8 e 15 caracteres',
  })
  number: string;

  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}
