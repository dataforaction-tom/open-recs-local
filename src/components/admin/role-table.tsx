'use client';

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
  if (rows.length === 0) {
    return (
      <p className="font-serif text-sm italic text-muted-foreground">No users yet.</p>
    );
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-rule-strong text-left">
          <th className="px-2 py-2 font-medium text-muted-foreground">Email</th>
          <th className="px-2 py-2 font-medium text-muted-foreground">Name</th>
          <th className="px-2 py-2 font-medium text-muted-foreground">Role</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-rule">
        {rows.map((row) => (
          <tr key={row.id}>
            <td className="px-2 py-3 font-mono text-xs">{row.email}</td>
            <td className="px-2 py-3 text-muted-foreground">{row.name ?? '—'}</td>
            <td className="px-2 py-3">
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
  );
}
