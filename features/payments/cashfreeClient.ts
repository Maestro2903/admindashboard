import { load, type Cashfree } from '@cashfreepayments/cashfree-js';

let _cashfree: Cashfree | null = null;

export async function getCashfree(): Promise<Cashfree> {
  if (_cashfree) return _cashfree;
  
  const isProd = process.env.NEXT_PUBLIC_CASHFREE_ENV === 'production';
  _cashfree = await load({
    mode: isProd ? 'production' : 'sandbox',
  });
  
  return _cashfree;
}

export async function openCashfreeCheckout(paymentSessionId: string) {
  const cf = await getCashfree();
  const result = await cf.checkout({
    paymentSessionId,
    redirectTarget: '_modal', // Opens as a popup/overlay
  });
  return result;
}
