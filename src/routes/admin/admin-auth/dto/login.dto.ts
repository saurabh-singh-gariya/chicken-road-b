import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString } from "class-validator";

export class LoginDto {

    @ApiProperty({
        description: 'Username',
        example: 'admin',
    })
    @IsString()
    @IsNotEmpty()
    username: string;

    @ApiProperty({
        description: 'Password',
        example: 'password',
    })
    @IsString()
    @IsNotEmpty()
    password: string;
}

export class AdminInfoDto {
    @ApiProperty({ description: 'Admin ID', example: 'uuid' })
    id: string;

    @ApiProperty({ description: 'Username', example: 'admin' })
    username: string;

    @ApiProperty({ description: 'Role', example: 'SUPER_ADMIN', enum: ['SUPER_ADMIN', 'ADMIN'] })
    role: string;

    @ApiProperty({ description: 'Agent ID (username for AGENT_ADMIN)', example: 'agent123', required: false })
    agentId: string;
}

export class LoginResponseDto {
    @ApiProperty({
        description: 'Access token',
        example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    })
    accessToken: string;

    @ApiProperty({
        description: 'Refresh token',
        example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    })
    refreshToken: string;

    @ApiProperty({ description: 'Admin information', type: AdminInfoDto })
    admin: AdminInfoDto;
}

export class RefreshTokenDto {
    @ApiProperty({
        description: 'Refresh token',
        example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    })
    @IsString()
    @IsNotEmpty()
    refreshToken: string;
}

export class RefreshTokenResponseDto {
    @ApiProperty({
        description: 'New access token',
        example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    })
    accessToken: string;

    @ApiProperty({
        description: 'New refresh token',
        example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    })
    refreshToken: string;
}

export class CreateAdminDto {
    @ApiProperty({
        description: 'Username',
        example: 'admin',
    })
    @IsString()
    @IsNotEmpty()
    username: string;

    @ApiProperty({
        description: 'Password',
        example: 'password',
    })
    @IsString()
    @IsNotEmpty()
    password: string;
}