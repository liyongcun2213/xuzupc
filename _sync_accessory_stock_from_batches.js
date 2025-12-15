const mysql = require('mysql');

const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'xiaoli2213xX!',
    database: 'rental_system'
});

function exitWithError(message, err) {
    console.error(message, err || '');
    db.end(() => process.exit(1));
}

db.connect((err) => {
    if (err) {
        return exitWithError('数据库连接失败:', err);
    }

    console.log('已连接到 rental_system');
    console.log('开始同步 accessories.stock_quantity 与 accessory_batch_stock.available_quantity ...\n');

    const selectSql = `
        SELECT 
            a.id AS accessory_id,
            a.name,
            a.brand,
            a.model,
            a.stock_quantity AS old_stock_quantity,
            COALESCE(SUM(abs.available_quantity), 0) AS batch_available_quantity,
            COUNT(abs.id) AS batch_count
        FROM accessories a
        JOIN accessory_batch_stock abs ON abs.accessory_id = a.id
        GROUP BY a.id, a.name, a.brand, a.model, a.stock_quantity
        ORDER BY a.id
    `;

    db.query(selectSql, (selectErr, rows) => {
        if (selectErr) {
            return exitWithError('查询批次库存汇总失败:', selectErr);
        }

        if (!rows || rows.length === 0) {
            console.log('没有任何配件存在批次库存记录，无需同步。');
            return db.end();
        }

        console.log(`共找到 ${rows.length} 个存在批次库存记录的配件。\n`);

        let processed = 0;
        let updatedCount = 0;

        function doneOne() {
            processed += 1;
            if (processed === rows.length) {
                console.log(`\n同步完成！共更新 ${updatedCount} 个配件的 stock_quantity。`);
                db.end();
            }
        }

        rows.forEach((row) => {
            const accessoryId = row.accessory_id;
            const oldQty = row.old_stock_quantity || 0;
            const newQty = row.batch_available_quantity || 0;

            if (oldQty === newQty) {
                console.log(
                    `配件ID ${accessoryId} (${row.name} ${row.brand || ''} ${row.model || ''}) 库存已一致: ${oldQty}，跳过。`
                );
                return doneOne();
            }

            console.log(
                `配件ID ${accessoryId} (${row.name} ${row.brand || ''} ${row.model || ''}) ` +
                    `stock_quantity: ${oldQty} -> ${newQty} (按批次剩余量同步)`
            );

            const updateSql = `
                UPDATE accessories
                SET stock_quantity = ?,
                    status = CASE 
                        WHEN ? > 0 AND status != 'scrapped' THEN 'in_warehouse'
                        ELSE status
                    END,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `;

            db.query(updateSql, [newQty, newQty, accessoryId], (updateErr) => {
                if (updateErr) {
                    console.error(`更新配件 ${accessoryId} 库存失败:`, updateErr.message || updateErr);
                } else {
                    updatedCount += 1;
                }
                doneOne();
            });
        });
    });
});
