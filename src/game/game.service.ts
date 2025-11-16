// import { Injectable, Logger } from '@nestjs/common';
// import { randomBytes } from 'crypto';
// import { GameConfigService } from '../modules/gameConfig/game-config.service';
// import { Difficulty } from '../modules/gamePlay/DTO/bet-payload.dto';

// interface GameSession {
//   userId: string;
//   difficulty: Difficulty;
//   serverSeed: string;
//   columnMultipliers: number[];
//   currentStep: number;
//   winAmount: number;
//   betAmount: number;
//   isActive: boolean;
//   isWin: boolean;
//   collisionColumns?: number[];
// }

// interface StepResponse {
//   isFinished: boolean;
//   isWin: boolean;
//   lineNumber: number;
//   winAmount: number;
//   betAmount: number;
//   coeff: number;
//   difficulty: Difficulty;
//   endReason?: 'win' | 'cashout' | 'hazard';
//   collisionPositions?: number[];
// }

// @Injectable()
// export class GameService {
//   private readonly logger = new Logger(GameService.name);

//   private totalColumns = 15;

//   private difficultyHazards = {
//     [Difficulty.EASY]: 3,
//     [Difficulty.MEDIUM]: 4,
//     [Difficulty.HARD]: 5,
//     [Difficulty.DAREDEVIL]: 7,
//   };

//   constructor(private readonly gameConfigService: GameConfigService) {}

//   // In-memory session store for scratch-level implementation
//   private sessions = new Map<string, GameSession>();

//   private generateServerSeed(): string {
//     return randomBytes(16).toString('hex');
//   }

//   private sendStepResponse(
//     isActive: boolean,
//     isWin: boolean,
//     currentStep: number,
//     winAmount: number,
//     betAmount: number,
//     multiplier: number,
//     difficulty: Difficulty,
//     endReason?: 'win' | 'cashout' | 'hazard',
//     collisionColumns?: number[],
//   ): StepResponse {
//     // Ensure winAmount is formatted to 2 decimal places before sending
//     const roundedWin = this.round2(winAmount);
//     return {
//       isFinished: !isActive,
//       isWin,
//       lineNumber: currentStep,
//       winAmount: roundedWin,
//       betAmount,
//       coeff: multiplier,
//       difficulty,
//       endReason,
//       collisionPositions: collisionColumns,
//     };
//   }

//   private round2(value: number): number {
//     // Use toFixed then Number to avoid binary float artifacts in UI and DB logging
//     return Number(Number(value).toFixed(2));
//   }

//   // Scratch-level: no wallet or transaction handling.

//   async placeBet(
//     userId: string,
//     betAmount: number,
//     difficulty: Difficulty,
//   ): Promise<StepResponse> {
//     let columnMultipliers =
//       await this.gameConfigService.getConfig('coefficients');
//     try {
//       const columnMultipliersData = columnMultipliers[difficulty];
//       columnMultipliers = columnMultipliersData.map((val: string) =>
//         parseFloat(val),
//       );
//     } catch (e) {
//       this.logger.error(
//         `Failed to parse column multipliers from config`,
//         e as any,
//       );
//       let finalMultipliers = {
//         [Difficulty.EASY]: 19.44,
//         [Difficulty.MEDIUM]: 1788.8,
//         [Difficulty.HARD]: 41321.43,
//         [Difficulty.DAREDEVIL]: 2542251.93,
//       };
//       columnMultipliers = generateColumnMultipliers(
//         finalMultipliers[difficulty],
//         this.totalColumns,
//       );
//     }
//     const serverSeed = this.generateServerSeed();

//     const gameSession: GameSession = {
//       userId,
//       difficulty,
//       serverSeed,
//       columnMultipliers,
//       currentStep: -1,
//       winAmount: this.round2(betAmount),
//       betAmount,
//       isActive: true,
//       isWin: false,
//     };
//     this.sessions.set(userId, gameSession);
//     this.logger.log(
//       `Game started for user ${userId} with difficulty ${difficulty}`,
//     );
//     const currentMultiplier =
//       gameSession.currentStep >= 0
//         ? gameSession.columnMultipliers[gameSession.currentStep]
//         : 1;

//     return this.sendStepResponse(
//       gameSession.isActive,
//       gameSession.isWin,
//       gameSession.currentStep,
//       gameSession.winAmount,
//       gameSession.betAmount,
//       currentMultiplier,
//       gameSession.difficulty,
//     );
//   }

//   async step(userId: string, lineNumber: number): Promise<StepResponse | null> {
//     const gameSession = this.sessions.get(userId);

//     if (!gameSession || !gameSession.isActive) {
//       this.logger.warn(`Invalid game session for user ${userId}`);
//       return null;
//     }

//     if (lineNumber !== gameSession.currentStep + 1) {
//       this.logger.error(`Invalid line number for user ${userId}`);
//       throw new Error('Invalid Step number');
//     }

//     let endReason: 'win' | 'cashout' | 'hazard' | undefined;
//     let hazardColumns: number[] = [];
//     if (lineNumber > 0 && lineNumber == this.totalColumns - 1) {
//       // Final step reached – auto win condition
//       gameSession.currentStep++;
//       gameSession.winAmount = this.round2(
//         gameSession.betAmount *
//           gameSession.columnMultipliers[gameSession.currentStep],
//       );
//       gameSession.isActive = false;
//       gameSession.isWin = true;
//       endReason = 'win';
//       this.logger.log(`User ${userId} reached the FINAL step and WON`);
//     } else {
//       const hazardCount = await this.getHazardCountConfig(
//         gameSession.difficulty,
//       );
//       // Simple pseudo-random hazard generation for scratch level
//       hazardColumns = [];
//       while (hazardColumns.length < hazardCount) {
//         const pos = Math.floor(Math.random() * this.totalColumns);
//         if (!hazardColumns.includes(pos)) hazardColumns.push(pos);
//       }

//       const hitHazard = hazardColumns.includes(lineNumber);

//       if (!hitHazard) {
//         gameSession.currentStep++;
//         gameSession.winAmount = this.round2(
//           gameSession.betAmount *
//             gameSession.columnMultipliers[gameSession.currentStep],
//         );

//         this.logger.log(
//           `User ${userId} moved to step ${gameSession.currentStep}`,
//         );
//       } else {
//         gameSession.isActive = false;
//         gameSession.isWin = false;
//         gameSession.winAmount = 0;
//         gameSession.collisionColumns = hazardColumns;
//         gameSession.currentStep = lineNumber;
//         endReason = 'hazard';
//       }
//     }
//     this.sessions.set(userId, gameSession);
//     this.logger.log(`Step ${lineNumber} processed for user ${userId}`);
//     const currentMultiplier =
//       gameSession.currentStep >= 0
//         ? gameSession.columnMultipliers[gameSession.currentStep]
//         : 0;

//     if (endReason === 'hazard') {
//       return this.sendStepResponse(
//         gameSession.isActive,
//         gameSession.isWin,
//         gameSession.currentStep,
//         this.round2(gameSession.winAmount),
//         gameSession.betAmount,
//         currentMultiplier,
//         gameSession.difficulty,
//         endReason,
//         hazardColumns,
//       );
//     }
//     return this.sendStepResponse(
//       gameSession.isActive,
//       gameSession.isWin,
//       gameSession.currentStep,
//       this.round2(gameSession.winAmount),
//       gameSession.betAmount,
//       currentMultiplier,
//       gameSession.difficulty,
//       endReason,
//     );
//   }

//   async cashOut(userId: string): Promise<StepResponse | null> {
//     const gameSession = this.sessions.get(userId);

//     if (!gameSession || !gameSession.isActive) {
//       this.logger.warn(`Invalid game session for user ${userId}`);
//       return null;
//     }

//     // Increment nonce for cashout randomness accounting (even if not used for RNG now, keeps sequence consistent)
//     gameSession.isActive = false;
//     const reachedFinal = gameSession.currentStep === this.totalColumns - 1;
//     gameSession.isWin = reachedFinal;
//     const endReason: 'cashout' | 'win' = reachedFinal ? 'win' : 'cashout';

//     this.sessions.set(userId, gameSession);
//     this.logger.log(`User ${userId} cashed out`);
//     const currentMultiplier =
//       gameSession.currentStep >= 0
//         ? gameSession.columnMultipliers[gameSession.currentStep]
//         : 1;
//     return this.sendStepResponse(
//       gameSession.isActive,
//       gameSession.isWin,
//       gameSession.currentStep,
//       this.round2(gameSession.winAmount),
//       gameSession.betAmount,
//       currentMultiplier,
//       gameSession.difficulty,
//       endReason,
//     );
//   }

//   private async getGameSession(userId: string): Promise<GameSession | null> {
//     const gameSession = this.sessions.get(userId);
//     if (!gameSession) {
//       this.logger.warn(`No active game session for user ${userId}`);
//       return null;
//     }
//     return gameSession;
//   }

//   async getActiveSession(userId: string): Promise<StepResponse | null> {
//     const gameSession = await this.getGameSession(userId);
//     if (!gameSession) {
//       this.logger.warn(`No active game session for user ${userId}`);
//       return null;
//     }
//     return this.sendStepResponse(
//       gameSession.isActive,
//       gameSession.isWin,
//       gameSession.currentStep,
//       this.round2(gameSession.winAmount),
//       gameSession.betAmount,
//       gameSession.currentStep >= 0
//         ? gameSession.columnMultipliers[gameSession.currentStep]
//         : 1,
//       gameSession.difficulty,
//     );
//   }

//   private async getHazardCountConfig(difficulty: Difficulty): Promise<number> {
//     //get from cache or db
//     const gameConfig = await this.gameConfigService.getConfig('gameConfig');
//     try {
//       const hazardData = gameConfig.hazards;
//       return hazardData[difficulty];
//     } catch (e) {
//       this.logger.error(`Failed to parse hazard counts from config`, e as any);
//       return this.difficultyHazards[difficulty];
//     }
//   }
// }
