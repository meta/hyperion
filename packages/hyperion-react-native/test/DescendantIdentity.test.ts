/**
 * Copyright (c) Meta Platforms, Inc. and affiliates. All Rights Reserved.
 */

'use strict';

import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { createAutoLoggingChannel } from 'hyperion-autologging/src/ALChannel';
import * as AutoLogging from '../src/AutoLogging';
import { reactNativeUIEvents } from '../src/ALUIEvents';
import type { ALReactNativeEventMap, ALUIEventData } from '../src/ALTypes';
import { resetElementObservationForTests } from '../src/ReactNativeElementObservation';
import { jsx, jsxs } from '../src/jsx-runtime';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

interface ButtonProps {
  onPress(): void;
  testID?: string;
  accessibilityLabel?: unknown;
  innerID?: string;
  label?: unknown;
  second?: boolean;
}

function Pressable(props: ButtonProps) {
  return React.createElement('pressable', props);
}

function CompositeButton(props: ButtonProps) {
  const first = jsx(Pressable, {
    onPress: props.onPress,
    testID: props.innerID,
    accessibilityLabel: props.label,
  });
  return props.second
    ? jsxs(React.Fragment, {
        children: [
          first,
          jsx(Pressable, {
            onPress: props.onPress,
            testID: 'second',
            accessibilityLabel: 'Second button',
          }),
        ],
      })
    : first;
}

describe('forwarded handler identity', () => {
  const originalConsoleError = console.error;
  let renderer: TestRenderer.ReactTestRenderer;
  let events: ALUIEventData[];

  beforeEach(() => {
    events = [];
    const channel = createAutoLoggingChannel<ALReactNativeEventMap>();
    channel.addListener('al_ui_event', (event) => events.push(event));
    AutoLogging.init({ channel, plugins: [reactNativeUIEvents()] });
    jest.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      if (String(args[0]).includes('react-test-renderer is deprecated')) return;
      originalConsoleError(...args);
    });
  });

  afterEach(() => {
    if (renderer != null) act(() => renderer.unmount());
    AutoLogging.dispose();
    resetElementObservationForTests();
    jest.restoreAllMocks();
  });

  function render(element: React.ReactElement) {
    act(() => {
      renderer = TestRenderer.create(element);
    });
  }

  test('uses the inner identifier and label with their existing provenance', () => {
    const handler = jest.fn();
    render(
      jsx(CompositeButton, { onPress: handler, innerID: 'save', label: 'Save' })
    );
    renderer.root.findByType('pressable').props.onPress();
    expect(handler).toHaveBeenCalledTimes(1);
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual(
      expect.objectContaining({
        elementName: 'save',
        elementText: 'Save',
        elementTextSource: 'accessibilityLabel',
        elementTextSourceType: 'application_text',
        elementTextPotentiallySensitive: true,
      })
    );
  });

  test('explicit outer identity wins', () => {
    render(
      jsx(CompositeButton, {
        onPress: () => undefined,
        testID: 'outer',
        accessibilityLabel: 'Outer',
        innerID: 'inner',
        label: 'Inner',
      })
    );
    renderer.root.findByType('pressable').props.onPress();
    expect(events[0]).toEqual(
      expect.objectContaining({ elementName: 'outer', elementText: 'Outer' })
    );
  });

  test('the first of two same-type descendants wins', () => {
    render(
      jsx(CompositeButton, {
        onPress: () => undefined,
        innerID: 'first',
        label: 'First',
        second: true,
      })
    );
    renderer.root.findAllByType('pressable')[1].props.onPress();
    expect(events[0]).toEqual(
      expect.objectContaining({ elementName: 'first', elementText: 'First' })
    );
  });

  test('siblings sharing a raw handler retain independent identity', () => {
    const onPress = jest.fn();
    render(
      jsxs(React.Fragment, {
        children: [
          jsx(CompositeButton, { onPress, innerID: 'first', label: 'First' }),
          jsx(CompositeButton, { onPress, innerID: 'second', label: 'Second' }),
        ],
      })
    );
    for (const control of renderer.root.findAllByType('pressable'))
      control.props.onPress();
    expect(
      events.map((event) => [event.elementName, event.elementText])
    ).toEqual([
      ['first', 'First'],
      ['second', 'Second'],
    ]);
    expect(onPress).toHaveBeenCalledTimes(2);
  });

  test('refreshes descendant props on rerender without replacing the handler', () => {
    const onPress = () => undefined;
    render(
      jsx(CompositeButton, {
        onPress,
        innerID: 'first',
        label: 'First',
        second: true,
      })
    );
    const handler = renderer.root.findAllByType('pressable')[0].props.onPress;
    act(() =>
      renderer.update(
        jsx(CompositeButton, {
          onPress,
          innerID: 'updated',
          label: 'Updated',
          second: true,
        })
      )
    );
    expect(renderer.root.findAllByType('pressable')[0].props.onPress).toBe(
      handler
    );
    handler();
    expect(events[0]).toEqual(
      expect.objectContaining({
        elementName: 'updated',
        elementText: 'Updated',
      })
    );
  });

  test('retains component fallback when no descendant identity exists', () => {
    render(jsx(CompositeButton, { onPress: () => undefined }));
    renderer.root.findByType('pressable').props.onPress();
    expect(events[0].elementName).toBe('CompositeButton');
    expect(events[0].elementText).toBeUndefined();
  });

  test('accepts stringifiable application labels without changing sensitivity', () => {
    render(
      jsx(CompositeButton, {
        onPress: () => undefined,
        label: { toString: () => 'Translated label' },
      })
    );
    renderer.root.findByType('pressable').props.onPress();
    expect(events[0]).toEqual(
      expect.objectContaining({
        elementText: 'Translated label',
        elementTextPotentiallySensitive: true,
      })
    );
  });

  test.each([
    ['plain object', {}],
    ['React element', React.createElement('span', null, 'Not a label')],
    ['boolean', true],
    ['symbol', Symbol('Not a label')],
    ['function', () => 'Not a label'],
    ['null-prototype object', Object.create(null)],
  ])('rejects a %s as element text', (_name, label) => {
    const onPress = jest.fn();
    render(jsx(CompositeButton, { onPress, label }));
    renderer.root.findByType('pressable').props.onPress();
    expect(events).toHaveLength(1);
    expect(events[0].elementText).toBeUndefined();
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  test('accepts numeric labels without changing sensitivity', () => {
    render(jsx(CompositeButton, { onPress: () => undefined, label: 42 }));
    renderer.root.findByType('pressable').props.onPress();
    expect(events[0]).toEqual(
      expect.objectContaining({
        elementText: '42',
        elementTextPotentiallySensitive: true,
      })
    );
  });

  test.each([
    ['onLongPress', 'onPress'],
    ['onPress', 'onLongPress'],
  ])(
    'mixed handlers report identity with prop order %s, %s',
    (...interceptProps) => {
      AutoLogging.dispose();
      const channel = createAutoLoggingChannel<ALReactNativeEventMap>();
      channel.addListener('al_ui_event', (event) => events.push(event));
      AutoLogging.init({
        channel,
        plugins: [reactNativeUIEvents({ interceptProps })],
      });
      const onPress = jest.fn();
      const onLongPress = jest.fn();
      function MixedButton(props: ButtonProps) {
        return jsx(Pressable, {
          onPress: props.onPress,
          onLongPress,
          testID: 'mixed-inner',
          accessibilityLabel: 'Mixed button',
        });
      }
      render(jsx(MixedButton, { onPress }));
      const control = renderer.root.findByType('pressable');
      control.props.onPress();
      control.props.onLongPress();
      expect(
        events.map((event) => [
          event.event,
          event.elementName,
          event.elementText,
        ])
      ).toEqual([
        ['click', 'mixed-inner', 'Mixed button'],
        ['long_press', 'mixed-inner', 'Mixed button'],
      ]);
      expect(onPress).toHaveBeenCalledTimes(1);
      expect(onLongPress).toHaveBeenCalledTimes(1);
    }
  );

  test('clears removed descendant identity on an owner rerender', () => {
    const onPress = () => undefined;
    render(jsx(CompositeButton, { onPress, innerID: 'first', label: 'First' }));
    act(() => renderer.update(jsx(CompositeButton, { onPress })));
    renderer.root.findByType('pressable').props.onPress();
    expect(events[0].elementName).toBe('CompositeButton');
    expect(events[0].elementText).toBeUndefined();
  });

  test('uses developer-identifier provenance when the inner testID is the only text', () => {
    render(
      jsx(CompositeButton, { onPress: () => undefined, innerID: 'inner-id' })
    );
    renderer.root.findByType('pressable').props.onPress();
    expect(events[0]).toEqual(
      expect.objectContaining({
        elementText: 'inner-id',
        elementTextSource: 'testID',
        elementTextSourceType: 'developer_identifier',
        elementTextPotentiallySensitive: false,
      })
    );
  });

  test('a throwing string conversion does not affect the application handler', () => {
    const onPress = jest.fn();
    render(
      jsx(CompositeButton, {
        onPress,
        label: {
          toString() {
            throw new Error('conversion failed');
          },
        },
      })
    );
    renderer.root.findByType('pressable').props.onPress();
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(events).toHaveLength(1);
    expect(events[0].elementText).toBeUndefined();
  });

  test('a keyed descendant refreshes during an independent composite rerender', () => {
    let update: (value: string) => void = () => undefined;
    function StatefulButton({ onPress }: { onPress(): void }) {
      const [identity, setIdentity] = React.useState('first');
      update = setIdentity;
      return jsxs(React.Fragment, {
        children: [
          jsx(
            Pressable,
            { onPress, testID: identity, accessibilityLabel: identity },
            'first'
          ),
          jsx(
            Pressable,
            { onPress, testID: 'second', accessibilityLabel: 'Second' },
            'second'
          ),
        ],
      });
    }
    render(jsx(StatefulButton, { onPress: () => undefined }));
    const handler = renderer.root.findAllByType('pressable')[0].props.onPress;
    act(() => update('updated'));
    expect(renderer.root.findAllByType('pressable')[0].props.onPress).toBe(
      handler
    );
    handler();
    expect(events[0]).toEqual(
      expect.objectContaining({
        elementName: 'updated',
        elementText: 'updated',
      })
    );
  });
});
