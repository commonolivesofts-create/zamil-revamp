// UI-UX §5.2 receipt pane (FR-CAP-02/03/04): drop zone → preview, ZATCA badge, decoded QR.
import {
  Camera,
  FileUp,
  Maximize2,
  Minimize2,
  QrCode,
  ScanText,
  Trash2,
  Upload,
} from 'lucide-react';
import { useRef, useState, type DragEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Spinner } from '../../components/ui/Spinner';
import { Tag } from '../../components/ui/Tag';
import { cn } from '../../lib/cn';
import { formatDateTime, formatSar } from '../../lib/format';
import type { AttachedReceipt } from './form';

const ACCEPT = 'image/jpeg,image/png,application/pdf';
const MAX_BYTES = 10 * 1024 * 1024; // the server checks again (MAX_UPLOAD_MB)

export function ReceiptPane({
  receipt,
  uploading,
  readOnly,
  onFile,
  onRemove,
}: {
  receipt: AttachedReceipt | null;
  uploading: boolean;
  readOnly?: boolean;
  onFile: (file: File) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const take = (file: File | undefined) => {
    if (!file) return;
    if (!ACCEPT.split(',').includes(file.type)) {
      setError(t('expenses.receipt.wrongType'));
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(t('expenses.receipt.tooLarge'));
      return;
    }
    setError(null);
    setZoomed(false);
    onFile(file);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (!readOnly) take(e.dataTransfer.files[0]);
  };

  const inputs = (
    <>
      <input
        ref={fileInput}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        data-testid="receipt-input"
        onChange={(e) => {
          take(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      <input
        ref={cameraInput}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          take(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
    </>
  );

  return (
    <Card className="overflow-hidden" aria-labelledby="receipt-title">
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5">
        <h2 id="receipt-title" className="font-semibold">
          {t('expenses.receipt.title')}
        </h2>
        {receipt && !readOnly && (
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => fileInput.current?.click()}
              disabled={uploading}
            >
              <Upload aria-hidden />
              {t('expenses.receipt.replace')}
            </Button>
            <Button
              size="icon"
              variant="ghost"
              aria-label={t('expenses.receipt.remove')}
              onClick={onRemove}
              disabled={uploading}
            >
              <Trash2 aria-hidden />
            </Button>
          </div>
        )}
      </div>
      {inputs}

      {uploading ? (
        <div className="flex flex-col items-center gap-3 px-6 py-14 text-center" role="status">
          <Spinner className="size-6 text-brand" />
          <p className="font-medium">{t('expenses.receipt.reading')}</p>
          <p className="text-sm text-muted">{t('expenses.receipt.readingBody')}</p>
        </div>
      ) : receipt ? (
        <div>
          <div className="relative bg-surface-2/60">
            {receipt.mime === 'application/pdf' ? (
              <iframe
                src={`${receipt.url}#toolbar=0&view=FitH`}
                title={receipt.originalName}
                className="h-[420px] w-full border-0 bg-white"
              />
            ) : (
              <div className={cn('overflow-auto', zoomed ? 'max-h-[560px]' : 'max-h-[420px]')}>
                <img
                  src={receipt.url}
                  alt={t('expenses.receipt.alt', { name: receipt.originalName })}
                  className={cn(
                    'mx-auto block',
                    zoomed ? 'max-w-none' : 'max-h-[420px] w-full object-contain',
                  )}
                />
              </div>
            )}
            {receipt.mime !== 'application/pdf' && (
              <Button
                size="icon"
                variant="secondary"
                className="absolute end-3 top-3"
                aria-label={zoomed ? t('expenses.receipt.zoomOut') : t('expenses.receipt.zoomIn')}
                aria-pressed={zoomed}
                onClick={() => setZoomed((z) => !z)}
              >
                {zoomed ? <Minimize2 aria-hidden /> : <Maximize2 aria-hidden />}
              </Button>
            )}
          </div>
          <ReceiptFacts receipt={receipt} />
        </div>
      ) : (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            if (!readOnly) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn(
            'm-4 flex flex-col items-center rounded-card border-2 border-dashed px-6 py-10 text-center transition-colors',
            dragging ? 'border-brand bg-brand/5' : 'border-border',
          )}
          data-testid="receipt-drop"
        >
          <span className="grid size-12 place-items-center rounded-full bg-brand/10 text-brand-solid dark:text-brand">
            <FileUp aria-hidden className="size-5" strokeWidth={1.75} />
          </span>
          <p className="mt-4 font-medium">{t('expenses.receipt.dropTitle')}</p>
          <p className="mt-1 max-w-xs text-sm text-muted">{t('expenses.receipt.dropBody')}</p>
          {!readOnly && (
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <Button variant="secondary" onClick={() => fileInput.current?.click()}>
                <Upload aria-hidden />
                {t('expenses.receipt.choose')}
              </Button>
              <Button
                variant="ghost"
                className="sm:hidden"
                onClick={() => cameraInput.current?.click()}
              >
                <Camera aria-hidden />
                {t('expenses.receipt.camera')}
              </Button>
            </div>
          )}
          <p className="mt-4 text-xs text-muted">{t('expenses.receipt.limits')}</p>
        </div>
      )}

      {error && (
        <p role="alert" className="border-t border-border px-5 py-3 text-sm font-medium text-block">
          {error}
        </p>
      )}
    </Card>
  );
}

function ReceiptFacts({ receipt }: { receipt: AttachedReceipt }) {
  const { t } = useTranslation();
  const fields = receipt.qr?.fields;

  return (
    <div className="space-y-3 border-t border-border px-5 py-4">
      <div className="flex flex-wrap gap-1.5" data-testid="qr-badge">
        {receipt.qrValid === true && <Tag tone="pass">{t('expenses.receipt.qrValid')}</Tag>}
        {receipt.qrValid === false && <Tag tone="block">{t('expenses.receipt.qrInvalid')}</Tag>}
        {receipt.qrValid === null && <Tag>{t('expenses.receipt.qrNotFound')}</Tag>}
        {receipt.duplicate && <Tag tone="warn">{t('expenses.receipt.duplicate')}</Tag>}
      </div>

      {fields && receipt.qrValid !== null && (
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm">
          <dt className="flex items-center gap-1.5 text-muted">
            <QrCode aria-hidden className="size-3.5" />
            {t('expenses.receipt.seller')}
          </dt>
          <dd className="truncate font-medium">{fields.sellerName ?? '—'}</dd>
          <dt className="text-muted ps-5">{t('expenses.receipt.vatNumber')}</dt>
          <dd className="font-mono">{fields.vatNumber ?? '—'}</dd>
          <dt className="text-muted ps-5">{t('expenses.receipt.issued')}</dt>
          <dd>{fields.timestamp ? formatDateTime(fields.timestamp) : '—'}</dd>
          <dt className="text-muted ps-5">{t('expenses.receipt.total')}</dt>
          <dd className="tabular">{fields.total ? formatSar(fields.total) : '—'}</dd>
          <dt className="text-muted ps-5">{t('expenses.receipt.vat')}</dt>
          <dd className="tabular">{fields.vat ? formatSar(fields.vat) : '—'}</dd>
        </dl>
      )}

      {receipt.qr && receipt.qr.errors.length > 0 && (
        <ul className="space-y-1 text-xs text-block">
          {receipt.qr.errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}

      {receipt.ocrUsed && (
        <p className="flex items-start gap-2 rounded-input bg-brand/5 px-3 py-2 text-xs text-muted">
          <ScanText aria-hidden className="mt-px size-3.5 shrink-0 text-brand" />
          {t('expenses.receipt.ocrNote')}
        </p>
      )}
    </div>
  );
}
