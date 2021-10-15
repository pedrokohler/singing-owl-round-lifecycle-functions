import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DateTimeService, FirebaseService } from 'src/common';
import { WatcherService } from 'src/services';

describe('WatcherService', () => {
  let service: WatcherService;
  const fakeDateTimeService: Partial<DateTimeService> = {};
  const fakeLogger: Partial<Logger> = {
    setContext: () => {
      return;
    },
  };
  const fakeFirebaseService: Partial<FirebaseService> = {};

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WatcherService,
        {
          provide: DateTimeService,
          useValue: fakeDateTimeService,
        },
        {
          provide: Logger,
          useValue: fakeLogger,
        },
        {
          provide: FirebaseService,
          useValue: fakeFirebaseService,
        },
      ],
    }).compile();

    service = module.get<WatcherService>(WatcherService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
