"use client";

import { useQuery } from "@tanstack/react-query";
import { Shell } from "@/components/layout/Shell";
import { Card } from "@/components/ui/Card";
import { Table, Thead, Tbody, Th, Tr, Td } from "@/components/ui/Table";
import { useApiClient } from "@/lib/session";

function formatResource(type: string | null, id: string | null): string {
  if (!type && !id) return "—";
  if (type && id) return `${type}:${id}`;
  return type ?? id ?? "—";
}

function formatActor(ev: {
  actor_user_id: string | null;
  actor_key_id: string | null;
  actor: string | null;
}): { label: string; tooltip: string } {
  if (ev.actor_user_id) {
    return {
      label: `user:${ev.actor_user_id.slice(0, 8)}…`,
      tooltip: `Cloud user · ${ev.actor_user_id}`,
    };
  }
  if (ev.actor_key_id) {
    return {
      label: `key:${ev.actor_key_id.slice(0, 8)}…`,
      tooltip: `API key · ${ev.actor_key_id}`,
    };
  }
  if (ev.actor) {
    // Legacy row that the server already display-stripped — show as-is.
    return { label: ev.actor, tooltip: ev.actor };
  }
  return { label: "—", tooltip: "" };
}

export default function AuditPage() {
  const client = useApiClient();

  const { data, error } = useQuery({
    queryKey: ["audit"],
    queryFn: () => client!.audit(50),
    enabled: !!client,
    retry: false,
  });

  const isServiceUnavailable =
    error && typeof error === "object" && "status" in error && (error as { status?: number }).status === 503;

  return (
    <Shell>
      <div className="space-y-6">
        <div className="flex items-baseline justify-between">
          <h1 className="text-xl font-semibold">Audit Log</h1>
          {data && (
            <span className="text-xs text-text-secondary">
              Showing {data.events.length} of {data.total}
            </span>
          )}
        </div>

        {isServiceUnavailable ? (
          <Card>
            <p className="text-sm text-text-secondary">
              Audit log is only available on DB-backed deployments. Configure{" "}
              <code className="font-mono">ENGRAMIA_DATABASE_URL</code> to enable.
            </p>
          </Card>
        ) : error ? (
          <Card>
            <p className="text-sm text-text-secondary">
              Unable to load audit log. You may not have the{" "}
              <code className="font-mono">audit:read</code> permission (admin+).
            </p>
          </Card>
        ) : (
          <Card className="p-0">
            {!data?.events.length ? (
              <p className="p-8 text-center text-sm text-text-secondary">No audit events</p>
            ) : (
              <Table>
                <Thead>
                  <tr>
                    <Th>Time</Th>
                    <Th>Event</Th>
                    <Th>Actor</Th>
                    <Th>Resource</Th>
                    <Th>IP</Th>
                    <Th>Detail</Th>
                  </tr>
                </Thead>
                <Tbody>
                  {data.events.map((ev, i) => {
                    const actor = formatActor(ev);
                    return (
                      <Tr key={i}>
                        <Td className="text-xs text-text-secondary whitespace-nowrap">
                          {ev.timestamp
                            ? new Date(ev.timestamp).toLocaleString()
                            : "—"}
                        </Td>
                        <Td className="font-mono text-xs">{ev.action}</Td>
                        <Td
                          className="font-mono text-xs"
                          title={actor.tooltip}
                        >
                          {actor.label}
                        </Td>
                        <Td className="max-w-[220px] truncate font-mono text-xs">
                          {formatResource(ev.resource_type, ev.resource_id)}
                        </Td>
                        <Td className="font-mono text-xs text-text-secondary">
                          {ev.ip ?? "—"}
                        </Td>
                        <Td className="max-w-[300px] truncate text-xs text-text-secondary">
                          {ev.detail ? (
                            <span
                              className="cursor-help"
                              title={JSON.stringify(ev.detail, null, 2)}
                            >
                              {JSON.stringify(ev.detail)}
                            </span>
                          ) : (
                            "—"
                          )}
                        </Td>
                      </Tr>
                    );
                  })}
                </Tbody>
              </Table>
            )}
          </Card>
        )}
      </div>
    </Shell>
  );
}
