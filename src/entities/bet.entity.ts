import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum BetStatus {
  PLACED = 'placed',
  PENDING_SETTLEMENT = 'pending_settlement',
  WON = 'won',
  LOST = 'lost',
  CANCELLED = 'cancelled',
  REFUNDED = 'refunded',
  SETTLEMENT_FAILED = 'settlement_failed',
}

export enum Difficulty {
  EASY = 'EASY',
  MEDIUM = 'MEDIUM',
  HARD = 'HARD',
  DAREDEVIL = 'DAREDEVIL',
}

@Entity()
export class Bet {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ nullable: false })
  externalPlatformTxId: string;

  @Index()
  @Column({ nullable: false })
  userId: string;

  // Round identifier (from agent payload / internal game engine)
  @Index()
  @Column({ nullable: false })
  roundId: string;

  // Difficulty chosen by player at placement
  @Column({ type: 'enum', enum: Difficulty })
  difficulty: Difficulty;

  // Bet type (nullable, varies by game – can hold e.g. Banker/WALA etc.)
  @Column({ nullable: true, length: 50 })
  betType?: string;

  // Monetary amounts
  @Column('decimal', { precision: 18, scale: 3 })
  betAmount: string;

  @Column('decimal', { precision: 18, scale: 3, nullable: true })
  winAmount?: string; // populated after settlement (0 if lost)

  @Column({ length: 4 })
  currency: string;

  @Column({ type: 'enum', enum: BetStatus, default: BetStatus.PLACED })
  status: BetStatus;

  @Column({ nullable: true })
  settlementRefTxId?: string;

  @Column({ default: false })
  isPremium?: boolean;

  // MySQL datetime with fractional seconds (3 = milliseconds) to preserve ISO8601 precision
  @Column({ type: 'datetime', precision: 3, nullable: true })
  betPlacedAt?: Date;

  @Column({ type: 'datetime', precision: 3, nullable: true })
  settledAt?: Date;

  @Index()
  @Column({ length: 64, nullable: false })
  gameCode: string;

  @Column({ type: 'text', nullable: true })
  gameInfo?: string;

  @Column('decimal', { precision: 18, scale: 3, nullable: true })
  balanceAfterBet?: string;

  @Column('decimal', { precision: 18, scale: 3, nullable: true })
  balanceAfterSettlement?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ nullable: true })
  createdBy?: string;

  @Column({ nullable: true })
  updatedBy?: string;

  @Column({ nullable: false, length: 64 })
  operatorId: string;

  @Column('decimal', { precision: 18, scale: 3, nullable: true })
  finalCoeff?: string;

  @Column('decimal', { precision: 18, scale: 3, nullable: true })
  withdrawCoeff?: string;

  @Column({ type: 'json', nullable: true })
  fairnessData?: {
    decimal?: string;
    clientSeed?: string;
    serverSeed?: string;
    combinedHash?: string;
    hashedServerSeed?: string;
  };
}
