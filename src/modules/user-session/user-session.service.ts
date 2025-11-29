import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class UserSessionService {
  private readonly logger = new Logger(UserSessionService.name);
  private readonly SESSION_KEY = 'loggedInUsers:set';

  constructor(private readonly redisService: RedisService) {}

  async addSession(userId: string, agentId: string): Promise<void> {
    const sessionId = `${userId}:${agentId}`;
    const client = this.redisService.getClient();
    const ttl = await this.redisService.getSessionTTL();
    
    const added = await client.sadd(this.SESSION_KEY, sessionId);
    await client.expire(this.SESSION_KEY, ttl);
    
    this.logger.log(`Added session: ${sessionId} (was new: ${added === 1})`);
  }

  async removeSession(userId: string, agentId: string): Promise<void> {
    const sessionId = `${userId}:${agentId}`;
    const client = this.redisService.getClient();
    
    await client.srem(this.SESSION_KEY, sessionId);
    
    this.logger.debug(`Removed session: ${sessionId}`);
  }

  async removeSessions(userIds: string[], agentId: string): Promise<void> {
    if (userIds.length === 0) return;
    
    const client = this.redisService.getClient();
    const sessionIds = userIds.map(userId => `${userId}:${agentId}`);
    
    await client.srem(this.SESSION_KEY, ...sessionIds);
    
    this.logger.debug(`Removed ${sessionIds.length} sessions for agentId: ${agentId}`);
  }

  async getLoggedInUserCount(): Promise<number> {
    const client = this.redisService.getClient();
    const count = await client.scard(this.SESSION_KEY);
    this.logger.debug(`Logged-in user count: ${count}`);
    return count || 0;
  }
}

