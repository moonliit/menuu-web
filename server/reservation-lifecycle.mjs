const invalid = (message, status = 409) =>
  Object.assign(new Error(message), { status });

export async function releaseOrderCapacity(db, orderId, kitchenId) {
  const items = await db.query(
    'SELECT offer_id AS "offerId",SUM(quantity) AS units FROM order_items WHERE order_id=$1 GROUP BY offer_id',
    [orderId],
  );

  for (const item of items.rows) {
    const released = await db.query(
      "UPDATE offers SET reserved_count=reserved_count-$2,sold_out_at=NULL WHERE id=$1 AND kitchen_id=$3 AND reserved_count>=$2 RETURNING id",
      [item.offerId, item.units, kitchenId],
    );

    if (!released.rowCount)
      throw invalid("No se pudo actualizar el cupo de este menú.");
  }
}
