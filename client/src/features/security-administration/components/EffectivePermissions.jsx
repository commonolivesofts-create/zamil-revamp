import { groupPermissions } from '../permissionPresentation.js'
import { securityAdminService } from '../securityAdminService.js'
import { useResource } from '../useAdminData.js'
import { Panel, ResourceState } from './AdminUi.jsx'

// The account's effective access exactly as resolved by the server
// (GET /access-control/users/{userId}/effective-permissions, USER_ROLES:VIEW):
// role grants and ALLOW overrides, minus DENY overrides. Nothing is
// recomputed here. `version` changes after an assignment or override change.
export default function EffectivePermissions({ userId, version }) {
  const effective = useResource(`effective:${userId}:${version}`, (signal) => securityAdminService.getUserEffectivePermissions(userId, { signal }))
  return (
    <Panel title="Effective access" description="Resolved by the server from role grants and overrides" className="zrv-admin-grid__wide">
      <ResourceState resource={effective} label="effective permissions" empty="The account holds no effective permissions.">
        {(data) => (
          <div className="zrv-access-modules">
            {groupPermissions(data).map((module) => (
              <section key={module.moduleCode} className="zrv-access-module" aria-label={module.label}>
                <h3>{module.label}</h3>
                <ul>
                  {module.resources.map((resource) => (
                    <li key={resource.resourceCode}>
                      <span className="zrv-access-resource">{resource.label}</span>
                      <span className="zrv-chips">
                        {resource.actions.map((item) => (
                          <span key={item.actionCode} className="zrv-chip" title={[item.viaRole && 'through a role', item.viaOverride && 'through an ALLOW override'].filter(Boolean).join(' and ')}>
                            {item.actionCode}{!item.viaRole && item.viaOverride && <small> · override</small>}
                          </span>
                        ))}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </ResourceState>
    </Panel>
  )
}
