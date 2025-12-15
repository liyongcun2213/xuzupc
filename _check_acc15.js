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

    console.log('检查配件 15 的信息...\n');

    // 查询配件基本信息
    connection.query('SELECT * FROM accessories WHERE id = 15', (err, accessories) => {
        if (err) {
            console.error('查询配件失败:', err);
            connection.end();
            return;
        }
        console.log('配件信息:');
        console.log(JSON.stringify(accessories, null, 2));

        // 查询批次信息
        connection.query(
            'SELECT * FROM accessory_batch_stock WHERE accessory_id = 15 ORDER BY id',
            (err, batches) => {
                if (err) {
                    console.error('查询批次失败:', err);
                    connection.end();
                    return;
                }
                console.log('\n批次库存信息:');
                console.log(JSON.stringify(batches, null, 2));

                // 查询可用库存
                connection.query(`
                    SELECT SUM(available_quantity) as total_available
                    FROM accessory_batch_stock
                    WHERE accessory_id = 15 AND status IN ('in_stock', 'in_use')
                `, (err, available) => {
                    if (err) {
                        console.error('查询可用库存失败:', err);
                        connection.end();
                        return;
                    }
                    console.log('\n可用库存查询结果（status IN in_stock, in_use）:');
                    console.log(JSON.stringify(available, null, 2));

                    // 查询所有状态的库存
                    connection.query(`
                        SELECT status, SUM(available_quantity) as available, SUM(used_quantity) as used
                        FROM accessory_batch_stock
                        WHERE accessory_id = 15
                        GROUP BY status
                    `, (err, allStatus) => {
                        if (err) {
                            console.error('查询状态分组失败:', err);
                        } else {
                            console.log('\n按状态分组的库存:');
                            console.log(JSON.stringify(allStatus, null, 2));
                        }
                        connection.end();
                    });
                });
            }
        );
    });
});
