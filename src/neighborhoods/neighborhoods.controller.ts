import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { NeighborhoodItemDto, NeighborhoodQueryDto } from './dto';
import { NeighborhoodsService } from './neighborhoods.service';

@ApiTags('neighborhoods')
@Controller('neighborhoods')
export class NeighborhoodsController {
  constructor(private readonly neighborhoodsService: NeighborhoodsService) {}

  @Get()
  @ApiOperation({ summary: 'List neighborhoods, optionally filtered by city and state' })
  findAll(@Query() query: NeighborhoodQueryDto): Promise<NeighborhoodItemDto[]> {
    return this.neighborhoodsService.findAll(query.city, query.state);
  }
}
