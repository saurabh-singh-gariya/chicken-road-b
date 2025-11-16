import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './User.entity';

@Entity()
export class GameSession {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User)
  user: User;

  @Column()
  serverSeed: string;

  @Column()
  difficulty: string;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  betAmount: string;

  @Column({ type: 'decimal', precision: 18, scale: 2, nullable: true })
  winAmount: string;

  @Column({ default: 'active' })
  status: 'active' | 'finished' | 'cashed_out';

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  endedAt: Date;
}
