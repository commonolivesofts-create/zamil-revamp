// Attendance Interface (CI3 /interface): the two data-loading jobs.
// Upload works now; Generate (attendance processing) arrives in phase 5.
import { useState } from 'react';
import { OrvexaIcon } from '../../components/OrvexaIcon';
import { UploadDialog } from './UploadDialog';

export default function InterfacePage() {
  const [uploading, setUploading] = useState(false);

  return (
    <div className="zrv-hr zrv-hr--interface zrv-hr--compact zrv-ir zrv-ir--fitted zrv-ir--responsive zat-report">
      <header className="zrv-ir-head">
        <div className="zrv-ir-head__title">
          <nav aria-label="Breadcrumb">
            <ol className="zrv-ir-crumb">
              <li>Attendance</li>
              <li>Interface &amp; Jobs</li>
              <li>Attendance Interface</li>
            </ol>
          </nav>
          <h1 className="zrv-hr-title">Attendance Interface</h1>
          <p className="zrv-hr-sub">
            Load punches from the attendance devices and generate the timesheet.
          </p>
        </div>
      </header>

      <div className="zat-job-grid">
        <section className="zrv-ir-card zat-job" aria-labelledby="job-upload">
          <span className="zat-job__icon" aria-hidden="true">
            <OrvexaIcon name="file-up" size={22} />
          </span>
          <div>
            <h2 id="job-upload">Upload Attendance File</h2>
            <p className="zat-muted">
              Load a CSV or XLSX biometric export (Employee ID, Date, First Punch, Last Punch) into
              the attendance card. Preview first; only valid rows of active employees are imported.
            </p>
          </div>
          <button type="button" className="btn-primary" onClick={() => setUploading(true)}>
            Upload file
          </button>
        </section>

        <section className="zrv-ir-card zat-job" aria-labelledby="job-generate">
          <span className="zat-job__icon" aria-hidden="true">
            <OrvexaIcon name="calendar-check" size={22} />
          </span>
          <div>
            <h2 id="job-generate">Generate Attendance</h2>
            <p className="zat-muted">
              Calculates late, early, overtime and absence for a department, employee and date
              range. Arrives with the processing engine in phase 5; until then use the current
              attendance system.
            </p>
          </div>
          <button type="button" className="btn-secondary" disabled>
            Planned · phase 5
          </button>
        </section>
      </div>

      {uploading && <UploadDialog onClose={() => setUploading(false)} />}
    </div>
  );
}
