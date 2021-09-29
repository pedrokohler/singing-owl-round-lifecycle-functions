import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DateTime } from 'luxon';

@Injectable()
export class DateTimeService {
  private readonly timezone: string;
  constructor(private readonly configService: ConfigService) {
    this.timezone = this.configService.get('timezone');
  }

  get current() {
    return DateTime.now().setZone(this.timezone);
  }

  get utc() {
    return DateTime.utc();
  }
}
