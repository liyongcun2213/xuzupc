const mysql = require('mysql');

const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'xiaoli2213xX!',
    database: 'rental_system'
});

db.connect();

// 查询JJ01需要的配件及其库存
db.query(`
    SELECT 
        dt.accessory_name as category,
        dt.brand,
        dt.model,
        dt.quantity as required_qty,
        a.id as accessory_id,
        a.name as accessory_name,
        a.stock_quantity
    FROM device_templates dt
    LEFT JOIN accessories a ON 
        a.category_id = dt.accessory_category_id AND
        a.brand = dt.brand AND
        a.model = dt.model
    WHERE dt.product_code = 'JJ01'
    ORDER BY dt.id
`, (err, results) => {
    if (err) {
        console.error(err);
        db.end();
        return;
    }
    
    console.log('JJ01产品需要的配件及库存情况:');
    console.table(results);
    
    let hasInsufficientStock = false;
    results.forEach(item => {
        if (!item.accessory_id) {
            console.log(`⚠️  找不到配件: ${item.category} - ${item.brand} ${item.model}`);
            hasInsufficientStock = true;
        } else if (item.stock_quantity < item.required_qty) {
            console.log(`⚠️  库存不足: ${item.accessory_name} (需要${item.required_qty}，库存${item.stock_quantity})`);
            hasInsufficientStock = true;
        }
    });
    
    if (!hasInsufficientStock) {
        console.log('\n✅ 所有配件库存充足，可以组装！');
    } else {
        console.log('\n❌ 有配件缺货或找不到，无法组装');
    }
    
    db.end();
});
