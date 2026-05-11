'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EditableSelectCell } from '@/components/recommendations/editable-select-cell';
import { ROLES, type Role } from '@/lib/db/schema';
import type { UserWithRoles } from '@/lib/repositories/user-role';

const ROLE_OPTIONS = ROLES.map((r) => ({ value: r, label: r }));

export type ChangeRoleAction = (
  input: { userId: string; role: Role },
) => Promise<{ ok: true } | { ok: false; error: string }>;

type Props = {
  rows: UserWithRoles[];
  onChange: ChangeRoleAction;
};

function effectiveRole(roles: Role[]): Role {
  if (roles.includes('admin')) return 'admin';
  if (roles.includes('editor')) return 'editor';
  return 'viewer';
}

export function RoleTable({ rows, onChange }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Users &amp; roles</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No users yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-border">
              <tr>
                <th className="px-2 py-2 text-left font-medium">Email</th>
                <th className="px-2 py-2 text-left font-medium">Name</th>
                <th className="px-2 py-2 text-left font-medium">Role</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-border last:border-b-0">
                  <td className="px-2 py-2">{row.email}</td>
                  <td className="px-2 py-2 text-muted-foreground">{row.name ?? '—'}</td>
                  <td className="px-2 py-2">
                    <EditableSelectCell<Role>
                      value={effectiveRole(row.roles)}
                      options={ROLE_OPTIONS}
                      onSubmit={(role) => onChange({ userId: row.id, role })}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}
