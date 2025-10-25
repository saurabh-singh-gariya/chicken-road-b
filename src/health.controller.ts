import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags } from '@nestjs/swagger';
import { DataSource } from 'typeorm';
import { Public } from './auth/public.decorator';

@ApiTags('health')
@Controller()
export class HealthController {
  constructor(
    private readonly cfg: ConfigService,
    private readonly dataSource: DataSource,
  ) {}

  @Get('health')
  @Public()
  health() {
    const appCfg = this.cfg.get<any>('app');
    const dbConnected = this.dataSource?.isInitialized ?? false;
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
      env: appCfg?.env,
      authEnabled: appCfg?.enableAuth,
      db: { connected: dbConnected },
    };
  }
}
