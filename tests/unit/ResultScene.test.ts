import {
  resultButtonLabel,
  resultMessage,
} from '../../src/game/scenes/ResultCopy';

it('승패 결과 문구와 actual restart button label을 고정한다', () => {
  expect(resultMessage('won')).toBe('보호소를 지켰어요!');
  expect(resultMessage('lost')).toBe('다시 지켜볼까요?');
  expect(resultButtonLabel()).toBe('다시 시작');
});
