const mysql = require('mysql');

const connection = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'xiaoli2213xX!',
    database: 'rental_system'
});

connection.connect((err) => {
    if (err) {
        console.error('连接失败:', err);
        process.exit(1);
    }

    console.log('修正已组装设备的库存...\n');

    // 查询每个配件已经使用的总量
    connection.query(`
        SELECT 
            accessory_id,
            SUM(quantity) as total_used
        FROM device_assemblies
        GROUP BY accessory_id
    `, (err, usageData) => {
        if (err) {
            console.error('查询失败:', err);
            connection.end();
            return;
        }

        console.log('各配件的实际使用量：');
        usageData.forEach(item => {
            console.log(`  配件 ${item.accessory_id}: 已使用 ${item.total_used} 个`);
        });

        console.log('\n开始更新 accessories 表...\n');

        let completed = 0;
        usageData.forEach(item => {
            // 先查询当前库存
            connection.query(
                'SELECT id, name, stock_quantity FROM accessories WHERE id = ?',
                [item.accessory_id],
                (err, acc) => {
                    if (err || acc.length === 0) {
                        console.log(`配件 ${item.accessory_id}: 查询失败或不存在`);
                        completed++;
                        return;
                    }

                    const currentStock = acc[0].stock_quantity;
                    const newStock = currentStock - item.total_used;

                    console.log(`配件 ${item.accessory_id} (${acc[0].name}):`);
                    console.log(`  当前显示库存: ${currentStock}`);
                    console.log(`  实际已使用: ${item.total_used}`);
                    console.log(`  应该显示: ${newStock}`);

                    // 更新库存
                    connection.query(
                        'UPDATE accessories SET stock_quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                        [newStock, item.accessory_id],
                        (err) => {
                            if (err) {
                                console.log(`  ✗ 更新失败: ${err.message}`);
                            } else {
                                console.log(`  ✓ 已更新`);
                            }

                            completed++;
                            if (completed === usageData.length) {
                                console.log('\n✓ 所有配件库存已修正！');
                                connection.end();
                            }
                        }
                    );
                }
            );
        });
    });
});
