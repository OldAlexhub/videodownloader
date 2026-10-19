import {requiresForcedUpdate} from '../src/utils/update';

describe('forced update policy', () => {
  test('blocks only installed builds below an enabled minimum', () => {
    expect(requiresForcedUpdate(6, {force: true, minimumVersionCode: 7})).toBe(true);
    expect(requiresForcedUpdate(7, {force: true, minimumVersionCode: 7})).toBe(false);
    expect(requiresForcedUpdate(6, {force: false, minimumVersionCode: 7})).toBe(false);
  });
});
