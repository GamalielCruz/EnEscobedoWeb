export const COUPON_CODES = {
    BUENFIN: "BUENFIN",
    BFRIDAY: "BFRIDAY",
    HOTSALE: "HOTSALE",
    ARBOL: "ARBOL",
    TRALALA: "TRALALA",
} as const;

export type CouponCode = keyof typeof COUPON_CODES;