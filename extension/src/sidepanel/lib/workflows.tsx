import type { ReactElement } from 'react';
import SummarizeIcon from '@mui/icons-material/Summarize';
import TranslateIcon from '@mui/icons-material/Translate';
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined';
import ChecklistIcon from '@mui/icons-material/Checklist';
import TagIcon from '@mui/icons-material/Tag';
import PersonSearchIcon from '@mui/icons-material/PersonSearch';
import BusinessIcon from '@mui/icons-material/Business';
import QuestionAnswerOutlinedIcon from '@mui/icons-material/QuestionAnswerOutlined';
import type { ActionId } from '../../shared/types';

export interface ActionDef {
  id: ActionId;
  label: string;
  hint: string;
  icon: ReactElement;
  /** Works best on highlighted text -> button shows a "selection" dot when text is selected. */
  prefersSelection?: boolean;
  needsPrompt?: boolean;
  needsLanguage?: boolean;
}

export const ACTIONS: Record<ActionId, ActionDef> = {
  summarize: { id: 'summarize', label: 'Summarize Webpage', hint: 'Key points of this page', icon: <SummarizeIcon fontSize="small" /> },
  translate: { id: 'translate', label: 'Translate Text', hint: 'Translate selection or page', icon: <TranslateIcon fontSize="small" />, prefersSelection: true, needsLanguage: true },
  explain: { id: 'explain', label: 'Explain Content', hint: 'Plain-language explanation', icon: <LightbulbOutlinedIcon fontSize="small" />, prefersSelection: true },
  extract: { id: 'extract', label: 'Extract Key Details', hint: 'IDs, dates, amounts, contacts', icon: <ChecklistIcon fontSize="small" /> },
  extract_ids: { id: 'extract_ids', label: 'Extract IDs', hint: 'Case, order, ticket & reference numbers', icon: <TagIcon fontSize="small" /> },
  person: { id: 'person', label: 'Person Information', hint: 'Who is this person?', icon: <PersonSearchIcon fontSize="small" />, prefersSelection: true },
  company: { id: 'company', label: 'Company Information', hint: 'Who is this company?', icon: <BusinessIcon fontSize="small" />, prefersSelection: true },
  ask: { id: 'ask', label: 'Ask AI (Q&A)', hint: 'Ask a question about this page', icon: <QuestionAnswerOutlinedIcon fontSize="small" />, needsPrompt: true },
};
