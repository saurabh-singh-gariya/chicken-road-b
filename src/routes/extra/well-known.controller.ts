import { Controller, Get } from '@nestjs/common';

@Controller('.well-known/appspecific')
export class WellKnownController {
  @Get('com.chrome.devtools.json')
  stub() {
    return { status: 'ok', name: 'chicken-road-backend', features: [] };
  }
}
