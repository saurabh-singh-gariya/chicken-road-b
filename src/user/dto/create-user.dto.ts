import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsUrl } from 'class-validator';

export class CreateUserDto {
  @ApiProperty({
    description: 'Unique display name for the user',
    example: 'PlayerOne',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    description: 'Avatar URL (optional)',
    example: 'https://cdn.example.com/avatars/a1.png',
    required: false,
  })
  @IsOptional()
  @IsUrl()
  avatar?: string;
}
