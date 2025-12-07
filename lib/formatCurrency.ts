export function formatCurrency(
    amount: number,
    currencyCode: string = "mxn"
): string {
    try {
        return new Intl.NumberFormat("es-MX", {
            style: "currency",
            currency: currencyCode.toUpperCase(),
            }).format(amount);
    } catch (error) {
        console.log("Invalid currency code: ", currencyCode, error);
        return `${currencyCode.toLocaleUpperCase()} ${amount.toFixed(2)}`;
    }
}