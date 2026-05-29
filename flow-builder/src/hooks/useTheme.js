import { useThemeStore } from '../store/themeStore';

const DARK = {
  bgApp:    '#0B1020',
  bgPanel:  '#0F172A',
  bgCanvas: '#0A0A0A',
  bgDeep:   '#080D1A',
  bgToolbar:'rgba(11,16,32,0.97)',
  text1:    '#E2E8F0',
  text2:    '#94A3B8',
  text3:    '#475569',
  border:   'rgba(255,255,255,0.08)',
  borderXs: 'rgba(255,255,255,0.05)',
  surface:  'rgba(255,255,255,0.02)',
  surface2: 'rgba(255,255,255,0.04)',
};

const LIGHT = {
  bgApp:    '#F1F5F9',
  bgPanel:  '#FFFFFF',
  bgCanvas: '#F8FAFC',
  bgDeep:   '#1E293B',       // keep nav dark for icon contrast
  bgToolbar:'rgba(248,250,252,0.97)',
  text1:    '#1E293B',
  text2:    '#475569',
  text3:    '#94A3B8',
  border:   'rgba(0,0,0,0.1)',
  borderXs: 'rgba(0,0,0,0.06)',
  surface:  'rgba(0,0,0,0.02)',
  surface2: 'rgba(0,0,0,0.04)',
};

export function useTheme() {
  const theme = useThemeStore(s => s.theme);
  return theme === 'dark' ? DARK : LIGHT;
}
