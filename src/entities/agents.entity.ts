import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity()
export class Agents {
  @PrimaryColumn()
  agentId: string;

  @Column({ nullable: false })
  cert: string;

  @Column({ nullable: false })
  agentIPaddress: string;

  @Column({ nullable: false })
  callbackURL: string;

  @Column({ default: true })
  isWhitelisted: boolean;

  @Column({ type: 'json', nullable: true})
  allowedGameCodes?: string[];

  @Column({ name: 'password_hash' })
  passwordHash: string;

  @Column({ nullable: true })
  currency?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ nullable: true })
  createdBy?: string;

  @Column({ nullable: true })
  updatedBy?: string;
}
