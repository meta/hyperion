/**
 * Copyright (c) Meta Platforms, Inc. and affiliates. All Rights Reserved.
 */

import {
  extractElementInfo,
  extractElementText,
} from '../src/ALLabelExtraction';

describe('test identifier fallback', () => {
  test.each([
    [{ testid: 'lowercase' }, 'lowercase'],
    [{ testID: 'canonical', testid: 'lowercase' }, 'canonical'],
    [{ testID: '', testid: 'lowercase' }, 'lowercase'],
    [{ testID: null, testid: 'lowercase' }, 'lowercase'],
    [{ testID: {}, testid: 'lowercase' }, 'lowercase'],
    [{ testID: 'canonical' }, 'canonical'],
  ])('normalizes %j to the canonical identity field', (props, expected) => {
    const info = extractElementInfo('Button', props);
    expect(info.testID).toBe(expected);
    expect(extractElementText(info)).toEqual({
      text: expected,
      source: 'testID',
      sourceType: 'developer_identifier',
      potentiallySensitive: false,
    });
  });

  test('rejects invalid lowercase identifiers', () => {
    const info = extractElementInfo('Button', { testid: {} });
    expect(info.testID).toBeUndefined();
    expect(extractElementText(info)).toBeUndefined();
  });

  test('does not read the fallback when the canonical identifier is present', () => {
    const getFallback = jest.fn(() => 'lowercase');
    const props = {
      testID: 'canonical',
      get testid() {
        return getFallback();
      },
    };
    expect(extractElementInfo('Button', props).testID).toBe('canonical');
    expect(getFallback).not.toHaveBeenCalled();
  });
});
