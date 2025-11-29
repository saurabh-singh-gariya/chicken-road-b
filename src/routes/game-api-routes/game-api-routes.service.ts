import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { GameConfigService } from '../../modules/gameConfig/game-config.service';
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
    private readonly gameConfigService: GameConfigService,
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
    const pumpValue = await this.gameConfigService.getOnlineCounterPumpValue();
    const total = Math.max(actualLoggedInUsers, actualLoggedInUsers + pumpValue);
    
    this.logger.log(
      `[getOnlineCounter] User count - actual: ${actualLoggedInUsers}, pump: ${pumpValue}, total: ${total}`,
    );
    
    return {
      result: {
        total: total,
        gameMode: {
          'chicken-road-two': 7526,
          'sugar-daddy': 143,
          'chicken-road': 2493,
          plinko: 55,
          'penalty-unlimited': 180,
          twist: 325,
          'squid-game': 346,
          'chicken-road-gold': 98,
          'hamster-run': 82,
          'chicken-road-97': 222,
          wheel: 121,
          'forest-fortune-v1': 158,
          coinflip: 23,
          'joker-poker': 13,
          aviafly: 112,
          'chicken-road-two-v2': 3,
          'chicken-road-1xbet': 34,
          ballonix: 34,
          'plinko-v2': 0,
          roulette: 43,
          diver: 92,
          'new-hilo': 9,
          'chicken-road-zombies': 61,
          'new-double': 44,
          unknown: 0,
          crash: 33,
          keno: 8,
          limbo: 16,
          'chicken-road-vegas': 121,
          stairs: 16,
          'lucky-mines': 48,
          'fish-road-v1': 51,
          'chicken-royal': 67,
          'rabbit-road-inout': 50,
          'plinko-aztec': 79,
          'hot-mines': 14,
          'goblin-tower': 16,
          tower: 24,
          'robo-dice': 4,
          'rock-paper-scissors': 6,
          'chicken-road-two-lucky-star': 5,
          'chicken-road-two-melbet': 12,
          'rabbit-road': 1,
          bubbles: 11,
          triple: 12,
          'chicken-road-two-4ravip': 1,
          cryptos: 3,
          'chicken-road-two-chillbet': 0,
          'jogo-do-bicho': 9,
          'chicken-road-92': 11,
          'twist-topx': 2,
          'plinko-aztec-v2': 1,
          'fish-boom': 0,
          'chicken-road-v6': 37,
          'chicken-road-two-v4': 74,
          'lucky-captain': 0,
          'diver-boomerang': 0,
          'chicken-road-two-chillbetmx': 1,
          'chicken-road-two-trueluck': 1,
          'chicken-road-two-jeetcity': 0,
          'chicken-road-two-social': 0,
          'wheel-social': 0,
          'twist-v2': 0,
          'battle-trades': 0,
          'ballonix-social': 0,
          'penalty-unlimited-social': 0,
          'chicken-road-two-v7': 0,
          'forest-fortune-v3': 0,
          'twist-v4': 0,
          'chicken-road-97-social': 0,
          'squid-game-v4': 0,
          'forest-fortune-v1-social': 0,
          'twist-social': 0,
          'hamster-run-social': 0,
          'joker-poker-social': 0,
          'squid-game-v2': 0,
          'plinko-aztec-social': 0,
          'chicken-road-two-v3': 0,
        },
      },
    };
  }
}
