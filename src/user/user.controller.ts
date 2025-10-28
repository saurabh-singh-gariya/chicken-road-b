import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserService } from './user.service';

@ApiTags('user')
@ApiBearerAuth('access-token')
@Controller('api/v1/users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new user' })
  @ApiResponse({
    status: 201,
    description: 'User created',
    schema: {
      example: { id: 'uuid', name: 'PlayerOne', avatar: 'https://...' },
    },
  })
  create(@Body() dto: CreateUserDto) {
    return this.userService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all users' })
  @ApiResponse({
    status: 200,
    description: 'Array of users',
    schema: {
      example: [{ id: 'uuid', name: 'PlayerOne', avatar: 'https://...' }],
    },
  })
  findAll() {
    return this.userService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a user by id' })
  @ApiParam({ name: 'id', description: 'UUID of the user' })
  @ApiResponse({
    status: 200,
    description: 'User object',
    schema: {
      example: { id: 'uuid', name: 'PlayerOne', avatar: 'https://...' },
    },
  })
  findOne(@Param('id') id: string) {
    return this.userService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a user' })
  @ApiParam({ name: 'id', description: 'UUID of the user' })
  @ApiResponse({
    status: 200,
    description: 'Updated user',
    schema: {
      example: { id: 'uuid', name: 'PlayerOne', avatar: 'https://...' },
    },
  })
  update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.userService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a user' })
  @ApiParam({ name: 'id', description: 'UUID of the user' })
  @ApiResponse({
    status: 200,
    description: 'Deletion result',
    schema: { example: { deleted: true } },
  })
  remove(@Param('id') id: string) {
    return this.userService.remove(id);
  }
}
