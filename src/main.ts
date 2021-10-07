import { NestFactory } from '@nestjs/core';
import { LoggingWinston } from '@google-cloud/logging-winston';
import * as functions from 'firebase-functions';
import { WinstonModule } from 'nest-winston';
import winston from 'winston';
import * as dotenv from 'dotenv';

import { AppModule } from './app.module';
import { AppService } from './services';
import { Configuration } from './common';

dotenv.config();

class Main {
  private readonly builder: functions.FunctionBuilder;
  private readonly environment: string;
  private readonly unixCrontabSchedule: string;
  private readonly minimumLevel: string;
  private readonly timezone: string;
  constructor() {
    const envs = Configuration.envs();
    this.builder = functions.region(envs.gcp.region);
    this.environment = envs.environment;
    this.unixCrontabSchedule = envs.gcp.pubsub.unixCrontabSchedule;
    this.minimumLevel = envs.gcp.loggingLevel;
    this.timezone = envs.timezone;
  }

  get watcher() {
    return this.builder.pubsub
      .schedule(this.unixCrontabSchedule)
      .timeZone(this.timezone)
      .onRun(this.runWatcherService);
  }

  async runWatcherService() {
    const loggingWinston = new LoggingWinston();
    const app = await NestFactory.createApplicationContext(AppModule, {
      logger: WinstonModule.createLogger({
        level: this.minimumLevel,
        transports: [new winston.transports.Console(), loggingWinston],
      }),
    });
    const service = app.get(AppService);
    await service.execute();
  }

  get watcherTriggerMock() {
    if (this.environment === 'Development') {
      return this.builder.https.onRequest(async (req, res) => {
        await this.runWatcherService();
        res.sendStatus(200);
      });
    }
    return null;
  }
}

export default new Main();
