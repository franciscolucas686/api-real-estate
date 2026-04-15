import { Module } from '@nestjs/common';
import { AppConfigModule } from '../config/config.module';
import { R2Service } from './r2.service';

@Module({
  imports: [AppConfigModule],
  providers: [R2Service],
  exports: [R2Service],
})
export class R2Module {}
