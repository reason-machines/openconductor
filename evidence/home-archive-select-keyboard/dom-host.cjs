// Host configuration for the unchanged frozen test. jsdom 27 supplies PointerEvent.
// Flush each DOM input event as ReactDOM does for discrete browser input, rather than
// batching a whole multi-key user-event sequence in the fixture's outer async act.
// No application handler, keyboard expectation or assertion is replaced.
const { createRequire } = require('node:module');
const path = require('node:path');
const dependencies = createRequire(path.resolve(process.env.DOM_DEPS || '.ara-state/archive-dom-v27/package.json'));
const userEvent = dependencies('@testing-library/user-event').default;
const setup = userEvent.setup;
userEvent.setup = (options) => setup({ ...options, delay: 40 });
const appDependencies = createRequire(path.join(process.cwd(), 'package.json'));
dependencies('@testing-library/dom').configure({
  eventWrapper: (callback) => {
    const { flushSync } = appDependencies('react-dom');
    flushSync(() => {});
    return flushSync(callback);
  },
});
