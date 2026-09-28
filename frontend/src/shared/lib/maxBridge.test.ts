import { afterEach, describe, expect, it } from 'vitest';

import { getMaxInitData, getStartParam } from './maxBridge';

describe('MAX Bridge adapter', () => {
  afterEach(() => {
    window.WebApp = undefined;
    window.history.replaceState({}, '', '/');
  });

  it('reads signed init data from MAX Bridge', () => {
    window.WebApp = { initData: 'query_id=signed' };
    expect(getMaxInitData()).toBe('query_id=signed');
  });

  it('uses the bridge start parameter before the URL fallback', () => {
    window.history.replaceState({}, '', '/?startapp=url-token');
    window.WebApp = {
      initData: '',
      initDataUnsafe: { start_param: 'bridge-token' },
    };
    expect(getStartParam()).toBe('bridge-token');
  });

  it('reads a start parameter in local development', () => {
    window.history.replaceState({}, '', '/?startapp=local-token');
    expect(getStartParam()).toBe('local-token');
  });
});
