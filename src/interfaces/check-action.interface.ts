import IActionArguments from './action.interface';
import ICheckArguments from './check-arguments.interface';

export default interface ICheckAction {
  check: (args: ICheckArguments) => boolean;
  action: (args: IActionArguments) => Promise<void>;
}
