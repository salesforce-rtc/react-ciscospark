/* eslint-disable */
const fs = require('fs');
const request = require('request');
const jestUtil = require('jest-util');
const jestMock = require('jest-mock');
const jsdom = require('jsdom');

const Locker = fs.readFileSync(`${__dirname}/locker.min.js`, 'UTF-8');

class JSDOMEnvironment {
  constructor(config) {
    this.dom = new jsdom.JSDOM(
      '<!DOCTYPE html>',
      Object.assign(
        {
          pretendToBeVisual: true,
          runScripts: 'dangerously',
          url: config.testURL,
          virtualConsole: new jsdom.VirtualConsole().sendTo(config.console || console)
        },
        config.testEnvironmentOptions
      ),
    );

    const win = this.dom.window.document.defaultView;
    // dummy patches
    win.CanvasRenderingContext2D = function () { };
    win.HowlerGlobal = function () { };
    win.Howl = function () { };
    win.Sound = function () { };
    // end dummy patches

    const global = this.global = win;
    this.global.Error.stackTraceLimit = 100;
    jestUtil.installCommonGlobals(global, config.globals);

    // Report uncaught errors.
    this.errorEventListener = (event) => {
      if (userErrorListenerCount === 0 && event.error) {
        process.emit('uncaughtException', event.error);
      }
    };
    global.addEventListener('error', this.errorEventListener);

    // However, don't report them as uncaught if the user listens to 'error' event.
    // In that case, we assume the might have custom error handling logic.
    const originalAddListener = global.addEventListener;
    const originalRemoveListener = global.removeEventListener;
    let userErrorListenerCount = 0;
    global.addEventListener = function l(name) {
      if (name === 'error') {
        userErrorListenerCount += 1;
      }
      return originalAddListener.apply(this, arguments);
    };
    global.removeEventListener = function m(name) {
      if (name === 'error') {
        userErrorListenerCount -= 1;
      }
      return originalRemoveListener.apply(this, arguments);
    };

    this.moduleMocker = new jestMock.ModuleMocker(global);

    const timerConfig = {
      idToRef: (id) => id,
      refToId: (ref) => ref
    };


    this.fakeTimers = new jestUtil.FakeTimers({
      config,
      global,
      moduleMocker: this.moduleMocker,
      timerConfig
    });
  }

  setup() {
    const document = this.global._document;
    const window = this.global._globalProxy;
    delete window.document;
    window.document = window._document;

    const symbol = Object.getOwnPropertySymbols(this.global._globalProxy._document)[0];
    const locSymbol = Object.getOwnPropertySymbols(document.location[symbol])[0];

    window.location = document.location;

    window.eval(Locker);

    window.document = document;
    window.Locker.init({
      shouldFreeze: false,
      unsafeGlobal: window,
      unsafeEval: window.eval,
      unsafeFunction: window.Function
    });
    const sw = window.Locker.getEnv({ namespace: 'jest-environment-locker' });
    sw.location[locSymbol] = sw.location;
    sw.document._location = sw.location;
    sw.document.createEvent = function (...args) { return document.createEvent(...args); };

    sw.document[symbol] = sw.document;

    this.global._globalProxy = sw;
    this.global._top = sw;
    this.global._parent = sw;
    this.global._document = sw.document;

    return Promise.resolve();
  }

  teardown() {
    if (this.fakeTimers) {
      this.fakeTimers.dispose();
    }
    if (this.global) {
      if (this.errorEventListener) {
        this.global.removeEventListener('error', this.errorEventListener);
      }
      this.global = null;
    }
    this.errorEventListener = null;
    this.global = null;
    this.dom = null;
    this.fakeTimers = null;
    return Promise.resolve();
  }

  dispose() {
    this.teardown();
  }

  runScript(script) {
    if (this.dom) {
      return this.dom.runVMScript(script);
    }
    return null;
  }
}


module.exports = JSDOMEnvironment;