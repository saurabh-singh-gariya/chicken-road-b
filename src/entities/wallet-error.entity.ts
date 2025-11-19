import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export enum WalletApiAction {
  GET_BALANCE = 'getBalance',
  PLACE_BET = 'placeBet',
  SETTLE_BET = 'settleBet',
}

export enum WalletErrorType {
  NETWORK_ERROR = 'network_error',
  HTTP_ERROR = 'http_error',
  TIMEOUT_ERROR = 'timeout_error',
  INVALID_RESPONSE = 'invalid_response',
  AGENT_REJECTED = 'agent_rejected',
  MALFORMED_RESPONSE = 'malformed_response',
  UNKNOWN_ERROR = 'unknown_error',
}

@Entity()
export class WalletError {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ nullable: false })
  agentId: string;

  @Index()
  @Column({ nullable: false })
  userId: string;

  @Column({ type: 'enum', enum: WalletApiAction, nullable: false })
  apiAction: WalletApiAction;

  @Column({ type: 'enum', enum: WalletErrorType, nullable: false })
  errorType: WalletErrorType;

  @Column({ type: 'text', nullable: true })
  errorMessage: string;

  @Column({ type: 'text', nullable: true })
  errorStack: string;

  @Column({ type: 'json', nullable: true })
  requestPayload: any;

  @Column({ type: 'json', nullable: true })
  responseData: any;

  @Column({ nullable: true })
  httpStatus: number;

  @Column({ nullable: true })
  platformTxId: string;

  @Column({ nullable: true })
  roundId: string;

  @Column('decimal', { precision: 18, scale: 4, nullable: true })
  betAmount: string;

  @Column('decimal', { precision: 18, scale: 4, nullable: true })
  winAmount: string;

  @Column({ length: 4, nullable: true })
  currency: string;

  @Column({ type: 'text', nullable: true })
  callbackUrl: string;

  @Column({ type: 'text', nullable: true })
  rawError: string;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ nullable: true })
  resolved: boolean;

  @Column({ type: 'datetime', precision: 3, nullable: true })
  resolvedAt: Date;

  @Column({ type: 'text', nullable: true })
  resolutionNotes: string;
}

