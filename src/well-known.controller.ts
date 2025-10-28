import { Controller, Get } from '@nestjs/common';
import { Public } from './auth/public.decorator';

// Chrome devtools occasionally probe this path; serve stub to avoid 404 noise.
@Public()
@Controller('.well-known/appspecific')
export class WellKnownController {
  @Get('com.chrome.devtools.json')
  stub() {
    return { status: 'ok', name: 'chicken-road-backend', features: [] };
  }
}
