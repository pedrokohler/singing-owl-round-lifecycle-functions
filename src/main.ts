import { NestFactory } from '@nestjs/core';
import { LoggingWinston } from '@google-cloud/logging-winston';
import * as functions from 'firebase-functions';
import { WinstonModule } from 'nest-winston';
import winston from 'winston';
import * as dotenv from 'dotenv';

import { AppModule } from './app.module';
import { WatcherService, ControllerService } from './services';
import { Configuration } from './common';
import { Message } from 'firebase-functions/lib/providers/pubsub';
import IControllerMessagePayload from './interfaces/controller-message-payload.interface';

dotenv.config();

class Main {
  private readonly builder: functions.FunctionBuilder;
  private readonly environment: string;
  private readonly watcherUnixCrontabSchedule: string;
  private readonly minimumLevel: string;
  private readonly timezone: string;
  private readonly controllerEntryPoint: string;
  constructor() {
    const envs = Configuration.envs();
    this.builder = functions.region(envs.gcp.region);
    this.environment = envs.environment;
    this.watcherUnixCrontabSchedule =
      envs.gcp.scheduler.watcherUnixCrontabSchedule;
    this.minimumLevel = envs.gcp.loggingLevel;
    this.timezone = envs.timezone;
    this.controllerEntryPoint = envs.gcp.pubsub.roundLifecycleControllerTopic;
  }

  get controller() {
    return this.builder.pubsub
      .topic(this.controllerEntryPoint)
      .onPublish(this.runControllerService.bind(this));
  }

  get watcher() {
    return this.builder.pubsub
      .schedule(this.watcherUnixCrontabSchedule)
      .timeZone(this.timezone)
      .onRun(this.runWatcherService.bind(this));
  }

  async runControllerService(message: Message) {
    const payload = message.json as IControllerMessagePayload;
    const loggingWinston = new LoggingWinston();
    const app = await NestFactory.createApplicationContext(AppModule, {
      logger: WinstonModule.createLogger({
        level: this.minimumLevel,
        transports: [new winston.transports.Console(), loggingWinston],
      }),
    });
    const service = app.get(ControllerService);
    await service.execute(payload);
  }

  async runWatcherService() {
    const loggingWinston = new LoggingWinston();
    const app = await NestFactory.createApplicationContext(AppModule, {
      logger: WinstonModule.createLogger({
        level: this.minimumLevel,
        transports: [new winston.transports.Console(), loggingWinston],
      }),
    });
    const service = app.get(WatcherService);
    await service.execute();
  }

  get controllerTriggerMock() {
    if (this.environment === 'Development') {
      const defaultPayload = {
        groupId: 'P5VXjV8JtMqWQVr0Sec8',
        roundId: '6gVrRAesvCxWZqbdca1z',
      };

      return this.builder.https.onRequest(async (req, res) => {
        const { group, round } = req.query;
        const payload =
          group && round ? { groupId: group, roundId: round } : defaultPayload;
        console.log(payload);
        const message = new Message({ json: payload });
        await this.runControllerService(message);
        res.sendStatus(200);
      });
    }
    return null;
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
