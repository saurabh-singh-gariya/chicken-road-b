import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity()
export class GameConfig {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  key: string;

  @Column({ type: 'json' })
  value: any;

  @UpdateDateColumn()
  updatedAt: Date;
}
