import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AppService } from './app.service';

@ApiTags('Health')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @ApiOperation({ summary: 'Verificar saúde da aplicação' })
  @ApiResponse({ status: 200, description: 'Aplicação está funcionando' })
  getHello(): string {
    return this.appService.getHello();
  }
}
