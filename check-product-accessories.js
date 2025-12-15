const mysql = require('mysql');

const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'xiaoli2213xX!',
    database: 'rental_system'
});

db.connect();

// 查询JJ01产品在product_accessories表中的配件
db.query(`
    SELECT 
        pa.product_id,
        pa.accessory_id,
        a.name as accessory_name,
        a.brand,
        a.model,
        ac.name as category_name
    FROM product_accessories pa
    JOIN accessories a ON pa.accessory_id = a.id
    JOIN accessory_categories ac ON a.category_id = ac.id
    WHERE pa.product_id = 2
    ORDER BY ac.id
`, (err, results) => {
    if (err) {
        console.error(err);
        db.end();
        return;
    }
    
    console.log('JJ01产品在product_accessories表中的配件清单:');
    console.table(results);
    
    if (results.length === 0) {
        console.log('\n警告：JJ01产品在product_accessories表中也没有配件！');
    }
    
    db.end();
});
