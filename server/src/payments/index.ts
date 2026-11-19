// How customers pay for a request.
//
// Today the only provider is "whatsapp_manual": the customer messages us on
// WhatsApp, we send a UPI QR code, they send a screenshot and an admin
// approves the request in /admin.
//
// To add a gateway such as Razorpay later:
//  1. Add a provider here whose checkout() creates an order and returns what
//     the web app needs to open the gateway's checkout.
//  2. Add a webhook route that verifies the gateway's signature and calls
//     fulfilRequest() from services/requests.ts with the payment id as
//     paymentRef - the same function the admin "Approve" button uses.
//  3. Store the provider id in Request.paymentMethod.

import type { PaymentInstructions } from "../../../shared/api";
import { whatsappLink } from "../../../shared/phone";
import { requestMessage } from "../services/messages";

export type CheckoutRequest = {
  kind: string;
  code: string;
  planName: string;
  price: number;
  name: string;
  flipbookTitle?: string | null;
};

export interface PaymentProvider {
  id: string;
  checkout(request: CheckoutRequest, ctx: { adminWhatsapp: string }): PaymentInstructions;
}

export const whatsappManual: PaymentProvider = {
  id: "whatsapp_manual",
  checkout(request, ctx) {
    return {
      method: "whatsapp_manual",
      whatsappUrl: whatsappLink(ctx.adminWhatsapp, requestMessage(request)),
      steps: [
        "Message us on WhatsApp with your reference code.",
        "We send you a UPI QR code.",
        "Pay and send the payment screenshot on WhatsApp.",
        request.kind === "instant"
          ? "We send your one-time download link."
          : request.kind === "renewal"
            ? "We renew your plan on the same account."
            : "We send your username and password.",
      ],
    };
  },
};

export const paymentProvider: PaymentProvider = whatsappManual;
