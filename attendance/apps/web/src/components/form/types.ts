export interface Option {
  value: string;
  label: string;
}

/** Form values: strings for inputs, string arrays for multi-selects. */
export type FormValues = Record<string, string | string[]>;

export type FieldType =
  'text' | 'number' | 'date' | 'time' | 'select' | 'multiselect' | 'yesno' | 'textarea';

export interface FormField<V extends FormValues> {
  name: keyof V & string;
  label: string;
  type: FieldType;
  required?: boolean;
  maxLength?: number;
  placeholder?: string;
  options?: readonly Option[];
  hint?: string;
  /** Spans both form columns. */
  wide?: boolean;
  readOnly?: boolean;
}
