import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'admin', description: 'Username of the admin user' })
  @IsString()
  @MinLength(3)
  @MaxLength(32)
  username: string;

  @ApiProperty({
    example: 'StrongPass123',
    description:
      'Plain text password (minimum 8 chars, returned as JWT on success)',
  })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password: string;
}
