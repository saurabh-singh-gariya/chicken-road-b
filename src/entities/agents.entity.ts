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

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ nullable: true })
  createdBy?: string;

  @Column({ nullable: true })
  updatedBy?: string;
}
