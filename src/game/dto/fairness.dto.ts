import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, Length } from 'class-validator';

export class GetGameSeedsDto {
  // no payload necessary, kept for potential future filters
}

export class SetUserSeedDto {
  @ApiProperty({
    description:
      'Desired user seed (hex or alphanumeric). If omitted or too short, server will generate one.',
    example: 'abcd1234ef98',
    required: false,
  })
  @IsOptional()
  @IsString()
  @Length(4, 128)
  userSeed?: string;
}

export class RevealServerSeedDto {
  // Might later include session identifier; for now blank
}

export class GameSeedsResponseDto {
  @ApiProperty({ example: '109ff4d973030c1f' })
  userSeed!: string;

  @ApiProperty({ example: 'ee7812710c3ab9b4960f0b304d3e68b8f216370bbb167d5' })
  currentServerSeedHash!: string;

  @ApiProperty({
    example: 'f506b5ea7c79d9f3b67850eb67d67d4931993699fd87bcdb71a412c3b692d7ec',
  })
  nextServerSeedHash!: string;

  @ApiProperty({
    example: '3',
    description: 'Nonce as string per UI numeric serialization rule',
  })
  nonce!: string;
}

export class RevealServerSeedResponseDto {
  @ApiProperty({ example: '109ff4d973030c1f' })
  userSeed!: string;

  @ApiProperty({ example: 'abcd1234ef567890' })
  serverSeed!: string;

  @ApiProperty({ example: 'ee7812710c3ab9b4960f0b304d3e68b8f216370bbb167d5' })
  serverSeedHash!: string;

  @ApiProperty({
    example: '7',
    description: 'Final nonce as string per UI numeric serialization rule',
  })
  finalNonce!: string;
}
