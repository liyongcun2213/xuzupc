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

    console.log('检查组装后的库存情况...\n');

    // 查询几个关键配件的库存
    const accessoryIds = [15, 16, 17, 18, 19, 20]; // 主板、内存、硬盘、显卡、机箱、电源的ID

    accessoryIds.forEach((id, index) => {
        // 查询配件表
        connection.query('SELECT id, name, stock_quantity FROM accessories WHERE id = ?', [id], (err, acc) => {
            if (err || acc.length === 0) {
                console.log(`配件 ${id}: 未找到`);
                return;
            }

            console.log(`\n=== 配件 ${id}: ${acc[0].name} ===`);
            console.log(`accessories表的stock_quantity: ${acc[0].stock_quantity}`);

            // 查询批次库存
            connection.query(
                `SELECT 
                    SUM(quantity) as total_quantity,
                    SUM(used_quantity) as total_used,
                    SUM(available_quantity) as total_available
                FROM accessory_batch_stock 
                WHERE accessory_id = ?`,
                [id],
                (err, batch) => {
                    if (err) {
                        console.error('查询批次失败:', err);
                        return;
                    }

                    if (batch && batch[0]) {
                        console.log(`批次库存统计:`);
                        console.log(`  总数量: ${batch[0].total_quantity || 0}`);
                        console.log(`  已使用: ${batch[0].total_used || 0}`);
                        console.log(`  可用量: ${batch[0].total_available || 0}`);
                    }

                    if (index === accessoryIds.length - 1) {
                        // 最后一个查询完成后，查询组装记录
                        console.log('\n\n=== 设备组装记录 ===');
                        connection.query(
                            `SELECT COUNT(*) as device_count FROM devices WHERE product_id = (SELECT id FROM products WHERE product_code = 'PC0001')`,
                            (err, devices) => {
                                if (!err && devices[0]) {
                                    console.log(`已组装的PC0001设备数量: ${devices[0].device_count}`);
                                }

                                connection.query(
                                    `SELECT 
                                        a.accessory_id,
                                        acc.name,
                                        SUM(a.quantity) as total_assembled
                                    FROM device_assemblies a
                                    JOIN accessories acc ON a.accessory_id = acc.id
                                    GROUP BY a.accessory_id, acc.name
                                    ORDER BY a.accessory_id`,
                                    (err, assemblies) => {
                                        if (!err && assemblies.length > 0) {
                                            console.log('\n各配件的组装使用量:');
                                            assemblies.forEach(a => {
                                                console.log(`  配件${a.accessory_id} (${a.name}): 已使用 ${a.total_assembled} 个`);
                                            });
                                        }
                                        connection.end();
                                    }
                                );
                            }
                        );
                    }
                }
            );
        });
    });
});
