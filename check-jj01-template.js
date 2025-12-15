const mysql = require('mysql');

const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'xiaoli2213xX!',
    database: 'rental_system'
});

db.connect();

// 查询JJ01产品信息
db.query('SELECT id, code, name FROM products WHERE code = "JJ01"', (err, results) => {
    if (err) {
        console.error(err);
        db.end();
        return;
    }
    
    console.log('产品信息:');
    console.table(results);
    
    if (results.length === 0) {
        console.log('未找到JJ01产品');
        db.end();
        return;
    }
    
    const productCode = results[0].code;
    
    // 查询device_templates中的配件模板
    db.query('SELECT * FROM device_templates WHERE product_code = ?', [productCode], (err2, templates) => {
        if (err2) {
            console.error(err2);
            db.end();
            return;
        }
        
        console.log('\ndevice_templates中JJ01的配件模板:');
        console.table(templates);
        
        if (templates.length === 0) {
            console.log('\n警告：JJ01产品在device_templates表中没有配件模板！');
        }
        
        // 查询PC0007实际使用的配件
        db.query(`
            SELECT da.*, a.category_id 
            FROM device_assemblies da
            JOIN accessories a ON da.accessory_id = a.id
            WHERE da.device_id = 9
            ORDER BY a.category_id
        `, (err3, assemblies) => {
            if (err3) {
                console.error(err3);
            } else {
                console.log('\nPC0007实际使用的配件:');
                console.table(assemblies);
            }
            db.end();
        });
    });
});
