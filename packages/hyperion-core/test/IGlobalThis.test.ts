/**
 * Copyright (c) Meta Platforms, Inc. and affiliates. All Rights Reserved.
 */

import "jest";
import { AsyncCounter } from "hyperion-async-counter/src/AsyncCounter";
import * as IGlobalThis from "../src/IGlobalThis";
import { interceptFunction } from "../src/FunctionInterceptor";

function wrapHandler(handler: Function | string, observer: jest.Mock<any, any>) {
  if (typeof handler === "string") {
    handler = new Function(handler);
  };
  const fi = interceptFunction(handler);
  fi.onBeforeCallObserverAdd(observer);
  return fi.interceptor;
}

describe('test Global Scope interception', () => {

  test('test setTImeout', async () => {
    const observer = jest.fn();
    IGlobalThis.setTimeout.onBeforeCallMapperAdd(args => {
      args[0] = wrapHandler(args[0], observer);
      return args;
    });

    const counter = new AsyncCounter(1);
    setTimeout(
      () => {
        counter.countUp();
      },
      1000
    );

    const finalCount = await counter.reachTarget();

    expect(observer).toBeCalledTimes(finalCount);
  });

  test('test setInterval', async () => {
    const observer = jest.fn();
    IGlobalThis.setInterval.onBeforeCallMapperAdd(args => {
      args[0] = wrapHandler(args[0], observer);
      return args;
    });

    const counter = new AsyncCounter(5);
    const id = setInterval(
      () => {
        counter.countUp();
      },
      100
    );

    const finalCount = await counter.reachTarget();

    clearInterval(id);

    expect(observer).toBeCalledTimes(finalCount);
  });

  test('test subclass of intercepted Promise', async () => {
    const valueObserver = jest.fn();
    IGlobalThis.IPromiseConstructor.onAfterCallObserverAdd(valueObserver);

    class MyPromise<T> extends Promise<T> {
      tag() {
        return "MyPromise";
      }
    }

    const p = new MyPromise<number>(resolve => resolve(1));
    expect(p).toBeInstanceOf(MyPromise);
    expect(p.tag()).toBe("MyPromise");
    expect(valueObserver).toHaveBeenCalledWith(p);
    expect(MyPromise.resolve(2)).toBeInstanceOf(MyPromise);
    expect(await p).toBe(1);

    IGlobalThis.IPromiseConstructor.onAfterCallObserverRemove(valueObserver);
  });
});