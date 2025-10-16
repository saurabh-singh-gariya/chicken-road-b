import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { Admin } from '../entities/admin.entity';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(Admin) private readonly adminRepo: Repository<Admin>,
    private readonly jwt: JwtService,
  ) {}

  private readonly logger = new Logger(AuthService.name);

  async validateUser(username: string, password: string): Promise<Admin> {
    const admin = await this.adminRepo.findOne({ where: { username } });
    if (!admin || !admin.passwordHash) {
      this.logger.warn(`Login failed (user not found) username=${username}`);
      throw new UnauthorizedException('Invalid credentials');
    }
    const ok = await bcrypt.compare(password, admin.passwordHash);
    if (!ok) {
      this.logger.warn(`Login failed (bad password) username=${username}`);
      throw new UnauthorizedException('Invalid credentials');
    }
    this.logger.log(`Login success username=${username} id=${admin.id}`);
    return admin;
  }

  async generateToken(admin: Admin) {
    const payload = { sub: admin.id, username: admin.username };
    const accessToken = await this.jwt.signAsync(payload);
    this.logger.debug(`Issued token sub=${admin.id}`);
    return {
      accessToken,
      tokenType: 'Bearer',
    };
  }

  async createAdmin(username: string, password: string) {
    const existing = await this.adminRepo.findOne({ where: { username } });
    if (existing) {
      this.logger.warn(`Register conflict username=${username}`);
      throw new ConflictException('Username already taken');
    }
    try {
      const passwordHash = await bcrypt.hash(password, 12);
      const admin = this.adminRepo.create({ username, passwordHash });
      const saved = await this.adminRepo.save(admin);
      this.logger.log(`Admin created username=${username} id=${saved.id}`);
      return saved;
    } catch (err: any) {
      // Handle unique constraint race condition
      if (err?.code === 'ER_DUP_ENTRY' || err?.errno === 1062) {
        this.logger.warn(`Register race duplicate username=${username}`);
        throw new ConflictException('Username already taken');
      }
      this.logger.error(
        `Register failed username=${username} err=${err?.code || err?.message}`,
      );
      throw new InternalServerErrorException('Unable to create admin');
    }
  }
}
