import type { ReactElement } from 'react';
import TextFieldsIcon from '@mui/icons-material/TextFields';
import NotesIcon from '@mui/icons-material/Notes';
import ArrowDropDownCircleOutlinedIcon from '@mui/icons-material/ArrowDropDownCircleOutlined';
import CheckBoxOutlinedIcon from '@mui/icons-material/CheckBoxOutlined';
import RadioButtonCheckedIcon from '@mui/icons-material/RadioButtonChecked';
import SmartButtonIcon from '@mui/icons-material/SmartButton';
import WbSunnyOutlinedIcon from '@mui/icons-material/WbSunnyOutlined';
import DynamicFormOutlinedIcon from '@mui/icons-material/DynamicFormOutlined';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import ArticleOutlinedIcon from '@mui/icons-material/ArticleOutlined';
import MailOutlineIcon from '@mui/icons-material/MailOutline';
import DocumentScannerOutlinedIcon from '@mui/icons-material/DocumentScannerOutlined';
import TagIcon from '@mui/icons-material/Tag';
import type { WidgetKind } from '../../shared/types';
import { COMPONENT_META, type ComponentMeta } from '../../shared/draft';

export * from '../../shared/draft';

export interface ComponentDef extends ComponentMeta {
  icon: ReactElement;
}

const ICONS: Record<string, ReactElement> = {
  text: <TextFieldsIcon fontSize="small" />,
  textarea: <NotesIcon fontSize="small" />,
  dropdown: <ArrowDropDownCircleOutlinedIcon fontSize="small" />,
  checkbox: <CheckBoxOutlinedIcon fontSize="small" />,
  radio: <RadioButtonCheckedIcon fontSize="small" />,
  form: <DynamicFormOutlinedIcon fontSize="small" />,
  button: <SmartButtonIcon fontSize="small" />,
  weather: <WbSunnyOutlinedIcon fontSize="small" />,
  action: <MailOutlineIcon fontSize="small" />,
  ocr: <DocumentScannerOutlinedIcon fontSize="small" />,
  ids: <TagIcon fontSize="small" />,
  input: <AutoAwesomeIcon fontSize="small" />,
  output: <ArticleOutlinedIcon fontSize="small" />,
};

export const COMPONENTS: ComponentDef[] = COMPONENT_META.map((m) => ({ ...m, icon: ICONS[m.kind] }));

export const componentOf = (k: WidgetKind): ComponentDef =>
  COMPONENTS.find((c) => c.kind === k) ?? { kind: k, label: 'AI box', hint: '', icon: <AutoAwesomeIcon fontSize="small" />, group: 'AI' };
