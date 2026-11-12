import type { ThemeConfig } from 'antd';

// The orange-red flare in favicon.svg (#D75B2B) is the brand reference.
// Darken it for light mode and use a lighter seed for Ant Design’s dark palette.
const light = {
  accent: '#B84621',
  hover: '#A23C1B',
  active: '#8B3115',
  background: '#FFF0EA',
};
const dark = {
  accent: '#F37848',
  hover: '#FF9B74',
  active: '#DE673C',
  background: '#42271E',
};

export function cookieflareTheme(isDark: boolean): ThemeConfig {
  const { accent, hover, active, background } = isDark ? dark : light;
  return { token: {
    colorPrimary: accent,
    colorPrimaryHover: hover,
    colorPrimaryActive: active,
    colorPrimaryText: accent,
    colorPrimaryTextHover: hover,
    colorPrimaryTextActive: active,
    colorPrimaryBg: background,
    colorLink: accent,
    colorLinkHover: hover,
    colorLinkActive: active,
  } };
}

export const referenceThemeCss = `
  .light-mode { --scalar-color-accent: ${light.accent}; --scalar-background-accent: ${light.background}; }
  .dark-mode { --scalar-color-accent: ${dark.accent}; --scalar-background-accent: ${dark.background}; }
`;
