import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtTokenService } from '../../modules/jwt/jwt-token.service';
import { UserSessionService } from '../../modules/user-session/user-session.service';
import { AuthLoginDto, AuthLoginResponse } from './DTO/auth-login.dto';
import { OnlineCounterResponse } from './DTO/online-counter.dto';

@Injectable()
export class GameApiRoutesService {
  private readonly logger = new Logger(GameApiRoutesService.name);

  constructor(
    private readonly jwtTokenService: JwtTokenService,
    private readonly userSessionService: UserSessionService,
  ) {}

  async authenticateGame(dto: AuthLoginDto): Promise<AuthLoginResponse> {
    this.logger.log(
      `[authenticateGame] Request received - operator: ${dto.operator}, currency: ${dto.currency}, game_mode: ${dto.game_mode}`,
    );
    // TODO: Validate operator (agent_id) against database
    // For now, just accepting the value

    // Verify the incoming JWT token and extract userId and agentId
    let decoded: any;
    try {
      decoded = await this.jwtTokenService.verifyToken(dto.auth_token);
      this.logger.log(
        `[authenticateGame] Token verified successfully - decoded: ${JSON.stringify(decoded)}`,
      );
    } catch (error) {
      this.logger.warn(
        `[authenticateGame] Token verification failed - operator: ${dto.operator}, error: ${error.message}`,
      );
      throw new UnauthorizedException('Invalid auth token');
    }

    // Extract userId and agentId from the decoded token
    const userId = decoded.sub || decoded.userId;
    const agentId = decoded.agentId || dto.operator;

    if (!userId) {
      this.logger.warn(
        `[authenticateGame] No userId found in token - operator: ${dto.operator}`,
      );
      throw new UnauthorizedException('Invalid token: missing userId');
    }

    // Generate new JWT token with userId, agentId, and operator_id
    const newToken = await this.jwtTokenService.signGenericToken(
      {
        sub: userId,
        agentId: agentId,
        operator_id: dto.operator,
        currency: dto.currency,
        game_mode: dto.game_mode,
        timestamp: Date.now(),
      },
      86400, // 24 hours in seconds
    );

    this.logger.log(
      `[authenticateGame] SUCCESS - New token generated for userId: ${userId}, agentId: ${agentId}, operator: ${dto.operator}`,
    );

    // Add user to logged-in sessions
    await this.userSessionService.addSession(userId, agentId);

    // Return response with dummy data as requested
    return {
      success: true,
      result: newToken,
      data: newToken,
      gameConfig: null,
      bonuses: [],
      isLobbyEnabled: false,
      isPromoCodeEnabled: false,
      isSoundEnabled: false,
      isMusicEnabled: false,
    };
  }

  async getOnlineCounter(token: string): Promise<OnlineCounterResponse> {
    this.logger.log(`[getOnlineCounter] Request received`);

    try {
      const decoded = await this.jwtTokenService.verifyToken(token);
      this.logger.log(
        `[getOnlineCounter] Token verified - operator_id: ${decoded['operator_id'] || 'N/A'}`,
      );
    } catch (error) {
      this.logger.warn(
        `[getOnlineCounter] Token verification failed - error: ${error.message}`,
      );
      throw new UnauthorizedException('Invalid or expired token');
    }

    this.logger.log(
      `[getOnlineCounter] SUCCESS - Returning online counter data`,
    );

    const actualLoggedInUsers = await this.userSessionService.getLoggedInUserCount();
    const pumpValue = Math.floor(Math.random() * (15000 - 11000 + 1)) + 11000;
    const total = actualLoggedInUsers + pumpValue;

    this.logger.log(
      `[getOnlineCounter] User count - actual: ${actualLoggedInUsers}, pump: ${pumpValue}, total: ${total}`,
    );

    return {
      "result": {
        "total": total,
        "gameMode": {
          "hamster-run": 321,
          "squid-game": 270,
          "chicken-road-two": 6937,
          "forest-fortune-v1": 161,
          "chicken-royal": 50,
          "chicken-road": 1980,
          "penalty-unlimited": 175,
          "lucky-mines": 43,
          "coinflip": 23,
          "chicken-road-97": 266,
          "diver": 104,
          "twist": 286,
          "tower": 23,
          "chicken-road-zombies": 36,
          "aviafly": 81,
          "chicken-road-two-4ravip": 1,
          "unknown": 4,
          "chicken-road-1xbet": 34,
          "chicken-road-gold": 91,
          "chicken-road-race": 47,
          "wheel": 100,
          "robo-dice": 6,
          "jogo-do-bicho": 6,
          "keno": 6,
          "cricket-road": 25,
          "triple": 17,
          "sugar-daddy": 81,
          "chicken-road-two-v4": 63,
          "fish-road-v1": 17,
          "new-double": 39,
          "bubbles": 10,
          "plinko-aztec": 82,
          "chicken-road-vegas": 90,
          "new-hilo": 10,
          "rabbit-road-inout": 51,
          "stairs": 11,
          "hot-mines": 9,
          "roulette": 25,
          "crash": 24,
          "goblin-tower": 14,
          "chicken-road-v6": 23,
          "plinko": 50,
          "fish-boom": 17,
          "ballonix": 36,
          "chicken-road-two-melbet": 26,
          "limbo": 19,
          "chicken-road-92": 8,
          "twist-topx": 1,
          "joker-poker": 6,
          "cryptos": 5,
          "rock-paper-scissors": 10,
          "chicken-road-two-lucky-star": 6,
          "chicken-road-two-chillbetmx": 0,
          "chicken-road-two-n1bet": 6,
          "chicken-road-two-v2": 12,
          "pengu-sport": 0,
          "plinko-v2": 0,
          "twist-valor": 4,
          "lucky-captain": 2,
          "chicken-road-two-trueluck": 0,
          "rabbit-road": 4,
          "plinko-aztec-v2": 2,
          "chicken-road-two-social": 0,
          "diver-boomerang": 0,
          "chicken-road-two-jeetcity": 0,
          "chicken-road-97-social": 0,
          "twist-v2": 0,
          "twist-v3": 0,
          "twist-new-year": 0,
          "forest-fortune-v1-social": 0,
          "ballonix-social": 0,
          "twist-new-year-v3": 0,
          "penalty-unlimited-social": 0,
          "plinko-aztec-social": 0,
          "hamster-run-social": 0,
          "chicken-road-two-chacha-bet": 0,
          "teenPattyExpress": 0,
          "chicken-road-two-chillbet": 0,
          "twist-new-year-v2": 0,
          "chicken-road-two-v3": 0,
          "chicken-road-easy": 0,
          "diver-fast": 0,
          "joker-poker-social": 0,
          "wheel-social": 0,
          "chicken-road-hard": 0,
          "twist-social": 0,
          "chicken-road-97-easy": 0,
          "chicken-road-97-hard": 0
        }
      }
    }
  }
}
