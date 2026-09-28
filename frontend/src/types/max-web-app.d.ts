interface MaxInitDataUnsafe {
  start_param?: string;
  user?: {
    id: number;
    first_name: string;
    last_name?: string;
    username?: string;
    language_code?: string;
    photo_url?: string;
  };
}

interface MaxWebApp {
  initData: string;
  initDataUnsafe?: MaxInitDataUnsafe;
  platform?: 'ios' | 'android' | 'desktop' | 'web';
  version?: string;
  deviceName?: string;
  enableClosingConfirmation?: () => void;
  disableClosingConfirmation?: () => void;
}

interface Window {
  WebApp?: MaxWebApp;
}
