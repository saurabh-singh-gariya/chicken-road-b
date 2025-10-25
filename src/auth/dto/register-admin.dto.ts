import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class RegisterAdminDto {
  @ApiProperty({
    example: 'newAdmin',
    description: 'Unique username for the admin account',
  })
  @IsString()
  @MinLength(3)
  @MaxLength(32)
  username: string;

  @ApiProperty({
    example: 'SecurePass123',
    description: 'Password containing at least one letter and one number',
  })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  // At least one letter & one digit (simple example)
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/, {
    message: 'password must contain at least one letter and one number',
  })
  password: string;
}
