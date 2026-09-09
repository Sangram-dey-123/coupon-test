import pool from '../db.js';

/**
 * Get coupon details.
 */
export async function getCoupon(code) {
  if (!code || !code.trim()) {
    throw new Error('Coupon code is required');
  }

  const result = await pool.query(
    `SELECT
       code,
       times_used,
       usage_limit,
       expires_at
     FROM coupons
     WHERE code = $1`,
    [code.trim()]
  );

  if (result.rows.length === 0) {
    throw new Error(`Coupon '${code}' does not exist`);
  }

  const coupon = result.rows[0];

  return {
    code: coupon.code,
    timesUsed: Number(coupon.times_used),
    usageLimit: Number(coupon.usage_limit),
    expiresAt: coupon.expires_at.toISOString()
  };
}