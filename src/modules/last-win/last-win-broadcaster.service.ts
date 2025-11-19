import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Server } from 'socket.io';

interface LastWinData {
  username: string;
  avatar: string | null;
  countryCode: string;
  winAmount: string;
  currency: string;
}

@Injectable()
export class LastWinBroadcasterService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LastWinBroadcasterService.name);
  private intervalId: NodeJS.Timeout | null = null;
  private server: Server | null = null;
  private currentIndex = 0;

  // Hardcoded array of last win data
  private readonly lastWinData: LastWinData[] = [
    {
      username: 'Tan Supposed Meadowlark',
      avatar: null,
      countryCode: 'PK',
      winAmount: '312.00',
      currency: 'USD',
    },
    {
      username: 'Salmon Delighted Loon',
      avatar: null,
      countryCode: 'IN',
      winAmount: '306.00',
      currency: 'USD',
    },
    {
      username: 'Swift Golden Falcon',
      avatar: null,
      countryCode: 'US',
      winAmount: '450.50',
      currency: 'USD',
    },
    {
      username: 'Bold Crimson Tiger',
      avatar: null,
      countryCode: 'UK',
      winAmount: '289.75',
      currency: 'GBP',
    },
    {
      username: 'Clever Azure Dolphin',
      avatar: null,
      countryCode: 'CA',
      winAmount: '523.25',
      currency: 'CAD',
    },
    {
      username: 'Noble Silver Wolf',
      avatar: null,
      countryCode: 'AU',
      winAmount: '678.90',
      currency: 'AUD',
    },
    {
      username: 'Brave Emerald Eagle',
      avatar: null,
      countryCode: 'DE',
      winAmount: '412.30',
      currency: 'EUR',
    },
    {
      username: 'Wise Amber Bear',
      avatar: null,
      countryCode: 'JP',
      winAmount: '1250.00',
      currency: 'JPY',
    },
  ];

  setServer(server: Server) {
    this.server = server;
  }

  onModuleInit() {
    this.logger.log('LastWinBroadcasterService initialized');
  }

  onModuleDestroy() {
    this.stopBroadcasting();
  }

  startBroadcasting(server: Server) {
    if (this.intervalId) {
      this.logger.warn('Broadcasting already started');
      return;
    }

    this.server = server;
    this.logger.log('Starting last-win broadcasting (every 5 seconds)');

    // Broadcast immediately on start
    this.broadcastNext();

    // Then broadcast every 5 seconds
    this.intervalId = setInterval(() => {
      this.broadcastNext();
    }, 5000);
  }

  stopBroadcasting() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      this.logger.log('Stopped last-win broadcasting');
    }
  }

  private broadcastNext() {
    if (!this.server) {
      this.logger.warn('Server not set, cannot broadcast');
      return;
    }

    // Get next win data (cycle through array)
    const winData = this.lastWinData[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % this.lastWinData.length;

    // Broadcast to all connected clients
    this.server.emit('gameService-last-win', winData);

    this.logger.debug(
      `Broadcasted last-win: ${winData.username} won ${winData.winAmount} ${winData.currency}`,
    );
  }

  // Method to add more win data dynamically (optional)
  addWinData(data: LastWinData) {
    this.lastWinData.push(data);
    this.logger.log(`Added new win data for ${data.username}`);
  }
}

