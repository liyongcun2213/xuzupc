const mysql = require('mysql');

const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'xiaoli2213xX!',
    database: 'rental_system'
});

db.connect();

console.log('=== 测试查询批次可用库存 ===\n');

// 测试配件15（微星迫击炮）
const accessoryId = 15;

db.query(`
    SELECT SUM(available_quantity) as total_available
    FROM accessory_batch_stock
    WHERE accessory_id = ? AND status = 'in_stock'
`, [accessoryId], (err, result) => {
    if (err) {
        console.error('查询失败:', err);
    } else {
        console.log(`配件${accessoryId}的查询结果:`, result);
        console.log('total_available:', result[0].total_available);
    }
    
    // 查看该配件的所有批次状态
    db.query(`
        SELECT id, accessory_id, batch_id, quantity, used_quantity, available_quantity, status
        FROM accessory_batch_stock
        WHERE accessory_id = ?
    `, [accessoryId], (err, batches) => {
        if (err) {
            console.error('查询批次失败:', err);
        } else {
            console.log('\n所有批次详情:');
            console.table(batches);
        }
        
        db.end();
    });
});
