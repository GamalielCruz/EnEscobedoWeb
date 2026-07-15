export type SupportCategory =
  | "greeting"
  | "business_hours"
  | "coverage"
  | "payment_methods"
  | "promotions"
  | "delivery_cost"
  | "pickup"
  | "how_to_order"
  | "human_support"
  | "operational_query"
  | "sensitive_case"
  | "unknown";

export type SupportClassification = {
  category: SupportCategory;
  confidence: "high" | "medium" | "low";
  matchedRule?: string;
};
