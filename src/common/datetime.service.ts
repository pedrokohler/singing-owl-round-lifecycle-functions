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

  public getDayOfNextWeekWithTime(dayName, hour, minute, second) {
    const dayOfWeek = this.getDayOfTheWeek(dayName);
    const dayOfNextWeek = this.current.plus({ week: 1 }).set({
      weekday: dayOfWeek,
      hour,
      minute,
      second,
      millisecond: 0,
    });
    return dayOfNextWeek;
  }

  private getDayOfTheWeek(dayName) {
    const index = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].indexOf(
      dayName.slice(0, 3).toLowerCase(),
    );
    return index + 1;
  }
}
