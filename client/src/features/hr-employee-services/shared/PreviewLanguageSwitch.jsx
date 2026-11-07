// The employment offer's language switch for the live paper previews: it picks
// which language(s) the preview shows (EN, both, or Arabic only).
const LANGUAGES = Object.freeze([['en', 'EN'], ['bi', 'Both'], ['ar', 'عربي']])

export default function PreviewLanguageSwitch({ value, onChange, label = 'Preview language' }) {
  return (
    <div className="zrv-hr-seg zrv-hr-seg--preview" role="group" aria-label={label}
      style={{ '--li': Math.max(0, LANGUAGES.findIndex(([code]) => code === value)) }}>
      <span className="zrv-hr-seg__pill" aria-hidden="true" />
      {LANGUAGES.map(([code, text]) => (
        <button key={code} type="button" aria-pressed={value === code} onClick={() => onChange(code)} lang={code === 'ar' ? 'ar' : undefined}>{text}</button>
      ))}
    </div>
  )
}
