import { Module, Logger } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppService } from './services';
import { DateTimeService, FirebaseService, Configuration } from './common';

@Module({
  imports: [
    ConfigModule.forRoot({
      load: [Configuration.envs],
      isGlobal: true,
    }),
  ],
  providers: [AppService, Logger, DateTimeService, FirebaseService],
})
export class AppModule {}
