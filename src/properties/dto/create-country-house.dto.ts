import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class CreateCountryHouseDto {
  @ApiProperty({ example: true, description: 'Se tem rio' })
  @IsBoolean({ message: 'hasRiver deve ser um booleano' })
  hasRiver: boolean;

  @ApiProperty({ example: false, description: 'Se tem nascente' })
  @IsBoolean({ message: 'hasSpring deve ser um booleano' })
  hasSpring: boolean;
}
