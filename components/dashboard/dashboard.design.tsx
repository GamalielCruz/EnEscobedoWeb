"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const panelVariants = cva(
  "rounded-2xl border border-black/6 bg-white text-gray-900 shadow-[0_1px_2px_rgba(16,24,40,0.04)]",
  {
    variants: {
      density: {
        default: "",
        compact: "",
      },
      tone: {
        default: "",
        subtle: "bg-[#fbfbfc]",
        danger: "border-[#EB1902]/12 bg-[#fff8f7]",
      },
    },
    defaultVariants: {
      density: "default",
      tone: "default",
    },
  }
);

const statusPillVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium tracking-[0.01em]",
  {
    variants: {
      tone: {
        neutral: "border-gray-200 bg-gray-50 text-gray-700",
        brand: "border-[#EB1902]/12 bg-[#fff1ef] text-[#850C22]",
        success: "border-[#20096F]/12 bg-[#eff2ff] text-[#20096F]",
        warning: "border-[#850C22]/12 bg-[#fff3f4] text-[#850C22]",
        accent: "border-[#9943ED]/12 bg-[#f6f0ff] text-[#6d33bf]",
        danger: "border-[#EB1902]/12 bg-[#fff1ef] text-[#EB1902]",
      },
    },
    defaultVariants: {
      tone: "neutral",
    },
  }
);

export function DashboardPanel({
  className,
  density,
  tone,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof panelVariants>) {
  return <section className={cn(panelVariants({ density, tone }), className)} {...props} />;
}

export function DashboardPanelHeader({
  className,
  align = "default",
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { align?: "default" | "spread" }) {
  return (
    <div
      className={cn(
        "flex gap-3 border-b border-black/6 px-5 py-4",
        align === "spread"
          ? "flex-col md:flex-row md:items-start md:justify-between"
          : "flex-col",
        className
      )}
      {...props}
    />
  );
}

export function DashboardPanelBody({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-5 py-4", className)} {...props} />;
}

export function DashboardEyebrow({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn(
        "text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500",
        className
      )}
      {...props}
    />
  );
}

export function DashboardTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn("text-[18px] font-semibold tracking-[-0.01em] text-gray-950", className)} {...props} />;
}

export function DashboardDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-sm leading-5 text-gray-600", className)} {...props} />;
}

export function DashboardStatusPill({
  className,
  tone,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof statusPillVariants>) {
  return <Badge className={cn(statusPillVariants({ tone }), className)} {...props} />;
}

export function DashboardEmptyState({
  className,
  title,
  description,
}: {
  title: string;
  description: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-dashed border-gray-200 bg-[#fafafa] px-4 py-10 text-center",
        className
      )}
    >
      <p className="text-sm font-medium text-gray-900">{title}</p>
      <p className="mt-1 text-sm text-gray-500">{description}</p>
    </div>
  );
}

export function DashboardMetricValue({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-[24px] font-semibold tracking-[-0.02em] text-gray-950", className)} {...props} />;
}
