const mysql = require('mysql');

const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'xiaoli2213xX!',
    database: 'rental_system'
});

db.connect((err) => {
    if (err) {
        console.error('连接失败:', err);
        return;
    }
    
    console.log('已连接到数据库');
    
    // 查询配件库存统计总数 (accessories表)
    db.query('SELECT SUM(stock_quantity) AS total FROM accessories WHERE status = "active"', (err, result) => {
        if (err) {
            console.error('查询配件库存总数失败:', err);
            return;
        }
        console.log('配件库存统计总数 (accessories表):', result[0]?.total || 0);
        
        // 查询批次库存总数 (accessory_batch_stock表)
        db.query('SELECT SUM(available_quantity) AS total FROM accessory_batch_stock', (err, result2) => {
            if (err) {
                console.error('查询批次库存总数失败:', err);
                return;
            }
            console.log('批次库存总数 (accessory_batch_stock表):', result2[0]?.total || 0);
            
            // 查询批次采购总数 (accessory_batch_stock表)
            db.query('SELECT SUM(quantity) AS total FROM accessory_batch_stock', (err, result3) => {
                if (err) {
                    console.error('查询批次采购总数失败:', err);
                    return;
                }
                console.log('批次采购总数 (accessory_batch_stock表):', result3[0]?.total || 0);
                
                // 查询批次出库总数 (accessory_batch_stock表)
                db.query('SELECT SUM(quantity - available_quantity) AS total FROM accessory_batch_stock', (err, result4) => {
                    if (err) {
                        console.error('查询批次出库总数失败:', err);
                        return;
                    }
                    console.log('批次出库总数 (accessory_batch_stock表):', result4[0]?.total || 0);
                    
                    db.end();
                });
            });
        });
    });
});