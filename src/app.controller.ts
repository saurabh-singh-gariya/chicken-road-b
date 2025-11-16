import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('app')
@Controller('/app/v1')
export class AppController {
  constructor() {}

  @Get()
  getHello(): string {
    console.log('Hello World!');
    return 'Hello World!';
  }
}
