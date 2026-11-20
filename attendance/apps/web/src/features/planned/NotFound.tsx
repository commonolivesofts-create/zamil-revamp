import { Link } from 'react-router';
import { RouteNotice } from '../../components/Feedback';

export function NotFound() {
  return (
    <RouteNotice
      eyebrow="404"
      title="Page not found"
      description="This address is not part of the attendance system."
      action={
        <Link className="zrv-route-notice__action" to="/report/employee-details">
          Go to Employee Details
        </Link>
      }
    />
  );
}
