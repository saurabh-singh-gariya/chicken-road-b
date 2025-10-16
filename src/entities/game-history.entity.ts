import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  OneToOne,
} from 'typeorm';
import { User } from './User.entity';
import { GameSession } from './game-session.entity';

@Entity()
export class GameHistory {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User)
  user: User;

  @OneToOne(() => GameSession, (session) => session.history)
  session: GameSession;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  amount: string;

  @Column({ type: 'decimal', precision: 8, scale: 2 })
  multiplier: string;

  @Column()
  isWin: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
