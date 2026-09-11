# Customer Data Protection, NIF Profiles & Privacy (Phase 8)

## 1. Overview & Privacy Principles

AURA Studio treats customer financial and fiscal data with rigorous privacy standards under the General Data Protection Regulation (GDPR) and Portuguese tax authority privacy frameworks.

Core principles:
1. **Consent-First Retention**: Fiscal profiles are only saved for recurring visits when the diner explicitly checks "Save fiscal profile for future orders".
2. **Masked Administrative Display**: Plaintext NIFs/tax IDs are never displayed in bulk customer lists or administrative directories. Masking formats such as `PT*****123` are enforced.
3. **Immutable Frozen Snapshots**: Complete legal tax data is recorded exclusively inside immutable `FiscalDocument` snapshots associated with specific transactions.

---

## 2. Customer & Fiscal Profile Data Model

```prisma
model Customer {
  id               String                  @id @default(uuid())
  restaurantId     String?
  name             String?
  email            String?
  phone            String?
  consentGiven     Boolean                 @default(false)
  consentTimestamp DateTime?
  createdAt        DateTime                @default(now())
  updatedAt        DateTime                @updatedAt
  fiscalProfiles   CustomerFiscalProfile[]
  orders           Order[]
}

model CustomerFiscalProfile {
  id                String   @id @default(uuid())
  customerId        String
  nif               String
  legalName         String
  taxCountry        String   @default("PT")
  billingAddress    String?
  billingPostalCode String?
  billingCity       String?
  isDefault         Boolean  @default(true)
  createdAt         DateTime @default(now())
}
```

---

## 3. Masking & Protection Rules

1. **Staff & Directory Views**:
   - The endpoint `GET /api/restaurants/:id/customers` returns masked NIF identifiers (e.g. `PT*****789`).
   - Phone numbers and emails are displayed for operational fulfillment only.
2. **Guest Ordering**:
   - If a diner inputs their NIF for an invoice but does not check "Save fiscal profile", the NIF is stored strictly on the specific `Order` and generated `FiscalDocument`. No permanent `CustomerFiscalProfile` record is linked.
3. **Right to Erasure (GDPR Art. 17)**:
   - Diners can request deletion of their reusable fiscal profile.
   - Note: Previously issued `FiscalDocument` records must remain immutable and preserved in accordance with Portuguese statutory accounting and retention laws (Article 123 of CIRC).
