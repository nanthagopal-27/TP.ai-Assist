import type { ActionId } from './types';
import brand from '../../brand.config.json';

/** Single source of truth for the product name. Edit extension/brand.config.json to rename. */
export const PRODUCT_NAME = brand.productName;
export const SHORT_NAME = brand.shortName;

/** Custom MIME type used to drag a component straight from the side panel's palette onto the
 *  active page via the browser's native (OS-level) Drag and Drop API. Unlike a popup (which
 *  closes the instant it loses focus, breaking any drag that leaves it), a side panel stays
 *  open, so this is the documented workaround for extension-page -> page drags. */
export const WIDGET_DRAG_MIME = 'application/x-orbit-widget-kind';
/** Fallback payload set on the standard "text/plain" type, in case a browser strips custom
 *  drag MIME types crossing the side-panel/page origin boundary. Prefixed so the content script
 *  can tell a real widget drag apart from the user just dragging some text on the page. */
export const WIDGET_DRAG_TEXT_PREFIX = 'orbit-widget-kind:';

/** First letter of each of the first two words, e.g. "Orbit PixieBrix" -> "OP". Used as the
 *  fallback logo/icon badge whenever no custom logo image is supplied. */
export const PRODUCT_INITIALS = PRODUCT_NAME
  .split(/\s+/)
  .filter(Boolean)
  .slice(0, 2)
  .map((word) => word[0]?.toUpperCase() ?? '')
  .join('') || 'OR';

export const STORAGE_KEYS = {
  targetLanguage: 'orbit.targetLanguage',
  replaceOnPage: 'orbit.replaceOnPage',
  autofill: 'orbit.autofill',
  widgets: 'orbit.widgets',
  toolbar: 'orbit.toolbar',
  dragLayout: 'orbit.dragLayout',
} as const;

export const LANGUAGES = [
  'English', 'Hindi', 'Spanish', 'French', 'German', 'Portuguese', 'Italian', 'Dutch', 'Russian', 'Arabic',
  'Chinese (Simplified)', 'Chinese (Traditional)', 'Japanese', 'Korean', 'Turkish', 'Polish',
  // Indian languages
  'Assamese', 'Bengali', 'Gujarati', 'Kannada', 'Malayalam', 'Marathi', 'Nepali', 'Odia', 'Punjabi', 'Sanskrit',
  'Sindhi', 'Tamil', 'Telugu', 'Urdu',
  // Others
  'Afrikaans', 'Albanian', 'Amharic', 'Armenian', 'Azerbaijani', 'Basque', 'Belarusian', 'Bosnian', 'Bulgarian',
  'Burmese', 'Catalan', 'Croatian', 'Czech', 'Danish', 'Estonian', 'Filipino', 'Finnish', 'Galician', 'Georgian',
  'Greek', 'Hausa', 'Hebrew', 'Hungarian', 'Icelandic', 'Indonesian', 'Irish', 'Javanese', 'Kazakh', 'Khmer',
  'Lao', 'Latvian', 'Lithuanian', 'Macedonian', 'Malay', 'Maltese', 'Mongolian', 'Norwegian', 'Pashto', 'Persian',
  'Romanian', 'Serbian', 'Sinhala', 'Slovak', 'Slovenian', 'Somali', 'Swahili', 'Swedish', 'Thai', 'Ukrainian',
  'Uzbek', 'Vietnamese', 'Welsh', 'Yoruba', 'Zulu',
];

export const ACTION_ORDER: ActionId[] = ['summarize', 'translate', 'explain', 'extract', 'extract_ids', 'person', 'company', 'ask'];

/** Short labels used inside the in-page widgets. */
export const ACTION_SHORT: Record<ActionId, string> = {
  summarize: 'Summarize',
  translate: 'Translate',
  explain: 'Explain',
  extract: 'Extract details',
  extract_ids: 'Extract IDs',
  person: 'Person info',
  company: 'Company info',
  ask: 'Ask AI',
};

/** Default option list of the weather widget: every Indian state and union territory. */
export const INDIA_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat', 'Haryana',
  'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur',
  'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana',
  'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal', 'Delhi', 'Jammu and Kashmir', 'Ladakh',
  'Puducherry', 'Chandigarh', 'Andaman and Nicobar Islands', 'Lakshadweep',
  'Dadra and Nagar Haveli and Daman and Diu',
];

export const slug = (s: string): string =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'field';
