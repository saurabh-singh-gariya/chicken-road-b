import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterAdminDto } from './dto/register-admin.dto';
import { Public } from './public.decorator';

// NOTE: Basic auth header OR JSON body validated via LoginDto.
// Basic header form is primarily for tools; body is preferred.

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('token')
  @HttpCode(200)
  async issueToken(
    @Headers('authorization') authHeader?: string,
    @Body() body?: LoginDto,
  ) {
    let creds: LoginDto | null = null;

    // Prefer validated body credentials if present
    if (body?.username && body?.password) {
      creds = body;
    } else if (authHeader && authHeader.startsWith('Basic ')) {
      const b64 = authHeader.slice(6).trim();
      let decoded: string;
      try {
        decoded = Buffer.from(b64, 'base64').toString('utf8');
      } catch {
        throw new UnauthorizedException('Malformed Basic Authorization header');
      }
      const sep = decoded.indexOf(':');
      if (sep === -1) {
        throw new UnauthorizedException('Malformed Basic Authorization header');
      }
      const username = decoded.slice(0, sep);
      const password = decoded.slice(sep + 1);
      // Minimal sanity checks (ValidationPipe already active for body path)
      if (!username || !password) {
        throw new UnauthorizedException('Invalid Basic credentials');
      }
      creds = { username, password } as LoginDto;
    }

    if (!creds) {
      throw new BadRequestException(
        'Credentials required: send JSON {"username","password"} or Basic header',
      );
    }

    const admin = await this.authService.validateUser(
      creds.username,
      creds.password,
    );
    return this.authService.generateToken(admin);
  }

  @Public()
  @Post('register')
  async register(@Body() dto: RegisterAdminDto) {
    const admin = await this.authService.createAdmin(
      dto.username,
      dto.password,
    );
    return { id: admin.id, username: admin.username };
  }
}
