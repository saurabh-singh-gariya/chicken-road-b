import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterAdminDto } from './dto/register-admin.dto';
import { UserLoginDto } from './dto/user-login.dto';
import { UserRegisterDto } from './dto/user-register.dto';
import { Public } from './public.decorator';

// NOTE: Basic auth header OR JSON body validated via LoginDto.
// Basic header form is primarily for tools; body is preferred.

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('token')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Issue admin JWT access token (Basic header or JSON body)',
  })
  @ApiResponse({
    status: 200,
    description: 'Returns JWT access token',
    schema: { example: { accessToken: '<jwt>', tokenType: 'Bearer' } },
  })
  @ApiResponse({ status: 400, description: 'Missing or malformed credentials' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
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
  @ApiOperation({ summary: 'Register a new admin user' })
  @ApiResponse({
    status: 201,
    description: 'Admin created',
    schema: { example: { id: 'uuid', username: 'admin' } },
  })
  @ApiResponse({ status: 409, description: 'Username already taken' })
  async register(@Body() dto: RegisterAdminDto) {
    const admin = await this.authService.createAdmin(
      dto.username,
      dto.password,
    );
    return { id: admin.id, username: admin.username };
  }

  // PLAYER AUTH ---------------------------------------------------------
  @Public()
  @Post('player/login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Issue player JWT access token' })
  @ApiResponse({
    status: 200,
    description: 'Returns player JWT token',
    schema: { example: { accessToken: '<jwt>', tokenType: 'Bearer' } },
  })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async playerLogin(@Body() body: UserLoginDto) {
    const user = await this.authService.validatePlayer(
      body.username,
      body.password,
    );
    return this.authService.generatePlayerToken(user);
  }

  @Public()
  @Post('player/register')
  @ApiOperation({ summary: 'Register new player account' })
  @ApiResponse({
    status: 201,
    description: 'Player created',
    schema: { example: { id: 'uuid', username: 'PlayerOne' } },
  })
  @ApiResponse({ status: 409, description: 'Username already taken' })
  async playerRegister(@Body() body: UserRegisterDto) {
    const user = await this.authService.createPlayer(
      body.username,
      body.password,
      body.avatar,
    );
    return { id: user.id, username: user.name };
  }
}
