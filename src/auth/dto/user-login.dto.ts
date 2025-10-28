import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class UserLoginDto {
  @ApiProperty({
    example: 'PlayerOne',
    description: 'Player username (maps to User.name)',
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
}
