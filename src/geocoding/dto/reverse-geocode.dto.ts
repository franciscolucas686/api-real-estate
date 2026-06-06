import { IsLatitude, IsLongitude, IsNumber } from 'class-validator';

export class ReverseGeocodeDto {
  @IsNumber()
  @IsLatitude()
  latitude: number;

  @IsNumber()
  @IsLongitude()
  longitude: number;
}
