import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class RegisterAdminDto {
  @IsString()
  @MinLength(3)
  @MaxLength(32)
  username: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  // At least one letter & one digit (simple example)
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/, {
    message: 'password must contain at least one letter and one number',
  })
  password: string;
}
