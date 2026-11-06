import { expect, it } from 'vitest';

it('[beta-r3] a citation that fails under RUNNER_FAIL', () => {
  expect(process.env.RUNNER_FAIL).not.toBe('1');
});
