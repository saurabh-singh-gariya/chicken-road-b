import { Game } from "../../entities/game.entity";
import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

@Injectable()
export class GameService {
    constructor(
        @InjectRepository(Game)
        private readonly gameRepository: Repository<Game>,
    ) { }

    async getGame(gameCode: string): Promise<Game> {
        const game = await this.gameRepository.findOne({ where: { gameCode } })
        if (!game) {
            throw new NotFoundException(`Game with code ${gameCode} not found`)
        }
        return game
    }

    async validateGame(gameCode: string): Promise<void> {
        const game = await this.getGame(gameCode)
        if (!game) {
            throw new NotFoundException(`Game with code ${gameCode} not found`)
        }
        if (!game.isActive) {
            throw new NotFoundException(`Game with code ${gameCode} is not active`)
        }
    }

    async getActiveGames(): Promise<Game[]> {
        const games = await this.gameRepository.find()
        return games
    }

    async getGamePayloads(gameCode: string): Promise<{
        gameCode: string;
        gameName: string;
        platform: string;
        gameType: string;
        settleType: string;
    }> {
        const game = await this.getGame(gameCode)
        return {
            gameCode: game.gameCode,
            gameName: game.gameName,
            platform: game.platform,
            gameType: game.gameType,
            settleType: game.settleType,
        }
    }
}