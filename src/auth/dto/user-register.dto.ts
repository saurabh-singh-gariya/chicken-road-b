import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class UserRegisterDto {
  @ApiProperty({
    example: 'PlayerOne',
    description: 'Desired unique player username',
  })
  @IsString()
  username: string; // maps to User.name

  @ApiProperty({
    example: 'SecretPass123',
    description: 'Plain password (>=4 chars)',
  })
  @IsString()
  @MinLength(4)
  password: string;

  @ApiProperty({
    example: 'https://cdn.example.com/avatars/a1.png',
    description: 'Avatar image URL or identifier',
  })
  @IsString()
  avatar: string;
}
