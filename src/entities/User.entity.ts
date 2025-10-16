import {
  Column,
  Entity,
  JoinColumn,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Wallet } from './Wallet.entity';
import { GameHistory } from './game-history.entity';
import { GameSession } from './game-session.entity';

@Entity()
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  name: string;

  @Column()
  avatar: string;

  @OneToOne(() => Wallet, (wallet) => wallet.user)
  @JoinColumn()
  wallet: Wallet;

  @OneToMany(() => GameSession, (session) => session.user)
  sessions: GameSession[];

  @OneToMany(() => GameHistory, (history) => history.user)
  histories: GameHistory[];
}
