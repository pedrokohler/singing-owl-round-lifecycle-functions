import { Module, Logger } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ControllerService, WatcherService, ScoreService } from './services';
import { DateTimeService, FirebaseService, Configuration } from './common';
@Module({
  imports: [
    ConfigModule.forRoot({
      load: [Configuration.envs],
      isGlobal: true,
    }),
  ],
  providers: [
    WatcherService,
    ControllerService,
    ScoreService,
    Logger,
    DateTimeService,
    FirebaseService,
  ],
})
export class AppModule {}
