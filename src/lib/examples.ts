/**
 * The example circles (Walter's, and the Okafor family's care pot) let anyone
 * try Tend on pretend money: they're loaded on first boot, offered on the
 * front page and at /demo, and anyone can open them as any of their people.
 *
 * That's right for a sandbox and wrong for real money, so they're always off
 * on live PayPal (PAYPAL_ENV=live) and can be turned off anywhere with
 * TEND_EXAMPLES=0. Off means nothing is loaded and every way in is closed:
 * the front page, /demo, opening a circle as someone, and the reset.
 */
export function examplesOn(): boolean {
  if (process.env.PAYPAL_ENV === "live") return false;
  const v = process.env.TEND_EXAMPLES?.trim().toLowerCase();
  return !(v === "0" || v === "off" || v === "false" || v === "no");
}
