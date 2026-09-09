import pool from '../db.js';

/**
 * Create a new order and apply a single coupon.
 */
export async function applyCoupon(cartTotal, code, userId = null) {
  if (!Number.isFinite(cartTotal) || cartTotal < 0) {
    throw new Error('Cart total must be a non-negative number');
  }

  if (!code || !code.trim()) {
    throw new Error('Coupon code is required');
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Lock the coupon row to make usage-limit updates concurrency-safe.
    const couponResult = await client.query(
      `SELECT *
       FROM coupons
       WHERE code = $1
       FOR UPDATE`,
      [code.trim()]
    );

    if (couponResult.rows.length === 0) {
      throw new Error(`Coupon '${code}' does not exist`);
    }

    const coupon = couponResult.rows[0];

    // Check expiry.
    if (new Date(coupon.expires_at) <= new Date()) {
      throw new Error(`Coupon '${code}' has expired`);
    }

    // Check minimum spend.
    if (cartTotal < Number(coupon.min_spend)) {
      throw new Error(
        `Minimum spend of ${Number(coupon.min_spend).toFixed(2)} required`
      );
    }

    // Check global usage limit.
    if (coupon.times_used >= coupon.usage_limit) {
      throw new Error(`Coupon '${code}' has reached its usage limit`);
    }

    // Bonus 2: check per-user usage limit.
    if (coupon.usage_limit_per_user !== null) {
      if (!userId) {
        throw new Error(
          `User ID is required for coupon '${code}'`
        );
      }

      const userUsageResult = await client.query(
        `SELECT COUNT(*) AS count
         FROM orders
         WHERE coupon_code = $1
           AND user_id = $2
           AND status <> 'cancelled'`,
        [code.trim(), userId]
      );

      const userUsage = Number(userUsageResult.rows[0].count);

      if (userUsage >= coupon.usage_limit_per_user) {
        throw new Error(
          `Coupon '${code}' has reached its per-user usage limit`
        );
      }
    }

    // Calculate discount.
    let discountAmount;

    if (coupon.discount_type === 'percent') {
      discountAmount =
        cartTotal * (Number(coupon.discount_value) / 100);

      // Bonus 1: cap percentage discount.
      if (coupon.max_discount_amount !== null) {
        discountAmount = Math.min(
          discountAmount,
          Number(coupon.max_discount_amount)
        );
      }
    } else {
      discountAmount = Number(coupon.discount_value);
    }

    // Discount cannot exceed cart total.
    discountAmount = Math.min(discountAmount, cartTotal);

    // Round to two decimal places.
    discountAmount = Number(discountAmount.toFixed(2));

    const finalTotal = Number(
      Math.max(0, cartTotal - discountAmount).toFixed(2)
    );

    // Create order.
    const orderResult = await client.query(
      `INSERT INTO orders
       (cart_total, coupon_code, discount_amount, final_total, user_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [
        cartTotal,
        code.trim(),
        discountAmount,
        finalTotal,
        userId
      ]
    );

    const orderId = orderResult.rows[0].id;

    // Record coupon on the order.
    await client.query(
      `INSERT INTO order_coupons
       (order_id, code, discount_amount)
       VALUES ($1, $2, $3)`,
      [orderId, code.trim(), discountAmount]
    );

    // Increase coupon usage count.
    await client.query(
      `UPDATE coupons
       SET times_used = times_used + 1
       WHERE code = $1`,
      [code.trim()]
    );

    await client.query('COMMIT');

    return {
      orderId,
      discountAmount,
      finalTotal
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}