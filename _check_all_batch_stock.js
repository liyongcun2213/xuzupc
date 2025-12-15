const mysql = require('mysql');

const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'xiaoli2213xX!',
    database: 'rental_system'
});

db.connect(err => {
    if (err) {
        console.error('连接失败:', err);
        process.exit(1);
    }
    
    console.log('=== 检查所有配件的库存情况 ===\n');
    
    // 查询所有配件及其批次库存
    db.query(`
        SELECT 
            a.id,
            a.name,
            a.brand,
            a.model,
            a.stock_quantity as accessories_stock,
            COALESCE(SUM(abs.quantity), 0) as batch_total_quantity,
            COALESCE(SUM(abs.used_quantity), 0) as batch_used_quantity,
            COALESCE(SUM(abs.available_quantity), 0) as batch_available_quantity,
            COUNT(abs.id) as batch_count
        FROM accessories a
        LEFT JOIN accessory_batch_stock abs ON abs.accessory_id = a.id
        WHERE a.id IN (14, 15, 16, 17, 18, 19, 20, 21, 24)
        GROUP BY a.id
        ORDER BY a.id
    `, (err, results) => {
        if (err) {
            console.error('查询失败:', err);
            db.end();
            return;
        }
        
        console.log('配件库存对比:\n');
        console.table(results);
        
        console.log('\n=== 查看批次库存详情 ===\n');
        
        db.query(`
            SELECT 
                abs.id,
                abs.accessory_id,
                a.name,
                abs.batch_id,
                abs.quantity,
                abs.used_quantity,
                abs.available_quantity,
                abs.status,
                abs.purchase_date
            FROM accessory_batch_stock abs
            JOIN accessories a ON a.id = abs.accessory_id
            WHERE abs.accessory_id IN (14, 15, 16, 17, 18, 19, 20, 21, 24)
            ORDER BY abs.accessory_id, abs.batch_id
        `, (err, batches) => {
            if (err) {
                console.error('查询批次失败:', err);
                db.end();
                return;
            }
            
            console.log('批次库存详情:\n');
            console.table(batches);
            
            db.end();
        });
    });
});
