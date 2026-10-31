"use client";

import { usePathname, useRouter } from "next/navigation";

/**
 * Demo-only identity switcher. The hackathon build has no login; this lets a
 * judge act as each sibling to see multi-person approval work.
 */
export function MemberSwitcher({ members, current }: { members: { id: string; name: string }[]; current: string }) {
  const router = useRouter();
  const path = usePathname();
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-ink-soft">Viewing as</span>
      <select
        value={current}
        onChange={(e) => router.push(`${path}?as=${e.target.value}`)}
        className="min-h-10 rounded-lg border border-rule bg-sheet px-3 font-bold"
      >
        {members.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
    </label>
  );
}
