import { Body, Controller, Post, Get, UseGuards } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from "@nestjs/swagger";
import { AdminAuthService, type AdminTokenPayload } from "./admin-auth.service";
import { AdminAuthGuard } from "../guards/admin-auth.guard";
import { CurrentAdmin } from "./decorators/admin-auth.decorator";
import { LoginDto, LoginResponseDto, RefreshTokenDto, RefreshTokenResponseDto, AdminInfoDto, CreateAdminDto } from "./dto/login.dto";

@ApiTags('Admin Auth')
@Controller('admin/api/v1/auth')
export class AdminAuthController {
    constructor(private readonly adminAuthService: AdminAuthService) { }

    @Post('login')
    @ApiOperation({ summary: 'Admin login' })
    @ApiResponse({ status: 200, description: 'Login successful', type: LoginResponseDto })
    @ApiResponse({ status: 401, description: 'Invalid credentials' })
    async login(@Body() loginDto: LoginDto): Promise<LoginResponseDto> {
        return this.adminAuthService.login(loginDto);
    }

    @Post('refresh')
    @ApiOperation({ summary: 'Refresh access token' })
    @ApiResponse({ status: 200, description: 'Token refreshed successfully', type: RefreshTokenResponseDto })
    @ApiResponse({ status: 401, description: 'Invalid or expired refresh token' })
    async refreshToken(@Body() refreshTokenDto: RefreshTokenDto): Promise<RefreshTokenResponseDto> {
        return this.adminAuthService.refreshToken(refreshTokenDto);
    }

    @Post('logout')
    @UseGuards(AdminAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Admin logout' })
    @ApiResponse({ status: 200, description: 'Logout successful' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    async logout(): Promise<{ success: boolean }> {
        // In a more advanced implementation, you could blacklist the token here
        // For now, we just return success - the client should discard the token
        return { success: true };
    }

    @Get('me')
    @UseGuards(AdminAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Get current admin profile' })
    @ApiResponse({ status: 200, description: 'Admin profile', type: AdminInfoDto })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    async getProfile(@CurrentAdmin() admin: AdminTokenPayload): Promise<AdminInfoDto> {
        return this.adminAuthService.getAdminProfile(admin);
    }

    @Post('signup')
    @ApiOperation({ summary: 'Signup new admin' })
    @ApiResponse({ status: 200, description: 'Admin signed up successfully', type: AdminInfoDto })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    async signup(@Body() signupDto: CreateAdminDto): Promise<AdminInfoDto> {
        return this.adminAuthService.signup(signupDto);
    }
}