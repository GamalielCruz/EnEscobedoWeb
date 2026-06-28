"use client";

import {
  DashboardDescription,
  DashboardEmptyState,
  DashboardEyebrow,
  DashboardPanel,
  DashboardPanelBody,
  DashboardPanelHeader,
  DashboardStatusPill,
  DashboardTitle,
} from "./dashboard.design";
import { statusConfig } from "./dashboard.constants";
import { formatDate } from "./dashboard.utils";

type RequestStatusItem = {
  id: string;
  title: string;
  subtitle: string;
  status: "pending" | "approved" | "rejected";
  date?: string;
  details: string[];
  rejectionReason?: string;
};

type RequestStatusListProps = {
  title: string;
  description: string;
  emptyMessage: string;
  items: RequestStatusItem[];
};

export function RequestStatusList({
  title,
  description,
  emptyMessage,
  items,
}: RequestStatusListProps) {
  return (
    <DashboardPanel>
      <DashboardPanelHeader>
        <DashboardEyebrow>Workflow</DashboardEyebrow>
        <DashboardTitle className="text-[17px]">{title}</DashboardTitle>
        <DashboardDescription>{description}</DashboardDescription>
      </DashboardPanelHeader>
      <DashboardPanelBody className="space-y-3">
        {items.length === 0 ? (
          <DashboardEmptyState title="Sin movimientos" description={emptyMessage} />
        ) : (
          items.map((item) => {
            const status = statusConfig[item.status];
            return (
              <div
                key={item.id}
                className="relative rounded-xl border border-black/6 bg-[#fafafb] px-4 py-3"
              >
                <div className="absolute left-4 top-4 h-2 w-2 rounded-full bg-gray-300" />
                <div className="ml-5 flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-950">{item.title}</p>
                    <p className="mt-0.5 text-[13px] text-gray-600">{item.subtitle}</p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <DashboardStatusPill className={status?.color}>
                      {status?.label ?? item.status}
                    </DashboardStatusPill>
                    <span className="text-[11px] text-gray-500">{formatDate(item.date)}</span>
                  </div>
                </div>

                {item.details.length > 0 ? (
                  <ul className="ml-5 mt-3 space-y-1 text-[13px] text-gray-700">
                    {item.details.map((detail) => (
                      <li key={detail}>• {detail}</li>
                    ))}
                  </ul>
                ) : null}

                {item.rejectionReason ? (
                  <div className="ml-5 mt-3 rounded-lg border border-[#EB1902]/10 bg-[#fff1ef] px-3 py-2 text-sm text-[#850C22]">
                    Motivo de rechazo: {item.rejectionReason}
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </DashboardPanelBody>
    </DashboardPanel>
  );
}
