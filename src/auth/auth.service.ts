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
import { User } from '../entities/User.entity';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(Admin) private readonly adminRepo: Repository<Admin>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
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

  // PLAYER AUTH SECTION --------------------------------------------------

  async validatePlayer(username: string, password: string): Promise<User> {
    const user = await this.userRepo.findOne({ where: { name: username } });
    if (!user || !user.passwordHash) {
      this.logger.warn(`Player login failed (not found) username=${username}`);
      throw new UnauthorizedException('Invalid credentials');
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      this.logger.warn(
        `Player login failed (bad password) username=${username}`,
      );
      throw new UnauthorizedException('Invalid credentials');
    }
    this.logger.log(`Player login success username=${username} id=${user.id}`);
    return user;
  }

  async createPlayer(username: string, password: string, avatar: string) {
    const existing = await this.userRepo.findOne({ where: { name: username } });
    if (existing) {
      this.logger.warn(`Player register conflict username=${username}`);
      throw new ConflictException('Username already taken');
    }
    try {
      const passwordHash = await bcrypt.hash(password, 12);
      const user = this.userRepo.create({
        name: username,
        passwordHash,
        avatar,
      });
      const saved = await this.userRepo.save(user);
      this.logger.log(`Player created username=${username} id=${saved.id}`);
      return saved;
    } catch (err: any) {
      if (err?.code === 'ER_DUP_ENTRY' || err?.errno === 1062) {
        this.logger.warn(`Player register duplicate username=${username}`);
        throw new ConflictException('Username already taken');
      }
      this.logger.error(
        `Player register failed username=${username} err=${err?.code || err?.message}`,
      );
      throw new InternalServerErrorException('Unable to create user');
    }
  }

  async generatePlayerToken(user: User) {
    const payload = { sub: user.id, username: user.name, type: 'player' };
    const accessToken = await this.jwt.signAsync(payload);
    this.logger.debug(`Issued player token sub=${user.id}`);
    return { accessToken, tokenType: 'Bearer' };
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
