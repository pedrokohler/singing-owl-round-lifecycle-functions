export default interface IGroup {
  name: string;
  ongoingRound: string;
  telegramChatIds: string[];
  users: string[];
  settings: {
    rounds: {
      submissionsEndAt: {
        weekDay: string;
        hour: number;
        minute: number;
        second: number;
      };
      evaluationsStartAt: {
        weekDay: string;
        hour: number;
        minute: number;
        second: number;
      };
      evaluationsEndAt: {
        weekDay: string;
        hour: number;
        minute: number;
        second: number;
      };
    };
  };
}
