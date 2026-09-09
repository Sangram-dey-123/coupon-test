import pool from '../db.js';

/**
 * Cancel an order and release the coupon usage.
 */
export async function cancelOrder(orderId) {
  if (!orderId || !orderId.trim()) {
    throw new Error('Order ID is required');
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Lock the order so it cannot be cancelled twice concurrently.
    const orderResult = await client.query(
      `SELECT *
       FROM orders
       WHERE id = $1
       FOR UPDATE`,
      [orderId.trim()]
    );

    if (orderResult.rows.length === 0) {
      throw new Error(`Order '${orderId}' does not exist`);
    }

    const order = orderResult.rows[0];

    if (order.status === 'cancelled') {
      throw new Error(`Order '${orderId}' is already cancelled`);
    }

    // If a coupon was applied, release one usage.
    if (order.coupon_code) {
      await client.query(
        `UPDATE coupons
         SET times_used = GREATEST(times_used - 1, 0)
         WHERE code = $1`,
        [order.coupon_code]
      );
    }

    // Mark the order as cancelled.
    await client.query(
      `UPDATE orders
       SET status = 'cancelled'
       WHERE id = $1`,
      [orderId.trim()]
    );

    await client.query('COMMIT');

    return `Order '${orderId}' cancelled successfully`;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}