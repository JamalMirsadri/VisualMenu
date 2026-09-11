/**
 * NIF (Número de Identificação Fiscal) and Tax Identification Validator
 * 
 * Implements authoritative Portuguese NIF checksum calculation (Modulo 11)
 * and normalizes international VAT / tax identifiers.
 */

export interface ValidationResult {
  valid: boolean;
  isValid: boolean;
  normalizedTaxId: string;
  country: string;
  error?: string;
}

export class NifValidator {
  /**
   * Validates a Portuguese NIF according to standard Modulo 11 check digit rules.
   * 
   * Criteria:
   * - Must be exactly 9 numeric digits.
   * - First digit must be one of:
   *   1, 2, 3: Individual / Singular person
   *   5: Legal entity (Company / Collective person)
   *   6: Public administrative entity
   *   8: Non-profit / special entity
   *   9: Irregular entity / provisional
   *   Or 2-digit prefixes: 45 (non-resident individual), 70, 71, 72, 77, 78, 79
   * - Checksum calculation:
   *   sum = (d1 * 9) + (d2 * 8) + (d3 * 7) + (d4 * 6) + (d5 * 5) + (d6 * 4) + (d7 * 3) + (d8 * 2)
   *   mod = sum % 11
   *   expectedCheckDigit = (mod === 0 || mod === 1) ? 0 : 11 - mod
   *   d9 must match expectedCheckDigit
   */
  public static validatePortugueseNif(nif: string): boolean {
    const clean = String(nif).replace(/\s+/g, '').replace(/[-.]/g, '');

    if (!/^\d{9}$/.test(clean)) {
      return false;
    }

    const firstDigit = clean.charAt(0);
    const firstTwoDigits = clean.substring(0, 2);

    const validFirstDigits = ['1', '2', '3', '5', '6', '8', '9'];
    const validFirstTwoDigits = ['45', '70', '71', '72', '77', '78', '79'];

    const isValidPrefix =
      validFirstDigits.includes(firstDigit) || validFirstTwoDigits.includes(firstTwoDigits);

    if (!isValidPrefix) {
      return false;
    }

    let sum = 0;
    for (let i = 0; i < 8; i++) {
      sum += parseInt(clean.charAt(i), 10) * (9 - i);
    }

    const mod = sum % 11;
    const expectedCheckDigit = mod === 0 || mod === 1 ? 0 : 11 - mod;
    const actualCheckDigit = parseInt(clean.charAt(8), 10);

    return actualCheckDigit === expectedCheckDigit;
  }

  /**
   * Validates and normalizes tax identification for any specified country.
   * Defaults to Portugal ('PT').
   */
  public static validate(taxId: string, country = 'PT'): ValidationResult {
    if (!taxId || typeof taxId !== 'string') {
      return {
        valid: false,
        isValid: false,
        normalizedTaxId: '',
        country,
        error: 'Tax identifier is required.',
      };
    }

    const clean = taxId.trim().toUpperCase().replace(/[\s-.]/g, '');
    const normalizedCountry = (country || 'PT').trim().toUpperCase();

    if (normalizedCountry === 'PT') {
      const isValid = this.validatePortugueseNif(clean);
      if (!isValid) {
        return {
          valid: false,
          isValid: false,
          normalizedTaxId: clean,
          country: 'PT',
          error: 'Invalid Portuguese NIF (check digit or format mismatch).',
        };
      }
      return {
        valid: true,
        isValid: true,
        normalizedTaxId: clean,
        country: 'PT',
      };
    }

    // International format validation:
    // Minimum 4 alphanumeric characters, maximum 30 characters
    if (!/^[A-Z0-9]{4,30}$/.test(clean)) {
      return {
        valid: false,
        isValid: false,
        normalizedTaxId: clean,
        country: normalizedCountry,
        error: `Invalid tax identifier format for country ${normalizedCountry}.`,
      };
    }

    return {
      valid: true,
      isValid: true,
      normalizedTaxId: clean,
      country: normalizedCountry,
    };
  }
}
