import { prisma } from '../prisma';

export interface ResolveCustomerInput {
  restaurantId: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  taxId?: string | null; // normalized NIF
  taxCountry?: string;
  gdprConsent?: boolean;
  marketingConsent?: boolean;
}

/**
 * Resolves or creates a persistent customer profile keyed on
 * (restaurantId, normalized NIF), with email/phone fallback. Never duplicates
 * an existing customer within a restaurant and preserves fiscal (NIF) data.
 */
export class CustomerService {
  static async resolveForCheckout(input: ResolveCustomerInput) {
    const {
      restaurantId,
      name,
      email,
      phone,
      taxId,
      taxCountry = 'PT',
      gdprConsent = false,
      marketingConsent = false,
    } = input;

    const normalizedTaxId = taxId?.trim() || null;
    const normalizedEmail = email?.trim().toLowerCase() || null;
    const normalizedPhone = phone?.trim() || null;
    const consentAt = gdprConsent ? new Date() : null;

    let customer: any = null;

    if (normalizedTaxId) {
      customer = await prisma.customer.findFirst({ where: { restaurantId, taxId: normalizedTaxId } });
    }
    if (!customer && normalizedEmail) {
      customer = await prisma.customer.findFirst({ where: { restaurantId, email: normalizedEmail } });
    }
    if (!customer && normalizedPhone) {
      customer = await prisma.customer.findFirst({ where: { restaurantId, phone: normalizedPhone } });
    }

    if (!customer) {
      customer = await prisma.customer.create({
        data: {
          restaurantId,
          name: name?.trim() || null,
          email: normalizedEmail,
          phone: normalizedPhone,
          taxId: normalizedTaxId,
          taxCountry: taxCountry || 'PT',
          gdprConsent,
          gdprConsentAt: consentAt,
          marketingConsent,
          marketingConsentAt: marketingConsent ? new Date() : null,
        },
      });
    } else {
      const update: any = {};
      if (normalizedTaxId && !customer.taxId) update.taxId = normalizedTaxId;
      if (name?.trim() && name.trim() !== customer.name) update.name = name.trim();
      if (normalizedEmail && normalizedEmail !== customer.email) update.email = normalizedEmail;
      if (normalizedPhone && normalizedPhone !== customer.phone) update.phone = normalizedPhone;
      if (gdprConsent && !customer.gdprConsent) {
        update.gdprConsent = true;
        update.gdprConsentAt = new Date();
      }
      if (Object.keys(update).length > 0) {
        customer = await prisma.customer.update({ where: { id: customer.id }, data: update });
      }
    }

    if (normalizedTaxId) {
      const existingProfile = await prisma.customerFiscalProfile.findFirst({
        where: { customerId: customer.id, taxId: normalizedTaxId },
      });
      if (!existingProfile) {
        await prisma.customerFiscalProfile.create({
          data: {
            customerId: customer.id,
            taxId: normalizedTaxId,
            taxCountry: taxCountry || 'PT',
            billingName: name?.trim() || undefined,
          },
        });
      }
    }

    return customer;
  }
}
