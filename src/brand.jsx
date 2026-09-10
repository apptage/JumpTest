/* Miaro Verify brand assets. The SVGs are inlined (fill="currentColor") so the
   logo takes the surrounding text colour — charcoal on light, white on dark,
   on-ink inside the auth hero. Source: src/assets/brand/*.svg */
import markSvg from './assets/brand/miaro-mark.svg?raw';
import logoSvg from './assets/brand/miaro-verify.svg?raw';

export const BRAND_NAME = 'Miaro Verify';

const MARK_RATIO = 447.3 / 205.65; // width ÷ height
const LOGO_RATIO = 967.59 / 205.65;

/* Icon-only mark (the double chevron). `size` is the height in px. */
export function MiaroMark({ size = 28, color = 'currentColor', style }) {
  return (
    <span
      role="img"
      aria-label={BRAND_NAME}
      style={{ display: 'inline-block', height: size, width: Math.round(size * MARK_RATIO), color, lineHeight: 0, flexShrink: 0, ...style }}
      dangerouslySetInnerHTML={{ __html: markSvg }}
    />
  );
}

/* Full lock-up: mark + "miaro" + "VERIFY". `size` is the height in px. */
export function MiaroLogo({ size = 26, color = 'currentColor', style }) {
  return (
    <span
      role="img"
      aria-label={BRAND_NAME}
      style={{ display: 'inline-block', height: size, width: Math.round(size * LOGO_RATIO), color, lineHeight: 0, flexShrink: 0, ...style }}
      dangerouslySetInnerHTML={{ __html: logoSvg }}
    />
  );
}
