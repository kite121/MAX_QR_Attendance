export function getMaxInitData(): string | null {
  const initData = window.WebApp?.initData;
  return initData?.trim() ? initData : null;
}

export function getStartParam(): string | null {
  const bridgeParam = window.WebApp?.initDataUnsafe?.start_param;
  if (bridgeParam) return bridgeParam;

  const params = new URLSearchParams(window.location.search);
  return params.get('startapp') ?? params.get('start_param');
}

export function isMaxEnvironment(): boolean {
  return Boolean(getMaxInitData());
}
