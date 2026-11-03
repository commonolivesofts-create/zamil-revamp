import { AdminPage, Panel } from "@/features/security-administration/components/AdminUi.jsx";

export default function PendingWorklistPage() {
  return (
    <AdminPage
      eyebrow="Worklist report"
      title="Pending Worklist"
      description="Review approval items that are waiting for your action."
    >
      <Panel title="Pending items" description="Current items assigned to you.">
        <p className="zrv-admin-state" role="status">
          Pending count: <strong>Not available</strong> until worklist reporting is connected.
        </p>
        <p className="zrv-admin-note">
          Workflow execution is not active in this app, so it does not currently create approval tasks or pending report
          rows.
        </p>
      </Panel>
    </AdminPage>
  );
}
