/**
 * Color Contrast Utilities
 *
 * Utilities for calculating color contrast ratios and validating
 * against WCAG 2.1 AA and AAA standards.
 *
 * WCAG 2.1 Requirements:
 * - AA Normal Text: 4.5:1 minimum
 * - AA Large Text (18pt+ or 14pt+ bold): 3:1 minimum
 * - AAA Normal Text: 7:1 minimum
 * - AAA Large Text: 4.5:1 minimum
 * - Focus Indicators: 3:1 minimum
 */

export interface RGBColor {
  r: number;
  g: number;
  b: number;
}

export interface HSLColor {
  h: number;
  s: number;
  l: number;
}

/**
 * Convert hex color to RGB
 */
export function hexToRgb(hex: string): RGBColor | null {
  // Remove # if present
  hex = hex.replace(/^#/, '');

  // Handle shorthand hex (e.g., #FFF)
  if (hex.length === 3) {
    hex = hex
      .split('')
      .map((char) => char + char)
      .join('');
  }

  const result = /^([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);

  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
}

/**
 * Convert RGB to hex
 */
export function rgbToHex(rgb: RGBColor): string {
  const toHex = (n: number) => {
    const clamped = Math.max(0, Math.min(255, Math.round(n)));
    const hex = clamped.toString(16).padStart(2, '0');
    return hex;
  };

  return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`;
}

/**
 * Calculate relative luminance of a color
 * Formula from WCAG 2.1: https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 */
export function getRelativeLuminance(rgb: RGBColor): number {
  // Convert RGB to sRGB
  const rsRGB = rgb.r / 255;
  const gsRGB = rgb.g / 255;
  const bsRGB = rgb.b / 255;

  // Apply gamma correction
  const r = rsRGB <= 0.03928 ? rsRGB / 12.92 : Math.pow((rsRGB + 0.055) / 1.055, 2.4);
  const g = gsRGB <= 0.03928 ? gsRGB / 12.92 : Math.pow((gsRGB + 0.055) / 1.055, 2.4);
  const b = bsRGB <= 0.03928 ? bsRGB / 12.92 : Math.pow((bsRGB + 0.055) / 1.055, 2.4);

  // Calculate relative luminance
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Calculate contrast ratio between two colors
 * Formula from WCAG 2.1: https://www.w3.org/TR/WCAG21/#dfn-contrast-ratio
 */
export function getContrastRatio(color1: RGBColor, color2: RGBColor): number {
  const l1 = getRelativeLuminance(color1);
  const l2 = getRelativeLuminance(color2);

  // Ensure lighter color is in numerator
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);

  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Check if contrast ratio meets WCAG 2.1 AA standard for normal text
 */
export function meetsWCAG_AA(foreground: RGBColor, background: RGBColor): boolean {
  const ratio = getContrastRatio(foreground, background);
  return ratio >= 4.5;
}

/**
 * Check if contrast ratio meets WCAG 2.1 AA standard for large text
 */
export function meetsWCAG_AA_Large(foreground: RGBColor, background: RGBColor): boolean {
  const ratio = getContrastRatio(foreground, background);
  return ratio >= 3.0;
}

/**
 * Check if contrast ratio meets WCAG 2.1 AAA standard for normal text
 */
export function meetsWCAG_AAA(foreground: RGBColor, background: RGBColor): boolean {
  const ratio = getContrastRatio(foreground, background);
  return ratio >= 7.0;
}

/**
 * Check if contrast ratio meets WCAG 2.1 AAA standard for large text
 */
export function meetsWCAG_AAA_Large(foreground: RGBColor, background: RGBColor): boolean {
  const ratio = getContrastRatio(foreground, background);
  return ratio >= 4.5;
}

/**
 * Check if contrast ratio meets minimum requirement for focus indicators
 */
export function meetsFocusIndicatorContrast(foreground: RGBColor, background: RGBColor): boolean {
  const ratio = getContrastRatio(foreground, background);
  return ratio >= 3.0;
}

/**
 * Get WCAG compliance level for a color pair
 */
export function getWCAGLevel(
  foreground: RGBColor,
  background: RGBColor,
  isLargeText: boolean = false
): 'AAA' | 'AA' | 'Fail' {
  const ratio = getContrastRatio(foreground, background);

  if (isLargeText) {
    if (ratio >= 4.5) return 'AAA';
    if (ratio >= 3.0) return 'AA';
  } else {
    if (ratio >= 7.0) return 'AAA';
    if (ratio >= 4.5) return 'AA';
  }

  return 'Fail';
}

/**
 * Parse any CSS color format to RGB
 */
export function parseColor(color: string): RGBColor | null {
  // Handle hex colors
  if (color.startsWith('#')) {
    return hexToRgb(color);
  }

  // Handle rgb(r, g, b) format
  const rgbMatch = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (rgbMatch) {
    return {
      r: parseInt(rgbMatch[1]),
      g: parseInt(rgbMatch[2]),
      b: parseInt(rgbMatch[3]),
    };
  }

  // Handle named colors (basic set)
  const namedColors: Record<string, RGBColor> = {
    white: { r: 255, g: 255, b: 255 },
    black: { r: 0, g: 0, b: 0 },
    red: { r: 255, g: 0, b: 0 },
    green: { r: 0, g: 128, b: 0 },
    blue: { r: 0, g: 0, b: 255 },
    yellow: { r: 255, g: 255, b: 0 },
    gray: { r: 128, g: 128, b: 128 },
  };

  const lowerColor = color.toLowerCase();
  if (lowerColor in namedColors) {
    return namedColors[lowerColor];
  }

  return null;
}

/**
 * Check if two colors have sufficient contrast for the given use case
 */
export interface ContrastCheckResult {
  ratio: number;
  aa: boolean;
  aaLarge: boolean;
  aaa: boolean;
  aaaLarge: boolean;
  level: 'AAA' | 'AA' | 'Fail';
}

export function checkContrast(
  foreground: RGBColor,
  background: RGBColor,
  isLargeText: boolean = false
): ContrastCheckResult {
  const ratio = getContrastRatio(foreground, background);

  return {
    ratio,
    aa: ratio >= 4.5,
    aaLarge: ratio >= 3.0,
    aaa: ratio >= 7.0,
    aaaLarge: ratio >= 4.5,
    level: getWCAGLevel(foreground, background, isLargeText),
  };
}

/**
 * Suggest adjustments to improve contrast
 */
export function suggestContrastAdjustment(
  foreground: RGBColor,
  background: RGBColor,
  targetRatio: number = 4.5
): string {
  const currentRatio = getContrastRatio(foreground, background);

  if (currentRatio >= targetRatio) {
    return 'Contrast already meets target ratio';
  }

  const fgLuminance = getRelativeLuminance(foreground);
  const bgLuminance = getRelativeLuminance(background);

  if (fgLuminance > bgLuminance) {
    return 'Lighten the foreground color or darken the background color';
  } else {
    return 'Darken the foreground color or lighten the background color';
  }
}
