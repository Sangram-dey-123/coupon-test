import pool from '../db.js';

/**
 * Create a new coupon.
 */
export async function createCoupon(
  code,
  discountType,
  discountValue,
  minSpend,
  expiresAt,
  usageLimit,
  maxDiscountAmount = null,
  usageLimitPerUser = null
) {
  // Validate coupon code
  if (!code || !code.trim()) {
    throw new Error('Coupon code is required');
  }

  // Validate discount type
  if (!['percent', 'flat'].includes(discountType)) {
    throw new Error('Discount type must be percent or flat');
  }

  // Validate discount value
  if (!Number.isFinite(discountValue) || discountValue <= 0) {
    throw new Error('Discount value must be greater than 0');
  }

  // Percent discount cannot exceed 100%
  if (discountType === 'percent' && discountValue > 100) {
    throw new Error('Percent discount cannot exceed 100');
  }

  // Validate minimum spend
  if (!Number.isFinite(minSpend) || minSpend < 0) {
    throw new Error('Minimum spend cannot be negative');
  }

  // Validate usage limit
  if (!Number.isInteger(usageLimit) || usageLimit <= 0) {
    throw new Error('Usage limit must be a positive integer');
  }

  // Validate expiry date
  const expiryDate = new Date(expiresAt);

  if (Number.isNaN(expiryDate.getTime())) {
    throw new Error('Invalid expiry date');
  }

  // Bonus 1: maximum discount amount
  if (
    maxDiscountAmount !== null &&
    (!Number.isFinite(maxDiscountAmount) || maxDiscountAmount <= 0)
  ) {
    throw new Error('Maximum discount amount must be greater than 0');
  }

  // Bonus 2: per-user usage limit
  if (
    usageLimitPerUser !== null &&
    (!Number.isInteger(usageLimitPerUser) || usageLimitPerUser <= 0)
  ) {
    throw new Error('Per-user usage limit must be a positive integer');
  }

  try {
    await pool.query(
      `INSERT INTO coupons
       (code, discount_type, discount_value, min_spend, expires_at,
        usage_limit, max_discount_amount, usage_limit_per_user)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        code.trim(),
        discountType,
        discountValue,
        minSpend,
        expiryDate.toISOString(),
        usageLimit,
        maxDiscountAmount,
        usageLimitPerUser
      ]
    );
  } catch (err) {
    if (err.code === '23505') {
      throw new Error(`Coupon '${code}' already exists`);
    }

    throw err;
  }

  return `Coupon '${code.trim()}' created successfully`;
}