declare module '@cashfreepayments/cashfree-js' {
    export interface CashfreeOptions {
        mode: 'sandbox' | 'production';
    }

    export interface CheckoutOptions {
        paymentSessionId: string;
        redirectTarget?: string;
    }

    export interface CheckoutResult {
        error?: {
            message: string;
            code: string;
            type: string;
        };
    }

    export interface Cashfree {
        checkout(options: CheckoutOptions): Promise<CheckoutResult>;
    }

    export function load(options: CashfreeOptions): Promise<Cashfree>;
}
