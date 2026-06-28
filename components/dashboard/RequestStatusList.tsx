"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

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
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-8 text-center text-gray-500">
            {emptyMessage}
          </div>
        ) : (
          items.map((item) => {
            const status = statusConfig[item.status];
            return (
              <div key={item.id} className="rounded-2xl border border-gray-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-gray-900">{item.title}</p>
                    <p className="text-sm text-gray-600">{item.subtitle}</p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <Badge className={status?.color}>{status?.label ?? item.status}</Badge>
                    <span className="text-xs text-gray-500">{formatDate(item.date)}</span>
                  </div>
                </div>

                {item.details.length > 0 ? (
                  <ul className="mt-3 space-y-1 text-sm text-gray-700">
                    {item.details.map((detail) => (
                      <li key={detail}>• {detail}</li>
                    ))}
                  </ul>
                ) : null}

                {item.rejectionReason ? (
                  <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    Motivo de rechazo: {item.rejectionReason}
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
